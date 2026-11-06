using System.Text.Json;
using Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Models;
using Repositories;

namespace Services;

public sealed record NpcLoggedEvent(string Type, object Payload);

public sealed record NpcTurnResult(IReadOnlyList<NpcLoggedEvent> Events);

// ---- Simple NPC heuristics (no LLM yet) ----
public interface INpcDecisionPolicy {
    /// <summary>One visible NPC action (advance, reinforce, start/roll/retreat/skip).</summary>
    NpcTurnResult PlayStep(GameState game, Guid npcFactionId, TurnService turnService, CombatService combatService);

    /// <summary>Runs PlayStep until the NPC no longer owns the turn (tests / catch-up).</summary>
    NpcTurnResult PlayTurn(GameState game, Guid npcFactionId, TurnService turnService, CombatService combatService);
}

public class SimpleNpcDecisionPolicy : INpcDecisionPolicy {

    private const int MaxPhaseSteps = 40;

    public NpcTurnResult PlayTurn(GameState game, Guid npcFactionId, TurnService turnService, CombatService combatService) {

        List<NpcLoggedEvent> events = [];
        int steps = 0;

        while (
            game.Status == GameStatus.InProgress
            && game.CurrentFactionId == npcFactionId
            && steps++ < MaxPhaseSteps) {

            NpcTurnResult step = PlayStep(game, npcFactionId, turnService, combatService);
            if (step.Events.Count == 0) {
                break;
            }

            events.AddRange(step.Events);
        }

        return new NpcTurnResult(events);
    }

    public NpcTurnResult PlayStep(
        GameState game,
        Guid npcFactionId,
        TurnService turnService,
        CombatService combatService) {

        List<NpcLoggedEvent> events = [];

        if (game.CurrentFactionId != npcFactionId || game.Status != GameStatus.InProgress) {
            return new NpcTurnResult(events);
        }

        Faction npc = game.Factions.Single(f => f.Id == npcFactionId);

        if (npc.Type != FactionType.NPC || npc.IsDefeated) {
            return new NpcTurnResult(events);
        }

        string npcName = string.IsNullOrWhiteSpace(npc.Name) ? "NPC" : npc.Name;

        try {
            switch (game.CurrentPhase) {

                case TurnPhase.Upkeep:
                    turnService.AdvancePhase(game, npcFactionId);
                    LogAdvance(events, game, npcFactionId, npcName);
                    break;

                case TurnPhase.ReinforcementOne:
                case TurnPhase.ReinforcementTwo:
                    if (game.ReinforcementPool > 0) {
                        SpendReinforcementPool(game, npcFactionId, npcName, turnService, events);
                    }
                    else {
                        turnService.AdvancePhase(game, npcFactionId);
                        LogAdvance(events, game, npcFactionId, npcName);
                    }
                    break;

                case TurnPhase.Combat:
                    if (game.ActiveCombat != null) {
                        // Pause for the human defender — they roll dice from the client.
                        if (IsHumanFaction(game, game.ActiveCombat.DefenderFactionId)) {
                            break;
                        }

                        ResolveOneCombatStep(game, npcFactionId, npcName, combatService, events);
                        // Engagement finished this step — leave Combat so we do not start a second fight.
                        if (
                            game.ActiveCombat == null
                            && game.Status == GameStatus.InProgress
                            && game.CurrentFactionId == npcFactionId
                            && game.CurrentPhase == TurnPhase.Combat) {
                            combatService.SkipCombat(game, npcFactionId);
                            events.Add(new NpcLoggedEvent("SkipCombat", new {
                                factionId = npcFactionId,
                                factionName = npcName,
                                phase = game.CurrentPhase.ToString(),
                                actor = "NPC",
                                reason = "engagementComplete",
                            }));
                        }
                    }
                    else if (
                        game.ConqueredThisTurn.Count > 0
                        || (game.LastResolvedCombat != null
                            && game.LastResolvedCombat.AttackerFactionId == npcFactionId)) {
                        // Already fought (including a paused assault the human just finished).
                        combatService.SkipCombat(game, npcFactionId);
                        events.Add(new NpcLoggedEvent("SkipCombat", new {
                            factionId = npcFactionId,
                            factionName = npcName,
                            phase = game.CurrentPhase.ToString(),
                            actor = "NPC",
                            reason = "alreadyConqueredOrEngaged",
                        }));
                    }
                    else {
                        TryCombatOrSkip(game, npcFactionId, npcName, combatService, events);
                    }
                    break;

                case TurnPhase.EndTurn:
                    turnService.AdvancePhase(game, npcFactionId);
                    LogAdvance(events, game, npcFactionId, npcName);
                    break;

                default:
                    break;
            }
        }
        catch (InvalidOperationException) {
            if (
                game.Status == GameStatus.InProgress
                && game.CurrentFactionId == npcFactionId
                && game.CurrentPhase == TurnPhase.Combat
                && game.ActiveCombat == null) {
                try {
                    combatService.SkipCombat(game, npcFactionId);
                    events.Add(new NpcLoggedEvent("SkipCombat", new {
                        factionId = npcFactionId,
                        factionName = npcName,
                        phase = game.CurrentPhase.ToString(),
                        actor = "NPC",
                        reason = "recovery",
                    }));
                }
                catch (InvalidOperationException) {
                    return new NpcTurnResult(events);
                }
            }
        }

        return new NpcTurnResult(events);
    }

    private static void LogAdvance(
        List<NpcLoggedEvent> events,
        GameState game,
        Guid factionId,
        string factionName) {

        events.Add(new NpcLoggedEvent("AdvancePhase", new {
            factionId,
            factionName,
            phase = game.CurrentPhase.ToString(),
            reinforcementPool = game.ReinforcementPool,
            actor = "NPC",
        }));
    }

    private static void SpendReinforcementPool(
        GameState game,
        Guid factionId,
        string factionName,
        TurnService turnService,
        List<NpcLoggedEvent> events) {

        // Stack onto the strongest owned land so later combat can commit a real force.
        while (game.ReinforcementPool > 0) {

            Territory? target = game.Territories
                .Where(t => t.OwnerFactionId == factionId)
                .OrderByDescending(t => t.Soldiers)
                .ThenBy(t => t.CountryId, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();

            if (target == null) {
                break;
            }

            int amount = game.ReinforcementPool;
            turnService.AllocateReinforcements(game, factionId, target.CountryId, amount);
            events.Add(new NpcLoggedEvent("AllocateReinforcements", new {
                factionId,
                factionName,
                countryId = target.CountryId,
                countryName = TerritoryName(game, target.CountryId),
                soldierCount = amount,
                soldiersOnCountry = target.Soldiers,
                poolRemaining = game.ReinforcementPool,
                actor = "NPC",
            }));
        }
    }

    private static void TryCombatOrSkip(
        GameState game,
        Guid factionId,
        string factionName,
        CombatService combatService,
        List<NpcLoggedEvent> events) {

        // Prefer the weakest enemy we can outnumber with a full leave-one-behind commit.
        Territory? source = null;
        Territory? target = null;
        int commit = 0;

        foreach (Territory candidateSource in game.Territories
            .Where(t => t.OwnerFactionId == factionId && t.Soldiers > 1)
            .OrderByDescending(t => t.Soldiers)) {

            int available = candidateSource.Soldiers - 1;
            Territory? candidateTarget = game.Territories
                .Where(t =>
                    t.OwnerFactionId != factionId &&
                    !IsDefeatedOwner(game, t.OwnerFactionId) &&
                    available > t.Soldiers)
                .OrderBy(t => t.Soldiers)
                .ThenByDescending(t => available - t.Soldiers)
                .FirstOrDefault();

            if (candidateTarget == null) {
                continue;
            }

            source = candidateSource;
            target = candidateTarget;
            commit = available;
            break;
        }

        if (source == null || target == null || commit <= 0) {
            combatService.SkipCombat(game, factionId);
            events.Add(new NpcLoggedEvent("SkipCombat", new {
                factionId,
                factionName,
                phase = game.CurrentPhase.ToString(),
                actor = "NPC",
                reason = "tooWeak",
            }));
            return;
        }

        try {
            combatService.StartCombat(game, factionId, source.CountryId, target.CountryId, commit);
            CombatState? combat = game.ActiveCombat;
            events.Add(new NpcLoggedEvent("StartCombat", new {
                factionId,
                factionName,
                sourceCountryId = source.CountryId,
                sourceName = TerritoryName(game, source.CountryId),
                destinationCountryId = target.CountryId,
                destinationName = TerritoryName(game, target.CountryId),
                attackerSoldiers = combat?.AttackerSoldiers ?? commit,
                defenderSoldiers = combat?.DefenderSoldiers ?? target.Soldiers,
                actor = "NPC",
            }));
        }
        catch (InvalidOperationException) {
            combatService.SkipCombat(game, factionId);
            events.Add(new NpcLoggedEvent("SkipCombat", new {
                factionId,
                factionName,
                phase = game.CurrentPhase.ToString(),
                actor = "NPC",
                reason = "startFailed",
            }));
        }
    }

    private static void ResolveOneCombatStep(
        GameState game,
        Guid factionId,
        string factionName,
        CombatService combatService,
        List<NpcLoggedEvent> events) {

        CombatState combat = game.ActiveCombat
            ?? throw new InvalidOperationException("No active combat");

        string sourceName = TerritoryName(game, combat.SourceCountryId);
        string destinationName = TerritoryName(game, combat.DestinationCountryId);

        if (combat.AttackerSoldiers <= combat.DefenderSoldiers) {
            int retreated = combat.AttackerSoldiers;
            combatService.Retreat(game, factionId);
            events.Add(new NpcLoggedEvent("RetreatCombat", new {
                factionId,
                factionName,
                sourceCountryId = combat.SourceCountryId,
                sourceName,
                destinationCountryId = combat.DestinationCountryId,
                destinationName,
                soldiersRetreated = retreated,
                actor = "NPC",
            }));
            return;
        }

        CombatState snap = combatService.ResolveNextRound(game, factionId);
        bool finished = game.ActiveCombat == null;
        object payload = new {
            factionId,
            factionName,
            sourceCountryId = snap.SourceCountryId,
            sourceName,
            destinationCountryId = snap.DestinationCountryId,
            destinationName,
            round = snap.RoundNumber,
            attackerDice = snap.LastAttackerDice.ToArray(),
            defenderDice = snap.LastDefenderDice.ToArray(),
            attackerLosses = snap.LastAttackerLosses,
            defenderLosses = snap.LastDefenderLosses,
            attackerSoldiersRemaining = snap.AttackerSoldiers,
            defenderSoldiersRemaining = snap.DefenderSoldiers,
            battleFinished = finished,
            actor = "NPC",
        };
        events.Add(new NpcLoggedEvent("ResolveCombatRound", payload));
        events.Add(new NpcLoggedEvent("NpcCombatRound", payload));
    }

    private static string TerritoryName(GameState game, string countryId) {
        Territory? t = game.Territories.FirstOrDefault(x =>
            string.Equals(x.CountryId, countryId, StringComparison.OrdinalIgnoreCase));
        return string.IsNullOrWhiteSpace(t?.Name) ? countryId : t!.Name;
    }

    private static bool IsDefeatedOwner(GameState game, Guid ownerId) {

        Faction? owner = game.Factions.FirstOrDefault(f => f.Id == ownerId);
        return owner == null || owner.IsDefeated;
    }

    private static bool IsHumanFaction(GameState game, Guid factionId) {

        Faction? faction = game.Factions.FirstOrDefault(f => f.Id == factionId);
        return faction is { Type: FactionType.Human, IsDefeated: false };
    }
}

// ---- Background loop: one NPC step at a time, delay outside the game lock ----
public class NpcTurnHostedService : BackgroundService {

    private static readonly JsonSerializerOptions PayloadJsonOptions = new() {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IGameRepository _gameRepository;
    private readonly GameConcurrencyGate _concurrencyGate;
    private readonly IGameStateNotifier _gameStateNotifier;
    private readonly IGameEventRepository _gameEventRepository;
    private readonly IConfiguration _configuration;
    private readonly ILogger<NpcTurnHostedService> _logger;
    private readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, long> _cooldownUntilMs = new();

    public NpcTurnHostedService(
        IServiceScopeFactory scopeFactory,
        IGameRepository gameRepository,
        GameConcurrencyGate concurrencyGate,
        IGameStateNotifier gameStateNotifier,
        IGameEventRepository gameEventRepository,
        IConfiguration configuration,
        ILogger<NpcTurnHostedService> logger) {
        _scopeFactory = scopeFactory;
        _gameRepository = gameRepository;
        _concurrencyGate = concurrencyGate;
        _gameStateNotifier = gameStateNotifier;
        _gameEventRepository = gameEventRepository;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken) {

        while (!stoppingToken.IsCancellationRequested) {
            long nowMs = Environment.TickCount64;

            await foreach (GameState snapshot in _gameRepository.GetAllAsync(stoppingToken)) {

                if (snapshot.Status != GameStatus.InProgress || snapshot.CurrentFactionId == null) {
                    continue;
                }

                Faction? current = snapshot.Factions.FirstOrDefault(f => f.Id == snapshot.CurrentFactionId);

                if (current == null || current.Type != FactionType.NPC || current.IsDefeated) {
                    continue;
                }

                // Human is defending — leave ActiveCombat alone until they roll.
                if (
                    snapshot.ActiveCombat != null
                    && snapshot.Factions.Any(f =>
                        f.Id == snapshot.ActiveCombat.DefenderFactionId
                        && f.Type == FactionType.Human
                        && !f.IsDefeated)) {
                    continue;
                }

                if (_cooldownUntilMs.TryGetValue(snapshot.Id, out long until) && until > nowMs) {
                    continue;
                }

                SemaphoreSlim gate = _concurrencyGate.Get(snapshot.Id);

                if (!await gate.WaitAsync(0, stoppingToken)) {
                    continue;
                }

                bool stepped = false;
                int cooldownMs = 0;

                try {
                    (stepped, cooldownMs) = await RunNpcStep(snapshot.Id, current.Id, stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException) {
                    _logger.LogWarning(ex, "NPC step failed for game {GameId}", snapshot.Id);
                }
                finally {
                    gate.Release();
                }

                // Pace presentation without holding the concurrency gate (player actions stay snappy).
                if (stepped && cooldownMs > 0) {
                    _cooldownUntilMs[snapshot.Id] = Environment.TickCount64 + cooldownMs;
                }
            }

            await Task.Delay(TimeSpan.FromMilliseconds(200), stoppingToken);
        }
    }

    private async Task<(bool Stepped, int CooldownMs)> RunNpcStep(
        Guid gameId,
        Guid npcFactionId,
        CancellationToken stoppingToken) {

        GameState? game = await _gameRepository.GetAsync(gameId, stoppingToken);

        if (game == null || game.CurrentFactionId != npcFactionId) {
            return (false, 0);
        }

        int baseDelayMs = _configuration.GetValue("Npc:BaseDelayMs", 2200);
        int speed = Math.Clamp(game.NpcSpeed, 1, 8);
        int cooldownMs = Math.Max(80, (int)(Math.Max(100, baseDelayMs) / (double)speed));

        using IServiceScope scope = _scopeFactory.CreateScope();

        INpcDecisionPolicy policy = scope.ServiceProvider.GetRequiredService<INpcDecisionPolicy>();
        TurnService turnService = scope.ServiceProvider.GetRequiredService<TurnService>();
        CombatService combatService = scope.ServiceProvider.GetRequiredService<CombatService>();

        long versionAtStart = game.Version;
        string npcName = game.Factions.FirstOrDefault(f => f.Id == npcFactionId)?.Name ?? "NPC";

        NpcTurnResult stepResult = policy.PlayStep(game, npcFactionId, turnService, combatService);

        if (game.Version <= versionAtStart && stepResult.Events.Count == 0) {
            return (false, 0);
        }

        if (game.Version > versionAtStart) {
            bool saved = await _gameRepository.TryReplaceAsync(game, versionAtStart, stoppingToken);

            if (!saved) {
                _logger.LogWarning(
                    "NPC step save lost for game {GameId} (expected version {Version})",
                    gameId,
                    versionAtStart);
                return (false, 0);
            }

            if (stepResult.Events.Count == 0) {
                await AppendNpcEventBestEffort(gameId, "NpcTurn", new {
                    factionId = npcFactionId,
                    factionName = npcName,
                    version = game.Version,
                    phase = game.CurrentPhase.ToString(),
                    actor = "NPC",
                }, stoppingToken);
            }
            else {
                foreach (NpcLoggedEvent logged in stepResult.Events) {
                    await AppendNpcEventBestEffort(gameId, logged.Type, logged.Payload, stoppingToken);
                }
            }

            try {
                await _gameStateNotifier.NotifyGameStateUpdatedAsync(gameId, game, stoppingToken);
            }
            catch {
                /* best-effort */
            }

            QueueNpcCommentary(gameId, stepResult.Events);
            return (true, cooldownMs);
        }

        return (stepResult.Events.Count > 0, cooldownMs);
    }

    private async Task AppendNpcEventBestEffort(
        Guid gameId,
        string type,
        object payload,
        CancellationToken cancellationToken) {
        try {
            await _gameEventRepository.AppendAsync(new GameEvent {
                GameId = gameId,
                EventId = Guid.NewGuid().ToString("N"),
                Type = type,
                OccurredAtUtc = DateTime.UtcNow,
                PayloadJson = JsonSerializer.Serialize(payload, PayloadJsonOptions),
            }, cancellationToken);
        }
        catch (Exception ex) {
            _logger.LogWarning(ex, "Failed to append NPC event {Type} for game {GameId}", type, gameId);
        }
    }

    private void QueueNpcCommentary(Guid gameId, IReadOnlyList<NpcLoggedEvent> events) {
        NpcLoggedEvent? lastRound = events.LastOrDefault(e =>
            e.Type is "ResolveCombatRound" or "NpcCombatRound");
        if (lastRound == null) {
            return;
        }

        _ = Task.Run(async () => {
            try {
                await using AsyncServiceScope scope = _scopeFactory.CreateAsyncScope();
                ICombatCommentaryService commentary =
                    scope.ServiceProvider.GetRequiredService<ICombatCommentaryService>();
                IGameEventRepository eventRepo =
                    scope.ServiceProvider.GetRequiredService<IGameEventRepository>();

                using JsonDocument doc = JsonDocument.Parse(
                    JsonSerializer.Serialize(lastRound.Payload, PayloadJsonOptions));
                JsonElement root = doc.RootElement;

                string attackerCountry = root.TryGetProperty("sourceName", out JsonElement sn)
                    ? sn.GetString() ?? "?"
                    : "?";
                string defenderCountry = root.TryGetProperty("destinationName", out JsonElement dn)
                    ? dn.GetString() ?? "?"
                    : "?";
                int round = root.TryGetProperty("round", out JsonElement rn) ? rn.GetInt32() : 1;
                int[] attackerDice = ReadIntArray(root, "attackerDice");
                int[] defenderDice = ReadIntArray(root, "defenderDice");
                int attackerLosses = root.TryGetProperty("attackerLosses", out JsonElement al) ? al.GetInt32() : 0;
                int defenderLosses = root.TryGetProperty("defenderLosses", out JsonElement dl) ? dl.GetInt32() : 0;
                int atkLeft = root.TryGetProperty("attackerSoldiersRemaining", out JsonElement ar) ? ar.GetInt32() : 0;
                int defLeft = root.TryGetProperty("defenderSoldiersRemaining", out JsonElement dr) ? dr.GetInt32() : 0;
                bool finished = root.TryGetProperty("battleFinished", out JsonElement bf) && bf.GetBoolean();

                string? text = await commentary.GenerateAsync(
                    new CombatCommentaryContext {
                        AttackerCountry = attackerCountry,
                        DefenderCountry = defenderCountry,
                        Round = round,
                        AttackerDice = attackerDice,
                        DefenderDice = defenderDice,
                        AttackerCasualties = attackerLosses,
                        DefenderCasualties = defenderLosses,
                        AttackerSoldiersRemaining = atkLeft,
                        DefenderSoldiersRemaining = defLeft,
                        BattleFinished = finished,
                        Outcome = finished ? "NPC engagement resolved." : null,
                    },
                    CancellationToken.None);

                if (string.IsNullOrWhiteSpace(text)) {
                    return;
                }

                await eventRepo.AppendAsync(new GameEvent {
                    GameId = gameId,
                    EventId = Guid.NewGuid().ToString("N"),
                    Type = "CommentaryAvailable",
                    OccurredAtUtc = DateTime.UtcNow,
                    PayloadJson = JsonSerializer.Serialize(new { commentary = text }, PayloadJsonOptions),
                }, CancellationToken.None);
            }
            catch {
                // commentary is best-effort
            }
        });
    }

    private static int[] ReadIntArray(JsonElement root, string name) {
        if (!root.TryGetProperty(name, out JsonElement arr) || arr.ValueKind != JsonValueKind.Array) {
            return [];
        }

        List<int> values = [];
        foreach (JsonElement item in arr.EnumerateArray()) {
            if (item.TryGetInt32(out int n)) {
                values.Add(n);
            }
        }

        return values.ToArray();
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

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
    NpcTurnResult PlayTurn(GameState game, Guid npcFactionId, TurnService turnService, CombatService combatService);
}

public class SimpleNpcDecisionPolicy : INpcDecisionPolicy {

    private const int MaxPhaseSteps = 20;

    public NpcTurnResult PlayTurn(GameState game, Guid npcFactionId, TurnService turnService, CombatService combatService) {

        List<NpcLoggedEvent> events = [];

        if (game.CurrentFactionId != npcFactionId) {
            return new NpcTurnResult(events);
        }

        Faction npc = game.Factions.Single(f => f.Id == npcFactionId);

        if (npc.Type != FactionType.NPC || npc.IsDefeated) {
            return new NpcTurnResult(events);
        }

        string npcName = string.IsNullOrWhiteSpace(npc.Name) ? "NPC" : npc.Name;
        int steps = 0;

        while (
            game.Status == GameStatus.InProgress
            && game.CurrentFactionId == npcFactionId
            && steps++ < MaxPhaseSteps) {

            try {
                switch (game.CurrentPhase) {

                    case TurnPhase.Upkeep:
                        turnService.AdvancePhase(game, npcFactionId);
                        LogAdvance(events, game, npcFactionId, npcName);
                        break;

                    case TurnPhase.ReinforcementOne:
                    case TurnPhase.ReinforcementTwo:
                        SpendReinforcementPool(game, npcFactionId, npcName, turnService, events);
                        turnService.AdvancePhase(game, npcFactionId);
                        LogAdvance(events, game, npcFactionId, npcName);
                        break;

                    case TurnPhase.Combat:
                        TryCombatOrSkip(game, npcFactionId, npcName, combatService, events);

                        if (game.ActiveCombat != null) {
                            ResolveCombatUntilDone(game, npcFactionId, npcName, combatService, events);
                        }

                        // Retreat / fail leave phase on Combat — force advance
                        if (
                            game.Status == GameStatus.InProgress
                            && game.CurrentFactionId == npcFactionId
                            && game.CurrentPhase == TurnPhase.Combat
                            && game.ActiveCombat == null) {
                            combatService.SkipCombat(game, npcFactionId);
                            events.Add(new NpcLoggedEvent("SkipCombat", new {
                                factionId = npcFactionId,
                                factionName = npcName,
                                phase = game.CurrentPhase.ToString(),
                                actor = "NPC",
                            }));
                        }
                        break;

                    case TurnPhase.EndTurn:
                        turnService.AdvancePhase(game, npcFactionId);
                        LogAdvance(events, game, npcFactionId, npcName);
                        break;

                    default:
                        return new NpcTurnResult(events);
                }
            }
            catch (InvalidOperationException) {
                // Bad mid-turn state — abandon this NPC turn rather than spin
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
                else {
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

        if (game.ConqueredThisTurn.Count > 0 || game.ActiveCombat != null) {
            combatService.SkipCombat(game, factionId);
            events.Add(new NpcLoggedEvent("SkipCombat", new {
                factionId,
                factionName,
                phase = game.CurrentPhase.ToString(),
                actor = "NPC",
                reason = "alreadyConqueredOrEngaged",
            }));
            return;
        }

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

    private static void ResolveCombatUntilDone(
        GameState game,
        Guid factionId,
        string factionName,
        CombatService combatService,
        List<NpcLoggedEvent> events) {

        int safety = 64;

        while (game.ActiveCombat != null && safety-- > 0) {

            CombatState combat = game.ActiveCombat;
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
                break;
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
            // Same shape human ResolveCombatRound uses — ActionLog + map VFX.
            events.Add(new NpcLoggedEvent("ResolveCombatRound", payload));
            events.Add(new NpcLoggedEvent("NpcCombatRound", payload));
        }
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
}

// ---- Background loop: advance NPC turns when it is their go ----
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

            await foreach (GameState snapshot in _gameRepository.GetAllAsync(stoppingToken)) {

                if (snapshot.Status != GameStatus.InProgress || snapshot.CurrentFactionId == null) {
                    continue;
                }

                Faction? current = snapshot.Factions.FirstOrDefault(f => f.Id == snapshot.CurrentFactionId);

                if (current == null || current.Type != FactionType.NPC || current.IsDefeated) {
                    continue;
                }

                SemaphoreSlim gate = _concurrencyGate.Get(snapshot.Id);

                if (!await gate.WaitAsync(0, stoppingToken)) {
                    continue;
                }

                try {
                    await RunNpcTurn(snapshot.Id, current.Id, stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException) {
                    _logger.LogWarning(ex, "NPC turn failed for game {GameId}", snapshot.Id);
                }
                finally {
                    gate.Release();
                }
            }

            await Task.Delay(TimeSpan.FromMilliseconds(250), stoppingToken);
        }
    }

    private async Task RunNpcTurn(Guid gameId, Guid npcFactionId, CancellationToken stoppingToken) {

        GameState? game = await _gameRepository.GetAsync(gameId, stoppingToken);

        if (game == null) {
            return;
        }

        int baseDelayMs = _configuration.GetValue("Npc:BaseDelayMs", 1400);
        int speed = Math.Clamp(game.NpcSpeed, 1, 8);
        TimeSpan delay = TimeSpan.FromMilliseconds(Math.Max(100, baseDelayMs) / (double)speed);

        using IServiceScope scope = _scopeFactory.CreateScope();

        INpcDecisionPolicy policy = scope.ServiceProvider.GetRequiredService<INpcDecisionPolicy>();
        TurnService turnService = scope.ServiceProvider.GetRequiredService<TurnService>();
        CombatService combatService = scope.ServiceProvider.GetRequiredService<CombatService>();

        Guid startingFaction = game.CurrentFactionId ?? npcFactionId;
        TurnPhase startingPhase = game.CurrentPhase;
        long versionAtStart = game.Version;
        string npcName = game.Factions.FirstOrDefault(f => f.Id == npcFactionId)?.Name ?? "NPC";

        NpcTurnResult turnResult = policy.PlayTurn(game, npcFactionId, turnService, combatService);

        if (game.Version > versionAtStart) {
            bool saved = await _gameRepository.TryReplaceAsync(game, versionAtStart, stoppingToken);

            if (saved) {
                if (turnResult.Events.Count == 0) {
                    // Fallback so the log never stays silent after a mutating NPC turn.
                    await AppendNpcEventBestEffort(gameId, "NpcTurn", new {
                        factionId = npcFactionId,
                        factionName = npcName,
                        version = game.Version,
                        phase = game.CurrentPhase.ToString(),
                        actor = "NPC",
                    }, stoppingToken);
                }
                else {
                    foreach (NpcLoggedEvent logged in turnResult.Events) {
                        await AppendNpcEventBestEffort(gameId, logged.Type, logged.Payload, stoppingToken);
                    }
                }

                try {
                    await _gameStateNotifier.NotifyGameStateUpdatedAsync(gameId, game, stoppingToken);
                }
                catch {
                    /* best-effort */
                }

                QueueNpcCommentary(gameId, turnResult.Events);
            }
            else {
                _logger.LogWarning(
                    "NPC turn save lost for game {GameId} (expected version {Version})",
                    gameId,
                    versionAtStart);
            }
        }

        if (game.CurrentFactionId != startingFaction || game.CurrentPhase != startingPhase || game.ActiveCombat != null) {
            await Task.Delay(delay, stoppingToken);
        }
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

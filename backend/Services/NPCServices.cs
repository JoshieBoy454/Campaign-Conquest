using System.Text.Json;
using Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Models;
using Repositories;

namespace Services;

public sealed record NpcCombatRoundSnapshot(
    string SourceCountryId,
    string DestinationCountryId,
    int[] AttackerDice,
    int[] DefenderDice,
    int AttackerLosses,
    int DefenderLosses,
    bool BattleFinished);

public sealed record NpcTurnResult(IReadOnlyList<NpcCombatRoundSnapshot> CombatRounds);

// ---- Simple NPC heuristics (no LLM yet) ----
public interface INpcDecisionPolicy {
    NpcTurnResult PlayTurn(GameState game, Guid npcFactionId, TurnService turnService, CombatService combatService);
}

public class SimpleNpcDecisionPolicy : INpcDecisionPolicy {

    private const int MaxPhaseSteps = 20;

    public NpcTurnResult PlayTurn(GameState game, Guid npcFactionId, TurnService turnService, CombatService combatService) {

        List<NpcCombatRoundSnapshot> combatRounds = [];

        if (game.CurrentFactionId != npcFactionId) {
            return new NpcTurnResult(combatRounds);
        }

        Faction npc = game.Factions.Single(f => f.Id == npcFactionId);

        if (npc.Type != FactionType.NPC || npc.IsDefeated) {
            return new NpcTurnResult(combatRounds);
        }

        int steps = 0;

        while (
            game.Status == GameStatus.InProgress
            && game.CurrentFactionId == npcFactionId
            && steps++ < MaxPhaseSteps) {

            try {
                switch (game.CurrentPhase) {

                    case TurnPhase.Upkeep:
                        turnService.AdvancePhase(game, npcFactionId);
                        break;

                    case TurnPhase.ReinforcementOne:
                    case TurnPhase.ReinforcementTwo:
                        SpendReinforcementPool(game, npcFactionId, turnService);
                        turnService.AdvancePhase(game, npcFactionId);
                        break;

                    case TurnPhase.Combat:
                        // One combat attempt per turn, then always leave Combat
                        TryCombatOrSkip(game, npcFactionId, combatService);

                        if (game.ActiveCombat != null) {
                            combatRounds.AddRange(
                                ResolveCombatUntilDone(game, npcFactionId, combatService));
                        }

                        // Retreat / fail leave phase on Combat — force advance
                        if (
                            game.Status == GameStatus.InProgress
                            && game.CurrentFactionId == npcFactionId
                            && game.CurrentPhase == TurnPhase.Combat
                            && game.ActiveCombat == null) {
                            combatService.SkipCombat(game, npcFactionId);
                        }
                        break;

                    case TurnPhase.EndTurn:
                        turnService.AdvancePhase(game, npcFactionId);
                        break;

                    default:
                        return new NpcTurnResult(combatRounds);
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
                    }
                    catch (InvalidOperationException) {
                        return new NpcTurnResult(combatRounds);
                    }
                }
                else {
                    return new NpcTurnResult(combatRounds);
                }
            }
        }

        return new NpcTurnResult(combatRounds);
    }

    private static void SpendReinforcementPool(GameState game, Guid factionId, TurnService turnService) {

        while (game.ReinforcementPool > 0) {

            Territory? target = game.Territories
                .Where(t => t.OwnerFactionId == factionId)
                .OrderByDescending(t => t.Soldiers)
                .FirstOrDefault();

            if (target == null) {
                break;
            }

            int amount = Math.Min(game.ReinforcementPool, 1);
            turnService.AllocateReinforcements(game, factionId, target.CountryId, amount);
        }
    }

    private static void TryCombatOrSkip(GameState game, Guid factionId, CombatService combatService) {

        if (game.ConqueredThisTurn.Count > 0 || game.ActiveCombat != null) {
            combatService.SkipCombat(game, factionId);
            return;
        }

        Territory? source = game.Territories
            .Where(t => t.OwnerFactionId == factionId && t.Soldiers > 1)
            .OrderByDescending(t => t.Soldiers)
            .FirstOrDefault();

        Territory? target = game.Territories
            .Where(t => t.OwnerFactionId != factionId && !IsDefeatedOwner(game, t.OwnerFactionId))
            .OrderBy(t => t.Soldiers)
            .FirstOrDefault();

        if (source == null || target == null) {
            combatService.SkipCombat(game, factionId);
            return;
        }

        int commit = Math.Min(source.Soldiers - 1, 2);

        // Don't start a fight we would immediately retreat from
        if (commit <= target.Soldiers) {
            combatService.SkipCombat(game, factionId);
            return;
        }

        try {
            combatService.StartCombat(game, factionId, source.CountryId, target.CountryId, commit);
        }
        catch (InvalidOperationException) {
            combatService.SkipCombat(game, factionId);
        }
    }

    private static List<NpcCombatRoundSnapshot> ResolveCombatUntilDone(
        GameState game,
        Guid factionId,
        CombatService combatService) {

        List<NpcCombatRoundSnapshot> rounds = [];
        int safety = 64;

        while (game.ActiveCombat != null && safety-- > 0) {

            CombatState combat = game.ActiveCombat;

            if (combat.AttackerSoldiers <= combat.DefenderSoldiers) {
                combatService.Retreat(game, factionId);
                break;
            }

            string source = combat.SourceCountryId;
            string destination = combat.DestinationCountryId;
            combatService.ResolveNextRound(game, factionId);

            // ResolveNextRound mutates this object before clearing ActiveCombat
            rounds.Add(new NpcCombatRoundSnapshot(
                source,
                destination,
                combat.LastAttackerDice.ToArray(),
                combat.LastDefenderDice.ToArray(),
                combat.LastAttackerLosses,
                combat.LastDefenderLosses,
                game.ActiveCombat == null));
        }

        return rounds;
    }

    private static bool IsDefeatedOwner(GameState game, Guid ownerId) {

        Faction? owner = game.Factions.FirstOrDefault(f => f.Id == ownerId);
        return owner == null || owner.IsDefeated;
    }
}

// ---- Background loop: advance NPC turns when it is their go ----
public class NpcTurnHostedService : BackgroundService {

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

        int baseDelayMs = _configuration.GetValue("Npc:BaseDelayMs", 800);
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
                await _gameEventRepository.AppendAsync(new GameEvent {
                    GameId = gameId,
                    EventId = Guid.NewGuid().ToString("N"),
                    Type = "NpcTurn",
                    OccurredAtUtc = DateTime.UtcNow,
                    PayloadJson = JsonSerializer.Serialize(new {
                        factionId = npcFactionId,
                        factionName = npcName,
                        version = game.Version,
                        phase = game.CurrentPhase.ToString(),
                        combatRounds = turnResult.CombatRounds.Count,
                    }),
                }, stoppingToken);

                foreach (NpcCombatRoundSnapshot round in turnResult.CombatRounds) {
                    await _gameEventRepository.AppendAsync(new GameEvent {
                        GameId = gameId,
                        EventId = Guid.NewGuid().ToString("N"),
                        Type = "NpcCombatRound",
                        OccurredAtUtc = DateTime.UtcNow,
                        PayloadJson = JsonSerializer.Serialize(new {
                            factionId = npcFactionId,
                            factionName = npcName,
                            sourceCountryId = round.SourceCountryId,
                            destinationCountryId = round.DestinationCountryId,
                            attackerDice = round.AttackerDice,
                            defenderDice = round.DefenderDice,
                            attackerLosses = round.AttackerLosses,
                            defenderLosses = round.DefenderLosses,
                            battleFinished = round.BattleFinished,
                        }),
                    }, stoppingToken);
                }

                await _gameStateNotifier.NotifyGameStateUpdatedAsync(gameId, game, stoppingToken);

                QueueNpcCommentary(gameId, turnResult.CombatRounds);
            }
        }

        if (game.CurrentFactionId != startingFaction || game.CurrentPhase != startingPhase || game.ActiveCombat != null) {
            await Task.Delay(delay, stoppingToken);
        }
    }

    private void QueueNpcCommentary(Guid gameId, IReadOnlyList<NpcCombatRoundSnapshot> rounds) {
        NpcCombatRoundSnapshot? last = rounds.LastOrDefault();
        if (last == null) {
            return;
        }

        _ = Task.Run(async () => {
            try {
                await using AsyncServiceScope scope = _scopeFactory.CreateAsyncScope();
                ICombatCommentaryService commentary =
                    scope.ServiceProvider.GetRequiredService<ICombatCommentaryService>();
                IGameEventRepository events =
                    scope.ServiceProvider.GetRequiredService<IGameEventRepository>();

                string? text = await commentary.GenerateAsync(
                    new CombatCommentaryContext {
                        AttackerCountry = last.SourceCountryId,
                        DefenderCountry = last.DestinationCountryId,
                        Round = Math.Max(1, last.AttackerDice.Length),
                        AttackerDice = last.AttackerDice,
                        DefenderDice = last.DefenderDice,
                        AttackerCasualties = last.AttackerLosses,
                        DefenderCasualties = last.DefenderLosses,
                        BattleFinished = last.BattleFinished,
                    },
                    CancellationToken.None);

                if (string.IsNullOrWhiteSpace(text)) {
                    return;
                }

                await events.AppendAsync(new GameEvent {
                    GameId = gameId,
                    EventId = Guid.NewGuid().ToString("N"),
                    Type = "CommentaryAvailable",
                    OccurredAtUtc = DateTime.UtcNow,
                    PayloadJson = JsonSerializer.Serialize(new { commentary = text }),
                }, CancellationToken.None);
            }
            catch {
                // commentary is best-effort
            }
        });
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

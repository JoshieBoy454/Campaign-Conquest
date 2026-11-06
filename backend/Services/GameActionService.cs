using System.Collections.Concurrent;
using System.Text.Json;
using Models;
using Repositories;

namespace Services;

public class GameVersionConflictException : Exception {
    public GameVersionConflictException(long expected, long actual)
        : base($"Expected game version {expected} but current version is {actual}.") {
        ExpectedVersion = expected;
        ActualVersion = actual;
    }

    public long ExpectedVersion { get; }
    public long ActualVersion { get; }
}

public class GameActionService {

    private readonly ConcurrentDictionary<string, GameState> _completedActions = new();
    private readonly IGameRepository _gameRepository;
    private readonly IGameEventRepository _gameEventRepository;
    private readonly IGameStateNotifier _gameStateNotifier;
    private readonly GameConcurrencyGate _concurrencyGate;
    private readonly TurnService _turnService;
    private readonly CombatService _combatService;
    private readonly ICombatCommentaryService _commentaryService;
    private readonly IServiceScopeFactory _scopeFactory;

    public GameActionService(
        IGameRepository gameRepository,
        IGameEventRepository gameEventRepository,
        IGameStateNotifier gameStateNotifier,
        GameConcurrencyGate concurrencyGate,
        TurnService turnService,
        CombatService combatService,
        ICombatCommentaryService commentaryService,
        IServiceScopeFactory scopeFactory) {

        _gameRepository = gameRepository;
        _gameEventRepository = gameEventRepository;
        _gameStateNotifier = gameStateNotifier;
        _concurrencyGate = concurrencyGate;
        _turnService = turnService;
        _combatService = combatService;
        _commentaryService = commentaryService;
        _scopeFactory = scopeFactory;
    }

    public Task<GameState> AdvancePhase(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        CancellationToken cancellationToken = default) {

        return ExecuteAsync(
            gameId,
            expectedVersion,
            actionId,
            "AdvancePhase",
            game => {
                Guid actorId = RequireCurrentFaction(game);
                _turnService.AdvancePhase(game, actorId);
            },
            cancellationToken,
            game => new {
                phase = game.CurrentPhase.ToString(),
                factionId = game.CurrentFactionId,
                factionName = FactionName(game, game.CurrentFactionId),
                reinforcementPool = game.ReinforcementPool,
            });
    }

    public Task<GameState> AllocateReinforcements(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        string countryId,
        int soldierCount,
        CancellationToken cancellationToken = default) {

        return ExecuteAsync(
            gameId,
            expectedVersion,
            actionId,
            "AllocateReinforcements",
            game => {
                Guid actorId = RequireCurrentFaction(game);
                _turnService.AllocateReinforcements(game, actorId, countryId, soldierCount);
            },
            cancellationToken,
            game => {
                Territory? t = FindTerritory(game, countryId);
                return new {
                    countryId,
                    countryName = t?.Name ?? countryId,
                    soldierCount,
                    soldiersOnCountry = t?.Soldiers ?? 0,
                    poolRemaining = game.ReinforcementPool,
                };
            });
    }

    public Task<GameState> TransferSoldiers(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        string sourceCountryId,
        string destinationCountryId,
        int soldierCount,
        CancellationToken cancellationToken = default) {

        return ExecuteAsync(
            gameId,
            expectedVersion,
            actionId,
            "TransferSoldiers",
            game => {
                Guid actorId = RequireCurrentFaction(game);
                _turnService.TransferSoldiers(
                    game,
                    actorId,
                    sourceCountryId,
                    destinationCountryId,
                    soldierCount);
            },
            cancellationToken,
            game => {
                Territory? src = FindTerritory(game, sourceCountryId);
                Territory? dst = FindTerritory(game, destinationCountryId);
                return new {
                    sourceCountryId,
                    sourceName = src?.Name ?? sourceCountryId,
                    destinationCountryId,
                    destinationName = dst?.Name ?? destinationCountryId,
                    soldierCount,
                    sourceSoldiers = src?.Soldiers ?? 0,
                    destinationSoldiers = dst?.Soldiers ?? 0,
                };
            });
    }

    public Task<GameState> StartCombat(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        string sourceCountryId,
        string destinationCountryId,
        int soldierCount,
        CancellationToken cancellationToken = default) {

        return ExecuteAsync(
            gameId,
            expectedVersion,
            actionId,
            "StartCombat",
            game => {
                Guid actorId = RequireCurrentFaction(game);
                _combatService.StartCombat(
                    game,
                    actorId,
                    sourceCountryId,
                    destinationCountryId,
                    soldierCount);
            },
            cancellationToken,
            game => {
                CombatState? c = game.ActiveCombat;
                return new {
                    sourceCountryId,
                    sourceName = TerritoryName(game, sourceCountryId),
                    destinationCountryId,
                    destinationName = TerritoryName(game, destinationCountryId),
                    attackerSoldiers = c?.AttackerSoldiers ?? soldierCount,
                    defenderSoldiers = c?.DefenderSoldiers ?? 0,
                };
            });
    }

    public async Task<GameState> ResolveCombatRound(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        CancellationToken cancellationToken = default) {

        CombatState? roundSnapshot = null;
        string sourceName = "";
        string destinationName = "";

        GameState game = await ExecuteAsync(
            gameId,
            expectedVersion,
            actionId,
            "ResolveCombatRound",
            state => {
                Guid actorId = RequireCurrentFaction(state);
                CombatState? before = state.ActiveCombat;
                sourceName = TerritoryName(state, before?.SourceCountryId);
                destinationName = TerritoryName(state, before?.DestinationCountryId);
                roundSnapshot = _combatService.ResolveNextRound(state, actorId);
            },
            cancellationToken,
            _ => roundSnapshot == null
                ? null
                : new {
                    sourceCountryId = roundSnapshot.SourceCountryId,
                    sourceName,
                    destinationCountryId = roundSnapshot.DestinationCountryId,
                    destinationName,
                    round = roundSnapshot.RoundNumber,
                    attackerDice = roundSnapshot.LastAttackerDice,
                    defenderDice = roundSnapshot.LastDefenderDice,
                    attackerLosses = roundSnapshot.LastAttackerLosses,
                    defenderLosses = roundSnapshot.LastDefenderLosses,
                    attackerSoldiersRemaining = roundSnapshot.AttackerSoldiers,
                    defenderSoldiersRemaining = roundSnapshot.DefenderSoldiers,
                    battleFinished = roundSnapshot.AttackerSoldiers <= 0
                        || roundSnapshot.DefenderSoldiers <= 0,
                });

        if (roundSnapshot != null) {
            QueueCommentary(game, roundSnapshot);
        }

        return game;
    }

    private void QueueCommentary(GameState game, CombatState combat) {
        string attackerCountry = TerritoryName(game, combat.SourceCountryId);
        string defenderCountry = TerritoryName(game, combat.DestinationCountryId);
        int[] attackerDice = combat.LastAttackerDice.ToArray();
        int[] defenderDice = combat.LastDefenderDice.ToArray();
        int attackerLosses = combat.LastAttackerLosses;
        int defenderLosses = combat.LastDefenderLosses;
        bool finished = combat.AttackerSoldiers <= 0 || combat.DefenderSoldiers <= 0;
        string? outcome = null;
        if (finished) {
            outcome = combat.DefenderSoldiers <= 0
                ? $"{attackerCountry} takes {defenderCountry}."
                : $"{attackerCountry}'s assault on {defenderCountry} collapses.";
        }

        Guid gameId = game.Id;
        int round = Math.Max(1, combat.RoundNumber);
        int atkLeft = Math.Max(0, combat.AttackerSoldiers);
        int defLeft = Math.Max(0, combat.DefenderSoldiers);

        _ = Task.Run(async () => {
            try {
                string? text = await _commentaryService.GenerateAsync(
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
                        Outcome = outcome,
                    },
                    CancellationToken.None);

                if (string.IsNullOrWhiteSpace(text)) {
                    return;
                }

                await using AsyncServiceScope scope = _scopeFactory.CreateAsyncScope();
                IGameEventRepository events =
                    scope.ServiceProvider.GetRequiredService<IGameEventRepository>();

                await events.AppendAsync(new GameEvent {
                    GameId = gameId,
                    EventId = Guid.NewGuid().ToString("N"),
                    Type = "CommentaryAvailable",
                    OccurredAtUtc = DateTime.UtcNow,
                    PayloadJson = JsonSerializer.Serialize(new { commentary = text }),
                }, CancellationToken.None);
            }
            catch {
                // swallow — gameplay already committed
            }
        });
    }

    public Task<GameState> RetreatCombat(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        CancellationToken cancellationToken = default) {

        string? sourceId = null;
        string? destId = null;
        int retreated = 0;

        return ExecuteAsync(
            gameId,
            expectedVersion,
            actionId,
            "RetreatCombat",
            game => {
                CombatState? c = game.ActiveCombat;
                sourceId = c?.SourceCountryId;
                destId = c?.DestinationCountryId;
                retreated = c?.AttackerSoldiers ?? 0;
                Guid actorId = RequireCurrentFaction(game);
                _combatService.Retreat(game, actorId);
            },
            cancellationToken,
            game => new {
                sourceCountryId = sourceId,
                sourceName = sourceId == null ? null : TerritoryName(game, sourceId),
                destinationCountryId = destId,
                destinationName = destId == null ? null : TerritoryName(game, destId),
                soldiersRetreated = retreated,
            });
    }

    public Task<GameState> SetNpcSpeed(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        int npcSpeed,
        CancellationToken cancellationToken = default) {

        return ExecuteAsync(
            gameId,
            expectedVersion,
            actionId,
            "SetNpcSpeed",
            game => {

                if (npcSpeed < 1 || npcSpeed > 8) {
                    throw new ArgumentOutOfRangeException(
                        nameof(npcSpeed),
                        "NPC speed must be between 1 and 8"
                    );
                }

                game.NpcSpeed = npcSpeed;
                game.Version++;
            },
            cancellationToken);
    }

    private async Task<GameState> ExecuteAsync(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        string eventType,
        Action<GameState> mutate,
        CancellationToken cancellationToken,
        Func<GameState, object?>? payloadFactory = null) {

        string? idempotencyKey = BuildIdempotencyKey(gameId, actionId);

        if (idempotencyKey != null && _completedActions.TryGetValue(idempotencyKey, out GameState? cached)) {
            return cached;
        }

        SemaphoreSlim gate = _concurrencyGate.Get(gameId);
        await gate.WaitAsync(cancellationToken);

        try {

            if (idempotencyKey != null && _completedActions.TryGetValue(idempotencyKey, out cached)) {
                return cached;
            }

            GameState? game = await _gameRepository.GetAsync(gameId, cancellationToken)
                ?? throw new KeyNotFoundException("The requested game could not be found");

            if (game.Version != expectedVersion) {
                throw new GameVersionConflictException(expectedVersion, game.Version);
            }

            mutate(game);

            bool saved = await _gameRepository.TryReplaceAsync(game, expectedVersion, cancellationToken);

            if (!saved) {
                GameState? current = await _gameRepository.GetAsync(gameId, cancellationToken);
                throw new GameVersionConflictException(expectedVersion, current?.Version ?? -1);
            }

            // Event log / SignalR must not roll a successful mutate into HTTP 500.
            try {
                object? extra = payloadFactory?.Invoke(game);
                await AppendEventAsync(gameId, actionId, eventType, game, extra, cancellationToken);
            }
            catch {
                // best-effort
            }

            try {
                await _gameStateNotifier.NotifyGameStateUpdatedAsync(gameId, game, cancellationToken);
            }
            catch {
                // best-effort — client also polls
            }

            if (idempotencyKey != null) {
                _completedActions[idempotencyKey] = game;
            }

            return game;
        }
        finally {
            gate.Release();
        }
    }

    private async Task AppendEventAsync(
        Guid gameId,
        string? actionId,
        string eventType,
        GameState game,
        object? extra,
        CancellationToken cancellationToken) {

        Dictionary<string, object?> payload = new() {
            ["actionId"] = actionId,
            ["version"] = game.Version,
        };

        if (extra != null) {
            foreach (var prop in extra.GetType().GetProperties()) {
                payload[prop.Name] = prop.GetValue(extra);
            }
        }

        GameEvent gameEvent = new() {
            GameId = gameId,
            EventId = string.IsNullOrWhiteSpace(actionId) ? Guid.NewGuid().ToString("N") : actionId.Trim(),
            Type = eventType,
            OccurredAtUtc = DateTime.UtcNow,
            PayloadJson = JsonSerializer.Serialize(payload),
        };

        await _gameEventRepository.AppendAsync(gameEvent, cancellationToken);
    }

    private static Guid RequireCurrentFaction(GameState game) {

        return game.CurrentFactionId
            ?? throw new InvalidOperationException("No faction is currently active");
    }

    private static string TerritoryName(GameState game, string? countryId) {
        if (string.IsNullOrWhiteSpace(countryId)) {
            return "?";
        }

        Territory? t = FindTerritory(game, countryId);
        return string.IsNullOrWhiteSpace(t?.Name) ? countryId : t!.Name;
    }

    private static Territory? FindTerritory(GameState game, string countryId) {
        return game.Territories.FirstOrDefault(t =>
            string.Equals(t.CountryId, countryId, StringComparison.OrdinalIgnoreCase));
    }

    private static string? FactionName(GameState game, Guid? factionId) {
        if (factionId == null) {
            return null;
        }

        return game.Factions.FirstOrDefault(f => f.Id == factionId)?.Name;
    }

    private static string? BuildIdempotencyKey(Guid gameId, string? actionId) {

        if (string.IsNullOrWhiteSpace(actionId)) {
            return null;
        }

        return $"{gameId:N}:{actionId.Trim()}";
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

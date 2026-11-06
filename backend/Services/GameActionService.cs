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

    public GameActionService(
        IGameRepository gameRepository,
        IGameEventRepository gameEventRepository,
        IGameStateNotifier gameStateNotifier,
        GameConcurrencyGate concurrencyGate,
        TurnService turnService,
        CombatService combatService) {

        _gameRepository = gameRepository;
        _gameEventRepository = gameEventRepository;
        _gameStateNotifier = gameStateNotifier;
        _concurrencyGate = concurrencyGate;
        _turnService = turnService;
        _combatService = combatService;
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
            cancellationToken);
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
            cancellationToken);
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
            cancellationToken);
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
            cancellationToken);
    }

    public Task<GameState> ResolveCombatRound(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        CancellationToken cancellationToken = default) {

        return ExecuteAsync(
            gameId,
            expectedVersion,
            actionId,
            "ResolveCombatRound",
            game => {
                Guid actorId = RequireCurrentFaction(game);
                _combatService.ResolveNextRound(game, actorId);
            },
            cancellationToken);
    }

    public Task<GameState> RetreatCombat(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        CancellationToken cancellationToken = default) {

        return ExecuteAsync(
            gameId,
            expectedVersion,
            actionId,
            "RetreatCombat",
            game => {
                Guid actorId = RequireCurrentFaction(game);
                _combatService.Retreat(game, actorId);
            },
            cancellationToken);
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
        CancellationToken cancellationToken) {

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

            await AppendEventAsync(gameId, actionId, eventType, game, cancellationToken);
            await _gameStateNotifier.NotifyGameStateUpdatedAsync(gameId, game, cancellationToken);

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
        CancellationToken cancellationToken) {

        string payloadJson = JsonSerializer.Serialize(new {
            actionId,
            version = game.Version,
        });

        GameEvent gameEvent = new() {
            GameId = gameId,
            EventId = string.IsNullOrWhiteSpace(actionId) ? Guid.NewGuid().ToString("N") : actionId.Trim(),
            Type = eventType,
            OccurredAtUtc = DateTime.UtcNow,
            PayloadJson = payloadJson,
        };

        await _gameEventRepository.AppendAsync(gameEvent, cancellationToken);
    }

    private static Guid RequireCurrentFaction(GameState game) {

        return game.CurrentFactionId
            ?? throw new InvalidOperationException("No faction is currently active");
    }

    private static string? BuildIdempotencyKey(Guid gameId, string? actionId) {

        if (string.IsNullOrWhiteSpace(actionId)) {
            return null;
        }

        return $"{gameId:N}:{actionId.Trim()}";
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

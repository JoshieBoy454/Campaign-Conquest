using System.Collections.Concurrent;
using Models;

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

// ---- Version checks + actionId idempotency (in-memory for now) ----
public class GameActionService {

    private readonly ConcurrentDictionary<string, GameState> _completedActions = new();
    private readonly GameStore _gameStore;
    private readonly TurnService _turnService;
    private readonly CombatService _combatService;

    public GameActionService(
        GameStore gameStore,
        TurnService turnService,
        CombatService combatService) {

        _gameStore = gameStore;
        _turnService = turnService;
        _combatService = combatService;
    }

    public GameState AdvancePhase(Guid gameId, long expectedVersion, string? actionId) {

        return Execute(gameId, expectedVersion, actionId, game => {
            Guid actorId = RequireCurrentFaction(game);
            _turnService.AdvancePhase(game, actorId);
        });
    }

    public GameState AllocateReinforcements(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        string countryId,
        int soldierCount) {

        return Execute(gameId, expectedVersion, actionId, game => {
            Guid actorId = RequireCurrentFaction(game);
            _turnService.AllocateReinforcements(game, actorId, countryId, soldierCount);
        });
    }

    public GameState TransferSoldiers(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        string sourceCountryId,
        string destinationCountryId,
        int soldierCount) {

        return Execute(gameId, expectedVersion, actionId, game => {
            Guid actorId = RequireCurrentFaction(game);
            _turnService.TransferSoldiers(game, actorId, sourceCountryId, destinationCountryId, soldierCount);
        });
    }

    public GameState StartCombat(
        Guid gameId,
        long expectedVersion,
        string? actionId,
        string sourceCountryId,
        string destinationCountryId,
        int soldierCount) {

        return Execute(gameId, expectedVersion, actionId, game => {
            Guid actorId = RequireCurrentFaction(game);
            _combatService.StartCombat(game, actorId, sourceCountryId, destinationCountryId, soldierCount);
        });
    }

    public GameState ResolveCombatRound(Guid gameId, long expectedVersion, string? actionId) {

        return Execute(gameId, expectedVersion, actionId, game => {
            Guid actorId = RequireCurrentFaction(game);
            _combatService.ResolveNextRound(game, actorId);
        });
    }

    public GameState RetreatCombat(Guid gameId, long expectedVersion, string? actionId) {

        return Execute(gameId, expectedVersion, actionId, game => {
            Guid actorId = RequireCurrentFaction(game);
            _combatService.Retreat(game, actorId);
        });
    }

    public GameState SetNpcSpeed(Guid gameId, long expectedVersion, string? actionId, int npcSpeed) {

        return Execute(gameId, expectedVersion, actionId, game => {

            if (npcSpeed < 1 || npcSpeed > 8) {
                throw new ArgumentOutOfRangeException(
                    nameof(npcSpeed),
                    "NPC speed must be between 1 and 8"
                );
            }

            game.NpcSpeed = npcSpeed;
            game.Version++;
        });
    }

    private GameState Execute(Guid gameId, long expectedVersion, string? actionId, Action<GameState> mutate) {

        string? idempotencyKey = BuildIdempotencyKey(gameId, actionId);

        if (idempotencyKey != null && _completedActions.TryGetValue(idempotencyKey, out GameState? cached)) {
            return cached;
        }

        GameState? game = _gameStore.GetGame(gameId)
            ?? throw new KeyNotFoundException("The requested game could not be found");

        if (game.Version != expectedVersion) {
            throw new GameVersionConflictException(expectedVersion, game.Version);
        }

        mutate(game);

        if (idempotencyKey != null) {
            _completedActions[idempotencyKey] = game;
        }

        return game;
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

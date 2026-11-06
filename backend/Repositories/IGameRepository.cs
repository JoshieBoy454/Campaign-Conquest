using Models;

namespace Repositories;

public interface IGameRepository
{
    Task<GameState?> GetAsync(Guid gameId, CancellationToken cancellationToken = default);

    Task AddAsync(GameState game, CancellationToken cancellationToken = default);

    Task<bool> TryReplaceAsync(
        GameState game,
        long expectedVersion,
        CancellationToken cancellationToken = default);

    IAsyncEnumerable<GameState> GetAllAsync(CancellationToken cancellationToken = default);
}

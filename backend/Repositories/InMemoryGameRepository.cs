using Models;
using Services;

namespace Repositories;

public class InMemoryGameRepository(GameStore gameStore) : IGameRepository
{
    public Task AddAsync(GameState game, CancellationToken cancellationToken = default)
    {
        gameStore.AddGame(game);
        return Task.CompletedTask;
    }

    public Task<GameState?> GetAsync(Guid gameId, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(gameStore.GetGame(gameId));
    }

    public Task<bool> TryReplaceAsync(
        GameState game,
        long expectedVersion,
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult(gameStore.TryReplace(game, expectedVersion));
    }

    public async IAsyncEnumerable<GameState> GetAllAsync(
        [System.Runtime.CompilerServices.EnumeratorCancellation]
        CancellationToken cancellationToken = default)
    {
        foreach (GameState game in gameStore.GetAllGames())
        {
            cancellationToken.ThrowIfCancellationRequested();
            yield return game;
            await Task.CompletedTask;
        }
    }
}

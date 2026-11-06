using Configuration;
using Microsoft.Extensions.Options;
using Models;
using MongoDB.Driver;

namespace Repositories;

public class MongoGameRepository : IGameRepository
{
    private readonly IMongoCollection<GameState> _games;

    public MongoGameRepository(IMongoClient client, IOptions<MongoDbOptions> options)
    {
        MongoDbOptions mongo = options.Value;
        IMongoDatabase database = client.GetDatabase(mongo.DatabaseName);
        _games = database.GetCollection<GameState>("Games");
    }

    public async Task AddAsync(GameState game, CancellationToken cancellationToken = default)
    {
        await _games.InsertOneAsync(game, cancellationToken: cancellationToken);
    }

    public async Task<GameState?> GetAsync(Guid gameId, CancellationToken cancellationToken = default)
    {
        return await _games
            .Find(g => g.Id == gameId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<bool> TryReplaceAsync(
        GameState game,
        long expectedVersion,
        CancellationToken cancellationToken = default)
    {
        ReplaceOneResult result = await _games.ReplaceOneAsync(
            g => g.Id == game.Id && g.Version == expectedVersion,
            game,
            cancellationToken: cancellationToken);

        return result.IsAcknowledged && result.ModifiedCount == 1;
    }

    public async IAsyncEnumerable<GameState> GetAllAsync(
        [System.Runtime.CompilerServices.EnumeratorCancellation]
        CancellationToken cancellationToken = default)
    {
        using IAsyncCursor<GameState> cursor = await _games.FindAsync(
            FilterDefinition<GameState>.Empty,
            cancellationToken: cancellationToken);

        while (await cursor.MoveNextAsync(cancellationToken))
        {
            foreach (GameState game in cursor.Current)
            {
                yield return game;
            }
        }
    }
}

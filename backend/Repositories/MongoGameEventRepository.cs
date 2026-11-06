using Configuration;
using Microsoft.Extensions.Options;
using Models;
using MongoDB.Driver;

namespace Repositories;

public class MongoGameEventRepository : IGameEventRepository
{
    private readonly IMongoCollection<GameEvent> _events;

    public MongoGameEventRepository(IMongoClient client, IOptions<MongoDbOptions> options)
    {
        MongoDbOptions mongo = options.Value;
        IMongoDatabase database = client.GetDatabase(mongo.DatabaseName);
        _events = database.GetCollection<GameEvent>("GameEvents");

        _events.Indexes.CreateOne(
            new CreateIndexModel<GameEvent>(
                Builders<GameEvent>.IndexKeys
                    .Ascending(e => e.GameId)
                    .Ascending(e => e.Sequence),
                new CreateIndexOptions { Unique = true }));
    }

    public async Task AppendAsync(GameEvent gameEvent, CancellationToken cancellationToken = default)
    {
        GameEvent? latest = await _events
            .Find(e => e.GameId == gameEvent.GameId)
            .SortByDescending(e => e.Sequence)
            .Limit(1)
            .FirstOrDefaultAsync(cancellationToken);

        gameEvent.Sequence = latest == null ? 1 : latest.Sequence + 1;
        await _events.InsertOneAsync(gameEvent, cancellationToken: cancellationToken);
    }

    public async Task<IReadOnlyList<GameEvent>> GetAfterAsync(
        Guid gameId,
        long afterSequence,
        int pageSize = 100,
        CancellationToken cancellationToken = default)
    {
        return await _events
            .Find(e => e.GameId == gameId && e.Sequence > afterSequence)
            .SortBy(e => e.Sequence)
            .Limit(pageSize)
            .ToListAsync(cancellationToken);
    }
}

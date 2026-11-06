using Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Repositories;

public class MongoGameEventRepository : IGameEventRepository
{
    private readonly IMongoCollection<GameEvent> _events;
    private readonly IMongoCollection<BsonDocument> _rawEvents;
    private readonly ILogger<MongoGameEventRepository> _logger;

    public MongoGameEventRepository(
        IMongoClient client,
        IOptions<MongoDbOptions> options,
        ILogger<MongoGameEventRepository> logger)
    {
        _logger = logger;
        MongoDbOptions mongo = options.Value;
        IMongoDatabase database = client.GetDatabase(mongo.DatabaseName);
        _events = database.GetCollection<GameEvent>("GameEvents");
        _rawEvents = database.GetCollection<BsonDocument>("GameEvents");

        _events.Indexes.CreateOne(
            new CreateIndexModel<GameEvent>(
                Builders<GameEvent>.IndexKeys
                    .Ascending(e => e.GameId)
                    .Ascending(e => e.Sequence),
                new CreateIndexOptions { Unique = true }));
    }

    public async Task AppendAsync(GameEvent gameEvent, CancellationToken cancellationToken = default)
    {
        // Sequence is unique per game — retry on races with NPC/commentary writers.
        const int maxAttempts = 8;
        for (int attempt = 1; attempt <= maxAttempts; attempt++)
        {
            GameEvent? latest = await _events
                .Find(e => e.GameId == gameEvent.GameId)
                .SortByDescending(e => e.Sequence)
                .Limit(1)
                .FirstOrDefaultAsync(cancellationToken);

            gameEvent.Sequence = latest == null ? 1 : latest.Sequence + 1;

            try
            {
                await _events.InsertOneAsync(gameEvent, cancellationToken: cancellationToken);
                return;
            }
            catch (MongoWriteException ex) when (
                ex.WriteError?.Category == ServerErrorCategory.DuplicateKey
                && attempt < maxAttempts)
            {
                // another writer took this sequence — try again
            }
        }

        throw new InvalidOperationException("Unable to append game event after sequence conflicts.");
    }

    public async Task<IReadOnlyList<GameEvent>> GetAfterAsync(
        Guid gameId,
        long afterSequence,
        int pageSize = 100,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await _events
                .Find(e => e.GameId == gameId && e.Sequence > afterSequence)
                .SortBy(e => e.Sequence)
                .Limit(pageSize)
                .ToListAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Typed GameEvents read failed for {GameId}; falling back to raw BSON map",
                gameId);
            return await GetAfterRawAsync(gameId, afterSequence, pageSize, cancellationToken);
        }
    }

    private async Task<IReadOnlyList<GameEvent>> GetAfterRawAsync(
        Guid gameId,
        long afterSequence,
        int pageSize,
        CancellationToken cancellationToken)
    {
        // Match Standard Guid binary or legacy string GameId values.
        FilterDefinition<BsonDocument> gameFilter = Builders<BsonDocument>.Filter.Or(
            Builders<BsonDocument>.Filter.Eq("GameId", gameId),
            Builders<BsonDocument>.Filter.Eq("GameId", gameId.ToString()),
            Builders<BsonDocument>.Filter.Eq("gameId", gameId),
            Builders<BsonDocument>.Filter.Eq("gameId", gameId.ToString()));

        FilterDefinition<BsonDocument> seqFilter = Builders<BsonDocument>.Filter.Or(
            Builders<BsonDocument>.Filter.Gt("Sequence", afterSequence),
            Builders<BsonDocument>.Filter.Gt("sequence", afterSequence));

        List<BsonDocument> docs = await _rawEvents
            .Find(Builders<BsonDocument>.Filter.And(gameFilter, seqFilter))
            .Sort(Builders<BsonDocument>.Sort.Ascending("Sequence").Ascending("sequence"))
            .Limit(pageSize)
            .ToListAsync(cancellationToken);

        List<GameEvent> mapped = [];
        foreach (BsonDocument doc in docs)
        {
            try
            {
                mapped.Add(MapRaw(doc, gameId));
            }
            catch (Exception mapEx)
            {
                _logger.LogWarning(mapEx, "Skipping unreadable GameEvent document");
            }
        }

        return mapped
            .Where(e => e.Sequence > afterSequence)
            .OrderBy(e => e.Sequence)
            .Take(pageSize)
            .ToList();
    }

    private static GameEvent MapRaw(BsonDocument doc, Guid fallbackGameId)
    {
        Guid gameId = fallbackGameId;
        if (doc.TryGetValue("GameId", out BsonValue gameIdValue) ||
            doc.TryGetValue("gameId", out gameIdValue))
        {
            if (gameIdValue.IsGuid)
            {
                gameId = gameIdValue.AsGuid;
            }
            else if (gameIdValue.IsString && Guid.TryParse(gameIdValue.AsString, out Guid parsed))
            {
                gameId = parsed;
            }
        }

        long sequence = 0;
        if (doc.TryGetValue("Sequence", out BsonValue seq) || doc.TryGetValue("sequence", out seq))
        {
            sequence = seq.ToInt64();
        }

        string eventId = ReadString(doc, "EventId", "eventId");
        string type = ReadString(doc, "Type", "type");
        string payload = ReadString(doc, "PayloadJson", "payloadJson");

        DateTime occurred = DateTime.UtcNow;
        if (doc.TryGetValue("OccurredAtUtc", out BsonValue when) ||
            doc.TryGetValue("occurredAtUtc", out when))
        {
            occurred = when.ToUniversalTime();
        }

        return new GameEvent
        {
            GameId = gameId,
            Sequence = sequence,
            EventId = eventId,
            Type = type,
            OccurredAtUtc = occurred,
            PayloadJson = payload,
        };
    }

    private static string ReadString(BsonDocument doc, string a, string b)
    {
        if (doc.TryGetValue(a, out BsonValue value) || doc.TryGetValue(b, out value))
        {
            return value.IsBsonNull ? string.Empty : value.ToString() ?? string.Empty;
        }

        return string.Empty;
    }
}

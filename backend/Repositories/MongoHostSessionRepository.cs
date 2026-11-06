using Configuration;
using Microsoft.Extensions.Options;
using Models;
using MongoDB.Driver;

namespace Repositories;

public class MongoHostSessionRepository : IHostSessionRepository
{
    private readonly IMongoCollection<HostSession> _sessions;

    public MongoHostSessionRepository(IMongoClient client, IOptions<MongoDbOptions> options)
    {
        MongoDbOptions mongo = options.Value;
        IMongoDatabase database = client.GetDatabase(mongo.DatabaseName);
        _sessions = database.GetCollection<HostSession>("HostSessions");
    }

    public async Task CreateAsync(Guid gameId, string tokenHash, CancellationToken cancellationToken = default)
    {
        HostSession session = new() {
            GameId = gameId,
            TokenHash = tokenHash,
            CreatedAtUtc = DateTime.UtcNow,
        };

        await _sessions.ReplaceOneAsync(
            s => s.GameId == gameId,
            session,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
    }

    public async Task<bool> ValidateAsync(
        Guid gameId,
        string tokenHash,
        CancellationToken cancellationToken = default)
    {
        HostSession? session = await _sessions
            .Find(s => s.GameId == gameId)
            .FirstOrDefaultAsync(cancellationToken);

        return session != null
            && string.Equals(session.TokenHash, tokenHash, StringComparison.Ordinal);
    }
}

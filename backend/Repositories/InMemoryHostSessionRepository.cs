using System.Collections.Concurrent;

namespace Repositories;

public class InMemoryHostSessionRepository : IHostSessionRepository
{
    private readonly ConcurrentDictionary<Guid, string> _hashes = new();

    public Task CreateAsync(Guid gameId, string tokenHash, CancellationToken cancellationToken = default)
    {
        _hashes[gameId] = tokenHash;
        return Task.CompletedTask;
    }

    public Task<bool> ValidateAsync(
        Guid gameId,
        string tokenHash,
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult(
            _hashes.TryGetValue(gameId, out string? stored)
            && string.Equals(stored, tokenHash, StringComparison.Ordinal));
    }
}

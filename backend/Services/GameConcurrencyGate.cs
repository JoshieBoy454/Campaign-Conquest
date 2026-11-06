using System.Collections.Concurrent;

namespace Services;

public class GameConcurrencyGate
{
    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _gates = new();

    public SemaphoreSlim Get(Guid gameId) =>
        _gates.GetOrAdd(gameId, _ => new SemaphoreSlim(1, 1));
}

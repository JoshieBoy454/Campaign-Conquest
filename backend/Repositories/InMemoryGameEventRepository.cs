using System.Collections.Concurrent;
using Models;

namespace Repositories;

public class InMemoryGameEventRepository : IGameEventRepository
{
    private readonly ConcurrentDictionary<Guid, long> _nextSequence = new();
    private readonly ConcurrentBag<GameEvent> _events = [];

    public Task AppendAsync(GameEvent gameEvent, CancellationToken cancellationToken = default)
    {
        long sequence = _nextSequence.AddOrUpdate(
            gameEvent.GameId,
            1,
            (_, current) => current + 1);

        gameEvent.Sequence = sequence;
        _events.Add(gameEvent);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<GameEvent>> GetAfterAsync(
        Guid gameId,
        long afterSequence,
        int pageSize = 100,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyList<GameEvent> page = _events
            .Where(e => e.GameId == gameId && e.Sequence > afterSequence)
            .OrderBy(e => e.Sequence)
            .Take(pageSize)
            .ToList();

        return Task.FromResult(page);
    }
}

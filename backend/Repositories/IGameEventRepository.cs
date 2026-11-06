using Models;

namespace Repositories;

public interface IGameEventRepository
{
    Task AppendAsync(GameEvent gameEvent, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<GameEvent>> GetAfterAsync(
        Guid gameId,
        long afterSequence,
        int pageSize = 100,
        CancellationToken cancellationToken = default);
}

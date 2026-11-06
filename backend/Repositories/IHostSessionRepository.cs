namespace Repositories;

public interface IHostSessionRepository
{
    Task CreateAsync(Guid gameId, string tokenHash, CancellationToken cancellationToken = default);

    Task<bool> ValidateAsync(
        Guid gameId,
        string tokenHash,
        CancellationToken cancellationToken = default);
}

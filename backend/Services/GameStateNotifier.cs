using Hubs;
using Microsoft.AspNetCore.SignalR;
using Models;

namespace Services;

public interface IGameStateNotifier
{
    Task NotifyGameStateUpdatedAsync(Guid gameId, GameState game, CancellationToken cancellationToken = default);
}

public class SignalRGameStateNotifier(IHubContext<GameHub> hubContext) : IGameStateNotifier
{
    public Task NotifyGameStateUpdatedAsync(
        Guid gameId,
        GameState game,
        CancellationToken cancellationToken = default)
    {
        return hubContext.Clients
            .Group(gameId.ToString())
            .SendAsync("GameStateUpdated", game, cancellationToken);
    }
}

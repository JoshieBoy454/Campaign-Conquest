using System.Collections.Concurrent;
using Models;

namespace Services;

//Temp class to run game
public class GameStore
{
    private readonly ConcurrentDictionary<Guid, GameState> _games = new();

    public void AddGame(GameState game)
    {
        ArgumentNullException.ThrowIfNull(game);

        if (!_games.TryAdd(game.Id, game))
        {
            throw new InvalidOperationException(
                "A game with this ID already exists."
            );
        }
    }
    public GameState? GetGame(Guid gameId)
    {
        return _games.TryGetValue(gameId, out GameState? game)
            ? game
            : null;
    }
}

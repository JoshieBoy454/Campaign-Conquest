using Enums;
using Models;
using Services;
using Xunit;

namespace CampaignConquest.Api.Tests;

public class TurnServiceUpkeepTests
{
    [Fact]
    public void StartGame_FirstTurn_GrantsReinforcementPool()
    {
        GameState game = BuildFreshGame();
        var turns = new TurnService();
        turns.StartGame(game);

        Faction current = game.Factions.Single(f => f.Id == game.CurrentFactionId);
        Assert.Equal(1, current.TurnsPlayed);
        // 1 owned territory × 2
        Assert.Equal(2, game.ReinforcementPool);
        Assert.Equal(TurnPhase.Upkeep, game.CurrentPhase);
        Assert.Equal(GameStatus.InProgress, game.Status);
    }

    [Fact]
    public void AdvanceFromUpkeep_WithEmptyPool_EntersReinforcementOne()
    {
        GameState game = BuildFreshGame();
        var turns = new TurnService();
        turns.StartGame(game);

        Guid actor = game.CurrentFactionId!.Value;
        turns.AdvancePhase(game, actor);

        Assert.Equal(TurnPhase.ReinforcementOne, game.CurrentPhase);
    }

    private static GameState BuildFreshGame()
    {
        var game = new GameState
        {
            Status = GameStatus.Setup,
        };

        for (int i = 0; i < 10; i++)
        {
            string countryId = ((char)('A' + i)).ToString() + "AA";
            var faction = new Faction
            {
                Id = Guid.NewGuid(),
                Name = i == 0 ? "Human" : $"NPC {i}",
                Type = i == 0 ? FactionType.Human : FactionType.NPC,
                Color = "#123456",
                TurnPosition = i + 1,
            };
            game.Factions.Add(faction);
            game.Territories.Add(new Territory
            {
                CountryId = countryId,
                Name = $"Country {i}",
                Population = 1_000_000,
                SoldierValue = 1,
                OwnerFactionId = faction.Id,
                Soldiers = 1,
            });
        }

        return game;
    }
}

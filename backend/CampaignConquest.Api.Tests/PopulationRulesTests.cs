using Rules;

namespace CampaignConquest.Api.Tests;

public class PopulationRulesTests
{
    [Theory]
    [InlineData(1_000_000, 1)]
    [InlineData(5_000_000, 1)]
    [InlineData(10_000_000, 2)]
    [InlineData(25_000_000, 3)]
    [InlineData(50_000_000, 4)]
    [InlineData(75_000_000, 5)]
    [InlineData(100_000_000, 6)]
    [InlineData(125_000_000, 7)]
    [InlineData(150_000_000, 8)]
    [InlineData(150_000_001, 9)]
    public void CalculateSoldierValue_MatchesPopulationBands(long population, int expected)
    {
        Assert.Equal(expected, PopulationRules.CalculateSoldierValue(population));
    }

    [Theory]
    [InlineData(1, 2)]
    [InlineData(5, 2)]
    [InlineData(7, 3)]
    [InlineData(9, 4)]
    public void CalculateConquestReinforcements_UsesHalfRoundedDownWithFloorOfTwo(
        int soldierValue,
        int expected)
    {
        Assert.Equal(
            expected,
            PopulationRules.CalculateConquestReinforcements(soldierValue));
    }
}

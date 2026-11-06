using Enums;
using Models;
using Rules;
using Services;
using Xunit;

namespace CampaignConquest.Api.Tests;

public class CombatDiceRulesTests {

    [Fact]
    public void TwoVersusTwo_UsesUnsortedPairCompare_NotSortedHighLow() {

        var attacker = new List<int> { 6, 2 };
        var defender = new List<int> { 5, 6 };

        (int attackerLosses, int defenderLosses) = CombatDiceRules.ResolveCasualties(attacker, defender);

        // Unsorted pairs: 6>5 and 2<6 — sorted-high Risk rules would only cost the defender once.
        Assert.Equal(1, attackerLosses);
        Assert.Equal(1, defenderLosses);
    }

    [Fact]
    public void TwoVersusTwo_TiesDoNotKill() {

        var attacker = new List<int> { 4, 3 };
        var defender = new List<int> { 4, 3 };

        (int attackerLosses, int defenderLosses) = CombatDiceRules.ResolveCasualties(attacker, defender);

        Assert.Equal(0, attackerLosses);
        Assert.Equal(0, defenderLosses);
    }

    [Fact]
    public void OneVersusTwo_SingleDieComparedToDefenderMax() {

        var attacker = new List<int> { 3 };
        var defender = new List<int> { 1, 6 };

        (int attackerLosses, int defenderLosses) = CombatDiceRules.ResolveCasualties(attacker, defender);

        Assert.Equal(1, attackerLosses);
        Assert.Equal(0, defenderLosses);
    }

    [Fact]
    public void TwoVersusOne_AttackerMaxComparedToDefenderSingle() {

        var attacker = new List<int> { 2, 5 };
        var defender = new List<int> { 4 };

        (int attackerLosses, int defenderLosses) = CombatDiceRules.ResolveCasualties(attacker, defender);

        Assert.Equal(0, attackerLosses);
        Assert.Equal(1, defenderLosses);
    }
}

public class SequencedDiceRoller : IDiceRoller {

    private readonly Queue<int> _rolls;

    public SequencedDiceRoller(params int[] rolls) {
        _rolls = new Queue<int>(rolls);
    }

    public int RollD6() {

        if (_rolls.Count == 0) {
            throw new InvalidOperationException("No more scripted dice rolls");
        }

        return _rolls.Dequeue();
    }
}

public class CombatServiceTests {

    [Fact]
    public void ResolveNextRound_UsesInjectedDiceAndAppliesUnsortedTwoVersusTwo() {

        GameState game = BuildCombatScenario(attackerSoldiers: 2, defenderSoldiers: 2);
        CombatService combat = new(new SequencedDiceRoller(6, 6, 1, 1), new TurnService());

        combat.ResolveNextRound(game, game.CurrentFactionId!.Value);

        Assert.Null(game.ActiveCombat);
        Assert.Equal(2, game.Territories.Single(t => t.CountryId == "BBB").Soldiers);
        Assert.Single(game.ConqueredThisTurn);
        // Player chooses when to leave combat (Skip / Continue) — conquest does not auto-advance.
        Assert.Equal(TurnPhase.Combat, game.CurrentPhase);
    }

    private static GameState BuildCombatScenario(int attackerSoldiers, int defenderSoldiers) {

        Guid attackerId = Guid.NewGuid();
        Guid defenderId = Guid.NewGuid();

        GameState game = new() {
            Status = GameStatus.InProgress,
            CurrentFactionId = attackerId,
            CurrentPhase = TurnPhase.Combat,
            Factions =
            {
                new Faction { Id = attackerId, Name = "Player", Type = FactionType.Human },
                new Faction { Id = defenderId, Name = "NPC", Type = FactionType.NPC }
            },
            Territories =
            {
                new Territory {
                    CountryId = "AAA",
                    Name = "Source",
                    OwnerFactionId = attackerId,
                    Soldiers = 5,
                    SoldierValue = 3
                },
                new Territory {
                    CountryId = "BBB",
                    Name = "Target",
                    OwnerFactionId = defenderId,
                    Soldiers = defenderSoldiers,
                    SoldierValue = 2
                }
            },
            ActiveCombat = new CombatState {
                AttackerFactionId = attackerId,
                DefenderFactionId = defenderId,
                SourceCountryId = "AAA",
                DestinationCountryId = "BBB",
                AttackerSoldiers = attackerSoldiers,
                DefenderSoldiers = defenderSoldiers
            }
        };

        game.Territories[0].Soldiers = 3;

        return game;
    }
}

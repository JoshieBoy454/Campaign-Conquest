using Enums;
using Models;
using Services;
using Xunit;

namespace CampaignConquest.Api.Tests;

public class NpcDecisionPolicyTests {

    [Fact]
    public void PlayTurn_SkipsCombat_WhenCommitWouldNotExceedDefenders() {

        Guid npcId = Guid.NewGuid();
        Guid humanId = Guid.NewGuid();

        GameState game = new() {
            Status = GameStatus.InProgress,
            CurrentFactionId = npcId,
            CurrentPhase = TurnPhase.Combat,
            Version = 1,
            Factions = [
                new Faction {
                    Id = npcId,
                    Name = "NPC 1",
                    Type = FactionType.NPC,
                    Color = "#E7180B",
                    TurnPosition = 1,
                    TurnsPlayed = 1,
                },
                new Faction {
                    Id = humanId,
                    Name = "Player",
                    Type = FactionType.Human,
                    Color = "#1160BF",
                    TurnPosition = 2,
                    TurnsPlayed = 0,
                },
            ],
            Territories = [
                new Territory {
                    CountryId = "AAA",
                    Name = "Alpha",
                    Population = 1_000_000,
                    SoldierValue = 2,
                    OwnerFactionId = npcId,
                    Soldiers = 2,
                },
                new Territory {
                    CountryId = "BBB",
                    Name = "Beta",
                    Population = 1_000_000,
                    SoldierValue = 2,
                    OwnerFactionId = humanId,
                    Soldiers = 2,
                },
            ],
        };

        // Pad to 10 factions/territories required by later victory checks if EndTurn runs
        for (int i = 0; i < 8; i++) {
            Guid id = Guid.NewGuid();
            game.Factions.Add(new Faction {
                Id = id,
                Name = $"NPC {i + 2}",
                Type = FactionType.NPC,
                Color = "#000000",
                TurnPosition = i + 3,
                TurnsPlayed = 0,
                IsDefeated = true,
            });
            game.Territories.Add(new Territory {
                CountryId = $"X{i:00}",
                Name = $"Pad {i}",
                Population = 1000,
                SoldierValue = 1,
                OwnerFactionId = humanId,
                Soldiers = 1,
            });
        }

        TurnService turnService = new();
        CombatService combatService = new(new SequencedDiceRoller(6, 6, 6, 6), turnService);
        SimpleNpcDecisionPolicy policy = new();

        policy.PlayTurn(game, npcId, turnService, combatService);

        Assert.Null(game.ActiveCombat);
        Assert.NotEqual(TurnPhase.Combat, game.CurrentPhase);
    }

    [Fact]
    public void PlayTurn_Attacks_WhenFullCommitBeatsDefenders() {

        Guid npcId = Guid.NewGuid();
        Guid humanId = Guid.NewGuid();

        GameState game = new() {
            Status = GameStatus.InProgress,
            CurrentFactionId = npcId,
            CurrentPhase = TurnPhase.Combat,
            Version = 1,
            Factions = [
                new Faction {
                    Id = npcId,
                    Name = "NPC 1",
                    Type = FactionType.NPC,
                    Color = "#E7180B",
                    TurnPosition = 1,
                    TurnsPlayed = 2,
                },
                new Faction {
                    Id = humanId,
                    Name = "Player",
                    Type = FactionType.Human,
                    Color = "#1160BF",
                    TurnPosition = 2,
                    TurnsPlayed = 0,
                },
            ],
            Territories = [
                new Territory {
                    CountryId = "AAA",
                    Name = "Alpha",
                    Population = 1_000_000,
                    SoldierValue = 2,
                    OwnerFactionId = npcId,
                    Soldiers = 6,
                },
                new Territory {
                    CountryId = "BBB",
                    Name = "Beta",
                    Population = 1_000_000,
                    SoldierValue = 2,
                    OwnerFactionId = humanId,
                    Soldiers = 2,
                },
            ],
        };

        for (int i = 0; i < 8; i++) {
            Guid id = Guid.NewGuid();
            game.Factions.Add(new Faction {
                Id = id,
                Name = $"NPC {i + 2}",
                Type = FactionType.NPC,
                Color = "#000000",
                TurnPosition = i + 3,
                TurnsPlayed = 0,
                IsDefeated = true,
            });
            game.Territories.Add(new Territory {
                CountryId = $"X{i:00}",
                Name = $"Pad {i}",
                Population = 1000,
                SoldierValue = 1,
                OwnerFactionId = humanId,
                Soldiers = 1,
            });
        }

        TurnService turnService = new();
        // Enough dice for several rounds of 3v2.
        CombatService combatService = new(
            new SequencedDiceRoller(
                6, 6, 6, 1, 1,
                6, 6, 6, 1, 1,
                6, 6, 6, 1, 1
            ),
            turnService);
        SimpleNpcDecisionPolicy policy = new();

        NpcTurnResult result = policy.PlayTurn(game, npcId, turnService, combatService);

        Assert.Contains(result.Events, e => e.Type == "StartCombat");
        Assert.DoesNotContain(
            result.Events,
            e => e.Type == "SkipCombat" &&
                 e.Payload.GetType().GetProperty("reason")?.GetValue(e.Payload)?.ToString() == "tooWeak");
    }

    [Fact]
    public void PlayStep_StartsCombatWithoutResolvingRounds() {

        Guid npcId = Guid.NewGuid();
        Guid humanId = Guid.NewGuid();

        GameState game = new() {
            Status = GameStatus.InProgress,
            CurrentFactionId = npcId,
            CurrentPhase = TurnPhase.Combat,
            Version = 1,
            Factions = [
                new Faction {
                    Id = npcId,
                    Name = "NPC 1",
                    Type = FactionType.NPC,
                    Color = "#E7180B",
                    TurnPosition = 1,
                    TurnsPlayed = 1,
                },
                new Faction {
                    Id = humanId,
                    Name = "Player",
                    Type = FactionType.Human,
                    Color = "#1160BF",
                    TurnPosition = 2,
                    TurnsPlayed = 0,
                },
            ],
            Territories = [
                new Territory {
                    CountryId = "AAA",
                    Name = "Alpha",
                    Population = 1_000_000,
                    SoldierValue = 2,
                    OwnerFactionId = npcId,
                    Soldiers = 5,
                },
                new Territory {
                    CountryId = "BBB",
                    Name = "Beta",
                    Population = 1_000_000,
                    SoldierValue = 2,
                    OwnerFactionId = humanId,
                    Soldiers = 2,
                },
            ],
        };

        for (int i = 0; i < 8; i++) {
            Guid id = Guid.NewGuid();
            game.Factions.Add(new Faction {
                Id = id,
                Name = $"NPC {i + 2}",
                Type = FactionType.NPC,
                Color = "#000000",
                TurnPosition = i + 3,
                TurnsPlayed = 0,
                IsDefeated = true,
            });
            game.Territories.Add(new Territory {
                CountryId = $"X{i:00}",
                Name = $"Pad {i}",
                Population = 1000,
                SoldierValue = 1,
                OwnerFactionId = humanId,
                Soldiers = 1,
            });
        }

        TurnService turnService = new();
        CombatService combatService = new(new SequencedDiceRoller(6, 6, 6, 1, 1), turnService);
        SimpleNpcDecisionPolicy policy = new();

        NpcTurnResult step = policy.PlayStep(game, npcId, turnService, combatService);

        Assert.Contains(step.Events, e => e.Type == "StartCombat");
        Assert.DoesNotContain(step.Events, e => e.Type == "ResolveCombatRound");
        Assert.NotNull(game.ActiveCombat);
        Assert.Equal(TurnPhase.Combat, game.CurrentPhase);
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

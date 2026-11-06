using Enums;
using Models;
using Rules;

namespace Services;

// ---- Dice abstraction (tests inject sequences) ----
public interface IDiceRoller {
    int RollD6();
}

public class RandomDiceRoller : IDiceRoller {
    public int RollD6() => Random.Shared.Next(1, 7);
}

// ---- Combat rounds, retreat, skip ----
public class CombatService {

    private readonly IDiceRoller _dice;
    private readonly TurnService _turnService;

    public CombatService(IDiceRoller dice, TurnService turnService) {
        _dice = dice;
        _turnService = turnService;
    }

    public void StartCombat(
        GameState game,
        Guid factionId,
        string sourceCountryId,
        string destinationCountryId,
        int soldierCount) {

        Faction attacker = TurnService.RequireActiveFaction(game, factionId);

        if (game.CurrentPhase != TurnPhase.Combat) {
            throw new InvalidOperationException(
                "Combat can only start during the combat phase"
            );
        }

        if (game.ActiveCombat != null) {
            throw new InvalidOperationException(
                "Another combat is already in progress"
            );
        }

        if (game.ConqueredThisTurn.Count > 0) {
            throw new InvalidOperationException(
                "Only one conquest is allowed per turn"
            );
        }

        if (soldierCount <= 0) {
            throw new ArgumentOutOfRangeException(nameof(soldierCount));
        }

        Territory source = FindTerritory(game, sourceCountryId);
        Territory destination = FindTerritory(game, destinationCountryId);

        if (source.OwnerFactionId != factionId) {
            throw new InvalidOperationException(
                "The source territory must belong to the attacker"
            );
        }

        if (destination.OwnerFactionId == factionId) {
            throw new InvalidOperationException(
                "You cannot attack your own territory"
            );
        }

        Guid defenderFactionId = destination.OwnerFactionId;

        if (game.Factions.Any(f => f.Id == defenderFactionId && f.IsDefeated)) {
            throw new InvalidOperationException(
                "The defender is defeated"
            );
        }

        if (source.Soldiers - soldierCount < 1) {
            throw new InvalidOperationException(
                "At least 1 soldier must remain in the source country"
            );
        }

        if (destination.Soldiers < 1) {
            throw new InvalidOperationException(
                "The destination has no defenders"
            );
        }

        source.Soldiers -= soldierCount;

        game.LastResolvedCombat = null;
        game.ActiveCombat = new CombatState {
            AttackerFactionId = attacker.Id,
            DefenderFactionId = defenderFactionId,
            SourceCountryId = source.CountryId,
            DestinationCountryId = destination.CountryId,
            AttackerSoldiers = soldierCount,
            DefenderSoldiers = destination.Soldiers,
            RoundNumber = 0,
        };

        game.Version++;
    }

    /// <summary>
    /// Resolves one exchange. Returns a snapshot of the round result even when
    /// ActiveCombat is cleared by conquest / wipe (for log + commentary).
    /// </summary>
    public CombatState ResolveNextRound(GameState game, Guid factionId) {

        TurnService.RequireActiveFaction(game, factionId);

        CombatState combat = RequireActiveCombat(game);

        if (combat.AttackerFactionId != factionId) {
            throw new InvalidOperationException(
                "Only the attacker can roll combat dice"
            );
        }

        combat.RoundNumber += 1;

        // Attacker up to 3 dice, defender up to 2 (Risk-style).
        int attackerDiceCount = Math.Min(3, combat.AttackerSoldiers);
        int defenderDiceCount = Math.Min(2, combat.DefenderSoldiers);

        List<int> attackerRolls = RollMany(attackerDiceCount);
        List<int> defenderRolls = RollMany(defenderDiceCount);

        (int attackerLosses, int defenderLosses) = CombatDiceRules.ResolveCasualties(attackerRolls, defenderRolls);

        combat.AttackerSoldiers -= attackerLosses;
        combat.DefenderSoldiers -= defenderLosses;

        combat.LastAttackerDice = attackerRolls;
        combat.LastDefenderDice = defenderRolls;
        combat.LastAttackerLosses = attackerLosses;
        combat.LastDefenderLosses = defenderLosses;

        CombatState snapshot = CloneCombat(combat);
        game.LastResolvedCombat = snapshot;

        if (combat.DefenderSoldiers <= 0) {
            CompleteConquest(game, combat);
            return snapshot;
        }

        if (combat.AttackerSoldiers <= 0) {
            FailCombat(game, combat);
            return snapshot;
        }

        game.Version++;
        return snapshot;
    }

    private static CombatState CloneCombat(CombatState combat) => new() {
        AttackerFactionId = combat.AttackerFactionId,
        DefenderFactionId = combat.DefenderFactionId,
        SourceCountryId = combat.SourceCountryId,
        DestinationCountryId = combat.DestinationCountryId,
        AttackerSoldiers = combat.AttackerSoldiers,
        DefenderSoldiers = combat.DefenderSoldiers,
        RoundNumber = combat.RoundNumber,
        LastAttackerDice = [.. combat.LastAttackerDice],
        LastDefenderDice = [.. combat.LastDefenderDice],
        LastAttackerLosses = combat.LastAttackerLosses,
        LastDefenderLosses = combat.LastDefenderLosses,
    };

    public void Retreat(GameState game, Guid factionId) {

        TurnService.RequireActiveFaction(game, factionId);

        CombatState combat = RequireActiveCombat(game);

        if (combat.AttackerFactionId != factionId) {
            throw new InvalidOperationException(
                "Only the attacker can retreat"
            );
        }

        Territory source = FindTerritory(game, combat.SourceCountryId);
        source.Soldiers += combat.AttackerSoldiers;

        game.ActiveCombat = null;
        game.Version++;
    }

    public void SkipCombat(GameState game, Guid factionId) {

        TurnService.RequireActiveFaction(game, factionId);

        if (game.CurrentPhase != TurnPhase.Combat) {
            throw new InvalidOperationException(
                "Skip combat is only valid during the combat phase"
            );
        }

        if (game.ActiveCombat != null) {
            throw new InvalidOperationException(
                "Retreat or finish the current combat before skipping"
            );
        }

        game.LastResolvedCombat = null;
        _turnService.FinishCombatPhase(game, factionId);
    }

    private void CompleteConquest(GameState game, CombatState combat) {

        Territory source = FindTerritory(game, combat.SourceCountryId);
        Territory destination = FindTerritory(game, combat.DestinationCountryId);

        destination.OwnerFactionId = combat.AttackerFactionId;
        destination.Soldiers = Math.Max(1, combat.AttackerSoldiers);

        if (!game.ConqueredThisTurn.Contains(destination.CountryId, StringComparer.OrdinalIgnoreCase)) {
            game.ConqueredThisTurn.Add(destination.CountryId);
        }

        ApplyDefeatChecks(game);

        game.ActiveCombat = null;
        game.Version++;

        _turnService.CheckForVictory(game);

        // Stay in Combat phase so the player can attack again or leave via Skip combat.
        // Retreat only ends the engagement; FinishCombatPhase is player/NPC SkipCombat.
    }

    private static void FailCombat(GameState game, CombatState combat) {

        Territory destination = FindTerritory(game, combat.DestinationCountryId);
        destination.Soldiers = Math.Max(1, combat.DefenderSoldiers);

        game.ActiveCombat = null;
        game.Version++;
    }

    private static void ApplyDefeatChecks(GameState game) {

        foreach (Faction faction in game.Factions) {

            if (!game.Territories.Any(t => t.OwnerFactionId == faction.Id)) {
                faction.IsDefeated = true;
            }
        }
    }

    private List<int> RollMany(int count) {

        List<int> rolls = new(count);

        for (int i = 0; i < count; i++) {
            rolls.Add(_dice.RollD6());
        }

        return rolls;
    }

    private static CombatState RequireActiveCombat(GameState game) {

        return game.ActiveCombat ?? throw new InvalidOperationException(
            "There is no active combat"
        );
    }

    private static Territory FindTerritory(GameState game, string countryId) {

        return game.Territories.FirstOrDefault(t =>
            string.Equals(t.CountryId, countryId, StringComparison.OrdinalIgnoreCase))
            ?? throw new ArgumentException(
                $"The country '{countryId}' is not an active territory",
                nameof(countryId));
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

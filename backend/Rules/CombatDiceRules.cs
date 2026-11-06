namespace Rules;

// ---- D6 comparison rules (unsorted 2v2, single vs max for 1v2/2v1) ----
public static class CombatDiceRules {

    public static (int AttackerLosses, int DefenderLosses) ResolveCasualties(
        IReadOnlyList<int> attackerRolls,
        IReadOnlyList<int> defenderRolls) {

        if (attackerRolls.Count == 0 || defenderRolls.Count == 0) {
            return (0, 0);
        }

        int attackerLosses = 0;
        int defenderLosses = 0;

        if (attackerRolls.Count == 2 && defenderRolls.Count == 2) {

            CompareRolls(attackerRolls[0], defenderRolls[0], ref attackerLosses, ref defenderLosses);
            CompareRolls(attackerRolls[1], defenderRolls[1], ref attackerLosses, ref defenderLosses);
        }
        else if (attackerRolls.Count == 1 && defenderRolls.Count == 2) {

            CompareRolls(attackerRolls[0], defenderRolls.Max(), ref attackerLosses, ref defenderLosses);
        }
        else if (attackerRolls.Count == 2 && defenderRolls.Count == 1) {

            CompareRolls(attackerRolls.Max(), defenderRolls[0], ref attackerLosses, ref defenderLosses);
        }
        else {

            CompareRolls(attackerRolls[0], defenderRolls[0], ref attackerLosses, ref defenderLosses);
        }

        return (attackerLosses, defenderLosses);
    }

    private static void CompareRolls(
        int attackerRoll,
        int defenderRoll,
        ref int attackerLosses,
        ref int defenderLosses) {

        if (attackerRoll > defenderRoll) {
            defenderLosses++;
        }
        else if (defenderRoll > attackerRoll) {
            attackerLosses++;
        }
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

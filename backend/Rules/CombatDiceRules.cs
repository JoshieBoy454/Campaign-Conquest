namespace Rules;

// ---- D6 comparison (Risk-style: sort high→low, pair up to min count) ----
public static class CombatDiceRules {

    public static (int AttackerLosses, int DefenderLosses) ResolveCasualties(
        IReadOnlyList<int> attackerRolls,
        IReadOnlyList<int> defenderRolls) {

        if (attackerRolls.Count == 0 || defenderRolls.Count == 0) {
            return (0, 0);
        }

        List<int> attacker = attackerRolls.OrderByDescending(r => r).ToList();
        List<int> defender = defenderRolls.OrderByDescending(r => r).ToList();

        int attackerLosses = 0;
        int defenderLosses = 0;
        int pairs = Math.Min(attacker.Count, defender.Count);

        for (int i = 0; i < pairs; i++) {
            CompareRolls(attacker[i], defender[i], ref attackerLosses, ref defenderLosses);
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

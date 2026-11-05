namespace Rules;

// -----------------------------------------------------------------------------
// Class: PopulationRules
// This class is used to create the reules that will calculate the soldier values based on population count,
// aswell as the reinforcement amounts after conqoring a country
// -----------------------------------------------------------------------------
public static class PopulationRules {

    // Calc soldier value pased on population
    public static int CalculateSoldierValue (int population) {

        // Checks if population is a valid number, greater than 0 then throws an exception if not
        if(population < 0) {
            throw new ArgumentOutOfRangeException(
                nameof(population),
                "Polulation cannot be negative"
            );
        }

        // Determines the soldier count using the population value
        if(population <= 5000000)
            return 1;

        if(population <= 10000000)
            return 2;

        if (population <= 25000000)
            return 3;

        if (population <= 50000000)
            return 4;

        if (population <= 75000000)
            return 5;

        if (population <= 100000000)
            return 6;

        if (population <= 125000000)
            return 7;

        if (population <= 150000000)
            return 8;

        return 9;
    }
    // Calc soldier value after conqoring a country
    public static int CalculateConquestReinforcements (int soldierValue) {

        if (soldierValue < 1 || soldierValue > 9)
        {
            // Checks validation of soldier value and throws exception if invaluid
            throw new ArgumentOutOfRangeException(
                nameof(soldierValue),
                "soldier value must be between 1-9"
            );
        }

        return Math.Max(2, soldierValue/2);

    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
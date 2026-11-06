using Enums;
using Models;
using Rules;
using System.Security.Cryptography;

namespace Services;

// -----------------------------------------------------------------------------
// Class: GameInitializationService
// Creates the factions and assigns starting countries, country colors, roll turn order and then initiates the first turn
// -----------------------------------------------------------------------------
public class GameInitializationService {

    private readonly TurnService _turnService;

    // Unique map color for each each faction
    private static readonly string[] FactionColors = {

        "#1160BF", // Players
        "#E7180B", // NPC 1
        "#E1712B", // NPC 2
        "#5EA529", // NPC 3
        "#2D9966", // NPC 4 
        "#2C92B8", // NPC 5
        "#155DFC", // NPC 6
        "#7F22FE", // NPC  7
        "#C81CDE", // NPC 8
        "#E61876" // NPC 9

    };

    // -----------------------------------------------------------------------------
    // Constructor: GameInitializationService
    // Recieves the turn service through a dependancy injection
    // -----------------------------------------------------------------------------
    public GameInitializationService(TurnService turnService) {

        _turnService = turnService;
    }

    // -----------------------------------------------------------------------------
    // Method: CreateGame
    // Create the factions?players and assigns their countries and turn orders
    // -----------------------------------------------------------------------------
    public GameInitializationResult CreateGame(string selectedCountryId, IReadOnlyCollection<CountryDefinition> countries) {

        ArgumentNullException.ThrowIfNull(countries);

        // Checks if country is slected or not throws exception if not
        if (string.IsNullOrWhiteSpace(selectedCountryId)) {
            throw new ArgumentException(
                "A starting country must be selected",
                nameof(selectedCountryId)
            );
        }

        // Checks if a minimum 10 countries are available if not throws exception
        if (countries.Count < 10) {
            throw new ArgumentException(
                "At least 10 countries must be available",
                nameof(countries)
            );
        }

        // Validates country catalogue
        if (countries.Any(c =>string.IsNullOrWhiteSpace(c.CountryId) ||string.IsNullOrWhiteSpace(c.Name) ||c.Population < 0)) {
            throw new ArgumentException(
                "The country catalogue contains invalid data",
                nameof(countries)
            );
        }

        // checks ISO country identifiers that must be unique.
        if (countries.Select(c => c.CountryId).Distinct(StringComparer.OrdinalIgnoreCase).Count() != countries.Count) {
            throw new ArgumentException(
                "Country identifiers must be unique",
                nameof(countries)
            );
        }

        // Find the Country seleted by teh human and validadets whether its avalabe or not
        CountryDefinition selectedCountry = countries.SingleOrDefault(c => string.Equals(c.CountryId, selectedCountryId, StringComparison.OrdinalIgnoreCase)) ??
                                                                                                                            throw new ArgumentException(
                                                                                                                                "The Selected country is not available",
                                                                                                                                nameof(selectedCountryId)
                                                                                                                            );
        // Create the game with the status set to initialising
        GameState game = new() {

            Status = GameStatus.Initialising
        };

        // Creates the human faction
        Faction human = CreateFaction("Player", FactionType.Human, FactionColors[0]);

        game.Factions.Add(human);

        game.Territories.Add(CreateTerritory(selectedCountry, human.Id));

        // Create a list of every country excluding the players chosen country
        List<CountryDefinition> availableCountries = countries.Where(c => !string.Equals(c.CountryId, selectedCountry.CountryId, StringComparison.OrdinalIgnoreCase)).ToList();

        // Assign the randoms contries to the turn positions
        for (int i = 0; i < 9; i++) {
            int randomIndex = RandomNumberGenerator.GetInt32(i, availableCountries.Count);

            (availableCountries[i], availableCountries[randomIndex]) = (availableCountries[randomIndex], availableCountries[i]);
        };

        // Creates the NPC objects
        for (int i = 0; i < 9; i++) {

            Faction npc = CreateFaction($"NPC {i + 1}", FactionType.NPC, FactionColors[i + 1]);

            // Assigns a territory to the npc's
            game.Factions.Add(npc);
            game.Territories.Add(CreateTerritory(availableCountries[i], npc.Id));
        };

        // Roll teh first D20 for the turn order
        List<TurnOrderRoll> diceResults = new();

        List<Faction> orderedFactions = ResolveTurnOrder(game.Factions, diceResults, 1);

        for (int i = 0; i < orderedFactions.Count; i++) {

            orderedFactions[i].TurnPosition = i + 1;
        }

        // Starts the first factions turn
        _turnService.StartGame(game);

        return new GameInitializationResult(game, diceResults);
    }

    // -----------------------------------------------------------------------------
    // Method: CreateFaction
    // This method creates a faction with its identifying info
    // -----------------------------------------------------------------------------
    public static Faction CreateFaction(string name, FactionType type, string color) {

        return new Faction {
            Name = name,
            Type = type,
            Color = color,
            TurnsPlayed = 0,
            IsDefeated = false
        };
    }
    
    // -----------------------------------------------------------------------------
    // Method: CreateTerritory
    // converts the country reference data to an active game territory/Country
    // -----------------------------------------------------------------------------
    public static Territory CreateTerritory(CountryDefinition country, Guid factionId) {
        
        int soldierValue = PopulationRules.CalculateSoldierValue(country.Population);

        return new Territory {

            CountryId = country.CountryId,
            Name = country.Name,
            Population = country.Population,

            // Fixed population-based value
            SoldierValue = soldierValue,

            // The faction that owns this territory
            OwnerFactionId = factionId,

            // Initial army equals the countrys soldier value
            Soldiers = soldierValue
        };
    }

    // -----------------------------------------------------------------------------
    // Method: ResolveTurnOrder
    // Rolls a D20 for each faction to resolve their turn order, ties are broken by another D20 roll between those factions/players
    // -----------------------------------------------------------------------------
    public static List<Faction> ResolveTurnOrder(IEnumerable<Faction> factions, List<TurnOrderRoll> diceResults, int rollStage) {

        List<(Faction Faction, int Roll)> rolls = new();

        // Roll once for each faction
        foreach (Faction faction in factions) {

            int roll = RandomNumberGenerator.GetInt32(1, 21);

            rolls.Add((faction, roll));

            // Retains the result
            diceResults.Add(new TurnOrderRoll(faction.Id, roll, rollStage));
        }

        List<Faction> orderedFactions = new();

        foreach (var group in rolls.GroupBy(result => result.Roll).OrderByDescending(group => group.Key)) {

            List<Faction> tiedFactions = group.Select(result => result.Faction).ToList();

            if (tiedFactions.Count == 1){

                // No tie: faction's position is determined
                orderedFactions.Add(tiedFactions[0]);
            }
            else{

                // Only the tied factions roll again
                List<Faction> resolvedTie = ResolveTurnOrder(tiedFactions, diceResults, rollStage + 1);

                orderedFactions.AddRange(resolvedTie);
            }
        }
        return orderedFactions;
    }
}


//-----------------------------------------------------------------End of File----------------------------------------------------------------->
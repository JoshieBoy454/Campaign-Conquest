using Enums;
using Models;
using Rules;

namespace Services;

// -----------------------------------------------------------------------------
// Class: TurnService
// Manages the turn cycle, reinforcement allocation, troop movement, faction rotation and detects victory conditions.
// -----------------------------------------------------------------------------
public class TurnService {

    // -----------------------------------------------------------------------------
    // Method: StartGame
    // Starts a game a begins the first faction/players turn
    // Validation checks to ensure everything is in order when the game starts 
    // -----------------------------------------------------------------------------
    public void StartGame (GameState game) {
        ArgumentNullException.ThrowIfNull(game);

        // Chekcs what state the game is in to see if that game is already in progerss when creating a new game 
        if (game.Status != GameStatus.Setup && game.Status != GameStatus.Initialising) {
            throw new InvalidOperationException (
                "This game has already Started/Finished"
            );
        }

        // Checks how many countries and players there are and throws an excpetion if the count is invalid
        if (game.Factions.Count != 10 || game.Territories.Count != 10) {
            throw new InvalidOperationException (
                "A game require 10 countires/territoreis and factions/players"
            );
        }

        // Checks how many humans are present in the game
        if (game.Factions.Count(f => f.Type == FactionType.Human) != 1) {
            throw new InvalidOperationException (
              "A game can only have 1 human player"  
            );
        }
        
        // Checks the turn positions and unsures they are all a unique value between 1 and 10
        var positions = game.Factions.Select(f => f.TurnPosition).OrderBy(position => position);
       
        if (!positions.SequenceEqual(Enumerable.Range(1, 10))) {
            throw new InvalidOperationException (
                "Faction turn positions must be a unique value from 1-10"
            );
        }

         // checks if faction and country id are unique or thows an exception
        if (game.Factions.Select(f => f.Id).Distinct().Count() != 10 || game.Territories.Select(t => t.CountryId).Distinct(StringComparer.OrdinalIgnoreCase).Count() != 10 ||
            game.Territories.Any(t => string.IsNullOrWhiteSpace(t.CountryId))) {
            throw new InvalidOperationException(
                "Faction and country IDs must all be unique and valid."
            );
        }

        //checks if a player has a country or throws an exception
        if (game.Factions.Any(f => game.Territories.Count(t => t.OwnerFactionId == f.Id) != 1)) {
            throw new InvalidOperationException (
                "Each Faction/Player must start with a territory/county"
            );
        }

        // Chekcs if a territory/country has less than 1 or more than 9 soldier when game starts or throws an exception
        if (game.Territories.Any(t => t.Soldiers < 1 || t.SoldierValue < 1 || t.SoldierValue > 9)) {
            throw new InvalidOperationException (
                " All Starting territories/Contries must have a valid army/soldier count"
            );
        }

        if(game.Territories.Any(t => t.Soldiers != t.SoldierValue)) {
            throw new InvalidOperationException(
                " Starting army my equal its territories soldier value"
            );
        }

        // Resets the turn tracking for a new game to start
        foreach (var faction in game.Factions) {
            faction.TurnsPlayed = 0;
            faction.IsDefeated = false;
        }

        game.Status = GameStatus.InProgress;
        game.Round = 1;
        game.WinnerFactionId = null;

        // Ensure the faction/player in turn 1 starts teh game
        Faction firstFaction = game.Factions.Single(f => f.TurnPosition == 1);
        BeginFactionTurn(game, firstFaction);

        // increments the Version for database
        game.Version++;
    }

    // -----------------------------------------------------------------------------
    // Method: AdvancePhase
    // This method advances turn phases and enforces conditions that enable turn phase advancement
    // -----------------------------------------------------------------------------
    public void AdvancePhase (GameState game, Guid factionId) {

        Faction currentFaction = RequireActiveFaction(game, factionId);

        switch (game.CurrentPhase)
        {
            case TurnPhase.Upkeep:

                game.CurrentPhase = TurnPhase.ReinforcementOne;
                break;

            case TurnPhase.ReinforcementOne:

                // All soldier must be alocated before the phase can pass
                RequireEmptyReinforcementPool(game);
                game.CurrentPhase = TurnPhase.Combat;
                break;

            case TurnPhase.Combat:

                // The game will turn this phase for you if you skip combat or retreat or end combat
                EnterReinforcementTwo(game, currentFaction);
                break;

            case TurnPhase.ReinforcementTwo:

                RequireEmptyReinforcementPool(game);
                game.CurrentPhase = TurnPhase.EndTurn;
                break;

            case TurnPhase.EndTurn:

                if (CheckForVictory(game)) {
                    return;
                }
                MoveToNextFaction(game, currentFaction);
                break;

            default: 
                
                throw new InvalidOperationException (
                    "The current turn phase is invalid"
                );
        }
        game.Version++;
    }

    // -----------------------------------------------------------------------------
    // Method: AllocateReinforcements
    // This methods changes the countries/territories army/soldier count when a a reinforcemtn is made from teh reinforcement pool
    // It runs validation checks to make sure the the game phase and country/territory is correct before the reinforcement is made
    // -----------------------------------------------------------------------------
    public void AllocateReinforcements (GameState game, Guid factionId, string countryId, int soldierCount) {

        RequireActiveFaction (game, factionId);

        // Makes sure the current phase is either reinforcement 1 or reinforcement 2 where troops can be allocated otherwise throws exception
        if (game.CurrentPhase != TurnPhase.ReinforcementOne && game.CurrentPhase != TurnPhase.ReinforcementTwo) {
            throw new InvalidOperationException (
                "Soldier can only be allocated during a reinforcement phase"
            );
        }

        // Checks if the amount of soilder being moved from the pool is valid
        if (soldierCount <= 0 || soldierCount > game.ReinforcementPool) {
            throw new ArgumentOutOfRangeException(
                nameof(soldierCount), "Invalid reinforcement amount"
            );
        }

        Territory territory = FindTerritory(game, countryId);

        // Checks if the territory/country youre trying to reinforce is owned by you otherwise throws an acception
        if (territory.OwnerFactionId != factionId) {
            throw new InvalidOperationException (
                "You cannot reinforce a territory you do not own"
            );
        }
        // Transfer happens here the territory/countires soilders are incremented and it deducts from the reinforcement pool
        territory.Soldiers += soldierCount;
        game.ReinforcementPool -= soldierCount;

        game.Version++;
    }

    // -----------------------------------------------------------------------------
    // Method: TransferSoldiers
    // This method handels the transfering of soldiers from one country/territory to another
    // -----------------------------------------------------------------------------
    public void TransferSoldiers (GameState game, Guid factionId, string sourceCountryId, string destinationCountryId, int soldierCount) {

        RequireActiveFaction(game, factionId);

        // Validates the current phase is in reinforcement 1 or 2 otherwise throws exception
        if (game.CurrentPhase != TurnPhase.ReinforcementOne && game.CurrentPhase != TurnPhase.ReinforcementTwo) {
            throw new InvalidOperationException (
                "Soldiers can only be transfered during a reinforcement phase"
            );
        }

        // Validates that the soilder count is more than 1 otherwise throws an exception
        if (soldierCount <= 0) {
            throw new ArgumentOutOfRangeException(nameof(soldierCount));
        }

        // Validates that the origin country and distination country are not the same
        if (string.Equals(sourceCountryId, destinationCountryId, StringComparison.OrdinalIgnoreCase)) {
            throw new InvalidOperationException (
                "The Source and destination country cannot be the same"
            );
        }

        Territory source = FindTerritory(game, sourceCountryId);
        Territory destination = FindTerritory(game, destinationCountryId);

        // Checks if the player/faction owns the source and destination country/territory otherwise throws an exception
        if (source.OwnerFactionId != factionId || destination.OwnerFactionId != factionId) {
            throw new InvalidOperationException (
                "Both territories must belong to you"
            );
        }
        // Checks that atleast 1 soldier remains during the transfer otherwise throws exception
        if (source.Soldiers - soldierCount < 1) {
            throw new InvalidOperationException (
                "Atleast 1 soldier must remain in the country of origin"
            );
        }

        // Transfer happens here
        source.Soldiers -= soldierCount;
        destination.Soldiers += soldierCount;

        game.Version++;
    }

    // -----------------------------------------------------------------------------
    // Method: CheckForVictory
    // Runs multiple checks to declare the winner
    // -----------------------------------------------------------------------------
    public bool CheckForVictory (GameState game) {

        ArgumentNullException.ThrowIfNull(game);

        if (game.Status == GameStatus.Finished) {
            return true;
        }

        if (game.Status != GameStatus.InProgress) {
            return false;
        }

        if (game.Territories.Count != 10) {
            return false;
        }

        Guid possibleWinnerId = game.Territories[0].OwnerFactionId;

        // Check if any territory has a different owner, if true no winner returns false
        if (game.Territories.Any(t => t.OwnerFactionId != possibleWinnerId)) {
            return false;
        }

        if (!game.Factions.Any(f => f.Id == possibleWinnerId)) {
            throw new InvalidOperationException (
                "The winning Country owner is not a valid faction"
            );
        }
        
        // Decalres the winner
        game.WinnerFactionId = possibleWinnerId;
        game.Status = GameStatus.Finished;
        game.CurrentPhase = TurnPhase.EndTurn;
        game.ReinforcementPool = 0;

        foreach (var faction in game.Factions){

            faction.IsDefeated = faction.Id != possibleWinnerId;
        }
        
        game.Version++;

        return true;
    }


    // -----------------------------------------------------------------------------
    // Method: BeginFactionTurn
    // Sets up a faction/players new turn and calculates their upkeep
    // -----------------------------------------------------------------------------
    private static void BeginFactionTurn (GameState game, Faction faction) {

        game.CurrentFactionId = faction.Id;
        game.CurrentPhase = TurnPhase.Upkeep;

        // Clear the data from the previous turn
        game.ReinforcementPool = 0;
        game.ConqueredThisTurn.Clear();

        faction.TurnsPlayed++;

        // Makes sure theres no Upkeep step on each player/factions first turn
        // then adds to the reinforcement pool 2 * the amount of territories the player/faction controls
        if (faction.TurnsPlayed > 1) {
            
            int territoryCount = game.Territories.Count(t => t.OwnerFactionId == faction.Id);

            game.ReinforcementPool = territoryCount * 2;
        }
    }

    // -----------------------------------------------------------------------------
    // Method: EnterReinforcementTwo
    // The amount of soldiers a player/faction earns after conquoring a country
    // -----------------------------------------------------------------------------
    private static void EnterReinforcementTwo(GameState game, Faction faction) {

        //Checks if more than 1 country was conquered this turn if true thows an exception
        if(game.ConqueredThisTurn.Count > 1) {
            throw new InvalidOperationException(
                " Only 1 Territory can be conquered per turn"
            );
        }

        int earnedSoldiers = 0;

        if (game.ConqueredThisTurn.Count == 1) {

            string conqueredCountryId = game.ConqueredThisTurn[0];

            Territory conqueredTerritory = FindTerritory(game, conqueredCountryId);

            if(conqueredTerritory.OwnerFactionId != faction.Id) {
                throw new InvalidOperationException (
                    "The conquered territory must belong to the target faction"
                );
            }

            earnedSoldiers = PopulationRules.CalculateConquestReinforcements(conqueredTerritory.SoldierValue);
        }

        // Soldiers gained from conquering a territory are added to the : ReinforcementPool
        game.ReinforcementPool = earnedSoldiers;
        game.CurrentPhase = TurnPhase.ReinforcementTwo;
    }

    // -----------------------------------------------------------------------------
    // Method: MoveToNextFaction
    // This method checks id a faction/player is defeated so it can skip their turn in the turn order
    // -----------------------------------------------------------------------------
    private static void MoveToNextFaction(GameState game, Faction currentFaction) {

        // This marks factions/players without any territories/countries left as defeated
        foreach (var faction in game.Factions) {
            
            if (!game.Territories.Any(t => t.OwnerFactionId == faction.Id)) {

                faction.IsDefeated = true;
            };
        }

        // Creates a count of the number of acive factions/players there are in the game
        var activeFactions = game.Factions.Where(f => !f.IsDefeated).OrderBy(f => f.TurnPosition).ToList();

        // Checks if the number of active faction/players is 0 if true throws an exception
        if (activeFactions.Count == 0) {
            throw new InvalidOperationException(
                "There are no remaining active factions"
            );
        }

        // Finds the nect active faction/Player
        Faction nextFaction = activeFactions.FirstOrDefault (f => f.TurnPosition > currentFaction.TurnPosition) ?? activeFactions[0];

        // If the turn positions do a full circle 1-10,1,2,3 etc. then increment the game round
        if (nextFaction.TurnPosition <= currentFaction.TurnPosition) {
            
            game.Round++;
        }

        BeginFactionTurn(game, nextFaction);
    }

    // -----------------------------------------------------------------------------
    // Method: RequireActiveFaction
    // This makes sure that the action belongs to the players whose turn it is currently
    // -----------------------------------------------------------------------------
    public static Faction RequireActiveFaction (GameState game, Guid factionId) {

        ArgumentNullException.ThrowIfNull(game);

        // Checks if the game state is not in progress otherwhise throws an exception
        if (game.Status != GameStatus.InProgress) {
            throw new InvalidOperationException (
                " The game is not in progress"
            );
        }

        // Checks if the 2 faction Id's match otherwise throws an exception
        if (game.CurrentFactionId != factionId) {
            throw new InvalidOperationException (
                "This action cannot be made as it is not this players turn"
            );
        }

        return game.Factions.Single(f => f.Id == factionId);
    }

    // -----------------------------------------------------------------------------
    // Method: FindTerritory
    // Find if a territory/country is active 
    // -----------------------------------------------------------------------------
    private static Territory FindTerritory(GameState game, string countryId) {

        return game.Territories.FirstOrDefault(t => string.Equals(t.CountryId, countryId, StringComparison.OrdinalIgnoreCase)) ?? throw new ArgumentException(
                                                                                                                                        $" The country '{countryId}' is not an active territory",
                                                                                                                                        nameof(countryId));
    }

    // -----------------------------------------------------------------------------
    // Method: RequireEmptyReinforcementPool
    // Makes sure that teh reinforcement pool is empty before the player can continue their phase
    // -----------------------------------------------------------------------------
    private static void RequireEmptyReinforcementPool(GameState game) {

        if (game.ReinforcementPool != 0) {
            throw new InvalidOperationException(
                "All remaining soldiers must be allcated before you can advance"
            );
        }
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
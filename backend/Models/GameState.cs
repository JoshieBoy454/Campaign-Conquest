using Enums;
using MongoDB.Bson.Serialization.Attributes;

namespace Models;

// -----------------------------------------------------------------------------
// Class: GameState
// Reperesetns the game state of a single game, updated as human players and npc's make game actions
// -----------------------------------------------------------------------------
public class GameState {

    // will be used to track the current game session
    // TODO
    [BsonId]
    public Guid Id {get; set;} = Guid.NewGuid();

    // Indicates the state that the game is currently in
    public GameStatus Status {get; set;} = GameStatus.Setup;

    // A list of the participating players of the game called factions, 10 per game
    public List<Faction> Factions {get; set;} = new();

    // A list of teh participating countries in a game, 10 per game
    public List<Territory> Territories {get; set;} = new();

    // the current faction/player busy taking their turn
    public Guid? CurrentFactionId {get; set;}

    // Indicated the phase of the active faction/players turn
    public TurnPhase CurrentPhase {get; set;} = TurnPhase.Upkeep;

    // Number of completed turn cycles
    public int Round {get; set;} = 1;

    // these are the soldiers given at upkeep to be distributed by the player
    public int ReinforcementPool {get; set;}

    // used to determine what country was conqered in a turn
    // used to determine how many soldier to give in Upkeep 2
    public List<string> ConqueredThisTurn {get; set;} = new();

    //  the id of the winnnig faction, null until winner
    public Guid? WinnerFactionId {get; set;}

    // used for used to prevent database conflict increments with the game state to ensure spectator synchronisation
    public long Version {get; set;}

    // ---- Ongoing combat (null when not fighting) ----
    public CombatState? ActiveCombat { get; set; }

    // ---- NPC autoplay delay multiplier (1 = normal) ----
    public int NpcSpeed { get; set; } = 1;
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
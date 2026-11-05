using Enums;

namespace Models;

// -----------------------------------------------------------------------------
// Class: Faction
// This class will represent 1 player/participant during the game for a total of 10 including the human player
// -----------------------------------------------------------------------------
public class Faction {

    public Guid Id {get; set;} = Guid.NewGuid();

    public string Name {get; set;} = string.Empty;

    // 1 or 0, human or npc
    public FactionType Type {get; set;}

    // color of players territory
    public string Color {get; set;} = "#FFFFFF";

    //what position they are in the turn order 1-10 determined by d20
    public int TurnPosition {get; set;}

    // How many turns they played
    public int TurnsPlayed {get; set;}

    // if they are alive or not
    public bool IsDefeated {get; set;}

}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
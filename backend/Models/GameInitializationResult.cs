namespace Models;

// -----------------------------------------------------------------------------
// Record: GameInitializationResult
// To determine the game state and the results of the rolls for turn orders
// -----------------------------------------------------------------------------

public record GameInitializationResult (
    GameState Game,
    List<TurnOrderRoll> TurnOrderRolls
);

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
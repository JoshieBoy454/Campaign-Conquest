namespace Models;

// -----------------------------------------------------------------------------
// Record: TurnOrderRoll
// This is record an individual player/factions roll to be usedin the visual dice roll and during turn order selection
// -----------------------------------------------------------------------------
public record TurnOrderRoll (
    Guid FactionId,
    int Roll,
    int RollStage
);
//-----------------------------------------------------------------End of File----------------------------------------------------------------->
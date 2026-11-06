namespace Models;

// ---- Active combat snapshot (soldiers committed off the map) ----
public class CombatState {

    public Guid AttackerFactionId { get; set; }

    public Guid DefenderFactionId { get; set; }

    public string SourceCountryId { get; set; } = string.Empty;

    public string DestinationCountryId { get; set; } = string.Empty;

    public int AttackerSoldiers { get; set; }

    public int DefenderSoldiers { get; set; }

    public List<int> LastAttackerDice { get; set; } = new();

    public List<int> LastDefenderDice { get; set; } = new();

    public int LastAttackerLosses { get; set; }

    public int LastDefenderLosses { get; set; }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

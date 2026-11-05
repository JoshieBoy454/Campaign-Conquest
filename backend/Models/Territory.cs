namespace Models;

// -----------------------------------------------------------------------------
// Class: Territory
// Represent the active countries currently in play as there can only be 10 active on the map
// -----------------------------------------------------------------------------
public class Territory {

    // Countries ISO 3166-1 alpha-3: e.g. ZAF for South africa
    // from countries.geojson
    public string CountryId {get; set;} = string.Empty;

    // Countries name
    public string Name {get; set;} = string.Empty;

    // Counteis population count used to calc soldier value
    public long Population {get; set;}

    // Initial soldier value of country bassed on population count
    public int SoldierValue {get; set;}

    // ID of the faction that hold this territory
    public Guid OwnerFactionId {get; set;}

    // The amount of soldiers currently in the country, changes as soldiers move
    public int Soldiers {get; set;}
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
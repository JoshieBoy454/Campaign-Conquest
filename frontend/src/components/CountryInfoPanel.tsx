import type { CountryDefinition, Faction, Territory } from "../types/game";

type Props = {
    selectedCountry: { id: string | number; name: string };
    selectedCountryData?: CountryDefinition;
    selectedTerritory?: Territory;
    selectedOwner?: Faction;
    gameExists: boolean;
    isCreatingGame: boolean;
    onCreateGame: () => void;
};

// -------------------------------------------------------------------------
// CountryInfoPanel — selected country details + Start Game
// -------------------------------------------------------------------------
export default function CountryInfoPanel({
    selectedCountry,
    selectedCountryData,
    selectedTerritory,
    selectedOwner,
    gameExists,
    isCreatingGame,
    onCreateGame,
}: Props) {
    return (
        <div>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>
                {selectedCountry.name}
            </h3>

            {!gameExists && selectedCountryData && (
                <>
                    <p style={{ margin: "4px 0" }}>
                        Population:{" "}
                        {selectedCountryData.population.toLocaleString()}
                    </p>
                    <p style={{ margin: "4px 0" }}>
                        Starting armies: {selectedCountryData.soldierValue}
                    </p>
                </>
            )}

            {gameExists && selectedTerritory && (
                <>
                    <p style={{ margin: "4px 0" }}>
                        Owner: {selectedOwner?.name ?? "—"}
                    </p>
                    <p style={{ margin: "4px 0" }}>
                        Soldiers: {selectedTerritory.soldiers}
                    </p>
                </>
            )}

            {gameExists && !selectedTerritory && (
                <p style={{ margin: "4px 0", opacity: 0.7 }}>
                    Not in this campaign (only 10 countries are in play).
                </p>
            )}

            {!gameExists && (
                <button
                    type="button"
                    onClick={onCreateGame}
                    disabled={!selectedCountryData || isCreatingGame}
                    style={{
                        marginTop: 10,
                        padding: "10px 14px",
                        borderRadius: 6,
                        border: "none",
                        backgroundColor: "#1160BF",
                        color: "#FFFFFF",
                        cursor: "pointer",
                        opacity: !selectedCountryData || isCreatingGame ? 0.5 : 1,
                    }}
                >
                    {isCreatingGame
                        ? "Creating Game..."
                        : selectedCountryData
                          ? "Start Game"
                          : "Country Unavailable"}
                </button>
            )}
        </div>
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->

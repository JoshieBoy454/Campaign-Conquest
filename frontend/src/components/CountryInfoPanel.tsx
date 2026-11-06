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
// CountryInfoPanel — left card for the clicked / flown-to country
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
        <div
            style={{
                position: "absolute",
                top: 20,
                left: 20,
                width: 260,
                maxWidth: "calc(100vw - 40px)",
                maxHeight: "75vh",
                overflowY: "auto",
                padding: 16,
                backgroundColor: "#FFFFFF",
                color: "#111111",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                zIndex: 10,
            }}
        >
            <h3>Selected Country</h3>
            <p>{selectedCountry.name}</p>
            <p>{selectedCountry.id}</p>

            {selectedCountryData && (
                <>
                    <p>
                        Population:{" "}
                        {selectedCountryData.population.toLocaleString()}
                    </p>
                    <p>Soldier Value: {selectedCountryData.soldierValue}</p>
                </>
            )}

            {gameExists && selectedTerritory && (
                <>
                    <p>Owner: {selectedOwner?.name}</p>
                    <p>Soldiers: {selectedTerritory.soldiers}</p>
                </>
            )}

            {!gameExists && (
                <button
                    type="button"
                    onClick={onCreateGame}
                    disabled={!selectedCountryData || isCreatingGame}
                    style={{
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

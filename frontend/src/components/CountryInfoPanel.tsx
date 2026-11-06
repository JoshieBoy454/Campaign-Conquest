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

export default function CountryInfoPanel({
    selectedCountry,
    selectedCountryData,
    selectedTerritory,
    selectedOwner,
    gameExists,
    isCreatingGame,
    onCreateGame,
}: Props) {
    const canStart = Boolean(selectedCountryData) && !isCreatingGame;

    return (
        <div>
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16 }}>
                {selectedCountry.name}
            </h3>

            {!gameExists && selectedCountryData && (
                <div className="holo-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                    Pop {selectedCountryData.population.toLocaleString()} ·{" "}
                    {selectedCountryData.soldierValue} starting armies
                </div>
            )}

            {gameExists && selectedTerritory && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 6,
                    }}
                >
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 13,
                        }}
                    >
                        <span
                            aria-hidden
                            style={{
                                width: 12,
                                height: 12,
                                borderRadius: 2,
                                background: selectedOwner?.color ?? "#666",
                                boxShadow: "0 0 6px rgba(46,230,255,0.35)",
                            }}
                        />
                        {selectedOwner?.name ?? "—"}
                    </span>
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 13,
                            color: "var(--holo-accent)",
                            fontWeight: 700,
                        }}
                        title="Soldiers"
                    >
                        <span aria-hidden style={{ opacity: 0.85 }}>
                            ▣
                        </span>
                        {selectedTerritory.soldiers}
                    </span>
                </div>
            )}

            {gameExists && !selectedTerritory && (
                <p className="holo-muted" style={{ margin: "4px 0", fontSize: 12 }}>
                    Not in this campaign.
                </p>
            )}

            {!gameExists && (
                <button
                    type="button"
                    className="holo-btn holo-btn-primary"
                    onClick={onCreateGame}
                    disabled={!canStart}
                    style={{ marginTop: 10, width: "100%" }}
                >
                    {isCreatingGame
                        ? "Creating…"
                        : selectedCountryData
                          ? "Start Game"
                          : "Select a playable country"}
                </button>
            )}
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

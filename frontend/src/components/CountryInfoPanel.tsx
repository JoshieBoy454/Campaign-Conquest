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

function TroopIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            aria-hidden
            style={{ flexShrink: 0 }}
        >
            <path
                d="M8 1.5 9.2 5.2 13 5.5 10.2 8.1 11 12 8 10.1 5 12l.8-3.9L3 5.5l3.8-.3L8 1.5Z"
                fill="currentColor"
                opacity="0.95"
            />
        </svg>
    );
}

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
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>
                {selectedCountry.name}
            </h3>

            {!gameExists && selectedCountryData && (
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 12,
                        padding: "6px 10px",
                        border: "1px solid var(--holo-border-dim)",
                        color: "var(--holo-accent)",
                        fontWeight: 700,
                        fontSize: 14,
                        letterSpacing: "0.02em",
                    }}
                    title="Starting armies"
                >
                    <TroopIcon />
                    <span>{selectedCountryData.soldierValue}</span>
                    <span className="holo-muted" style={{ fontWeight: 500, fontSize: 12 }}>
                        starting armies
                    </span>
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
                            gap: 6,
                            fontSize: 13,
                            color: "var(--holo-accent)",
                            fontWeight: 700,
                        }}
                        title="Soldiers"
                    >
                        <TroopIcon />
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

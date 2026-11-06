import type { Faction, GameState, Territory } from "../types/game";

type Props = {
    game: GameState;
    turnOrderRollCount: number;
    activeFaction?: Faction;
    onFlyToCountry: (countryId: string, countryName: string) => void;
};

// -------------------------------------------------------------------------
// FactionPanel — right side list, click a country to fly the camera over
// -------------------------------------------------------------------------
export default function FactionPanel({
    game,
    turnOrderRollCount,
    activeFaction,
    onFlyToCountry,
}: Props) {
    return (
        <div
            style={{
                position: "absolute",
                top: 20,
                right: 20,
                padding: 16,
                width: 300,
                maxWidth: "calc(100vw - 40px)",
                maxHeight: "calc(100vh - 40px)",
                overflowY: "auto",
                boxSizing: "border-box",
                backgroundColor: "#FFFFFF",
                color: "#111111",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                zIndex: 10,
            }}
        >
            <h3>Campaign Conquest</h3>
            <p>Round: {game.round}</p>
            <p>Current Turn: {activeFaction?.name ?? "Unknown"}</p>
            <p>Phase: {game.currentPhase}</p>
            <p>Pool: {game.reinforcementPool}</p>
            <p>D20 Rolls Recorded: {turnOrderRollCount}</p>
            <hr />
            <h4>Factions</h4>

            {[...game.factions]
                .sort((a, b) => a.turnPosition - b.turnPosition)
                .map((faction) => {
                    const ownedTerritories: Territory[] = game.territories.filter(
                        (territory) => territory.ownerFactionId === faction.id
                    );
                    const totalSoldiers = ownedTerritories.reduce(
                        (total, territory) => total + territory.soldiers,
                        0
                    );

                    return (
                        <div
                            key={faction.id}
                            style={{
                                marginBottom: 12,
                                paddingBottom: 8,
                                borderBottom: "1px solid #DDDDDD",
                                opacity: faction.isDefeated ? 0.45 : 1,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                <span
                                    style={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: 3,
                                        backgroundColor: faction.color,
                                        flexShrink: 0,
                                    }}
                                />
                                <strong>
                                    {faction.turnPosition}. {faction.name}
                                    {faction.isDefeated ? " (defeated)" : ""}
                                </strong>
                            </div>
                            <p>Total Soldiers: {totalSoldiers}</p>
                            {ownedTerritories.map((territory) => (
                                <button
                                    key={territory.countryId}
                                    type="button"
                                    onClick={() =>
                                        onFlyToCountry(
                                            territory.countryId,
                                            territory.name
                                        )
                                    }
                                    style={{
                                        display: "block",
                                        width: "100%",
                                        textAlign: "left",
                                        margin: "4px 0",
                                        padding: "4px 6px",
                                        border: "1px solid #DDDDDD",
                                        borderRadius: 4,
                                        background: "#F7F7F7",
                                        color: "#111111",
                                        cursor: "pointer",
                                    }}
                                >
                                    {territory.name}: {territory.soldiers}
                                </button>
                            ))}
                        </div>
                    );
                })}
        </div>
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->

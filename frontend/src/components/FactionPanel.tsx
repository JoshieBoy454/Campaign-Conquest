import { TurnPhase, type Faction, type GameState, type Territory } from "../types/game";

type Props = {
    game: GameState;
    activeFaction?: Faction;
    onFlyToCountry: (countryId: string, countryName: string) => void;
};

const PHASE_LABELS: Record<number, string> = {
    [TurnPhase.Upkeep]: "Upkeep",
    [TurnPhase.ReinforcementOne]: "Reinforce",
    [TurnPhase.Combat]: "Combat",
    [TurnPhase.ReinforcementTwo]: "Post-combat",
    [TurnPhase.EndTurn]: "End turn",
};

// -------------------------------------------------------------------------
// FactionPanel — right side list, click a country to fly the camera over
// -------------------------------------------------------------------------
export default function FactionPanel({
    game,
    activeFaction,
    onFlyToCountry,
}: Props) {
    return (
        <div>
            <p style={{ margin: "0 0 6px" }}>Round {game.round}</p>
            <p style={{ margin: "0 0 6px" }}>
                Turn: <strong>{activeFaction?.name ?? "—"}</strong>
            </p>
            <p style={{ margin: "0 0 6px" }}>
                Phase: {PHASE_LABELS[game.currentPhase] ?? "—"}
            </p>
            {game.reinforcementPool > 0 && (
                <p style={{ margin: "0 0 10px" }}>
                    Reinforcement pool: {game.reinforcementPool}
                </p>
            )}
            <hr style={{ border: "none", borderTop: "1px solid #E2E8F0" }} />
            <h4 style={{ margin: "10px 0 8px" }}>Factions</h4>

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
                    const isActive = faction.id === activeFaction?.id;

                    return (
                        <div
                            key={faction.id}
                            style={{
                                marginBottom: 12,
                                paddingBottom: 8,
                                borderBottom: "1px solid #DDDDDD",
                                opacity: faction.isDefeated ? 0.45 : 1,
                                background: isActive ? "#F0F9FF" : "transparent",
                                borderRadius: 4,
                                padding: isActive ? "6px 4px" : undefined,
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
                                    {isActive ? " ←" : ""}
                                </strong>
                            </div>
                            <p style={{ margin: "4px 0" }}>
                                Armies: {totalSoldiers} · Lands:{" "}
                                {ownedTerritories.length}
                            </p>
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

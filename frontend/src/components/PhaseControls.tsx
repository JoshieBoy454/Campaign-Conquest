import { FactionType, TurnPhase, type GameState } from "../types/game";

type Props = {
    game: GameState;
    busy: boolean;
    onAdvance: () => void;
    onAllocate: () => void;
    onSkipCombat: () => void;
    onRollCombat: () => void;
    onRetreat: () => void;
};

const PHASE_LABELS: Record<number, string> = {
    [TurnPhase.Upkeep]: "Upkeep",
    [TurnPhase.ReinforcementOne]: "Reinforce 1",
    [TurnPhase.Combat]: "Combat",
    [TurnPhase.ReinforcementTwo]: "Reinforce 2",
    [TurnPhase.EndTurn]: "End Turn",
};

// -------------------------------------------------------------------------
// PhaseControls — five chunky buttons bottom-left, only host/human can poke them
// -------------------------------------------------------------------------
export default function PhaseControls({
    game,
    busy,
    onAdvance,
    onAllocate,
    onSkipCombat,
    onRollCombat,
    onRetreat,
}: Props) {
    const current = game.factions.find((f) => f.id === game.currentFactionId);
    const isHumanTurn = current?.type === FactionType.Human;
    const combatActive = Boolean(game.activeCombat);

    return (
        <div
            style={{
                position: "absolute",
                left: 20,
                bottom: 20,
                zIndex: 15,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxWidth: 360,
            }}
        >
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(PHASE_LABELS).map(([key, label]) => {
                    const phase = Number(key);
                    const active = game.currentPhase === phase;
                    const combatish = phase === TurnPhase.Combat;
                    return (
                        <div
                            key={key}
                            style={{
                                width: 64,
                                height: 64,
                                borderRadius: 8,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                textAlign: "center",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#fff",
                                backgroundColor: active
                                    ? combatish
                                        ? "#B91C1C"
                                        : "#1160BF"
                                    : "#9CA3AF",
                                boxShadow: active
                                    ? "0 0 0 2px #111 inset"
                                    : "none",
                            }}
                        >
                            {label}
                        </div>
                    );
                })}
            </div>

            <div
                style={{
                    background: "#FFFFFF",
                    padding: "10px 12px",
                    borderRadius: 8,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    color: "#111",
                }}
            >
                <strong>
                    {isHumanTurn ? "Your turn" : `${current?.name ?? "NPC"} playing`}
                </strong>
                <div>Pool: {game.reinforcementPool}</div>
                {combatActive && (
                    <div>
                        Battle: {game.activeCombat?.sourceCountryId} →{" "}
                        {game.activeCombat?.destinationCountryId} (
                        {game.activeCombat?.attackerSoldiers} committed)
                    </div>
                )}

                {isHumanTurn && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {(game.currentPhase === TurnPhase.Upkeep ||
                            game.currentPhase === TurnPhase.EndTurn ||
                            (game.currentPhase === TurnPhase.ReinforcementOne &&
                                game.reinforcementPool === 0) ||
                            (game.currentPhase === TurnPhase.ReinforcementTwo &&
                                game.reinforcementPool === 0) ||
                            (game.currentPhase === TurnPhase.Combat && !combatActive)) && (
                            <button type="button" disabled={busy} onClick={onAdvance}>
                                {game.currentPhase === TurnPhase.Combat
                                    ? "Skip combat"
                                    : game.currentPhase === TurnPhase.EndTurn
                                      ? "End turn"
                                      : "Continue"}
                            </button>
                        )}

                        {(game.currentPhase === TurnPhase.ReinforcementOne ||
                            game.currentPhase === TurnPhase.ReinforcementTwo) &&
                            game.reinforcementPool > 0 && (
                                <button type="button" disabled={busy} onClick={onAllocate}>
                                    Allocate 1 to selected
                                </button>
                            )}

                        {game.currentPhase === TurnPhase.Combat && combatActive && (
                            <>
                                <button type="button" disabled={busy} onClick={onRollCombat}>
                                    Roll dice
                                </button>
                                <button type="button" disabled={busy} onClick={onRetreat}>
                                    Retreat
                                </button>
                            </>
                        )}

                        {game.currentPhase === TurnPhase.Combat && !combatActive && (
                            <button type="button" disabled={busy} onClick={onSkipCombat}>
                                Skip combat
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->

import type { CSSProperties } from "react";
import { FactionType, TurnPhase, type GameState } from "../types/game";

type Props = {
    game: GameState;
    busy: boolean;
    canAttackSelected: boolean;
    battleSourceName?: string;
    battleDestName?: string;
    onAdvance: () => void;
    onAllocate: () => void;
    onSkipCombat: () => void;
    onRollCombat: () => void;
    onRetreat: () => void;
    onAttackSelected: () => void;
};

const PHASE_LABELS: Record<number, string> = {
    [TurnPhase.Upkeep]: "Upkeep",
    [TurnPhase.ReinforcementOne]: "Reinforce 1",
    [TurnPhase.Combat]: "Combat",
    [TurnPhase.ReinforcementTwo]: "Reinforce 2",
    [TurnPhase.EndTurn]: "End Turn",
};

// -------------------------------------------------------------------------
// PhaseControls — bottom action strip for the host on their turn
// -------------------------------------------------------------------------
export default function PhaseControls({
    game,
    busy,
    canAttackSelected,
    battleSourceName,
    battleDestName,
    onAdvance,
    onAllocate,
    onSkipCombat,
    onRollCombat,
    onRetreat,
    onAttackSelected,
}: Props) {
    const current = game.factions.find((f) => f.id === game.currentFactionId);
    const isHumanTurn = current?.type === FactionType.Human;
    const combatActive = Boolean(game.activeCombat);
    const phaseLabel = PHASE_LABELS[game.currentPhase] ?? "—";

    return (
        <div
            style={{
                position: "absolute",
                left: 12,
                bottom: 12,
                zIndex: 15,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxWidth: 380,
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
                                height: 52,
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
                    {isHumanTurn
                        ? `Your turn — ${phaseLabel}`
                        : `${current?.name ?? "NPC"} playing — ${phaseLabel}`}
                </strong>
                {game.reinforcementPool > 0 && (
                    <div>Troops to place: {game.reinforcementPool}</div>
                )}
                {combatActive && (
                    <div>
                        Battle: {battleSourceName ?? game.activeCombat?.sourceCountryId}{" "}
                        →{" "}
                        {battleDestName ??
                            game.activeCombat?.destinationCountryId}{" "}
                        ({game.activeCombat?.attackerSoldiers} committed)
                    </div>
                )}

                {isHumanTurn && (
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6,
                            marginTop: 8,
                        }}
                    >
                        {(game.currentPhase === TurnPhase.Upkeep ||
                            game.currentPhase === TurnPhase.EndTurn ||
                            (game.currentPhase === TurnPhase.ReinforcementOne &&
                                game.reinforcementPool === 0) ||
                            (game.currentPhase === TurnPhase.ReinforcementTwo &&
                                game.reinforcementPool === 0) ||
                            (game.currentPhase === TurnPhase.Combat &&
                                !combatActive)) && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onAdvance}
                                style={primaryBtn}
                            >
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
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={onAllocate}
                                    style={primaryBtn}
                                >
                                    Place 1 on selected
                                </button>
                            )}

                        {game.currentPhase === TurnPhase.Combat &&
                            !combatActive && (
                                <>
                                    <button
                                        type="button"
                                        disabled={busy || !canAttackSelected}
                                        onClick={onAttackSelected}
                                        style={primaryBtn}
                                    >
                                        Attack selected
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={onSkipCombat}
                                    >
                                        Skip combat
                                    </button>
                                </>
                            )}

                        {game.currentPhase === TurnPhase.Combat &&
                            combatActive && (
                                <>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={onRollCombat}
                                        style={primaryBtn}
                                    >
                                        Roll dice
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={onRetreat}
                                    >
                                        Retreat
                                    </button>
                                </>
                            )}
                    </div>
                )}

                {!isHumanTurn && (
                    <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
                        Waiting for NPCs…
                    </div>
                )}
            </div>
        </div>
    );
}

const primaryBtn: CSSProperties = {
    padding: "8px 12px",
    borderRadius: 6,
    border: "none",
    background: "#1160BF",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
};

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

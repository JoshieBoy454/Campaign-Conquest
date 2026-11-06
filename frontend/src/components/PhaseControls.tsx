import { FactionType, TurnPhase, type GameState } from "../types/game";

type Props = {
    game: GameState;
    busy: boolean;
    canAttackSelected: boolean;
    battleSourceName?: string;
    battleDestName?: string;
    onAdvance: () => void;
    onAllocate: () => void;
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

export default function PhaseControls({
    game,
    busy,
    canAttackSelected,
    battleSourceName,
    battleDestName,
    onAdvance,
    onAllocate,
    onRollCombat,
    onRetreat,
    onAttackSelected,
}: Props) {
    const current = game.factions.find((f) => f.id === game.currentFactionId);
    const isHumanTurn = current?.type === FactionType.Human;
    const combatActive = Boolean(game.activeCombat);
    const phaseLabel = PHASE_LABELS[game.currentPhase] ?? "—";

    return (
        <div className="holo-panel" style={{ padding: 0 }}>
            <div className="holo-panel-header">Phase controls</div>
            <div className="holo-panel-body">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {Object.entries(PHASE_LABELS).map(([key, label]) => {
                        const phase = Number(key);
                        const active = game.currentPhase === phase;
                        return (
                            <div
                                key={key}
                                style={{
                                    flex: "1 1 64px",
                                    minWidth: 56,
                                    height: 44,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    textAlign: "center",
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: "0.04em",
                                    textTransform: "uppercase",
                                    color: active ? "#041018" : "var(--holo-muted)",
                                    background: active
                                        ? phase === TurnPhase.Combat
                                            ? "var(--holo-danger)"
                                            : "var(--holo-accent)"
                                        : "rgba(255,255,255,0.06)",
                                    border: `1px solid ${active ? "var(--holo-border)" : "var(--holo-border-dim)"}`,
                                }}
                            >
                                {label}
                            </div>
                        );
                    })}
                </div>

                <strong>
                    {isHumanTurn
                        ? `Your turn — ${phaseLabel}`
                        : `${current?.name ?? "NPC"} — ${phaseLabel}`}
                </strong>
                {combatActive && (
                    <div className="holo-muted" style={{ marginTop: 4 }}>
                        {battleSourceName ?? game.activeCombat?.sourceCountryId} →{" "}
                        {battleDestName ?? game.activeCombat?.destinationCountryId}
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
                            <button
                                type="button"
                                className="holo-btn holo-btn-primary"
                                disabled={busy}
                                onClick={onAdvance}
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
                                    className="holo-btn holo-btn-primary"
                                    disabled={busy}
                                    onClick={onAllocate}
                                >
                                    Place 1 on selected
                                </button>
                            )}

                        {game.currentPhase === TurnPhase.Combat && !combatActive && (
                            <button
                                type="button"
                                className="holo-btn holo-btn-primary"
                                disabled={busy || !canAttackSelected}
                                onClick={onAttackSelected}
                            >
                                Attack selected
                            </button>
                        )}

                        {game.currentPhase === TurnPhase.Combat && combatActive && (
                            <>
                                <button
                                    type="button"
                                    className="holo-btn holo-btn-primary"
                                    disabled={busy}
                                    onClick={onRollCombat}
                                >
                                    Roll dice
                                </button>
                                <button
                                    type="button"
                                    className="holo-btn"
                                    disabled={busy}
                                    onClick={onRetreat}
                                >
                                    Retreat
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

import { FactionType, TurnPhase, type GameState } from "../types/game";
import TroopCommitStepper from "./TroopCommitStepper";

export type PendingCommit = {
    kind: "attack" | "transfer";
    sourceId: string;
    sourceName: string;
    destId: string;
    destName: string;
    maxSoldiers: number;
};

type Props = {
    game: GameState;
    busy: boolean;
    canAttackSelected: boolean;
    canPlaceOnSelected: boolean;
    attackFromName?: string;
    battleSourceName?: string;
    battleDestName?: string;
    commitCount: number;
    commitMax: number;
    onCommitCountChange: (n: number) => void;
    pendingCommit: PendingCommit | null;
    onClearPending: () => void;
    onConfirmPending: () => void;
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
    canPlaceOnSelected,
    attackFromName,
    battleSourceName,
    battleDestName,
    commitCount,
    commitMax,
    onCommitCountChange,
    pendingCommit,
    onClearPending,
    onConfirmPending,
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
    const reinforcing =
        game.currentPhase === TurnPhase.ReinforcementOne ||
        game.currentPhase === TurnPhase.ReinforcementTwo;

    const poolMax = Math.max(0, game.reinforcementPool);
    const safeCommitMax = Math.max(1, commitMax);

    let stepperMin = 1;
    let stepperMax = 1;
    let stepperLabel = "Soldiers";
    let showStepper = false;

    if (isHumanTurn && pendingCommit) {
        showStepper = true;
        stepperMin = 1;
        stepperMax = safeCommitMax;
        stepperLabel =
            pendingCommit.kind === "attack" ? "Attack with" : "Transfer";
    } else if (isHumanTurn && reinforcing && poolMax > 0) {
        showStepper = true;
        stepperMin = 1;
        stepperMax = poolMax;
        stepperLabel = "Place from pool";
    } else if (
        isHumanTurn &&
        game.currentPhase === TurnPhase.Combat &&
        !combatActive &&
        canAttackSelected
    ) {
        showStepper = true;
        stepperMin = 1;
        stepperMax = safeCommitMax;
        stepperLabel = "Attack with";
    }

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

                {pendingCommit && (
                    <div className="holo-muted" style={{ marginTop: 6, fontSize: 12 }}>
                        {pendingCommit.kind === "attack" ? "Attack" : "Move"}{" "}
                        {pendingCommit.sourceName} → {pendingCommit.destName}
                    </div>
                )}

                {reinforcing && isHumanTurn && !pendingCommit && (
                    <div className="holo-muted" style={{ marginTop: 6, fontSize: 11 }}>
                        Place from the pool, or drag between your countries to move
                        troops.
                    </div>
                )}

                {isHumanTurn &&
                    game.currentPhase === TurnPhase.Combat &&
                    !combatActive &&
                    !pendingCommit &&
                    attackFromName && (
                        <div className="holo-muted" style={{ marginTop: 6, fontSize: 11 }}>
                            Attacking from {attackFromName}. Click another owned
                            land (2+ troops) to change source, or drag to attack.
                        </div>
                    )}

                {showStepper && (
                    <div style={{ marginTop: 10 }}>
                        <TroopCommitStepper
                            label={stepperLabel}
                            value={commitCount}
                            min={stepperMin}
                            max={stepperMax}
                            disabled={busy}
                            onChange={onCommitCountChange}
                        />
                    </div>
                )}

                {isHumanTurn && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {pendingCommit && (
                            <>
                                <button
                                    type="button"
                                    className="holo-btn holo-btn-primary"
                                    disabled={busy || commitCount < 1}
                                    onClick={onConfirmPending}
                                >
                                    Confirm {commitCount}
                                </button>
                                <button
                                    type="button"
                                    className="holo-btn"
                                    disabled={busy}
                                    onClick={onClearPending}
                                >
                                    Cancel
                                </button>
                            </>
                        )}

                        {!pendingCommit &&
                            (game.currentPhase === TurnPhase.Upkeep ||
                                game.currentPhase === TurnPhase.EndTurn ||
                                (game.currentPhase === TurnPhase.ReinforcementOne &&
                                    game.reinforcementPool === 0) ||
                                (game.currentPhase === TurnPhase.ReinforcementTwo &&
                                    game.reinforcementPool === 0) ||
                                (game.currentPhase === TurnPhase.Combat &&
                                    !combatActive)) && (
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

                        {!pendingCommit &&
                            reinforcing &&
                            game.reinforcementPool > 0 && (
                                <button
                                    type="button"
                                    className="holo-btn holo-btn-primary"
                                    disabled={busy || !canPlaceOnSelected}
                                    onClick={onAllocate}
                                >
                                    Place {Math.min(commitCount, poolMax)} on
                                    selected
                                </button>
                            )}

                        {!pendingCommit &&
                            game.currentPhase === TurnPhase.Combat &&
                            !combatActive && (
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

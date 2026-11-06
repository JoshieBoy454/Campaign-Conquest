import type { CSSProperties } from "react";
import type { CombatState } from "../types/game";

type Props = {
    combat?: CombatState | null;
    turnOrderRolls?: { factionId: string; roll: number; rollStage: number }[];
};

// -------------------------------------------------------------------------
// DiceOverlay — factual CSS dice until Pixi gets a proper pass
// -------------------------------------------------------------------------
export default function DiceOverlay({ combat, turnOrderRolls }: Props) {
    if (!combat && (!turnOrderRolls || turnOrderRolls.length === 0)) {
        return null;
    }

    return (
        <div
            style={{
                position: "absolute",
                left: "50%",
                bottom: 110,
                transform: "translateX(-50%)",
                zIndex: 18,
                background: "rgba(17,17,17,0.88)",
                color: "#fff",
                padding: "12px 16px",
                borderRadius: 10,
                minWidth: 260,
                textAlign: "center",
                pointerEvents: "none",
            }}
        >
            {combat && (
                <>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Combat dice</div>
                    <div>
                        Attacker:{" "}
                        {(combat.lastAttackerDice ?? []).map((d, i) => (
                            <span key={`a${i}`} style={dieStyle}>
                                {d}
                            </span>
                        ))}
                    </div>
                    <div style={{ marginTop: 6 }}>
                        Defender:{" "}
                        {(combat.lastDefenderDice ?? []).map((d, i) => (
                            <span key={`d${i}`} style={dieStyle}>
                                {d}
                            </span>
                        ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
                        Losses A {combat.lastAttackerLosses} / D {combat.lastDefenderLosses}
                    </div>
                </>
            )}

            {!combat && turnOrderRolls && turnOrderRolls.length > 0 && (
                <>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>D20 turn order</div>
                    <div style={{ maxHeight: 120, overflow: "auto", fontSize: 13 }}>
                        {turnOrderRolls.map((roll, index) => (
                            <div key={`${roll.factionId}-${index}`}>
                                Stage {roll.rollStage}: {roll.roll}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

const dieStyle: CSSProperties = {
    display: "inline-flex",
    width: 28,
    height: 28,
    margin: "0 3px",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    background: "#1160BF",
    fontWeight: 800,
};

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

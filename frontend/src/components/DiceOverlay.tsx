import type { CSSProperties } from "react";
import type { CombatState } from "../types/game";

type Props = {
    combat?: CombatState | null;
    sourceName?: string;
    destinationName?: string;
};

// -------------------------------------------------------------------------
// DiceOverlay — combat dice only (turn-order D20s stay off the HUD)
// -------------------------------------------------------------------------
export default function DiceOverlay({
    combat,
    sourceName,
    destinationName,
}: Props) {
    if (!combat) {
        return null;
    }

    return (
        <div
            style={{
                position: "absolute",
                left: "50%",
                bottom: 120,
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
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {sourceName ?? combat.sourceCountryId} →{" "}
                {destinationName ?? combat.destinationCountryId}
            </div>
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
                Losses A {combat.lastAttackerLosses} / D{" "}
                {combat.lastDefenderLosses}
            </div>
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

import { useEffect, useState } from "react";
import type { CombatState } from "../types/game";

type Props = {
    combat?: CombatState | null;
    sourceName?: string;
    destinationName?: string;
};

function diceKey(combat: CombatState): string {
    return [
        ...(combat.lastAttackerDice ?? []),
        "|",
        ...(combat.lastDefenderDice ?? []),
        combat.lastAttackerLosses,
        combat.lastDefenderLosses,
    ].join("-");
}

function DieFace({
    value,
    rolling,
    tone,
}: {
    value: number;
    rolling: boolean;
    tone: "atk" | "def";
}) {
    return (
        <span
            className={rolling ? "holo-die holo-die-rolling" : "holo-die"}
            style={{
                background:
                    tone === "atk"
                        ? "rgba(46, 230, 255, 0.28)"
                        : "rgba(255, 77, 109, 0.22)",
                borderColor:
                    tone === "atk" ? "var(--holo-accent)" : "var(--holo-danger)",
            }}
        >
            {rolling ? (Math.floor(Math.random() * 6) + 1) : value}
        </span>
    );
}

function DiceRow({
    label,
    values,
    rolling,
    tone,
}: {
    label: string;
    values: number[];
    rolling: boolean;
    tone: "atk" | "def";
}) {
    if (values.length === 0 && !rolling) {
        return (
            <div className="holo-muted" style={{ fontSize: 12 }}>
                {label}: awaiting roll
            </div>
        );
    }
    const faces = values.length > 0 ? values : [1];
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                flexWrap: "wrap",
            }}
        >
            <span className="holo-muted" style={{ fontSize: 12, minWidth: 64 }}>
                {label}
            </span>
            {faces.map((d, i) => (
                <DieFace key={`${tone}-${i}-${d}`} value={d} rolling={rolling} tone={tone} />
            ))}
        </div>
    );
}

export default function DiceOverlay({
    combat,
    sourceName,
    destinationName,
}: Props) {
    const [rolling, setRolling] = useState(false);
    const [tick, setTick] = useState(0);

    const rollKey = combat ? diceKey(combat) : "";

    useEffect(() => {
        if (!combat || !rollKey) return;
        if (!(combat.lastAttackerDice?.length || combat.lastDefenderDice?.length)) {
            setRolling(false);
            return;
        }
        setRolling(true);
        const frames = window.setInterval(() => setTick((t) => t + 1), 70);
        const stop = window.setTimeout(() => {
            window.clearInterval(frames);
            setRolling(false);
        }, 520);
        return () => {
            window.clearInterval(frames);
            window.clearTimeout(stop);
        };
    }, [rollKey, combat]);

    if (!combat) return null;
    void tick;

    const src = sourceName ?? combat.sourceCountryId;
    const dst = destinationName ?? combat.destinationCountryId;

    return (
        <div className="holo-panel" style={{ padding: 0, pointerEvents: "none" }}>
            <div className="holo-panel-header">Combat</div>
            <div
                className="holo-panel-body"
                style={{ textAlign: "center", display: "grid", gap: 10 }}
            >
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {src} → {dst}
                </div>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 20,
                        fontSize: 13,
                    }}
                >
                    <div>
                        <div className="holo-muted" style={{ fontSize: 11 }}>
                            Attacking
                        </div>
                        <div
                            style={{
                                fontSize: 22,
                                fontWeight: 800,
                                color: "var(--holo-accent)",
                            }}
                        >
                            {combat.attackerSoldiers}
                        </div>
                    </div>
                    <div className="holo-muted" style={{ alignSelf: "center" }}>
                        vs
                    </div>
                    <div>
                        <div className="holo-muted" style={{ fontSize: 11 }}>
                            Defending
                        </div>
                        <div
                            style={{
                                fontSize: 22,
                                fontWeight: 800,
                                color: "var(--holo-danger)",
                            }}
                        >
                            {combat.defenderSoldiers}
                        </div>
                    </div>
                </div>

                <DiceRow
                    label="Attacker"
                    values={combat.lastAttackerDice ?? []}
                    rolling={rolling}
                    tone="atk"
                />
                <DiceRow
                    label="Defender"
                    values={combat.lastDefenderDice ?? []}
                    rolling={rolling}
                    tone="def"
                />

                {(combat.lastAttackerDice?.length ?? 0) > 0 && (
                    <div className="holo-muted" style={{ fontSize: 12 }}>
                        Losses −{combat.lastAttackerLosses} / −
                        {combat.lastDefenderLosses}
                    </div>
                )}
            </div>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

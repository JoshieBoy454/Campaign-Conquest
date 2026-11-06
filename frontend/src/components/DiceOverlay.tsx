import { useEffect, useRef, useState } from "react";
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

const ATTACKER_SLOTS = 3;
const DEFENDER_SLOTS = 2;

function DieFace({
    value,
    tone,
    empty,
}: {
    value?: number;
    tone: "atk" | "def";
    empty?: boolean;
}) {
    return (
        <span
            className="holo-die"
            aria-hidden={empty || undefined}
            style={{
                background: empty
                    ? "rgba(255, 255, 255, 0.04)"
                    : tone === "atk"
                      ? "rgba(46, 230, 255, 0.28)"
                      : "rgba(255, 77, 109, 0.22)",
                borderColor: empty
                    ? "var(--holo-border-dim)"
                    : tone === "atk"
                      ? "var(--holo-accent)"
                      : "var(--holo-danger)",
                color: empty ? "transparent" : undefined,
                opacity: empty ? 0.35 : 1,
            }}
        >
            {empty ? "0" : value}
        </span>
    );
}

function DiceRow({
    label,
    values,
    tone,
    slots,
}: {
    label: string;
    values: number[];
    tone: "atk" | "def";
    slots: number;
}) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                minHeight: 32,
                flexWrap: "nowrap",
            }}
        >
            <span className="holo-muted" style={{ fontSize: 12, minWidth: 64 }}>
                {label}
            </span>
            {Array.from({ length: slots }, (_, i) => {
                const value = values[i];
                const empty = value == null;
                return (
                    <DieFace
                        key={`${tone}-${i}`}
                        value={value}
                        tone={tone}
                        empty={empty}
                    />
                );
            })}
        </div>
    );
}

export default function DiceOverlay({
    combat,
    sourceName,
    destinationName,
}: Props) {
    const [displayAtk, setDisplayAtk] = useState<number[]>([]);
    const [displayDef, setDisplayDef] = useState<number[]>([]);
    const [rolling, setRolling] = useState(false);
    const lastKeyRef = useRef("");

    const rollKey = combat ? diceKey(combat) : "";
    const hasDice = Boolean(
        combat &&
            ((combat.lastAttackerDice?.length ?? 0) > 0 ||
                (combat.lastDefenderDice?.length ?? 0) > 0)
    );

    useEffect(() => {
        if (!combat) {
            setDisplayAtk([]);
            setDisplayDef([]);
            setRolling(false);
            lastKeyRef.current = "";
            return;
        }

        const finalAtk = combat.lastAttackerDice ?? [];
        const finalDef = combat.lastDefenderDice ?? [];

        // No roll yet — show empty / awaiting
        if (finalAtk.length === 0 && finalDef.length === 0) {
            setDisplayAtk([]);
            setDisplayDef([]);
            setRolling(false);
            lastKeyRef.current = rollKey;
            return;
        }

        // Same result as last time (e.g. poll refresh) — keep settled faces
        if (rollKey === lastKeyRef.current) {
            setDisplayAtk(finalAtk);
            setDisplayDef(finalDef);
            setRolling(false);
            return;
        }

        lastKeyRef.current = rollKey;
        setRolling(true);

        const reduced =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduced) {
            setDisplayAtk(finalAtk);
            setDisplayDef(finalDef);
            setRolling(false);
            return;
        }

        const frames = window.setInterval(() => {
            setDisplayAtk(
                finalAtk.map(() => Math.floor(Math.random() * 6) + 1)
            );
            setDisplayDef(
                finalDef.map(() => Math.floor(Math.random() * 6) + 1)
            );
        }, 70);

        const stop = window.setTimeout(() => {
            window.clearInterval(frames);
            setDisplayAtk(finalAtk);
            setDisplayDef(finalDef);
            setRolling(false);
        }, 480);

        return () => {
            window.clearInterval(frames);
            window.clearTimeout(stop);
        };
    }, [combat, rollKey]);

    if (!combat) return null;

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

                <div className={rolling ? "holo-dice-row-rolling" : undefined}>
                    <DiceRow
                        label="Attacker"
                        values={displayAtk}
                        tone="atk"
                        slots={ATTACKER_SLOTS}
                    />
                </div>
                <div className={rolling ? "holo-dice-row-rolling" : undefined}>
                    <DiceRow
                        label="Defender"
                        values={displayDef}
                        tone="def"
                        slots={DEFENDER_SLOTS}
                    />
                </div>

                <div
                    className="holo-muted"
                    style={{
                        fontSize: 12,
                        minHeight: 18,
                        lineHeight: "18px",
                        visibility:
                            hasDice && !rolling ? "visible" : "hidden",
                    }}
                >
                    Losses −{combat.lastAttackerLosses} / −
                    {combat.lastDefenderLosses}
                </div>
            </div>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

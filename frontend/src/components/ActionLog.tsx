import { useEffect, useRef, useState } from "react";
import {
    fetchEventsAfter,
    type GameEventRow,
} from "../services/gameEvents";

type Props = { gameId: string };

const FRIENDLY: Record<string, string> = {
    AdvancePhase: "Phase advanced",
    AllocateReinforcements: "Troops placed",
    TransferSoldiers: "Troops moved",
    StartCombat: "Battle started",
    ResolveCombatRound: "Combat round",
    RetreatCombat: "Attacker retreated",
    SetNpcSpeed: "Pacing changed",
    NpcTurn: "NPC turn",
    NpcCombatRound: "NPC combat",
};

function str(v: unknown, fallback = "?"): string {
    if (v == null) return fallback;
    const s = String(v);
    return s.trim() ? s : fallback;
}

function num(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function detailFor(event: GameEventRow): string | null {
    if (!event.payloadJson) return null;
    try {
        const p = JSON.parse(event.payloadJson) as Record<string, unknown>;

        if (event.type === "StartCombat") {
            const src = str(p.sourceName ?? p.sourceCountryId);
            const dst = str(p.destinationName ?? p.destinationCountryId);
            const atk = num(p.attackerSoldiers);
            const def = num(p.defenderSoldiers);
            if (atk != null && def != null) {
                return `${src} attacks ${dst} with ${atk} vs ${def} defending`;
            }
            return `${src} → ${dst}`;
        }

        if (
            event.type === "ResolveCombatRound" ||
            event.type === "NpcCombatRound"
        ) {
            const src = str(p.sourceName ?? p.sourceCountryId);
            const dst = str(p.destinationName ?? p.destinationCountryId);
            const round = num(p.round);
            const aLoss = num(p.attackerLosses) ?? 0;
            const dLoss = num(p.defenderLosses) ?? 0;
            const aLeft = num(p.attackerSoldiersRemaining);
            const dLeft = num(p.defenderSoldiersRemaining);
            const aDice = Array.isArray(p.attackerDice)
                ? (p.attackerDice as number[]).join("·")
                : null;
            const dDice = Array.isArray(p.defenderDice)
                ? (p.defenderDice as number[]).join("·")
                : null;
            const parts = [
                round != null ? `R${round}` : null,
                `${src} → ${dst}`,
                aDice && dDice ? `dice ${aDice} / ${dDice}` : null,
                `losses −${aLoss}/−${dLoss}`,
                aLeft != null && dLeft != null
                    ? `${aLeft} vs ${dLeft} remaining`
                    : null,
                p.battleFinished ? "battle over" : null,
            ].filter(Boolean);
            return parts.join(" · ");
        }

        if (event.type === "AllocateReinforcements") {
            const name = str(p.countryName ?? p.countryId);
            const n = num(p.soldierCount) ?? 0;
            const on = num(p.soldiersOnCountry);
            const pool = num(p.poolRemaining);
            return [
                `+${n} on ${name}`,
                on != null ? `now ${on}` : null,
                pool != null ? `pool ${pool}` : null,
            ]
                .filter(Boolean)
                .join(" · ");
        }

        if (event.type === "TransferSoldiers") {
            const src = str(p.sourceName ?? p.sourceCountryId);
            const dst = str(p.destinationName ?? p.destinationCountryId);
            const n = num(p.soldierCount) ?? 0;
            return `Moved ${n}: ${src} → ${dst}`;
        }

        if (event.type === "RetreatCombat") {
            const src = str(p.sourceName ?? p.sourceCountryId);
            const n = num(p.soldiersRetreated);
            return n != null
                ? `${src} pulls back ${n} soldiers`
                : `${src} retreats`;
        }

        if (event.type === "AdvancePhase") {
            return [str(p.factionName, ""), str(p.phase, "")]
                .filter(Boolean)
                .join(" · ");
        }

        if (event.type === "NpcTurn") {
            return str(p.factionName, "");
        }
    } catch {
        return null;
    }
    return null;
}

export default function ActionLog({ gameId }: Props) {
    const [events, setEvents] = useState<GameEventRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const afterRef = useRef(0);

    useEffect(() => {
        afterRef.current = 0;
        setEvents([]);
        setError(null);
    }, [gameId]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            const { rows, error: fetchError } = await fetchEventsAfter(
                gameId,
                afterRef.current,
                100
            );
            if (cancelled) return;
            if (fetchError) {
                setError(fetchError);
                return;
            }
            setError(null);
            if (rows.length === 0) return;
            const maxSeq = Math.max(
                afterRef.current,
                ...rows.map((r) => r.sequence)
            );
            afterRef.current = maxSeq;
            setEvents((prev) => {
                const seen = new Set(prev.map((e) => e.eventId));
                // Commentary belongs in Battle AI only — keep the log factual.
                const incoming = rows.filter(
                    (r) =>
                        !seen.has(r.eventId) &&
                        r.type !== "CommentaryAvailable"
                );
                // Newest first: prepend higher sequences
                const merged = [...incoming.reverse(), ...prev];
                return merged.slice(0, 80);
            });
        }

        void load();
        const handle = window.setInterval(() => void load(), 2000);
        return () => {
            cancelled = true;
            window.clearInterval(handle);
        };
    }, [gameId]);

    return (
        <ul className="holo-scroll" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {error && (
                <li className="holo-muted" style={{ color: "var(--holo-danger)" }}>
                    {error}
                </li>
            )}
            {events.map((event) => {
                const detail = detailFor(event);
                return (
                    <li
                        key={event.eventId}
                        style={{
                            borderBottom: "1px solid var(--holo-border-dim)",
                            padding: "4px 0",
                        }}
                    >
                        <div style={{ fontWeight: 600 }}>
                            {FRIENDLY[event.type] ?? event.type}
                        </div>
                        {detail && (
                            <div className="holo-muted" style={{ fontSize: 11 }}>
                                {detail}
                            </div>
                        )}
                        <div className="holo-muted" style={{ fontSize: 11 }}>
                            {new Date(event.occurredAtUtc).toLocaleTimeString()}
                        </div>
                    </li>
                );
            })}
            {!error && events.length === 0 && (
                <li className="holo-muted">Waiting for the first action…</li>
            )}
        </ul>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

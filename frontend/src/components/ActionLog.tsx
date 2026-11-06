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
    NpcTurn: "NPC completed a turn",
    NpcCombatRound: "NPC combat round",
    CommentaryAvailable: "Battle commentary",
};

function detailFor(event: GameEventRow): string | null {
    if (!event.payloadJson) return null;
    try {
        const payload = JSON.parse(event.payloadJson) as Record<string, unknown>;
        if (event.type === "NpcCombatRound") {
            const src = String(payload.sourceCountryId ?? "?");
            const dst = String(payload.destinationCountryId ?? "?");
            const aLoss = Number(payload.attackerLosses ?? 0);
            const dLoss = Number(payload.defenderLosses ?? 0);
            return `${src} → ${dst} (−${aLoss}/−${dLoss})`;
        }
        if (event.type === "NpcTurn") {
            return String(payload.factionName ?? "");
        }
        if (event.type === "CommentaryAvailable") {
            return String(payload.commentary ?? "").slice(0, 80);
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
                const merged = [
                    ...prev,
                    ...rows.filter((r) => !seen.has(r.eventId)),
                ];
                return merged.slice(-60);
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

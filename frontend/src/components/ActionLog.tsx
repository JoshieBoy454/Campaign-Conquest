import { useEffect, useState } from "react";
import { apiUrl } from "../services/apiBase";

type GameEventRow = {
    eventId: string;
    sequence?: number;
    type: string;
    occurredAtUtc: string;
    payloadJson?: string;
};

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
    CommentaryAvailable: "Battle commentary",
};

export default function ActionLog({ gameId }: Props) {
    const [events, setEvents] = useState<GameEventRow[]>([]);
    const [after, setAfter] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const response = await fetch(
                    apiUrl(
                        `/api/games/${encodeURIComponent(gameId)}/events?afterSequence=${after}&limit=100`
                    ),
                    { credentials: "include" }
                );
                if (!response.ok) return;
                const rows = (await response.json()) as GameEventRow[];
                if (cancelled || rows.length === 0) return;
                const maxSeq = Math.max(
                    after,
                    ...rows.map((r) => r.sequence ?? 0)
                );
                setAfter(maxSeq);
                setEvents((prev) => {
                    const seen = new Set(prev.map((e) => e.eventId));
                    const merged = [
                        ...prev,
                        ...rows.filter((r) => !seen.has(r.eventId)),
                    ];
                    return merged.slice(-60);
                });
            } catch {
                /* ignore */
            }
        }

        void load();
        const handle = window.setInterval(() => void load(), 2000);
        return () => {
            cancelled = true;
            window.clearInterval(handle);
        };
    }, [gameId, after]);

    return (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {events.map((event) => (
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
                    <div className="holo-muted" style={{ fontSize: 11 }}>
                        {new Date(event.occurredAtUtc).toLocaleTimeString()}
                    </div>
                </li>
            ))}
            {events.length === 0 && (
                <li className="holo-muted">No moves yet.</li>
            )}
        </ul>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

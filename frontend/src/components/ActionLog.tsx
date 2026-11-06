import { useEffect, useState } from "react";
import { apiUrl } from "../services/apiBase";

type GameEventRow = {
    eventId: string;
    sequence?: number;
    type: string;
    occurredAtUtc: string;
    payloadJson?: string;
};

type Props = {
    gameId: string;
};

const FRIENDLY: Record<string, string> = {
    AdvancePhase: "Phase advanced",
    AllocateReinforcements: "Troops placed",
    TransferSoldiers: "Troops moved",
    StartCombat: "Battle started",
    ResolveCombatRound: "Combat round",
    RetreatCombat: "Attacker retreated",
    SetNpcSpeed: "NPC speed changed",
};

// -------------------------------------------------------------------------
// ActionLog — short player-facing event lines
// -------------------------------------------------------------------------
export default function ActionLog({ gameId }: Props) {
    const [events, setEvents] = useState<GameEventRow[]>([]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const response = await fetch(
                    apiUrl(
                        `/api/games/${encodeURIComponent(gameId)}/events?afterSequence=0`
                    ),
                    { credentials: "include" }
                );
                if (!response.ok) {
                    return;
                }
                const rows = (await response.json()) as GameEventRow[];
                if (!cancelled) {
                    setEvents(rows.slice(-40));
                }
            } catch {
                // ignore — map still works without the log
            }
        }

        void load();
        const handle = window.setInterval(() => void load(), 2000);
        return () => {
            cancelled = true;
            window.clearInterval(handle);
        };
    }, [gameId]);

    return (
        <div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {events.map((event) => (
                    <li
                        key={event.eventId}
                        style={{
                            borderBottom: "1px solid #E5E7EB",
                            padding: "4px 0",
                        }}
                    >
                        <div style={{ fontWeight: 600 }}>
                            {FRIENDLY[event.type] ?? event.type}
                        </div>
                        <div style={{ opacity: 0.65, fontSize: 11 }}>
                            {new Date(event.occurredAtUtc).toLocaleTimeString()}
                        </div>
                    </li>
                ))}
                {events.length === 0 && (
                    <li style={{ opacity: 0.65 }}>No moves yet.</li>
                )}
            </ul>
        </div>
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->

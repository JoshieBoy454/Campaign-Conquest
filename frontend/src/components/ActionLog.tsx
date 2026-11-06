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

// -------------------------------------------------------------------------
// ActionLog — left strip of server events, newest at the bottom-ish
// -------------------------------------------------------------------------
export default function ActionLog({ gameId }: Props) {
    const [events, setEvents] = useState<GameEventRow[]>([]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const response = await fetch(
                    apiUrl(`/api/games/${encodeURIComponent(gameId)}/events?afterSequence=0`),
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
        <div
            style={{
                position: "absolute",
                left: 20,
                top: 200,
                width: 240,
                maxHeight: "40vh",
                overflowY: "auto",
                padding: 10,
                background: "rgba(255,255,255,0.92)",
                color: "#111",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 11,
                fontSize: 12,
            }}
        >
            <strong>Action log</strong>
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                {events.map((event) => (
                    <li
                        key={event.eventId}
                        style={{
                            borderBottom: "1px solid #E5E7EB",
                            padding: "4px 0",
                        }}
                    >
                        <div style={{ fontWeight: 600 }}>{event.type}</div>
                        <div style={{ opacity: 0.65 }}>
                            {new Date(event.occurredAtUtc).toLocaleTimeString()}
                        </div>
                    </li>
                ))}
                {events.length === 0 && <li>No events yet.</li>}
            </ul>
        </div>
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->

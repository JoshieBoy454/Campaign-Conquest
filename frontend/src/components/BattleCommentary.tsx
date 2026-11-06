import { useEffect, useState } from "react";
import { apiUrl } from "../services/apiBase";

type GameEventRow = {
    eventId: string;
    sequence?: number;
    type: string;
    payloadJson?: string;
};

type Props = { gameId: string };

export default function BattleCommentary({ gameId }: Props) {
    const [lines, setLines] = useState<string[]>([]);
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

                const commentary = rows
                    .filter((r) => r.type === "CommentaryAvailable")
                    .map((r) => {
                        try {
                            const payload = JSON.parse(r.payloadJson ?? "{}") as {
                                commentary?: string;
                            };
                            return payload.commentary ?? "";
                        } catch {
                            return "";
                        }
                    })
                    .filter(Boolean);

                const maxSeq = Math.max(
                    after,
                    ...rows.map((r) => r.sequence ?? 0)
                );
                setAfter(maxSeq);
                if (commentary.length) {
                    setLines((prev) => [...prev, ...commentary].slice(-12));
                }
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
        <div>
            {lines.length === 0 && (
                <p className="holo-muted">Awaiting battle chatter…</p>
            )}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {lines.map((line, i) => (
                    <li
                        key={`${i}-${line.slice(0, 12)}`}
                        style={{
                            borderBottom: "1px solid var(--holo-border-dim)",
                            padding: "6px 0",
                            fontSize: 13,
                        }}
                    >
                        {line}
                    </li>
                ))}
            </ul>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

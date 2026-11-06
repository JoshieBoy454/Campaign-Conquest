import { useEffect, useRef, useState } from "react";
import { fetchEventsAfter } from "../services/gameEvents";

type Props = { gameId: string };

export default function BattleCommentary({ gameId }: Props) {
    const [lines, setLines] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const afterRef = useRef(0);

    useEffect(() => {
        afterRef.current = 0;
        setLines([]);
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

            afterRef.current = Math.max(
                afterRef.current,
                ...rows.map((r) => r.sequence)
            );
            if (commentary.length) {
                setLines((prev) => [...prev, ...commentary].slice(-12));
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
        <div className="holo-scroll">
            {error && (
                <p className="holo-muted" style={{ color: "var(--holo-danger)" }}>
                    {error}
                </p>
            )}
            {!error && lines.length === 0 && (
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

import { useEffect, useRef, useState } from "react";
import { fetchEventsAfter } from "../services/gameEvents";

type Props = { gameId: string };

type Line = { id: string; text: string };

export default function BattleCommentary({ gameId }: Props) {
    const [lines, setLines] = useState<Line[]>([]);
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
                        const text = payload.commentary?.trim() ?? "";
                        return text ? { id: r.eventId, text } : null;
                    } catch {
                        return null;
                    }
                })
                .filter((x): x is Line => x != null);

            afterRef.current = Math.max(
                afterRef.current,
                ...rows.map((r) => r.sequence)
            );
            if (commentary.length) {
                setLines((prev) => {
                    const seen = new Set(prev.map((l) => l.id));
                    const incoming = commentary.filter((c) => !seen.has(c.id));
                    return [...incoming.reverse(), ...prev].slice(0, 16);
                });
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
                <p className="holo-muted">
                    Battle AI stands by — roll combat to hear the call.
                </p>
            )}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {lines.map((line) => (
                    <li
                        key={line.id}
                        style={{
                            borderBottom: "1px solid var(--holo-border-dim)",
                            padding: "8px 0",
                            fontSize: 13,
                            lineHeight: 1.45,
                        }}
                    >
                        {line.text}
                    </li>
                ))}
            </ul>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

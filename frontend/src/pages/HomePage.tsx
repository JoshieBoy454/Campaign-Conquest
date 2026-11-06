type Props = {
    onPlay: () => void;
    onSpectate: (gameId: string) => void;
};

// -------------------------------------------------------------------------
// HomePage — landing, new game or paste a spectator id
// -------------------------------------------------------------------------
export default function HomePage({ onPlay, onSpectate }: Props) {
    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                background:
                    "radial-gradient(circle at top, #1e3a5f 0%, #0b1220 55%, #05070d 100%)",
                color: "#F8FAFC",
                padding: 24,
            }}
        >
            <h1 style={{ fontSize: 48, margin: 0, letterSpacing: "-0.04em" }}>
                Campaign Conquest
            </h1>
            <p style={{ maxWidth: 480, textAlign: "center", opacity: 0.85 }}>
                One human, nine NPCs, ten countries. Share the link and let friends
                watch — only the host can move pieces.
            </p>
            <button
                type="button"
                onClick={onPlay}
                style={{
                    padding: "12px 22px",
                    borderRadius: 8,
                    border: "none",
                    background: "#38BDF8",
                    color: "#0B1220",
                    fontWeight: 700,
                    cursor: "pointer",
                }}
            >
                New Game
            </button>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const id = String(data.get("gameId") ?? "").trim();
                    if (id) {
                        onSpectate(id);
                    }
                }}
                style={{ display: "flex", gap: 8, marginTop: 12 }}
            >
                <input
                    name="gameId"
                    placeholder="Spectate game id"
                    style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #334155",
                        background: "#0f172a",
                        color: "#fff",
                        minWidth: 280,
                    }}
                />
                <button type="submit" style={{ padding: "10px 14px", borderRadius: 8 }}>
                    Watch
                </button>
            </form>
        </div>
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->

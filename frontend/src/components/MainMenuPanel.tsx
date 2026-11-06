import { useState } from "react";

type Props = {
    playerName: string;
    onPlayerNameChange: (name: string) => void;
    onPlay: () => void;
    onSpectate: (gameId: string) => void;
};

export default function MainMenuPanel({
    playerName,
    onPlayerNameChange,
    onPlay,
    onSpectate,
}: Props) {
    const [spectateId, setSpectateId] = useState("");
    const canPlay = playerName.trim().length > 0;

    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                    "radial-gradient(ellipse at center, rgba(4,24,32,0.35) 0%, rgba(2,8,12,0.72) 70%)",
                pointerEvents: "auto",
            }}
        >
            <div className="holo-panel" style={{ width: "min(420px, 92vw)", padding: 0 }}>
                <div className="holo-panel-header">Campaign Conquest // Link</div>
                <div className="holo-panel-body" style={{ textAlign: "left" }}>
                    <h1
                        style={{
                            margin: "0 0 8px",
                            fontSize: 28,
                            letterSpacing: "0.04em",
                            color: "var(--holo-text)",
                        }}
                    >
                        World Conquest
                    </h1>
                    <p className="holo-muted" style={{ marginBottom: 16 }}>
                        One commander. Nine rival drones. Ten high-tech territories.
                    </p>

                    <label className="holo-muted" style={{ display: "block", marginBottom: 6 }}>
                        Callsign
                    </label>
                    <input
                        className="holo-input"
                        value={playerName}
                        maxLength={32}
                        placeholder="Enter your name"
                        onChange={(e) => onPlayerNameChange(e.target.value)}
                        style={{ marginBottom: 14 }}
                    />

                    <button
                        type="button"
                        className="holo-btn holo-btn-primary"
                        style={{ width: "100%", marginBottom: 12 }}
                        disabled={!canPlay}
                        onClick={onPlay}
                    >
                        New Campaign
                    </button>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const id = spectateId.trim();
                            if (id) onSpectate(id);
                        }}
                        style={{ display: "flex", gap: 8 }}
                    >
                        <input
                            className="holo-input"
                            name="gameId"
                            placeholder="Spectate game id"
                            value={spectateId}
                            onChange={(e) => setSpectateId(e.target.value)}
                        />
                        <button type="submit" className="holo-btn">
                            Watch
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

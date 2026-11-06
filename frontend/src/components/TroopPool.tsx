import { FactionType, type GameState } from "../types/game";

type Props = {
    game: GameState;
    presentationSpeed: 1 | 2;
    onSpeedChange: (speed: 1 | 2) => void;
    children?: React.ReactNode;
};

export default function TroopPool({
    game,
    presentationSpeed,
    onSpeedChange,
    children,
}: Props) {
    const current = game.factions.find((f) => f.id === game.currentFactionId);
    const isHuman = current?.type === FactionType.Human;

    return (
        <div
            style={{
                position: "absolute",
                left: "50%",
                bottom: 12,
                transform: "translateX(-50%)",
                zIndex: 16,
                width: "min(420px, calc(100vw - 24px))",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                pointerEvents: "auto",
            }}
        >
            {children}
            <div className="holo-panel" style={{ padding: 0 }}>
                <div className="holo-panel-header">
                    <span>Troop pool</span>
                    <span style={{ display: "flex", gap: 6 }}>
                        <button
                            type="button"
                            className="holo-tab"
                            style={{
                                padding: "2px 8px",
                                opacity: presentationSpeed === 1 ? 1 : 0.45,
                                boxShadow:
                                    presentationSpeed === 1
                                        ? "0 0 8px rgba(46,230,255,0.45)"
                                        : undefined,
                            }}
                            onClick={() => onSpeedChange(1)}
                        >
                            1×
                        </button>
                        <button
                            type="button"
                            className="holo-tab"
                            style={{
                                padding: "2px 8px",
                                opacity: presentationSpeed === 2 ? 1 : 0.45,
                                boxShadow:
                                    presentationSpeed === 2
                                        ? "0 0 8px rgba(46,230,255,0.45)"
                                        : undefined,
                            }}
                            onClick={() => onSpeedChange(2)}
                            disabled={isHuman}
                            title={
                                isHuman
                                    ? "2× only during NPC turns"
                                    : "Accelerate NPC presentation"
                            }
                        >
                            2×
                        </button>
                    </span>
                </div>
                <div
                    className="holo-panel-body"
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        gap: 4,
                    }}
                >
                    <div
                        style={{
                            fontSize: 28,
                            fontWeight: 800,
                            color: "var(--holo-accent)",
                        }}
                    >
                        {game.reinforcementPool}
                    </div>
                </div>
            </div>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

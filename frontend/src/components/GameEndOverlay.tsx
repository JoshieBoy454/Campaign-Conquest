import type { Faction, GameState } from "../types/game";
import { GameStatus } from "../types/game";

type Props = {
    game: GameState;
    onHome: () => void;
};

// -------------------------------------------------------------------------
// GameEndOverlay — big winner banner when someone owns all ten
// -------------------------------------------------------------------------
export default function GameEndOverlay({ game, onHome }: Props) {
    if (game.status !== GameStatus.Finished) {
        return null;
    }

    const winner: Faction | undefined = game.factions.find(
        (faction) => faction.id === game.winnerFactionId
    );

    return (
        <div
            role="dialog"
            aria-label="Game finished"
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 40,
                background: "rgba(2,6,23,0.72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
            }}
        >
            <div
                style={{
                    background: "#0F172A",
                    color: "#F8FAFC",
                    borderRadius: 16,
                    padding: "28px 32px",
                    maxWidth: 420,
                    textAlign: "center",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
                }}
            >
                <h2 style={{ marginTop: 0 }}>Victory</h2>
                <p>
                    {winner?.name ?? "A faction"} conquered every active
                    territory after {game.round} rounds.
                </p>
                <button
                    type="button"
                    onClick={onHome}
                    style={{
                        marginTop: 12,
                        padding: "10px 16px",
                        borderRadius: 8,
                        border: "none",
                        background: "#38BDF8",
                        color: "#0B1220",
                        fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    Back to home
                </button>
            </div>
        </div>
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->

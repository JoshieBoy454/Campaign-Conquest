type Props = {
    onClose: () => void;
};

export default function RulesPanel({ onClose }: Props) {
    return (
        <div
            className="holo-panel holo-panel-enter"
            style={{
                position: "absolute",
                top: 56,
                left: 12,
                width: 300,
                maxHeight: "calc(100dvh - 200px)",
                zIndex: 18,
                display: "flex",
                flexDirection: "column",
            }}
        >
            <div className="holo-panel-header">
                <span>Rules</span>
                <button
                    type="button"
                    className="holo-tab"
                    style={{ padding: "2px 8px" }}
                    onClick={onClose}
                    aria-label="Hide Rules"
                >
                    −
                </button>
            </div>
            <div className="holo-panel-body" style={{ flex: 1, minHeight: 0 }}>
                <div style={{ fontSize: 12, lineHeight: 1.45 }}>
                    <p style={{ marginTop: 0 }}>
                        <strong>Win</strong> — control every territory in the campaign.
                    </p>
                    <p>
                        <strong>Reinforce</strong> — place pool troops on your countries, or
                        drag from one owned country to another during reinforce phases (leave
                        at least 1).
                    </p>
                    <p>
                        <strong>Combat</strong> — drag from your country onto an enemy in the
                        Combat phase. Resolve rounds until you hold or pull back.
                    </p>
                    <p>
                        <strong>Spectator</strong> — join with a game id to watch live; no
                        moves.
                    </p>
                    <p style={{ marginBottom: 0 }}>
                        <strong>1× / 2×</strong> — speeds NPC presentation only. Your turn
                        always runs at Normal.
                    </p>
                </div>
            </div>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

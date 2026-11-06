type Props = {
    onClose: () => void;
};

export default function RulesPanel({ onClose }: Props) {
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                background: "rgba(2, 8, 12, 0.45)",
                pointerEvents: "auto",
            }}
            onClick={onClose}
            role="presentation"
        >
            <div
                className="holo-panel holo-panel-enter"
                style={{
                    width: "min(520px, calc(100vw - 32px))",
                    maxHeight: "min(72vh, 640px)",
                    display: "flex",
                    flexDirection: "column",
                }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Rules"
            >
                <div className="holo-panel-header">
                    <span>Rules</span>
                    <button
                        type="button"
                        className="holo-tab"
                        style={{ padding: "2px 8px" }}
                        onClick={onClose}
                        aria-label="Close Rules"
                    >
                        −
                    </button>
                </div>
                <div className="holo-panel-body" style={{ flex: 1, minHeight: 0 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                        <p style={{ marginTop: 0 }}>
                            <strong>Objective</strong> — Conquer every territory in the
                            campaign. The last faction standing wins.
                        </p>
                        <p>
                            <strong>Turns &amp; phases</strong> — Play proceeds faction by
                            faction. Each turn runs Upkeep → Reinforce → Combat → (optional)
                            post-combat reinforce → End. Use <em>Continue</em> when a phase is
                            done.
                        </p>
                        <p>
                            <strong>Troop pool</strong> — At reinforce, spend pool armies onto
                            countries you own (select a country, then place). You can place more
                            than one at a time when the stepper is available.
                        </p>
                        <p>
                            <strong>Move troops</strong> — During reinforce, left-click one of
                            your countries (2+ soldiers), then right-click another you own.
                            Confirm how many to move; leave at least one behind.
                        </p>
                        <p>
                            <strong>Combat</strong> — Left-click your attacking country (2+
                            soldiers), then right-click an enemy. Confirm the commit (one stays
                            home).                             Commit 3+ attackers to roll 3 dice (2→2 dice, 1→1). When
                            defending you roll up to 2 dice (bottom row). When an NPC
                            attacks you, the combat panel opens and you roll defense.
                            Roll rounds or retreat; losses come from the server dice.
                        </p>
                        <p>
                            <strong>Spectator</strong> — Open a game via the spectator link or
                            id to watch live updates. Spectators cannot move, attack, or change
                            speed.
                        </p>
                        <p style={{ marginBottom: 0 }}>
                            <strong>1× / 2×</strong> — Sets how fast NPC turns advance
                            (2× is half the wait between NPC steps).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

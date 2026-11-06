type Props = {
    label: string;
    value: number;
    min: number;
    max: number;
    disabled?: boolean;
    onChange: (next: number) => void;
};

export default function TroopCommitStepper({
    label,
    value,
    min,
    max,
    disabled,
    onChange,
}: Props) {
    const safeMax = Math.max(min, max);
    const clamped = Math.min(safeMax, Math.max(min, value));

    function set(next: number) {
        onChange(Math.min(safeMax, Math.max(min, next)));
    }

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                flexWrap: "wrap",
                width: "100%",
            }}
        >
            <span className="holo-muted" style={{ fontSize: 11 }}>
                {label}
            </span>
            <button
                type="button"
                className="holo-tab"
                style={{ padding: "2px 10px", writingMode: "horizontal-tb" }}
                disabled={disabled || clamped <= min}
                onClick={() => set(clamped - 1)}
                aria-label="Decrease soldiers"
            >
                −
            </button>
            <input
                className="holo-input"
                type="number"
                min={min}
                max={safeMax}
                value={clamped}
                disabled={disabled || safeMax < min}
                onChange={(e) => set(Number(e.target.value) || min)}
                style={{
                    width: 56,
                    textAlign: "center",
                    padding: "4px 6px",
                    fontWeight: 700,
                }}
            />
            <button
                type="button"
                className="holo-tab"
                style={{ padding: "2px 10px", writingMode: "horizontal-tb" }}
                disabled={disabled || clamped >= safeMax}
                onClick={() => set(clamped + 1)}
                aria-label="Increase soldiers"
            >
                +
            </button>
            <button
                type="button"
                className="holo-tab"
                style={{ padding: "2px 8px", writingMode: "horizontal-tb" }}
                disabled={disabled || safeMax < min}
                onClick={() => set(safeMax)}
                title="Use maximum"
            >
                Max
            </button>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

import { useRef } from "react";

type Props = {
    enabled?: boolean;
};

// -------------------------------------------------------------------------
// PixiEffectsLayer — placeholder overlay for later dice/particle polish
// CSS DiceOverlay carries the factual numbers for now
// -------------------------------------------------------------------------
export default function PixiEffectsLayer({ enabled = true }: Props) {
    const hostRef = useRef<HTMLDivElement>(null);

    if (!enabled) {
        return null;
    }

    return (
        <div
            ref={hostRef}
            aria-hidden
            style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                zIndex: 5,
            }}
        />
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->

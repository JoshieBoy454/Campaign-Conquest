import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

type Side = "left" | "right" | "bottom";

type Props = {
    id: string;
    title: string;
    side: Side;
    defaultOpen?: boolean;
    zIndex?: number;
    width?: number;
    /** Stacked vertical tab offset from top when collapsed on left/right edges. */
    tabTop?: number;
    children: ReactNode;
};

function readStored(id: string, fallback: boolean): boolean {
    try {
        const raw = localStorage.getItem(`cc-hud-${id}`);
        if (raw === "1") return true;
        if (raw === "0") return false;
    } catch {
        /* ignore */
    }
    return fallback;
}

const LEFT_TAB_TOP: Record<string, number> = {
    selection: 72,
    log: 200,
    commentary: 320,
    rules: 440,
};

export default function HoloPanel({
    id,
    title,
    side,
    defaultOpen = true,
    zIndex = 10,
    width = 280,
    tabTop,
    children,
}: Props) {
    const [open, setOpen] = useState(() => readStored(id, defaultOpen));
    const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    useEffect(() => {
        try {
            localStorage.setItem(`cc-hud-${id}`, open ? "1" : "0");
        } catch {
            /* ignore */
        }
    }, [id, open]);

    if (!open) {
        const top =
            tabTop ??
            LEFT_TAB_TOP[id] ??
            (side === "left" ? 72 : side === "right" ? 72 : undefined);
        const tabStyle: CSSProperties =
            side === "left"
                ? {
                      position: "absolute",
                      left: 0,
                      top,
                      zIndex,
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                  }
                : side === "right"
                  ? {
                        position: "absolute",
                        right: 0,
                        top: top ?? 72,
                        zIndex,
                        writingMode: "vertical-rl",
                    }
                  : {
                        position: "absolute",
                        left: 20,
                        bottom: 0,
                        zIndex,
                    };

        return (
            <button
                type="button"
                className="holo-tab"
                style={tabStyle}
                onClick={() => setOpen(true)}
                aria-label={`Show ${title}`}
            >
                {title}
            </button>
        );
    }

    const shell: CSSProperties =
        side === "right"
            ? {
                  position: "absolute",
                  top: 56,
                  right: 12,
                  width,
                  maxHeight: "calc(100dvh - 100px)",
                  zIndex,
                  display: "flex",
                  flexDirection: "column",
              }
            : side === "bottom"
              ? {
                    position: "absolute",
                    left: 12,
                    bottom: 12,
                    width,
                    maxHeight: "50vh",
                    zIndex,
                    display: "flex",
                    flexDirection: "column",
                }
              : {
                    position: "absolute",
                    top: 56,
                    left: 12,
                    width,
                    maxHeight: "calc(100dvh - 200px)",
                    zIndex,
                    display: "flex",
                    flexDirection: "column",
                };

    return (
        <div
            className={`holo-panel${reduced ? "" : " holo-panel-enter"}`}
            style={shell}
        >
            <div className="holo-panel-header">
                <span>{title}</span>
                <button
                    type="button"
                    className="holo-tab"
                    style={{
                        padding: "2px 8px",
                        writingMode: "horizontal-tb",
                        transform: "none",
                    }}
                    onClick={() => setOpen(false)}
                    aria-label={`Hide ${title}`}
                >
                    −
                </button>
            </div>
            <div className="holo-panel-body" style={{ flex: 1, minHeight: 0 }}>
                {children}
            </div>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

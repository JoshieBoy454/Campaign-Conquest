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

/** Collapsed left-edge tabs — tight vertical stack. */
const LEFT_TAB_TOP: Record<string, number> = {
    selection: 64,
    log: 112,
    commentary: 160,
    rules: 208,
};

/** Open left panels — non-overlapping vertical slots. */
const LEFT_OPEN_SLOT: Record<string, { top: number | string; maxHeight: string }> =
    {
        selection: { top: 56, maxHeight: "28vh" },
        log: { top: "calc(56px + 28vh + 8px)", maxHeight: "28vh" },
        commentary: { top: "calc(56px + 56vh + 16px)", maxHeight: "28vh" },
    };

const EXIT_MS = 260;

function prefersReducedMotion(): boolean {
    return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

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
    const [exiting, setExiting] = useState(false);
    const reduced = prefersReducedMotion();

    useEffect(() => {
        if (exiting) return;
        try {
            localStorage.setItem(`cc-hud-${id}`, open ? "1" : "0");
        } catch {
            /* ignore */
        }
    }, [id, open, exiting]);

    function requestClose() {
        if (exiting) return;
        if (reduced) {
            setOpen(false);
            return;
        }
        setExiting(true);
    }

    useEffect(() => {
        if (!exiting) return;
        const handle = window.setTimeout(() => {
            setOpen(false);
            setExiting(false);
        }, EXIT_MS);
        return () => window.clearTimeout(handle);
    }, [exiting]);

    if (!open && !exiting) {
        const top =
            tabTop ??
            LEFT_TAB_TOP[id] ??
            (side === "left" ? 64 : side === "right" ? 72 : undefined);
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

    const leftSlot = LEFT_OPEN_SLOT[id];
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
                    top: leftSlot?.top ?? 56,
                    left: 12,
                    width,
                    maxHeight: leftSlot?.maxHeight ?? "28vh",
                    zIndex,
                    display: "flex",
                    flexDirection: "column",
                };

    const animClass = reduced
        ? ""
        : exiting
          ? side === "right"
              ? " holo-panel-exit-right"
              : " holo-panel-exit"
          : side === "right"
            ? " holo-panel-enter-right"
            : " holo-panel-enter";

    return (
        <div className={`holo-panel${animClass}`} style={shell}>
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
                    onClick={requestClose}
                    aria-label={`Hide ${title}`}
                    disabled={exiting}
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

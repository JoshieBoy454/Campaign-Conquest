import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useLeftHudDock } from "./LeftHudDock";

type Side = "left" | "right" | "bottom";

type Props = {
    id: string;
    title: string;
    side: Side;
    defaultOpen?: boolean;
    zIndex?: number;
    width?: number;
    /** Ignored when LeftHudDock packs tabs; kept for callers. */
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

/** Open left panels — non-overlapping vertical slots; inset past tab rail. */
const LEFT_OPEN_SLOT: Record<string, { top: number | string; maxHeight: string }> =
    {
        selection: { top: 56, maxHeight: "28vh" },
        log: { top: "calc(56px + 28vh + 8px)", maxHeight: "28vh" },
        commentary: { top: "calc(56px + 56vh + 16px)", maxHeight: "28vh" },
    };

const LEFT_PANEL_LEFT = 44;
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
    const dock = useLeftHudDock();
    const [open, setOpen] = useState(() => readStored(id, defaultOpen));
    const [exiting, setExiting] = useState(false);
    const reduced = prefersReducedMotion();
    const visiblyOpen = open || exiting;

    useEffect(() => {
        if (side !== "left" || !dock) return;
        dock.setOpen(id, visiblyOpen);
        return () => dock.setOpen(id, null);
    }, [dock, id, side, visiblyOpen]);

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
            side === "left" && dock
                ? dock.tabTopFor(id)
                : (tabTop ?? (side === "left" ? 64 : 72));
        const tabStyle: CSSProperties =
            side === "left"
                ? {
                      position: "absolute",
                      left: 0,
                      top,
                      zIndex: zIndex + 5,
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
                    left: LEFT_PANEL_LEFT,
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

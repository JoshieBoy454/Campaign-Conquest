import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

type DockSide = "left" | "right" | "bottom";

type Props = {
    id: string;
    title: string;
    side: DockSide;
    defaultOpen?: boolean;
    zIndex?: number;
    width?: number;
    /** When true, panel is relative (for stacking inside a dock column) */
    embedded?: boolean;
    children: ReactNode;
};

function readStored(id: string, fallback: boolean): boolean {
    try {
        const raw = localStorage.getItem(`cc-hud-${id}`);
        if (raw === "1") {
            return true;
        }
        if (raw === "0") {
            return false;
        }
    } catch {
        // ignore storage failures
    }
    return fallback;
}

function writeStored(id: string, open: boolean) {
    try {
        localStorage.setItem(`cc-hud-${id}`, open ? "1" : "0");
    } catch {
        // ignore
    }
}

function tabOffset(id: string): number {
    if (id === "selection") {
        return 72;
    }
    if (id === "log") {
        return 200;
    }
    if (id === "factions") {
        return 72;
    }
    return 120;
}

// -------------------------------------------------------------------------
// HudPanel — docked card that collapses to an edge tab
// -------------------------------------------------------------------------
export default function HudPanel({
    id,
    title,
    side,
    defaultOpen = true,
    zIndex = 10,
    width = 260,
    embedded = false,
    children,
}: Props) {
    const [open, setOpen] = useState(() => readStored(id, defaultOpen));

    useEffect(() => {
        writeStored(id, open);
    }, [id, open]);

    if (!open) {
        if (embedded) {
            return (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label={`Show ${title}`}
                    style={{
                        alignSelf: "flex-start",
                        border: "1px solid #CBD5E1",
                        borderRadius: 8,
                        background: "#FFFFFF",
                        color: "#0F172A",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                        padding: "6px 10px",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                    }}
                >
                    {title}
                </button>
            );
        }

        const tabStyle: CSSProperties =
            side === "left"
                ? {
                      position: "absolute",
                      left: 0,
                      top: tabOffset(id),
                      zIndex,
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                      padding: "10px 6px",
                  }
                : side === "right"
                  ? {
                        position: "absolute",
                        right: 0,
                        top: tabOffset(id),
                        zIndex,
                        writingMode: "vertical-rl",
                        padding: "10px 6px",
                    }
                  : {
                        position: "absolute",
                        left: 20,
                        bottom: 0,
                        zIndex,
                        padding: "6px 12px",
                    };

        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={`Show ${title}`}
                style={{
                    ...tabStyle,
                    border: "1px solid #CBD5E1",
                    borderRadius: side === "bottom" ? "8px 8px 0 0" : 8,
                    background: "#FFFFFF",
                    color: "#0F172A",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                }}
            >
                {title}
            </button>
        );
    }

    const shellStyle: CSSProperties = embedded
        ? {
              position: "relative",
              width: "100%",
              maxHeight: id === "log" ? "28vh" : "40vh",
              zIndex,
              flexShrink: 0,
          }
        : side === "left"
          ? {
                position: "absolute",
                top: 56,
                left: 12,
                width,
                maxWidth: "calc(100vw - 24px)",
                maxHeight: "calc(100vh - 180px)",
                zIndex,
            }
          : side === "right"
            ? {
                  position: "absolute",
                  top: 56,
                  right: 12,
                  width,
                  maxWidth: "calc(100vw - 24px)",
                  maxHeight: "calc(100vh - 80px)",
                  zIndex,
              }
            : {
                  position: "absolute",
                  left: 12,
                  bottom: 12,
                  width,
                  maxWidth: "min(360px, calc(100vw - 24px))",
                  zIndex,
              };

    return (
        <div
            style={{
                ...shellStyle,
                display: "flex",
                flexDirection: "column",
                background: "#FFFFFF",
                color: "#111111",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 10px",
                    borderBottom: "1px solid #E2E8F0",
                    background: "#F8FAFC",
                    flexShrink: 0,
                }}
            >
                <strong style={{ fontSize: 13 }}>{title}</strong>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={`Hide ${title}`}
                    style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontWeight: 700,
                        color: "#475569",
                        padding: "2px 6px",
                    }}
                >
                    −
                </button>
            </div>
            <div
                style={{
                    padding: 12,
                    overflowY: "auto",
                    flex: 1,
                    minHeight: 0,
                }}
            >
                {children}
            </div>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

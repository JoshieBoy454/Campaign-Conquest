import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

const LEFT_ORDER = ["selection", "log", "commentary"] as const;
const TAB_START = 64;
const TAB_GAP = 48;

type DockCtx = {
    /** Pass null to unregister when a left panel unmounts. */
    setOpen: (id: string, open: boolean | null) => void;
    tabTopFor: (id: string) => number;
};

const Ctx = createContext<DockCtx | null>(null);

export function LeftHudDockProvider({ children }: { children: ReactNode }) {
    const [openById, setOpenById] = useState<Record<string, boolean>>({});

    const setOpen = useCallback((id: string, open: boolean | null) => {
        setOpenById((prev) => {
            if (open === null) {
                if (!(id in prev)) return prev;
                const next = { ...prev };
                delete next[id];
                return next;
            }
            if (prev[id] === open) return prev;
            return { ...prev, [id]: open };
        });
    }, []);

    const tabTopFor = useCallback(
        (id: string) => {
            // Only mounted + minimized panels take tab slots (packed from the top).
            const closed = LEFT_ORDER.filter((key) => openById[key] === false);
            const idx = closed.indexOf(id as (typeof LEFT_ORDER)[number]);
            if (idx < 0) return TAB_START;
            return TAB_START + idx * TAB_GAP;
        },
        [openById]
    );

    const value = useMemo(
        () => ({ setOpen, tabTopFor }),
        [setOpen, tabTopFor]
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLeftHudDock(): DockCtx | null {
    return useContext(Ctx);
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

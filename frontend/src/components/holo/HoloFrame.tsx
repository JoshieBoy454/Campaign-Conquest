import type { CSSProperties, ReactNode } from "react";

type Props = {
    children: ReactNode;
    style?: CSSProperties;
    className?: string;
};

/** Decorative corner brackets inspired by hologram UI references. */
export default function HoloFrame({ children, style, className }: Props) {
    return (
        <div
            className={className}
            style={{ position: "relative", ...style }}
        >
            <svg
                aria-hidden
                width="100%"
                height="100%"
                style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    overflow: "visible",
                }}
            >
                <path
                    d="M12 2 H28 M2 12 V28"
                    stroke="var(--holo-accent)"
                    strokeWidth="1.5"
                    fill="none"
                    opacity="0.9"
                />
                <path
                    d="Mcalc(100% - 28) 2 Hcalc(100% - 12) Mcalc(100% - 2) 12 V28"
                    stroke="var(--holo-accent)"
                    strokeWidth="1.5"
                    fill="none"
                    opacity="0.9"
                />
            </svg>
            {children}
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

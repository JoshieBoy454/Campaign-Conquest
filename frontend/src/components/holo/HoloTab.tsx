import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    active?: boolean;
};

export default function HoloTab({
    children,
    active,
    className,
    style,
    ...rest
}: Props) {
    return (
        <button
            type="button"
            className={`holo-tab${className ? ` ${className}` : ""}`}
            style={{
                opacity: active === false ? 0.55 : 1,
                ...style,
            }}
            {...rest}
        >
            {children}
        </button>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

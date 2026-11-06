import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    danger?: boolean;
};

export default function HoloButton({
    children,
    danger,
    className,
    style,
    ...rest
}: Props) {
    return (
        <button
            type="button"
            className={`holo-btn${className ? ` ${className}` : ""}`}
            style={{
                ...(danger
                    ? {
                          borderColor: "var(--holo-danger)",
                          color: "var(--holo-danger)",
                      }
                    : null),
                ...style,
            }}
            {...rest}
        >
            {children}
        </button>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

import { useEffect, useRef } from "react";
import { Application, Graphics, Text } from "pixi.js";

type Props = {
    pulseKey?: string | number | null;
    enabled?: boolean;
};

// -------------------------------------------------------------------------
// PixiEffectsLayer — little flash when combat dice change; map stays MapLibre
// -------------------------------------------------------------------------
export default function PixiEffectsLayer({
    pulseKey = null,
    enabled = true,
}: Props) {
    const hostRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);

    useEffect(() => {
        if (!enabled || !hostRef.current) {
            return;
        }

        const host = hostRef.current;
        let destroyed = false;
        const app = new Application();

        void (async () => {
            await app.init({
                resizeTo: host,
                backgroundAlpha: 0,
                antialias: true,
            });
            if (destroyed) {
                app.destroy(true);
                return;
            }
            host.appendChild(app.canvas);
            appRef.current = app;
        })();

        return () => {
            destroyed = true;
            appRef.current = null;
            app.destroy(true);
            while (host.firstChild) {
                host.removeChild(host.firstChild);
            }
        };
    }, [enabled]);

    useEffect(() => {
        const app = appRef.current;
        if (!app || pulseKey == null) {
            return;
        }

        const reduced =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const burst = new Graphics()
            .circle(0, 0, reduced ? 18 : 36)
            .fill({ color: 0xf97316, alpha: 0.55 });
        burst.x = app.screen.width / 2;
        burst.y = app.screen.height * 0.72;
        app.stage.addChild(burst);

        const label = new Text({
            text: "CLASH",
            style: {
                fill: 0xffffff,
                fontSize: 18,
                fontWeight: "700",
            },
        });
        label.anchor.set(0.5);
        label.x = burst.x;
        label.y = burst.y;
        app.stage.addChild(label);

        const started = performance.now();
        const tick = () => {
            const t = (performance.now() - started) / (reduced ? 200 : 700);
            if (t >= 1) {
                app.stage.removeChild(burst);
                app.stage.removeChild(label);
                burst.destroy();
                label.destroy();
                app.ticker.remove(tick);
                return;
            }
            burst.scale.set(1 + t * 1.8);
            burst.alpha = 0.55 * (1 - t);
            label.alpha = 1 - t;
        };
        app.ticker.add(tick);
    }, [pulseKey]);

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

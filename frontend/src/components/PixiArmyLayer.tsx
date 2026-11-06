import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CombatState, Faction, Territory } from "../types/game";

type Props = {
    map: MapLibreMap | null;
    enabled: boolean;
    centers: Record<string, [number, number]>;
    territories: Territory[];
    factions: Faction[];
    combat: CombatState | null;
};

/** Lightweight geo-synced Pixi markers; atlas sprites plug in when manifests exist. */
export default function PixiArmyLayer({
    map,
    enabled,
    centers,
    territories,
    factions,
    combat,
}: Props) {
    const hostRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const layerRef = useRef<Container | null>(null);

    useEffect(() => {
        if (!enabled || !hostRef.current) return;
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
            app.canvas.style.pointerEvents = "none";
            const layer = new Container();
            app.stage.addChild(layer);
            appRef.current = app;
            layerRef.current = layer;
        })();

        return () => {
            destroyed = true;
            layerRef.current = null;
            appRef.current?.destroy(true);
            appRef.current = null;
        };
    }, [enabled]);

    useEffect(() => {
        if (!map || !enabled) return;

        const redraw = () => {
            const app = appRef.current;
            const layer = layerRef.current;
            if (!app || !layer) return;
            layer.removeChildren();

            for (const territory of territories) {
                const ll = centers[territory.countryId];
                if (!ll) continue;
                const owner = factions.find(
                    (f) => f.id === territory.ownerFactionId
                );
                const p = map.project(ll);
                const g = new Graphics();
                const color = Number.parseInt(
                    (owner?.color ?? "#888888").replace("#", ""),
                    16
                );
                g.circle(0, 0, 7);
                g.fill({ color, alpha: 0.9 });
                g.stroke({ width: 1.5, color: 0x2ee6ff, alpha: 0.9 });
                g.x = p.x;
                g.y = p.y - 18;
                layer.addChild(g);

                if (
                    combat &&
                    (combat.sourceCountryId === territory.countryId ||
                        combat.destinationCountryId === territory.countryId)
                ) {
                    const ring = new Graphics();
                    ring.circle(0, 0, 14);
                    ring.stroke({ width: 2, color: 0xff4d6d, alpha: 0.85 });
                    ring.x = p.x;
                    ring.y = p.y - 18;
                    layer.addChild(ring);
                }
            }
        };

        redraw();
        map.on("move", redraw);
        map.on("zoom", redraw);
        map.on("resize", redraw);
        return () => {
            map.off("move", redraw);
            map.off("zoom", redraw);
            map.off("resize", redraw);
        };
    }, [map, enabled, centers, territories, factions, combat]);

    if (!enabled) return null;

    return (
        <div
            ref={hostRef}
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 4,
                pointerEvents: "none",
            }}
        />
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

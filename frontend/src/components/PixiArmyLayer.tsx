import { useEffect, useRef } from "react";
import {
    Application,
    Assets,
    Container,
    Graphics,
    Rectangle,
    Sprite,
    Texture,
} from "pixi.js";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CombatState, Faction, Territory } from "../types/game";
import {
    presentationQueue,
    type PresentationItem,
} from "../services/presentationQueue";

type FactionManifest = {
    id: string;
    atlas: string;
    frameSize: number;
    muzzleOffset: [number, number];
    animations: { idle: string[]; march: string[]; collapse: string[] };
};

type UnitsManifest = {
    factions: FactionManifest[];
    effects: {
        muzzle: { atlas: string; frames: number; frameSize: number };
        plasma: { atlas: string; frames: number; frameSize: number };
        impact: { atlas: string; frames: number; frameSize: number };
    };
};

type Props = {
    map: MapLibreMap | null;
    enabled: boolean;
    centers: Record<string, [number, number]>;
    territories: Territory[];
    factions: Faction[];
    combat: CombatState | null;
    presentationSpeed?: 1 | 2;
};

function frameTexture(atlas: Texture, index: number, size: number): Texture {
    return new Texture({
        source: atlas.source,
        frame: new Rectangle(index * size, 0, size, size),
    });
}

function tintFromHex(hex: string): number {
    const cleaned = hex.replace("#", "");
    const n = Number.parseInt(cleaned, 16);
    return Number.isFinite(n) ? n : 0x888888;
}

export default function PixiArmyLayer({
    map,
    enabled,
    centers,
    territories,
    factions,
    combat,
    presentationSpeed = 1,
}: Props) {
    const hostRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const layerRef = useRef<Container | null>(null);
    const fxRef = useRef<Container | null>(null);
    const manifestRef = useRef<UnitsManifest | null>(null);
    const texturesRef = useRef<Map<string, Texture>>(new Map());
    const lastCombatKey = useRef<string | null>(null);

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
            const fx = new Container();
            app.stage.addChild(layer);
            app.stage.addChild(fx);
            appRef.current = app;
            layerRef.current = layer;
            fxRef.current = fx;

            try {
                const manifest = (await (
                    await fetch("/assets/manifests/units.json")
                ).json()) as UnitsManifest;
                manifestRef.current = manifest;
                for (const faction of manifest.factions) {
                    const tex = await Assets.load(faction.atlas);
                    texturesRef.current.set(`faction-${faction.id}`, tex);
                }
                for (const key of ["muzzle", "plasma", "impact"] as const) {
                    const tex = await Assets.load(manifest.effects[key].atlas);
                    texturesRef.current.set(key, tex);
                }
            } catch {
                // fall back to graphics markers
            }
        })();

        return () => {
            destroyed = true;
            layerRef.current = null;
            fxRef.current = null;
            appRef.current?.destroy(true);
            appRef.current = null;
            texturesRef.current.clear();
        };
    }, [enabled]);

    // Enqueue combat presentation from authoritative combat state
    useEffect(() => {
        if (!combat) return;
        const key = `${combat.sourceCountryId}-${combat.destinationCountryId}-${(combat.lastAttackerDice ?? []).join(",")}-${combat.lastAttackerLosses}-${combat.lastDefenderLosses}`;
        if (lastCombatKey.current === key) return;
        lastCombatKey.current = key;
        presentationQueue.enqueue({
            id: key,
            kind: "combat-round",
            sourceCountryId: combat.sourceCountryId,
            destinationCountryId: combat.destinationCountryId,
            attackerLosses: combat.lastAttackerLosses,
            defenderLosses: combat.lastDefenderLosses,
            speed: presentationSpeed,
        });
        if ((combat.lastDefenderLosses ?? 0) > 0 || (combat.lastAttackerLosses ?? 0) > 0) {
            presentationQueue.enqueue({
                id: `${key}-cas`,
                kind: "casualty",
                sourceCountryId: combat.sourceCountryId,
                destinationCountryId: combat.destinationCountryId,
                attackerLosses: combat.lastAttackerLosses,
                defenderLosses: combat.lastDefenderLosses,
                speed: presentationSpeed,
            });
        }
    }, [combat, presentationSpeed]);

    useEffect(() => {
        if (!map || !enabled) return;

        const redraw = () => {
            const layer = layerRef.current;
            if (!layer) return;
            layer.removeChildren();
            const manifest = manifestRef.current;

            territories.forEach((territory, index) => {
                const ll = centers[territory.countryId];
                if (!ll) return;
                const owner = factions.find(
                    (f) => f.id === territory.ownerFactionId
                );
                const p = map.project(ll);
                const factionIndex = Math.min(
                    Math.max(
                        factions.findIndex((f) => f.id === owner?.id),
                        0
                    ),
                    9
                );
                const factionId = String(factionIndex + 1).padStart(2, "0");
                const atlas = texturesRef.current.get(`faction-${factionId}`);
                const color = tintFromHex(owner?.color ?? "#888888");

                if (atlas && manifest) {
                    const size = manifest.factions[factionIndex]?.frameSize ?? 64;
                    const idle = frameTexture(atlas, 0, size);
                    const sprite = new Sprite(idle);
                    sprite.anchor.set(0.5);
                    sprite.width = 28;
                    sprite.height = 28;
                    sprite.tint = color;
                    sprite.x = p.x;
                    sprite.y = p.y - 16;
                    // Face toward combat target when engaged
                    if (
                        combat?.sourceCountryId === territory.countryId &&
                        centers[combat.destinationCountryId]
                    ) {
                        const t = map.project(centers[combat.destinationCountryId]);
                        sprite.rotation = Math.atan2(t.y - sprite.y, t.x - sprite.x);
                    }
                    layer.addChild(sprite);
                } else {
                    const g = new Graphics();
                    g.circle(0, 0, 7);
                    g.fill({ color, alpha: 0.9 });
                    g.stroke({ width: 1.5, color: 0x2ee6ff, alpha: 0.9 });
                    g.x = p.x;
                    g.y = p.y - 18;
                    layer.addChild(g);
                }

                void index;
            });
        };

        const onPresentation = (item: PresentationItem | null) => {
            const fx = fxRef.current;
            if (!fx || !map || !item) {
                fxRef.current?.removeChildren();
                return;
            }
            fx.removeChildren();
            const srcLl = item.sourceCountryId
                ? centers[item.sourceCountryId]
                : null;
            const dstLl = item.destinationCountryId
                ? centers[item.destinationCountryId]
                : null;
            if (!srcLl || !dstLl) return;
            const a = map.project(srcLl);
            const b = map.project(dstLl);

            const muzzleAtlas = texturesRef.current.get("muzzle");
            const plasmaAtlas = texturesRef.current.get("plasma");
            const impactAtlas = texturesRef.current.get("impact");

            if (muzzleAtlas) {
                const muzzle = new Sprite(frameTexture(muzzleAtlas, 1, 64));
                muzzle.anchor.set(0.5);
                muzzle.width = 22;
                muzzle.height = 22;
                muzzle.x = a.x;
                muzzle.y = a.y - 16;
                fx.addChild(muzzle);
            }

            if (plasmaAtlas) {
                const bolt = new Sprite(frameTexture(plasmaAtlas, 2, 64));
                bolt.anchor.set(0.5);
                bolt.width = 20;
                bolt.height = 12;
                bolt.x = (a.x + b.x) / 2;
                bolt.y = (a.y + b.y) / 2 - 16;
                bolt.rotation = Math.atan2(b.y - a.y, b.x - a.x);
                fx.addChild(bolt);
            }

            if (item.kind === "casualty" && impactAtlas) {
                const impact = new Sprite(frameTexture(impactAtlas, 2, 64));
                impact.anchor.set(0.5);
                impact.width = 28;
                impact.height = 28;
                impact.x = b.x;
                impact.y = b.y - 16;
                fx.addChild(impact);
            }

            const beam = new Graphics();
            beam.moveTo(a.x, a.y - 16);
            beam.lineTo(b.x, b.y - 16);
            beam.stroke({ width: 2, color: 0x2ee6ff, alpha: 0.65 });
            fx.addChild(beam);
        };

        redraw();
        const unsub = presentationQueue.subscribe(onPresentation);
        map.on("move", redraw);
        map.on("zoom", redraw);
        map.on("resize", redraw);
        return () => {
            unsub();
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

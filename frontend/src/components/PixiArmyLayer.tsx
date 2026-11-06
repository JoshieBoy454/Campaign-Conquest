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

function frameIndex(token: string): number {
    const m = /^f(\d+)$/i.exec(token);
    return m ? Number(m[1]) : 0;
}

function badgeTexture(count: number, fill: number): Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 24;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 48, 24);
    const r = 4;
    ctx.fillStyle = `#${fill.toString(16).padStart(6, "0")}`;
    ctx.strokeStyle = "#2ee6ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, 46, 22, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(count), 24, 13);
    return Texture.from(canvas);
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
    const skirmishActive = useRef(false);

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
                /* graphics fallback */
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

    useEffect(() => {
        if (!combat) return;
        const key = `${combat.sourceCountryId}-${combat.destinationCountryId}-${(combat.lastAttackerDice ?? []).join(",")}-${combat.lastAttackerLosses}-${combat.lastDefenderLosses}-${combat.lastDefenderDice?.join(",") ?? ""}`;
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
        if (
            (combat.lastDefenderLosses ?? 0) > 0 ||
            (combat.lastAttackerLosses ?? 0) > 0
        ) {
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

        const factionMeta = (ownerId: string | undefined) => {
            const idx = Math.min(
                Math.max(
                    factions.findIndex((f) => f.id === ownerId),
                    0
                ),
                9
            );
            const id = String(idx + 1).padStart(2, "0");
            return {
                idx,
                id,
                atlas: texturesRef.current.get(`faction-${id}`),
                color: tintFromHex(
                    factions.find((f) => f.id === ownerId)?.color ?? "#888888"
                ),
                size: manifestRef.current?.factions[idx]?.frameSize ?? 64,
                anim: manifestRef.current?.factions[idx]?.animations,
            };
        };

        const addUnit = (
            parent: Container,
            ll: [number, number],
            ownerId: string | undefined,
            offset: { x: number; y: number },
            faceToward?: [number, number],
            frame = 0
        ) => {
            const p = map.project(ll);
            const meta = factionMeta(ownerId);
            if (meta.atlas) {
                const sprite = new Sprite(frameTexture(meta.atlas, frame, meta.size));
                sprite.anchor.set(0.5);
                sprite.width = 26;
                sprite.height = 26;
                sprite.tint = meta.color;
                sprite.x = p.x + offset.x;
                sprite.y = p.y - 14 + offset.y;
                if (faceToward) {
                    const t = map.project(faceToward);
                    sprite.rotation = Math.atan2(
                        t.y - sprite.y,
                        t.x - sprite.x
                    );
                }
                parent.addChild(sprite);
                return sprite;
            }
            const g = new Graphics();
            g.circle(0, 0, 7);
            g.fill({ color: meta.color, alpha: 0.9 });
            g.stroke({ width: 1.5, color: 0x2ee6ff, alpha: 0.9 });
            g.x = p.x + offset.x;
            g.y = p.y - 18 + offset.y;
            parent.addChild(g);
            return g;
        };

        const redrawLod = () => {
            const layer = layerRef.current;
            if (!layer) return;
            layer.removeChildren();
            if (skirmishActive.current) return;

            for (const territory of territories) {
                const ll = centers[territory.countryId];
                if (!ll) continue;
                const face =
                    combat?.sourceCountryId === territory.countryId &&
                    centers[combat.destinationCountryId]
                        ? centers[combat.destinationCountryId]
                        : undefined;
                addUnit(layer, ll, territory.ownerFactionId, { x: 0, y: 0 }, face, 0);

                const owner = factions.find(
                    (f) => f.id === territory.ownerFactionId
                );
                const badge = new Sprite(
                    badgeTexture(
                        territory.soldiers,
                        tintFromHex(owner?.color ?? "#333333")
                    )
                );
                badge.anchor.set(0.5, 1);
                const p = map.project(ll);
                badge.x = p.x;
                badge.y = p.y - 30;
                badge.width = 28;
                badge.height = 14;
                layer.addChild(badge);
            }
        };

        const playSkirmish = (item: PresentationItem) => {
            const fx = fxRef.current;
            const layer = layerRef.current;
            if (!fx || !layer || !map) return;
            const srcLl = item.sourceCountryId
                ? centers[item.sourceCountryId]
                : null;
            const dstLl = item.destinationCountryId
                ? centers[item.destinationCountryId]
                : null;
            if (!srcLl || !dstLl) return;

            skirmishActive.current = true;
            layer.removeChildren();
            fx.removeChildren();

            const srcT = territories.find(
                (t) => t.countryId === item.sourceCountryId
            );
            const dstT = territories.find(
                (t) => t.countryId === item.destinationCountryId
            );
            const midA: [number, number] = [
                srcLl[0] * 0.65 + dstLl[0] * 0.35,
                srcLl[1] * 0.65 + dstLl[1] * 0.35,
            ];
            const midB: [number, number] = [
                srcLl[0] * 0.35 + dstLl[0] * 0.65,
                srcLl[1] * 0.35 + dstLl[1] * 0.65,
            ];

            // 4-sprite set piece: attacker pair vs defender pair
            addUnit(fx, midA, srcT?.ownerFactionId, { x: -10, y: -6 }, dstLl, 1);
            addUnit(fx, midA, srcT?.ownerFactionId, { x: 10, y: 6 }, dstLl, 2);
            addUnit(fx, midB, dstT?.ownerFactionId, { x: -10, y: 6 }, srcLl, 1);
            addUnit(fx, midB, dstT?.ownerFactionId, { x: 10, y: -6 }, srcLl, 2);

            const a = map.project(midA);
            const b = map.project(midB);
            const muzzleAtlas = texturesRef.current.get("muzzle");
            const plasmaAtlas = texturesRef.current.get("plasma");
            const impactAtlas = texturesRef.current.get("impact");

            if (muzzleAtlas) {
                const muzzle = new Sprite(frameTexture(muzzleAtlas, 1, 64));
                muzzle.anchor.set(0.5);
                muzzle.width = 22;
                muzzle.height = 22;
                muzzle.x = a.x + 8;
                muzzle.y = a.y - 10;
                fx.addChild(muzzle);
            }
            if (plasmaAtlas) {
                const bolt = new Sprite(frameTexture(plasmaAtlas, 2, 64));
                bolt.anchor.set(0.5);
                bolt.width = 22;
                bolt.height = 12;
                bolt.x = (a.x + b.x) / 2;
                bolt.y = (a.y + b.y) / 2;
                bolt.rotation = Math.atan2(b.y - a.y, b.x - a.x);
                fx.addChild(bolt);
            }

            if (item.kind === "casualty") {
                if (impactAtlas) {
                    const impact = new Sprite(frameTexture(impactAtlas, 2, 64));
                    impact.anchor.set(0.5);
                    impact.width = 28;
                    impact.height = 28;
                    impact.x =
                        (item.defenderLosses ?? 0) > 0 ? b.x : a.x;
                    impact.y =
                        (item.defenderLosses ?? 0) > 0 ? b.y : a.y;
                    fx.addChild(impact);
                }
                const collapseOwner =
                    (item.defenderLosses ?? 0) > 0
                        ? dstT?.ownerFactionId
                        : srcT?.ownerFactionId;
                const collapseAt =
                    (item.defenderLosses ?? 0) > 0 ? midB : midA;
                const meta = factionMeta(collapseOwner);
                if (meta.atlas && meta.anim?.collapse?.length) {
                    const frame = frameIndex(
                        meta.anim.collapse[meta.anim.collapse.length - 1]
                    );
                    addUnit(
                        fx,
                        collapseAt,
                        collapseOwner,
                        { x: 0, y: 14 },
                        undefined,
                        frame
                    );
                }
            }

            const beam = new Graphics();
            beam.moveTo(a.x, a.y);
            beam.lineTo(b.x, b.y);
            beam.stroke({ width: 2, color: 0x2ee6ff, alpha: 0.55 });
            fx.addChild(beam);
        };

        const onPresentation = (item: PresentationItem | null) => {
            if (!item) {
                skirmishActive.current = false;
                fxRef.current?.removeChildren();
                redrawLod();
                return;
            }
            if (item.kind === "combat-round" || item.kind === "casualty") {
                playSkirmish(item);
            }
        };

        redrawLod();
        const unsub = presentationQueue.subscribe(onPresentation);
        map.on("move", redrawLod);
        map.on("zoom", redrawLod);
        map.on("resize", redrawLod);
        return () => {
            unsub();
            map.off("move", redrawLod);
            map.off("zoom", redrawLod);
            map.off("resize", redrawLod);
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

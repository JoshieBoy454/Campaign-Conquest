import { useEffect, useRef } from "react";
import {
    AnimatedSprite,
    Application,
    Assets,
    Container,
    Graphics,
    Sprite,
    Texture,
} from "pixi.js";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CombatState, Faction, Territory } from "../types/game";
import {
    presentationQueue,
    type PresentationItem,
} from "../services/presentationQueue";

type SoldierManifest = {
    frameSize: number;
    facing: string;
    animations: {
        idle: string[];
        run: string[];
        shoot: string[];
        hit: string[];
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

function tintFromHex(hex: string): number {
    const cleaned = hex.replace("#", "");
    const n = Number.parseInt(cleaned, 16);
    return Number.isFinite(n) ? n : 0x888888;
}

function badgeTexture(count: number, fill: number): Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 64, 32);
    ctx.fillStyle = `#${fill.toString(16).padStart(6, "0")}`;
    ctx.strokeStyle = "#2ee6ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, 62, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(count), 32, 17);
    return Texture.from(canvas);
}

/** Art faces north (+up). Pixi rotation 0 faces east. */
function facingRotation(
    from: { x: number; y: number },
    to: { x: number; y: number }
): number {
    return Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 2;
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
    const animTexturesRef = useRef<Map<string, Texture[]>>(new Map());
    const readyRef = useRef(false);
    const lastCombatKey = useRef<string | null>(null);
    const tickRef = useRef(0);

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
                    await fetch("/assets/manifests/soldier.json")
                ).json()) as SoldierManifest;
                for (const [name, urls] of Object.entries(manifest.animations)) {
                    const textures: Texture[] = [];
                    for (const url of urls) {
                        textures.push(await Assets.load(url));
                    }
                    if (textures.length) {
                        animTexturesRef.current.set(name, textures);
                    }
                }
                readyRef.current = true;
            } catch {
                readyRef.current = false;
            }
        })();

        return () => {
            destroyed = true;
            readyRef.current = false;
            layerRef.current = null;
            fxRef.current = null;
            appRef.current?.destroy(true);
            appRef.current = null;
            animTexturesRef.current.clear();
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

        const ownerColor = (ownerId: string | undefined) =>
            tintFromHex(
                factions.find((f) => f.id === ownerId)?.color ?? "#888888"
            );

        const makeSoldier = (
            parent: Container,
            ll: [number, number],
            ownerId: string | undefined,
            offset: { x: number; y: number },
            anim: "idle" | "run" | "shoot" | "hit",
            faceToward?: [number, number],
            opts?: { loop?: boolean; speed?: number; scale?: number }
        ) => {
            const p = map.project(ll);
            const textures = animTexturesRef.current.get(anim);
            const color = ownerColor(ownerId);
            const scale = opts?.scale ?? 0.42;

            if (textures && textures.length > 0) {
                const sprite = new AnimatedSprite(textures);
                sprite.anchor.set(0.5, 0.62);
                sprite.animationSpeed = opts?.speed ?? (anim === "idle" ? 0.12 : 0.28);
                sprite.loop = opts?.loop ?? anim !== "hit";
                sprite.tint = color;
                sprite.width = 96 * scale;
                sprite.height = 96 * scale;
                sprite.x = p.x + offset.x;
                sprite.y = p.y - 10 + offset.y;
                if (faceToward) {
                    const t = map.project(faceToward);
                    sprite.rotation = facingRotation(sprite, t);
                }
                sprite.play();
                parent.addChild(sprite);
                return sprite;
            }

            const g = new Graphics();
            g.circle(0, 0, 7);
            g.fill({ color, alpha: 0.9 });
            g.stroke({ width: 1.5, color: 0x2ee6ff, alpha: 0.9 });
            g.x = p.x + offset.x;
            g.y = p.y - 18 + offset.y;
            parent.addChild(g);
            return g;
        };

        const placeBadge = (
            parent: Container,
            ll: [number, number],
            count: number,
            colorHex: string,
            yLift = 36
        ) => {
            const badge = new Sprite(
                badgeTexture(count, tintFromHex(colorHex))
            );
            badge.anchor.set(0.5, 1);
            const p = map.project(ll);
            badge.x = p.x;
            badge.y = p.y - yLift;
            badge.width = 44;
            badge.height = 22;
            parent.addChild(badge);
        };

        const redrawLod = () => {
            const layer = layerRef.current;
            if (!layer) return;
            layer.removeChildren();
            tickRef.current += 1;

            for (const territory of territories) {
                const ll = centers[territory.countryId];
                if (!ll) continue;

                const isCombatDest =
                    combat &&
                    territory.countryId === combat.destinationCountryId;
                const isCombatSrc =
                    combat &&
                    territory.countryId === combat.sourceCountryId;
                const displayCount = isCombatDest
                    ? combat.defenderSoldiers
                    : territory.soldiers;

                const face =
                    isCombatSrc && centers[combat.destinationCountryId]
                        ? centers[combat.destinationCountryId]
                        : undefined;

                // Idle soldiers on map; source garrison stays while attackers are mid-field.
                if (!isCombatDest) {
                    makeSoldier(
                        layer,
                        ll,
                        territory.ownerFactionId,
                        { x: 0, y: 0 },
                        combat && isCombatSrc ? "idle" : "idle",
                        face,
                        { loop: true, speed: 0.1, scale: 0.38 }
                    );
                }

                const owner = factions.find(
                    (f) => f.id === territory.ownerFactionId
                );
                placeBadge(
                    layer,
                    ll,
                    displayCount,
                    owner?.color ?? "#333333",
                    combat ? 22 : 38
                );
            }

            if (combat) {
                const srcLl = centers[combat.sourceCountryId];
                const dstLl = centers[combat.destinationCountryId];
                if (srcLl && dstLl) {
                    const mid: [number, number] = [
                        srcLl[0] * 0.55 + dstLl[0] * 0.45,
                        srcLl[1] * 0.55 + dstLl[1] * 0.45,
                    ];
                    const atkColor =
                        factions.find((f) => f.id === combat.attackerFactionId)
                            ?.color ?? "#2ee6ff";
                    makeSoldier(
                        layer,
                        mid,
                        combat.attackerFactionId,
                        { x: -14, y: -4 },
                        "shoot",
                        dstLl,
                        { loop: true, speed: 0.32, scale: 0.46 }
                    );
                    makeSoldier(
                        layer,
                        mid,
                        combat.attackerFactionId,
                        { x: 14, y: 8 },
                        "shoot",
                        dstLl,
                        { loop: true, speed: 0.28, scale: 0.42 }
                    );
                    placeBadge(layer, mid, combat.attackerSoldiers, atkColor, 42);

                    const defMid: [number, number] = [
                        srcLl[0] * 0.35 + dstLl[0] * 0.65,
                        srcLl[1] * 0.35 + dstLl[1] * 0.65,
                    ];
                    makeSoldier(
                        layer,
                        defMid,
                        combat.defenderFactionId,
                        { x: 0, y: 0 },
                        "shoot",
                        srcLl,
                        { loop: true, speed: 0.26, scale: 0.44 }
                    );
                }
            }
        };

        const playSkirmish = (item: PresentationItem) => {
            const fx = fxRef.current;
            if (!fx || !map) return;
            const srcLl = item.sourceCountryId
                ? centers[item.sourceCountryId]
                : null;
            const dstLl = item.destinationCountryId
                ? centers[item.destinationCountryId]
                : null;
            if (!srcLl || !dstLl) return;

            fx.removeChildren();

            const midA: [number, number] = [
                srcLl[0] * 0.55 + dstLl[0] * 0.45,
                srcLl[1] * 0.55 + dstLl[1] * 0.45,
            ];
            const midB: [number, number] = [
                srcLl[0] * 0.35 + dstLl[0] * 0.65,
                srcLl[1] * 0.35 + dstLl[1] * 0.65,
            ];

            if (item.kind === "casualty") {
                if ((item.defenderLosses ?? 0) > 0) {
                    makeSoldier(
                        fx,
                        midB,
                        undefined,
                        { x: 18, y: -8 },
                        "hit",
                        srcLl,
                        { loop: false, speed: 0.35, scale: 0.4 }
                    );
                }
                if ((item.attackerLosses ?? 0) > 0) {
                    makeSoldier(
                        fx,
                        midA,
                        undefined,
                        { x: -18, y: 8 },
                        "hit",
                        dstLl,
                        { loop: false, speed: 0.35, scale: 0.4 }
                    );
                }
            } else {
                // Brief run pulse toward the fight on each round.
                makeSoldier(
                    fx,
                    midA,
                    undefined,
                    { x: 0, y: -16 },
                    "run",
                    dstLl,
                    { loop: true, speed: 0.4, scale: 0.36 }
                );
            }

            const a = map.project(midA);
            const b = map.project(midB);
            const beam = new Graphics();
            beam.moveTo(a.x, a.y);
            beam.lineTo(b.x, b.y);
            beam.stroke({ width: 2, color: 0x2ee6ff, alpha: 0.4 });
            fx.addChild(beam);
        };

        const onPresentation = (item: PresentationItem | null) => {
            if (!item) {
                fxRef.current?.removeChildren();
                redrawLod();
                return;
            }
            if (item.kind === "combat-round" || item.kind === "casualty") {
                playSkirmish(item);
            }
        };

        // Wait briefly for textures if still loading, then draw.
        let cancelled = false;
        const tryDraw = () => {
            if (cancelled) return;
            if (!readyRef.current && animTexturesRef.current.size === 0) {
                window.setTimeout(tryDraw, 80);
                return;
            }
            redrawLod();
        };
        tryDraw();

        const unsub = presentationQueue.subscribe(onPresentation);
        map.on("move", redrawLod);
        map.on("zoom", redrawLod);
        map.on("resize", redrawLod);
        return () => {
            cancelled = true;
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

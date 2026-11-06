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

/**
 * Soldier art faces north (toward top of texture).
 * Pixi y grows downward; atan2 from +X, then align art-forward (-Y) to the target.
 */
function facingRotation(
    from: { x: number; y: number },
    to: { x: number; y: number }
): number {
    return Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 2;
}

/** Shared idle facing so every garrison points the same way on the map. */
const IDLE_FACING = 0;

/** Display scale — ~3× prior size ("at least 200% bigger"). */
const SCALE_IDLE = 1.15;
const SCALE_COMBAT = 1.3;
const SCALE_FX = 1.2;

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

        const clearContainer = (container: Container | null) => {
            if (!container) return;
            // Destroy (not just remove) so AnimatedSprite tickers don't leak orphans.
            while (container.children.length > 0) {
                container.children[0].destroy({ children: true });
            }
        };

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
            const scale = opts?.scale ?? SCALE_IDLE;

            if (textures && textures.length > 0) {
                const base = textures[0].width || 96;
                const uniform = (96 * scale) / base;
                let rotation = IDLE_FACING;
                if (faceToward) {
                    const t = map.project(faceToward);
                    rotation = facingRotation(
                        { x: p.x + offset.x, y: p.y - 12 + offset.y },
                        t
                    );
                }

                // Idle stays still — only combat/fx clips animate.
                if (anim === "idle") {
                    const sprite = new Sprite(textures[0]);
                    sprite.anchor.set(0.5, 0.55);
                    sprite.tint = color;
                    sprite.scale.set(uniform);
                    sprite.x = p.x + offset.x;
                    sprite.y = p.y - 12 + offset.y;
                    sprite.rotation = rotation;
                    parent.addChild(sprite);
                    return sprite;
                }

                const sprite = new AnimatedSprite(textures);
                sprite.anchor.set(0.5, 0.55);
                sprite.animationSpeed = opts?.speed ?? 0.28;
                sprite.loop = opts?.loop ?? anim !== "hit";
                sprite.tint = color;
                sprite.scale.set(uniform);
                sprite.x = p.x + offset.x;
                sprite.y = p.y - 12 + offset.y;
                sprite.rotation = rotation;
                sprite.play();
                parent.addChild(sprite);
                return sprite;
            }

            const g = new Graphics();
            g.circle(0, 0, 14);
            g.fill({ color, alpha: 0.9 });
            g.stroke({ width: 2, color: 0x2ee6ff, alpha: 0.9 });
            g.x = p.x + offset.x;
            g.y = p.y - 24 + offset.y;
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
            clearContainer(layer);
            tickRef.current += 1;

            for (const territory of territories) {
                const ll = centers[territory.countryId];
                if (!ll) continue;

                const isCombatDest =
                    combat &&
                    territory.countryId === combat.destinationCountryId;
                const displayCount = isCombatDest
                    ? combat.defenderSoldiers
                    : territory.soldiers;

                // Idle soldiers share one facing; combatants aim via faceToward only.
                if (!isCombatDest) {
                    makeSoldier(
                        layer,
                        ll,
                        territory.ownerFactionId,
                        { x: 0, y: 0 },
                        "idle",
                        undefined,
                        { loop: true, speed: 0.1, scale: SCALE_IDLE }
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
                    combat ? 52 : 64
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
                        { x: -22, y: -6 },
                        "shoot",
                        dstLl,
                        { loop: true, speed: 0.32, scale: SCALE_COMBAT }
                    );
                    makeSoldier(
                        layer,
                        mid,
                        combat.attackerFactionId,
                        { x: 22, y: 10 },
                        "shoot",
                        dstLl,
                        { loop: true, speed: 0.28, scale: SCALE_COMBAT }
                    );
                    placeBadge(layer, mid, combat.attackerSoldiers, atkColor, 72);

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
                        { loop: true, speed: 0.26, scale: SCALE_COMBAT }
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

            clearContainer(fx);

            const midA: [number, number] = [
                srcLl[0] * 0.55 + dstLl[0] * 0.45,
                srcLl[1] * 0.55 + dstLl[1] * 0.45,
            ];
            const midB: [number, number] = [
                srcLl[0] * 0.35 + dstLl[0] * 0.65,
                srcLl[1] * 0.35 + dstLl[1] * 0.65,
            ];

            // Only casualty hit clips in the FX layer — no looping run ghosts.
            if (item.kind === "casualty") {
                if ((item.defenderLosses ?? 0) > 0) {
                    makeSoldier(
                        fx,
                        midB,
                        undefined,
                        { x: 28, y: -10 },
                        "hit",
                        srcLl,
                        { loop: false, speed: 0.35, scale: SCALE_FX }
                    );
                }
                if ((item.attackerLosses ?? 0) > 0) {
                    makeSoldier(
                        fx,
                        midA,
                        undefined,
                        { x: -28, y: 10 },
                        "hit",
                        dstLl,
                        { loop: false, speed: 0.35, scale: SCALE_FX }
                    );
                }
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
                clearContainer(fxRef.current);
                redrawLod();
                return;
            }
            if (item.kind === "combat-round" || item.kind === "casualty") {
                playSkirmish(item);
            }
        };

        const onCam = () => {
            // FX is screen-anchored; wipe it on pan/zoom so sprites don't float free.
            clearContainer(fxRef.current);
            redrawLod();
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
        map.on("move", onCam);
        map.on("zoom", onCam);
        map.on("resize", onCam);
        return () => {
            cancelled = true;
            unsub();
            map.off("move", onCam);
            map.off("zoom", onCam);
            map.off("resize", onCam);
            clearContainer(layerRef.current);
            clearContainer(fxRef.current);
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

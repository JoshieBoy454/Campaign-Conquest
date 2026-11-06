import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
    advancePhase,
    allocateReinforcements,
    createGame,
    getCountries,
    getGame,
    retreatCombat,
    rollCombat,
    setNpcSpeed,
    startCombat,
    transferSoldiers,
} from "../services/gameApi";
import { connectGameHub } from "../services/gameHub";
import { apiUrl } from "../services/apiBase";
import { pointOnFeature } from "@turf/point-on-feature";
import type { FeatureCollection } from "geojson";
import CountryInfoPanel from "./CountryInfoPanel";
import FactionPanel from "./FactionPanel";
import PhaseControls from "./PhaseControls";
import DiceOverlay from "./DiceOverlay";
import ActionLog from "./ActionLog";
import BattleCommentary from "./BattleCommentary";
import PixiEffectsLayer from "./PixiEffectsLayer";
import PixiArmyLayer from "./PixiArmyLayer";
import GameEndOverlay from "./GameEndOverlay";
import HoloPanel from "./holo/HoloPanel";
import TroopPool from "./TroopPool";
import RulesPanel from "./RulesPanel";
import {
    addCountryLayers,
    loadCountryGeoJson,
    registerTerrainImages,
    setParticipation,
} from "../map/setupCountryLayers";
import { presentationQueue } from "../services/presentationQueue";
import type { CountryDefinition, GameState } from "../types/game";
import { FactionType, TurnPhase } from "../types/game";

setWorkerUrl(workerUrl);

type MapMode = "menu" | "select" | "play";

type MapProps = {
    mode?: MapMode;
    playerName?: string;
    initialGameId?: string | null;
};

type LngLatPair = [number, number];

export default function Map({
    mode = "select",
    playerName = "",
    initialGameId = null,
}: MapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const map = useRef<MapLibreMap | null>(null);
    const geoRef = useRef<FeatureCollection | null>(null);
    const catalogueIsosRef = useRef<Set<string>>(new Set());
    const previousSelectionRef = useRef<string | number | null>(null);
    const countryCentersRef = useRef<Record<string, LngLatPair>>({});
    const driftTimerRef = useRef<number | null>(null);
    const dragRef = useRef<{
        sourceId: string;
        startLngLat: LngLatPair;
        endLngLat: LngLatPair;
        valid: boolean;
    } | null>(null);
    const [rulesOpen, setRulesOpen] = useState(false);

    const [selectedCountry, setSelectedCountry] = useState<{
        id: string | number;
        name: string;
    } | null>(null);
    const [countries, setCountries] = useState<CountryDefinition[]>([]);
    const [game, setGame] = useState<GameState | null>(null);
    const [isCreatingGame, setIsCreatingGame] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isHost, setIsHost] = useState(false);
    const [hostStatusReady, setHostStatusReady] = useState(!initialGameId);
    const [liveOffline, setLiveOffline] = useState(false);
    const [mapReady, setMapReady] = useState(false);
    const [countriesGeometryReady, setCountriesGeometryReady] = useState(false);
    const [countryCentersReady, setCountryCentersReady] = useState(false);
    const [presentationSpeed, setPresentationSpeed] = useState<1 | 2>(1);
    const [dragLine, setDragLine] = useState<{
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        valid: boolean;
    } | null>(null);

    function mergeGame(next: GameState) {
        setGame((prev) => (!prev || next.version >= prev.version ? next : prev));
    }

    // Load catalogue
    useEffect(() => {
        let cancelled = false;
        void getCountries()
            .then((list) => {
                if (cancelled) return;
                setCountries(list);
                catalogueIsosRef.current = new Set(
                    list.map((c) => c.countryId.toUpperCase())
                );
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load countries."
                    );
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Spectate / resume — default non-host until host-status returns
    useEffect(() => {
        if (!initialGameId) {
            setHostStatusReady(true);
            return;
        }
        let cancelled = false;
        setIsHost(false);
        setHostStatusReady(false);
        void getGame(initialGameId)
            .then((loaded) => {
                if (!cancelled) mergeGame(loaded);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Invalid or missing game id."
                    );
                }
            });
        void fetch(
            apiUrl(`/api/games/${encodeURIComponent(initialGameId)}/host-status`),
            { credentials: "include" }
        )
            .then(async (response) => {
                if (!response.ok) {
                    if (!cancelled) {
                        setIsHost(false);
                        setHostStatusReady(true);
                    }
                    return;
                }
                const body = (await response.json()) as { isHost?: boolean };
                if (!cancelled) {
                    setIsHost(Boolean(body.isHost));
                    setHostStatusReady(true);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setIsHost(false);
                    setHostStatusReady(true);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [initialGameId]);

    // SignalR + poll
    useEffect(() => {
        if (!game?.id) return;
        const gameId = game.id;
        setLiveOffline(false);
        const connection = connectGameHub(gameId, (next) => {
            setLiveOffline(false);
            mergeGame(next);
        });
        connection.onclose(() => setLiveOffline(true));
        connection.onreconnecting(() => setLiveOffline(true));
        connection.onreconnected(() => setLiveOffline(false));
        void connection
            .start()
            .then(() => connection.invoke("JoinGame", gameId))
            .then(() => setLiveOffline(false))
            .catch(() => setLiveOffline(true));
        const poll = window.setInterval(() => {
            if (document.hidden) return;
            void getGame(gameId)
                .then((loaded) => mergeGame(loaded))
                .catch(() => undefined);
        }, 1500);
        return () => {
            window.clearInterval(poll);
            void connection.stop();
        };
    }, [game?.id]);

    // Map bootstrap — once (do not remount when catalogue arrives; that races terrain images)
    useEffect(() => {
        if (!mapContainerRef.current || map.current) return;

        let cancelled = false;
        const currentMap = new MapLibreMap({
            container: mapContainerRef.current,
            style: {
                version: 8,
                sources: {},
                layers: [
                    {
                        id: "background",
                        type: "background",
                        paint: { "background-color": "#03141c" },
                    },
                ],
            },
            center: [20, 20],
            zoom: 1.4,
            minZoom: 1,
            maxZoom: 8,
            renderWorldCopies: false,
            attributionControl: false,
        });
        map.current = currentMap;

        currentMap.on("load", () => {
            if (cancelled) return;
            // Panable empty style + menu immediately; patterns/geo load after.
            setMapReady(true);

            void (async () => {
                try {
                    // Wait briefly for catalogue so selectable flags are correct.
                    for (let i = 0; i < 40 && catalogueIsosRef.current.size === 0; i++) {
                        await new Promise((r) => setTimeout(r, 50));
                        if (cancelled) return;
                    }

                    await registerTerrainImages(currentMap);
                    if (cancelled || !currentMap.getStyle()) return;

                    const isos =
                        catalogueIsosRef.current.size > 0
                            ? catalogueIsosRef.current
                            : new Set<string>();
                    const { collection } = await loadCountryGeoJson(isos);
                    if (cancelled || !currentMap.getStyle()) return;

                    geoRef.current = collection;
                    addCountryLayers(currentMap, collection);
                    setCountriesGeometryReady(true);

                    // Centers from the same parse (no second GeoJSON fetch).
                    const centers: Record<string, LngLatPair> = {};
                    for (const feature of collection.features) {
                        const countryId = String(
                            feature.properties?.iso3 ?? ""
                        ).toUpperCase();
                        if (!/^[A-Z]{3}$/.test(countryId) || centers[countryId]) {
                            continue;
                        }
                        if (
                            feature.geometry?.type !== "Polygon" &&
                            feature.geometry?.type !== "MultiPolygon"
                        ) {
                            continue;
                        }
                        const point = pointOnFeature(feature);
                        const [longitude, latitude] = point.geometry.coordinates;
                        if (
                            Number.isFinite(longitude) &&
                            Number.isFinite(latitude)
                        ) {
                            centers[countryId] = [longitude, latitude];
                        }
                    }
                    countryCentersRef.current = centers;
                    setCountryCentersReady(true);
                } catch (err) {
                    if (cancelled) return;
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to initialise map."
                    );
                }
            })();
        });

        currentMap.on("mouseenter", "countries-interactive", () => {
            currentMap.getCanvas().style.cursor = "pointer";
        });
        currentMap.on("mouseleave", "countries-interactive", () => {
            currentMap.getCanvas().style.cursor = "";
        });

        currentMap.on("click", (event) => {
            if (dragRef.current) return;
            const features = currentMap.queryRenderedFeatures(event.point, {
                layers: ["countries-interactive"],
            });
            const country = features[0];
            if (!country || country.id == null) {
                if (previousSelectionRef.current !== null) {
                    currentMap.setFeatureState(
                        {
                            source: "countries",
                            id: previousSelectionRef.current,
                        },
                        { selected: false }
                    );
                }
                previousSelectionRef.current = null;
                setSelectedCountry(null);
                return;
            }
            const countryId = String(country.id);
            const countryName = String(
                country.properties?.name ?? countryId
            );
            if (previousSelectionRef.current !== null) {
                currentMap.setFeatureState(
                    {
                        source: "countries",
                        id: previousSelectionRef.current,
                    },
                    { selected: false }
                );
            }
            currentMap.setFeatureState(
                { source: "countries", id: countryId },
                { selected: true }
            );
            previousSelectionRef.current = countryId;
            setSelectedCountry({ id: countryId, name: countryName });
        });

        return () => {
            cancelled = true;
            if (driftTimerRef.current) {
                window.clearTimeout(driftTimerRef.current);
            }
            currentMap.remove();
            map.current = null;
        };
    }, []);

    // Camera drift on menu
    useEffect(() => {
        const currentMap = map.current;
        if (!currentMap || !mapReady) return;

        const reduced =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (mode !== "menu" || reduced) {
            if (driftTimerRef.current) {
                window.clearTimeout(driftTimerRef.current);
                driftTimerRef.current = null;
            }
            currentMap.stop();
            return;
        }

        const targets: LngLatPair[] = [
            [10, 30],
            [60, 20],
            [-40, 15],
            [100, 25],
            [-100, 40],
        ];
        let i = 0;
        const tick = () => {
            const center = targets[i % targets.length];
            i += 1;
            currentMap.easeTo({
                center,
                zoom: 1.6 + (i % 3) * 0.15,
                duration: 8000,
                essential: false,
            });
            driftTimerRef.current = window.setTimeout(tick, 8200);
        };
        tick();
        return () => {
            if (driftTimerRef.current) {
                window.clearTimeout(driftTimerRef.current);
                driftTimerRef.current = null;
            }
            currentMap.stop();
        };
    }, [mode, mapReady]);

    // Apply participation + colours when game updates
    useEffect(() => {
        const currentMap = map.current;
        const geo = geoRef.current;
        if (!currentMap || !mapReady || !geo) return;

        if (!game) {
            return;
        }

        const participating = new Set(
            game.territories.map((t) => t.countryId.toUpperCase())
        );
        const colors: Record<string, string> = {};
        for (const territory of game.territories) {
            const owner = game.factions.find(
                (f) => f.id === territory.ownerFactionId
            );
            if (owner) {
                colors[territory.countryId.toUpperCase()] = owner.color;
            }
        }
        geoRef.current = setParticipation(
            currentMap,
            geo,
            participating,
            colors
        );
    }, [game, mapReady]);

    // Presentation speed → NPC API (soft-retry once on version conflict)
    useEffect(() => {
        if (!game || !isHost) return;
        const humanTurn =
            game.factions.find((f) => f.id === game.currentFactionId)?.type ===
            FactionType.Human;
        if (humanTurn && presentationSpeed !== 1) {
            setPresentationSpeed(1);
            return;
        }
        const desired = humanTurn ? 1 : presentationSpeed;
        if ((game.npcSpeed ?? 1) === desired) return;
        const gameId = game.id;
        void setNpcSpeed(gameId, game.version, desired)
            .then(mergeGame)
            .catch(async () => {
                try {
                    const fresh = await getGame(gameId);
                    mergeGame(fresh);
                    if ((fresh.npcSpeed ?? 1) === desired) return;
                    mergeGame(await setNpcSpeed(gameId, fresh.version, desired));
                } catch {
                    /* ignore */
                }
            });
    }, [presentationSpeed, game?.currentFactionId, game?.id, game?.version, isHost]);

    // NPC combat rounds finish server-side — drive Pixi from event stream
    useEffect(() => {
        if (!game) return;
        presentationQueue.reset();
        let cancelled = false;
        let after = 0;

        async function pull() {
            try {
                const response = await fetch(
                    apiUrl(
                        `/api/games/${encodeURIComponent(game!.id)}/events?afterSequence=${after}&limit=100`
                    ),
                    { credentials: "include" }
                );
                if (!response.ok || cancelled) return;
                const rows = (await response.json()) as Array<{
                    eventId: string;
                    sequence?: number;
                    type: string;
                    payloadJson?: string;
                }>;
                for (const row of rows) {
                    after = Math.max(after, row.sequence ?? after);
                    if (row.type !== "NpcCombatRound" || !row.payloadJson) continue;
                    try {
                        const payload = JSON.parse(row.payloadJson) as {
                            sourceCountryId?: string;
                            destinationCountryId?: string;
                            attackerLosses?: number;
                            defenderLosses?: number;
                        };
                        presentationQueue.enqueue({
                            id: row.eventId,
                            kind: "combat-round",
                            sourceCountryId: payload.sourceCountryId,
                            destinationCountryId: payload.destinationCountryId,
                            attackerLosses: payload.attackerLosses,
                            defenderLosses: payload.defenderLosses,
                            speed: presentationSpeed,
                        });
                        if (
                            (payload.attackerLosses ?? 0) > 0 ||
                            (payload.defenderLosses ?? 0) > 0
                        ) {
                            presentationQueue.enqueue({
                                id: `${row.eventId}-cas`,
                                kind: "casualty",
                                sourceCountryId: payload.sourceCountryId,
                                destinationCountryId: payload.destinationCountryId,
                                attackerLosses: payload.attackerLosses,
                                defenderLosses: payload.defenderLosses,
                                speed: presentationSpeed,
                            });
                        }
                    } catch {
                        /* ignore bad payload */
                    }
                }
            } catch {
                /* ignore */
            }
        }

        void pull();
        const handle = window.setInterval(() => void pull(), 2000);
        return () => {
            cancelled = true;
            window.clearInterval(handle);
        };
    }, [game?.id, presentationSpeed]);

    function flyToCountry(countryId: string, countryName: string) {
        const currentMap = map.current;
        const coords = countryCentersRef.current[countryId];
        if (!currentMap || !coords) return;
        setSelectedCountry({ id: countryId, name: countryName });
        currentMap.flyTo({
            center: coords,
            zoom: Math.max(currentMap.getZoom(), 3.5),
            duration: 1000,
        });
    }

    async function runGameAction(action: () => Promise<GameState>) {
        if (!game || actionBusy) return;
        setActionBusy(true);
        setError(null);
        try {
            mergeGame(await action());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed.");
            try {
                mergeGame(await getGame(game.id));
            } catch {
                /* ignore */
            }
        } finally {
            setActionBusy(false);
        }
    }

    async function handleCreateGame() {
        if (!selectedCountry || isCreatingGame || game) return;
        const countryExists = countries.some(
            (c) => c.countryId === String(selectedCountry.id)
        );
        if (!countryExists) {
            setError("This country is not available for game creation.");
            return;
        }
        setIsCreatingGame(true);
        setError(null);
        try {
            const result = await createGame(
                String(selectedCountry.id),
                playerName
            );
            setGame(result.game);
            setIsHost(true);
            setHostStatusReady(true);
            window.history.pushState({}, "", `/game/${result.game.id}`);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to create the game."
            );
        } finally {
            setIsCreatingGame(false);
        }
    }

    function projectDragLine() {
        const currentMap = map.current;
        const drag = dragRef.current;
        if (!currentMap || !drag) {
            setDragLine(null);
            return;
        }
        const a = currentMap.project(drag.startLngLat);
        const b = currentMap.project(drag.endLngLat);
        setDragLine({
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            valid: drag.valid,
        });
    }

    function clearDrag() {
        const currentMap = map.current;
        dragRef.current = null;
        setDragLine(null);
        currentMap?.dragPan.enable();
    }

    // Territory drag (reinforce / attack) — world-anchored arrow
    useEffect(() => {
        const currentMap = map.current;
        if (!currentMap || !mapReady || !game || !isHost) return;
        const canvas = currentMap.getCanvas();

        const evalValid = (sourceId: string, destId: string | null) => {
            const human = game.factions.find((f) => f.type === FactionType.Human);
            const dest = game.territories.find((t) => t.countryId === destId);
            if (!dest || !human || !destId || destId === sourceId) return false;
            if (
                dest.ownerFactionId === human.id &&
                (game.currentPhase === TurnPhase.ReinforcementOne ||
                    game.currentPhase === TurnPhase.ReinforcementTwo)
            ) {
                return true;
            }
            if (
                dest.ownerFactionId !== human.id &&
                game.currentPhase === TurnPhase.Combat &&
                !game.activeCombat
            ) {
                return true;
            }
            return false;
        };

        const onDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            const human = game.factions.find((f) => f.type === FactionType.Human);
            if (!human || game.currentFactionId !== human.id) return;
            const features = currentMap.queryRenderedFeatures(
                [e.offsetX, e.offsetY],
                { layers: ["countries-interactive"] }
            );
            const feat = features[0];
            if (!feat?.id) return;
            const iso = String(feat.id);
            const territory = game.territories.find(
                (t) => t.countryId === iso && t.ownerFactionId === human.id
            );
            if (!territory || territory.soldiers < 2) return;
            const lngLat = currentMap.unproject([e.offsetX, e.offsetY]);
            const pair: LngLatPair = [lngLat.lng, lngLat.lat];
            dragRef.current = {
                sourceId: iso,
                startLngLat: pair,
                endLngLat: pair,
                valid: false,
            };
            currentMap.dragPan.disable();
            projectDragLine();
        };

        const onMove = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const lngLat = currentMap.unproject([e.offsetX, e.offsetY]);
            const features = currentMap.queryRenderedFeatures(
                [e.offsetX, e.offsetY],
                { layers: ["countries-interactive"] }
            );
            const destId = features[0]?.id ? String(features[0].id) : null;
            dragRef.current.endLngLat = [lngLat.lng, lngLat.lat];
            dragRef.current.valid = evalValid(dragRef.current.sourceId, destId);
            projectDragLine();
        };

        const onUp = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const sourceId = dragRef.current.sourceId;
            const features = currentMap.queryRenderedFeatures(
                [e.offsetX, e.offsetY],
                { layers: ["countries-interactive"] }
            );
            const destId = features[0]?.id ? String(features[0].id) : null;
            clearDrag();
            if (!destId || destId === sourceId) return;
            const human = game.factions.find((f) => f.type === FactionType.Human);
            const source = game.territories.find((t) => t.countryId === sourceId);
            const dest = game.territories.find((t) => t.countryId === destId);
            if (!human || !source || !dest) return;

            if (
                dest.ownerFactionId === human.id &&
                (game.currentPhase === TurnPhase.ReinforcementOne ||
                    game.currentPhase === TurnPhase.ReinforcementTwo)
            ) {
                const count = Math.max(1, source.soldiers - 1);
                void runGameAction(() =>
                    transferSoldiers(
                        game.id,
                        game.version,
                        source.countryId,
                        dest.countryId,
                        count
                    )
                );
                return;
            }

            if (
                dest.ownerFactionId !== human.id &&
                game.currentPhase === TurnPhase.Combat &&
                !game.activeCombat
            ) {
                const commit = Math.max(1, source.soldiers - 1);
                void runGameAction(() =>
                    startCombat(
                        game.id,
                        game.version,
                        source.countryId,
                        dest.countryId,
                        commit
                    )
                );
            }
        };

        const onCancel = () => clearDrag();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") clearDrag();
        };

        const onCam = () => {
            if (dragRef.current) projectDragLine();
        };

        canvas.addEventListener("mousedown", onDown);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        window.addEventListener("pointercancel", onCancel);
        window.addEventListener("blur", onCancel);
        window.addEventListener("keydown", onKey);
        currentMap.on("move", onCam);
        currentMap.on("zoom", onCam);
        currentMap.on("resize", onCam);
        return () => {
            canvas.removeEventListener("mousedown", onDown);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("pointercancel", onCancel);
            window.removeEventListener("blur", onCancel);
            window.removeEventListener("keydown", onKey);
            currentMap.off("move", onCam);
            currentMap.off("zoom", onCam);
            currentMap.off("resize", onCam);
            clearDrag();
        };
    }, [game, mapReady, isHost, actionBusy]);

    const selectedCountryData = countries.find(
        (c) => c.countryId === String(selectedCountry?.id)
    );
    const selectedTerritory = game?.territories.find(
        (t) => t.countryId === String(selectedCountry?.id)
    );
    const selectedOwner = game?.factions.find(
        (f) => f.id === selectedTerritory?.ownerFactionId
    );
    const activeFaction = game?.factions.find(
        (f) => f.id === game.currentFactionId
    );

    return (
        <div style={{ width: "100%", height: "100dvh", position: "relative" }}>
            <div
                ref={mapContainerRef}
                style={{ width: "100%", height: "100dvh" }}
            />

            {!countriesGeometryReady && (
                <div
                    className="holo-muted"
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(2,8,12,0.55)",
                        zIndex: 5,
                        pointerEvents: "none",
                    }}
                >
                    Uplinking world mesh…
                </div>
            )}

            {dragLine && (
                <svg
                    style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 14,
                        pointerEvents: "none",
                    }}
                >
                    <defs>
                        <marker
                            id="arrow"
                            markerWidth="8"
                            markerHeight="8"
                            refX="6"
                            refY="3"
                            orient="auto"
                        >
                            <path
                                d="M0,0 L6,3 L0,6 Z"
                                fill={dragLine.valid ? "#2ee6ff" : "#ff4d6d"}
                            />
                        </marker>
                    </defs>
                    <line
                        x1={dragLine.x1}
                        y1={dragLine.y1}
                        x2={dragLine.x2}
                        y2={dragLine.y2}
                        stroke={dragLine.valid ? "#2ee6ff" : "#ff4d6d"}
                        strokeWidth={2}
                        markerEnd="url(#arrow)"
                    />
                </svg>
            )}

            {mode === "select" && !game && !selectedCountry && (
                <div className="holo-panel holo-prompt">
                    Select a starting country on the map
                </div>
            )}

            {selectedCountry && mode !== "menu" && (
                <HoloPanel
                    id="selection"
                    title="Info"
                    side="left"
                    defaultOpen
                    tabTop={64}
                >
                    <CountryInfoPanel
                        selectedCountry={selectedCountry}
                        selectedCountryData={selectedCountryData}
                        selectedTerritory={selectedTerritory}
                        selectedOwner={selectedOwner}
                        gameExists={!!game}
                        isCreatingGame={isCreatingGame}
                        onCreateGame={() => void handleCreateGame()}
                    />
                </HoloPanel>
            )}

            {game && (
                <HoloPanel
                    id="log"
                    title="Log"
                    side="left"
                    defaultOpen
                    tabTop={112}
                >
                    <ActionLog gameId={game.id} />
                </HoloPanel>
            )}

            {game && (
                <HoloPanel
                    id="commentary"
                    title="Battle AI"
                    side="left"
                    defaultOpen={false}
                    tabTop={160}
                >
                    <BattleCommentary gameId={game.id} />
                </HoloPanel>
            )}

            {rulesOpen && <RulesPanel onClose={() => setRulesOpen(false)} />}

            {mode !== "menu" && (
                <button
                    type="button"
                    className="holo-fab"
                    aria-label="Rules"
                    title="Rules"
                    onClick={() => setRulesOpen((v) => !v)}
                >
                    i
                </button>
            )}

            {game && (
                <HoloPanel id="factions" title={`Round ${game.round}`} side="right">
                    {playerName && (
                        <p className="holo-muted" style={{ marginBottom: 8 }}>
                            Logged in: <strong>{playerName}</strong>
                        </p>
                    )}
                    <FactionPanel
                        game={game}
                        activeFaction={activeFaction}
                        onFlyToCountry={flyToCountry}
                    />
                </HoloPanel>
            )}

            {game && (
                <DiceOverlay
                    combat={game.activeCombat}
                    sourceName={
                        game.territories.find(
                            (t) =>
                                t.countryId ===
                                game.activeCombat?.sourceCountryId
                        )?.name
                    }
                    destinationName={
                        game.territories.find(
                            (t) =>
                                t.countryId ===
                                game.activeCombat?.destinationCountryId
                        )?.name
                    }
                />
            )}

            <PixiEffectsLayer
                enabled={Boolean(game)}
                pulseKey={
                    game?.activeCombat
                        ? `${game.activeCombat.lastAttackerDice?.join("-")}-${game.version}`
                        : null
                }
            />

            <PixiArmyLayer
                map={map.current}
                enabled={Boolean(game) && countryCentersReady}
                centers={countryCentersRef.current}
                territories={game?.territories ?? []}
                factions={game?.factions ?? []}
                combat={game?.activeCombat ?? null}
                presentationSpeed={presentationSpeed}
            />

            {game && (
                <GameEndOverlay
                    game={game}
                    onHome={() => {
                        window.history.pushState({}, "", "/");
                        window.location.assign("/");
                    }}
                />
            )}

            {game && isHost && hostStatusReady && (
                <TroopPool
                    game={game}
                    presentationSpeed={presentationSpeed}
                    onSpeedChange={setPresentationSpeed}
                >
                    <PhaseControls
                        game={game}
                        busy={actionBusy}
                        canAttackSelected={Boolean(
                            selectedTerritory &&
                                activeFaction?.type === FactionType.Human &&
                                selectedTerritory.ownerFactionId !==
                                    activeFaction.id &&
                                game.territories.some(
                                    (t) =>
                                        t.ownerFactionId === activeFaction.id &&
                                        t.soldiers >= 2
                                )
                        )}
                        battleSourceName={
                            game.territories.find(
                                (t) =>
                                    t.countryId ===
                                    game.activeCombat?.sourceCountryId
                            )?.name
                        }
                        battleDestName={
                            game.territories.find(
                                (t) =>
                                    t.countryId ===
                                    game.activeCombat?.destinationCountryId
                            )?.name
                        }
                        onAdvance={() =>
                            void runGameAction(() =>
                                advancePhase(game.id, game.version)
                            )
                        }
                        onAllocate={() => {
                            if (!selectedCountry) {
                                setError(
                                    "Select one of your countries to place troops."
                                );
                                return;
                            }
                            void runGameAction(() =>
                                allocateReinforcements(
                                    game.id,
                                    game.version,
                                    String(selectedCountry.id),
                                    1
                                )
                            );
                        }}
                        onSkipCombat={() =>
                            void runGameAction(() =>
                                advancePhase(game.id, game.version)
                            )
                        }
                        onRollCombat={() =>
                            void runGameAction(() =>
                                rollCombat(game.id, game.version)
                            )
                        }
                        onRetreat={() =>
                            void runGameAction(() =>
                                retreatCombat(game.id, game.version)
                            )
                        }
                        onAttackSelected={() => {
                            const human = game.factions.find(
                                (f) => f.type === FactionType.Human
                            );
                            const source = game.territories.find(
                                (t) =>
                                    t.ownerFactionId === human?.id &&
                                    t.soldiers >= 2
                            );
                            const target = selectedTerritory;
                            if (
                                !source ||
                                !human ||
                                !target ||
                                target.ownerFactionId === human.id
                            ) {
                                setError(
                                    "Select an enemy country and own a land with 2+ soldiers."
                                );
                                return;
                            }
                            void runGameAction(() =>
                                startCombat(
                                    game.id,
                                    game.version,
                                    source.countryId,
                                    target.countryId,
                                    Math.max(1, source.soldiers - 1)
                                )
                            );
                        }}
                    />
                </TroopPool>
            )}

            {game && hostStatusReady && !isHost && (
                <div
                    className="holo-panel"
                    style={{
                        position: "absolute",
                        left: "50%",
                        bottom: 12,
                        transform: "translateX(-50%)",
                        zIndex: 15,
                        padding: "10px 16px",
                        textAlign: "center",
                    }}
                >
                    Spectating — live, read only
                </div>
            )}

            {game && isHost && hostStatusReady && (
                <button
                    type="button"
                    className="holo-btn"
                    onClick={() => {
                        void navigator.clipboard.writeText(
                            `${window.location.origin}/game/${game.id}`
                        );
                    }}
                    style={{
                        position: "absolute",
                        top: 12,
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 16,
                    }}
                >
                    Copy spectator link
                </button>
            )}

            {liveOffline && game && (
                <div
                    className="holo-panel"
                    style={{
                        position: "absolute",
                        top: 12,
                        right: 310,
                        zIndex: 16,
                        padding: "6px 10px",
                        fontSize: 12,
                    }}
                >
                    Live feed offline — refreshing…
                </div>
            )}

            {error && (
                <div
                    className="holo-panel"
                    style={{
                        position: "absolute",
                        top: 52,
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 20,
                        padding: 12,
                        maxWidth: 360,
                        borderColor: "var(--holo-danger)",
                        color: "#ffc9d4",
                    }}
                >
                    {error}
                </div>
            )}

            <div
                className="holo-muted"
                style={{
                    position: "absolute",
                    right: 8,
                    bottom: 4,
                    zIndex: 6,
                    fontSize: 10,
                    pointerEvents: "none",
                }}
            >
                Map data © contributors · Campaign Conquest
            </div>
        </div>
    );
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

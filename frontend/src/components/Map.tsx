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
import PhaseControls, { type PendingCommit } from "./PhaseControls";
import DiceOverlay from "./DiceOverlay";
import ActionLog from "./ActionLog";
import BattleCommentary from "./BattleCommentary";
import PixiEffectsLayer from "./PixiEffectsLayer";
import PixiArmyLayer from "./PixiArmyLayer";
import GameEndOverlay from "./GameEndOverlay";
import HoloPanel from "./holo/HoloPanel";
import { LeftHudDockProvider } from "./holo/LeftHudDock";
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
    const [commitCount, setCommitCount] = useState(1);
    const [pendingCommit, setPendingCommit] = useState<PendingCommit | null>(
        null
    );
    const [combatSourceId, setCombatSourceId] = useState<string | null>(null);
    const [heldCombat, setHeldCombat] = useState<GameState["activeCombat"]>(null);
    const lastCombatRef = useRef<NonNullable<GameState["activeCombat"]> | null>(
        null
    );
    const heldFinishKeyRef = useRef<string | null>(null);
    const holdTimerRef = useRef<number | null>(null);
    const commitCountRef = useRef(1);

    useEffect(() => {
        commitCountRef.current = commitCount;
    }, [commitCount]);

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
        // Re-apply selection after ownership refresh so highlight sticks.
        const selectedId = previousSelectionRef.current;
        if (selectedId != null) {
            currentMap.setFeatureState(
                { source: "countries", id: selectedId },
                { selected: true }
            );
        }
    }, [game, mapReady]);

    // Keep preferred 1×/2×; push to API whenever it differs (applies on NPC steps).
    useEffect(() => {
        if (!game || !isHost) return;
        const desired = presentationSpeed;
        if ((game.npcSpeed ?? 1) === desired) return;
        const gameId = game.id;
        const expectedVersion = game.version;
        void setNpcSpeed(gameId, expectedVersion, desired)
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
                const rows = (await response.json()) as Array<
                    Record<string, unknown>
                >;
                for (const raw of rows) {
                    const sequence = Number(raw.sequence ?? raw.Sequence ?? 0);
                    if (Number.isFinite(sequence)) {
                        after = Math.max(after, sequence);
                    }
                    const type = String(raw.type ?? raw.Type ?? "");
                    const eventId = String(raw.eventId ?? raw.EventId ?? "");
                    const payloadJson =
                        raw.payloadJson != null
                            ? String(raw.payloadJson)
                            : raw.PayloadJson != null
                              ? String(raw.PayloadJson)
                              : "";
                    if (
                        (type !== "NpcCombatRound" &&
                            type !== "ResolveCombatRound") ||
                        !payloadJson
                    ) {
                        continue;
                    }
                    const row = { eventId, payloadJson };
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

    async function runGameAction(
        action: () => Promise<GameState>,
        optimistic?: (prev: GameState) => GameState
    ): Promise<boolean> {
        if (!game || actionBusy) return false;
        setActionBusy(true);
        setError(null);
        if (optimistic) {
            setGame((prev) => (prev ? optimistic(prev) : prev));
        }
        try {
            mergeGame(await action());
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed.");
            try {
                mergeGame(await getGame(game.id));
            } catch {
                /* ignore */
            }
            return false;
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

    // Select source (left-click), then right-click target to transfer or attack.
    useEffect(() => {
        const currentMap = map.current;
        if (!currentMap || !mapReady || !game || !isHost) return;
        const canvas = currentMap.getCanvas();

        const onContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            if (actionBusy) return;

            const human = game.factions.find((f) => f.type === FactionType.Human);
            if (!human || game.currentFactionId !== human.id) return;

            const features = currentMap.queryRenderedFeatures(
                [e.offsetX, e.offsetY],
                { layers: ["countries-interactive"] }
            );
            const destId = features[0]?.id ? String(features[0].id) : null;
            if (!destId) return;

            const sourceId =
                combatSourceId ??
                (selectedCountry ? String(selectedCountry.id) : null);
            if (!sourceId) {
                setError("Select one of your countries first (2+ soldiers).");
                return;
            }

            const source = game.territories.find(
                (t) =>
                    t.countryId === sourceId &&
                    t.ownerFactionId === human.id &&
                    t.soldiers >= 2
            );
            const dest = game.territories.find((t) => t.countryId === destId);
            if (!source) {
                setError(
                    "Select an owned country with at least 2 soldiers, then right-click a target."
                );
                return;
            }
            if (!dest || dest.countryId === source.countryId) return;

            const maxSoldiers = Math.max(1, source.soldiers - 1);
            const reinforcingPhase =
                game.currentPhase === TurnPhase.ReinforcementOne ||
                game.currentPhase === TurnPhase.ReinforcementTwo;

            if (reinforcingPhase && dest.ownerFactionId === human.id) {
                setPendingCommit({
                    kind: "transfer",
                    sourceId: source.countryId,
                    sourceName: source.name,
                    destId: dest.countryId,
                    destName: dest.name,
                    maxSoldiers,
                });
                setCommitCount(maxSoldiers);
                setError(null);
                return;
            }

            if (
                game.currentPhase === TurnPhase.Combat &&
                !game.activeCombat &&
                dest.ownerFactionId !== human.id
            ) {
                setPendingCommit({
                    kind: "attack",
                    sourceId: source.countryId,
                    sourceName: source.name,
                    destId: dest.countryId,
                    destName: dest.name,
                    maxSoldiers,
                });
                setCommitCount(maxSoldiers);
                setError(null);
                return;
            }

            if (reinforcingPhase) {
                setError(
                    "Right-click another country you own to move troops."
                );
            } else if (game.currentPhase === TurnPhase.Combat) {
                setError(
                    game.activeCombat
                        ? "Finish or retreat from the current battle first."
                        : "Right-click an enemy country to attack."
                );
            } else {
                setError("Transfers and attacks are only available in reinforce or combat.");
            }
        };

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPendingCommit(null);
        };

        canvas.addEventListener("contextmenu", onContextMenu);
        window.addEventListener("keydown", onKey);
        return () => {
            canvas.removeEventListener("contextmenu", onContextMenu);
            window.removeEventListener("keydown", onKey);
        };
    }, [
        game,
        mapReady,
        isHost,
        actionBusy,
        combatSourceId,
        selectedCountry,
    ]);

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

    const humanFaction = game?.factions.find((f) => f.type === FactionType.Human);

    // Remember last owned land clicked as the attack source (not always home).
    useEffect(() => {
        if (!selectedTerritory || !humanFaction) return;
        if (
            selectedTerritory.ownerFactionId === humanFaction.id &&
            selectedTerritory.soldiers >= 2
        ) {
            setCombatSourceId(selectedTerritory.countryId);
        }
    }, [selectedTerritory, humanFaction]);

    const rememberedSource =
        combatSourceId != null
            ? game?.territories.find(
                  (t) =>
                      t.countryId === combatSourceId &&
                      t.ownerFactionId === humanFaction?.id &&
                      t.soldiers >= 2
              )
            : undefined;

    const attackSource =
        rememberedSource ??
        (selectedTerritory &&
        humanFaction &&
        selectedTerritory.ownerFactionId === humanFaction.id &&
        selectedTerritory.soldiers >= 2
            ? selectedTerritory
            : null);

    const reinforcing =
        game?.currentPhase === TurnPhase.ReinforcementOne ||
        game?.currentPhase === TurnPhase.ReinforcementTwo;
    const canPlaceOnSelected = Boolean(
        selectedTerritory &&
            humanFaction &&
            selectedTerritory.ownerFactionId === humanFaction.id &&
            (game?.reinforcementPool ?? 0) > 0
    );

    let commitMax = 1;
    if (pendingCommit) {
        commitMax = Math.max(1, pendingCommit.maxSoldiers);
    } else if (reinforcing) {
        commitMax = Math.max(1, game?.reinforcementPool ?? 1);
    } else if (attackSource) {
        commitMax = Math.max(1, attackSource.soldiers - 1);
    }

    useEffect(() => {
        setPendingCommit(null);
        setCombatSourceId(null);
    }, [game?.id, game?.currentPhase, game?.currentFactionId]);

    useEffect(() => {
        setCommitCount((prev) => Math.min(commitMax, Math.max(1, prev || commitMax)));
    }, [commitMax]);

    // Show live combat always; after it ends, flash the last roll briefly then hide.
    useEffect(() => {
        if (game?.activeCombat) {
            if (holdTimerRef.current != null) {
                window.clearTimeout(holdTimerRef.current);
                holdTimerRef.current = null;
            }
            lastCombatRef.current = game.activeCombat;
            heldFinishKeyRef.current = null;
            setHeldCombat(game.activeCombat);
            return;
        }

        // Already started (or finished) the post-fight hold — ignore sticky lastResolvedCombat.
        if (heldFinishKeyRef.current != null) {
            return;
        }

        const finishing =
            game?.lastResolvedCombat ?? lastCombatRef.current ?? null;
        if (!finishing) {
            setHeldCombat(null);
            return;
        }

        heldFinishKeyRef.current = [
            finishing.sourceCountryId,
            finishing.destinationCountryId,
            ...(finishing.lastAttackerDice ?? []),
            ...(finishing.lastDefenderDice ?? []),
            finishing.lastAttackerLosses,
            finishing.lastDefenderLosses,
        ].join("-");
        lastCombatRef.current = finishing;
        setHeldCombat(finishing);
        holdTimerRef.current = window.setTimeout(() => {
            setHeldCombat(null);
            holdTimerRef.current = null;
        }, 2000);
    }, [game?.activeCombat, game?.lastResolvedCombat, game?.version]);

    // Panel: live fight, or brief post-fight hold — never sticky forever.
    const displayCombat = game?.activeCombat ?? heldCombat;

    return (
        <div style={{ width: "100%", height: "100dvh", position: "relative" }}>
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                }}
            >
                <div
                    ref={mapContainerRef}
                    style={{ position: "absolute", inset: 0 }}
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
            </div>

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

            {mode === "select" && !game && !selectedCountry && (
                <div className="holo-panel holo-prompt">
                    Select a starting country on the map
                </div>
            )}

            <LeftHudDockProvider>
                {selectedCountry && mode !== "menu" && (
                    <HoloPanel id="selection" title="Info" side="left" defaultOpen>
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
                    <HoloPanel id="log" title="Log" side="left" defaultOpen>
                        <ActionLog gameId={game.id} />
                    </HoloPanel>
                )}

                {game && (
                    <HoloPanel
                        id="commentary"
                        title="Battle AI"
                        side="left"
                        defaultOpen={false}
                    >
                        <BattleCommentary gameId={game.id} />
                    </HoloPanel>
                )}
            </LeftHudDockProvider>

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

            <PixiEffectsLayer
                enabled={Boolean(game)}
                pulseKey={
                    game?.activeCombat
                        ? `${game.activeCombat.lastAttackerDice?.join("-")}-${game.version}`
                        : null
                }
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
                        canPlaceOnSelected={canPlaceOnSelected}
                        attackFromName={attackSource?.name}
                        battleSourceName={
                            game.territories.find(
                                (t) =>
                                    t.countryId ===
                                    displayCombat?.sourceCountryId
                            )?.name
                        }
                        battleDestName={
                            game.territories.find(
                                (t) =>
                                    t.countryId ===
                                    displayCombat?.destinationCountryId
                            )?.name
                        }
                        commitCount={commitCount}
                        commitMax={commitMax}
                        onCommitCountChange={setCommitCount}
                        pendingCommit={pendingCommit}
                        onClearPending={() => setPendingCommit(null)}
                        onConfirmPending={() => {
                            if (!pendingCommit) return;
                            const pending = pendingCommit;
                            const count = Math.max(
                                1,
                                Math.min(
                                    commitCountRef.current,
                                    pending.maxSoldiers
                                )
                            );
                            const expectedVersion = game.version;
                            void (async () => {
                                const ok =
                                    pending.kind === "transfer"
                                        ? await runGameAction(
                                              () =>
                                                  transferSoldiers(
                                                      game.id,
                                                      expectedVersion,
                                                      pending.sourceId,
                                                      pending.destId,
                                                      count
                                                  ),
                                              (prev) => ({
                                                  ...prev,
                                                  version: prev.version + 1,
                                                  territories:
                                                      prev.territories.map(
                                                          (t) => {
                                                              if (
                                                                  t.countryId ===
                                                                  pending.sourceId
                                                              ) {
                                                                  return {
                                                                      ...t,
                                                                      soldiers:
                                                                          t.soldiers -
                                                                          count,
                                                                  };
                                                              }
                                                              if (
                                                                  t.countryId ===
                                                                  pending.destId
                                                              ) {
                                                                  return {
                                                                      ...t,
                                                                      soldiers:
                                                                          t.soldiers +
                                                                          count,
                                                                  };
                                                              }
                                                              return t;
                                                          }
                                                      ),
                                              })
                                          )
                                        : await runGameAction(
                                              () =>
                                                  startCombat(
                                                      game.id,
                                                      expectedVersion,
                                                      pending.sourceId,
                                                      pending.destId,
                                                      count
                                                  ),
                                              (prev) => {
                                                  const dest =
                                                      prev.territories.find(
                                                          (t) =>
                                                              t.countryId ===
                                                              pending.destId
                                                      );
                                                  const human =
                                                      prev.factions.find(
                                                          (f) =>
                                                              f.type ===
                                                              FactionType.Human
                                                      );
                                                  if (!dest || !human) {
                                                      return {
                                                          ...prev,
                                                          version:
                                                              prev.version + 1,
                                                      };
                                                  }
                                                  return {
                                                      ...prev,
                                                      version: prev.version + 1,
                                                      territories:
                                                          prev.territories.map(
                                                              (t) =>
                                                                  t.countryId ===
                                                                  pending.sourceId
                                                                      ? {
                                                                            ...t,
                                                                            soldiers:
                                                                                t.soldiers -
                                                                                count,
                                                                        }
                                                                      : t
                                                          ),
                                                      activeCombat: {
                                                          attackerFactionId:
                                                              human.id,
                                                          defenderFactionId:
                                                              dest.ownerFactionId,
                                                          sourceCountryId:
                                                              pending.sourceId,
                                                          destinationCountryId:
                                                              pending.destId,
                                                          attackerSoldiers:
                                                              count,
                                                          defenderSoldiers:
                                                              dest.soldiers,
                                                          lastAttackerDice: [],
                                                          lastDefenderDice: [],
                                                          lastAttackerLosses: 0,
                                                          lastDefenderLosses: 0,
                                                      },
                                                  };
                                              }
                                          );
                                if (ok) setPendingCommit(null);
                            })();
                        }}
                        onAdvance={() => {
                            const expectedVersion = game.version;
                            void runGameAction(() =>
                                advancePhase(game.id, expectedVersion)
                            );
                        }}
                        onAllocate={() => {
                            if (!selectedCountry || !canPlaceOnSelected) {
                                setError(
                                    "Select one of your countries to place troops."
                                );
                                return;
                            }
                            const countryId = String(selectedCountry.id);
                            const n = Math.max(
                                1,
                                Math.min(
                                    commitCountRef.current,
                                    game.reinforcementPool
                                )
                            );
                            const expectedVersion = game.version;
                            void runGameAction(
                                () =>
                                    allocateReinforcements(
                                        game.id,
                                        expectedVersion,
                                        countryId,
                                        n
                                    ),
                                (prev) => ({
                                    ...prev,
                                    version: prev.version + 1,
                                    reinforcementPool: Math.max(
                                        0,
                                        prev.reinforcementPool - n
                                    ),
                                    territories: prev.territories.map((t) =>
                                        t.countryId === countryId
                                            ? {
                                                  ...t,
                                                  soldiers: t.soldiers + n,
                                              }
                                            : t
                                    ),
                                })
                            );
                        }}
                        onRollCombat={() => {
                            const expectedVersion = game.version;
                            void runGameAction(() =>
                                rollCombat(game.id, expectedVersion)
                            );
                        }}
                        onRetreat={() => {
                            const expectedVersion = game.version;
                            void runGameAction(() =>
                                retreatCombat(game.id, expectedVersion)
                            );
                        }}
                    />
                    <DiceOverlay
                        combat={displayCombat}
                        localFactionId={humanFaction?.id}
                        sourceName={
                            game.territories.find(
                                (t) =>
                                    t.countryId ===
                                    displayCombat?.sourceCountryId
                            )?.name
                        }
                        destinationName={
                            game.territories.find(
                                (t) =>
                                    t.countryId ===
                                    displayCombat?.destinationCountryId
                            )?.name
                        }
                    />
                </TroopPool>
            )}

            {game && hostStatusReady && !isHost && (
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
                        bottom: 12,
                        transform: "translateX(-50%)",
                        zIndex: 15,
                        width: "min(420px, calc(100vw - 24px))",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                    }}
                >
                    <div
                        className="holo-panel"
                        style={{ padding: "10px 16px", textAlign: "center" }}
                    >
                        Spectating — live, read only
                    </div>
                    <DiceOverlay
                        combat={displayCombat}
                        localFactionId={humanFaction?.id}
                        sourceName={
                            game.territories.find(
                                (t) =>
                                    t.countryId ===
                                    displayCombat?.sourceCountryId
                            )?.name
                        }
                        destinationName={
                            game.territories.find(
                                (t) =>
                                    t.countryId ===
                                    displayCombat?.destinationCountryId
                            )?.name
                        }
                    />
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

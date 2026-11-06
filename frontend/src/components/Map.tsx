import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
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
    startCombat,
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
import PixiEffectsLayer from "./PixiEffectsLayer";
import GameEndOverlay from "./GameEndOverlay";

import type {
    CountryDefinition,
    GameState,
    TurnOrderRoll
} from "../types/game";
import { FactionType, TurnPhase } from "../types/game";


setWorkerUrl(workerUrl);

type MapProps = {
    initialGameId?: string | null;
};

export default function Map({ initialGameId = null }: MapProps) {

    // Stores a reference to the map container element
    // Maplibre requirees an ecisting HTML element to render into
    const mapContainerRef = useRef<HTMLDivElement>(null);

    //Stores the Maplibre/Mapbox map instance
    const map = useRef<MapLibreMap | null>(null); // teh initial value is null because the map hasnt been created yet

    // Stores which country is currently selected 
    const [selectedCountry, setSelectedCountry] = useState<{
        id: string | number;
        name: string;
    } | null>(null) // Is initially null because nothign is selected

    // Stroes the previous id of selected country
    const previousSelectionRef = useRef<string | number | null>(null); // is initialy null for same reason as directly above

    const troopMarkersRef = useRef<Marker[]>([]);

    // plain object on purpose — naming this Map() shadows JS Map and breaks new Map()
    type LngLatPair = [number, number];
    const countryCentersRef = useRef<Record<string, LngLatPair>>({});

    const [countryCentersReady, setCountryCentersReady] = useState(false);

    //Stores the playable countries and their population information
    const [countries, setCountries] = useState<CountryDefinition[]>([]);

    //Stores the current game returned by thebackend
    const [game, setGame] = useState<GameState | null>(null);

    // Stores the D20 results for future dice animations
    const [turnOrderRolls, setTurnOrderRolls] = useState<TurnOrderRoll[]>([]);

    const [isCreatingGame, setIsCreatingGame] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [isHost, setIsHost] = useState(true);

    // Indicates that MapLibre has finished creating its map layers
    const [mapReady, setMapReady] = useState(false);

    // spectate / refresh — pull the game if we landed on /game/:id
    useEffect(() => {
        if (!initialGameId) {
            return;
        }
        let cancelled = false;
        void getGame(initialGameId)
            .then((loaded) => {
                if (!cancelled) {
                    setGame(loaded);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Game not found");
                }
            });

        void fetch(
            apiUrl(`/api/games/${encodeURIComponent(initialGameId)}/host-status`),
            { credentials: "include" }
        )
            .then(async (response) => {
                if (!response.ok) {
                    return;
                }
                const body = (await response.json()) as { isHost?: boolean };
                if (!cancelled) {
                    setIsHost(Boolean(body.isHost));
                }
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [initialGameId]);

    // live updates when a game is up
    useEffect(() => {
        if (!game?.id) {
            return;
        }
        const connection = connectGameHub(game.id, (next) => {
            setGame(next);
        });
        return () => {
            void connection.stop();
        };
    }, [game?.id]);

    useEffect(() => {

        // Prevent state updates if the component unmounts
        let cancelled = false;
    
        async function loadCountries() {
    
            try {
                // Request countries from backend
                const result = await getCountries();
    
                if (!cancelled) {
                    setCountries(result);
                }
            }
            catch (err) {
    
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load country information."
                    );
                }
            }
        }
    
        void loadCountries();
    
        // Cleanup for development Strict Mode and unmounting
        return () => {
            cancelled = true;
        };
    
    }, []);

    useEffect(() => {

        // Checks if the HTML container exists
        // Prevents a second map from being created if it already exists for map.current OR (NOT)mapContainerRef.current
        if (!mapContainerRef.current || map.current){
            return;
        }

        // Creates a Maplibre/Mapbox map
        // This creates a new map instance and stores it in the map.current ref
        map.current = new MapLibreMap({

            // The container the HTML element that will contain the map: mapContainerRef
            container: mapContainerRef.current,
            // Style will be provided by the geojson file: countries.geojson
            style: {
                version: 8,
                sources: {},
                layers: [
                    {
                        id: "background",
                        type: "background",
                        paint:{
                            "background-color": "#90D9ED",
                        },
                    },
                ],
            },
            // Starting position of the "camera" in [longiture, Latituder]
            center: [0, 20],
            // Starting zoom level
            zoom: 1.5,
            // Minimum zoom level
            minZoom: 1,
            // Maximum zoom level
            maxZoom: 8,
            // Prevents the map from being rendered in multiple copies horizontally
            renderWorldCopies: false,
        });

        // Store the Map instance on a local variable: currentMap
        // Used to as a direct reference to the map for the rest of the useEffect
        const currentMap = map.current;

        // Adds a listener event: .on
        // Listens for the load event to finish loading the map
        currentMap.on("load", () => {
            
            // Adds the new geographic data source from the geojson file: countries.geojson
            currentMap.addSource("countries", {
                type: "geojson",
                data: "/countries.geojson",
                promoteId: "ISO3166-1-Alpha-3",
            });

            // Fill layer to render the interior of the countries
            currentMap.addLayer({
                id: "countries-fill",
                type: "fill",
                source: "countries",
                // Dynamic painting based on selection
                paint: {
                    "fill-color": [
                        "case",
                
                        // If the country is selected, highlight it
                        [
                            "boolean",
                            ["feature-state", "selected"],
                            false
                        ],
                        "#DAE2E3",
                
                        // Otherwise, retrieve the owning faction's colour.
                        // Countries without an owner remain neutral
                        [
                            "coalesce",
                            ["feature-state", "factionColor"],
                            "#919C9E"
                        ]
                    ],
                
                    "fill-opacity": 0.85,
                },
            });

            // Outline Layer to render the exterior outline of the countries
            currentMap.addLayer({
                id: "countries-outline",
                type: "line",
                source: "countries",
                paint: {
                    //#222222: darkers color
                    //#FFFFFF: white color
                    "line-color": "#000000",
                    "line-width": 1,
                },
            });

            // Listens for hte mouse to hover over a countrys fill layer then changes the pointer
            currentMap.on("mouseenter", "countries-fill", () => {
                currentMap.getCanvas().style.cursor = "pointer";
            });

            // Listens for the mouse to the leav the countrys fill layer to restore it to the deafault
            currentMap.on("mouseleave", "countries-fill", () => {
                currentMap.getCanvas().style.cursor = "";
            });

            // Listens for clicks on the map
            currentMap.on("click", (event) => {

                // Find any country features at the clicked position.
                const features = currentMap.queryRenderedFeatures(event.point, {
                    layers: ["countries-fill"],
                });

                // Retrieve the first country found, if one exists
                const country = features[0];

                // If no country was clicked, clear the selection.
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
                    {
                        source: "countries",
                        id: countryId,
                    },
                    { selected: true }
                );

                previousSelectionRef.current = countryId;
                setSelectedCountry({
                    id: countryId,
                    name: countryName,
                });
            });
            setMapReady(true);
        });

        // Cleanuo function to remove the map when the component unmounts
        // React in strict mode may try to run additional satup and cleanup cycles to detect lifecycle problems so this clean up function is important to avoid issues
        return () => {
            for (const marker of troopMarkersRef.current) {
                marker.remove();
            }
            troopMarkersRef.current = [];

            // Removes the map instance
            map.current?.remove();
            // Clear the map reference so a new map can be created when nessasary
            map.current = null;
            setMapReady(false);
        };
    }, []);

    // -------------------------------------------------------------------------
    // selectCountry — shared so map clicks and faction fly-to dont fight each other
    // -------------------------------------------------------------------------
    function selectCountry(countryId: string, countryName?: string) {
        const currentMap = map.current;
        if (!currentMap) {
            return;
        }

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
            {
                source: "countries",
                id: countryId,
            },
            { selected: true }
        );

        previousSelectionRef.current = countryId;
        setSelectedCountry({
            id: countryId,
            name: countryName ?? countryId,
        });
    }

    function flyToCountry(countryId: string, countryName: string) {
        const currentMap = map.current;
        const coords = countryCentersRef.current[countryId];

        selectCountry(countryId, countryName);

        if (!currentMap || !coords) {
            console.warn(`No map coordinates for ${countryId}`);
            return;
        }

        const prefersReducedMotion =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        currentMap.flyTo({
            center: coords,
            zoom: Math.max(currentMap.getZoom(), 3.5),
            duration: prefersReducedMotion ? 0 : 1200,
        });
    }


    useEffect(() => {

        // Allows the fetch request to be cancelled during cleanup
        const controller = new AbortController();
    
        async function loadCountryCenters() {
    
            try {
    
                // Retrieve the same GeoJSON file rendered by MapLibre
                const response = await fetch("/countries.geojson", {
                    signal: controller.signal
                });
    
                if (!response.ok) {
                    throw new Error("Unable to load country geometries.");
                }
    
                const geoJson =
                    await response.json() as FeatureCollection;
    
                // Dictionary mapping ISO country IDs to longitude/latitude
                const centers: Record<string, LngLatPair> = {};
    
                // Loop through the geographic features.
                for (const feature of geoJson.features) {
    
                    // Retrieve the same ID used by MapLibre's promoteId
                    const countryId = String(
                        feature.properties?.["ISO3166-1-Alpha-3"] ?? ""
                    ).toUpperCase();
    
                    // Skip features without a valid ISO alpha-3 ID
                    if (!/^[A-Z]{3}$/.test(countryId)) {
                        continue;
                    }
    
                    // Only polygon geometries represent country areas
                    if (
                        feature.geometry?.type !== "Polygon" &&
                        feature.geometry?.type !== "MultiPolygon"
                    ) {
                        continue;
                    }

                    // first valid feature wins — keep it deterministic
                    if (centers[countryId]) {
                        continue;
                    }
    
                    // Calculate a point located on the country's geometry
                    const point = pointOnFeature(feature);
    
                    const [longitude, latitude] = point.geometry.coordinates;

                    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
                        continue;
                    }
    
                    // Store the geographic location for later use
                    centers[countryId] = [longitude, latitude];
                }
    
                // Only update state if the request wasn't cancelled
                if (!controller.signal.aborted) {
                    countryCentersRef.current = centers;
                    setCountryCentersReady(true);
                }
            }
            catch (err) {
    
                // Ignore expected cancellation errors
                if (controller.signal.aborted) {
                    return;
                }
    
                setError(
                    err instanceof Error
                        ? err.message
                        : "Unable to load country coordinates."
                );
            }
        }
    
        void loadCountryCenters();
    
        return () => {
            controller.abort();
        };
    
    }, []);


    useEffect(() => {

        // Retrieve the existing MapLibre instance
        const currentMap = map.current;
    
        // Ensure a game exists and MapLibre has finished loading
        if (!currentMap || !mapReady || !game) {
            return;
        }
    
        // Ensure the source exists
        if (!currentMap.getSource("countries")) {
            return;
        }
    
        // Go through each active game territory
        for (const territory of game.territories) {
    
            // Find the faction that currently owns the territory
            const owner = game.factions.find(
                faction => faction.id === territory.ownerFactionId
            );
    
            if (!owner) {
                continue;
            }
    
            // Apply the owner's colour to the corresponding GeoJSON country feature
            currentMap.setFeatureState(
                {
                    source: "countries",
                    id: territory.countryId,
                },
                {
                    factionColor: owner.color,
                }
            );
        }
    
    }, [game, mapReady]);


    // -------------------------------------------------------------------------
    // Troop markers — only the ten active territories, not every catalogue country
    // -------------------------------------------------------------------------
    useEffect(() => {
        const currentMap = map.current;

        for (const marker of troopMarkersRef.current) {
            marker.remove();
        }
        troopMarkersRef.current = [];

        if (!currentMap || !mapReady || !game || !countryCentersReady) {
            return;
        }

        for (const territory of game.territories) {
            const coords = countryCentersRef.current[territory.countryId];
            if (!coords) {
                console.warn(
                    `Missing coordinates for troop marker: ${territory.countryId}`
                );
                continue;
            }

            const owner = game.factions.find(
                faction => faction.id === territory.ownerFactionId
            );
            const color = owner?.color ?? "#444444";

            const element = document.createElement("div");
            element.textContent = String(territory.soldiers);
            element.title = `${territory.name}: ${territory.soldiers} soldiers`;
            element.setAttribute(
                "aria-label",
                `${territory.name}: ${territory.soldiers} soldiers`
            );
            Object.assign(element.style, {
                minWidth: "28px",
                height: "28px",
                padding: "0 6px",
                borderRadius: "999px",
                backgroundColor: color,
                color: "#FFFFFF",
                border: "2px solid #FFFFFF",
                boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: "700",
                pointerEvents: "none",
                userSelect: "none",
            });

            const marker = new Marker({ element, anchor: "center" })
                .setLngLat(coords)
                .addTo(currentMap);

            troopMarkersRef.current.push(marker);
        }

        return () => {
            for (const marker of troopMarkersRef.current) {
                marker.remove();
            }
            troopMarkersRef.current = [];
        };
    }, [game, mapReady, countryCentersReady]);

    async function runGameAction(action: () => Promise<GameState>) {
        if (!game || actionBusy) {
            return;
        }
        setActionBusy(true);
        setError(null);
        try {
            const next = await action();
            setGame(next);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed.");
            try {
                const refreshed = await getGame(game.id);
                setGame(refreshed);
            } catch {
                // ignore refresh failure
            }
        } finally {
            setActionBusy(false);
        }
    }

    async function handleCreateGame() {

        // Prevent creating a game without a selected country
        if (!selectedCountry) {
            return;
        }
    
        // Prevent duplicate game creation requests
        if (isCreatingGame || game) {
            return;
        }
    
        // Ensure the selected country exists in the playable catalogue
        const countryExists = countries.some(
            country => country.countryId === String(selectedCountry.id)
        );
    
        if (!countryExists) {
            setError("This country is not available for game creation.");
            return;
        }
    
        setIsCreatingGame(true);
        setError(null);
    
        try {
    
            // Send the selected country ID to the backend
            const result = await createGame(String(selectedCountry.id));
    
            // Store the game returned by the backend
            setGame(result.game);
            setIsHost(true);
    
            // Retain the initial D20 results for future animations
            setTurnOrderRolls(result.turnOrderRolls);

            // stable shareable URL for spectators
            window.history.pushState({}, "", `/game/${result.game.id}`);
    
            console.log("Game created successfully:", result.game.id);
        }
        catch (err) {
    
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to create the game."
            );
        }
        finally {
    
            setIsCreatingGame(false);
        }
    }

    const selectedCountryData = countries.find(
        country => country.countryId === String(selectedCountry?.id)
    );
    
    const selectedTerritory = game?.territories.find(
        territory => territory.countryId === String(selectedCountry?.id)
    );
    
    const selectedOwner = game?.factions.find(
        faction => faction.id === selectedTerritory?.ownerFactionId
    );
    
    const activeFaction = game?.factions.find(
        faction => faction.id === game.currentFactionId
    );
    //-------------------------------------------------------
    // Main container for the map and its overlays
    //-------------------------------------------------------
    return (
        
        <div
            style = {{
                width: "100%",
                height: "100vh",
                position: "relative",
            }}
        >

            <div
                /*Connect the div to the map container ref: mapContainerRef*/
                ref = {mapContainerRef}
                //Give teh map a visible area*/
                style = {{
                    width: "100%",
                    height: "100vh",
                }}
            />
            {selectedCountry && (
                <CountryInfoPanel
                    selectedCountry={selectedCountry}
                    selectedCountryData={selectedCountryData}
                    selectedTerritory={selectedTerritory}
                    selectedOwner={selectedOwner}
                    gameExists={!!game}
                    isCreatingGame={isCreatingGame}
                    onCreateGame={() => void handleCreateGame()}
                />
            )}
            {game && (
                <FactionPanel
                    game={game}
                    turnOrderRollCount={turnOrderRolls.length}
                    activeFaction={activeFaction}
                    onFlyToCountry={flyToCountry}
                />
            )}

            {game && selectedCountry && selectedTerritory && game.currentPhase === TurnPhase.Combat && !game.activeCombat && activeFaction?.type === FactionType.Human && (
                <div
                    style={{
                        position: "absolute",
                        left: 300,
                        top: 20,
                        zIndex: 12,
                        background: "#fff",
                        padding: 12,
                        borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    }}
                >
                    <button
                        type="button"
                        disabled={actionBusy || selectedTerritory.soldiers < 1}
                        onClick={() => {
                            const human = game.factions.find((f) => f.type === FactionType.Human);
                            const source = game.territories.find(
                                (t) => t.ownerFactionId === human?.id && t.soldiers >= 2
                            );
                            const target = selectedTerritory;
                            if (!source || !human || target.ownerFactionId === human.id) {
                                setError("Pick an enemy country and own a source with 2+ soldiers.");
                                return;
                            }
                            const commit = Math.max(1, source.soldiers - 1);
                            void runGameAction(() =>
                                startCombat(
                                    game.id,
                                    game.version,
                                    source.countryId,
                                    target.countryId,
                                    commit
                                )
                            );
                        }}
                    >
                        Attack selected with max force
                    </button>
                </div>
            )}

            {game && <ActionLog gameId={game.id} />}

            {game && (
                <DiceOverlay combat={game.activeCombat} turnOrderRolls={turnOrderRolls} />
            )}

            <PixiEffectsLayer
                enabled={Boolean(game)}
                pulseKey={
                    game?.activeCombat
                        ? `${game.activeCombat.lastAttackerDice?.join("-")}-${game.activeCombat.lastDefenderDice?.join("-")}-${game.version}`
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

            {game && isHost && (
                <PhaseControls
                    game={game}
                    busy={actionBusy}
                    onAdvance={() =>
                        void runGameAction(() =>
                            advancePhase(game.id, game.version)
                        )
                    }
                    onAllocate={() => {
                        if (!selectedCountry) {
                            setError("Select one of your countries to place troops.");
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
                />
            )}

            {game && !isHost && (
                <div
                    style={{
                        position: "absolute",
                        left: 20,
                        bottom: 20,
                        zIndex: 15,
                        background: "#111827",
                        color: "#F9FAFB",
                        padding: "10px 14px",
                        borderRadius: 8,
                    }}
                >
                    Spectating — read only
                </div>
            )}

            {game && isHost && (
                <button
                    type="button"
                    onClick={() => {
                        void navigator.clipboard.writeText(
                            `${window.location.origin}/game/${game.id}`
                        );
                    }}
                    style={{
                        position: "absolute",
                        top: 20,
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 16,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#0F172A",
                        color: "#fff",
                        cursor: "pointer",
                    }}
                >
                    Copy spectator link
                </button>
            )}

            {error && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 20,
                        left: 20,
                        padding: 12,
                        maxWidth: 350,
                        backgroundColor: "#FEE2E2",
                        color: "#991B1B",
                        borderRadius: 8,
                        zIndex: 20,
                    }}
                >
                    {error}
                </div>
            )}

        </div>
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->
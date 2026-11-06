import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { createGame, getCountries } from "../services/gameApi";

import type {
    CountryDefinition,
    GameState,
    TurnOrderRoll
} from "../types/game";


setWorkerUrl(workerUrl);

export default function Map() {

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

    //Stores the playable countries and their population information
    const [countries, setCountries] = useState<CountryDefinition[]>([]);

    //Stores the current game returned by thebackend
    const [game, setGame] = useState<GameState | null>(null);

    // Stores the D20 results for future dice animations
    const [turnOrderRolls, setTurnOrderRolls] = useState<TurnOrderRoll[]>([]);

    const [isCreatingGame, setIsCreatingGame] = useState(false);

    const [error, setError] = useState<string | null>(null);

    // Indicates that MapLibre has finished creating its map layers
    const [mapReady, setMapReady] = useState(false);

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

                // Remove the highlight from the previously selected country.
                if (previousSelectionRef.current !== null) {
                    currentMap.setFeatureState(
                        {
                            source: "countries",
                            id: previousSelectionRef.current,
                        },
                        {
                            selected: false,
                        }
                    );
                }

                // If no country was clicked, clear the selection.
                if (!country || country.id == null) {

                    // Clear the stored country ID
                    previousSelectionRef.current = null;

                    // Hide the country information panel
                    setSelectedCountry(null);

                    return;
                }

                // Get  the selected country's ID and name
                const countryId = country.id;

                const countryName = String(
                    country.properties?.name ?? countryId
                );

                // Highlight the new selected country
                currentMap.setFeatureState(
                    {
                        source: "countries",
                        id: countryId,
                    },
                    {
                        selected: true,
                    }
                );

                // Store the new selected country ID
                previousSelectionRef.current = countryId;

                // Display the selected country's information panel
                setSelectedCountry({
                    id: String(countryId),
                    name: countryName,
                });
            });
            setMapReady(true);
        });

        // Cleanuo function to remove the map when the component unmounts
        // React in strict mode may try to run additional satup and cleanup cycles to detect lifecycle problems so this clean up function is important to avoid issues
        return () => {

            // Removes the map instance
            map.current?.remove();
            // Clear the map reference so a new map can be created when nessasary
            map.current = null;
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
    
            // Retain the initial D20 results for future animations
            setTurnOrderRolls(result.turnOrderRolls);
    
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
            {
                // Only shows the panel when a county is selected 
                selectedCountry && (
                    <div
                        style={{
                            // Keeps the position of the panel above the map
                            position: "absolute",
                            top: 20,
                            left: 20,
                            width: 260,
                            maxWidth: "calc(100vw - 40px)",
                            maxHeight: "75vh",
                            overflowY: "auto",
                            padding: 16,
                            backgroundColor: "#FFFFFF",
                            color: "#111111",
                            borderRadius: 8,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                            zIndex: 10,
                        }}
                    >
                        <h3>Selected Country</h3>
                        <p>{selectedCountry.name}</p>
                        <p>{selectedCountry.id}</p>

                        {selectedCountryData && (
                            <>
                                <p>
                                    Population: {selectedCountryData.population.toLocaleString()}
                                </p>

                                <p>
                                    Soldier Value: {selectedCountryData.soldierValue}
                                </p>
                            </>
                        )}

                        {game && selectedTerritory && (
                            <>
                                <p>Owner: {selectedOwner?.name}</p>
                                <p>Soldiers: {selectedTerritory.soldiers}</p>
                            </>
                        )}
                        {!game && (
                            <button
                                type="button"
                                onClick={() => void handleCreateGame()}
                                disabled={!selectedCountryData || isCreatingGame}
                                style={{
                                    padding: "10px 14px",
                                    borderRadius: 6,
                                    border: "none",
                                    backgroundColor: "#1160BF",
                                    color: "#FFFFFF",
                                    cursor: "pointer",
                                    opacity: !selectedCountryData || isCreatingGame ? 0.5 : 1,
                                }}
                            >
                                {isCreatingGame
                                    ? "Creating Game..."
                                    : selectedCountryData
                                        ? "Start Game"
                                        : "Country Unavailable"}
                            </button>
                        )}
                    </div>
                )
            }
            {game && (
                <div
                    style={{
                        position: "absolute",
                        top: 20,
                        right: 20,
                        padding: 16,
                        width: 300,
                        maxWidth: "calc(100vw - 40px)",
                        maxHeight: "calc(100vh - 40px)",
                        overflowY: "auto",
                        boxSizing: "border-box",
                        backgroundColor: "#FFFFFF",
                        color: "#111111",
                        borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                        zIndex: 10,
                    }}
                >
                    <h3>Campaign Conquest</h3>

                    <p>Round: {game.round}</p>

                    <p>Current Turn: {activeFaction?.name ?? "Unknown"}</p>

                    <p>D20 Rolls Recorded: {turnOrderRolls.length}</p>

                    <hr />

                    <h4>Factions</h4>

                    {[...game.factions]
                        .sort((a, b) => a.turnPosition - b.turnPosition)
                        .map(faction => {

                            // Retrieve the countries owned by this faction
                            const ownedTerritories = game.territories.filter(
                                territory => territory.ownerFactionId === faction.id
                            );

                            // Calculate the faction's total soldiers
                            const totalSoldiers = ownedTerritories.reduce(
                                (total, territory) => total + territory.soldiers,
                                0
                            );

                            return (
                                <div
                                    key={faction.id}
                                    style={{
                                        marginBottom: 12,
                                        paddingBottom: 8,
                                        borderBottom: "1px solid #DDDDDD",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: 12,
                                                height: 12,
                                                borderRadius: 3,
                                                backgroundColor: faction.color,
                                                flexShrink: 0,
                                            }}
                                        />

                                        <strong>
                                            {faction.turnPosition}. {faction.name}
                                        </strong>
                                    </div>

                                    <p>Total Soldiers: {totalSoldiers}</p>

                                    {ownedTerritories.map(territory => (
                                        <p key={territory.countryId}>
                                            {territory.name}: {territory.soldiers}
                                        </p>
                                    ))}
                                </div>
                            );
                        })}
                </div>
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
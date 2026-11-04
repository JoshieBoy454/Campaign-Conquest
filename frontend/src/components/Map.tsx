import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

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
                        [
                            "boolean",
                            ["feature-state", "selected"],
                            false
                        ],
                        "#DAE2E3",
                        "#919C9E",
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

            // Listens for clicks on the countrys fill layer 
            currentMap.on("click", "countries-fill", (event) => {

                // Selects the first feature in the array of geographic features detected at the clicked area
                const country = event.features?.[0];

                // if no feature is found it stop executing
                if(!country || country.id == null) {
                    return;
                }

                // Otherwise  it retrieves teh features id
                const countryId = country.id;

                // retrieves the countrys name fronm the geojson
                const countryName = String(
                    country.properties?.name ?? countryId
                );

                //removes the highlight from the previously selected one if it exists
                if (previousSelectionRef.current !== null) {
                    currentMap.setFeatureState({

                        source: "countries",
                        id: previousSelectionRef.current,
                    },
                    {
                        selected: false,
                    }
                    );
                }

                //Highlights the new slected country
                currentMap.setFeatureState(
                    {
                        source: "countries",
                        id: countryId,
                    },
                    {
                        selected: true,
                    }
                );

                previousSelectionRef.current = countryId;
                
                // Updates the info panel
                setSelectedCountry({
                    id: String(countryId),
                    name: countryName,
                });
            });

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
    return (
        // Main container for the map and its overlays
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
                            right: 20,
                            padding: 16,
                            backgroundColor: "#FFFFFF",
                            color: "#111111",
                            borderRadius: 8,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                            // Makes sure teh z positioning is above the map
                            zIndex: 10,
                        }}
                    >
                        <h3>Selected Country</h3>
                        <p>{selectedCountry.name}</p>
                        <p>{selectedCountry.id}</p>

                    </div>
                )
            }
        </div>
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->
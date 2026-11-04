import { useEffect, useRef } from "react";
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
            });

            // Fill layer to render the interior of the countries
            currentMap.addLayer({
                id: "countries-fill",
                type: "fill",
                source: "countries",
                paint: {
                    "fill-color": "#008000",
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

        <div
        // Connect the div to the map container ref: mapContainerRef
            ref = {mapContainerRef}
            // Give teh map a visible area
            style = {{
                width: "100%",
                height: "100vh",
            }}
        />
    );
}
//-----------------------------------------------------------------End of File----------------------------------------------------------------->
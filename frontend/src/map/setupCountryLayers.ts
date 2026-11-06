import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import {
    COUNTRIES_GEOJSON_URL,
    TERRAIN_IMAGE_URLS,
    defaultTerrainClass,
    type TerrainClass,
} from "./terrainConfig";

export type CountryGeoBundle = {
    collection: FeatureCollection;
    selectableIsos: Set<string>;
};

/** Enrich GeoJSON with terrainClass / selectable / participating properties. */
export function enrichCountries(
    collection: FeatureCollection,
    catalogueIsos: Set<string>
): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: collection.features.map((feature) => {
            const iso = String(
                feature.properties?.["ISO3166-1-Alpha-3"] ?? ""
            ).toUpperCase();
            const terrain = defaultTerrainClass(iso);
            return {
                ...feature,
                id: iso || feature.id,
                properties: {
                    ...feature.properties,
                    iso3: iso,
                    terrainClass: terrain,
                    selectable: catalogueIsos.has(iso) ? 1 : 0,
                    participating: 0,
                },
            };
        }),
    };
}

export async function loadCountryGeoJson(
    catalogueIsos: Set<string>
): Promise<CountryGeoBundle> {
    const response = await fetch(COUNTRIES_GEOJSON_URL);
    if (!response.ok) {
        throw new Error("Unable to load country geometries.");
    }
    const raw = (await response.json()) as FeatureCollection;
    const collection = enrichCountries(raw, catalogueIsos);
    return { collection, selectableIsos: catalogueIsos };
}

async function loadTerrainImageOnce(
    map: MapLibreMap,
    id: TerrainClass,
    url: string
): Promise<boolean> {
    if (!map.getStyle?.()) return false;
    try {
        if (map.hasImage(id)) return true;
        const img = await map.loadImage(url);
        if (!map.getStyle?.() || map.hasImage(id)) return true;
        map.addImage(id, img.data, { pixelRatio: 1 });
        return true;
    } catch (err) {
        console.warn(`Terrain image failed: ${id}`, err);
        return false;
    }
}

export async function registerTerrainImages(map: MapLibreMap): Promise<void> {
    const entries = Object.entries(TERRAIN_IMAGE_URLS) as [
        TerrainClass,
        string,
    ][];
    await Promise.all(
        entries.map(async ([id, url]) => {
            const ok = await loadTerrainImageOnce(map, id, url);
            if (!ok) {
                await new Promise((r) => setTimeout(r, 250));
                await loadTerrainImageOnce(map, id, url);
            }
        })
    );
}

export function addCountryLayers(map: MapLibreMap, data: FeatureCollection) {
    if (map.getSource("countries")) {
        (map.getSource("countries") as GeoJSONSource).setData(data);
        return;
    }

    map.addSource("countries", {
        type: "geojson",
        data,
        promoteId: "iso3",
    });

    // Coastal halo (under land) — muted deep teal for near-shore water feel
    map.addLayer({
        id: "coast-halo",
        type: "line",
        source: "countries",
        paint: {
            "line-color": "#0a3a48",
            "line-width": 14,
            "line-opacity": 0.55,
            "line-blur": 6,
        },
    });

    map.addLayer({
        id: "coast-foam",
        type: "line",
        source: "countries",
        paint: {
            "line-color": "#1a6a7a",
            "line-width": 3,
            "line-opacity": 0.35,
            "line-blur": 1.5,
        },
    });

    const underlay: Record<TerrainClass, string> = {
        grassy: "#3a4a28",
        desert: "#5a4a28",
        icy: "#2a3a48",
        city: "#1a2830",
    };

    // Solid underlays so fast zoom never shows empty ocean through land
    for (const terrain of ["grassy", "desert", "icy", "city"] as TerrainClass[]) {
        map.addLayer({
            id: `terrain-under-${terrain}`,
            type: "fill",
            source: "countries",
            filter: ["==", ["get", "terrainClass"], terrain],
            paint: {
                "fill-color": underlay[terrain],
                "fill-opacity": 1,
            },
        });
    }

    // Pattern fills on top of underlays
    for (const terrain of ["grassy", "desert", "icy", "city"] as TerrainClass[]) {
        map.addLayer({
            id: `terrain-${terrain}`,
            type: "fill",
            source: "countries",
            filter: ["==", ["get", "terrainClass"], terrain],
            paint: {
                "fill-pattern": terrain,
                "fill-opacity": 0.92,
            },
        });
    }

    // Faction colour wash (only when feature-state set)
    map.addLayer({
        id: "countries-faction-tint",
        type: "fill",
        source: "countries",
        paint: {
            "fill-color": [
                "coalesce",
                ["feature-state", "factionColor"],
                "rgba(0,0,0,0)",
            ],
            "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "hasOwner"], false],
                0.35,
                0,
            ],
        },
    });

    map.addLayer({
        id: "countries-outline",
        type: "line",
        source: "countries",
        paint: {
            "line-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                "#2ee6ff",
                ["boolean", ["feature-state", "hasOwner"], false],
                ["coalesce", ["feature-state", "factionColor"], "#0a1a20"],
                "#0a1a20",
            ],
            "line-width": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                2.5,
                1,
            ],
        },
    });

    // Hit target: selectable (pre-game) or participating (in-game)
    map.addLayer({
        id: "countries-interactive",
        type: "fill",
        source: "countries",
        filter: [
            "any",
            ["==", ["get", "selectable"], 1],
            ["==", ["get", "participating"], 1],
        ],
        paint: {
            "fill-color": "#ffffff",
            "fill-opacity": 0.01,
        },
    });
}

export function setParticipation(
    map: MapLibreMap,
    data: FeatureCollection,
    participating: Set<string>,
    ownerColorByIso: Record<string, string>
): FeatureCollection {
    const next: FeatureCollection = {
        type: "FeatureCollection",
        features: data.features.map((feature) => {
            const iso = String(feature.properties?.iso3 ?? "").toUpperCase();
            const isIn = participating.has(iso);
            return {
                ...feature,
                properties: {
                    ...feature.properties,
                    participating: isIn ? 1 : 0,
                    selectable: 0,
                    terrainClass: isIn
                        ? "city"
                        : defaultTerrainClass(iso),
                },
            };
        }),
    };

    const source = map.getSource("countries") as GeoJSONSource | undefined;
    source?.setData(next);

    for (const iso of participating) {
        const color = ownerColorByIso[iso];
        if (!color) continue;
        map.setFeatureState(
            { source: "countries", id: iso },
            { hasOwner: true, factionColor: color, selected: false }
        );
    }

    return next;
}

export function resetToSelectable(
    map: MapLibreMap,
    data: FeatureCollection,
    catalogueIsos: Set<string>
): FeatureCollection {
    const next = enrichCountries(
        {
            type: "FeatureCollection",
            features: data.features.map((f) => ({
                ...f,
                properties: {
                    ...f.properties,
                    participating: 0,
                    terrainClass: defaultTerrainClass(
                        String(f.properties?.iso3 ?? "")
                    ),
                },
            })),
        },
        catalogueIsos
    );
    (map.getSource("countries") as GeoJSONSource | undefined)?.setData(next);
    return next;
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

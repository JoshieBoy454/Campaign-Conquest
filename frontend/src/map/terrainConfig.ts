/** ISO alpha-3 → default devastation class (before participation). */

export type TerrainClass = "grassy" | "desert" | "icy" | "city";

export const ICE_ISOS = new Set(["RUS", "ATA", "CAN", "GRL"]);

export const DESERT_ISOS = new Set([
    "AUS",
    "ARE",
    "SAU",
    "OMN",
    "YEM",
    "QAT",
    "KWT",
    "IRQ",
    "JOR",
    "SYR",
]);

/** Small tiles for MapLibre fill-pattern — full-size PNGs stall zoom/pan. */
export const TERRAIN_IMAGE_URLS: Record<
    Exclude<TerrainClass, "city"> | "city",
    string
> = {
    grassy: "/terrain/grassy-tile.png",
    desert: "/terrain/desert-tile.png",
    icy: "/terrain/icy-tile.png",
    city: "/terrain/city-tile.png",
};

export const COUNTRIES_GEOJSON_URL = "/countries.simplified.geojson";

export const TERRAIN_PATTERN_LAYER_IDS = [
    "terrain-grassy",
    "terrain-desert",
    "terrain-icy",
    "terrain-city",
] as const;

export function defaultTerrainClass(iso: string): Exclude<TerrainClass, "city"> {
    const id = iso.toUpperCase();
    if (ICE_ISOS.has(id)) {
        return "icy";
    }
    if (DESERT_ISOS.has(id)) {
        return "desert";
    }
    return "grassy";
}

export function resolveTerrainClass(
    iso: string,
    participating: ReadonlySet<string>
): TerrainClass {
    if (participating.has(iso.toUpperCase())) {
        return "city";
    }
    return defaultTerrainClass(iso);
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->

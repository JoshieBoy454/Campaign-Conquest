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

export const TERRAIN_IMAGE_URLS: Record<Exclude<TerrainClass, "city"> | "city", string> = {
    grassy: "/terrain/grassy.png",
    desert: "/terrain/desert.png",
    icy: "/terrain/icy.png",
    city: "/terrain/city.png",
};

export const COUNTRIES_GEOJSON_URL = "/countries.simplified.geojson";

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

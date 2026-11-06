/**
 * Simplify countries.geojson for MapLibre: drop tiny islands, simplify geometry.
 * Requires: npm i -g mapshaper   OR   npx mapshaper
 *
 * Usage (from repo root):
 *   node tools/geo/simplify-countries.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const input = join(root, "frontend", "public", "countries.geojson");
const output = join(root, "frontend", "public", "countries.simplified.geojson");

if (!existsSync(input)) {
    console.error(`Missing input: ${input}`);
    process.exit(1);
}

// Drop very small polygons (islands), keep mainland-scale features, light simplify.
const args = [
    "-i",
    input,
    "-filter",
    "this.area > 0.08",
    "-simplify",
    "12%",
    "keep-shapes",
    "-o",
    "format=geojson",
    "precision=0.001",
    output,
];

const runners = [
    ["npx", ["--yes", "mapshaper", ...args]],
    ["mapshaper", args],
];

let ok = false;
for (const [cmd, cmdArgs] of runners) {
    const result = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: true });
    if (result.status === 0) {
        ok = true;
        break;
    }
}

if (!ok) {
    console.error("mapshaper failed. Install with: npm i -g mapshaper");
    process.exit(1);
}

console.log(`Wrote ${output}`);

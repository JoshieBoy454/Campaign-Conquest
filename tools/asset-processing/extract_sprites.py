"""Extract humanoid-drone frames from Sci-Fi_asset_animation.png into Pixi-ready atlases."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / "frontend" / "src" / "assets" / "Sci-Fi_asset_animation.png"
OUT_UNITS = ROOT / "frontend" / "public" / "assets" / "units" / "factions"
OUT_FX = ROOT / "frontend" / "public" / "assets" / "effects"
OUT_MANIFEST = ROOT / "frontend" / "public" / "assets" / "manifests"


def crop_norm(im: Image.Image, box: tuple[int, int, int, int], size: int = 64) -> Image.Image:
    tile = im.crop(box).convert("RGBA")
    # Drop near-black UI chrome by alpha on very dark non-sprite? keep armour — only trim edges
    tile.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - tile.width) // 2
    oy = (size - tile.height) // 2
    canvas.paste(tile, (ox, oy), tile)
    return canvas


def main() -> None:
    OUT_UNITS.mkdir(parents=True, exist_ok=True)
    OUT_FX.mkdir(parents=True, exist_ok=True)
    OUT_MANIFEST.mkdir(parents=True, exist_ok=True)

    im = Image.open(SHEET).convert("RGBA")
    w, h = im.size
    # Layout approximation from labeled sheet: left unit grid 10 rows x ~9 cols, right FX panels
    unit_region_w = int(w * 0.62)
    rows = 10
    cols = 9  # idle + 4 march + 4 collapse
    cell_w = unit_region_w // cols
    cell_h = h // rows
    # skip header-ish padding
    y0 = int(h * 0.08)
    x0 = int(w * 0.02)
    usable_h = h - y0 - int(h * 0.02)
    cell_h = usable_h // rows

    factions = []
    for row in range(rows):
        frames = {"idle": [], "march": [], "collapse": []}
        atlas = Image.new("RGBA", (cols * 64, 64), (0, 0, 0, 0))
        for col in range(cols):
            box = (
                x0 + col * cell_w + 4,
                y0 + row * cell_h + 4,
                x0 + (col + 1) * cell_w - 4,
                y0 + (row + 1) * cell_h - 4,
            )
            frame = crop_norm(im, box)
            atlas.paste(frame, (col * 64, 0), frame)
            name = f"f{col:02d}"
            if col == 0:
                frames["idle"].append(name)
            elif col <= 4:
                frames["march"].append(name)
            else:
                frames["collapse"].append(name)

        fid = f"{row + 1:02d}"
        path = OUT_UNITS / f"faction_{fid}.png"
        atlas.save(path)
        factions.append(
            {
                "id": fid,
                "atlas": f"/assets/units/factions/faction_{fid}.png",
                "frameSize": 64,
                "facing": "east",
                "pivot": [32, 32],
                "muzzleOffset": [54, 32],
                "animations": frames,
            }
        )

    # Effects: right-hand panels — coarse crops
    fx_x0 = int(w * 0.64)
    for name, y_frac, count in [
        ("muzzle", 0.12, 3),
        ("plasma", 0.38, 4),
        ("impact", 0.62, 4),
    ]:
        strip = Image.new("RGBA", (count * 64, 64), (0, 0, 0, 0))
        for i in range(count):
            box = (
                fx_x0 + 20 + i * 70,
                int(h * y_frac),
                fx_x0 + 20 + i * 70 + 64,
                int(h * y_frac) + 64,
            )
            box = (
                max(0, box[0]),
                max(0, box[1]),
                min(w, box[2]),
                min(h, box[3]),
            )
            frame = crop_norm(im, box)
            strip.paste(frame, (i * 64, 0), frame)
        strip.save(OUT_FX / f"{name}.png")

    manifest = {
        "factions": factions,
        "effects": {
            "muzzle": {"atlas": "/assets/effects/muzzle.png", "frames": 3, "frameSize": 64},
            "plasma": {"atlas": "/assets/effects/plasma.png", "frames": 4, "frameSize": 64},
            "impact": {"atlas": "/assets/effects/impact.png", "frames": 4, "frameSize": 64},
        },
        "notes": "Auto-cropped from Sci-Fi_asset_animation.png; refine crop manifest if jitter appears.",
    }
    (OUT_MANIFEST / "units.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(factions)} faction atlases + effects + manifest")


if __name__ == "__main__":
    main()

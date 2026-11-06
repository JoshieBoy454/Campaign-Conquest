"""
Resize terrain textures, soft-seam edges, and emit MapLibre fill-pattern tiles
under frontend/public/terrain/*-tile.png.

Place source PNGs next to this script (or set SRC) named:
  grassy_devastation.png, desert_devastation.png, Icy_wasteland.png, hightech_city.png

Usage:
  python tools/asset-processing/process_terrain.py
"""

from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Install Pillow: pip install Pillow") from exc

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "terrain-sources"
OUT = ROOT / "frontend" / "public" / "terrain"
SIZE = 128
SEAM = 4

MAPPING = [
    (("grassy_devastation.png",), "grassy-tile.png"),
    (("Desert_devastation.png", "desert_devastation.png", "Deser_devastation.png"), "desert-tile.png"),
    (("Icy_wasteland.png", "Icy_wasteland .png"), "icy-tile.png"),
    (("hightech_city.png",), "city-tile.png"),
]


def find_source(names: tuple[str, ...]) -> Path | None:
    for name in names:
        path = SRC / name
        if path.exists():
            return path
    return None


def soft_seam(img: Image.Image, band: int = SEAM) -> Image.Image:
    """Blend opposite edges so fill-pattern tiles without a hard cut."""
    px = img.load()
    w, h = img.size
    for y in range(h):
        for i in range(band):
            t = (i + 1) / (band + 1)
            for channel in range(4):
                left = px[i, y][channel]
                right = px[w - 1 - i, y][channel]
                blended = int(left * (1 - t) + right * t)
                l = list(px[i, y])
                r = list(px[w - 1 - i, y])
                l[channel] = blended
                r[channel] = blended
                px[i, y] = tuple(l)
                px[w - 1 - i, y] = tuple(r)
    for x in range(w):
        for i in range(band):
            t = (i + 1) / (band + 1)
            for channel in range(4):
                top = px[x, i][channel]
                bottom = px[x, h - 1 - i][channel]
                blended = int(top * (1 - t) + bottom * t)
                a = list(px[x, i])
                b = list(px[x, h - 1 - i])
                a[channel] = blended
                b[channel] = blended
                px[x, i] = tuple(a)
                px[x, h - 1 - i] = tuple(b)
    return img


def validate_3x3(img: Image.Image, dest: Path) -> None:
    """Write a 3×3 preview next to the tile for visual seam QA."""
    tile = img.copy()
    preview = Image.new("RGBA", (SIZE * 3, SIZE * 3))
    for row in range(3):
        for col in range(3):
            preview.paste(tile, (col * SIZE, row * SIZE))
    preview_path = dest.with_name(dest.stem + "_3x3_preview.png")
    preview.save(preview_path, optimize=True)
    print(f"  3x3 preview → {preview_path.name}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for sources, dest_name in MAPPING:
        src = find_source(sources)
        if src is None:
            print(f"SKIP {dest_name}: missing sources {sources}")
            continue
        img = Image.open(src).convert("RGBA").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        img = soft_seam(img)
        dest = OUT / dest_name
        img.save(dest, optimize=True)
        validate_3x3(img, dest)
        print(f"Wrote {dest} from {src.name}")


if __name__ == "__main__":
    main()

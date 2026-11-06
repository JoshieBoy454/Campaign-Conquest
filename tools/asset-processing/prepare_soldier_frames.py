#!/usr/bin/env python3
"""Subsample Soldier frame folders into public/assets/units/soldier for the map LOD."""

from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "frontend" / "src" / "assets" / "Soldier"
OUT = ROOT / "frontend" / "public" / "assets" / "units" / "soldier"
MANIFEST = ROOT / "frontend" / "public" / "assets" / "manifests" / "soldier.json"

# Keep map payloads light: fewer frames, smaller pixels.
TARGET_SIZE = 96
BLACK_CUTOFF = 18  # near-black → transparent

ANIMS: dict[str, dict] = {
    # Gentle breathe / ready pose
    "idle": {"folder": "hipFire", "step": 8, "max": 8},
    # March / attack approach
    "run": {"folder": "run", "step": 4, "max": 13},
    # Fire during combat rounds
    "shoot": {"folder": "shoot", "step": 8, "max": 16},
    # Casualties
    "hit": {"folder": "hit", "step": 1, "max": 13},
}


def natural_key(path: Path) -> list:
    parts = re.split(r"(\d+)", path.name)
    return [int(p) if p.isdigit() else p.lower() for p in parts]


def list_frames(folder: Path) -> list[Path]:
    return sorted(folder.glob("*.png"), key=natural_key)


def make_transparent(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r <= BLACK_CUTOFF and g <= BLACK_CUTOFF and b <= BLACK_CUTOFF:
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def process_anim(name: str, cfg: dict) -> list[str]:
    folder = SRC / cfg["folder"]
    frames = list_frames(folder)
    if not frames:
        raise SystemExit(f"No frames in {folder}")

    picked = frames[:: cfg["step"]][: cfg["max"]]
    if frames[0] not in picked:
        picked = [frames[0], *picked][: cfg["max"]]

    out_dir = OUT / name
    out_dir.mkdir(parents=True, exist_ok=True)
    # Wipe prior exports so removed frames don't linger.
    for old in out_dir.glob("*.png"):
        old.unlink()

    urls: list[str] = []
    for i, src in enumerate(picked):
        img = Image.open(src)
        img = make_transparent(img)
        img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.Resampling.LANCZOS)
        dest = out_dir / f"{i:02d}.png"
        img.save(dest, optimize=True)
        urls.append(f"/assets/units/soldier/{name}/{dest.name}")
        print(f"  {name}: {src.name} -> {dest.name}")
    return urls


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit(f"Missing Soldier source at {SRC}")

    OUT.mkdir(parents=True, exist_ok=True)
    animations: dict[str, list[str]] = {}
    for name, cfg in ANIMS.items():
        print(f"Preparing {name}…")
        animations[name] = process_anim(name, cfg)

    manifest = {
        "frameSize": TARGET_SIZE,
        "facing": "north",
        "animations": animations,
        "notes": "Subsampled from frontend/src/assets/Soldier; black keyed to alpha.",
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {MANIFEST}")


if __name__ == "__main__":
    main()

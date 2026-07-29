"""Draw the fitted graticule over a downscaled sheet so the fit can be eyeballed.

Usage: python3 tools/overlay_check.py [k_px_per_degree] [cx] [cy]
Defaults come from assets/georef.json.
"""

import json
import os
import sys

from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

SHEET = "sources/gleason_1892_sheet_full.jpg"
OUT = "out/overlay.png"
SCALE = 0.18

# colatitude, colour, label
MARKS = [
    (23.44, (255, 0, 0), "arctic circle"),
    (66.56, (255, 0, 255), "tropic of cancer"),
    (90.0, (0, 0, 255), "equator"),
    (113.44, (255, 0, 255), "tropic of capricorn"),
    (146.0, (0, 160, 0), "cape horn lat -56"),
    (180.0, (255, 128, 0), "antipode"),
]


def main():
    g = json.load(open("assets/georef.json"))
    k = float(sys.argv[1]) if len(sys.argv) > 1 else g["px_per_degree"]
    cx = float(sys.argv[2]) if len(sys.argv) > 2 else g["center_px"][0]
    cy = float(sys.argv[3]) if len(sys.argv) > 3 else g["center_px"][1]

    im = Image.open(SHEET).convert("RGB")
    im = im.resize((int(im.width * SCALE), int(im.height * SCALE)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    sx, sy = cx * SCALE, cy * SCALE

    d.line([sx - 12, sy, sx + 12, sy], fill=(255, 0, 0), width=2)
    d.line([sx, sy - 12, sx, sy + 12], fill=(255, 0, 0), width=2)

    for colat, colour, label in MARKS:
        r = colat * k * SCALE
        d.ellipse([sx - r, sy - r, sx + r, sy + r], outline=colour, width=2)
        d.text((sx + 4, sy - r + 4), f"{label} ({colat}deg)", fill=colour)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    im.save(OUT)
    print(f"k={k}  centre=({cx:.1f},{cy:.1f})  -> {OUT}")


if __name__ == "__main__":
    main()

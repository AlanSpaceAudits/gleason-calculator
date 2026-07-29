"""Plot known coordinates onto the sheet using the current georeference.

Marks that sit on the right coastline mean the georeference is good. Used to
fit the one parameter the engraving alone cannot give: which image bearing the
Greenwich meridian points along.

Usage: python3 tools/landmark_check.py [rot_deg] [k] [cx] [cy]
"""

import json
import os
import math
import sys

from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

SHEET = "sources/gleason_1892_sheet_full.jpg"
OUT = "out/landmarks.png"
SCALE = 0.20

# Unambiguous coastal points, spread over all quadrants and both hemispheres.
LANDMARKS = [
    ("N Cape", 71.17, 25.78),
    ("Gibraltar", 36.14, -5.35),
    ("Good Hope", -34.36, 18.47),
    ("Cape Comorin", 8.08, 77.55),
    ("Singapore", 1.29, 103.85),
    ("Cape York AU", -10.69, 142.53),
    ("NZ Wellington", -41.29, 174.78),
    ("Cape Horn", -55.98, -67.27),
    ("Recife", -8.05, -34.88),
    ("Panama", 8.98, -79.52),
    ("Los Angeles", 34.05, -118.24),
    ("Bering Str", 65.77, -168.93),
    ("Reykjavik", 64.15, -21.94),
    ("Cape Farewell", 59.78, -43.92),
]


def main():
    g = json.load(open("assets/georef.json"))
    rot = float(sys.argv[1]) if len(sys.argv) > 1 else g.get("meridian_rotation_deg", 92.0)
    k = float(sys.argv[2]) if len(sys.argv) > 2 else g["px_per_degree"]
    cx = float(sys.argv[3]) if len(sys.argv) > 3 else g["center_px"][0]
    cy = float(sys.argv[4]) if len(sys.argv) > 4 else g["center_px"][1]

    im = Image.open(SHEET).convert("RGB")
    im = im.resize((int(im.width * SCALE), int(im.height * SCALE)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    sx, sy = cx * SCALE, cy * SCALE

    # meridians every 30 degrees, labelled
    for lon in range(-180, 180, 30):
        b = math.radians(rot - lon)
        r = 180 * k * SCALE
        x, y = sx + r * math.sin(b), sy - r * math.cos(b)
        d.line([sx, sy, x, y], fill=(0, 90, 255), width=1)
        d.text((sx + 0.86 * (x - sx), sy + 0.86 * (y - sy)), f"{lon}", fill=(0, 60, 200))

    for name, lat, lon in LANDMARKS:
        r = (90 - lat) * k * SCALE
        b = math.radians(rot - lon)
        x, y = sx + r * math.sin(b), sy - r * math.cos(b)
        d.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(255, 0, 0), width=2)
        d.text((x + 7, y - 5), name, fill=(255, 0, 0))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    im.save(OUT)
    print(f"rot={rot} k={k} centre=({cx:.1f},{cy:.1f}) -> {OUT}")


if __name__ == "__main__":
    main()

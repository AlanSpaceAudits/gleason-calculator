"""Cut the web assets from the scanned sheets.

The measuring chart delivers the whole reprint sheet, not just the map disc,
because the sheet carries the title block, the hour dial legend, the two scale
rulers, the solstice diagrams and Gleason's own explanatory paragraphs. All of
it is context for how the chart is meant to be read.

The other copies are gallery images only. They are not georeferenced and nothing
is measured on them, so they do not have to line up with anything.

    python3 tools/make_assets.py
"""

import json
import os

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

# Delivered width of the measuring sheet, chosen to land the map disc near
# 2600 px across.
SHEET_W = 3450
GALLERY_W = 1700

CHART = {
    "sheet": "sources/gleason_1892_reprint_sheet.jpg",
    "georef": "assets/georef_reprint.json",
    "out": "assets/chart.jpg",
    "meta": "assets/chart.json",
    "details": {
        "rulers": (1700, 7300, 4400, 8100),
        "solstice_june": (350, 6520, 1150, 7220),
        "solstice_december": (4780, 6520, 5580, 7220),
        "titleblock": (100, 600, 5880, 2680),
    },
    "credit": {
        "title": "Gleason's new standard map of the world",
        "author": "Gleason, Alexander",
        "year": "1892 plate, reprinted 2013",
        "publisher": "Buffalo Electrotype and Engraving Co.; reprinted by Lone Star Art",
        "holding": "American Geographical Society Library, University of Wisconsin-Milwaukee",
    },
}

GALLERY = [
    {
        "id": "reprint",
        "label": "1892 plate, reprinted 2013",
        "sheet": "sources/gleason_1892_reprint_sheet.jpg",
        "holding": "American Geographical Society Library, University of Wisconsin-Milwaukee",
        "note": "The clearest map face of the three, and the one the chart page "
                "measures on. The reprint omits the two movable indicating arms "
                "that came with the original instrument.",
    },
    {
        "id": "boston",
        "label": "1892 original, Boston Public Library",
        "sheet": "sources/gleason_1892_sheet_full.jpg",
        "holding": "Norman B. Leventhal Map & Education Center, Boston Public Library",
        "note": "An 1892 impression with one indicating arm still pivoted at the "
                "centre, swung up over Scandinavia. The arm is graduated in degrees "
                "of latitude, and it is the part of the instrument that does the work.",
    },
    {
        "id": "yale",
        "label": "1892 original, Yale University Library",
        "sheet": "sources/gleason_1892_yale_sheet.jpg",
        "holding": "Yale University Library",
        "note": "A second 1892 impression, its arm swung right across Asia and "
                "Europe. Set beside the Boston copy it shows the arm was meant to "
                "be turned to wherever you were working, not parked.",
    },
]


def build_chart():
    g = json.load(open(CHART["georef"]))
    cx, cy = g["center_px"]
    k = g["px_per_degree"]

    im = Image.open(CHART["sheet"]).convert("RGB")
    scale = SHEET_W / im.width
    out_h = int(round(im.height * scale))
    im.resize((SHEET_W, out_h), Image.LANCZOS).save(
        CHART["out"], quality=86, optimize=True, progressive=True)

    for name, box in CHART["details"].items():
        im.crop(box).save(f"assets/{name}.jpg", quality=90, optimize=True)

    meta = {
        "source": {**CHART["credit"],
                   "rights": "No known copyright restrictions on the 1892 work.",
                   "scan_px": [im.width, im.height]},
        "chart": {
            "image": CHART["out"],
            "width": SHEET_W,
            "height": out_h,
            "center_px": [round(cx * scale, 3), round(cy * scale, 3)],
            "px_per_degree": round(k * scale, 6),
            "radius_180deg_px": round(k * scale * 180, 2),
            "meridian_rotation_deg": g["meridian_rotation_deg"],
            "coastline_agreement": g["coastline_agreement"],
        },
    }
    json.dump(meta, open(CHART["meta"], "w"), indent=2)
    mb = os.path.getsize(CHART["out"]) / 1e6
    print(f"chart  {SHEET_W}x{out_h}  disc {meta['chart']['radius_180deg_px'] * 2:.0f}px  {mb:.1f} MB")


def build_gallery():
    os.makedirs("assets/gallery", exist_ok=True)
    out = []
    for g in GALLERY:
        im = Image.open(g["sheet"]).convert("RGB")
        h = int(round(im.height * GALLERY_W / im.width))
        path = f"assets/gallery/{g['id']}.jpg"
        im.resize((GALLERY_W, h), Image.LANCZOS).save(
            path, quality=85, optimize=True, progressive=True)
        out.append({k: g[k] for k in ("id", "label", "holding", "note")}
                   | {"image": path, "width": GALLERY_W, "height": h,
                      "scan_px": [im.width, im.height]})
        print(f"gallery {g['id']:<8} {GALLERY_W}x{h}  {os.path.getsize(path) / 1e6:.1f} MB")
    json.dump({"sheets": out}, open("assets/gallery.json", "w"), indent=2)
    print("wrote assets/gallery.json")


if __name__ == "__main__":
    build_chart()
    build_gallery()

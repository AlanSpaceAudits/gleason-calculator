"""Fit the sheet's projection parameters by matching its engraved coastlines.

Reading pixel positions off printed labels by eye is only good to a degree or
two, because a label sits near its feature rather than on it. Matching the
whole land/sea boundary at once uses every coastline on the sheet as evidence
and reports an honest residual.

Model (polar azimuthal equidistant, as the patent describes the construction):

    r       = (90 - lat) * k                 pixels from centre
    bearing = rot - lon                      degrees clockwise from image north
    x       = cx + r*sin(bearing)
    y       = cy - r*cos(bearing)

Free parameters: cx, cy, k, rot.
"""

import argparse
import json

import numpy as np
from matplotlib.path import Path
from PIL import Image
from scipy.optimize import minimize

Image.MAX_IMAGE_PIXELS = None

LAND = "assets/ne_110m_land.geojson"

WORK = 0.16  # analysis scale
GRID = 0.25  # degrees per cell of the reference land raster


def land_raster():
    """Boolean land grid indexed [lat_idx, lon_idx] at GRID degree resolution."""
    gj = json.load(open(LAND))
    nlat, nlon = int(180 / GRID), int(360 / GRID)
    lats = -90 + (np.arange(nlat) + 0.5) * GRID
    lons = -180 + (np.arange(nlon) + 0.5) * GRID
    lon_g, lat_g = np.meshgrid(lons, lats)
    pts = np.stack([lon_g.ravel(), lat_g.ravel()], axis=1)
    mask = np.zeros(pts.shape[0], dtype=bool)

    def rings(geom):
        if geom["type"] == "Polygon":
            yield geom["coordinates"]
        elif geom["type"] == "MultiPolygon":
            for poly in geom["coordinates"]:
                yield poly

    for feat in gj["features"]:
        for poly in rings(feat["geometry"]):
            outer = np.array(poly[0])
            lo, hi = outer.min(axis=0), outer.max(axis=0)
            box = (
                (pts[:, 0] >= lo[0]) & (pts[:, 0] <= hi[0])
                & (pts[:, 1] >= lo[1]) & (pts[:, 1] <= hi[1])
            )
            if not box.any():
                continue
            sub = pts[box]
            inside = Path(outer).contains_points(sub)
            for hole in poly[1:]:
                inside &= ~Path(np.array(hole)).contains_points(sub)
            idx = np.nonzero(box)[0]
            mask[idx[inside]] = True

    return mask.reshape(nlat, nlon)


def sheet_land_mask(sheet, pivot_px, disc_r_px, hole_r_px, sea_sat=0.05,
                    warm_sat=0.12, scale=WORK):
    """Land vs ocean on the scan, by ink hue.

    The engraver tinted the seas pale blue and every landmass a warm colour
    (yellow, pink, green, orange), so hue separates them. Two things must be
    cut out or they swamp the fit: the vermilion hour ring, which is warm but
    is not land, and everything outside the engraved disc.
    """
    im = Image.open(sheet).convert("RGB")
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    arr = np.asarray(im).astype(np.int16)
    hsv = np.asarray(im.convert("HSV")).astype(np.float32)
    h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255

    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    vermilion = (r > 140) & (r - g > 45) & (r - b > 35)

    yy, xx = np.mgrid[0 : arr.shape[0], 0 : arr.shape[1]]
    rad = np.hypot(xx - pivot_px[0] * scale, yy - pivot_px[1] * scale)
    inside = (rad < disc_r_px * scale) & (rad > hole_r_px * scale)

    sea = (h > 150) & (h < 260) & (s > sea_sat) & (v > 0.35) & inside
    warm = ((h < 110) | (h > 300)) & (s > warm_sat) & (v > 0.30) & inside & ~vermilion
    return arr, warm, sea


def project(lat, lon, p):
    cx, cy, k, rot = p
    r = (90.0 - lat) * k
    b = np.radians(rot - lon)
    return cx + r * np.sin(b), cy - r * np.cos(b)


def unproject(x, y, p):
    cx, cy, k, rot = p
    dx, dy = x - cx, y - cy
    r = np.hypot(dx, dy)
    lat = 90.0 - r / k
    b = np.degrees(np.arctan2(dx, -dy))
    lon = rot - b
    lon = (lon + 180.0) % 360.0 - 180.0
    return lat, lon


def make_objective(land, warm, sea, scale):
    ys, xs = np.nonzero(warm | sea)
    is_land = warm[ys, xs]
    nlat, nlon = land.shape

    def score(p_work):
        lat, lon = unproject(xs, ys, p_work)
        # The chart leaves the far south blank, so Antarctica is no evidence
        # either way. Judge only where the engraver actually drew a decision.
        ok = (lat <= 90) & (lat > -60)
        if ok.sum() < 1000:
            return 0.0
        li = np.clip(((lat + 90) / GRID).astype(int), 0, nlat - 1)
        lj = np.clip(((lon + 180) / GRID).astype(int), 0, nlon - 1)
        pred = land[li, lj]
        agree = (pred == is_land) & ok
        return float(agree.sum() / ok.sum())

    return score


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sheet", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cx", type=float, required=True, help="rough centre x, px")
    ap.add_argument("--cy", type=float, required=True, help="rough centre y, px")
    ap.add_argument("--disc", type=float, required=True, help="rough disc radius, px")
    ap.add_argument("--hole", type=float, default=0.07,
                    help="centre exclusion as a fraction of the disc radius")
    ap.add_argument("--sea-sat", type=float, default=0.05,
                    help="minimum saturation for sea tint; lower it for faded scans")
    ap.add_argument("--warm-sat", type=float, default=0.12,
                    help="minimum saturation for land tint")
    args = ap.parse_args()

    land = land_raster()
    print(f"reference land raster {land.shape}, {land.mean() * 100:.1f}% land")

    pivot = (args.cx, args.cy)
    _, warm, sea = sheet_land_mask(args.sheet, pivot, args.disc, args.disc * args.hole,
                                   args.sea_sat, args.warm_sat)
    print(f"sheet at {WORK}: {warm.sum()} warm px, {sea.sum()} sea px")

    score = make_objective(land, warm, sea, WORK)

    # k must put the 180 degree circle somewhere near the disc edge
    k_guess = args.disc / 180.0
    best, best_p = -1, None
    for kf in (0.92, 0.96, 1.0, 1.04, 1.08):
        for rot0 in (86.0, 88.0, 90.0, 92.0, 94.0):
            p0 = np.array([args.cx * WORK, args.cy * WORK, k_guess * kf * WORK, rot0])
            s = score(p0)
            if s > best:
                best, best_p = s, p0
    print(f"best coarse seed {best:.4f} at k={best_p[2] / WORK:.3f} rot={best_p[3]:.1f}")

    res = minimize(
        lambda p: -score(p),
        best_p,
        method="Nelder-Mead",
        options={"xatol": 1e-3, "fatol": 1e-6, "maxiter": 4000, "maxfev": 4000},
    )
    p = res.x
    full = np.array([p[0] / WORK, p[1] / WORK, p[2] / WORK, p[3]])
    print(f"fitted agreement {-res.fun:.4f}")
    print(f"  centre  ({full[0]:.1f}, {full[1]:.1f}) px")
    print(f"  k       {full[2]:.4f} px per degree")
    print(f"  rot     {full[3]:.3f} deg")
    print(f"  map limit at 180deg: r = {full[2] * 180:.1f} px")

    g = {
        "sheet": args.sheet,
        "sheet_px": list(Image.open(args.sheet).size),
    }
    g.update(
        {
            "center_px": [round(full[0], 2), round(full[1], 2)],
            "px_per_degree": round(full[2], 5),
            "meridian_rotation_deg": round(full[3], 4),
            "radius_180deg_px": round(full[2] * 180, 2),
            "coastline_agreement": round(-res.fun, 4),
        }
    )
    json.dump(g, open(args.out, "w"), indent=2)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()

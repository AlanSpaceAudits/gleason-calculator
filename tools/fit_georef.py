"""Fit the chart's projection parameters to the scanned sheet.

The 1892 sheet is a polar azimuthal equidistant plot: meridians are straight
radials holding their Greenwich value, latitude circles are evenly spaced from
the pole. So the pixel<->coordinate mapping needs three numbers:

    cx, cy   centre pixel (the pivot / north pole)
    k        pixels per degree of colatitude
    rot      image bearing, in degrees clockwise from north, of the 0 meridian

Stage 1 (this file) finds cx, cy and k from the printed engraving alone:
the vermilion hour ring gives the centre, and a radial histogram of dark ink
gives the evenly spaced latitude circles, whose spacing is k.
rot is fixed in stage 2 against known landmarks.
"""

import json
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SHEET = "sources/gleason_1892_sheet_full.jpg"
OUT = "assets/georef.json"


def load(path):
    im = Image.open(path).convert("RGB")
    return np.asarray(im).astype(np.int16)


def ring_mask(rgb):
    """Vermilion of the hour ring: strongly red, clearly above both other channels."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > 140) & (r - g > 45) & (r - b > 35)


def fit_circle(xs, ys):
    """Algebraic (Kasa) circle fit: exact least squares, no iteration."""
    a = np.stack([xs, ys, np.ones_like(xs)], axis=1).astype(np.float64)
    rhs = xs.astype(np.float64) ** 2 + ys.astype(np.float64) ** 2
    (c0, c1, c2), *_ = np.linalg.lstsq(a, rhs, rcond=None)
    cx, cy = c0 / 2, c1 / 2
    r = np.sqrt(c2 + cx * cx + cy * cy)
    return cx, cy, r


def ring_outer_edge(mask, seed, n_rays=720):
    """Outermost vermilion pixel along each ray from a seed point."""
    cy, cx = seed
    h, w = mask.shape
    max_r = int(min(cx, cy, w - cx, h - cy))
    thetas = np.linspace(0, 2 * np.pi, n_rays, endpoint=False)
    radii = np.arange(20, max_r)
    pts = []
    for t in thetas:
        xs = np.clip((cx + radii * np.cos(t)).astype(int), 0, w - 1)
        ys = np.clip((cy + radii * np.sin(t)).astype(int), 0, h - 1)
        hit = np.nonzero(mask[ys, xs])[0]
        if hit.size:
            pts.append((xs[hit[-1]], ys[hit[-1]]))
    pts = np.array(pts)
    return fit_circle(pts[:, 0], pts[:, 1])


def darkness_profile(rgb, cx, cy, r_max, n_rays=1440):
    """Mean ink darkness as a function of radius. Latitude circles show as troughs.

    ponytail: mean over many rays, not edge detection. Land, labels and the
    pointer arm are uncorrelated with radius, so they average into the
    baseline while the full-circle graticule lines survive.
    """
    grey = rgb.mean(axis=2)
    h, w = grey.shape
    thetas = np.linspace(0, 2 * np.pi, n_rays, endpoint=False)
    radii = np.arange(0, r_max)
    acc = np.zeros(radii.size)
    for t in thetas:
        xs = np.clip((cx + radii * np.cos(t)).astype(int), 0, w - 1)
        ys = np.clip((cy + radii * np.sin(t)).astype(int), 0, h - 1)
        acc += grey[ys, xs]
    return acc / n_rays


def trace_circle(rgb, cx, cy, r_lo, r_hi, n_rays=1440):
    """Fit a circle to the darkest ink found in a radius window along each ray.

    Used on the outermost graticule circle, which is a full unbroken rule and
    therefore the best available reference for both centre and scale.
    """
    grey = rgb.mean(axis=2)
    h, w = grey.shape
    radii = np.arange(r_lo, r_hi)
    pts = []
    for t in np.linspace(0, 2 * np.pi, n_rays, endpoint=False):
        xs = np.clip((cx + radii * np.cos(t)).astype(int), 0, w - 1)
        ys = np.clip((cy + radii * np.sin(t)).astype(int), 0, h - 1)
        v = grey[ys, xs]
        i = int(np.argmin(v))
        # reject rays where nothing is meaningfully darker than the local paper
        if v.mean() - v[i] < 12:
            continue
        pts.append((xs[i], ys[i]))
    pts = np.array(pts)
    cx2, cy2, r = fit_circle(pts[:, 0], pts[:, 1])
    resid = np.hypot(pts[:, 0] - cx2, pts[:, 1] - cy2) - r
    return cx2, cy2, r, float(np.std(resid)), pts.shape[0]


def ink_depth(profile):
    """Darkness relative to a local rolling baseline. Positive where ink sits."""
    win = 61
    baseline = np.convolve(profile, np.ones(win) / win, mode="same")
    return np.clip(baseline - profile, 0, None)


def comb_fit(depth, r_max, lo=60.0, hi=200.0):
    """Find the circle spacing by combing the ink profile.

    The graticule is anchored at the pole, so circle radii are exact multiples
    of one step. Scoring every candidate step against all its multiples at once
    is far more robust than identifying circles individually: land, lettering
    and the pointer arm add ink at radii that are not multiples of anything.
    """
    steps = np.arange(lo, hi, 0.02)
    best, best_score = None, -1.0
    for s in steps:
        ns = np.arange(1, int(r_max / s) + 1)
        idx = np.round(ns * s).astype(int)
        idx = idx[idx < depth.size]
        if idx.size < 8:
            continue
        # mean rather than sum, so long combs are not rewarded for length alone
        score = float(depth[idx].mean())
        if score > best_score:
            best, best_score = float(s), score
    return best, best_score


def refine_step(depth, step, r_max):
    """Least-squares the step against the actual local minimum nearest each
    predicted circle, which removes the 0.02 px quantisation of the comb."""
    ns, obs = [], []
    for n in range(1, int(r_max / step) + 1):
        c = int(round(n * step))
        lo, hi = max(0, c - 10), min(depth.size, c + 11)
        if hi - lo < 5:
            continue
        peak = lo + int(np.argmax(depth[lo:hi]))
        if depth[peak] <= 0:
            continue
        ns.append(n)
        obs.append(peak)
    a = np.array(ns, dtype=float).reshape(-1, 1)
    slope, *_ = np.linalg.lstsq(a, np.array(obs, dtype=float), rcond=None)
    resid = np.array(obs) - np.array(ns) * slope[0]
    return float(slope[0]), list(zip(ns, obs)), float(np.abs(resid).max())


def main():
    rgb = load(SHEET)
    h, w = rgb.shape[:2]
    print(f"sheet {w}x{h}")

    mask = ring_mask(rgb)
    ys, xs = np.nonzero(mask)
    seed = (ys.mean(), xs.mean())
    print(f"vermilion pixels {xs.size}  seed ({seed[1]:.0f}, {seed[0]:.0f})")

    cx, cy, r_out = ring_outer_edge(mask, seed)
    print(f"hour ring outer circle: centre ({cx:.1f}, {cy:.1f})  r {r_out:.1f}")

    # The engraving rules a latitude circle every 15 degrees. The outermost is
    # the 180 degree circle: the antipode of the centre, and the map's limit.
    cx, cy, r180, rms, n = trace_circle(rgb, cx, cy, 1740, 1880)
    print(f"180deg circle: centre ({cx:.1f}, {cy:.1f})  r {r180:.1f}  rms {rms:.2f} px  from {n} rays")

    k = r180 / 180.0
    print(f"k = {k:.4f} px per degree of colatitude")

    prof = darkness_profile(rgb, cx, cy, int(r_out))
    depth = ink_depth(prof)
    print("  check, predicted -> nearest observed ink peak:")
    for colat, name in [
        (23.44, "arctic circle"),
        (45.0, "lat +45"),
        (66.56, "tropic of cancer"),
        (90.0, "equator"),
        (113.44, "tropic of capricorn"),
        (156.56, "antarctic circle"),
        (180.0, "map limit"),
    ]:
        pred = colat * k
        lo, hi = int(pred - 22), int(pred + 23)
        obs = lo + int(np.argmax(depth[lo:hi]))
        print(f"    {name:<22} {pred:8.1f} -> {obs:6d}   ({obs - pred:+.1f} px)")

    circles = [(n15 * 15, round(n15 * 15 * k, 1)) for n15 in range(1, 13)]
    print(f"  hour ring outer r = {r_out:.1f} px = {r_out / k:.2f} deg colatitude")

    json.dump(
        {
            "sheet": SHEET,
            "sheet_px": [w, h],
            "center_px": [round(cx, 2), round(cy, 2)],
            "px_per_degree": round(k, 5),
            "hour_ring_outer_px": round(r_out, 2),
            "graticule_step_px": round(step, 3),
            "graticule_worst_residual_px": round(worst, 2),
            "graticule_circles": [[n * 10, o] for n, o in circles],
        },
        open(OUT, "w"),
        indent=2,
    )
    print(f"wrote {OUT}")


if __name__ == "__main__":
    sys.exit(main())

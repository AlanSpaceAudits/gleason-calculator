// Coordinate maths for the 1892 chart.
//
// The chart is a polar azimuthal equidistant plot, which the patent describes
// as straightening the meridians into radials while each keeps its Greenwich
// value and its spacing from the equator to the poles. So:
//
//   r       = (90 - lat) * k          pixels from the centre
//   bearing = rot - lon               degrees clockwise from image north
//
// Longitude increases anticlockwise, which is what looking down on the pole
// from outside gives you.

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

// A degree of arc on a great circle. Gleason's own rulers use the same figure:
// 60 geographical (nautical) miles to the degree, and 69.16 English miles.
export const NM_PER_DEGREE = 60; // Gleason p.350: 15 deg of longitude = 900 miles

// Gleason states the mile relation three times over, and the three do not quite
// agree:
//   p.350  by definition, 5280 ft against 6075 ft          -> 1.15057
//   p.349  69.16 English to the degree against 60           -> 1.15267
//   Fig.37 208 English against 180 nautical                 -> 1.15556
// The foot definition is the one that is a definition rather than a rounded
// reading off a ruler, so it is the one used here.
export const STATUTE_FEET = 5280;
export const NAUTICAL_FEET = 6075;
export const STATUTE_PER_NM = NAUTICAL_FEET / STATUTE_FEET; // 1.15057
export const ENGLISH_PER_DEGREE = 69.16; // as printed, for the scale readout
export const KM_PER_NM = 1.852;
export const MINUTES_PER_DEGREE_LON = 4; // the sheet: "degrees of longitude reduced to sun-time"

// Normalised to (-180, 180]. Exactly 180 is a real ambiguity, since the
// antimeridian is equally east and west, so it is pinned east rather than left
// to fall out of the modulo by accident.
export function wrapLon(lon) {
  const w = ((lon + 180) % 360 + 360) % 360 - 180;
  return w === -180 ? 180 : w;
}

export function deltaLon(lonA, lonB) {
  return wrapLon(lonB - lonA);
}

// ---------------------------------------------------------------- the chart

export function makeProjection({ center_px, px_per_degree, meridian_rotation_deg }) {
  const [cx, cy] = center_px;
  const k = px_per_degree;
  const rot = meridian_rotation_deg;

  return {
    cx, cy, k, rot,
    // Where this projection is centred. Its antipode maps to the whole rim.
    center: [90, 0],

    forward(lat, lon) {
      const r = (90 - lat) * k;
      const b = (rot - lon) * D2R;
      return [cx + r * Math.sin(b), cy - r * Math.cos(b)];
    },

    inverse(x, y) {
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy);
      const lat = 90 - r / k;
      const lon = wrapLon(rot - Math.atan2(dx, -dy) * R2D);
      return [lat, lon];
    },

    // Colatitude in degrees at a pixel radius, i.e. how far out the chart is.
    colatitudeAt(x, y) {
      return Math.hypot(x - cx, y - cy) / k;
    },
  };
}

// ------------------------------------------------------- spherical geometry

// Central angle between two coordinates, in degrees. Haversine rather than the
// cosine rule so short separations keep their precision.
export function centralAngle(latA, lonA, latB, lonB) {
  const p1 = latA * D2R, p2 = latB * D2R;
  const dp = (latB - latA) * D2R;
  const dl = deltaLon(lonA, lonB) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a))) * R2D;
}

// Initial bearing from A to B, degrees clockwise from true north.
export function initialBearing(latA, lonA, latB, lonB) {
  const p1 = latA * D2R, p2 = latB * D2R;
  const dl = deltaLon(lonA, lonB) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

// Point a given central angle along a given bearing from a start point.
export function alongBearing(lat0, lon0, bearingDeg, angleDeg) {
  const p1 = lat0 * D2R, br = bearingDeg * D2R, c = angleDeg * D2R;
  const lat = Math.asin(Math.sin(p1) * Math.cos(c) + Math.cos(p1) * Math.sin(c) * Math.cos(br));
  const lon = lon0 * D2R + Math.atan2(
    Math.sin(br) * Math.sin(c) * Math.cos(p1),
    Math.cos(c) - Math.sin(p1) * Math.sin(lat),
  );
  return [lat * R2D, wrapLon(lon * R2D)];
}

// Vertices along the great circle from A to B, for drawing the true path.
//
// Two cases have no unique answer and have to be chosen rather than computed.
// A pole has no defined bearing, since every direction from it is south. An
// antipodal pair lies on infinitely many great circles, all the same length.
// Both are resolved to a meridian, which is a correct shortest path and the
// one the chart draws as a straight radial.
export function greatCirclePath(latA, lonA, latB, lonB, steps = 180) {
  const total = centralAngle(latA, lonA, latB, lonB);
  const out = [];
  if (total < 1e-9) return [[latA, lonA], [latB, lonB]];

  const polarA = Math.abs(latA) > 89.999;
  const polarB = Math.abs(latB) > 89.999;

  if (polarA || polarB) {
    const lon = polarA ? lonB : lonA;
    for (let i = 0; i <= steps; i++) {
      out.push([latA + (latB - latA) * i / steps, lon]);
    }
    return out;
  }

  // Antipodal: walk due north from A, which is one of the valid great circles.
  const br = total > 179.999 ? 0 : initialBearing(latA, lonA, latB, lonB);
  for (let i = 0; i <= steps; i++) {
    out.push(alongBearing(latA, lonA, br, total * i / steps));
  }
  return out;
}

// ------------------------------------------------- recentring the same chart

// An azimuthal equidistant projection is true to scale along radials from its
// own centre, and nowhere else. Recentring on A makes the straight line to B a
// true measurement. Same projection, different centre.
export function makeObliqueProjection(lat0, lon0, { cx, cy, k }) {
  const p0 = lat0 * D2R;
  const sin0 = Math.sin(p0), cos0 = Math.cos(p0);

  return {
    cx, cy, k, lat0, lon0,
    center: [lat0, lon0],

    forward(lat, lon) {
      const c = centralAngle(lat0, lon0, lat, lon);
      const az = initialBearing(lat0, lon0, lat, lon) * D2R;
      const r = c * k;
      return [cx + r * Math.sin(az), cy - r * Math.cos(az)];
    },

    inverse(x, y) {
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy);
      const c = (r / k) * D2R;
      if (c > Math.PI) return null; // past the antipode: off the world
      const az = Math.atan2(dx, -dy);
      const sinc = Math.sin(c), cosc = Math.cos(c);
      const lat = Math.asin(sin0 * cosc + cos0 * sinc * Math.cos(az));
      // Snyder's form for the longitude. The obvious rearrangement collapses to
      // atan2(0, 0) when the centre is a pole, because cos(lat0) is then zero,
      // which would send every pixel to the same meridian.
      const lon = lon0 * D2R + Math.atan2(
        Math.sin(az) * sinc,
        cos0 * cosc - Math.cos(az) * sin0 * sinc,
      );
      return [lat * R2D, wrapLon(lon * R2D)];
    },
  };
}

// ------------------------------------------------------------- the readouts

export const nmToStatute = (nm) => nm * STATUTE_PER_NM;
export const nmToKm = (nm) => nm * KM_PER_NM;

// What the chart is built to give you: longitude difference as sun time.
export function timeFromLongitude(lonA, lonB) {
  const dlon = deltaLon(lonA, lonB);
  const minutes = dlon * MINUTES_PER_DEGREE_LON;
  return { dlon, minutes };
}

export function formatHM(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const t = Math.abs(minutes);
  const h = Math.floor(t / 60);
  const m = t - h * 60;
  return `${sign}${h}h ${m.toFixed(1).padStart(4, "0")}m`;
}

// Distance along a parallel of latitude, which is where a degree of longitude
// stops being 60 miles. This is the relation Gleason's Fig. 43 tabulates.
export function alongParallelNM(lat, dlon) {
  return Math.abs(dlon) * NM_PER_DEGREE * Math.cos(lat * D2R);
}

// A straight ruler laid across the chart, read against the chart's radial
// scale. Correct only when the line passes through the chart's centre.
export function rulerNM(ax, ay, bx, by, k) {
  return (Math.hypot(bx - ax, by - ay) / k) * NM_PER_DEGREE;
}

// Distance the way the chart is built to give it.
//
// The chart's output is a difference of sun time. That time is an angle: the
// sun runs 15 degrees of longitude to the hour, which is the relation printed
// on the sheet's own rim. Take that angle with the two latitudes and it gives
// the angle subtended at the centre between the two places, and Gleason's sixty
// geographical miles to the degree turns that into a distance.
//
//   Δλ    = Δt × 15° per hour
//   cos σ = sin φA · sin φB + cos φA · cos φB · cos Δλ
//   d     = σ × 60
//
// A difference of longitude on its own is not a distance. It is the angle at
// the axis, not the angle between the places, and the two coincide only on the
// equator. The latitudes are what convert one into the other.
export function gleasonDistance(latA, lonA, latB, lonB) {
  const dlon = deltaLon(lonA, lonB);
  const hours = dlon * MINUTES_PER_DEGREE_LON / 60;

  const p1 = latA * D2R, p2 = latB * D2R, dl = dlon * D2R;
  const cosSigma = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  const sigmaCos = Math.acos(Math.min(1, Math.max(-1, cosSigma))) * R2D;

  // The value carried forward comes from the haversine arrangement of the same
  // relation, which keeps its precision when the two places are close together.
  // The cosine form above is the one written out on the page.
  const sigma = centralAngle(latA, lonA, latB, lonB);

  return {
    dlon, hours, cosSigma, sigmaCos, sigma,
    nm: sigma * NM_PER_DEGREE,
    agreement: Math.abs(sigma - sigmaCos),
  };
}

// The great circle, used to check Gleason's figure rather than to replace it.
// It is also exactly what a straight edge reads on a chart recentred on A.
export function trueNM(latA, lonA, latB, lonB) {
  return centralAngle(latA, lonA, latB, lonB) * NM_PER_DEGREE;
}

export function formatLat(lat) {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}`;
}

export function formatLon(lon) {
  return `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}`;
}

// Sun time on the chart's own rule: Greenwich noon plus four minutes a degree.
export function sunTimeAt(lon) {
  const minutes = (12 * 60 + lon * MINUTES_PER_DEGREE_LON + 1440) % 1440;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes - h * 60);
  const s = Math.round((minutes - h * 60 - m) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

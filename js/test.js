// Self-check for the coordinate maths. Run: node js/test.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  makeProjection, makeObliqueProjection, centralAngle, initialBearing,
  alongBearing, greatCirclePath, trueNM, rulerNM, alongParallelNM,
  timeFromLongitude, nmToKm, nmToStatute, wrapLon, deltaLon, sunTimeAt,
  gleasonDistance,
} from "./geo.js";

const chart = JSON.parse(readFileSync(new URL("../assets/chart.json", import.meta.url))).chart;
const P = makeProjection(chart);

const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: got ${a}, expected ${b} +/- ${tol}`);

// --- longitude wrapping ----------------------------------------------------
near(wrapLon(190), -170, 1e-9, "wrap 190");
near(wrapLon(-190), 170, 1e-9, "wrap -190");
near(deltaLon(170, -170), 20, 1e-9, "delta across the date line");
near(deltaLon(-170, 170), -20, 1e-9, "delta back across the date line");

// --- chart projection round trip ------------------------------------------
for (const [lat, lon] of [[51.5, -0.13], [-33.9, 151.2], [0, 0], [-56, -67], [80, 179]]) {
  const [x, y] = P.forward(lat, lon);
  const [lat2, lon2] = P.inverse(x, y);
  near(lat2, lat, 1e-9, `round trip lat ${lat}`);
  near(lon2, lon, 1e-9, `round trip lon ${lon}`);
}

// The pole is the centre, and Greenwich runs due right, as the sheet prints it.
{
  const [x, y] = P.forward(90, 0);
  near(x, chart.center_px[0], 1e-6, "pole x");
  near(y, chart.center_px[1], 1e-6, "pole y");
  const [gx, gy] = P.forward(0, 0);
  near(gy, chart.center_px[1], 1.0, "Greenwich runs horizontally");
  assert.ok(gx > chart.center_px[0], "Greenwich runs to the right");
}

// --- great circle distances against published figures ----------------------
{
  const kmLondonNY = nmToKm(trueNM(51.4700, -0.4543, 40.6413, -73.7781));
  near(kmLondonNY, 5555, 60, "London to New York km");

  const kmSydSantiago = nmToKm(trueNM(-33.9500, 151.1817, -33.3973, -70.7938));
  near(kmSydSantiago, 11350, 150, "Sydney to Santiago km");

  const kmJoburgPerth = nmToKm(trueNM(-26.1394, 28.2468, -31.9385, 115.9672));
  near(kmJoburgPerth, 8300, 150, "Johannesburg to Perth km");
}

// --- a degree of arc is 60 nautical miles ----------------------------------
near(trueNM(0, 0, 1, 0), 60, 1e-6, "one degree of latitude");
near(trueNM(0, 0, 0, 1), 60, 1e-6, "one degree of longitude at the equator");
near(alongParallelNM(60, 1), 30, 1e-6, "a degree of longitude at 60 deg latitude");
near(alongParallelNM(0, 1), 60, 1e-6, "a degree of longitude at the equator");

// --- the mile conversions run the right way round --------------------------
// A statute mile is shorter than a nautical one, so the same distance must be
// a bigger number of statute miles, never a smaller one.
{
  assert.ok(nmToStatute(100) > 100, "statute miles must outnumber nautical");
  near(nmToKm(1), 1.852, 1e-9, "nautical mile in km");
  near(nmToStatute(1), 6075 / 5280, 1e-12, "p.350 foot definition");
  // The two figures Gleason prints elsewhere are the same relation rounded, and
  // land a little wide of the definition. The tolerances below are his spread,
  // not slack in the arithmetic.
  near(nmToStatute(60), 69.16, 0.15, "p.349: English miles to the degree");
  near(nmToStatute(180), 208, 0.9, "Fig. 37: 180 nautical against 208 English");
  // p.350 again: a degree of longitude is four minutes of sun time and 60 miles
  near(timeFromLongitude(0, 1).minutes, 4, 1e-12, "one degree is four minutes");
  near(trueNM(0, 0, 0, 15), 900, 1e-9, "p.350: 15 degrees is 900 miles");
}

// --- the chart's own business: longitude as time ---------------------------
near(timeFromLongitude(0, 15).minutes, 60, 1e-9, "15 degrees is one hour");
near(timeFromLongitude(0, 180).minutes, 720, 1e-9, "180 degrees is twelve hours");
assert.equal(sunTimeAt(0), "12:00:00", "Greenwich noon");
assert.equal(sunTimeAt(-15), "11:00:00", "one hour behind at 15 W");

// --- the ruler is true only along a radial ---------------------------------
// Two points on the same meridian: the straight line passes through the centre,
// so reading it against the chart's radial scale is exact.
{
  const [ax, ay] = P.forward(60, 20);
  const [bx, by] = P.forward(-20, 20 - 180); // opposite meridian, straight through
  const ruler = rulerNM(ax, ay, bx, by, chart.px_per_degree);
  const truth = trueNM(60, 20, -20, 20 - 180);
  near(ruler, truth, 1e-6, "ruler along a radial through the centre");
}

// Two points at the same latitude far from the centre: the straight line does
// not pass through the centre, and the reading is wrong by a wide margin.
{
  const A = [-33.95, 151.18], B = [-33.40, -70.79]; // Sydney, Santiago
  const [ax, ay] = P.forward(...A);
  const [bx, by] = P.forward(...B);
  const ruler = rulerNM(ax, ay, bx, by, chart.px_per_degree);
  const truth = trueNM(...A, ...B);
  assert.ok(ruler > truth * 1.5,
    `ruler across the chart should badly overstate: ruler ${ruler.toFixed(0)} vs ${truth.toFixed(0)}`);
}

// --- recentring makes the ruler true again ---------------------------------
// This is the whole point of an equidistant projection: distances are true
// from the centre outwards, so put the centre where you are measuring from.
for (const [A, B] of [
  [[-33.95, 151.18], [-33.40, -70.79]],
  [[51.47, -0.45], [40.64, -73.78]],
  [[-26.14, 28.25], [-31.94, 115.97]],
  [[35.55, 139.78], [-33.95, 151.18]],
]) {
  const O = makeObliqueProjection(A[0], A[1], P);
  const [ax, ay] = O.forward(...A);
  const [bx, by] = O.forward(...B);
  near(ax, O.cx, 1e-6, "recentred origin sits at the centre");
  near(ay, O.cy, 1e-6, "recentred origin sits at the centre");
  const ruler = rulerNM(ax, ay, bx, by, chart.px_per_degree);
  near(ruler, trueNM(...A, ...B), 1e-6, "recentred ruler is exact");

  // and the inverse still round trips
  const back = O.inverse(bx, by);
  near(back[0], B[0], 1e-8, "oblique round trip lat");
  near(back[1], B[1], 1e-8, "oblique round trip lon");
}

// --- great circle path stays on the great circle ---------------------------
{
  const A = [51.47, -0.45], B = [35.55, 139.78];
  const path = greatCirclePath(...A, ...B, 60);
  near(path[0][0], A[0], 1e-8, "path starts at A");
  near(path[path.length - 1][0], B[0], 1e-6, "path ends at B");
  near(path[path.length - 1][1], B[1], 1e-6, "path ends at B");
  // every vertex splits the total angle in the right proportion
  const total = centralAngle(...A, ...B);
  for (let i = 0; i <= 60; i++) {
    near(centralAngle(...A, ...path[i]), total * i / 60, 1e-6, `path vertex ${i}`);
  }
}

// --- bearings --------------------------------------------------------------
near(initialBearing(0, 0, 10, 0), 0, 1e-9, "due north");
near(initialBearing(0, 0, 0, 10), 90, 1e-9, "due east at the equator");
{
  const [lat, lon] = alongBearing(0, 0, 90, 10);
  near(lat, 0, 1e-9, "east along the equator stays on the equator");
  near(lon, 10, 1e-9, "east along the equator by ten degrees");
}

// --- the south pole is the whole rim ---------------------------------------
// It is a legitimate destination for the graticule computations even though the
// projection cannot draw it as a point.
{
  near(trueNM(90, 0, -90, 0), 180 * 60, 1e-9, "pole to pole is half the world");
  near(trueNM(0, 0, -90, 0), 90 * 60, 1e-9, "equator to the south pole");
  near(trueNM(0, 137, -90, 0), 90 * 60, 1e-9, "longitude cannot matter at the pole");
  // every meridian reaches it at the same radius on the chart
  const rs = [0, 45, -120, 179].map((lon) => {
    const [x, y] = P.forward(-90, lon);
    return Math.hypot(x - chart.center_px[0], y - chart.center_px[1]);
  });
  // radius_180deg_px is published rounded to two decimals
  for (const r of rs) near(r, chart.radius_180deg_px, 0.01, "south pole sits on the rim");
}

// --- a point on the rim is placed so the reading means something ------------
// The south pole is the whole boundary circle. Placing it on the other point's
// meridian makes the straight line between them a radial, so the ruler is exact
// from any starting longitude, not just ones near Greenwich.
{
  const resolve = (pt, other) =>
    centralAngle(P.center[0], P.center[1], pt.lat, pt.lon) > 179.5
      ? { lat: pt.lat, lon: other.lon } : pt;

  for (const [name, lat, lon] of [
    ["Tokyo", 35.55, 139.78],
    ["London", 51.47, -0.45],
    ["Santiago", -33.40, -70.79],
    ["Auckland", -37.01, 174.79],
  ]) {
    const A = { lat, lon }, B = { lat: -90, lon: 0 };
    const [ax, ay] = P.forward(...Object.values(resolve(A, B)));
    const [bx, by] = P.forward(...Object.values(resolve(B, A)));
    const truth = trueNM(lat, lon, -90, 0);
    near(rulerNM(ax, ay, bx, by, chart.px_per_degree), truth, 0.01,
      `ruler to the south pole from ${name}`);
  }

  // Without the rule, a start far from Greenwich reads a chord, not a radial.
  const [tx, ty] = P.forward(35.55, 139.78);
  const [px, py] = P.forward(-90, 0);
  assert.ok(rulerNM(tx, ty, px, py, chart.px_per_degree) > trueNM(35.55, 139.78, -90, 0) * 1.02,
    "an arbitrary rim point should misread");
}

// --- the poles do not break the projection or the path ----------------------
// Recentring on a pole is the case where the tidier longitude formula collapses
// to atan2(0, 0), and a pole is also where a bearing stops being defined.
{
  for (const lat0 of [90, -90, 89.9, -89.9]) {
    const O = makeObliqueProjection(lat0, 0, P);
    for (const [lat, lon] of [[35.55, 139.78], [-33.95, 151.18], [0, -70], [51.47, -0.45]]) {
      const [x, y] = O.forward(lat, lon);
      const back = O.inverse(x, y);
      assert.ok(back, `recentred on ${lat0}: ${lat},${lon} should project`);
      near(back[0], lat, 1e-6, `recentred on ${lat0}: round trip lat`);
      near(back[1], lon, 1e-6, `recentred on ${lat0}: round trip lon`);
    }
  }

  // Recentring on the north pole must reproduce the chart's own geometry:
  // same distance from the centre for every point.
  const O = makeObliqueProjection(90, 0, P);
  for (const [lat, lon] of [[35.55, 139.78], [-33.95, 151.18], [0, 0]]) {
    const [x, y] = O.forward(lat, lon);
    near(Math.hypot(x - O.cx, y - O.cy) / O.k, 90 - lat, 1e-6,
      "recentred on the pole keeps colatitude as the radius");
  }
}

// --- paths through a pole stay on one meridian ------------------------------
{
  // Pole to pole: every vertex on a single meridian, latitude marching down.
  const path = greatCirclePath(90, 0, -90, 0, 36);
  const lons = new Set(path.map((p) => p[1].toFixed(6)));
  assert.equal(lons.size, 1, `pole to pole should hold one meridian, got ${[...lons]}`);
  near(path[0][0], 90, 1e-9, "starts at the north pole");
  near(path[path.length - 1][0], -90, 1e-9, "ends at the south pole");
  for (let i = 1; i < path.length; i++) {
    assert.ok(path[i][0] < path[i - 1][0], "latitude must fall monotonically");
  }

  // From the pole to an ordinary place: along that place's meridian.
  const p2 = greatCirclePath(90, 0, 35.55, 139.78, 24);
  for (const [, lon] of p2) near(lon, 139.78, 1e-9, "pole to Tokyo holds Tokyo's meridian");
  near(centralAngle(90, 0, ...p2[p2.length - 1]), centralAngle(90, 0, 35.55, 139.78), 1e-9,
    "pole to Tokyo ends at Tokyo");
}

// --- the rim point is whatever lies opposite the centre ---------------------
// On the printed chart that is the south pole. Recentred, it is the far side of
// wherever the chart was recentred, so the test cannot assume a pole.
{
  const onRim = (proj, pt) =>
    centralAngle(proj.center[0], proj.center[1], pt.lat, pt.lon) > 179.5;

  assert.ok(onRim(P, { lat: -90, lon: 0 }), "printed: south pole is on the rim");
  assert.ok(!onRim(P, { lat: 90, lon: 0 }), "printed: north pole is the centre");
  assert.ok(!onRim(P, { lat: -80, lon: 0 }), "printed: 80 S is not the rim");

  // Recentred on the south pole, it is the north pole that becomes the rim.
  const S = makeObliqueProjection(-90, 0, P);
  assert.ok(onRim(S, { lat: 90, lon: 0 }), "recentred on S: north pole is the rim");
  assert.ok(!onRim(S, { lat: -90, lon: 0 }), "recentred on S: south pole is the centre");

  // Recentred on an ordinary place, the rim is that place's antipode.
  const O = makeObliqueProjection(-33.95, 151.18, P);
  assert.ok(onRim(O, { lat: 33.95, lon: 151.18 - 180 }), "recentred: antipode is the rim");
  assert.ok(!onRim(O, { lat: -90, lon: 0 }), "recentred: the south pole is just a point");
}

// --- distance taken from the time difference --------------------------------
// The chart's output is a difference of sun time, which is an angle at 15
// degrees to the hour. With the two latitudes that gives the angle between the
// places, and 60 miles to the degree gives the distance. Haversine is the same
// relation rearranged, so the two must agree.
{
  const g = gleasonDistance(-33.95, 151.18, -33.40, -70.79);
  near(g.sigmaCos, g.sigma, 1e-9, "cosine form and haversine give the same angle");
  near(g.nm, g.sigma * 60, 1e-9, "60 miles to the degree");
  near(g.nm, trueNM(-33.95, 151.18, -33.40, -70.79), 1e-9, "agrees with the check");

  // Time and angle are the same quantity: 15 degrees to the hour.
  near(g.hours * 15, g.dlon, 1e-12, "15 degrees of longitude to the hour");
  near(gleasonDistance(0, 0, 0, 15).hours, 1, 1e-12, "15 degrees is one hour");

  // On the equator, and only there, a degree of longitude is 60 miles.
  near(gleasonDistance(0, 0, 0, 15).nm, 900, 1e-9, "p.350: 15 degrees is 900 miles");
  near(gleasonDistance(0, 0, 0, 1).nm, 60, 1e-9, "a degree on the equator");

  // Off the equator it is not, which is the point of Fig. 43. The distance
  // between two places one degree apart at 60 N is well short of 60 miles.
  assert.ok(gleasonDistance(60, 0, 60, 1).nm < 31,
    "a degree of longitude at 60 N is about half its equatorial value");

  // Along a meridian the latitudes carry it, and time contributes nothing.
  const m = gleasonDistance(10, 20, 40, 20);
  near(m.dlon, 0, 1e-12, "no time difference along a meridian");
  near(m.nm, 30 * 60, 1e-9, "30 degrees of latitude is 1800 miles");

  // Agreement holds over short and long separations alike.
  for (const [A, B] of [
    [[51.47, -0.45], [48.86, 2.35]],
    [[51.47, -0.45], [40.64, -73.78]],
    [[-26.14, 28.25], [-31.94, 115.97]],
    [[35.55, 139.78], [-33.95, 151.18]],
    [[90, 0], [-90, 0]],
  ]) {
    const d = gleasonDistance(...A, ...B);
    near(d.nm, trueNM(...A, ...B), 1e-8, `time-derived distance for ${A} to ${B}`);
    assert.ok(d.agreement < 1e-6, "the two arrangements must not diverge");
  }
}

console.log("all geo checks passed");

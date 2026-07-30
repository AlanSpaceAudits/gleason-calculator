import { ChartView } from "./chart.js";
import {
  trueNM, rulerNM, alongParallelNM, timeFromLongitude, formatHM,
  formatLat, formatLon, nmToKm, nmToStatute, sunTimeAt, deltaLon,
  centralAngle, gleasonDistance, NM_PER_DEGREE, STATUTE_PER_NM, STATUTE_FEET, NAUTICAL_FEET,
  MINUTES_PER_DEGREE_LON,
} from "./geo.js";

const PLACES = [
  ["Greenwich", 51.4779, -0.0015],
  ["London Heathrow", 51.4700, -0.4543],
  ["New York JFK", 40.6413, -73.7781],
  ["Los Angeles", 33.9416, -118.4085],
  ["Panama", 8.9824, -79.5199],
  ["Rio de Janeiro", -22.9068, -43.1729],
  ["Santiago", -33.3973, -70.7938],
  ["Cape Horn", -55.9833, -67.2667],
  ["Reykjavik", 64.1466, -21.9426],
  ["Cape Town", -33.9249, 18.4241],
  ["Johannesburg", -26.1394, 28.2468],
  ["Cairo", 30.0444, 31.2357],
  ["Moscow", 55.7558, 37.6173],
  ["Mumbai", 19.0760, 72.8777],
  ["Singapore", 1.3521, 103.8198],
  ["Hong Kong", 22.3193, 114.1694],
  ["Tokyo", 35.5533, 139.7811],
  ["Perth", -31.9385, 115.9672],
  ["Sydney", -33.9500, 151.1817],
  ["Auckland", -37.0089, 174.7864],
  ["North Pole", 90, 0],
  ["South Pole", -90, 0],
];

const LESSONS = [
  {
    title: "Longitude into time",
    body: "Greenwich to New York. Read the difference of longitude, then take it at four minutes to the degree. This is the calculation the sheet was patented for.",
    A: "Greenwich", B: "New York JFK", mode: "printed",
  },
  {
    title: "The radial is exact",
    body: "Pole to Singapore. The line runs straight out from the centre, so it lies along a radial and the ruler reads the scale correctly. Ruler and shortest distance agree exactly.",
    A: "North Pole", B: "Singapore", mode: "printed",
  },
  {
    title: "The ruler off to one side",
    body: "Sydney to Santiago on the chart as printed. The straight line never comes near the centre, so it is not on a radial and the reading is far out.",
    A: "Sydney", B: "Santiago", mode: "printed",
  },
  {
    title: "Recentre, and the ruler is true",
    body: "The same two places, the same engraving, replotted about Sydney. Now the line to Santiago is a radial, and the ruler reads correctly.",
    A: "Sydney", B: "Santiago", mode: "recentred",
  },
  {
    title: "Why recentring works",
    body: "The same Sydney to Santiago measurement, recentred. Read this one alongside the chart.",
    A: "Sydney", B: "Santiago", mode: "recentred",
    detail: [
      "Equidistant is a real guarantee, but a narrow one. On this projection distances are true only along straight lines running outward from the centre. Nowhere else.",
      "Gleason put the centre at the north pole. So a straight edge from the pole to anywhere reads correctly. So do any two places on one meridian, because that line passes through the centre on its way.",
      "Sydney to Santiago never comes near the centre. That is why the ruler there overstates the distance by more than double.",
      "Here is the part that does the work: the centre is not a property of the world. It is a choice made when the projection is drawn. Gleason chose the pole. Nothing stops you choosing Sydney.",
      "Recentring takes the same engraving, the same ink, and asks where each piece of it lands if Sydney is the centre instead. Sydney is then in the middle, the line out to Santiago runs straight out from the centre, and the guarantee applies to it. The ruler reads 6,118 n.m., which is right.",
      "The straight line started working because the one place the projection can be trusted was moved to the place being measured from. Nothing was corrected on the map.",
      "The same limit still applies, one step along: this view is true from A only. Measure between two other points on it and you are reading a chord again.",
      "None of this is a workaround. Polar route charts are recentred on the departure airport for exactly this reason, and the pivot at the centre of Gleason's own sheet is there because every operation his patent describes is an angular one taken about that point.",
    ],
  },
  {
    title: "A degree of longitude is not a fixed distance",
    body: "Cape Town and Sydney sit almost on the same parallel. A degree of longitude between them is still four minutes of sun time, the same as anywhere. It is not 60 miles. At 34 degrees south it is about 50. Gleason tabulates that shrinkage in his Fig. 43.",
    A: "Cape Town", B: "Sydney", mode: "printed",
  },
  {
    title: "One point, stretched into a circle",
    body: "North pole to south pole. Look at how B is drawn.",
    A: "North Pole", B: "South Pole", mode: "printed",
    detail: [
      "The projection keeps the north pole as a point. So A is a dot at the centre.",
      "It does not keep the south pole as a point. It stretches it. So B is the dashed circle around the rim.",
      "That circle is not a route to B. It is B.",
      "One dot on a globe projection, one whole circle on this one. Same place, laid out two different ways.",
      "Every projection has to open the surface up somewhere. This one keeps the north pole whole. The cost lands on the opposite point, and the south pole gets pulled out into the entire boundary. Nothing is hidden and nothing is invented. It is stretched.",
      "Every part of that ring is the south pole. All of it, equally. The marker on it is just a handle, so there is something to click and something for the ruler to reach. It could sit anywhere on the ring, so it is put on the other point's meridian.",
      "The numbers are still exact. Pole to pole is 10,800 nautical miles: 180 degrees at sixty miles to the degree. The straight ruler agrees exactly, because that line is a meridian, and a meridian is a radial.",
      "This also explains the blank ring at the edge of the sheet. Antarctica is not missing because nobody had been there. A continent that wraps around the south pole gets stretched the way the pole does, smeared along the whole rim, at a scale that grows without limit as you get closer.",
      "Switch to Recentred on A and it mirrors. The south pole becomes the centre. The north pole becomes the rim.",
      "No projection escapes this. Mercator does it to both poles at once, stretching each into the full width of the map, top and bottom. That is why Greenland comes out looking the size of Africa on it. Every map projection is a set of choices about where to put the stretching.",
    ],
  },
];

const $ = (id) => document.getElementById(id);

// Named places, keyed for the lessons. The value string matches the option
// value built for the selectors below, so setting one syncs the other.
const PLACE_INDEX = new Map(
  PLACES.map(([name, lat, lon]) => [name, { lat, lon, value: `${lat},${lon}` }]),
);

// Captured before anything runs: writeUrl() rewrites the query string during
// setup and would drop the fragment before it could be read.
const INITIAL_HASH = location.hash;
const state = {
  A: { lat: 51.47, lon: -0.45 },
  B: { lat: 40.64, lon: -73.78 },
  next: "A",
  zoom: "disc",
  view: null,
};

// ------------------------------------------------------------------ setup

const meta = await fetch("assets/chart.json").then((r) => r.json());
const image = await new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = () => rej(new Error("chart image failed to load"));
  im.src = meta.chart.image;
});

const canvas = $("chart");
sizeCanvas();
const view = new ChartView(canvas, meta.chart, image);
state.view = view;
view.points = state;

$("georef").textContent =
  `Georeferenced to the scan by coastline fit: centre ${meta.chart.center_px[0].toFixed(1)}, `
  + `${meta.chart.center_px[1].toFixed(1)} px, ${meta.chart.px_per_degree.toFixed(4)} px per degree of `
  + `colatitude, Greenwich at ${meta.chart.meridian_rotation_deg.toFixed(2)}° from image north, `
  + `land and sea agreeing over ${(meta.chart.coastline_agreement * 100).toFixed(1)}% of the disc.`;

for (const id of ["place-A", "place-B"]) {
  const sel = $(id);
  sel.append(new Option("Set by hand or by clicking", ""));
  for (const [name, lat, lon] of PLACES) sel.append(new Option(name, `${lat},${lon}`));
  sel.addEventListener("change", () => {
    if (!sel.value) return;
    const [lat, lon] = sel.value.split(",").map(Number);
    setPoint(id.endsWith("A") ? "A" : "B", lat, lon);
  });
}

for (const key of ["A", "B"]) {
  for (const f of ["lat", "lon"]) {
    $(`${f}-${key}`).addEventListener("input", (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) {
        state[key][f] = v;
        $(`place-${key}`).value = "";
        refresh();
      }
    });
  }
}

$("t-path").addEventListener("change", (e) => { view.showTruePath = e.target.checked; view.draw(); });
$("t-ruler").addEventListener("change", (e) => { view.showRuler = e.target.checked; view.draw(); });
$("t-grat").addEventListener("change", (e) => { view.showGraticule = e.target.checked; view.draw(); });
$("t-arms").addEventListener("change", (e) => { view.showArms = e.target.checked; view.draw(); });
$("t-rings").addEventListener("change", (e) => { view.showRings = e.target.checked; view.draw(); });
$("fit-disc").addEventListener("click", () => setZoom("disc"));
$("fit-sheet").addEventListener("click", () => setZoom("sheet"));

function setZoom(what) {
  $("fit-disc").classList.toggle("on", what === "disc");
  $("fit-sheet").classList.toggle("on", what === "sheet");
  // the recentred rebuild is a bare disc, so there is no sheet to show
  if (what === "sheet" && view.mode === "printed") view.fitSheet();
  else view.fitDisc();
  view.draw();
}

$("mode-printed").addEventListener("click", () => setMode("printed"));
$("mode-recentred").addEventListener("click", () => setMode("recentred"));

const lessonList = $("lessons");
LESSONS.forEach((l) => {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = l.title;

  const p = document.createElement("p");
  p.textContent = l.body;
  li.append(b, p);

  // Longer lessons keep their text folded away until the lesson is run, so the
  // list stays a list rather than an essay.
  let detail = null;
  if (l.detail) {
    detail = document.createElement("div");
    detail.className = "detail";
    detail.hidden = true;
    for (const para of l.detail) {
      const d = document.createElement("p");
      d.textContent = para;
      detail.append(d);
    }
    li.append(detail);
  }

  b.addEventListener("click", () => {
    setPlace("A", l.A);
    setPlace("B", l.B);
    for (const other of lessonList.children) {
      other.classList.toggle("on", other === li);
      const d = other.querySelector(".detail");
      if (d) d.hidden = other !== li;
    }
    setMode(l.mode);
  });

  li.dataset.lesson = String(lessonList.children.length + 1);
  b.id = `lesson-${lessonList.children.length + 1}`;
  lessonList.append(li);
});

// A lesson can be linked to directly, e.g. #lesson-5
function runHashLesson(hash = location.hash) {
  const m = /^#lesson-(\d+)$/.exec(hash);
  if (m) $(`lesson-${m[1]}`)?.click();
}
addEventListener("hashchange", () => runHashLesson());

// -------------------------------------------------------------- pointer

// Pointers are tracked rather than handled one at a time, so two fingers can
// pinch. The canvas sets touch-action: none, so if this does not handle pinch,
// nothing does.
const pointers = new Map();
let drag = null;
let pinch = null;

const backingScale = () => canvas.width / canvas.clientWidth;

function pinchState() {
  const [p, q] = [...pointers.values()];
  return {
    dist: Math.hypot(q.x - p.x, q.y - p.y),
    cx: (p.x + q.x) / 2,
    cy: (p.y + q.y) / 2,
  };
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pointers.size === 2) {
    pinch = pinchState();
    drag = null; // a second finger ends the pan and starts a zoom
  } else if (pointers.size === 1) {
    drag = { x: e.offsetX, y: e.offsetY, moved: 0 };
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  const s = backingScale();

  if (pointers.size >= 2) {
    const now = pinchState();
    if (pinch && pinch.dist > 0 && now.dist > 0) {
      view.zoomAt(now.cx * s, now.cy * s, now.dist / pinch.dist);
      view.pan((now.cx - pinch.cx) * s, (now.cy - pinch.cy) * s);
      view.draw();
    }
    pinch = now;
    return;
  }

  if (!drag) return;
  const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = e.offsetX; drag.y = e.offsetY;
  view.pan(dx * s, dy * s);
  view.draw();
});

function releasePointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
}

canvas.addEventListener("pointerup", (e) => {
  const wasClick = drag && drag.moved < 6 && pointers.size === 1;
  releasePointer(e);
  drag = null;
  if (!wasClick) return;
  const s = backingScale();
  const [bx, by] = view.toBase(e.offsetX * s, e.offsetY * s);
  const ll = view.proj.inverse(bx, by);
  if (!ll || ll[0] < -90 || ll[0] > 90) return;
  const key = state.next;
  setPoint(key, ll[0], ll[1]);
  $(`place-${key}`).value = "";
  state.next = key === "A" ? "B" : "A";
});

canvas.addEventListener("pointercancel", (e) => {
  releasePointer(e);
  drag = null;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const s = canvas.width / canvas.clientWidth;
  view.zoomAt(e.offsetX * s, e.offsetY * s, e.deltaY < 0 ? 1.14 : 1 / 1.14);
  view.draw();
}, { passive: false });

// The canvas is sized in CSS, so it has to be re-measured whenever the box
// changes. ResizeObserver catches the cases a resize event misses: a phone
// rotating, the address bar collapsing, the panel reflowing.
const refit = () => {
  publishChartHeight();
  if (!sizeCanvas()) return;
  $("fit-sheet").classList.contains("on") && view.mode === "printed"
    ? view.fitSheet() : view.fitDisc();
  view.draw();
};

// The side columns match the chart's depth exactly. Its height cannot be
// written in CSS because it is whichever of the column width or the viewport
// height turns out smaller, so it is measured and published as a variable.
function publishChartHeight() {
  const h = canvas.getBoundingClientRect().height;
  if (h > 0) document.documentElement.style.setProperty("--chart-h", `${Math.round(h)}px`);
}

addEventListener("resize", refit);
addEventListener("orientationchange", refit);
new ResizeObserver(refit).observe(canvas);

function sizeCanvas() {
  // Cap the backing store: past this, the extra pixels cost memory on phones
  // and buy nothing on screen.
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.min(2400, Math.round((canvas.clientWidth || 1000) * dpr));
  if (w === canvas.width) return false;
  canvas.width = canvas.height = w;
  return true;
}

// --------------------------------------------------------------- actions

function setPoint(key, lat, lon) {
  state[key] = { lat, lon };
  refresh();
}

// Set a point by name and show that name in its selector, so a lesson leaves
// the reader able to see which places it chose.
function setPlace(key, name) {
  const p = PLACE_INDEX.get(name);
  if (!p) throw new Error(`unknown place: ${name}`);
  state[key] = { lat: p.lat, lon: p.lon };
  $(`place-${key}`).value = p.value;
}

// The address bar carries the two points and the centre, so a particular
// measurement can be linked to.
function readUrl() {
  const q = new URLSearchParams(location.search);
  for (const key of ["a", "b"]) {
    const v = q.get(key);
    if (!v) continue;
    const [lat, lon] = v.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) state[key.toUpperCase()] = { lat, lon };
  }
  if (q.get("zoom") === "sheet") state.zoom = "sheet";
  if (q.get("rings") === "1") {
    $("t-rings").checked = true;
    view.showRings = true;
  }
  if (q.get("arms") === "1") {
    $("t-arms").checked = true;
    view.showArms = true;
  }
  return q.get("mode") === "recentred" ? "recentred" : "printed";
}

function writeUrl() {
  const q = new URLSearchParams();
  q.set("a", `${state.A.lat.toFixed(4)},${state.A.lon.toFixed(4)}`);
  q.set("b", `${state.B.lat.toFixed(4)},${state.B.lon.toFixed(4)}`);
  if (view.mode === "recentred") q.set("mode", "recentred");
  if ($("fit-sheet").classList.contains("on")) q.set("zoom", "sheet");
  if (view.showArms) q.set("arms", "1");
  if (view.showRings) q.set("rings", "1");
  history.replaceState(null, "", `?${q}`);
}

function setMode(mode) {
  $("mode-printed").classList.toggle("on", mode === "printed");
  $("mode-recentred").classList.toggle("on", mode === "recentred");
  // The arms measure longitude about the pole. Recentred, the centre is no
  // longer the pole, so there is nothing for them to read.
  const arms = $("t-arms");
  arms.disabled = mode !== "printed";
  arms.parentElement.title = arms.disabled
    ? "The arms read longitude about the pole, so they apply to the printed chart only"
    : "Two arms pivoted at the pole, reading the angle between the two meridians";
  if (mode === "printed") {
    view.showPrinted();
    refresh();
    return;
  }
  const busy = $("busy");
  busy.hidden = false;
  // yield a frame so the notice paints before the rebuild blocks the thread
  requestAnimationFrame(() => requestAnimationFrame(() => {
    view.buildOblique(state.A.lat, state.A.lon);
    busy.hidden = true;
    refresh();
  }));
}

function refresh() {
  const { A, B } = state;
  for (const key of ["A", "B"]) {
    const el = { lat: $(`lat-${key}`), lon: $(`lon-${key}`) };
    if (document.activeElement !== el.lat) el.lat.value = state[key].lat.toFixed(2);
    if (document.activeElement !== el.lon) el.lon.value = state[key].lon.toFixed(2);
  }

  // If the chart is recentred, it is recentred on A, so moving A rebuilds it.
  if (view.mode === "recentred"
      && (view.proj.lat0 !== A.lat || view.proj.lon0 !== A.lon)) {
    view.buildOblique(A.lat, A.lon);
  }

  view.draw();
  readouts();
  writeUrl();
}

function readouts() {
  const { A, B } = state;
  const { dlon, minutes } = timeFromLongitude(A.lon, B.lon);

  $("r-dlon").textContent = `${Math.abs(dlon).toFixed(2)}° ${dlon >= 0 ? "east" : "west"}`;
  $("r-time").textContent = formatHM(minutes);
  $("r-sunA").textContent = `${sunTimeAt(A.lon)}  (${formatLon(A.lon)})`;
  $("r-sunB").textContent = `${sunTimeAt(B.lon)}  (${formatLon(B.lon)})`;

  const noonAtB = (12 * 60 + minutes + 1440 * 3) % 1440;
  const nh = Math.floor(noonAtB / 60), nm = Math.floor(noonAtB % 60);
  $("r-noon").textContent = `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;

  const G = gleasonDistance(A.lat, A.lon, B.lat, B.lon);
  const truth = trueNM(A.lat, A.lon, B.lat, B.lon);
  const [ax, ay] = view.pixelOf(A, B);
  const [bx, by] = view.pixelOf(B, A);
  const ruler = rulerNM(ax, ay, bx, by, view.proj.k);

  $("r-gle").textContent = `${fmt(G.nm)} n.m.`;
  $("r-gle-alt").textContent = units(G.nm);
  $("r-ns").textContent = `${G.dlon.toFixed(2)}°`;
  $("r-ew").textContent = `${G.sigma.toFixed(3)}°`;
  $("r-true").textContent = `${fmt(truth)} n.m.`;
  $("r-true-alt").textContent = units(truth);
  $("r-ruler").textContent = `${fmt(ruler)} n.m.`;
  $("r-ruler-alt").textContent = units(ruler);

  $("r-gc-diff").textContent = G.agreement < 1e-6
    ? "exact" : `${G.agreement.toExponential(1)}° apart`;
  $("r-par").textContent = `${fmt(alongParallelNM(A.lat, dlon))} n.m.`;

  // The ruler is judged against Gleason's own figure, which is the chart's
  // method; the great circle sits alongside as a check on that figure.
  const diff = ruler - G.nm;
  const err = G.nm > 0 ? diff / G.nm * 100 : 0;
  const exact = Math.abs(err) < 0.05;
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
  const errEl = $("r-err");
  errEl.textContent = exact ? "exact" : `${sign}${Math.abs(err).toFixed(1)}%`;
  errEl.className = exact ? "" : "warn";
  const errAlt = $("r-err-alt");
  errAlt.textContent = exact ? "" : units(Math.abs(diff), sign, true);
  errAlt.className = exact ? "muted sub alt" : "warn sub alt";

  $("r-rad").textContent = `${fmt((90 - A.lat) * NM_PER_DEGREE)} / ${fmt((90 - B.lat) * NM_PER_DEGREE)} n.m.`;

  const arcmin = Math.abs(dlon) * 60;
  $("r-arcmin").textContent = `${fmt(arcmin)}′`;
  $("r-scale-time").textContent = formatHM(minutes).replace(/^[+-]/, "");
  $("r-geo").textContent = `${fmt(Math.abs(dlon) * NM_PER_DEGREE)} geo. miles`;
  $("r-eng").textContent = `${fmt(Math.abs(dlon) * NM_PER_DEGREE * STATUTE_PER_NM)} Eng. miles`;

  $("r-note").textContent = note(err);
  equations({ A, B, dlon, minutes, truth, ruler, ax, ay, bx, by, G });
}

// Every readout written out as the arithmetic behind it, with this pair's
// numbers substituted, so nothing on the panel is a black box.
const n = (v, d = 2) => `<span class="v">${v.toFixed(d)}</span>`;
const res = (v) => `<span class="r">${v}</span>`;

function equations({ A, B, dlon, minutes, truth, ruler, ax, ay, bx, by, G }) {
  const k = view.proj.k;
  const L = Math.hypot(bx - ax, by - ay);
  const sigma = centralAngle(A.lat, A.lon, B.lat, B.lon);
  const absLon = Math.abs(dlon);

  $("eq-time").innerHTML = `
<h3>Difference of longitude</h3>
<div>Δλ = λB − λA
   = ${n(B.lon)}° − ${n(A.lon)}° = ${res(dlon.toFixed(2) + "°")}</div>
<h3>Longitude as sun time</h3>
<div>Δt = Δλ × ${MINUTES_PER_DEGREE_LON} min/°
   = ${n(dlon)}° × ${MINUTES_PER_DEGREE_LON} = ${res(minutes.toFixed(1) + " min")} = ${res(formatHM(minutes))}</div>`;

  $("eq-dist").innerHTML = `
<h3>From the difference in sun time</h3>
<div>Δt = ${res(formatHM(minutes))} = ${n(G.hours, 4)} hours

the sheet's rule: 15° of longitude to the hour
Δλ = Δt × 15°/h
   = ${n(G.hours, 4)} h × 15 = ${res(G.dlon.toFixed(2) + "°")}

that angle taken with the two latitudes
cos σ = sin φA · sin φB
      + cos φA · cos φB · cos Δλ
      = ${n(G.cosSigma, 6)}
    σ = ${res(G.sigmaCos.toFixed(3) + "°")}

Gleason's 60 geographical miles to the degree
    d = σ × 60
      = ${n(G.sigma, 3)}° × 60 = ${res(fmt(G.nm) + " n.m.")}

so ${res(formatHM(minutes).replace(/^[+-]/, ""))} of sun time between these two
places is ${res(fmt(G.nm) + " n.m.")}, ${res(fmt(nmToStatute(G.nm)) + " English miles")}</div>
<h3>Straight ruler on the chart</h3>
<div>L = length of the drawn line = ${n(L, 1)} px
k = ${n(k, 4)} px per degree of arc
d = (L ÷ k) × 60 n.m./°
  = ${n(L / k, 3)}° × 60 = ${res(fmt(ruler) + " n.m.")}</div>
<h3>Haversine, the same relation rearranged</h3>
<div>a = sin²(Δφ/2)
  + cos φA · cos φB · sin²(Δλ/2)
σ = 2 · asin(√a) = ${res(sigma.toFixed(3) + "°")}
d = σ × 60 = ${res(fmt(truth) + " n.m.")}
the cosine form above loses precision when the
two places are close, so this is the arrangement
the value is taken from. Both give the same σ.</div>
<h3>Along the parallel of A, Fig. 43</h3>
<div>this answers a different question: how far
along A's own parallel, not the shortest way
d = |Δλ| × 60 × cos φA
  = ${n(absLon)}° × 60 × cos ${n(A.lat)}°
  = ${res(fmt(alongParallelNM(A.lat, dlon)) + " n.m.")}</div>
<h3>Radial from the pole</h3>
<div>d = (90° − φ) × 60
A: (90 − ${n(A.lat)}) × 60 = ${res(fmt((90 - A.lat) * NM_PER_DEGREE) + " n.m.")}
B: (90 − ${n(B.lat)}) × 60 = ${res(fmt((90 - B.lat) * NM_PER_DEGREE) + " n.m.")}</div>`;

  $("eq-scale").innerHTML = `
<h3>Fig. 38, longitude against sun time</h3>
<div>arc = |Δλ| × 60 = ${n(absLon)}° × 60 = ${res(fmt(absLon * 60) + "′")}
t   = |Δλ| × ${MINUTES_PER_DEGREE_LON} min/° = ${res(formatHM(minutes).replace(/^[+-]/, ""))}</div>
<h3>Fig. 37, geographical against English miles</h3>
<div>geo = |Δλ| × 60 = ${res(fmt(absLon * NM_PER_DEGREE) + " geo. miles")}
Eng = geo × ${NAUTICAL_FEET}/${STATUTE_FEET}
    = ${n(absLon * NM_PER_DEGREE, 1)} × ${STATUTE_PER_NM.toFixed(5)}
    = ${res(fmt(absLon * NM_PER_DEGREE * STATUTE_PER_NM) + " Eng. miles")}</div>`;
}

const atSouthPole = (pt) => pt.lat <= -89.5;

function note(err) {
  if (atSouthPole(state.A) || atSouthPole(state.B)) {
    return "One dot on a globe projection, one whole circle on this one. The dashed "
      + "ring is the pole itself, stretched to the size this projection gives "
      + "it. Every part of that ring is the pole. The marker is just a handle. "
      + "It sits on the other point's meridian, so the line between them runs "
      + "along a radial and measures correctly.";
  }
  if (view.mode === "recentred") {
    return "The chart is recentred on A, so every straight line out of A is a radial and the ruler is exact along it. Distances between two other points on this view are not.";
  }
  if (Math.abs(err) < 0.05) {
    return "This line passes through the centre of the chart, so it lies along a radial and the ruler is reading the scale it appears to be reading.";
  }
  return "This line does not pass through the centre, so it is not along a radial. Recentre the chart on A to measure it with a straight edge.";
}

// Value and unit are joined by a non-breaking space, so a line that has to wrap
// breaks at a separator rather than orphaning "km" onto its own line.
function units(nm, sign = "", withNautical = false) {
  const part = (v, unit) => `${sign}${fmt(v)}\u00a0${unit}`;
  const bits = withNautical ? [part(nm, "n.m.")] : [];
  bits.push(part(nmToStatute(nm), "English\u00a0miles"), part(nmToKm(nm), "km"));
  return bits.join(" · ");
}

function fmt(v) {
  return v >= 10000 ? v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : v.toFixed(1);
}

// ------------------------------------------------------------------- go

setMode(readUrl());
setZoom(state.zoom);
runHashLesson(INITIAL_HASH);

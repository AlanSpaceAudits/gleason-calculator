import { ChartView } from "./chart.js";
import { t, pickLang, loadLang, applyTranslations, buildSwitcher } from "./i18n.js";
import {
  trueNM, rulerNM, alongParallelNM, timeFromLongitude, formatHM,
  formatLat, formatLon, nmToKm, nmToStatute, sunTimeAt, deltaLon,
  centralAngle, gleasonDistance, NM_PER_DEGREE, STATUTE_PER_NM, STATUTE_FEET, NAUTICAL_FEET,
  MINUTES_PER_DEGREE_LON,
} from "./geo.js";

// Coordinates here, names from the dictionary.
const PLACE_KEYS = [
  ["greenwich", 51.4779, -0.0015],
  ["london", 51.4700, -0.4543],
  ["newyork", 40.6413, -73.7781],
  ["losangeles", 33.9416, -118.4085],
  ["panama", 8.9824, -79.5199],
  ["rio", -22.9068, -43.1729],
  ["santiago", -33.3973, -70.7938],
  ["capehorn", -55.9833, -67.2667],
  ["reykjavik", 64.1466, -21.9426],
  ["capetown", -33.9249, 18.4241],
  ["johannesburg", -26.1394, 28.2468],
  ["cairo", 30.0444, 31.2357],
  ["moscow", 55.7558, 37.6173],
  ["mumbai", 19.0760, 72.8777],
  ["singapore", 1.3521, 103.8198],
  ["hongkong", 22.3193, 114.1694],
  ["tokyo", 35.5533, 139.7811],
  ["perth", -31.9385, 115.9672],
  ["sydney", -33.9500, 151.1817],
  ["auckland", -37.0089, 174.7864],
  ["northpole", 90, 0],
  ["southpole", -90, 0],
];

const LESSONS = [
  { id: "l1", A: "greenwich", B: "newyork", mode: "printed" },
  { id: "l2", A: "northpole", B: "singapore", mode: "printed" },
  { id: "l3", A: "sydney", B: "santiago", mode: "printed" },
  { id: "l4", A: "sydney", B: "santiago", mode: "recentred" },
  { id: "l5", A: "sydney", B: "santiago", mode: "recentred", details: 8 },
  { id: "l6", A: "capetown", B: "sydney", mode: "printed" },
  { id: "l7", A: "northpole", B: "southpole", mode: "printed", details: 10 },
];


const $ = (id) => document.getElementById(id);

// Named places, keyed for the lessons. The value string matches the option
// value built for the selectors below, so setting one syncs the other.
const PLACE_INDEX = new Map(
  PLACE_KEYS.map(([key, lat, lon]) => [key, { lat, lon, value: `${lat},${lon}` }]),
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

await loadLang(pickLang());
applyTranslations();

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

function fillGeoref() {
  $("georef").textContent = t("foot.georef",
    meta.chart.center_px[0].toFixed(1), meta.chart.center_px[1].toFixed(1),
    meta.chart.px_per_degree.toFixed(4), meta.chart.meridian_rotation_deg.toFixed(2),
    (meta.chart.coastline_agreement * 100).toFixed(1));
}
fillGeoref();

// Switching language rebuilds every string the app generates, then redraws.
async function switchLang(code) {
  await loadLang(code);
  applyTranslations();
  fillGeoref();
  rebuildSelectors();
  rebuildLessons();
  buildSwitcher($("langs"), switchLang);
  for (const a of document.querySelectorAll('a[href$=".html"]')) {
    const u = new URL(a.getAttribute("href"), location.href);
    u.searchParams.set("lang", code);
    a.setAttribute("href", u.pathname.split("/").pop() + u.search);
  }
  const q = new URLSearchParams(location.search);
  q.set("lang", code);
  history.replaceState(null, "", `?${q}`);
  refresh();
}

buildSwitcher($("langs"), switchLang);

// Option text comes from the dictionary, so it is rebuilt on a language change.
// The listener is attached once, separately.
function rebuildSelectors() {
  for (const id of ["place-A", "place-B"]) {
    const sel = $(id);
    const keep = sel.value;
    sel.innerHTML = "";
    sel.append(new Option(t("points.placeholder"), ""));
    for (const [key, lat, lon] of PLACE_KEYS) {
      sel.append(new Option(t(`place.${key}`), `${lat},${lon}`));
    }
    sel.value = keep;
  }
}

rebuildSelectors();

for (const id of ["place-A", "place-B"]) {
  $(id).addEventListener("change", (e) => {
    if (!e.target.value) return;
    const [lat, lon] = e.target.value.split(",").map(Number);
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

function rebuildLessons() {
    const openId = lessonList.querySelector("li.on")?.dataset.lesson;
    lessonList.innerHTML = "";
    LESSONS.forEach((l) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t(`${l.id}.title`);

    const p = document.createElement("p");
    p.textContent = t(`${l.id}.body`);
    li.append(b, p);

    // Longer lessons keep their text folded away until the lesson is run, so the
    // list stays a list rather than an essay.
    let detail = null;
    if (l.details) {
      detail = document.createElement("div");
      detail.className = "detail";
      detail.hidden = true;
      for (let i = 1; i <= l.details; i++) {
        const d = document.createElement("p");
        d.textContent = t(`${l.id}.d${i}`);
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
    if (li.dataset.lesson === openId) b.click();
  });
}

rebuildLessons();

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
  arms.parentElement.title = t(arms.disabled ? "arms.title.off" : "arms.title.on");
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

  $("r-dlon").textContent = `${Math.abs(dlon).toFixed(2)}° ${dlon >= 0 ? t("unit.east") : t("unit.west")}`;
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

  $("r-gle").textContent = `${fmt(G.nm)} ${t("unit.nm")}`;
  $("r-gle-alt").textContent = units(G.nm);
  $("r-ns").textContent = `${G.dlon.toFixed(2)}°`;
  $("r-ew").textContent = `${G.sigma.toFixed(3)}°`;
  $("r-true").textContent = `${fmt(truth)} ${t("unit.nm")}`;
  $("r-true-alt").textContent = units(truth);
  $("r-ruler").textContent = `${fmt(ruler)} ${t("unit.nm")}`;
  $("r-ruler-alt").textContent = units(ruler);

  $("r-gc-diff").textContent = G.agreement < 1e-6
    ? t("dist.exact") : `${G.agreement.toExponential(1)}° ${t("dist.apart")}`;
  $("r-par").textContent = `${fmt(alongParallelNM(A.lat, dlon))} ${t("unit.nm")}`;

  // The ruler is judged against Gleason's own figure, which is the chart's
  // method; the great circle sits alongside as a check on that figure.
  const diff = ruler - G.nm;
  const err = G.nm > 0 ? diff / G.nm * 100 : 0;
  const exact = Math.abs(err) < 0.05;
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
  const errEl = $("r-err");
  errEl.textContent = exact ? t("dist.exact") : `${sign}${Math.abs(err).toFixed(1)}%`;
  errEl.className = exact ? "" : "warn";
  const errAlt = $("r-err-alt");
  errAlt.textContent = exact ? "" : units(Math.abs(diff), sign, true);
  errAlt.className = exact ? "muted sub alt" : "warn sub alt";

  $("r-rad").textContent = `${fmt((90 - A.lat) * NM_PER_DEGREE)} / ${fmt((90 - B.lat) * NM_PER_DEGREE)} ${t("unit.nm")}`;

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
<h3>${t("eq.dlon")}</h3>
<div>Δλ = λB − λA
   = ${n(B.lon)}° − ${n(A.lon)}° = ${res(dlon.toFixed(2) + "°")}</div>
<h3>${t("eq.asTime")}</h3>
<div>Δt = Δλ × ${MINUTES_PER_DEGREE_LON} min/°
   = ${n(dlon)}° × ${MINUTES_PER_DEGREE_LON} = ${res(minutes.toFixed(1) + " min")} = ${res(formatHM(minutes))}</div>`;

  $("eq-dist").innerHTML = `
<h3>${t("eq.fromTime")}</h3>
<div>Δt = ${res(formatHM(minutes))} = ${n(G.hours, 4)} ${t("unit.hours")}

${t("eq.rule15")}
Δλ = Δt × 15°/h
   = ${n(G.hours, 4)} h × 15 = ${res(G.dlon.toFixed(2) + "°")}

${t("eq.withLats")}
cos σ = sin φA · sin φB
      + cos φA · cos φB · cos Δλ
      = ${n(G.cosSigma, 6)}
    σ = ${res(G.sigmaCos.toFixed(3) + "°")}

${t("eq.sixty")}
    d = σ × 60
      = ${n(G.sigma, 3)}° × 60 = ${res(fmt(G.nm) + " n.m.")}

${t("eq.so")} ${res(formatHM(minutes).replace(/^[+-]/, ""))} ${t("eq.ofSunTime")}
${t("eq.placesIs")} ${res(fmt(G.nm) + " " + t("unit.nm"))}, ${res(fmt(nmToStatute(G.nm)) + " " + t("unit.eng"))}</div>
<h3>${t("eq.rulerHead")}</h3>
<div>${t("eq.lineLen")} = ${n(L, 1)} px
${t("eq.perDeg", n(k, 4))}
d = (L ÷ k) × 60 ${t("unit.nm")}/°
  = ${n(L / k, 3)}° × 60 = ${res(fmt(ruler) + " " + t("unit.nm"))}</div>
<h3>${t("eq.haversineHead")}</h3>
<div>a = sin²(Δφ/2)
  + cos φA · cos φB · sin²(Δλ/2)
σ = 2 · asin(√a) = ${res(sigma.toFixed(3) + "°")}
d = σ × 60 = ${res(fmt(truth) + " " + t("unit.nm"))}
${t("eq.haversineNote")}</div>
<h3>${t("eq.parallelHead")}</h3>
<div>${t("eq.parallelNote")}
d = |Δλ| × 60 × cos φA
  = ${n(absLon)}° × 60 × cos ${n(A.lat)}°
  = ${res(fmt(alongParallelNM(A.lat, dlon)) + " " + t("unit.nm"))}</div>
<h3>${t("eq.radialHead")}</h3>
<div>d = (90° − φ) × 60
A: (90 − ${n(A.lat)}) × 60 = ${res(fmt((90 - A.lat) * NM_PER_DEGREE) + " " + t("unit.nm"))}
B: (90 − ${n(B.lat)}) × 60 = ${res(fmt((90 - B.lat) * NM_PER_DEGREE) + " " + t("unit.nm"))}</div>`;

  $("eq-scale").innerHTML = `
<h3>${t("eq.fig38")}</h3>
<div>${t("eq.arc")} = |Δλ| × 60 = ${n(absLon)}° × 60 = ${res(fmt(absLon * 60) + "′")}
t   = |Δλ| × ${MINUTES_PER_DEGREE_LON} min/° = ${res(formatHM(minutes).replace(/^[+-]/, ""))}</div>
<h3>${t("eq.fig37")}</h3>
<div>${t("eq.geo")} = |Δλ| × 60 = ${res(fmt(absLon * NM_PER_DEGREE) + " " + t("unit.geo"))}
${t("eq.eng")} = ${t("eq.geo")} × ${NAUTICAL_FEET}/${STATUTE_FEET}
    = ${n(absLon * NM_PER_DEGREE, 1)} × ${STATUTE_PER_NM.toFixed(5)}
    = ${res(fmt(absLon * NM_PER_DEGREE * STATUTE_PER_NM) + " " + t("unit.engShort"))}</div>`;
}

const atSouthPole = (pt) => pt.lat <= -89.5;

function note(err) {
  if (atSouthPole(state.A) || atSouthPole(state.B)) {
    return t("note.pole");
  }
  if (view.mode === "recentred") {
    return t("note.recentred");
  }
  if (Math.abs(err) < 0.05) {
    return t("note.radial");
  }
  return t("note.offCentre");
}

// Value and unit are joined by a non-breaking space, so a line that has to wrap
// breaks at a separator rather than orphaning "km" onto its own line.
function units(nm, sign = "", withNautical = false) {
  const part = (v, unit) => `${sign}${fmt(v)}\u00a0${unit}`;
  const bits = withNautical ? [part(nm, t("unit.nm"))] : [];
  bits.push(part(nmToStatute(nm), t("unit.eng").replace(/ /g, "\u00a0")), part(nmToKm(nm), t("unit.km")));
  return bits.join(" · ");
}

function fmt(v) {
  return v >= 10000 ? v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : v.toFixed(1);
}

// ------------------------------------------------------------------- go

setMode(readUrl());
setZoom(state.zoom);
runHashLesson(INITIAL_HASH);

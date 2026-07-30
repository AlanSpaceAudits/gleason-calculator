// Canvas view of the chart: pan, zoom, overlays, and the recentred rebuild.

import { t } from "./i18n.js";
import {
  makeProjection, makeObliqueProjection, greatCirclePath, centralAngle,
  deltaLon, MINUTES_PER_DEGREE_LON, D2R,
} from "./geo.js";

const OBLIQUE_SIDE = 1400; // working size of the recentred rebuild, in its own pixels
const SOURCE_W = 1700;     // downsample of the sheet used as the sampling source

export class ChartView {
  constructor(canvas, chartMeta, image) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.meta = chartMeta;
    this.image = image;

    this.polar = makeProjection(chartMeta);
    this.base = image;            // what gets drawn underneath
    this.proj = this.polar;       // projection matching `base`
    this.mode = "printed";
    this.baseW = chartMeta.width;
    this.baseH = chartMeta.height;

    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.fitDisc();

    this.points = { A: null, B: null };
    this.showTruePath = true;
    this.showRuler = true;
    this.showGraticule = false;
    this.showArms = false;
    this.showRings = false;

    this._sourceData = null;
    this._obliqueCanvas = null;
  }

  // ------------------------------------------------------------- transform

  // Fit the whole delivered image, so the title block, the rulers, the solstice
  // diagrams and Gleason's printed notes are all on screen.
  fitSheet() {
    const s = Math.min(this.canvas.width / this.baseW, this.canvas.height / this.baseH);
    this._setView(s, this.baseW / 2, this.baseH / 2);
  }

  // Fit the map disc alone: the 180 degree circle with a hair of margin, so the
  // engraving is as large as the box allows. The hour dial and the printed
  // rulers outside it are one click away under "Whole sheet".
  fitDisc() {
    const r = this.proj.k * 180 * 1.03;
    const s = Math.min(this.canvas.width, this.canvas.height) / (r * 2);
    this._setView(s, this.proj.cx, this.proj.cy);
  }

  _setView(scale, bx, by) {
    this.scale = scale;
    this.tx = this.canvas.width / 2 - bx * scale;
    this.ty = this.canvas.height / 2 - by * scale;
  }

  toScreen(x, y) {
    return [x * this.scale + this.tx, y * this.scale + this.ty];
  }

  toBase(sx, sy) {
    return [(sx - this.tx) / this.scale, (sy - this.ty) / this.scale];
  }

  zoomAt(sx, sy, factor) {
    const [bx, by] = this.toBase(sx, sy);
    this.scale = Math.min(12, Math.max(0.05, this.scale * factor));
    this.tx = sx - bx * this.scale;
    this.ty = sy - by * this.scale;
  }

  pan(dx, dy) {
    this.tx += dx;
    this.ty += dy;
  }

  // ------------------------------------------------------ recentred rebuild

  // Redraw the scan as an azimuthal equidistant chart centred on the given
  // point. Every pixel of the destination is inverse projected to a coordinate
  // and that coordinate is looked up in the original scan, so nothing is
  // invented: it is the same engraving, replotted about a different centre.
  buildOblique(lat0, lon0, onProgress) {
    if (!this._sourceData) this._sourceData = this._readSource();
    const src = this._sourceData;
    const srcW = src.width, srcH = src.height;
    const srcScale = srcW / this.meta.width;
    const scx = this.meta.center_px[0] * srcScale;
    const scy = this.meta.center_px[1] * srcScale;
    const sk = this.meta.px_per_degree * srcScale;
    const rot = this.meta.meridian_rotation_deg;

    const side = OBLIQUE_SIDE;
    const k = side / 2 / 180;
    const cx = side / 2, cy = side / 2;
    const out = new ImageData(side, side);
    const o = out.data;
    const s = src.data;

    const p0 = lat0 * D2R;
    const sin0 = Math.sin(p0), cos0 = Math.cos(p0);
    const lon0r = lon0 * D2R;

    for (let y = 0; y < side; y++) {
      const dy = y - cy;
      for (let x = 0; x < side; x++) {
        const dx = x - cx;
        const r = Math.sqrt(dx * dx + dy * dy);
        const c = (r / k) * D2R;
        const di = (y * side + x) * 4;
        if (c > Math.PI) continue; // beyond the antipode

        const az = Math.atan2(dx, -dy);
        const sinc = Math.sin(c), cosc = Math.cos(c);
        const lat = Math.asin(sin0 * cosc + cos0 * sinc * Math.cos(az));
        // Snyder's longitude form: the shorter rearrangement degenerates to
        // atan2(0, 0) when recentring on a pole, smearing one meridian over the
        // whole disc.
        const lon = lon0r + Math.atan2(
          Math.sin(az) * sinc,
          cos0 * cosc - Math.cos(az) * sin0 * sinc,
        );

        // forward into the original polar chart
        const rr = (90 - lat / D2R) * sk;
        const b = (rot - lon / D2R) * D2R;
        const sx = (scx + rr * Math.sin(b)) | 0;
        const sy = (scy - rr * Math.cos(b)) | 0;
        if (sx < 0 || sy < 0 || sx >= srcW || sy >= srcH) continue;

        const si = (sy * srcW + sx) * 4;
        o[di] = s[si];
        o[di + 1] = s[si + 1];
        o[di + 2] = s[si + 2];
        o[di + 3] = 255;
      }
      if (onProgress && (y & 127) === 0) onProgress(y / side);
    }

    const cv = document.createElement("canvas");
    cv.width = cv.height = side;
    cv.getContext("2d").putImageData(out, 0, 0);
    this._obliqueCanvas = cv;
    this.base = cv;
    this.baseW = this.baseH = side;
    this.proj = makeObliqueProjection(lat0, lon0, { cx, cy, k });
    this.mode = "recentred";
    this.fitDisc();
  }

  showPrinted() {
    this.base = this.image;
    this.proj = this.polar;
    this.baseW = this.meta.width;
    this.baseH = this.meta.height;
    this.mode = "printed";
    this.fitDisc();
  }

  _readSource() {
    const cv = document.createElement("canvas");
    cv.width = SOURCE_W;
    cv.height = Math.round(this.meta.height * SOURCE_W / this.meta.width);
    const c = cv.getContext("2d");
    c.drawImage(this.image, 0, 0, cv.width, cv.height);
    return c.getImageData(0, 0, cv.width, cv.height);
  }

  // ------------------------------------------------------------------ draw

  draw() {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f2eee4";  // matches the page, so the surround reads as a mat
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.translate(this.tx, this.ty);
    ctx.scale(this.scale, this.scale);
    ctx.drawImage(this.base, 0, 0, this.baseW, this.baseH);
    ctx.restore();

    if (this.showGraticule) this._drawGraticule();
    if (this.showRings) this._drawRings();

    const { A, B } = this.points;
    if (this.showArms && A && B) this._drawArms(A, B);
    // A point on the rim has no single position, so the ruler and the markers
    // use the resolved placement, the same one the readouts measure against.
    const rA = this.resolve(A, B), rB = this.resolve(B, A);
    if (A && B) {
      if (this.showRuler) this._drawRuler(rA, rB);
      if (this.showTruePath) this._drawTruePath(A, B);
    }
    // Whatever sits opposite the projection's centre maps to the entire
    // boundary circle, so a single marker there would be a lie by omission.
    // On the printed chart that is the south pole; recentred, it is whatever
    // lies on the far side of A.
    if (A && this._onRim(A)) this._drawRimPoint("#0b7285", "A", A);
    if (B && this._onRim(B)) this._drawRimPoint("#a4161a", "B", B);
    if (rA) this._drawMarker(rA, "A", "#0b7285");
    if (rB) this._drawMarker(rB, "B", "#a4161a");
  }

  // The antipode of the projection centre is not a position, it is the whole
  // boundary circle. A point there is placed on the other point's meridian:
  // every rim position is equally that place, and this is the one that makes a
  // straight-edge reading between them mean something.
  resolve(pt, other) {
    if (!pt) return pt;
    const [c0, c1] = this.proj.center;
    if (other && centralAngle(c0, c1, pt.lat, pt.lon) > 179.5) {
      return { lat: pt.lat, lon: other.lon };
    }
    return pt;
  }

  pixelOf(pt, other) {
    const q = this.resolve(pt, other);
    return this.proj.forward(q.lat, q.lon);
  }

  _px(pt) {
    return this.proj.forward(pt.lat, pt.lon);
  }

  _drawGraticule() {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(20,60,110,0.45)";

    for (let lon = -180; lon < 180; lon += 15) {
      ctx.beginPath();
      for (let lat = 89.5; lat >= -89.5; lat -= 1) {
        const p = this.proj.forward(lat, lon);
        if (!p) continue;
        const [sx, sy] = this.toScreen(p[0], p[1]);
        lat === 89.5 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    for (let lat = -75; lat <= 75; lat += 15) {
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += 2) {
        const p = this.proj.forward(lat, lon);
        const [sx, sy] = this.toScreen(p[0], p[1]);
        lon === -180 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // The tropics and the polar circles, the four parallels the sheet names.
  // Drawn through the projection so they stay correct when it is recentred.
  _drawRings() {
    const RINGS = [
      ["ring.arctic", 66.56, "#1d7fae"],
      ["ring.cancer", 23.44, "#8a6d1f"],
      ["ring.capricorn", -23.44, "#8a6d1f"],
      ["ring.antarctic", -66.56, "#1d7fae"],
    ];
    const ctx = this.ctx;
    for (const [key, lat, colour] of RINGS) {
      const pts = [];
      for (let lon = -180; lon <= 180; lon += 1) pts.push([lat, lon]);
      this._polyline(pts, { colour, width: 2.5, dash: [10, 5], casing: 3.5 });

      // label where the parallel crosses the bearing that points up the sheet
      const p = this.proj.forward(lat, this.proj.rot ?? 0);
      if (!p) continue;
      const [lx, ly] = this.toScreen(p[0], p[1]);
      ctx.save();
      ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(255, 253, 248, 0.96)";
      ctx.fillStyle = colour;
      ctx.strokeText(t(key), lx, ly);
      ctx.fillText(t(key), lx, ly);
      ctx.restore();
    }
  }

  // Gleason's two indicating arms. They pivot at the centre of the projection
  // and the angle between them is the difference of longitude, which the sheet
  // reads off its dial as sun time. The patent describes them as graduated in
  // degrees of latitude, read outward from the pole, so they are drawn as
  // instrument arms lying over the engraving rather than as lines on it.
  // Only meaningful on the printed chart, where the centre is the pole and a
  // radial is a meridian.
  _drawArms(A, B) {
    if (this.mode !== "printed") return;
    const ctx = this.ctx;
    const { cx, cy, k, rot } = this.proj;
    const [sx, sy] = this.toScreen(cx, cy);
    const reach = k * 180 * this.scale;   // out to the rim, in screen pixels
    const perDeg = k * this.scale;

    // Each arm is offset to its own side, so the graduated inner edge runs
    // through its point instead of the point sitting under the middle of the
    // card. That is how you would lay a real arm on the sheet: edge to the mark.
    const dlon = deltaLon(A.lon, B.lon);
    for (const [pt, other] of [[A, B], [B, A]]) {
      const toward = deltaLon(pt.lon, other.lon) < 0 ? 1 : -1;
      this._drawArm(sx, sy, rot - pt.lon - 90, reach, perDeg, -toward);
    }
    this._drawArmAngle(sx, sy, A, B, perDeg);

    // the eyelet the arms turn on, drawn last so it sits over both
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#3d2f16";
    ctx.fillStyle = "#fffdf8";
    ctx.beginPath();
    ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // One arm: opaque card, graduated along both edges, numbered in degrees of
  // latitude every fifteen, with a shadow so it reads as an object lying on the
  // sheet rather than a line drawn on it.
  _drawArm(sx, sy, angleDeg, reach, perDeg, side) {
    const ctx = this.ctx;
    const a = angleDeg * D2R;
    const wBase = 26, wTip = 21, r = wTip / 2;
    const o = side;                       // which way the body lies off the edge

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);

    // body: the inner edge sits on y = 0, along the bearing to the point
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(reach - r, 0);
    ctx.arc(reach - r, o * r, r, o > 0 ? -Math.PI / 2 : Math.PI / 2,
            o > 0 ? Math.PI / 2 : -Math.PI / 2, o < 0);
    ctx.lineTo(0, o * wBase);
    ctx.closePath();

    ctx.save();
    ctx.shadowColor = "rgba(45, 33, 12, 0.34)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#f1e7d0";
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#a8946a";
    ctx.stroke();

    if (reach < 110) { ctx.restore(); return; }

    // graduations run in from the inner edge, five degrees fine, fifteen heavy
    const flip = Math.cos(a) < 0;
    const limit = reach - r;
    ctx.strokeStyle = "#5e4d28";
    ctx.fillStyle = "#3f3418";

    for (let colat = 5; colat <= 180; colat += 5) {
      const x = colat * perDeg;
      if (x > limit) break;
      const heavy = colat % 15 === 0;
      ctx.lineWidth = heavy ? 1.1 : 0.7;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, o * (heavy ? 7.5 : 4));
      ctx.stroke();
    }

    // numerals read across the arm, as they are stamped on the originals
    if (reach > 200) {
      ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let colat = 15; colat <= 180; colat += 15) {
        const x = colat * perDeg;
        if (x > limit) break;
        ctx.save();
        ctx.translate(x, o * wTip * 0.62);
        ctx.rotate(flip ? Math.PI / 2 : -Math.PI / 2);
        ctx.fillText(String(Math.abs(90 - colat)), 0, 0);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  // The reading the two arms give: the angle between them, as sun time.
  _drawArmAngle(sx, sy, A, B, perDeg) {
    const ctx = this.ctx;
    const dlon = deltaLon(A.lon, B.lon);
    if (Math.abs(dlon) < 0.01) return;
    const tA = (this.proj.rot - A.lon - 90) * D2R;
    const r = Math.max(34, Math.min(perDeg * 52, 150));

    ctx.save();
    const mid = tA - dlon * D2R / 2;
    const lx = sx + (r + 16) * Math.cos(mid);
    const ly = sy + (r + 16) * Math.sin(mid);
    const mins = Math.abs(dlon) * MINUTES_PER_DEGREE_LON;
    const label = `${Math.abs(dlon).toFixed(2)}\u00b0 = ${Math.floor(mins / 60)}h ${(mins % 60).toFixed(1)}m`;
    ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = Math.cos(mid) < 0 ? "right" : "left";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 253, 248, 0.96)";
    ctx.fillStyle = "#a4161a";
    ctx.strokeText(label, lx, ly);
    ctx.fillText(label, lx, ly);
    ctx.restore();
  }

  // The straight line a ruler would draw between the two marks.
  _drawRuler(A, B) {
    const ctx = this.ctx;
    const [ax, ay] = this.toScreen(...this._px(A));
    const [bx, by] = this.toScreen(...this._px(B));
    ctx.save();
    ctx.lineCap = "round";
    // Solid white casing first, then the dashes over it.
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = "rgba(255, 253, 248, 0.95)";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.setLineDash([10, 7]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#2f2a20";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  }

  // The actual shortest path, plotted through the chart's own graticule.
  _drawTruePath(A, B) {
    this._polyline(greatCirclePath(A.lat, A.lon, B.lat, B.lon, 240), {
      colour: "#a4161a", width: 3.5,
    });
  }

  // Screen segments for a track, split wherever the projection cuts it.
  _segments(pts) {
    const segs = [];
    let cur = null;
    let prev = null;
    const [c0, c1] = this.proj.center;
    const jump = Math.max(this.baseW, this.baseH) * this.scale * 0.5;

    for (const [lat, lon] of pts) {
      // The antipode of the centre is not a point on this projection, it is the
      // whole boundary circle. Vertices that reach it would each be plotted at
      // a different arbitrary spot on the rim, so the line stops short instead.
      if (centralAngle(c0, c1, lat, lon) > 179.5) { cur = null; continue; }
      const p = this.proj.forward(lat, lon);
      if (!p) { cur = null; continue; }
      const xy = this.toScreen(p[0], p[1]);
      if (cur && prev && Math.hypot(xy[0] - prev[0], xy[1] - prev[1]) > jump) cur = null;
      if (!cur) { cur = []; segs.push(cur); }
      cur.push(xy);
      prev = xy;
    }
    return segs.filter((seg) => seg.length > 1);
  }

  _strokeSegments(segs) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (const seg of segs) {
      ctx.moveTo(seg[0][0], seg[0][1]);
      for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i][0], seg[i][1]);
    }
    ctx.stroke();
  }

  // Every track gets a solid white casing traced under it before the line
  // itself. The engraving is busy and coloured, and a bare stroke over it is
  // hard to follow. A dashed line keeps a continuous casing, so the dashes read
  // against white rather than against whatever they happen to cross.
  _polyline(pts, { colour, width, dash, casing = 4 }) {
    const ctx = this.ctx;
    const segs = this._segments(pts);
    if (!segs.length) return;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.strokeStyle = "rgba(255, 253, 248, 0.95)";
    ctx.lineWidth = width + casing;
    this._strokeSegments(segs);

    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    this._strokeSegments(segs);

    ctx.restore();
  }

  _onRim(pt) {
    const [c0, c1] = this.proj.center;
    return centralAngle(c0, c1, pt.lat, pt.lon) > 179.5;
  }

  _drawRimPoint(colour, label, pt) {
    const ctx = this.ctx;
    const [cx, cy] = this.toScreen(this.proj.cx, this.proj.cy);
    const r = this.proj.k * 180 * this.scale;
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Without a caption the ring reads as a stray annotation rather than as the
    // point itself, which is the one thing it has to communicate.
    ctx.setLineDash([]);
    ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = colour;
    ctx.strokeStyle = "rgba(255,253,248,0.92)";
    ctx.lineWidth = 3.5;
    const place = t(pt.lat <= -89.5 ? "rim.south" : pt.lat >= 89.5 ? "rim.north" : "rim.point");
    const text = t("rim.label", label, place);
    // Inside the rim: outside it the label falls on the vermilion hour ring,
    // where neither marker colour has any contrast.
    ctx.strokeText(text, cx, cy - r + 9);
    ctx.fillText(text, cx, cy - r + 9);
    ctx.restore();
  }

  _drawMarker(pt, label, colour) {
    const ctx = this.ctx;
    const p = this.proj.forward(pt.lat, pt.lon);
    if (!p) return;
    const [x, y] = this.toScreen(p[0], p[1]);
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colour;
    ctx.fillStyle = "#fffdf8";
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 13, y); ctx.lineTo(x - 8, y);
    ctx.moveTo(x + 8, y); ctx.lineTo(x + 13, y);
    ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 8);
    ctx.moveTo(x, y + 8); ctx.lineTo(x, y + 13);
    ctx.stroke();

    ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = colour;
    ctx.strokeStyle = "rgba(255,253,248,0.9)";
    ctx.lineWidth = 3;
    ctx.strokeText(label, x + 12, y - 10);
    ctx.fillText(label, x + 12, y - 10);
    ctx.restore();
  }
}

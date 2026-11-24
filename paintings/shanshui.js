// Ten Thousand Valleys, Pines and Mist — a hanging scroll in ink and light colour.
// Ink is tracked as density on fibrous xuan paper and rendered by absorption, so
// overlapping strokes darken the way ink does. Peaks are built front to back so a
// nearer form hides the contour lines of the one behind it; texture strokes
// (hemp-fibre cun) run down the folds in dry brush; moss dots bleed a little; mist
// erases the feet of everything. Then the painting is mounted on silk.
(async function () {
  const S = P.scale;
  const cv = P.canvas(1300, 2700);
  const CW = cv.width, CH = cv.height;
  const ctx = cv.getContext('2d');
  const seed = P.seed || 'shanshui-7';
  const R = P.rng(seed);
  const N = P.noise(R);

  // painting area inside the mounting
  const PW = Math.round(1080 * S), PH = Math.round(2140 * S);
  const OX = Math.round(110 * S), OY = Math.round(300 * S);
  const NP = PW * PH;
  const Dw = new Float32Array(NP);    // washes
  const Ds = new Float32Array(NP);    // crisp strokes
  const Dwet = new Float32Array(NP);  // wet strokes and dots that bleed
  const Co = new Float32Array(NP);    // ochre wash
  const Ci = new Float32Array(NP);    // indigo wash
  const occ = new Uint8Array(NP);     // already occupied by a nearer form
  const cov = new Float32Array(NP);
  const touched = new Int32Array(NP);

  const k = S; // geometry is designed at 1080 x 2140 and scaled
  const seal = new Float32Array(NP);
  const paperLin = P.hex('#efe6d2');
  const ochre = P.hex('#c89a62'), indigo = P.hex('#7f95a3'), vermilion = P.hex('#b8382a');
  const inkK = [2.35, 2.42, 2.6];
  let DwetB = null;

  // ---------- paper ----------
  const fiber = new Float32Array(NP);
  const mist = new Float32Array(NP);
  const mistBands = [
    { y: 1190, h: 120, a: 1.0 },
    { y: 760, h: 55, a: 0.55 },
    { y: 1640, h: 95, a: 0.95 },
    { y: 1960, h: 40, a: 0.35 },
  ];
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const i = y * PW + x;
      const X = x / k, Y = y / k;
      fiber[i] = 0.55 * N.n2(X / 1.6, Y / 9) + 0.3 * N.n2(X / 7, Y / 2.2) + 0.25 * N.fbm2(X / 60, Y / 60, 3);
      let m = 0;
      for (const b of mistBands) {
        const t = (Y - b.y) / b.h;
        m = Math.max(m, b.a * Math.exp(-t * t) * (0.62 + 0.55 * N.fbm2(X / 260 + b.y, Y / 70, 3)));
      }
      mist[i] = P.clamp(m * 1.15);
    }
  }

  // ---------- brush ----------
  // A loaded brush: pressure shapes the width, the load runs out along the stroke,
  // and when it does the bristles part into flying-white streaks.
  function inkStroke(buf, pts, o) {
    const n = pts.length;
    if (n < 2) return;
    const sx = [], sy = [];
    for (let j = 0; j < n - 1; j++) {
      const p0 = pts[Math.max(0, j - 1)], p1 = pts[j], p2 = pts[j + 1], p3 = pts[Math.min(n - 1, j + 2)];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(1, Math.ceil(len / 0.5));
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        sx.push(0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3));
        sy.push(0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3));
      }
    }
    sx.push(pts[n - 1][0]); sy.push(pts[n - 1][1]);
    const m = sx.length;
    const NB = 24;
    const load = new Float32Array(NB);
    for (let b = 0; b < NB; b++) load[b] = R();
    const press = o.press || ((t) => (0.25 + 0.75 * P.smooth(0, 0.12, t)) * (1 - 0.65 * P.smooth(0.55, 1, t)));
    const dry = o.dry ?? 0.3;
    let nt = 0;
    for (let i = 0; i < m; i++) {
      const ia = Math.max(0, i - 2), ib = Math.min(m - 1, i + 2);
      let tx = sx[ib] - sx[ia], ty = sy[ib] - sy[ia];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const t = i / (m - 1);
      const hw = 0.5 * o.w * press(t);
      if (hw < 0.25) continue;
      const left = 1 - dry * Math.pow(t, 0.8) * 1.35;
      for (let off = -hw; off <= hw; off += 0.5) {
        const u = off / hw;
        const b = Math.min(NB - 1, ((u + 1) * 0.5 * NB) | 0);
        const px = (sx[i] - ty * off + 0.5) | 0, py = (sy[i] + tx * off + 0.5) | 0;
        if (px < 0 || py < 0 || px >= PW || py >= PH) continue;
        const idx = py * PW + px;
        if (o.mask && o.mask[idx]) continue;
        const edge = 1 - P.smooth(0.65, 1.0, Math.abs(u));
        const f = fiber[idx] * 0.18;
        const dryF = P.smooth(load[b] - 0.12, load[b] + 0.04, left + f);
        const a = edge * dryF;
        if (a > cov[idx]) { if (cov[idx] === 0) touched[nt++] = idx; cov[idx] = a; }
      }
    }
    const mk = o.mistK ?? 1;
    for (let j = 0; j < nt; j++) {
      const idx = touched[j];
      buf[idx] += cov[idx] * o.ink * (1 - mist[idx] * mk);
      if (o.ochre) Co[idx] = Math.max(Co[idx], cov[idx] * o.ochre);
      cov[idx] = 0;
    }
  }

  function dot(x, y, r, ink, o = {}) {
    const ang = R.range(0, Math.PI), e = R.range(0.6, 1.0);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rr = r * 1.4;
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) {
      for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {
        if (xx < 0 || yy < 0 || xx >= PW || yy >= PH) continue;
        const i = yy * PW + xx;
        if (o.mask && o.mask[i]) continue;
        const dx = xx - x, dy = yy - y;
        const u = (dx * ca + dy * sa) / r, v = (-dx * sa + dy * ca) / (r * e);
        const d = Math.sqrt(u * u + v * v) + fiber[i] * 0.2;
        const a = P.smooth(1.0, 0.8, d);
        if (a > 0) { Ds[i] += a * ink * 0.75 * (1 - mist[i] * 0.9); Dwet[i] += a * ink * 0.25 * (1 - mist[i] * 0.9); }
      }
    }
  }

  // ---------- peaks ----------
  // A shan shui peak is a stack of rounded boulders: from a domed summit each flank
  // bulges out and tucks in, boulder under boulder, and every joint sends an inner
  // contour back into the mass. `flat` gives a level top for banks and terraces.
  function peak(cx, top, base, halfW, o = {}) {
    const T = new Float32Array(PW).fill(Infinity);
    const outline = [], inner = [];
    const avg = (base - top) / halfW;
    const bscale = o.boulder ?? 1;
    const sides = [];
    for (const side of [-1, 1]) {
      const pts = [];
      const flat = (side < 0 ? o.flatL : o.flatR) ?? o.flat ?? 0;
      const capW = (flat ? flat : R.range(22, 44)) * k, capH = flat ? 6 * k : capW * R.range(0.55, 0.95);
      for (let a = 0; a <= 1.0001; a += 0.125) {
        const yy = flat ? top + N.n2(cx / 50 + a * 6, side) * 4 * k : top + capH * (1 - Math.cos(a * Math.PI / 2));
        pts.push([cx + side * capW * (flat ? a : Math.sin(a * Math.PI / 2)), yy]);
      }
      let [x, y] = pts[pts.length - 1];
      while (y < base + 50 * k && Math.abs(x - cx) < halfW * 1.8) {
        const hb = R.range(40, 115) * k * bscale;
        const wb = (hb / avg) * R.range(0.45, 1.45);
        const bulge = R.range(0.18, 0.55) * wb + 5 * k;
        for (let t = 0.125; t <= 1.0001; t += 0.125) pts.push([x + side * (wb * t + bulge * Math.sin(Math.PI * t)), y + hb * t]);
        x += side * wb; y += hb;
        const notch = R.range(0.08, 0.3) * wb;
        x -= side * notch; y += R.range(2, 7) * k;
        pts.push([x, y]);
        // the boulder's underside carries on inside the mass
        const L = R.range(0.15, 0.42) * (Math.abs(x - cx) + 40 * k) + 10 * k;
        const sag = R.range(0.35, 0.9);
        if (R() < 0.7) inner.push([[x, y], [x - side * L * 0.35, y + L * sag * 0.6 + R.gauss(0, 3 * k)], [x - side * L * 0.7, y + L * sag], [x - side * L, y + L * sag * 1.5]]);
      }
      sides.push(pts);
    }
    outline.push(...sides[0].reverse(), ...sides[1].slice(1));
    const raster = (pl, fn) => {
      for (let j = 0; j < pl.length - 1; j++) {
        const [x0, y0] = pl[j], [x1, y1] = pl[j + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
        for (let s2 = 0; s2 <= n; s2++) fn(x0 + (x1 - x0) * s2 / n, y0 + (y1 - y0) * s2 / n);
      }
    };
    raster(outline, (x, y) => { const xi = Math.round(x); if (xi >= 0 && xi < PW && y < T[xi]) T[xi] = y; });
    for (let x = 0; x < PW; x++) if (T[x] < Infinity) T[x] += N.n2(x / (9 * k), cx) * 1.6 * k;
    // where each boulder's crown sits, column by column (outline + inner lines)
    const tops = new Uint8Array(NP);
    const mark = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi >= 0 && yi >= 0 && xi < PW && yi < PH) tops[yi * PW + xi] = 1; };
    raster(outline, mark);
    for (const pl of inner) raster(pl, mark);
    return { T, outline, inner, tops, cx, top, base, halfW };
  }

  const fold = (x, y, sc) => {
    const X = x / k, Y = y / k;
    const n = N.n2(X / sc + 0.7 * N.n2(Y / 260, X / 300), Y / (sc * 6));
    return 1 - Math.abs(n);
  };

  // paint a group of peaks, nearest first; each is clipped by what's in front
  function* massif(peaks, st) {
    for (const pk of peaks) {
      const { T, outline, cx, top, base, halfW } = pk;
      const tone = pk.tone ?? st.tone;
      const fadeLen = (pk.fade ?? st.fade) * k;
      const before = occ.slice(); // what was in front of this peak
      const beforeF = new Float32Array(NP);
      for (let i = 0; i < NP; i++) beforeF[i] = before[i];
      const beforeSoft = P.boxBlur(beforeF, PW, PH, 1, 7 * k, 2);
      const xs = [];
      for (let x = 0; x < PW; x++) if (T[x] < Infinity && T[x] < base) xs.push(x);
      const tmpW = new Float32Array(NP);
      const inside = new Uint8Array(NP);
      // washes
      for (const x of xs) {
        const y0 = Math.max(0, Math.ceil(T[x]));
        let lastTop = y0;
        for (let y = y0; y < Math.min(PH, base); y++) {
          const i = y * PW + x;
          if (before[i] && beforeSoft[i] > 0.98) continue;
          const d = y - T[x];
          if (pk.tops[i]) lastTop = y;
          const dl = y - lastTop;
          const fd = fold(x, y, st.foldScale);
          const baseFade = P.smooth(base, base - 260 * k, y);
          const m = 1 - mist[i];
          // each boulder is darkest under its crown and pales toward its foot
          let wsh = tone * (st.flat + st.body * (0.5 * Math.exp(-d / fadeLen) + 0.5 * Math.exp(-dl / (st.boulderFade * k)))) * (0.4 + 0.95 * fd * fd);
          wsh += tone * 0.25 * Math.exp(-dl / (4 * k));
          tmpW[i] = wsh * m * baseFade * (1 - beforeSoft[i]);
          inside[i] = 1;
          if (before[i]) continue;
          if (st.color) {
            Ci[i] = Math.max(Ci[i], st.color * 0.9 * Math.exp(-d / (fadeLen * 0.8)) * m * baseFade * (0.5 + 0.5 * fd));
            Co[i] = Math.max(Co[i], st.color * 0.75 * P.smooth(0.25 * fadeLen, fadeLen * 2.2, d) * (1 - fd * 0.6) * m * baseFade);
          }
          occ[i] = 1;
        }
      }
      // soften the wash inside the form, keeping the contour edge crisp
      const soft = P.boxBlur(tmpW, PW, PH, 1, 9 * k, 2);
      for (let i = 0; i < NP; i++) if (inside[i]) Dw[i] += (soft[i] * 0.7 + tmpW[i] * 0.3);
      yield;
      if (st.lines) {
        // the contour, drawn as a few overlapping brush lines of varying pressure
        let j = 0;
        while (j < outline.length - 1) {
          const len = R.int(4, 9);
          const seg = outline.slice(j, Math.min(outline.length, j + len + 1)).map(([x, y]) => [x + R.gauss(0, 0.6), y + R.gauss(0, 0.6)]);
          const fy = P.smooth(base - 40 * k, base - 380 * k, seg[0][1]);
          if (seg.length > 1 && fy > 0.02) inkStroke(Ds, seg, { w: R.range(2.2, 4.6) * k * st.lineW * (0.5 + 0.5 * fy), ink: tone * R.range(0.55, 0.85) * fy, dry: R.range(0.25, 0.6), mask: before, mistK: 0.95 });
          j += len - 1;
        }
        // inner boulder contours
        for (const pl of pk.inner) {
          if (pl[0][1] > base - 200 * k) continue;
          const pts = pl.map(([x, y]) => [x + R.gauss(0, 0.8), y + R.gauss(0, 0.8)]);
          inkStroke(Ds, pts, { w: R.range(1.8, 3.6) * k * st.lineW, ink: tone * R.range(0.5, 0.8), dry: R.range(0.35, 0.7), mask: before, press: (t) => (0.3 + 0.7 * P.smooth(0, 0.15, t)) * (1 - 0.8 * P.smooth(0.4, 1, t)) });
        }
        // cliff and fold lines running down from the shoulders
        for (let j2 = 2; j2 < outline.length - 2; j2++) {
          if (!R.chance(st.foldLines)) continue;
          let [x, y] = outline[j2];
          if (y > base - 320 * k) continue;
          y += 3 * k;
          const pts = [[x, y]];
          const lean = (x - cx) / halfW;
          const L = R.range(50, 200) * k;
          for (let s = 0; s < 6; s++) {
            x += (lean * 0.35 + R.gauss(0, 0.18)) * L / 6;
            y += L / 6;
            pts.push([x, y]);
          }
          inkStroke(Ds, pts, { w: R.range(1.6, 3.2) * k, ink: tone * R.range(0.35, 0.65), dry: 0.6, mask: before });
        }
        yield;
      }
      if (st.cun) {
        // hemp-fibre texture strokes, densest under the contour, following the folds
        const area = xs.length * (fadeLen * 2.5);
        const count = Math.round(area * st.cun / (k * k * 1300));
        const crowns = [];
        for (let j = 1; j < outline.length - 1; j++) crowns.push([outline[j][0], outline[j][1], outline[j + 1][0] - outline[j - 1][0], outline[j + 1][1] - outline[j - 1][1]]);
        for (const pl of pk.inner) for (let j = 0; j < pl.length - 1; j++) crowns.push([pl[j][0], pl[j][1], pl[j + 1][0] - pl[j][0], pl[j + 1][1] - pl[j][1]]);
        for (let c = 0; c < count; c++) {
          const cp = crowns[R.int(0, crowns.length - 1)];
          const x = Math.round(cp[0] + R.gauss(0, 10 * k));
          if (x < 0 || x >= PW || T[x] === Infinity) continue;
          const d = Math.pow(R(), 1.6) * st.boulderFade * 2.2 * k;
          let y = Math.max(T[x] + 3 * k, cp[1] + 3 * k) + d;
          if (y >= base || y >= PH) continue;
          const i0 = (y | 0) * PW + x;
          if (before[i0]) continue;
          if (R() > 0.35 + 0.65 * fold(x, y, st.foldScale)) continue;
          const L = R.range(30, 80) * k;
          let tx = cp[2], ty = cp[3];
          if (ty < 0) { tx = -tx; ty = -ty; }
          let ang = Math.atan2(ty, tx);
          ang = ang + (Math.PI / 2 - ang) * R.range(0.6, 0.85) + R.gauss(0, 0.08);
          const fadeD = Math.exp(-d / (st.boulderFade * 2.0 * k)) * P.smooth(base, base - 300 * k, y);
          const nb = R.int(2, 5), gap = R.range(3.5, 6.5) * k;
          const nx = -Math.sin(ang), ny = Math.cos(ang);
          for (let b = 0; b < nb; b++) {
            let px = x + nx * gap * b + R.gauss(0, 0.8 * k), py = y + ny * gap * b + R.range(0, 6) * k;
            const pts = [[px, py]];
            let a2 = ang + R.gauss(0, 0.04);
            const Lb = L * R.range(0.6, 1.0);
            for (let s2 = 0; s2 < 5; s2++) {
              a2 += R.gauss(0, 0.07);
              px += Math.cos(a2) * Lb / 5; py += Math.sin(a2) * Lb / 5;
              pts.push([px, py]);
            }
            inkStroke(Ds, pts, { w: R.range(1.6, 3.2) * k, ink: tone * R.range(0.28, 0.55) * fadeD, dry: R.range(0.55, 0.9), mask: before });
          }
          if (c % 400 === 0) yield;
        }
      }
      if (st.dots) {
        // moss dots crowd the ridge-tops and shoulders
        const dotSites = [...outline, ...pk.inner.map((pl) => pl[0])];
        for (let j2 = 0; j2 < dotSites.length; j2++) {
          if (!R.chance(st.dots)) continue;
          const [ox, oy] = dotSites[j2];
          if (oy > base - 220 * k) continue;
          const nd = R.int(2, 7);
          for (let d2 = 0; d2 < nd; d2++) {
            const x = ox + R.gauss(0, 7 * k), y = oy + Math.abs(R.gauss(0, 6 * k)) + 2 * k;
            const i = (y | 0) * PW + (x | 0);
            if (x < 0 || y < 0 || x >= PW || y >= PH || before[i]) continue;
            dot(x, y, R.range(1.8, 4.0) * k, tone * R.range(0.9, 1.4), { mask: before });
          }
        }
      }
      if (st.trees) {
        // tiny trees standing along the shoulders give the peaks their size
        for (let j2 = 1; j2 < outline.length - 1; j2++) {
          if (!R.chance(st.trees)) continue;
          const [ox, oy] = outline[j2];
          if (oy > base - 260 * k) continue;
          const th = R.range(10, 22) * k;
          inkStroke(Ds, [[ox, oy + 2 * k], [ox + R.gauss(0, 1), oy - th * 0.5], [ox + R.gauss(0, 1.5), oy - th]], { w: 1.3 * k, ink: tone * 0.8, dry: 0.2, mask: before });
          for (let b = 0; b < 4; b++) {
            const yy = oy - th * (0.35 + b * 0.18);
            const ww = (1 - b * 0.2) * th * 0.35;
            inkStroke(Ds, [[ox - ww, yy + ww * 0.25], [ox, yy - 1], [ox + ww, yy + ww * 0.25]], { w: 1.4 * k, ink: tone * 0.75, dry: 0.3, mask: before });
          }
        }
      }
      yield;
    }
  }

  // ---------- pines ----------
  // needles radiate in a half-wheel above each twig; a wet indigo-ink bloom underneath
  function needleCluster(cx, cy, size, ink) {
    const n = R.int(28, 40);
    for (let j = 0; j < n; j++) {
      const a = -Math.PI - 0.15 + (j + R.range(-0.3, 0.3)) / n * (Math.PI + 0.3);
      const L = size * R.range(0.7, 1.0);
      const x1 = cx + Math.cos(a) * L, y1 = cy + Math.sin(a) * L * 0.8;
      inkStroke(Ds, [[cx, cy], [(cx + x1) / 2, (cy + y1) / 2], [x1, y1]], { w: 1.35 * k, ink: ink * R.range(0.55, 0.95), dry: 0.3, press: (t) => 1 - 0.75 * t, mistK: 0.5 });
    }
    const rr = size * 1.0;
    for (let yy = Math.floor(cy - rr * 0.85); yy <= cy + rr * 0.15; yy++) for (let xx = Math.floor(cx - rr); xx <= cx + rr; xx++) {
      if (xx < 0 || yy < 0 || xx >= PW || yy >= PH) continue;
      const i = yy * PW + xx;
      const d = Math.hypot((xx - cx) / rr, (yy - cy + rr * 0.3) / (rr * 0.55)) + fiber[i] * 0.25;
      const a = P.smooth(1.0, 0.35, d);
      Dwet[i] += a * 0.30 * ink;
      Ci[i] = Math.max(Ci[i], a * 0.75);
    }
  }
  // a flat, cloud-like layer of needle clusters along a branch end
  function canopy(cx, cy, width, size, ink) {
    const n = Math.max(2, Math.round(width / (size * 0.9)));
    for (let j = 0; j < n; j++) {
      const t = n === 1 ? 0.5 : j / (n - 1);
      const x = cx - width / 2 + width * t + R.gauss(0, size * 0.12);
      const y = cy + R.gauss(0, size * 0.12) + Math.pow(Math.abs(t - 0.5) * 2, 2) * size * 0.35;
      needleCluster(x, y, size * R.range(0.85, 1.1), ink);
    }
  }

  function* pine(bx, by, height, lean, sc, ink = 1) {
    const pts = [];
    const segs = 12;
    const ph = R.range(0, 6);
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      pts.push([bx + lean * height * Math.pow(t, 1.4) + Math.sin(t * Math.PI * 1.8 + ph) * 18 * sc * k * (1 - t * 0.3), by - height * t]);
    }
    const width = (t) => (30 - 19 * t) * sc * k;
    // trunk: rough edge lines, a pale ochre wash, bark plates
    for (const side of [-1, 1]) {
      const edge = pts.map(([x, y], s) => [x + side * width(s / segs) * 0.5 + R.gauss(0, 1.2 * k), y]);
      inkStroke(Ds, edge, { w: 3.2 * k * sc + 1, ink: 0.95 * ink, dry: 0.6, mistK: 0.3, press: (t) => 1 - 0.4 * t });
    }
    for (let s = 0; s < segs; s++) {
      const [x0, y0] = pts[s], [x1, y1] = pts[s + 1];
      for (let y = Math.floor(Math.min(y0, y1)); y < Math.max(y0, y1); y++) {
        const t = (y - y0) / (y1 - y0);
        const xc = x0 + (x1 - x0) * t;
        const ww = width((s + t) / segs) * 0.5;
        for (let x = Math.floor(xc - ww); x <= xc + ww; x++) {
          if (x < 0 || y < 0 || x >= PW || y >= PH) continue;
          const i = y * PW + x;
          const u = (x - xc) / ww;
          Dw[i] += (0.10 + 0.14 * u * u + 0.06 * (u > 0.3 ? 1 : 0)) * ink * (0.8 + 0.4 * fiber[i]);
          Co[i] = Math.max(Co[i], 0.7);
        }
      }
    }
    const plates = Math.round(height / (9 * k));
    for (let s = 0; s < plates; s++) {
      const t = R.range(0.03, 0.85);
      const j = t * segs, j0 = Math.floor(j);
      const [xa, ya] = pts[j0], [xb, yb] = pts[Math.min(segs, j0 + 1)];
      const x = xa + (xb - xa) * (j - j0) + R.gauss(0, width(t) * 0.18), y = ya + (yb - ya) * (j - j0);
      const ww = width(t) * R.range(0.18, 0.3);
      inkStroke(Ds, [[x - ww, y + ww * 0.2], [x - ww * 0.3, y - ww * 0.35], [x + ww * 0.5, y - ww * 0.2], [x + ww, y + ww * 0.3]], { w: 1.3 * k, ink: 0.7 * ink, dry: 0.5 });
    }
    yield;
    // branches reach out (mostly over the water), each ending in a layered canopy
    const nb = R.int(5, 7);
    const dirMain = Math.sign(lean || 1);
    for (let b = 0; b < nb; b++) {
      const t = 0.38 + (b / nb) * 0.58 + R.range(-0.03, 0.03);
      const j = Math.min(segs, Math.round(t * segs));
      const [x0, y0] = pts[j];
      const dir = b % 3 === 1 ? -dirMain : dirMain;
      const L = (dir === dirMain ? R.range(110, 220) : R.range(50, 100)) * sc * k * (1.2 - t * 0.55);
      const bp = [[x0, y0]];
      let x = x0, y = y0;
      for (let s = 1; s <= 5; s++) {
        x += dir * L / 5;
        y += (s < 3 ? -R.range(3, 12) : R.range(1, 10)) * sc * k;
        bp.push([x, y + R.gauss(0, 2 * k)]);
      }
      inkStroke(Ds, bp, { w: R.range(4, 8) * sc * k, ink: 0.9 * ink, dry: 0.5, mistK: 0.3, press: (t) => 1 - 0.6 * t });
      const cs = R.range(34, 46) * sc * k;
      canopy(x - dir * cs * 0.6, y - cs * 0.25, cs * R.range(2.2, 3.6), cs, ink);
      if (L > 120 * sc * k) canopy(bp[2][0], bp[2][1] - cs * 0.3, cs * 1.6, cs * 0.85, ink);
    }
    const [tx, ty] = pts[segs];
    canopy(tx + dirMain * 10 * k, ty, 90 * sc * k, 30 * sc * k, ink);
    canopy(tx + dirMain * 30 * k, ty - 24 * sc * k, 60 * sc * k, 26 * sc * k, ink);
    yield;
  }

  // a deciduous tree drawn with dots, the way the old masters stacked leaves
  function* dotTree(bx, by, height, sc) {
    const top = [bx + R.gauss(0, 6 * k), by - height];
    inkStroke(Ds, [[bx, by], [bx + R.gauss(0, 4 * k), by - height * 0.5], top], { w: 5 * sc * k, ink: 0.8, dry: 0.5 });
    for (let b = 0; b < 4; b++) {
      const t = 0.45 + b * 0.14;
      const sx = bx + (top[0] - bx) * t, sy = by - height * t;
      const dir = b % 2 ? 1 : -1;
      inkStroke(Ds, [[sx, sy], [sx + dir * 20 * sc * k, sy - 18 * sc * k], [sx + dir * 34 * sc * k, sy - 30 * sc * k]], { w: 2.4 * sc * k, ink: 0.75, dry: 0.5 });
    }
    const cx = top[0], cy = top[1] + height * 0.12;
    for (let d = 0; d < 110; d++) {
      const a = R.range(0, Math.PI * 2), r = Math.sqrt(R()) * height * 0.42;
      dot(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 0.8, R.range(2.2, 4.2) * sc * k, R.range(0.55, 1.0));
    }
    yield;
  }

  // ---------- the painting ----------
  let lastShow = 0;
  const show = (force) => {
    const now = performance.now();
    if (!force && now - lastShow < 400) return;
    lastShow = now;
    compose(false);
  };

  await P.run(function* () {
    P.progress(0.05, 'grinding ink');
    // the farthest range, only a pale wash, almost lost in the sky
    const farPeaks = [
      peak(150 * k, 330 * k, 1150 * k, 220 * k, { boulder: 1.3 }),
      peak(990 * k, 560 * k, 1150 * k, 160 * k, { boulder: 1.2 }),
    ];
    farPeaks.forEach((p) => (p.tone = 0.30));

    // the great massif, its summit right of centre, peaks stepping down to the left
    const main = [
      Object.assign(peak(270 * k, 720 * k, 1330 * k, 300 * k), { tone: 0.9, fade: 90 }),
      Object.assign(peak(900 * k, 640 * k, 1330 * k, 280 * k), { tone: 0.95, fade: 100 }),
      Object.assign(peak(450 * k, 470 * k, 1330 * k, 330 * k), { tone: 0.9, fade: 110 }),
      Object.assign(peak(650 * k, 150 * k, 1330 * k, 430 * k), { tone: 1.0, fade: 150 }),
      Object.assign(peak(820 * k, 360 * k, 1330 * k, 300 * k), { tone: 0.85, fade: 120 }),
    ];
    // a middle cliff on the left with a terrace where pines grow, and a low hill right
    const mid = [
      Object.assign(peak(150 * k, 1350 * k, 1780 * k, 250 * k, { flatR: 120, flatL: 60, boulder: 0.8 }), { tone: 0.95, fade: 70 }),
      Object.assign(peak(990 * k, 1480 * k, 1760 * k, 170 * k, { boulder: 0.7 }), { tone: 0.8, fade: 60 }),
    ];
    // the near bank: a level shelf for the pavilion, breaking down to the water
    const fore = [
      Object.assign(peak(260 * k, 1995 * k, 2260 * k, 330 * k, { flatR: 260, flatL: 220, boulder: 0.75 }), { tone: 1.0, fade: 60 }),
      Object.assign(peak(1010 * k, 2030 * k, 2260 * k, 200 * k, { boulder: 0.6 }), { tone: 0.95, fade: 55 }),
    ];

    // nearest things claim the paper first so the far ones tuck behind them
    P.progress(0.1, 'the near banks');
    yield* massif(fore, { tone: 1, fade: 60, flat: 0.05, body: 0.42, boulderFade: 34, foldScale: 40, lines: true, lineW: 1.3, foldLines: 0.15, cun: 2.0, dots: 0.45, color: 0.85 });
    P.progress(0.25, 'the middle cliffs');
    yield* massif(mid, { tone: 0.9, fade: 70, flat: 0.04, body: 0.40, boulderFade: 40, foldScale: 45, lines: true, lineW: 1.1, foldLines: 0.15, cun: 1.7, dots: 0.4, trees: 0.06, color: 0.75 });
    P.progress(0.4, 'the great peaks');
    yield* massif(main, { tone: 0.9, fade: 120, flat: 0.03, body: 0.36, boulderFade: 48, foldScale: 55, lines: true, lineW: 1.0, foldLines: 0.12, cun: 1.5, dots: 0.3, trees: 0.06, color: 0.65 });
    P.progress(0.6, 'distant range');
    yield* massif(farPeaks, { tone: 0.30, fade: 200, flat: 0.08, body: 0.30, boulderFade: 70, foldScale: 70, lines: false, cun: 0, dots: 0, color: 0.3 });
    show(true);

    // a waterfall falls through a cleft of the great peak
    P.progress(0.7, 'the waterfall');
    const wx = (y) => 612 * k + Math.sin(y / (90 * k)) * 7 * k + (y - 640 * k) * 0.05;
    for (let y = Math.round(640 * k); y < 1240 * k; y++) {
      const xc = wx(y);
      const ww = (8 + 10 * P.smooth(640 * k, 1200 * k, y)) * k;
      for (let x = Math.floor(xc - ww * 2.5); x <= xc + ww * 2.5; x++) {
        if (x < 0 || x >= PW) continue;
        const i = y * PW + x;
        const wob = N.n2(x / (6 * k), y / (30 * k)) * 3 * k;
        const emerge = P.smooth(640 * k, 720 * k, y + N.n2(x / (5 * k), 3) * 25 * k);
        const keep = 1 - (1 - (P.smooth(ww * 0.5, ww * 1.5, Math.abs(x - xc) + wob) * 0.9 + 0.1 * P.smooth(0, ww, Math.abs(x - xc)))) * emerge;
        Dw[i] *= keep; Ds[i] *= keep; Dwet[i] *= keep; Ci[i] *= keep; Co[i] *= keep;
      }
    }
    for (const side of [-1, 1]) {
      const pts = [];
      for (let y = 650 * k; y < 1150 * k; y += 30 * k) pts.push([wx(y) + side * (10 + 10 * P.smooth(640 * k, 1200 * k, y)) * k + R.gauss(0, 1.5 * k), y]);
      inkStroke(Ds, pts, { w: 2.4 * k, ink: 0.75, dry: 0.55 });
    }
    for (let s = 0; s < 14; s++) {
      const y0 = R.range(660, 1050) * k, L = R.range(60, 200) * k;
      const pts = [];
      for (let y = y0; y < y0 + L; y += 20 * k) pts.push([wx(y) + R.range(-4, 4) * k, y]);
      inkStroke(Ds, pts, { w: 0.9 * k, ink: 0.16, dry: 0.7 });
    }
    yield;

    // pines and a pavilion on the near bank, leaning out over the water
    P.progress(0.78, 'pines');
    yield* pine(150 * k, 2012 * k, 420 * k, 0.42, 1.0);
    yield* pine(60 * k, 2008 * k, 300 * k, 0.18, 0.72, 0.9);
    yield* dotTree(530 * k, 2000 * k, 110 * k, 0.75);
    yield* dotTree(1000 * k, 2036 * k, 90 * k, 0.65);
    // a stand of pines on the middle terrace
    for (let t = 0; t < 3; t++) yield* pine((70 + t * 70) * k, (1356 + t * 4) * k, (150 - t * 25) * k, R.range(0.1, 0.5), 0.36, 0.85);

    // the pavilion
    {
      const px = 390 * k, py = 2000 * k, pw = 96 * k, ph = 60 * k;
      inkStroke(Ds, [[px - pw * 0.62, py - ph - 4 * k], [px - pw * 0.4, py - ph + 2 * k], [px, py - ph - 3 * k], [px + pw * 0.4, py - ph + 2 * k], [px + pw * 0.62, py - ph - 6 * k]], { w: 3.2 * k, ink: 0.9, dry: 0.3, mistK: 0 });
      inkStroke(Ds, [[px - pw * 0.42, py - ph - 3 * k], [px - pw * 0.1, py - ph - 22 * k], [px + pw * 0.1, py - ph - 22 * k], [px + pw * 0.44, py - ph - 4 * k]], { w: 2.6 * k, ink: 0.85, dry: 0.3, mistK: 0 });
      for (const fx of [-0.36, -0.1, 0.12, 0.36]) inkStroke(Ds, [[px + pw * fx, py - ph + 2 * k], [px + pw * fx, py - ph * 0.5], [px + pw * fx, py]], { w: 2 * k, ink: 0.8, dry: 0.2, mistK: 0 });
      inkStroke(Ds, [[px - pw * 0.55, py], [px, py + 2 * k], [px + pw * 0.55, py]], { w: 2.4 * k, ink: 0.8, dry: 0.4, mistK: 0 });
      for (let y = py - ph - 20 * k; y < py - ph; y++) for (let x = px - pw * 0.4; x < px + pw * 0.4; x++) {
        const i = (y | 0) * PW + (x | 0);
        const top = py - ph - 20 * k + Math.abs(x - px) * 0.42;
        if (y > top) { Dw[i] += 0.12; Ci[i] = Math.max(Ci[i], 0.4); }
      }
      // a scholar sitting, looking at the falls
      dot(px + 6 * k, py - 27 * k, 3.2 * k, 1.0);
      inkStroke(Ds, [[px + 4 * k, py - 23 * k], [px - 2 * k, py - 12 * k], [px + 10 * k, py - 6 * k]], { w: 4 * k, ink: 0.7, dry: 0.2, mistK: 0 });
    }
    yield;

    // a fisherman's boat on the open water
    P.progress(0.86, 'the boat');
    {
      const bx = 690 * k, by = 1790 * k, L = 92 * k;
      inkStroke(Ds, [[bx - L / 2, by - 7 * k], [bx - L / 4, by], [bx + L / 4, by + 1 * k], [bx + L / 2, by - 9 * k]], { w: 3 * k, ink: 0.9, dry: 0.3, mistK: 0.3 });
      inkStroke(Ds, [[bx - L / 2 + 6 * k, by - 6 * k], [bx, by - 4 * k], [bx + L / 2 - 4 * k, by - 7 * k]], { w: 1.6 * k, ink: 0.7, dry: 0.3, mistK: 0.3 });
      for (let y = by - 6 * k; y < by + 1 * k; y++) for (let x = bx - L / 2 + 6 * k; x < bx + L / 2 - 6 * k; x++) Dw[(y | 0) * PW + (x | 0)] += 0.15;
      // the fisherman: hat, body, rod and line
      inkStroke(Ds, [[bx + 8 * k, by - 7 * k], [bx + 10 * k, by - 18 * k], [bx + 12 * k, by - 24 * k]], { w: 5 * k, ink: 0.85, dry: 0.2, mistK: 0.3 });
      inkStroke(Ds, [[bx + 2 * k, by - 25 * k], [bx + 12 * k, by - 33 * k], [bx + 22 * k, by - 25 * k]], { w: 2.6 * k, ink: 0.9, dry: 0.1, mistK: 0.3 });
      inkStroke(Ds, [[bx + 16 * k, by - 18 * k], [bx + 60 * k, by - 52 * k], [bx + 110 * k, by - 70 * k]], { w: 1.2 * k, ink: 0.7, dry: 0.4, mistK: 0.3 });
      inkStroke(Ds, [[bx + 110 * k, by - 70 * k], [bx + 114 * k, by - 30 * k], [bx + 116 * k, by + 4 * k]], { w: 0.6 * k, ink: 0.35, dry: 0.5, mistK: 0.3 });
      // ripples
      for (let r = 0; r < 9; r++) {
        const rx = bx + R.range(-120, 160) * k, ry = by + R.range(6, 70) * k;
        const rl = R.range(18, 60) * k;
        inkStroke(Ds, [[rx - rl / 2, ry], [rx, ry + R.gauss(0, 1)], [rx + rl / 2, ry]], { w: 1.1 * k, ink: 0.28, dry: 0.6, mistK: 0.5 });
      }
    }
    // reeds and ripples along the near shore
    for (let r = 0; r < 26; r++) {
      const rx = R.range(560, 900) * k, ry = R.range(1985, 2080) * k;
      const rl = R.range(14, 50) * k;
      inkStroke(Ds, [[rx - rl / 2, ry], [rx, ry + R.gauss(0, 1)], [rx + rl / 2, ry]], { w: 1.1 * k, ink: 0.22, dry: 0.6, mistK: 0.5 });
    }
    yield;
    P.progress(0.92, 'seal');
  });

  // ---------- seals ----------
  function stampSeal(x0, y0, size, chars) {
    const g = 9; // grid per character cell
    const cells = chars;
    const cols = 2, rows = 2;
    const pat = new Uint8Array(cols * g * rows * g);
    const SR = P.rng(seed + 'seal' + x0);
    for (let c = 0; c < cols * rows; c++) {
      const ox = (c % cols) * g, oy = Math.floor(c / cols) * g;
      const nStrokes = SR.int(5, 8);
      for (let s = 0; s < nStrokes; s++) {
        if (SR() < 0.55) {
          const yy = oy + 1 + SR.int(0, 3) * 2, xa = ox + 1 + SR.int(0, 2), xb = ox + g - 2 - SR.int(0, 2);
          for (let x = xa; x <= xb; x++) pat[yy * cols * g + x] = 1;
        } else {
          const xx = ox + 1 + SR.int(0, 3) * 2, ya = oy + 1 + SR.int(0, 2), yb = oy + g - 2 - SR.int(0, 2);
          for (let y = ya; y <= yb; y++) pat[y * cols * g + xx] = 1;
        }
      }
    }
    const cell = size / (cols * g + 1);
    for (let y = Math.floor(y0); y < y0 + size; y++) for (let x = Math.floor(x0); x < x0 + size; x++) {
      if (x < 0 || y < 0 || x >= PW || y >= PH) continue;
      const i = y * PW + x;
      const u = (x - x0) / size, v = (y - y0) / size;
      const edgeN = N.n2(x / (3 * k), y / (3 * k)) * 0.012;
      if (u < 0.01 + edgeN || v < 0.01 - edgeN || u > 0.99 + edgeN || v > 0.99 - edgeN) continue;
      const gx = Math.floor((x - x0) / cell - 0.5), gy = Math.floor((y - y0) / cell - 0.5);
      let glyph = 0;
      if (gx >= 0 && gy >= 0 && gx < cols * g && gy < rows * g) glyph = pat[gy * cols * g + gx];
      const press = 0.72 + 0.28 * N.fbm2(x / (14 * k), y / (14 * k), 3) + fiber[i] * 0.12;
      seal[i] = Math.max(seal[i], glyph ? 0.05 : P.clamp(press));
    }
  }
  stampSeal(985 * k, 1836 * k, 50 * k);
  stampSeal(991 * k, 1896 * k, 40 * k);

  // ---------- compose ----------
  function compose(final) {
    const out = new Float32Array(CW * CH * 3);
    // mounting: pale silk round the painting, deeper silk heaven and earth bands
    const silk = P.hex('#d9d2c0'), silkD = P.hex('#8c9796'), band = P.hex('#b7a98a'), wood = P.hex('#4a3426');
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const o = (y * CW + x) * 3;
        const Y = y / k, X = x / k;
        let c = silk;
        if (Y < 230 || Y > 2470) c = silkD;
        if ((Y < 230) && (Math.abs(X - 430) < 16 || Math.abs(X - 870) < 16)) c = band;
        if (Y < 14 || Y > 2684) c = wood;
        const damask = 1 + 0.025 * Math.sin((X + Y) / 3.2) * Math.sin((X - Y) / 3.2) + 0.02 * N.n2(X / 40, Y / 40);
        const light = 1 - 0.06 * Math.abs(X / 1300 - 0.5) - 0.04 * (Y / 2700);
        out[o] = c[0] * damask * light; out[o + 1] = c[1] * damask * light; out[o + 2] = c[2] * damask * light;
        // thin brocade edges framing the painting
        const inFrame = X > 104 && X < 1196 && Y > 294 && Y < 2446;
        if (inFrame) { out[o] *= 0.55; out[o + 1] *= 0.5; out[o + 2] *= 0.45; }
      }
    }
    if (final) DwetB = P.boxBlur(Dwet, PW, PH, 1, 1.4 * k, 2);
    const wet = DwetB || Dwet;
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++) {
        const i = y * PW + x;
        const o = ((y + OY) * CW + (x + OX)) * 3;
        // aged paper: warmer toward the edges, fibres, a few foxing spots
        const ex = Math.min(x, PW - 1 - x) / PW, ey = Math.min(y, PH - 1 - y) / PH;
        const age = 1 - 0.07 * Math.exp(-Math.min(ex, ey) * 30);
        const fb = 1 + fiber[i] * 0.022;
        let r = paperLin[0] * fb * age, g = paperLin[1] * fb * age * 0.995, b = paperLin[2] * fb * age * 0.98;
        // light colour washes
        const co = Co[i] * 0.55, ci = Ci[i] * 0.5;
        r *= (1 - co * (1 - ochre[0] / paperLin[0])) * (1 - ci * (1 - indigo[0] / paperLin[0]));
        g *= (1 - co * (1 - ochre[1] / paperLin[1])) * (1 - ci * (1 - indigo[1] / paperLin[1]));
        b *= (1 - co * (1 - ochre[2] / paperLin[2])) * (1 - ci * (1 - indigo[2] / paperLin[2]));
        const D = Dw[i] * (0.85 + 0.3 * fiber[i]) + Ds[i] + wet[i];
        r *= Math.exp(-D * inkK[0]); g *= Math.exp(-D * inkK[1]); b *= Math.exp(-D * inkK[2]);
        // cinnabar seal paste sits on top of everything
        const sv = seal[i];
        if (sv > 0) { r += (vermilion[0] * fb - r) * sv; g += (vermilion[1] * fb - g) * sv; b += (vermilion[2] * fb - b) * sv; }
        out[o] = r; out[o + 1] = g; out[o + 2] = b;
      }
    }
    ctx.putImageData(P.toImageData(ctx, out, CW, CH), 0, 0);
  }
  compose(true);
  P.done();
})();

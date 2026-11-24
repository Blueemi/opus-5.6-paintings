// Poppies, After Rain — a loose botanical watercolour. Every wash is a transparent
// film of pigment: densities add as optical absorbance (so glazes darken and mix the
// way they do on paper), pigment drifts to the drying edge, settles into the valleys
// of the cold-pressed sheet, and blooms where wet meets wet. Shapes are stacks of
// slightly different deformed polygons, which gives watercolour its ragged, soft rims.
(async function () {
  const W0 = 1800, H0 = 2400;
  const cv = P.canvas(W0, H0);
  const w = cv.width, h = cv.height;
  const k = P.scale;
  const ctx = cv.getContext('2d');
  const seed = P.seed || 'poppies-3';
  const R = P.rng(seed);
  const N = P.noise(R);
  const NP = w * h;

  // ---------- paper ----------
  const paperH = new Float32Array(NP);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x / k, Y = y / k;
    let v = 0.5 + 0.28 * N.n2(X / 5.5, Y / 5.5) + 0.16 * N.n2(X / 13, Y / 13) + 0.1 * N.n2(X / 2.2, Y / 2.2) + 0.08 * N.fbm2(X / 90, Y / 90, 2);
    paperH[y * w + x] = P.clamp(v);
  }
  const A = new Float32Array(NP * 3); // absorbance
  const occ = new Float32Array(NP);   // paper already claimed by a nearer petal
  const graphite = new Float32Array(NP);

  // pigments as absorbance per unit density (r, g, b)
  const PG = {
    scarlet: [0.04, 1.55, 1.75], crimson: [0.22, 1.9, 1.15], yellow: [0.02, 0.16, 1.5],
    ochre: [0.14, 0.42, 1.05], sap: [0.95, 0.32, 1.25], olive: [0.75, 0.55, 1.2],
    ultra: [1.15, 0.85, 0.12], cerulean: [1.05, 0.45, 0.2], indigo: [1.35, 1.15, 0.75],
    sienna: [0.28, 0.85, 1.25], violet: [0.7, 1.3, 0.45],
  };

  // ---------- shapes ----------
  function deform(pts, iters, amp, rng) {
    let p = pts;
    for (let it = 0; it < iters; it++) {
      const q = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        q.push(a);
        const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
        const d = rng.gauss(0, amp * len);
        q.push([(a[0] + b[0]) / 2 + nx * d, (a[1] + b[1]) / 2 + ny * d]);
      }
      p = q;
      amp *= 0.82;
    }
    return p;
  }

  // rasterise several deformed copies of a polygon into a local float mask
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  function maskOf(poly, o) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const pad = Math.ceil((o.soft || 0) * 2.5 + 30 * k);
    x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad));
    x1 = Math.min(w, Math.ceil(x1 + pad)); y1 = Math.min(h, Math.ceil(y1 + pad));
    const bw = x1 - x0, bh = y1 - y0;
    if (bw <= 0 || bh <= 0) return null;
    scratch.width = bw; scratch.height = bh;
    sctx.clearRect(0, 0, bw, bh);
    const copies = o.copies ?? 5;
    sctx.fillStyle = `rgba(0,0,0,${1 / copies})`;
    for (let c = 0; c < copies; c++) {
      const d = deform(poly, o.iters ?? 4, o.rough ?? 0.09, R);
      sctx.beginPath();
      d.forEach(([x, y], i) => (i ? sctx.lineTo(x - x0, y - y0) : sctx.moveTo(x - x0, y - y0)));
      sctx.closePath();
      sctx.fill();
    }
    const id = sctx.getImageData(0, 0, bw, bh).data;
    const m = new Float32Array(bw * bh);
    for (let i = 0; i < bw * bh; i++) m[i] = id[i * 4 + 3] / 255;
    return { m, x0, y0, bw, bh };
  }

  // lay a wash of pigment over a polygon
  function wash(poly, pig, o) {
    const mk = maskOf(poly, o);
    if (!mk) return;
    const { x0, y0, bw, bh } = mk;
    let m = mk.m;
    if (o.soft) m = P.boxBlur(m, bw, bh, 1, o.soft, 3);
    // wet-on-dry: a crisp, slightly ragged rim where the paper's tooth catches the brush
    const crisp = new Float32Array(bw * bh);
    for (let i = 0; i < bw * bh; i++) {
      const x = x0 + (i % bw), y = y0 + ((i / bw) | 0);
      const ph = paperH[y * w + x];
      crisp[i] = o.soft ? m[i] : P.smooth(0.3 + (ph - 0.5) * 0.35, 0.58 + (ph - 0.5) * 0.35, m[i]);
    }
    const inner = P.boxBlur(crisp, bw, bh, 1, (o.edgeR ?? 7) * k, 2);
    const kk = PG[pig] || pig;
    const d0 = o.d ?? 0.4;
    const fx = R.range(0, 100);
    for (let j = 0; j < bh; j++) {
      for (let i = 0; i < bw; i++) {
        const li = j * bw + i;
        let c = crisp[li];
        if (c < 0.004) continue;
        const x = x0 + i, y = y0 + j, gi = y * w + x;
        let ed = Math.max(0, c - inner[li]);
        if (o.occ) {
          const free = 1 - occ[gi];
          c *= free; ed *= free;
          if (o.claim) occ[gi] = Math.max(occ[gi], crisp[li]);
          if (c < 0.004) continue;
        }
        // uneven flow inside the wash, with occasional blooms
        const flow = 1 + (o.flow ?? 0.35) * N.fbm2(x / (110 * k) + fx, y / (110 * k), 3);
        // pigment migrates outward as the wash dries: a darker rim
        const edge = ed * (o.edge ?? 1.6);
        const gran = 1 + (o.gran ?? 0.6) * (0.5 - paperH[gi]);
        const grad = o.grad ? o.grad(x, y) : 1;
        let dens = (d0 * c * flow * grad + d0 * edge) * gran;
        if (o.lift) dens *= o.lift(x, y);
        if (dens <= 0) continue;
        A[gi * 3] += dens * kk[0]; A[gi * 3 + 1] += dens * kk[1]; A[gi * 3 + 2] += dens * kk[2];
      }
    }
  }

  const blob = (cx, cy, rx, ry, n = 24, rot = 0) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1 + 0.12 * N.n2(Math.cos(a) * 1.5 + cx * 0.01, Math.sin(a) * 1.5 + cy * 0.01);
      const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
      pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    return pts;
  };

  // a thin brushed line (stems, veins, grasses): stamped dabs into absorbance
  function line(pts, pig, o) {
    const kk = PG[pig] || pig;
    const n = pts.length;
    let total = 0;
    for (let i = 0; i < n - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    let acc = 0;
    const cov = new Map();
    for (let i = 0; i < n - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const L = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.ceil(L / 0.7));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const tt = (acc + L * t) / total;
        const rad = o.w * (o.taper ? 1 - 0.75 * tt : 1) * (0.85 + 0.3 * N.n2(x / 40, y / 40)) / 2;
        for (let yy = Math.floor(y - rad - 1); yy <= y + rad + 1; yy++) for (let xx = Math.floor(x - rad - 1); xx <= x + rad + 1; xx++) {
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const d = Math.hypot(xx - x, yy - y);
          const a = P.smooth(rad + 0.8, rad - 0.8, d);
          if (a <= 0) continue;
          const gi = yy * w + xx;
          if ((cov.get(gi) || 0) < a) cov.set(gi, a);
        }
      }
      acc += L;
    }
    for (const [gi, a] of cov) {
      const edge = 1 + 0.6 * (1 - a);
      const dens = o.d * a * edge * (1 + 0.5 * (0.5 - paperH[gi]));
      A[gi * 3] += dens * kk[0]; A[gi * 3 + 1] += dens * kk[1]; A[gi * 3 + 2] += dens * kk[2];
    }
  }

  function pencil(pts, o = {}) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const L = Math.hypot(bx - ax, by - ay);
      for (let s = 0; s < L; s += 0.6) {
        const x = ax + (bx - ax) * s / L, y = ay + (by - ay) * s / L;
        const xi = Math.round(x + R.gauss(0, 0.3)), yi = Math.round(y + R.gauss(0, 0.3));
        if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
        const gi = yi * w + xi;
        // graphite catches only on the paper's peaks
        graphite[gi] = Math.max(graphite[gi], (o.d ?? 0.22) * P.smooth(0.35, 0.75, paperH[gi]));
      }
    }
  }

  // ---------- poppies ----------
  // a poppy: four crinkled, cupped petals round a dark heart. tilt squashes it into
  // three-quarter view; `face` is the direction it looks.
  function* poppy(cx, cy, r, o = {}) {
    const rot = o.rot ?? R.range(0, Math.PI / 2);
    const tilt = o.tilt ?? 0;
    const sq = 1 - 0.55 * tilt;
    const petals = [];
    for (let i = 0; i < 4; i++) {
      const a = rot + i * Math.PI / 2 + R.range(-0.18, 0.18);
      const wdt = R.range(1.75, 2.05);
      const rr = r * R.range(0.88, 1.08);
      const pts = [];
      const ox = 0, oy = 0;
      pts.push([cx + ox, cy + oy * sq]);
      const n = 26;
      for (let j = 0; j <= n; j++) {
        const u = j / n - 0.5;
        const b = a + u * wdt;
        let rad = rr * (0.62 + 0.38 * Math.pow(Math.cos(u * Math.PI), 0.45));
        rad *= 1 + 0.05 * Math.sin(u * 19 + i) + 0.04 * N.n2(u * 6 + i * 3, cx * 0.01);
        const px = Math.cos(b) * rad, py = Math.sin(b) * rad;
        pts.push([cx + px, cy + py * sq - tilt * r * 0.18 * (1 - Math.abs(u) * 2) * (py < 0 ? 1 : -0.4)]);
      }
      // petals turned away from us sit behind and in shadow
      const back = Math.sin(a) < -0.2 ? 1 : 0;
      petals.push({ pts, a, back });
    }
    // nearest petals first; each claims its paper so the ones behind tuck under it
    petals.sort((p, q) => p.back - q.back || Math.sin(q.a) - Math.sin(p.a));
    if (!o.soft) {
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const p of petals) for (const [x, y] of p.pts) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
      for (let y = Math.max(0, Math.floor(by0 - 60 * k)); y < Math.min(h, by1 + 60 * k); y++) for (let x = Math.max(0, Math.floor(bx0 - 60 * k)); x < Math.min(w, bx1 + 60 * k); x++) occ[y * w + x] = 0;
    }
    const lightDir = -Math.PI * 0.75; // light from the upper left
    if (o.pencil) for (const p of petals) pencil(p.pts.slice(1).map(([x, y]) => [x + R.gauss(0, 2 * k), y + R.gauss(0, 2 * k)]), { d: 0.2 });
    if (!o.soft) {
      // red let run into the still-damp ground on the shadow side
      const hb = blob(cx + r * 0.15, cy + r * 0.35 * sq, r * 1.05, r * 0.75 * sq, 24);
      wash(hb, 'scarlet', { d: 0.18, soft: 34 * k, edge: 0.2, gran: 0.6, flow: 0.6, rough: 0.15, copies: 3 });
    }
    for (const p of petals) {
      const lit = 0.5 + 0.5 * Math.cos(p.a - lightDir);
      const vary = R.range(0.85, 1.2);
      // a warm underwash: where the red is lifted later, light seems to come through
      if (!o.soft) wash(p.pts, 'yellow', { d: 0.16, edge: 0.6, gran: 0.3, flow: 0.2, rough: 0.05, copies: 3, occ: true });
      // first wash: scarlet, lighter on the lit side, leaving a glint of paper near the rim
      const hx = cx + Math.cos(p.a) * r * 0.62, hy = cy + Math.sin(p.a) * r * 0.62 * sq;
      wash(p.pts, 'scarlet', {
        d: (o.d ?? 1.25) * vary * (0.75 + 0.35 * (1 - lit) + 0.3 * p.back), soft: o.soft, edge: 1.6, edgeR: 10 * k, gran: 0.45, flow: 0.15, rough: 0.05, copies: 5,
        occ: !o.soft, claim: !o.soft,
        lift: (x, y) => {
          const ang = Math.atan2((y - cy) / sq, x - cx), dist = Math.hypot(x - cx, (y - cy) / sq) / r;
          const crease = P.smooth(0.25, 0.75, N.n2(ang * 9 + p.a, dist * 2.2)) * P.smooth(0.25, 0.6, dist);
          return (1 - (o.soft ? 0.3 : 0.8) * lit * Math.exp(-(Math.pow(x - hx, 2) + Math.pow(y - hy, 2)) / Math.pow(r * 0.28, 2))) * (1 - 0.28 * crease);
        },
      });
      yield;
      // second glaze: crimson pooling toward the heart and in the folds
      wash(p.pts, 'crimson', {
        d: (o.d ?? 1.25) * 0.85, soft: o.soft ? o.soft * 1.5 : 6 * k, edge: 0.8, gran: 0.6, flow: 0.5, rough: 0.05, copies: 4, occ: !o.soft,
        grad: (x, y) => Math.exp(-Math.hypot(x - cx, (y - cy) / sq) / (r * 0.34)) * 1.9 + 0.18 * (1 - lit) + 0.3 * p.back,
      });
      // now and then, crimson dropped into the wet petal blooms outward
      if (!o.soft && R() < 0.45) {
        const t = R.range(0.35, 0.7), bx = cx + Math.cos(p.a) * r * t, by = cy + Math.sin(p.a) * r * t * sq;
        wash(blob(bx, by, r * R.range(0.16, 0.26), r * R.range(0.14, 0.22), 18), 'crimson', { d: 0.55, soft: 9 * k, edge: 2.6, edgeR: 6 * k, gran: 0.7, flow: 0.5, rough: 0.2, copies: 3, occ: true });
      }
      // a deeper shadow glaze where the petal folds into the heart
      if (!o.soft) wash(p.pts, 'violet', { d: 0.5, soft: 14 * k, edge: 0.2, gran: 0.7, flow: 0.2, rough: 0.05, copies: 3, occ: true,
        grad: (x, y) => Math.exp(-Math.pow(Math.hypot(x - cx, (y - cy) / sq) / (r * 0.3), 2)) * (0.6 + 0.6 * p.back) });
      // a few veins radiating from the centre
      if (!o.soft) {
        for (let v = 0; v < 5; v++) {
          const b = p.a + R.range(-0.6, 0.6);
          const L = r * R.range(0.4, 0.8);
          const pts = [];
          for (let s = 0; s <= 6; s++) {
            const t = s / 6;
            pts.push([cx + Math.cos(b + t * 0.1) * L * t + Math.cos(b) * r * 0.12, cy + (Math.sin(b + t * 0.1) * L * t + Math.sin(b) * r * 0.12) * sq]);
          }
          line(pts, 'crimson', { w: 1.6 * k, d: 0.22, taper: true });
        }
        // crinkles: faint wavy creases across the petal
        for (let v = 0; v < 4; v++) {
          const rr = r * R.range(0.45, 0.85);
          const b0 = p.a + R.range(-0.7, -0.2), b1 = p.a + R.range(0.2, 0.7);
          const pts = [];
          for (let s = 0; s <= 10; s++) {
            const b = b0 + (b1 - b0) * s / 10;
            const q = rr * (1 + 0.05 * Math.sin(s * 1.7 + v));
            pts.push([cx + Math.cos(b) * q, cy + Math.sin(b) * q * sq]);
          }
          line(pts, 'crimson', { w: 1.3 * k, d: 0.12 });
        }
      }
      yield;
    }
    // the dark heart: a soft violet-black blot, the seed head, the ring of stamens
    const hr = r * 0.22;
    wash(blob(cx, cy, hr * 1.25, hr * 1.25 * sq, 20), 'indigo', { d: 0.8, soft: o.soft ? o.soft : 5 * k, edge: 1.2, gran: 0.9, rough: 0.12 });
    wash(blob(cx, cy, hr * 1.25, hr * 1.25 * sq, 20), 'violet', { d: 0.5, soft: o.soft ? o.soft : 8 * k, edge: 0.6, gran: 0.9, rough: 0.12 });
    if (!o.soft) {
      wash(blob(cx, cy - hr * 0.1, hr * 0.45, hr * 0.42 * sq, 16), [0.9, 0.5, 1.3], { d: 0.7, edge: 2.0, gran: 0.8, rough: 0.06 });
      for (let s = 0; s < 70; s++) {
        const a = R.range(0, Math.PI * 2), rr = hr * R.range(1.05, 1.7);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * sq;
        const x0 = cx + Math.cos(a) * hr * 0.7, y0 = cy + Math.sin(a) * hr * 0.7 * sq;
        line([[x0, y0], [x, y]], 'indigo', { w: 1.4 * k, d: 0.35, taper: true });
        line([[x, y], [x + 1, y + 1]], 'indigo', { w: 4.5 * k, d: 0.7 });
      }
    }
    yield;
  }

  function stem(x0, y0, x1, y1, bend, o = {}) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bend + N.n2(t * 3, x0) * 6 * k;
      const y = y0 + (y1 - y0) * t;
      pts.push([x, y]);
    }
    line(pts, 'sap', { w: (o.w ?? 7) * 1.4 * k, d: (o.d ?? 0.45) * 1.5 });
    line(pts.map(([x, y]) => [x + (o.w ?? 7) * 0.35 * k, y]), 'indigo', { w: (o.w ?? 7) * 0.5 * k, d: 0.3 });
    // fine hairs along the stem
    if (o.hairs !== false) for (let i = 2; i < 22; i += 2) {
      const [x, y] = pts[i];
      const s = R() < 0.5 ? -1 : 1;
      line([[x, y], [x + s * 9 * k, y - 6 * k]], 'sap', { w: 1 * k, d: 0.25, taper: true });
    }
    return pts;
  }

  function bud(x, y, r, droop) {
    const pts = blob(x, y, r * 0.62, r, 22, droop);
    wash(pts, 'sap', { d: 0.5, edge: 1.8, gran: 0.6, rough: 0.05 });
    wash(blob(x + Math.cos(droop + 1.57) * r * 0.5, y + Math.sin(droop + 1.57) * r * 0.5, r * 0.28, r * 0.42, 14, droop), 'scarlet', { d: 0.45, soft: 3 * k, edge: 1.4 });
    wash(blob(x - r * 0.15, y - r * 0.1, r * 0.2, r * 0.6, 12, droop), 'olive', { d: 0.35, edge: 1.0, soft: 4 * k });
  }

  // the painter keeps the main flowers' paper clean of background dabs
  const MAINS = [
    { x: 880, y: 1260, r: 390, tilt: 0.28, rot: 0.35 },
    { x: 400, y: 760, r: 250, tilt: 0.55, rot: 0.9 },
    { x: 1420, y: 700, r: 215, tilt: 0.68, rot: 0.1 },
  ];
  const reserved = (x, y, pad = 1.05) => MAINS.some((m) => Math.hypot(x / k - m.x, (y / k - m.y) / (1 - 0.55 * m.tilt)) < m.r * pad);

  // ---------- the painting ----------
  let lastShow = 0;
  function render() {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const paper = [0.965, 0.955, 0.925];
    for (let i = 0; i < NP; i++) {
      const ph = paperH[i];
      const sh = 0.985 + 0.03 * ph;
      for (let c = 0; c < 3; c++) {
        let v = paper[c] * sh * Math.exp(-A[i * 3 + c]);
        v *= 1 - graphite[i] * (c === 2 ? 0.9 : 1);
        d[i * 4 + c] = Math.max(0, Math.min(255, P.linToSrgb(Math.max(0, v)) * 255));
      }
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  const show = () => { const t = performance.now(); if (t - lastShow > 600) { render(); lastShow = t; } };

  await P.run(function* () {
    // 1. wet-in-wet ground: a cool upper sky, a warm field, leaving breathing white
    P.progress(0.05, 'wetting the paper');
    wash(blob(600 * k, 380 * k, 900 * k, 420 * k, 30), 'cerulean', { d: 0.16, soft: 90 * k, edge: 0.2, gran: 0.5, flow: 0.45, copies: 3, rough: 0.12 });
    wash(blob(1400 * k, 300 * k, 600 * k, 300 * k, 30), 'ultra', { d: 0.12, soft: 80 * k, edge: 0.2, gran: 0.5, flow: 0.45, copies: 3, rough: 0.12 });
    yield;
    wash(blob(900 * k, 1250 * k, 1100 * k, 420 * k, 30), 'ochre', { d: 0.26, soft: 70 * k, edge: 0.3, gran: 0.45, flow: 0.5, copies: 3, rough: 0.14 });
    wash(blob(700 * k, 1650 * k, 1000 * k, 380 * k, 30), 'sap', { d: 0.36, soft: 60 * k, edge: 0.4, gran: 0.45, flow: 0.5, copies: 3, rough: 0.14 });
    wash(blob(1200 * k, 2100 * k, 1000 * k, 420 * k, 30), 'sap', { d: 0.55, soft: 50 * k, edge: 0.5, gran: 0.5, flow: 0.5, copies: 3, rough: 0.14 });
    wash(blob(400 * k, 2200 * k, 700 * k, 300 * k, 30), 'indigo', { d: 0.28, soft: 60 * k, edge: 0.4, gran: 0.5, flow: 0.5, copies: 3, rough: 0.14 });
    wash(blob(1500 * k, 1450 * k, 500 * k, 300 * k, 30), 'yellow', { d: 0.22, soft: 70 * k, edge: 0.2, gran: 0.4, flow: 0.5, copies: 3, rough: 0.14 });
    show(); yield;

    // 2. far poppies dissolved into the wet field
    P.progress(0.2, 'far field');
    for (let i = 0; i < 70; i++) {
      const y = R.range(1000, 1480) * k;
      const x = R.range(-40, 1840) * k;
      const s = R.range(8, 26) * k * (0.6 + 0.8 * (y / k - 1000) / 480);
      if (reserved(x, y, 1.1)) continue;
      wash(blob(x, y, s * 1.3, s, 14), R() < 0.8 ? 'scarlet' : 'crimson', { d: R.range(0.45, 0.85), soft: R.range(4, 10) * k, edge: 1.0, gran: 0.5, rough: 0.15, copies: 3 });
      if (i % 10 === 0) yield;
    }
    for (let i = 0; i < 50; i++) {
      const x = R.range(0, 1800) * k, y = R.range(1150, 1700) * k;
      if (reserved(x, y, 1.05)) continue;
      line([[x, y], [x + R.gauss(0, 8) * k, y - R.range(30, 90) * k]], 'sap', { w: R.range(2, 4) * k, d: 0.22, taper: true });
    }
    show(); yield;

    // 3. middle distance poppies, still soft
    P.progress(0.35, 'middle distance');
    const mids = [[220, 1380, 70], [1580, 1300, 62], [1260, 1520, 80], [420, 1620, 92], [1700, 1700, 75]];
    for (const [x, y, r] of mids) {
      if (reserved(x * k, y * k, 1.0 + r / 300)) continue;
      stem(x * k, (y + r * 0.6) * k, (x + R.range(-30, 30)) * k, 2450 * k, R.range(-40, 40) * k, { w: 4, d: 0.3, hairs: false });
      yield* poppy(x * k, y * k, r * k, { soft: 5 * k, tilt: R.range(0.2, 0.6), d: 0.8 });
    }
    show(); yield;

    // 4. the three main flowers, their stems, buds and grasses
    P.progress(0.55, 'poppies');
    const mains = MAINS;
    // stems first, so the petals glaze over them
    stem(890 * k, (1260 + 390 * 0.74) * k, 760 * k, 2450 * k, 70 * k, { w: 9 });
    stem(410 * k, (760 + 250 * 0.62) * k, 560 * k, 2450 * k, -110 * k, { w: 7 });
    stem(1420 * k, (700 + 215 * 0.6) * k, 1240 * k, 2450 * k, 130 * k, { w: 7 });
    const budStem = stem(1050 * k, 2450 * k, 1180 * k, 1560 * k, 60 * k, { w: 5 });
    const budStem2 = stem(300 * k, 2450 * k, 230 * k, 1180 * k, -80 * k, { w: 5 });
    yield;
    for (const m of mains) yield* poppy(m.x * k, m.y * k, m.r * k, { tilt: m.tilt, rot: m.rot, pencil: true });
    // nodding buds and a seed pod
    const [bx, by] = budStem[budStem.length - 1];
    line([[bx, by], [bx + 30 * k, by - 40 * k], [bx + 60 * k, by - 20 * k]], 'sap', { w: 5 * k, d: 0.4 });
    bud(bx + 70 * k, by + 20 * k, 46 * k, -0.5);
    const [cx2, cy2] = budStem2[budStem2.length - 1];
    line([[cx2, cy2], [cx2 - 20 * k, cy2 - 40 * k], [cx2 - 50 * k, cy2 - 30 * k]], 'sap', { w: 5 * k, d: 0.4 });
    bud(cx2 - 58 * k, cy2 + 10 * k, 40 * k, 0.6);
    // deeply lobed poppy leaves at the base, wet-on-dry with a second glaze
    for (let i = 0; i < 4; i++) {
      const bx2 = R.range(100, 1700) * k, by2 = R.range(2150, 2400) * k;
      const ang = -Math.PI / 2 + R.range(-0.9, 0.9);
      const L = R.range(260, 420) * k;
      const pts = [];
      const lobes = 5;
      for (let s = 0; s <= 40; s++) {
        const t = s / 40;
        const wd = L * 0.13 * Math.sin(Math.PI * t) * (0.45 + 0.55 * Math.abs(Math.sin(t * Math.PI * lobes)));
        pts.push([bx2 + Math.cos(ang) * L * t - Math.sin(ang) * wd, by2 + Math.sin(ang) * L * t + Math.cos(ang) * wd]);
      }
      for (let s = 40; s >= 0; s--) {
        const t = s / 40;
        const wd = L * 0.13 * Math.sin(Math.PI * t) * (0.45 + 0.55 * Math.abs(Math.sin(t * Math.PI * lobes + 0.8)));
        pts.push([bx2 + Math.cos(ang) * L * t + Math.sin(ang) * wd, by2 + Math.sin(ang) * L * t - Math.cos(ang) * wd]);
      }
      wash(pts, [0.85, 0.36, 1.05], { d: 0.5, soft: 2.5 * k, edge: 1.4, gran: 0.8, rough: 0.08, copies: 4, flow: 0.5 });
      wash(pts, 'indigo', { d: 0.22, soft: 6 * k, edge: 0.4, gran: 0.9, rough: 0.08, copies: 3, grad: (x, y) => 0.3 + 0.7 * P.smooth(0, L, Math.hypot(x - bx2, y - by2)) });
      line([[bx2, by2], [bx2 + Math.cos(ang) * L * 0.9, by2 + Math.sin(ang) * L * 0.9]], 'olive', { w: 2.5 * k, d: 0.3, taper: true });
      yield;
    }
    // grasses sweeping up from the bottom
    for (let i = 0; i < 26; i++) {
      const x = R.range(0, 1800) * k, L = R.range(250, 700) * k, lean = R.range(-0.35, 0.35);
      const pts = [];
      for (let s = 0; s <= 10; s++) { const t = s / 10; pts.push([x + Math.sin(t * 1.4) * lean * L, 2450 * k - t * L]); }
      line(pts, R() < 0.7 ? 'sap' : 'olive', { w: R.range(3, 7) * k, d: R.range(0.2, 0.4), taper: true });
    }
    show(); yield;

    // 5. splatter, flicked from a loaded brush
    P.progress(0.9, 'splatter');
    for (let i = 0; i < 90; i++) {
      const near = R() < 0.6 ? mains[R.int(0, 2)] : null;
      const x = near ? (near.x + R.gauss(0, near.r * 1.1)) * k : R.range(0, 1800) * k;
      const y = near ? (near.y + R.gauss(0, near.r * 1.1)) * k : R.range(0, 2400) * k;
      const s = Math.pow(R(), 2.5) * 9 * k + 1.5 * k;
      wash(blob(x, y, s, s * R.range(0.7, 1.0), 10), R() < 0.65 ? 'scarlet' : 'sap', { d: R.range(0.3, 0.6), edge: 2.2, edgeR: 2 * k, gran: 0.4, rough: 0.1, copies: 2 });
    }
    yield;
  });
  render();
  P.done();
})();

// Strata — an abstract built the way large squeegee paintings are made. A brushed
// underpainting dries; then a long blade loaded with ribbons of colour is dragged
// across it. Under the blade, paint is deposited where it presses, skipped where it
// rides over a ridge (so older layers show through in long torn streaks), picked up
// and smeared onward, and squeezed out in a ridge wherever the blade stops.
// Each pass dries before the next. Finally the relief is lit.
(async function () {
  const W = 2000, H = 2000;
  const cv = P.canvas(W, H);
  const w = cv.width, h = cv.height;
  const S = P.scale;
  const ctx = cv.getContext('2d');
  const seed = P.seed || 'strata-9';
  const R = P.rng(seed);
  const N = P.noise(R);

  const C = {
    red: [0.82, 0.13, 0.10], crimson: [0.52, 0.04, 0.12], orange: [0.96, 0.46, 0.08],
    yellow: [0.99, 0.82, 0.16], lemon: [0.97, 0.93, 0.45], ochre: [0.80, 0.58, 0.22],
    ultra: [0.09, 0.13, 0.52], cerulean: [0.16, 0.50, 0.72], turq: [0.10, 0.60, 0.62],
    phthalo: [0.02, 0.30, 0.27], violet: [0.30, 0.12, 0.40], white: [0.95, 0.94, 0.90],
    grey: [0.62, 0.64, 0.66], black: [0.06, 0.06, 0.075],
  };

  // ---------- underpainting ----------
  const ref = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x / w, Y = y / h;
      const wy = Y + 0.06 * N.fbm2(X * 2.5, Y * 2.5, 3), wx = X + 0.05 * N.fbm2(X * 2 + 9, Y * 2 + 4, 3);
      let c;
      if (wy < 0.36) c = P.mix3(C.ultra, C.cerulean, P.smooth(-0.3, 0.6, N.fbm2(X * 3, Y * 6, 3)));
      else if (wy < 0.56) c = wx < 0.48 ? P.mix3(C.red, C.orange, P.smooth(-0.2, 0.5, N.n2(X * 4, Y * 4))) : P.mix3(C.ochre, C.yellow, 0.3);
      else if (wy < 0.76) c = P.mix3(C.crimson, C.violet, P.smooth(-0.4, 0.5, N.fbm2(X * 3 + 5, Y * 5, 3)));
      else c = P.mix3(C.phthalo, C.black, P.smooth(-0.2, 0.6, N.fbm2(X * 4 + 2, Y * 4, 3)));
      const i = (y * w + x) * 3;
      ref[i] = c[0]; ref[i + 1] = c[1]; ref[i + 2] = c[2];
    }
  }
  const oil = new P.Oil(w, h, R, { ground: [0.85, 0.82, 0.76] });
  await P.run(function* () {
    const L = [
      { R: 90 * S, maxLen: 6, noStop: true, threshold: 0, jitterV: 0.12, jitterC: 0.05, thick: 0.7, load: 2.5, pickup: 0.35 },
      { R: 46 * S, maxLen: 7, threshold: 0.14, jitterV: 0.12, jitterC: 0.05, thick: 0.9, load: 2.0, pickup: 0.3 },
    ];
    for (const l of L) {
      for (const _ of oil.layer(ref, l.R, { ...l, guide: (x, y) => (N.n2(x / 400, y / 400) > 0 ? 0 : Math.PI / 2) + 0.3 * N.n2(x / 150, y / 150), guideW: 1.5, curve: 0.5 })) {
        P.progress(0.1, 'underpainting');
        yield;
      }
    }
    oil.show(ctx);
  });

  // the dry paint so far, and the wet layer a pass lays on top
  const dry = oil.col;            // visible, dried colour
  const hgt = oil.hgt;            // relief
  for (let i = 0; i < w * h; i++) hgt[i] *= 0.55;
  const wetA = new Float32Array(w * h);
  const wetC = new Float32Array(w * h * 3);
  // the underpainting is still wet when the first blade comes through
  for (let i = 0; i < w * h; i++) { wetA[i] = 0.06; wetC[i * 3] = dry[i * 3]; wetC[i * 3 + 1] = dry[i * 3 + 1]; wetC[i * 3 + 2] = dry[i * 3 + 2]; }

  // ---------- the squeegee ----------
  function* drag(o) {
    const horiz = o.dir === 'down' || o.dir === 'up';
    const sgn = o.dir === 'down' || o.dir === 'right' ? 1 : -1;
    const a0 = Math.round(o.span[0] * (horiz ? w : h)), a1 = Math.round(o.span[1] * (horiz ? w : h));
    const bw = a1 - a0;
    const amt = new Float32Array(bw), br = new Float32Array(bw), bg = new Float32Array(bw), bb = new Float32Array(bw);
    // load the blade with ribbons of colour
    for (let u = 0; u < bw; u++) {
      let ta = 0, r = 0, g = 0, b = 0;
      const uu = u / bw;
      for (const bl of o.load) {
        const d = (uu - bl.u) / bl.w;
        const wgt = bl.a * Math.exp(-d * d * 2) * (0.75 + 0.5 * N.n2(u / (30 * S), bl.u * 10));
        ta += wgt; r += bl.c[0] * wgt; g += bl.c[1] * wgt; b += bl.c[2] * wgt;
      }
      amt[u] = ta;
      if (ta > 0) { br[u] = r / ta; bg[u] = g / ta; bb[u] = b / ta; }
    }
    const s0 = Math.round(o.from * (horiz ? h : w)), s1 = Math.round(o.to * (horiz ? h : w));
    const len = Math.abs(s1 - s0);
    const pauses = (o.pauses || []).map((p) => Math.round(p * len));
    const off = R.range(0, 100);
    for (let k = 0; k < len; k++) {
      const s = s0 + sgn * k;
      const tilt = o.tilt || 0;
      const pause = pauses.some((p) => Math.abs(k - p) < 3 * S);
      for (let u = 0; u < bw; u++) {
        const across = a0 + u;
        const x = horiz ? across : s + Math.round(tilt * u);
        const y = horiz ? s + Math.round(tilt * u) : across;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        // pressure wanders slowly; the blade skips in long torn streaks over the relief
        const press = P.clamp((o.press ?? 0.75) + 0.35 * N.n2(u / (220 * S) + off, k / (800 * S)));
        const streak = 0.52 * N.n2(u / (95 * S) + off, k / (650 * S)) + 0.28 * N.n2(u / (16 * S) + off, k / (300 * S)) + 0.20 * N.n2(u / (3 * S), k / (110 * S) + off);
        const relief = (hgt[i] - 0.45) * 0.5;
        const skip = P.smooth(o.skip[0], o.skip[1], streak + 0.5 + relief);
        // a ragged start: the blade meets the canvas unevenly along its length
        const start = P.smooth(0, 14 * S, k - 10 * S * (0.5 + 0.5 * N.n2(u / (25 * S), off)));
        const contact = (pause ? 0.6 + 0.4 * skip : press * skip) * start;
        if (contact <= 0.002) continue;
        const j = i * 3;
        // deposit from the blade
        const dep = amt[u] * (pause ? o.rate * 1.5 : o.rate) * contact;
        // pick up wet paint (and drag it onward)
        const pick = wetA[i] * o.pickup * contact;
        let wa = wetA[i] - pick;
        if (dep > 0) {
          const nw = wa + dep;
          wetC[j] = (wetC[j] * wa + br[u] * dep) / nw;
          wetC[j + 1] = (wetC[j + 1] * wa + bg[u] * dep) / nw;
          wetC[j + 2] = (wetC[j + 2] * wa + bb[u] * dep) / nw;
          wa = nw;
        }
        // the blade holds far more paint than one row receives: it empties slowly
        const used = dep * (o.use ?? 0.06);
        const na = amt[u] - used + pick * 0.5;
        if (pick > 0 && na > 1e-6) {
          const keep = amt[u] - used;
          br[u] = (br[u] * keep + wetC[j] * pick * 0.5) / na;
          bg[u] = (bg[u] * keep + wetC[j + 1] * pick * 0.5) / na;
          bb[u] = (bb[u] * keep + wetC[j + 2] * pick * 0.5) / na;
        }
        amt[u] = Math.max(0, na);
        wetA[i] = wa;
        // the blade flattens what it touches; paint piles up where it stops
        hgt[i] = hgt[i] * (1 - 0.35 * contact) + dep * 1.2 + (pause ? 0.25 * contact : 0);
      }
      // paint creeps sideways along the blade edge
      if (k % 3 === 0) {
        for (let u = 1; u < bw - 1; u++) {
          const m = (amt[u - 1] + amt[u + 1]) * 0.25 + amt[u] * 0.5;
          amt[u] = m;
        }
      }
      if (k % 24 === 0) { P.progress(o.p, 'dragging'); yield; }
    }
    // where the blade lifts, a squeezed ridge of whatever it still carries
    for (let u = 0; u < bw; u++) {
      const rl = (4 + 10 * (0.5 + 0.5 * N.n2(u / (30 * S), 7))) * S;
      for (let d = 0; d < rl; d++) {
        const s = s0 + sgn * (len - 1 - d) + Math.round(o.tilt ? 0 : 0);
        const x = horiz ? a0 + u : s, y = horiz ? s : a0 + u;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x, j = i * 3;
        const dep = amt[u] * 0.06 * (1 - d / rl) * P.smooth(-0.2, 0.4, N.n2(u / (8 * S), d / (4 * S)));
        if (dep <= 0) continue;
        const nw = wetA[i] + dep;
        wetC[j] = (wetC[j] * wetA[i] + br[u] * dep) / nw;
        wetC[j + 1] = (wetC[j + 1] * wetA[i] + bg[u] * dep) / nw;
        wetC[j + 2] = (wetC[j + 2] * wetA[i] + bb[u] * dep) / nw;
        wetA[i] = nw;
        hgt[i] += dep * 1.2;
      }
    }
    // let the pass dry into the visible paint
    for (let i = 0; i < w * h; i++) {
      if (wetA[i] <= 0) continue;
      const cov = 1 - Math.exp(-wetA[i] * 40);
      const j = i * 3;
      dry[j] += (wetC[j] - dry[j]) * cov;
      dry[j + 1] += (wetC[j + 1] - dry[j + 1]) * cov;
      dry[j + 2] += (wetC[j + 2] - dry[j + 2]) * cov;
      wetA[i] = 0;
    }
    oil.show(ctx);
    yield;
  }

  const passes = [
    // first the whole wet underpainting is pulled sideways into bands
    { dir: 'right', span: [-0.02, 1.02], from: -0.02, to: 1.02, rate: 0.03, pickup: 0.35, skip: [0.05, 0.30], press: 0.95, use: 0.02, tilt: 0.015,
      load: [{ u: 0.3, w: 0.2, c: C.ultra, a: 0.4 }, { u: 0.55, w: 0.12, c: C.orange, a: 0.35 }, { u: 0.85, w: 0.15, c: C.phthalo, a: 0.4 }] },
    // a wide veil dragged down through the blue: white, cerulean, lemon, crimson
    { dir: 'down', span: [-0.05, 1.05], from: -0.02, to: 0.62, rate: 0.05, pickup: 0.10, skip: [0.22, 0.46], press: 0.9, pauses: [0.42], tilt: 0.03, use: 0.03,
      load: [{ u: 0.08, w: 0.08, c: C.white, a: 1.2 }, { u: 0.27, w: 0.10, c: C.cerulean, a: 1.0 }, { u: 0.47, w: 0.09, c: C.lemon, a: 1.0 },
        { u: 0.64, w: 0.10, c: C.white, a: 1.3 }, { u: 0.86, w: 0.10, c: C.crimson, a: 1.1 }] },
    // a vertical drag across the right side: reds burning into oranges
    { dir: 'right', span: [0.12, 0.98], from: 0.52, to: 1.02, rate: 0.06, pickup: 0.12, skip: [0.26, 0.50], press: 0.9, pauses: [0.18], tilt: -0.04, use: 0.03,
      load: [{ u: 0.12, w: 0.08, c: C.yellow, a: 1.0 }, { u: 0.33, w: 0.10, c: C.red, a: 1.3 }, { u: 0.55, w: 0.08, c: C.orange, a: 1.1 },
        { u: 0.72, w: 0.07, c: C.crimson, a: 1.0 }, { u: 0.9, w: 0.08, c: C.black, a: 0.8 }] },
    // the lower band: greens, black and a cut of white
    { dir: 'down', span: [-0.02, 1.02], from: 0.60, to: 1.02, rate: 0.06, pickup: 0.10, skip: [0.24, 0.48], press: 0.9, tilt: 0.02, use: 0.03,
      load: [{ u: 0.12, w: 0.09, c: C.phthalo, a: 1.2 }, { u: 0.32, w: 0.07, c: C.black, a: 1.0 }, { u: 0.52, w: 0.06, c: C.white, a: 1.2 },
        { u: 0.74, w: 0.10, c: C.turq, a: 1.1 }] },
    // an empty blade scraped across, tearing back down to older layers
    { dir: 'right', span: [0.08, 0.66], from: 0.05, to: 0.42, rate: 0.0, pickup: 0.3, skip: [0.48, 0.70], press: 0.9, load: [], tilt: 0.05 },
    // last, a thin pale veil pulled up from the middle, heavily skipping
    { dir: 'up', span: [0.0, 1.0], from: 0.70, to: 0.30, rate: 0.04, pickup: 0.05, skip: [0.40, 0.62], press: 0.8, pauses: [0.66], tilt: -0.02, use: 0.05,
      load: [{ u: 0.2, w: 0.14, c: C.white, a: 1.0 }, { u: 0.5, w: 0.12, c: C.grey, a: 0.8 }, { u: 0.82, w: 0.12, c: C.lemon, a: 0.9 }] },
  ];
  passes.forEach((p, i) => (p.p = (i + 1) / (passes.length + 1)));

  await P.run(function* () {
    for (const p of passes) yield* drag(p);
  });

  const out = oil.finish({ relief: 0.9, shade: 0.5, spec: 0.14, soften: 0.6 });
  P.showSRGB(ctx, out, w, h);
  P.done();
})();

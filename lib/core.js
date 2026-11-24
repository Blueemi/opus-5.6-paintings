// Shared toolkit for the paintings: seeded randomness, noise, colour, buffers,
// progressive rendering and the little gallery chrome around each canvas.
(function () {
  const P = {};

  // ---------- seeded randomness ----------
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  P.rng = function (seed) {
    const s = xmur3(String(seed));
    let a = s(), b = s(), c = s(), d = s();
    function r() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    }
    for (let i = 0; i < 12; i++) r();
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    let spare = null;
    r.gauss = (mu = 0, sd = 1) => {
      if (spare !== null) { const v = spare; spare = null; return mu + sd * v; }
      let u = 0, v = 0;
      while (u === 0) u = r();
      v = r();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return mu + sd * m * Math.cos(2 * Math.PI * v);
    };
    r.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    return r;
  };

  // ---------- simplex noise (Gustavson) ----------
  const grad3 = new Float32Array([
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
    1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
    0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
  ]);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const F3 = 1 / 3, G3 = 1 / 6;

  P.noise = function (rng) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }

    function n2(xin, yin) {
      let n0 = 0, n1 = 0, n2v = 0;
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      let i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) { const g = pm12[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0); }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) { const g = pm12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1); }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) { const g = pm12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2v = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2); }
      return 70 * (n0 + n1 + n2v);
    }

    function n3(xin, yin, zin) {
      let n0 = 0, n1 = 0, n2v = 0, n3v = 0;
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 > 0) { const g = pm12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0 + grad3[g + 2] * z0); }
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 > 0) { const g = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1 + grad3[g + 2] * z1); }
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 > 0) { const g = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2v = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2 + grad3[g + 2] * z2); }
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 > 0) { const g = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3v = t3 * t3 * (grad3[g] * x3 + grad3[g + 1] * y3 + grad3[g + 2] * z3); }
      return 32 * (n0 + n1 + n2v + n3v);
    }

    function fbm2(x, y, oct = 5, lac = 2.0, gain = 0.5) {
      let a = 0, amp = 0.5, f = 1, norm = 0;
      for (let o = 0; o < oct; o++) {
        a += amp * n2(x * f + o * 17.31, y * f - o * 9.73);
        norm += amp; amp *= gain; f *= lac;
      }
      return a / norm;
    }
    function fbm3(x, y, z, oct = 5, lac = 2.0, gain = 0.5) {
      let a = 0, amp = 0.5, f = 1, norm = 0;
      for (let o = 0; o < oct; o++) {
        a += amp * n3(x * f + o * 17.31, y * f - o * 9.73, z * f + o * 3.1);
        norm += amp; amp *= gain; f *= lac;
      }
      return a / norm;
    }
    function ridged2(x, y, oct = 5, lac = 2.0, gain = 0.5) {
      let a = 0, amp = 0.5, f = 1, norm = 0, prev = 1;
      for (let o = 0; o < oct; o++) {
        let v = 1 - Math.abs(n2(x * f + o * 31.7, y * f + o * 11.1));
        v *= v;
        a += amp * v * prev;
        prev = v;
        norm += amp; amp *= gain; f *= lac;
      }
      return a / norm;
    }
    return { n2, n3, fbm2, fbm3, ridged2 };
  };

  // ---------- math ----------
  P.clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  P.lerp = (a, b, t) => a + (b - a) * t;
  P.smooth = (e0, e1, x) => {
    const t = P.clamp((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };
  P.fract = (x) => x - Math.floor(x);

  // ---------- colour ----------
  // Paintings work in linear-light float RGB; these convert at the edges.
  P.srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  P.linToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  P.hex = (h) => {
    h = h.replace('#', '');
    const n = parseInt(h, 16);
    return [P.srgbToLin(((n >> 16) & 255) / 255), P.srgbToLin(((n >> 8) & 255) / 255), P.srgbToLin((n & 255) / 255)];
  };
  P.mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // gradient through stops [[t, colour], ...]
  P.ramp = (stops) => (t) => {
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i];
        const u = (t - a[0]) / (b[0] - a[0]);
        const s = u * u * (3 - 2 * u);
        return P.mix3(a[1], b[1], s);
      }
    }
    return stops[stops.length - 1][1];
  };

  // ---------- float image buffers ----------
  P.buf = (w, h, ch = 3) => ({ w, h, ch, d: new Float32Array(w * h * ch) });

  // separable box blur, repeated passes approximate a gaussian
  P.boxBlur = function (src, w, h, ch, r, passes = 3) {
    if (r < 1) return src.slice();
    let a = src.slice();
    let b = new Float32Array(a.length);
    const rr = Math.max(1, Math.round(r / Math.sqrt(passes)));
    for (let p = 0; p < passes; p++) {
      // horizontal
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let c = 0; c < ch; c++) {
          let acc = 0;
          for (let k = -rr; k <= rr; k++) {
            const xx = k < 0 ? 0 : k >= w ? w - 1 : k;
            acc += a[(row + xx) * ch + c];
          }
          const inv = 1 / (2 * rr + 1);
          for (let x = 0; x < w; x++) {
            b[(row + x) * ch + c] = acc * inv;
            const xo = x - rr < 0 ? 0 : x - rr;
            const xi = x + rr + 1 >= w ? w - 1 : x + rr + 1;
            acc += a[(row + xi) * ch + c] - a[(row + xo) * ch + c];
          }
        }
      }
      // vertical
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < ch; c++) {
          let acc = 0;
          for (let k = -rr; k <= rr; k++) {
            const yy = k < 0 ? 0 : k >= h ? h - 1 : k;
            acc += b[(yy * w + x) * ch + c];
          }
          const inv = 1 / (2 * rr + 1);
          for (let y = 0; y < h; y++) {
            a[(y * w + x) * ch + c] = acc * inv;
            const yo = y - rr < 0 ? 0 : y - rr;
            const yi = y + rr + 1 >= h ? h - 1 : y + rr + 1;
            acc += b[(yi * w + x) * ch + c] - b[(yo * w + x) * ch + c];
          }
        }
      }
    }
    return a;
  };

  // write a linear float RGB buffer into an ImageData (with optional dithering)
  P.toImageData = function (ctx, data, w, h, opts = {}) {
    const img = ctx.createImageData(w, h);
    const o = img.data;
    const dither = opts.dither !== false;
    const lut = new Uint8ClampedArray(4097);
    for (let i = 0; i <= 4096; i++) lut[i] = Math.round(P.linToSrgb(i / 4096) * 255);
    let seed = 12345;
    for (let i = 0, j = 0; i < w * h; i++, j += 3) {
      for (let c = 0; c < 3; c++) {
        let v = data[j + c];
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        let idx = v * 4096;
        if (dither) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          idx += ((seed >>> 8) / 16777216 - 0.5) * 3;
          idx = idx < 0 ? 0 : idx > 4096 ? 4096 : idx;
        }
        o[i * 4 + c] = lut[idx | 0];
      }
      o[i * 4 + 3] = 255;
    }
    return img;
  };

  // ---------- page plumbing ----------
  const params = new URLSearchParams(location.search);
  P.params = params;
  P.seed = params.get('seed') || null;
  P.scale = parseFloat(params.get('scale') || '1');

  P.canvas = function (w, h) {
    const cv = document.getElementById('art');
    cv.width = Math.round(w * P.scale);
    cv.height = Math.round(h * P.scale);
    cv.style.aspectRatio = `${w} / ${h}`;
    document.documentElement.style.setProperty('--ar', w / h);
    return cv;
  };

  const status = () => document.getElementById('status');
  P.progress = function (f, label) {
    const s = status();
    if (s) s.textContent = f >= 1 ? '' : `${label || 'painting'} · ${Math.round(f * 100)}%`;
  };

  // Drive a generator a slice at a time so the painting appears as it is made.
  P.run = function (gen, budgetMs = 28) {
    return new Promise((resolve, reject) => {
      const it = gen();
      function step() {
        const t0 = performance.now();
        try {
          while (performance.now() - t0 < budgetMs) {
            const r = it.next();
            if (r.done) { resolve(r.value); return; }
          }
        } catch (e) { reject(e); return; }
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  };

  P.done = function () {
    P.progress(1);
    document.body.classList.add('finished');
    window.__done = true;
  };

  window.addEventListener('error', (e) => { window.__error = String(e.message || e); });
  window.addEventListener('unhandledrejection', (e) => { window.__error = String(e.reason && e.reason.stack || e.reason); });

  // keyboard: S saves a PNG, R repaints with a fresh seed, arrows walk the gallery
  const ORDER = ['alpenglow', 'lavender', 'shanshui', 'aurora', 'strata', 'watercolour'];
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey) return;
    const here = location.pathname.split('/').pop().replace('.html', '');
    const i = ORDER.indexOf(here);
    if (e.key === 's' || e.key === 'S') {
      const cv = document.getElementById('art');
      const a = document.createElement('a');
      a.download = `${here}${P.seed ? '-' + P.seed : ''}.png`;
      a.href = cv.toDataURL('image/png');
      a.click();
    } else if (e.key === 'r' || e.key === 'R') {
      params.set('seed', Math.random().toString(36).slice(2, 8));
      location.search = params.toString();
    } else if (e.key === 'ArrowRight' && i >= 0) {
      location.href = ORDER[(i + 1) % ORDER.length] + '.html';
    } else if (e.key === 'ArrowLeft' && i >= 0) {
      location.href = ORDER[(i + ORDER.length - 1) % ORDER.length] + '.html';
    } else if (e.key === 'Escape') {
      location.href = '../index.html';
    }
  });

  window.P = P;
})();

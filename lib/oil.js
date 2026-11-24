// An oil painting machine. It paints a reference image coarse-to-fine with curved
// strokes (after Hertzmann's painterly rendering), but every stroke is a loaded
// bristle brush: bristles carry slightly different paint, run dry at different
// moments, drag a little of the wet paint beneath them, and leave ridges in a
// height field. At the end the relief is lit like a canvas on a gallery wall.
// Colours inside are gamma-encoded (sRGB-like) floats, the way paint mixes on a palette.
(function () {
  const NB = 64; // bins across a brush

  function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

  class Oil {
    constructor(w, h, rng, o = {}) {
      this.w = w; this.h = h; this.rng = rng;
      const N = w * h;
      this.col = new Float32Array(N * 3);
      this.hgt = new Float32Array(N);
      this.cov = new Float32Array(N);
      this.cB = new Uint8Array(N);
      this.cS = new Float32Array(N);
      this.touched = new Int32Array(N);
      this.nt = 0;
      const g = o.ground || [0.55, 0.36, 0.22];
      const nz = P.noise(rng);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          // a scrubbed, uneven imprimatura over a plain-weave canvas
          const v = 1 + 0.08 * nz.fbm2(x / 180, y / 180, 3) + 0.04 * nz.n2(x / 9, y / 40);
          this.col[i * 3] = g[0] * v; this.col[i * 3 + 1] = g[1] * v; this.col[i * 3 + 2] = g[2] * v;
          const tx = Math.sin(x * Math.PI / 2.1), ty = Math.sin(y * Math.PI / 2.1);
          this.hgt[i] = 0.18 * (tx * ty > 0 ? Math.abs(tx) : Math.abs(ty)) + 0.05 * nz.n2(x / 3, y / 3);
        }
      }
      this.weave = this.hgt.slice();
    }

    // a thin, scrubbed block-in of the motif over the toned ground
    underpaint(ref, R, amount = 0.75) {
      const { w, h, col } = this;
      const b = P.boxBlur(ref, w, h, 3, R, 3);
      for (let i = 0; i < w * h * 3; i++) col[i] += (b[i] - col[i]) * amount;
    }

    // stroke direction per 2x2 block: along edges of the reference, falling back
    // to a guide field (angles) where the image is flat
    field(ref, R, guide, guideW = 1) {
      const { w, h } = this;
      const dw = Math.ceil(w / 2), dh = Math.ceil(h / 2);
      const L = new Float32Array(dw * dh);
      for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        const i = (Math.min(h - 1, y * 2) * w + Math.min(w - 1, x * 2)) * 3;
        L[y * dw + x] = lum(ref[i], ref[i + 1], ref[i + 2]);
      }
      const Lb = P.boxBlur(L, dw, dh, 1, Math.max(1, R * 0.25), 2);
      const ang = new Float32Array(dw * dh);
      const o = Math.max(1, Math.round(R * 0.25));
      for (let y = 0; y < dh; y++) {
        for (let x = 0; x < dw; x++) {
          const xl = Math.max(0, x - o), xr = Math.min(dw - 1, x + o);
          const yu = Math.max(0, y - o), yd = Math.min(dh - 1, y + o);
          const gx = (Lb[y * dw + xr] - Lb[y * dw + xl]);
          const gy = (Lb[yd * dw + x] - Lb[yu * dw + x]);
          const m2 = gx * gx + gy * gy;
          // stroke runs perpendicular to the gradient; blend in doubled-angle space
          const te = Math.atan2(gy, gx) + Math.PI / 2;
          const we = Math.min(1, m2 * 900);
          let vx = Math.cos(2 * te) * we, vy = Math.sin(2 * te) * we;
          if (guide) {
            const ga = guide(x * 2, y * 2);
            if (ga !== null) {
              const gw = guideW * (1 - we * 0.85);
              vx += Math.cos(2 * ga) * gw; vy += Math.sin(2 * ga) * gw;
            }
          }
          ang[y * dw + x] = 0.5 * Math.atan2(vy, vx);
        }
      }
      return { ang, dw, dh };
    }

    brush(R) {
      const r = this.rng;
      const prof = new Float32Array(NB), groove = new Float32Array(NB), cvar = new Float32Array(NB), dry = new Float32Array(NB);
      const nb = Math.max(6, Math.min(56, Math.round(R * 1.3)));
      // bristle clumps: correlated random across the brush
      const pts = Array.from({ length: nb + 2 }, () => [r(), r(), r(), r()]);
      for (let b = 0; b < NB; b++) {
        const f = (b / (NB - 1)) * (nb + 1);
        const i = Math.floor(f), t = f - i, s = t * t * (3 - 2 * t);
        const A = pts[i], B = pts[Math.min(nb + 1, i + 1)];
        prof[b] = 0.62 + 0.38 * (A[0] + (B[0] - A[0]) * s);
        cvar[b] = ((A[1] + (B[1] - A[1]) * s) - 0.5) * 0.11 + (r() - 0.5) * 0.03;
        dry[b] = A[2] + (B[2] - A[2]) * s;
        groove[b] = r();
      }
      return { prof, groove, cvar, dry };
    }

    // paint one stroke along control points `pts` (flat [x0,y0,x1,y1,...])
    stroke(pts, R, color, o) {
      const { w, h, cov, cB, cS, touched } = this;
      const r = this.rng;
      // Catmull-Rom resample to ~0.5px spacing
      const n = pts.length / 2;
      const sx = [], sy = [];
      if (n === 1) { sx.push(pts[0]); sy.push(pts[1]); }
      for (let k = 0; k < n - 1; k++) {
        const x0 = pts[Math.max(0, k - 1) * 2], y0 = pts[Math.max(0, k - 1) * 2 + 1];
        const x1 = pts[k * 2], y1 = pts[k * 2 + 1];
        const x2 = pts[(k + 1) * 2], y2 = pts[(k + 1) * 2 + 1];
        const x3 = pts[Math.min(n - 1, k + 2) * 2], y3 = pts[Math.min(n - 1, k + 2) * 2 + 1];
        const segLen = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.max(1, Math.ceil(segLen / 0.5));
        for (let j = 0; j < steps; j++) {
          const t = j / steps, t2 = t * t, t3 = t2 * t;
          sx.push(0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3));
          sy.push(0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3));
        }
      }
      if (n > 1) { sx.push(pts[(n - 1) * 2]); sy.push(pts[(n - 1) * 2 + 1]); }
      const m = sx.length;
      if (m < 2) return;
      const L = (m - 1) * 0.5;
      const br = this.brush(R);
      const load = o.load * r.range(0.8, 1.25);
      const startFade = Math.min(R * 0.9, L * 0.4), endFade = Math.min(R * 1.1, L * 0.45);
      const step = 0.6;
      this.nt = 0;
      for (let i = 0; i < m; i++) {
        const ia = Math.max(0, i - 2), ib = Math.min(m - 1, i + 2);
        let tx = sx[ib] - sx[ia], ty = sy[ib] - sy[ia];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;
        const s = i * 0.5, t = s / L;
        // a flat brush pressed a little harder in the middle of its travel
        const ends = P.smooth(0, startFade, s) * P.smooth(0, endFade, L - s);
        const hw = R * (0.82 + 0.18 * Math.sin(Math.PI * Math.min(1, t * 1.2))) * (0.3 + 0.7 * Math.sqrt(ends));
        // remaining paint on the brush, 1 → 0 along the stroke
        const paint = 1 - s / (L * load);
        for (let off = -hw; off <= hw; off += step) {
          const u = off / hw;
          const b = Math.min(NB - 1, ((u + 1) * 0.5 * NB) | 0);
          const edge = 1 - P.smooth(0.78, 1.0, Math.abs(u));
          const dryF = P.smooth(br.dry[b] * 0.55 - 0.12, br.dry[b] * 0.55 + 0.08, paint);
          const a = br.prof[b] * edge * ends * dryF;
          if (a <= 0.01) continue;
          const px = (sx[i] + nx * off + 0.5) | 0, py = (sy[i] + ny * off + 0.5) | 0;
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          const idx = py * w + px;
          if (a > cov[idx]) {
            if (cov[idx] === 0) touched[this.nt++] = idx;
            cov[idx] = a; cB[idx] = b; cS[idx] = t;
          }
        }
      }
      // lay the paint down
      const { col, hgt } = this;
      const op = o.opacity;
      const pick = o.pickup;
      const L0 = lum(color[0], color[1], color[2]);
      const thick = o.thick * (0.6 + 0.6 * L0);
      for (let k = 0; k < this.nt; k++) {
        const idx = touched[k];
        const a = cov[idx] * op;
        const b = cB[idx], t = cS[idx];
        const j = idx * 3;
        const v = 1 + br.cvar[b];
        // wet-into-wet: the brush carries some of what it passes over
        const pk = pick * t;
        const cr = color[0] * v * (1 - pk) + col[j] * pk;
        const cg = color[1] * v * (1 - pk) + col[j + 1] * pk;
        const cb = color[2] * v * (1 - pk) + col[j + 2] * pk;
        col[j] += (cr - col[j]) * a;
        col[j + 1] += (cg - col[j + 1]) * a;
        col[j + 2] += (cb - col[j + 2]) * a;
        const u = (b + 0.5) / NB * 2 - 1;
        const ridge = 0.45 + 0.85 * br.groove[b] + 0.45 * P.smooth(0.6, 0.95, Math.abs(u));
        const blob = 1 + 0.3 * Math.exp(-t * 6);
        const hn = thick * ridge * blob * (0.5 + 0.5 * cov[idx]);
        hgt[idx] += (hgt[idx] * 0.2 + hn - hgt[idx]) * a;
        cov[idx] = 0;
      }
    }

    // one Hertzmann layer: brush radius R over reference `ref`
    *layer(ref, R, o) {
      const { w, h, col } = this;
      const r = this.rng;
      const blurred = P.boxBlur(ref, w, h, 3, R * (o.blur ?? 0.5), 2);
      yield;
      const fld = this.field(blurred, R, o.guide, o.guideW ?? 1);
      yield;
      let coarse = null;
      if (o.detail) { coarse = P.boxBlur(ref, w, h, 3, R * 2.5, 2); yield; }
      const { ang, dw } = fld;
      const grid = Math.max(2, Math.round(R * (o.grid ?? 1)));
      const cells = [];
      for (let y = 0; y < h; y += grid) for (let x = 0; x < w; x += grid) cells.push([x, y]);
      r.shuffle(cells);
      const T = o.threshold ?? 0.05;
      const maxLen = o.maxLen ?? 10, minLen = o.minLen ?? 3;
      const fc = o.curve ?? 0.6;
      const jitterV = o.jitterV ?? 0.04, jitterC = o.jitterC ?? 0.02;
      let count = 0;
      for (const [cx, cy] of cells) {
        // where in this cell is the canvas furthest from the reference?
        let err = 0, best = -1, bx = cx, by = cy, nS = 0;
        const x1 = Math.min(w, cx + grid), y1 = Math.min(h, cy + grid);
        for (let y = cy; y < y1; y += 2) for (let x = cx; x < x1; x += 2) {
          const i = (y * w + x) * 3;
          const d = Math.abs(col[i] - blurred[i]) + Math.abs(col[i + 1] - blurred[i + 1]) + Math.abs(col[i + 2] - blurred[i + 2]);
          err += d; nS++;
          if (d > best) { best = d; bx = x; by = y; }
        }
        err /= nS;
        if (!o.first && err < T) continue;
        if (coarse) {
          let dsum = 0, nd = 0;
          for (let y = cy; y < y1; y += 3) for (let x = cx; x < x1; x += 3) {
            const i = (y * w + x) * 3;
            dsum += Math.abs(blurred[i] - coarse[i]) + Math.abs(blurred[i + 1] - coarse[i + 1]) + Math.abs(blurred[i + 2] - coarse[i + 2]);
            nd++;
          }
          if (dsum / nd < o.detail) continue;
        }
        if (o.mask && !o.mask(bx, by)) continue;
        // the paint picked up for this stroke, as a painter's eye would vary it
        const i0 = (by * w + bx) * 3;
        const vj = 1 + r.gauss(0, jitterV);
        const color = [
          Math.max(0, blurred[i0] * vj + r.gauss(0, jitterC)),
          Math.max(0, blurred[i0 + 1] * vj + r.gauss(0, jitterC)),
          Math.max(0, blurred[i0 + 2] * vj + r.gauss(0, jitterC)),
        ];
        // grow the stroke along the field
        const pts = [bx, by];
        let x = bx, y = by, ldx = 0, ldy = 0;
        const sign = r() < 0.5 ? 1 : -1;
        const lenCap = o.lenAt ? Math.max(minLen, Math.round(maxLen * o.lenAt(bx, by))) : maxLen;
        const reg0 = o.regionOf ? o.regionOf(bx, by) : 0;
        for (let s = 1; s <= lenCap; s++) {
          const ix = x | 0, iy = y | 0;
          const j = (iy * w + ix) * 3;
          if (s > minLen && !o.noStop) {
            const dRef = Math.abs(blurred[j] - col[j]) + Math.abs(blurred[j + 1] - col[j + 1]) + Math.abs(blurred[j + 2] - col[j + 2]);
            const dCol = Math.abs(blurred[j] - color[0]) + Math.abs(blurred[j + 1] - color[1]) + Math.abs(blurred[j + 2] - color[2]);
            if (dRef < dCol) break;
          }
          const a = ang[(iy >> 1) * dw + (ix >> 1)];
          let dx = Math.cos(a) * sign, dy = Math.sin(a) * sign;
          if (s > 1) {
            if (dx * ldx + dy * ldy < 0) { dx = -dx; dy = -dy; }
            dx = fc * dx + (1 - fc) * ldx; dy = fc * dy + (1 - fc) * ldy;
            const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          }
          const stepLen = R * (o.step ?? 1);
          x += dx * stepLen; y += dy * stepLen;
          if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) { pts.push(x, y); break; }
          if (o.regionOf && o.regionOf(x | 0, y | 0) !== reg0) break;
          pts.push(x, y);
          ldx = dx; ldy = dy;
        }
        if (pts.length === 2) {
          const a = ang[(by >> 1) * dw + (bx >> 1)];
          const dx = Math.cos(a) * R * 0.6, dy = Math.sin(a) * R * 0.6;
          pts.length = 0;
          pts.push(bx - dx, by - dy, bx + dx, by + dy);
        }
        const Rj = R * r.range(0.72, 1.15);
        this.stroke(pts, Rj, color, {
          opacity: o.opacity ?? 0.92,
          pickup: o.pickup ?? 0.25,
          load: o.load ?? 1.6,
          thick: o.thick ?? 1.0,
        });
        if (++count % (R > 20 ? 6 : 40) === 0) yield;
      }
    }

    // relight the relief and return finished sRGB floats
    finish(o = {}) {
      const { w, h, col, hgt } = this;
      const H = P.boxBlur(hgt, w, h, 1, o.soften ?? 1.2, 2);
      const out = new Float32Array(w * h * 3);
      const k = o.relief ?? 1.6;
      let Lx = -0.42, Ly = -0.58, Lz = 0.70;
      const ll = Math.hypot(Lx, Ly, Lz); Lx /= ll; Ly /= ll; Lz /= ll;
      let Hx = Lx, Hy = Ly, Hz = Lz + 1;
      const hl = Math.hypot(Hx, Hy, Hz); Hx /= hl; Hy /= hl; Hz /= hl;
      const shadeK = o.shade ?? 0.55, specK = o.spec ?? 0.10;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const gx = H[y * w + Math.min(w - 1, x + 1)] - H[y * w + Math.max(0, x - 1)];
          const gy = H[Math.min(h - 1, y + 1) * w + x] - H[Math.max(0, y - 1) * w + x];
          let nx = -gx * k, ny = -gy * k, nz = 1;
          const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          const ndl = nx * Lx + ny * Ly + nz * Lz;
          const shade = 1 + (ndl / Lz - 1) * shadeK;
          const ndh = Math.max(0, nx * Hx + ny * Hy + nz * Hz);
          const sp = Math.pow(ndh, 48) * specK;
          const j = i * 3;
          out[j] = col[j] * shade + sp;
          out[j + 1] = col[j + 1] * shade + sp * 0.98;
          out[j + 2] = col[j + 2] * shade + sp * 0.92;
        }
      }
      return out;
    }

    // quick preview of the wet canvas (no relief lighting)
    show(ctx) {
      const { w, h, col } = this;
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let i = 0, j = 0; i < w * h; i++, j += 3) {
        d[i * 4] = col[j] * 255; d[i * 4 + 1] = col[j + 1] * 255; d[i * 4 + 2] = col[j + 2] * 255; d[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
  }

  // write gamma-encoded floats to the canvas with a touch of dither
  P.showSRGB = function (ctx, data, w, h) {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    let seed = 7;
    for (let i = 0, j = 0; i < w * h; i++, j += 3) {
      for (let c = 0; c < 3; c++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        d[i * 4 + c] = data[j + c] * 255 + ((seed >>> 8) / 16777216 - 0.5);
      }
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };

  P.Oil = Oil;
})();

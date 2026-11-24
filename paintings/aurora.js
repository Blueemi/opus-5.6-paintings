// The Sky Over Ravnvatn — a winter night on a northern lake. The aurora is marched
// through stacked altitude layers so its curtains fold in perspective and fade from
// green at the foot to violet at the crown; stars and the Milky Way sit behind it.
// Snowy mountains and the near shore are raymarched and lit by the aurora's own
// light, the lake mirrors everything, and a forest and one lit cabin are painted in.
(async function () {
  const W = 2400, H = 1600;
  const cv = P.canvas(W, H);
  const w = cv.width, h = cv.height;
  const ctx = cv.getContext('2d');
  const seed = P.seed || 'ravnvatn';
  const rng = P.rng(seed);
  const off = P.seed ? [rng.range(-30, 30), rng.range(-30, 30)] : [0, 0];

  const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uJitter;
uniform float uPass;
uniform float uPasses;
uniform vec2 uOff;
out vec4 fragColor;

const float WATER = 0.0;
float spow(float x, float y) { return x <= 1e-7 ? 0.0 : pow(x, y); }

uint pcg(uint v) { uint st = v * 747796405u + 2891336453u; uint w = ((st >> ((st >> 28u) + 4u)) ^ st) * 277803737u; return (w >> 22u) ^ w; }
float rand3(vec3 p) { uvec3 u = uvec3(ivec3(floor(p))); return float(pcg(u.x + pcg(u.y + pcg(u.z)))) / 4294967295.0; }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float hash(vec2 p) { p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113)); return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y)); }
vec3 noised(vec2 x) {
  vec2 p = floor(x), w = fract(x);
  vec2 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
  float a = hash(p), b = hash(p + vec2(1, 0)), c = hash(p + vec2(0, 1)), d = hash(p + vec2(1, 1));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
float vnoise(vec2 x) { return noised(x).x; }
const mat2 M2 = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p, int oct) {
  float a = 0.0, b = 0.5;
  for (int i = 0; i < 10; i++) { if (i >= oct) break; a += b * vnoise(p); b *= 0.5; p = M2 * p * 2.03; }
  return a;
}
float eroded(vec2 p, int oct) {
  float a = 0.0, b = 1.0;
  vec2 d = vec2(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= oct) break;
    vec3 n = noised(p);
    d += n.yz;
    a += b * n.x / (1.0 + dot(d, d));
    b *= 0.5;
    p = M2 * p * 2.0;
  }
  return a;
}

// ---------- land ----------
// boulders standing in the shallows, a few metres from where we stand
float boulders(vec2 xz) {
  if (xz.y > 95.0 || xz.y < 6.0) return -10.0;
  vec2 g = xz / 11.0;
  vec2 id = floor(g);
  float h = -10.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = id + vec2(float(i), float(j));
    vec2 r = hash22(c + 7.0);
    float keep = 0.07 + 0.16 * smoothstep(70.0, 18.0, c.y * 11.0) * smoothstep(0.0, 25.0, abs(c.x * 11.0 + 10.0));
    if (r.x > keep) continue;
    vec2 center = (c + 0.2 + 0.6 * hash22(c + 3.1)) * 11.0;
    float rad = 1.3 + 3.2 * r.y * r.y;
    vec2 d = (xz - center) * vec2(1.0, 0.85);
    float q = rad * rad - dot(d, d);
    if (q > 0.0) h = max(h, sqrt(q) * (0.6 + 0.5 * r.y) - 0.35 * rad + 0.5 + 0.35 * vnoise(xz * 0.9 + c) + 0.12 * vnoise(xz * 3.0));
  }
  return h;
}

float terrain(vec2 xz, int oct) {
  vec2 p = xz / 1700.0 + uOff + vec2(4.2, 1.3);
  float e = eroded(p, oct);
  float far = smoothstep(1200.0, 2600.0, xz.y);
  float big = exp(-pow((xz.x - 1100.0) / 1600.0, 2.0)) + 0.6 * exp(-pow((xz.x + 2600.0) / 1200.0, 2.0));
  float mount = far * spow(clamp(e * 0.5 + 0.55, 0.0, 2.0), 2.3) * (800.0 + 1700.0 * big);
  // the far shore: a low, wooded rise
  float sh = vnoise(vec2(xz.x / 600.0, 3.0));
  float shore = smoothstep(820.0, 1100.0, xz.y + 200.0 * sh) * (8.0 + 30.0 + 50.0 * (0.5 + 0.5 * vnoise(xz / 260.0)));
  float bed = -5.0 + 2.0 * vnoise(xz / 90.0);
  return max(bed + shore + mount, boulders(xz));
}
float terrainM(vec2 xz) { return terrain(xz, 8); }

vec3 terrainNormal(vec3 p, float t) {
  float e = max(0.02, 0.0006 * t);
  int oct = int(clamp(16.0 - log2(1.0 + t / 300.0) * 1.7, 8.0, 15.0));
  float h0 = terrain(p.xz, oct);
  return normalize(vec3(h0 - terrain(p.xz + vec2(e, 0), oct), e, h0 - terrain(p.xz + vec2(0, e), oct)));
}

float marchTerrain(vec3 ro, vec3 rd, float tmax) {
  float t = 0.3;
  for (int i = 0; i < 500; i++) {
    vec3 p = ro + rd * t;
    float h = p.y - terrainM(p.xz);
    if (abs(h) < 0.0006 * t || t > tmax) break;
    if (p.y > 3200.0 && rd.y > 0.0) return tmax + 1.0;
    t += 0.35 * h;
    if (t < 0.3) t = 0.3;
  }
  return t;
}

// ---------- sky ----------
float starLayer(vec3 rd, float scale, float thresh) {
  vec2 sp = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, -1.0, 1.0))) * scale;
  vec2 id = floor(sp), f = fract(sp);
  float hsh = hash12(id + 17.0);
  if (hsh < thresh) return 0.0;
  vec2 c = hash22(id) * 0.7 + 0.15;
  float d = length(f - c);
  float bright = pow((hsh - thresh) / (1.0 - thresh), 3.0);
  return bright * exp(-d * d * 900.0 / (1.0 + bright * 3.0));
}

vec3 milkyWay(vec3 rd) {
  vec3 n = normalize(vec3(0.62, 0.35, -0.70));
  float d = dot(rd, n);
  float band = exp(-d * d / 0.035);
  vec2 q = vec2(atan(rd.z, rd.x) * 3.0, rd.y * 6.0);
  float dust = smoothstep(0.35, 0.75, fbm(q * 2.2 + 4.0, 6));
  float glow = fbm(q * 1.3 + 1.0, 5);
  vec3 c = vec3(0.55, 0.58, 0.75) * band * (0.4 + 0.8 * glow) * (1.0 - 0.75 * dust * exp(-d * d / 0.01));
  return c * 0.055;
}

// one curtain: distance from a folded line in the ground plane
float curtain(vec2 q, float z0, float slope, float amp, float fold, float ph) {
  float warp = fbm(q * vec2(0.0004, 0.0007) + vec2(ph, 1.0), 4) - 0.5;
  float zc = z0 + slope * q.x + amp * sin(q.x * fold + ph + 2.5 * warp) + 1400.0 * warp;
  return q.y - zc;
}

vec3 aurora(vec3 ro, vec3 rd) {
  if (rd.y <= 0.0) return vec3(0.0);
  vec3 acc = vec3(0.0);
  const int N = 72;
  float jit = rand3(vec3(gl_FragCoord.xy, 11.0 + uPass));
  for (int i = 0; i < N; i++) {
    float fi = (float(i) + jit) / float(N);
    float alt = 2200.0 + fi * fi * 7000.0;
    float t = (alt - ro.y) / rd.y;
    if (t > 90000.0) break;
    vec2 q = (ro + rd * t).xz;
    // two folded curtains; the main one sweeps nearer toward the right
    float s1 = curtain(q, 8200.0, -0.45, 1700.0, 0.00062, 0.7);
    float s2 = curtain(q + vec2(3000.0, 0.0), 17000.0, -0.15, 2600.0, 0.00045, 2.9);
    float w1 = 260.0 + 520.0 * fi, w2 = 520.0 + 900.0 * fi;
    float b1 = exp(-s1 * s1 / (w1 * w1)), b2 = exp(-s2 * s2 / (w2 * w2)) * 0.6;
    // rays: fine vertical striations running along each curtain
    float r1 = fbm(vec2(q.x * 0.006 + q.y * 0.002, 0.0), 4);
    float r2 = fbm(vec2(q.x * 0.004 + q.y * 0.0015, 5.0), 4);
    float rays1 = 0.25 + 1.6 * spow(clamp(r1 + 0.15, 0.0, 1.0), 2.0);
    float rays2 = 0.25 + 1.6 * spow(clamp(r2 + 0.15, 0.0, 1.0), 2.0);
    // the lower edge is sharp and brightest, the crown fades and reddens
    float prof = smoothstep(0.0, 0.05, fi) * exp(-fi * 3.2);
    float crown = smoothstep(0.25, 0.9, fi);
    vec3 green = vec3(0.12, 1.0, 0.42);
    vec3 col = mix(green, vec3(0.55, 0.20, 0.95), crown);
    col = mix(col, vec3(1.0, 0.25, 0.45), smoothstep(0.03, 0.0, fi - 0.02) * 0.35);
    float dens = b1 * rays1 + b2 * rays2;
    // a brighter, wind-blown patch near the fold on the left
    dens *= 0.75 + 0.6 * smoothstep(0.3, 0.8, fbm(q * 0.00012 + 3.0, 3));
    acc += col * dens * prof;
  }
  return acc * (2.6 / float(N)) * 3.2;
}

vec3 sky(vec3 rd) {
  float y = max(rd.y, 0.0);
  vec3 c = mix(vec3(0.020, 0.035, 0.060), vec3(0.004, 0.008, 0.022), smoothstep(0.0, 0.6, y));
  // green airglow just above the horizon
  c += vec3(0.010, 0.030, 0.018) * exp(-y * 14.0);
  c += milkyWay(rd);
  float st = starLayer(rd, 260.0, 0.93) + starLayer(rd, 520.0, 0.955) * 0.6 + starLayer(rd, 1100.0, 0.975) * 0.4;
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), hash12(floor(rd.xz * 900.0)));
  c += tint * st * 0.9 * smoothstep(0.0, 0.08, y);
  c += aurora(vec3(0.0, 4.0, 0.0), rd);
  return c;
}

// ---------- shading ----------
vec3 shadeLand(vec3 p, vec3 rd, float t) {
  vec3 n = terrainNormal(p, t);
  float slope = n.y;
  float r1 = fbm(p.xz / 30.0, 4);
  vec3 rock = vec3(0.05, 0.05, 0.055) * (0.6 + 0.8 * r1);
  vec3 snow = vec3(0.82, 0.86, 0.92);
  float snowAmt = t < 300.0 ? smoothstep(0.72, 0.9, slope + 0.1 * vnoise(p.xz * 2.0)) * 0.9 : smoothstep(0.50, 0.75, slope + 0.15 * r1);
  vec3 alb = mix(rock, snow, snowAmt);
  // dark spruce forest on the lower slopes of the far mountains
  float forest = (1.0 - smoothstep(170.0, 330.0, p.y + 120.0 * r1)) * smoothstep(-1.0, 1.0, p.y) * step(300.0, t) * smoothstep(0.40, 0.70, slope);
  alb = mix(alb, vec3(0.012, 0.018, 0.017) * (0.6 + 0.8 * vnoise(p.xz / 7.0)), forest * 0.98);
  // light: the aurora ahead and above, a faint starlit sky everywhere
  vec3 aDir = normalize(vec3(0.15, 0.75, 0.65));
  float aL = clamp(dot(n, aDir) * 0.75 + 0.25, 0.0, 1.0);
  vec3 lin = vec3(0.045, 0.30, 0.15) * aL * 0.30;
  lin += vec3(0.016, 0.024, 0.050) * (0.5 + 0.5 * n.y);
  vec3 col = alb * lin;
  // snow glints
  col += snowAmt * vec3(0.05, 0.3, 0.15) * 0.08 * spow(clamp(dot(reflect(rd, n), aDir), 0.0, 1.0), 20.0);
  // haze
  float fog = 1.0 - exp(-t * 0.00006);
  col = mix(col, vec3(0.012, 0.03, 0.03), fog * 0.8);
  return col;
}

vec3 trace(vec3 ro, vec3 rd, out float mat, out float tHit) {
  float tmax = 30000.0;
  float t = marchTerrain(ro, rd, tmax);
  float tw = rd.y < 0.0 ? (WATER - ro.y) / rd.y : 1e9;
  if (tw < t && tw < tmax) {
    mat = 2.0; tHit = tw;
    return vec3(0.0);
  }
  if (t < tmax) {
    mat = t < 300.0 ? 3.0 : 1.0; tHit = t;
    return shadeLand(ro + rd * t, rd, t);
  }
  mat = 0.0; tHit = 1e9;
  return sky(rd);
}

void main() {
  vec2 fc = gl_FragCoord.xy + uJitter;
  vec2 uv = (2.0 * fc - uRes) / uRes.y;
  vec3 ro = vec3(0.0, 4.6, 0.0);
  vec3 ta = vec3(-60.0, 4.6 + 170.0, 1000.0);
  vec3 cw = normalize(ta - ro);
  vec3 cu = normalize(cross(vec3(0.0, 1.0, 0.0), cw));
  vec3 cvv = cross(cw, cu);
  vec3 rd = normalize(uv.x * cu + uv.y * cvv + 1.55 * cw);

  float mat, tHit;
  vec3 col = trace(ro, rd, mat, tHit);
  if (mat == 2.0) {
    vec3 p = ro + rd * tHit;
    // still water; a slow swell stretches the reflection
    float near = exp(-tHit / 300.0);
    float e = 0.5;
    vec2 q = p.xz * vec2(1.0, 3.0);
    float n0 = fbm(q / 14.0, 4), nx = fbm((q + vec2(e, 0.0)) / 14.0, 4), nz = fbm((q + vec2(0.0, e)) / 14.0, 4);
    vec3 nrm = normalize(vec3((n0 - nx) / e * 0.025 * (0.3 + near), 1.0, (n0 - nz) / e * 0.06 * (0.3 + near)));
    float h2 = (uPass + rand3(vec3(gl_FragCoord.xy, uPass + 5.0))) / max(uPasses, 1.0) - 0.5;
    nrm = normalize(nrm + vec3(0.0, 0.0, h2 * 0.006));
    vec3 rr = reflect(rd, nrm);
    float m2, t2;
    vec3 refl = trace(p + vec3(0.0, 0.05, 0.0), rr, m2, t2);
    float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(nrm, -rd), 0.0, 1.0), 5.0);
    col = mix(vec3(0.002, 0.004, 0.006), refl, mix(0.25, 1.0, fres));
  }
  fragColor = vec4(col, mat);
}`;

  const t0 = performance.now();
  const passes = P.params.get('passes') ? parseInt(P.params.get('passes')) : (P.scale < 1 ? 1 : 8);
  const hdr4 = await P.glRender({ frag: FRAG, width: w, height: h, passes, tile: 200, channels: 4, uniforms: { uOff: off, uPasses: passes }, label: 'starlight' });
  console.log('gl', ((performance.now() - t0) / 1000).toFixed(1) + 's');

  const N = w * h;
  const hdr = new Float32Array(N * 3);
  const mat = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    hdr[i * 3] = hdr4[i * 4]; hdr[i * 3 + 1] = hdr4[i * 4 + 1]; hdr[i * 3 + 2] = hdr4[i * 4 + 2];
    mat[i] = hdr4[i * 4 + 3];
  }

  // ---------- painted-in forest and cabin on the far shore ----------
  // find the far shoreline: first row, per column, where far land gives way to water
  const shoreY = new Float32Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = Math.floor(h * 0.3); y < h - 1; y++) {
      const m = mat[y * w + x], m2 = mat[(y + 1) * w + x];
      if (m > 0.5 && m < 1.5 && m2 > 1.5 && m2 < 2.5) { shoreY[x] = y + 1; break; }
    }
  }
  for (let x = 1; x < w; x++) if (shoreY[x] < 0) shoreY[x] = shoreY[x - 1];
  for (let x = w - 2; x >= 0; x--) if (shoreY[x] < 0) shoreY[x] = shoreY[x + 1];
  const shoreS = shoreY.slice();
  for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let k = -6; k <= 6; k++) { const xx = Math.min(w - 1, Math.max(0, x + k)); s += shoreY[xx]; n++; }
    shoreS[x] = s / n;
  }

  // forest silhouettes drawn into a mask, then composited with their reflection
  const tree = document.createElement('canvas');
  tree.width = w; tree.height = h;
  const tctx = tree.getContext('2d');
  tctx.fillStyle = '#000';
  const S = P.scale;
  const fr = P.rng(seed + 'forest');
  function spruce(x, base, ht) {
    const tiers = Math.max(5, Math.round(ht / (3.2 * S)));
    tctx.beginPath();
    tctx.moveTo(x, base - ht);
    const pts = [];
    for (let i = 1; i <= tiers; i++) {
      const t = i / tiers;
      const wdt = ht * 0.2 * Math.pow(t, 0.9) * fr.range(0.75, 1.2);
      const y = base - ht + ht * t * 0.94;
      pts.push([x + wdt, y + fr.range(0, 1.2) * S, x + wdt * 0.35, y + ht * 0.03]);
    }
    for (const p of pts) { tctx.lineTo(p[0], p[1]); tctx.lineTo(p[2], p[3]); }
    tctx.lineTo(x + ht * 0.03, base); tctx.lineTo(x - ht * 0.03, base);
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      tctx.lineTo(x - (p[2] - x), p[3]); tctx.lineTo(x - (p[0] - x), p[1] + fr.range(-0.8, 0.8) * S);
    }
    tctx.closePath();
    tctx.fill();
  }
  // a dense band of spruce along the far shore, thinning to the right
  for (let x = 0; x < w; x += fr.range(2.5, 6) * S) {
    const base = shoreS[Math.min(w - 1, Math.round(x))] - fr.range(0, 3) * S;
    const dens = 1 - P.smooth(0.55, 0.95, x / w) * 0.75;
    if (fr() > dens) continue;
    const ht = fr.range(12, 30) * S * (1 + 0.5 * Math.exp(-Math.pow((x / w - 0.18) / 0.12, 2)));
    spruce(x, base + 2 * S, ht);
  }
  // further rows climbing the wooded slope behind the shore, smaller with distance
  for (let row = 1; row <= 9; row++) {
    for (let x = 0; x < w; x += fr.range(3, 7) * S) {
      const xi = Math.min(w - 1, Math.round(x));
      const base = shoreS[xi] - row * fr.range(3.2, 5.0) * S;
      const yi = Math.round(base);
      if (yi < 0 || mat[yi * w + xi] < 0.5 || mat[yi * w + xi] > 1.5) continue;
      if (fr() > 0.85 - row * 0.04) continue;
      spruce(x, base, fr.range(9, 22) * S * (1 - row * 0.05));
    }
  }
  const tmask = tctx.getImageData(0, 0, w, h).data;

  // the cabin: a dark box, a snowed roof, and one warm window
  const cabX = Math.round(w * 0.255), cabBase = Math.round(shoreS[Math.round(w * 0.255)] + 1 * S);
  const cabW = 40 * S, cabH = 20 * S, roofH = 14 * S;
  const cabin = new Float32Array(N * 3), cabA = new Float32Array(N);
  for (let y = cabBase - cabH - roofH - 2; y <= cabBase; y++) for (let x = cabX - cabW; x <= cabX + cabW; x++) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x, dx = x - cabX, dy = cabBase - y;
    let a = 0, c = [0.006, 0.006, 0.008];
    if (Math.abs(dx) < cabW * 0.55 && dy < cabH) { a = 1; }
    const roofY = cabH + roofH * (1 - Math.abs(dx) / (cabW * 0.78));
    if (dy >= cabH - 1 && dy < roofY && Math.abs(dx) < cabW * 0.78) { a = 1; c = dy > roofY - 3 * S ? [0.035, 0.07, 0.065] : [0.012, 0.02, 0.02]; }
    // the window
    if (dx > -cabW * 0.28 && dx < -cabW * 0.05 && dy > cabH * 0.3 && dy < cabH * 0.75) { a = 1; c = [2.4, 1.05, 0.32]; }
    if (a) { cabin[i * 3] = c[0]; cabin[i * 3 + 1] = c[1]; cabin[i * 3 + 2] = c[2]; cabA[i] = a; }
  }

  const treeCol = [0.0035, 0.006, 0.006];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let a = tmask[i * 4 + 3] / 255;
      let c = treeCol;
      if (cabA[i] > 0) { a = 1; c = [cabin[i * 3], cabin[i * 3 + 1], cabin[i * 3 + 2]]; }
      if (a > 0) {
        // faint aurora light catching the snow on the tops of the trees
        hdr[i * 3] = hdr[i * 3] * (1 - a) + c[0] * a;
        hdr[i * 3 + 1] = hdr[i * 3 + 1] * (1 - a) + c[1] * a;
        hdr[i * 3 + 2] = hdr[i * 3 + 2] * (1 - a) + c[2] * a;
      }
      // reflection in the water below the shoreline
      const sy = shoreS[x];
      if (y > sy && mat[i] > 1.5 && mat[i] < 2.5) {
        const ry = Math.round(2 * sy - y + Math.sin(y * 0.9 + x * 0.05) * 1.2 * S);
        if (ry >= 0 && ry < h) {
          const j = ry * w + x;
          let ra = tmask[j * 4 + 3] / 255, rc = treeCol;
          if (cabA[j] > 0) { ra = 1; rc = [cabin[j * 3] * 0.6, cabin[j * 3 + 1] * 0.6, cabin[j * 3 + 2] * 0.6]; }
          ra *= 0.92;
          if (ra > 0) {
            hdr[i * 3] = hdr[i * 3] * (1 - ra) + rc[0] * ra;
            hdr[i * 3 + 1] = hdr[i * 3 + 1] * (1 - ra) + rc[1] * ra;
            hdr[i * 3 + 2] = hdr[i * 3 + 2] * (1 - ra) + rc[2] * ra;
          }
        }
      }
    }
  }
  // the window's light trembles down the water
  const wx = cabX - cabW * 0.16, wy = cabBase - cabH * 0.5;
  for (let y = Math.round(shoreS[Math.round(wx)]); y < Math.min(h, shoreS[Math.round(wx)] + 140 * S); y++) {
    const dy = y - shoreS[Math.round(wx)];
    for (let x = Math.round(wx - 14 * S); x < wx + 14 * S; x++) {
      const i = y * w + x;
      if (mat[i] < 1.5 || mat[i] > 2.5) continue;
      const brk = 0.5 + 0.5 * Math.sin(y * 1.3 * (1 / S) + Math.sin(y * 0.21) * 3);
      const g = Math.exp(-Math.pow((x - wx) / (3 * S + dy * 0.05), 2)) * Math.exp(-dy / (55 * S)) * brk;
      hdr[i * 3] += 0.55 * g; hdr[i * 3 + 1] += 0.24 * g; hdr[i * 3 + 2] += 0.07 * g;
    }
  }

  // ---------- post ----------
  const bright = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) bright[i] = Math.max(0, hdr[i] - 0.25);
  const bloomW = P.boxBlur(bright, w, h, 3, 60 * S, 3);
  const bloomN = P.boxBlur(bright, w, h, 3, 8 * S, 3);
  const out = new Float32Array(N * 3);
  const grain = P.rng(seed + 'grain');
  const exposure = 1.6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    const u = x / w - 0.5, v = y / h - 0.5;
    const vig = 1 - 0.5 * Math.pow(u * u * 1.2 + v * v * 1.5, 1.2);
    let r = (hdr[i] + bloomW[i] * 0.35 + bloomN[i] * 0.25) * exposure * vig;
    let g = (hdr[i + 1] + bloomW[i + 1] * 0.35 + bloomN[i + 1] * 0.25) * exposure * vig;
    let b = (hdr[i + 2] + bloomW[i + 2] * 0.35 + bloomN[i + 2] * 0.25) * exposure * vig;
    r = P.aces(r); g = P.aces(g); b = P.aces(b);
    const gn = (grain() + grain() + grain() - 1.5) * 0.010;
    out[i] = r + gn; out[i + 1] = g + gn; out[i + 2] = b + gn * 1.2;
  }
  ctx.putImageData(P.toImageData(ctx, out, w, h), 0, 0);
  P.done();
})();

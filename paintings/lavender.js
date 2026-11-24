// Lavender, Late Light — Provence an hour before sunset. A shader composes the
// motif (sky, a towering cumulus, the far Luberon hills, a farmhouse among
// cypresses, a lone oak and the converging rows), then the oil machine paints it
// in six passes from a broad lay-in to small loaded highlights, and the relief is lit.
(async function () {
  const W = 2400, H = 1600;
  const cv = P.canvas(W, H);
  const w = cv.width, h = cv.height;
  const ctx = cv.getContext('2d');
  const seed = P.seed || 'lavender';
  const rng = P.rng(seed);
  const s0 = P.seed ? [rng.range(0, 40), rng.range(0, 40)] : [3.1, 7.7];

  const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uJitter;
uniform vec2 uSeed;
out vec4 fragColor;

const float A = 1.5;
const float HOR = 0.565;
const vec2 VP = vec2(0.74, 0.565);
const vec2 SUN = vec2(1.13, 0.455);

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.0, b = 0.5;
  mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) { a += b * noise(p); p = m * p * 2.02 + 1.7; b *= 0.5; }
  return a;
}
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

// ---------- sky ----------
vec3 skyCol(vec2 p) {
  float t = clamp(p.y / HOR, 0.0, 1.0);
  vec3 c = mix(vec3(0.30, 0.47, 0.72), vec3(0.58, 0.70, 0.84), smoothstep(0.0, 0.55, t));
  c = mix(c, vec3(0.97, 0.86, 0.68), smoothstep(0.50, 0.95, t));
  c = mix(c, vec3(1.0, 0.80, 0.58), smoothstep(0.85, 1.0, t) * 0.6);
  float d = length((p - SUN) * vec2(1.0, 1.5));
  c += vec3(0.55, 0.32, 0.10) * exp(-d * 3.5) * 0.7;
  c = mix(c, vec3(1.0, 0.95, 0.82), exp(-d * 16.0) * 0.9);
  c = mix(c, vec3(1.0, 0.99, 0.94), smoothstep(0.032, 0.022, length(p - SUN)));
  return c;
}

// cumulus built from overlapping spheres: (x, y, z, r) in screen space, y down, z toward us
uniform vec4 uBlob[72];
uniform float uNBlob;
uniform vec4 uTree[28];
uniform float uNTree;
const float CBASE = 0.50;

// soft union of sphere heights (log-sum-exp) so billows flow into one another
float cloudZ(vec2 p, out float cover) {
  float sum = 0.0;
  const float k = 0.010;
  cover = -1.0;
  for (int i = 0; i < 72; i++) {
    if (float(i) >= uNBlob) break;
    vec4 b = uBlob[i];
    vec2 d = p - b.xy;
    float dd = dot(d, d);
    float q = b.w * b.w - dd;
    cover = max(cover, q / (b.w * b.w));
    float z = q > 0.0 ? b.z + sqrt(q) : b.z - (sqrt(dd) - b.w) * 2.0;
    sum += exp((z - 0.15) / k);
  }
  return k * log(max(sum, 1e-30)) + 0.15;
}

bool insideCloud(vec3 x) {
  for (int i = 0; i < 72; i++) {
    if (float(i) >= uNBlob) break;
    vec4 b = uBlob[i];
    vec3 d = x - b.xyz;
    if (dot(d, d) < b.w * b.w * 0.92) return true;
  }
  return false;
}

// low broken clouds near the sun, backlit
float lowCloud(vec2 p) {
  float band = exp(-pow((p.y - 0.43) / 0.035, 2.0)) * smoothstep(0.75, 1.0, p.x);
  float n = fbm(vec2(p.x * 5.0, p.y * 18.0) + uSeed * 0.7);
  return band * smoothstep(0.52, 0.68, n);
}

vec4 clouds(vec2 p) {
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (p.y < CBASE + 0.01) {
    float cover;
    float z = cloudZ(p, cover);
    // billowy edge: noise eats into the coverage
    float edgeN = fbm(p * 34.0 + uSeed) - 0.5;
    float cv = cover + edgeN * 0.35;
    if (cv > -0.05) {
      float e = 0.0025, c2;
      float zx = cloudZ(p + vec2(e, 0.0), c2), zy = cloudZ(p + vec2(0.0, e), c2);
      vec2 g = vec2(zx - z, zy - z) / e;
      g += vec2(fbm(p * 70.0) - 0.5, fbm(p * 70.0 + 4.0) - 0.5) * 0.45;
      vec3 n = normalize(vec3(-g, 1.0));
      vec3 P3 = vec3(p, z);
      // sun to the right, low, a little beyond the cloud
      vec3 L = normalize(vec3(0.90, -0.20, -0.25));
      float dif = clamp(dot(n, L) * 1.15, 0.0, 1.0);
      float sh = 1.0;
      for (int k = 1; k <= 6; k++) { if (insideCloud(P3 + L * 0.016 * float(k))) sh *= 0.62; }
      vec3 lit = vec3(1.0, 0.86, 0.66);
      vec3 shade = vec3(0.58, 0.60, 0.76);
      vec3 deep = vec3(0.44, 0.45, 0.62);
      col = mix(deep, shade, smoothstep(-0.4, 0.4, n.y * -1.0 + n.x * 0.3));
      col = mix(col, lit, smoothstep(0.05, 0.75, dif * sh));
      col = mix(col, vec3(1.0, 0.96, 0.86), smoothstep(0.75, 1.0, dif * sh) * 0.7);
      // warm bounce on the underside, haze toward the horizon
      col = mix(col, vec3(0.78, 0.62, 0.62), smoothstep(CBASE - 0.10, CBASE, p.y) * 0.45 * (1.0 - dif * sh));
      col = mix(col, vec3(0.95, 0.80, 0.70), smoothstep(CBASE - 0.14, CBASE, p.y) * 0.35);
      a = smoothstep(-0.05, 0.12, cv);
    }
  }
  float lc = lowCloud(p);
  if (lc > 0.0) {
    float e2 = lowCloud(p + normalize(SUN - p) * 0.01);
    vec3 c2 = mix(vec3(0.66, 0.50, 0.52), vec3(1.0, 0.84, 0.58), smoothstep(0.1, -0.2, e2 - lc));
    col = mix(col, c2, lc * (1.0 - a));
    a = max(a, lc * 0.9);
  }
  return vec4(col, a);
}

// ---------- the lone oak: foliage masses lit like the cloud ----------
float treeZ(vec2 p, out float cover) {
  float sum = 0.0;
  const float k = 0.004;
  cover = -1.0;
  for (int i = 0; i < 28; i++) {
    if (float(i) >= uNTree) break;
    vec4 b = uTree[i];
    vec2 d = p - b.xy;
    float dd = dot(d, d);
    float q = b.w * b.w - dd;
    cover = max(cover, q / (b.w * b.w));
    float z = q > 0.0 ? b.z + sqrt(q) : b.z - (sqrt(dd) - b.w) * 2.0;
    sum += exp((z - 0.05) / k);
  }
  return k * log(max(sum, 1e-30)) + 0.05;
}
vec4 tree(vec2 p) {
  vec2 base = vec2(0.42, HOR + 0.006);
  // trunk dividing into two limbs
  float ty = (base.y - p.y);
  float tx = p.x - base.x - ty * 0.05;
  float trunkW = mix(0.0042, 0.0026, clamp(ty / 0.06, 0.0, 1.0));
  float trunk = smoothstep(trunkW, trunkW * 0.5, abs(tx)) * step(0.0, ty) * step(ty, 0.07);
  float limb1 = smoothstep(0.0022, 0.001, abs(p.x - base.x - 0.002 + (ty - 0.032) * 0.9)) * step(0.032, ty) * step(ty, 0.07);
  float limb2 = smoothstep(0.0020, 0.001, abs(p.x - base.x - 0.004 - (ty - 0.036) * 1.0)) * step(0.036, ty) * step(ty, 0.07);
  float wood = max(trunk, max(limb1, limb2));
  float cover;
  float z = treeZ(p, cover);
  float leafN = fbm(p * 150.0);
  float cv = cover + (fbm(p * 60.0 + 3.0) - 0.5) * 0.9 + (leafN - 0.5) * 0.5;
  vec4 res = vec4(0.0);
  if (wood > 0.0) res = vec4(vec3(0.17, 0.13, 0.12), wood);
  if (cv > 0.0) {
    float e = 0.0015, c2;
    vec2 g = vec2(treeZ(p + vec2(e, 0.0), c2) - z, treeZ(p + vec2(0.0, e), c2) - z) / e;
    g += vec2(fbm(p * 220.0) - 0.5, fbm(p * 220.0 + 7.0) - 0.5) * 1.6;
    vec3 n = normalize(vec3(-g, 1.0));
    vec3 L = normalize(vec3(0.85, -0.35, -0.2));
    float dif = clamp(dot(n, L), 0.0, 1.0);
    vec3 c = mix(vec3(0.07, 0.10, 0.09), vec3(0.18, 0.22, 0.13), smoothstep(-0.3, 0.3, n.y * -1.0));
    c = mix(c, vec3(0.40, 0.42, 0.20), smoothstep(0.15, 0.7, dif));
    c = mix(c, vec3(0.86, 0.72, 0.40), smoothstep(0.65, 0.95, dif) * 0.8);
    // rim of light where the sun comes through the outer leaves
    float rim = smoothstep(0.35, 0.0, cv) * smoothstep(0.0, 0.5, dot(normalize(p - vec2(0.42, HOR - 0.08)), normalize(SUN - p)));
    c = mix(c, vec3(0.95, 0.80, 0.50), rim * 0.65);
    float a = smoothstep(0.0, 0.08, cv);
    res = vec4(mix(res.rgb * res.a, c, a), max(res.a, a));
  }
  return res;
}

// ---------- land ----------
float cypress(vec2 p, vec2 base, float hgt, float wid) {
  float t = (base.y - p.y) / hgt;
  if (t < 0.0 || t > 1.0) return 0.0;
  float r = wid * pow(1.0 - t, 0.55) * smoothstep(0.0, 0.08, t + 0.02) * (0.85 + 0.3 * noise(vec2(p.y * 200.0, base.x * 9.0)));
  return smoothstep(r, r * 0.6, abs(p.x - base.x));
}

// region: 0 open sky, 0.25 hills, 0.5-0.75 field (near = higher), 0.9 trees and house
vec3 land(vec2 p, out float region) {
  region = 0.0;
  vec3 col;
  // far hills
  float h1 = HOR - 0.040 - 0.060 * fbm(vec2(p.x * 1.6 + uSeed.x, 0.5)) * smoothstep(1.35, 0.4, p.x) + 0.008 * sin(p.x * 3.0);
  float h2 = HOR - 0.020 - 0.030 * fbm(vec2(p.x * 3.0 + uSeed.y, 2.5)) * smoothstep(1.5, 0.2, p.x);
  vec3 haze = vec3(0.86, 0.74, 0.72);
  if (p.y < HOR) {
    col = skyCol(p);
    if (p.y > h1) { col = mix(vec3(0.62, 0.60, 0.74), haze, 0.35 + 0.3 * smoothstep(h1, HOR, p.y)); region = 0.25; }
    if (p.y > h2) {
      col = mix(vec3(0.40, 0.42, 0.55), vec3(0.62, 0.56, 0.64), smoothstep(h2, HOR, p.y) * 0.6);
      col *= 0.9 + 0.2 * fbm(p * vec2(40.0, 90.0));
      region = 0.25;
    }
    // a treeline and hedges along the far edge of the field
    float tl = HOR - 0.010 - 0.012 * smoothstep(0.45, 0.75, fbm(vec2(p.x * 26.0, 3.0)));
    if (p.y > tl) { col = mix(vec3(0.24, 0.27, 0.28), vec3(0.45, 0.40, 0.42), 0.3); region = 0.25; }
  } else {
    // ---------- the field ----------
    float dy = p.y - HOR;
    float Z = 1.9 / dy;
    float X = (p.x - VP.x) * Z;
    float f = fract(X) - 0.5;
    float far = smoothstep(18.0, 120.0, Z);
    // each row is a line of separate rounded bushes
    float along = Z * 1.25 + noise(vec2(floor(X), 3.0)) * 7.0;
    float g = fract(along) - 0.5;
    float wdt = 0.36 + 0.06 * cos(6.2832 * g) + 0.03 * (noise(vec2(X * 3.0, Z * 6.0)) - 0.5);
    float mound = smoothstep(wdt + 0.06, wdt - 0.14, abs(f));
    // flower heads: vertical spikes in screen space, clustered per plant
    float plant = noise(vec2(X * 7.0, Z * 3.0));
    float spikes = noise(vec2(p.x * 900.0 / (1.0 + Z * 0.08), p.y * 120.0)) * 0.6 + 0.4 * plant;
    // light: sun ahead and to the right; tops and right flanks glow
    float lit = clamp(0.42 + 1.1 * f - 0.35 * g * (1.0 - smoothstep(8.0, 30.0, Z)) + 0.3 * (spikes - 0.5), 0.0, 1.0);
    vec3 lavDeep = vec3(0.24, 0.17, 0.42);
    vec3 lavMid = vec3(0.47, 0.34, 0.66);
    vec3 lavLit = vec3(0.74, 0.54, 0.80);
    vec3 lavGlow = vec3(1.0, 0.78, 0.66);
    vec3 lav = mix(lavDeep, lavMid, smoothstep(0.0, 0.5, lit));
    lav = mix(lav, lavLit, smoothstep(0.45, 0.95, lit));
    lav = mix(lav, lavGlow, smoothstep(0.72, 1.0, lit) * smoothstep(0.45, 0.9, spikes) * 0.85);
    // silvery green leaves show through low in the plant
    lav = mix(lav, vec3(0.36, 0.42, 0.34), smoothstep(0.18, 0.40, abs(f)) * 0.5 * (1.0 - far));
    vec3 soilLit = vec3(0.74, 0.55, 0.38), soilSh = vec3(0.36, 0.26, 0.24);
    vec3 soil = mix(soilSh, soilLit, clamp(0.45 + 0.6 * f + 0.3 * noise(vec2(X * 30.0, Z * 8.0)), 0.0, 1.0));
    soil = mix(soil, vec3(0.42, 0.48, 0.26), smoothstep(0.6, 0.8, noise(vec2(X * 12.0, Z * 2.0))) * 0.5);
    col = mix(soil, lav, mound);
    // far rows melt into a warm violet haze
    vec3 farCol = mix(vec3(0.52, 0.40, 0.62), vec3(0.78, 0.60, 0.68), smoothstep(0.2, 0.9, fbm(vec2(p.x * 6.0, p.y * 40.0))));
    col = mix(col, farCol, far);
    col = mix(col, haze * vec3(0.95, 0.85, 0.9), smoothstep(40.0, 260.0, Z) * 0.55);
    // a scatter of poppies in the near furrows
    float pop = smoothstep(0.82, 0.9, noise(vec2(X * 9.0, Z * 5.0) + 3.0)) * (1.0 - mound) * (1.0 - far) * smoothstep(0.30, 0.5, abs(f));
    col = mix(col, vec3(0.86, 0.22, 0.16), pop * 0.9);
    region = 0.5 + 0.25 * (1.0 - far);
  }

  // ---------- farmhouse and cypresses ----------
  vec2 hb = vec2(0.99, HOR + 0.002);
  float hw = 0.060, hh = 0.030;
  if (p.x > hb.x - hw && p.x < hb.x + hw * 0.55 && p.y < hb.y && p.y > hb.y - hh) {
    float side = step(hb.x + hw * 0.05, p.x);
    vec3 wall = mix(vec3(0.70, 0.58, 0.52), vec3(0.95, 0.78, 0.58), side);
    wall *= 0.9 + 0.15 * noise(p * vec2(300.0, 120.0));
    // windows
    float win = step(0.6, fract((p.x - hb.x) / 0.016)) * step(0.35, fract((p.y - hb.y) / 0.014 + 0.2)) * (1.0 - side);
    win *= step(hb.y - hh + 0.006, p.y) * step(p.y, hb.y - 0.006);
    col = mix(wall, vec3(0.28, 0.22, 0.24), win * 0.85);
    region = 0.9;
  }
  float roofY = hb.y - hh;
  float rx = p.x - (hb.x - hw * 0.2);
  if (p.y < roofY && p.y > roofY - 0.016 + abs(rx) * 0.12 && abs(rx) < hw * 0.95) {
    col = mix(vec3(0.62, 0.34, 0.26), vec3(0.86, 0.52, 0.34), step(0.0, rx));
    region = 0.9;
  }
  float cy = 0.0;
  cy = max(cy, cypress(p, vec2(0.905, HOR + 0.004), 0.105, 0.0105));
  cy = max(cy, cypress(p, vec2(0.925, HOR + 0.004), 0.080, 0.0095));
  cy = max(cy, cypress(p, vec2(1.075, HOR + 0.003), 0.090, 0.0100));
  cy = max(cy, cypress(p, vec2(1.34, HOR + 0.002), 0.060, 0.0080));
  if (cy > 0.0) {
    vec3 cc = mix(vec3(0.10, 0.15, 0.12), vec3(0.32, 0.30, 0.18), 0.25 * noise(p * vec2(200.0, 60.0)));
    col = mix(col, cc, cy);
    region = 0.9;
  }

  // ---------- the lone oak ----------
  vec4 tr = tree(p);
  if (tr.a > 0.0) { col = mix(col, tr.rgb, tr.a); region = 0.9; }
  return col;
}

void main() {
  vec2 fc = gl_FragCoord.xy + uJitter;
  vec2 uv = vec2(fc.x / uRes.x, 1.0 - fc.y / uRes.y);
  vec2 p = vec2(uv.x * A, uv.y);
  float region;
  vec3 col = land(p, region);
  if (region < 0.05) {
    // clouds sit behind the hills, trees and house
    vec4 c = clouds(p);
    col = mix(col, c.rgb, c.a);
    if (c.a > 0.5) region = 0.1;
  }
  // a whisper of golden atmosphere over everything near the sun
  float d = length((p - SUN) * vec2(1.0, 2.0));
  col += vec3(0.20, 0.12, 0.04) * exp(-d * 5.0);
  fragColor = vec4(col, region);
}`;

  // a cumulus congestus towering up from behind the hills on the left
  const blobs = [];
  const CB = 0.50;
  const crng = P.rng(seed + 'cloud');
  const env = (x) => Math.max(0, Math.exp(-Math.pow((x - 0.34) / 0.22, 2)) * 0.34 + Math.exp(-Math.pow((x - 0.74) / 0.13, 2)) * 0.13 - 0.02);
  for (let i = 0; i < 14; i++) {           // body
    const x = 0.02 + 0.92 * (i / 13) + crng.range(-0.02, 0.02);
    const hgt = env(x);
    if (hgt < 0.03) continue;
    const r = hgt * 0.5 + crng.range(0.0, 0.02);
    blobs.push([x, CB - hgt + r * 1.05, crng.range(-0.06, -0.02), r]);
  }
  for (let i = 0; blobs.length < 72 && i < 400; i++) {   // billows crowding the crown
    const x = 0.0 + crng() * 0.96;
    const hgt = env(x);
    if (hgt < 0.03) continue;
    const depth = Math.pow(crng(), 1.4);
    const y = CB - hgt + 0.012 + depth * hgt * 0.75;
    const r = 0.012 + crng() * 0.022 + hgt * 0.07 * (1 - depth);
    blobs.push([x + crng.range(-0.01, 0.01), y, crng.range(-0.03, 0.03), r]);
  }
  // foliage masses of the oak: a broad, slightly lopsided crown
  const tr = P.rng(seed + 'tree');
  const tblobs = [];
  const TC = [0.42, 0.565 - 0.072];
  for (let i = 0; i < 26; i++) {
    const a = tr.range(0, Math.PI * 2), rr = Math.sqrt(tr()) ;
    const x = TC[0] + Math.cos(a) * rr * 0.080 + 0.004;
    const y = TC[1] + Math.sin(a) * rr * 0.036 - 0.004 + Math.abs(Math.cos(a)) * rr * 0.012;
    const r = 0.012 + tr() * 0.016 * (1 - rr * 0.4);
    tblobs.push([x, y, tr.range(-0.01, 0.01) + (1 - rr) * 0.01, r]);
  }
  const treeU = new Float32Array(28 * 4);
  tblobs.forEach((b, i) => treeU.set(b, i * 4));
  const blobU = new Float32Array(72 * 4);
  blobs.forEach((b, i) => blobU.set(b, i * 4));

  const t0 = performance.now();
  // the motif is composed at half size; the painting doesn't need more
  const rw = Math.round(w / 2), rh = Math.round(h / 2);
  const refHalf = await P.glRender({ frag: FRAG, width: rw, height: rh, passes: 4, tile: 400, channels: 4, uniforms: { uSeed: s0, uNBlob: blobs.length, uNTree: tblobs.length }, arrays: { uBlob: blobU, uTree: treeU }, label: 'composing' });
  const ref = new Float32Array(w * h * 3);
  const region = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(rh - 1.001, (y + 0.5) / 2 - 0.5);
    const y0 = Math.max(0, Math.floor(fy)), ty = Math.max(0, fy - y0);
    for (let x = 0; x < w; x++) {
      const fx = Math.min(rw - 1.001, (x + 0.5) / 2 - 0.5);
      const x0 = Math.max(0, Math.floor(fx)), tx = Math.max(0, fx - x0);
      const i00 = (y0 * rw + x0) * 4, i10 = i00 + 4, i01 = i00 + rw * 4, i11 = i01 + 4;
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        const a = refHalf[i00 + c] + (refHalf[i10 + c] - refHalf[i00 + c]) * tx;
        const b = refHalf[i01 + c] + (refHalf[i11 + c] - refHalf[i01 + c]) * tx;
        ref[o + c] = Math.min(1, Math.max(0, a + (b - a) * ty));
      }
      region[y * w + x] = refHalf[(Math.round(fy) * rw + Math.round(fx)) * 4 + 3];
    }
  }
  console.log('reference', ((performance.now() - t0) / 1000).toFixed(1) + 's');

  if (P.params.get('ref')) {
    P.showSRGB(ctx, ref, w, h);
    P.done();
    return;
  }

  const HORp = 0.565 * h, VPx = (0.74 / 1.5) * w;
  // stroke directions where the motif itself is quiet
  const gn = P.noise(P.rng(seed + 'guide'));
  const isLav = (x, y) => {
    const i = (Math.min(h - 1, y) * w + Math.min(w - 1, x)) * 3;
    return ref[i + 2] > ref[i + 1] + 0.12;
  };
  const guide = (x, y) => {
    const reg = region[Math.min(h - 1, y) * w + Math.min(w - 1, x)];
    if (reg > 0.8) return null;                                     // trees and house: follow form
    if (y > HORp + 0.10 * h && isLav(x, y)) {                       // lavender: upward flicks
      return -Math.PI / 2 + 0.35 * gn.n2(x / 40, y / 40) + 0.25 * (x - VPx) / w;
    }
    if (y > HORp + 2) return Math.atan2(HORp - y, VPx - x);       // furrows run to the vanishing point
    // sky: criss-crossing strokes whose direction wanders across the canvas
    return 0.12 + 0.7 * gn.n2(x / 260, y / 260) + 0.3 * gn.n2(x / 70, y / 70);
  };
  // strokes keep to their object: trees and house versus sky and field
  const regionOf = (x, y) => (region[y * w + x] > 0.8 ? 1 : 0);
  const lenAt = (x, y) => {
    const reg = region[y * w + x];
    if (reg > 0.8) return 0.35;
    if (y > HORp + 0.10 * h && isLav(x, y)) return 0.22;
    if (y > HORp && y < HORp + 0.05 * h) return 0.5;
    if (y < HORp) return 0.8;
    return 1;
  };

  const oil = new P.Oil(w, h, rng, { ground: [0.62, 0.40, 0.26] });
  oil.underpaint(ref, 40 * P.scale, 0.72);
  const S = P.scale;
  const layers = [
    { R: 60 * S, maxLen: 7, noStop: true, threshold: 0.0, jitterV: 0.07, jitterC: 0.018, thick: 0.6, load: 2.2, pickup: 0.30, opacity: 0.9 },
    { R: 34 * S, maxLen: 10, threshold: 0.12, jitterV: 0.07, jitterC: 0.018, thick: 0.8, load: 1.9, pickup: 0.28, detail: 0.02 },
    { R: 19 * S, maxLen: 10, threshold: 0.12, jitterV: 0.065, jitterC: 0.017, thick: 1.0, load: 1.7, pickup: 0.25, detail: 0.025 },
    { R: 11 * S, maxLen: 9, threshold: 0.13, jitterV: 0.06, jitterC: 0.016, thick: 1.15, load: 1.5, pickup: 0.22, detail: 0.03 },
    { R: 6.5 * S, maxLen: 8, threshold: 0.14, jitterV: 0.055, jitterC: 0.015, thick: 1.3, load: 1.4, pickup: 0.2, detail: 0.035 },
    { R: 3.8 * S, maxLen: 7, threshold: 0.16, jitterV: 0.05, jitterC: 0.014, thick: 1.4, load: 1.3, pickup: 0.18, detail: 0.04 },
  ];

  let lastShow = 0;
  await P.run(function* () {
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const it = oil.layer(ref, L.R, { ...L, guide, guideW: 1.2, lenAt, regionOf, grid: 1.0, curve: 0.55, blur: 0.5 });
      for (const _ of it) {
        const now = performance.now();
        if (now - lastShow > 250) { oil.show(ctx); lastShow = now; }
        P.progress((li + 0.5) / layers.length, 'painting');
        yield;
      }
      oil.show(ctx);
      yield;
    }
  });
  console.log('painted', ((performance.now() - t0) / 1000).toFixed(1) + 's');

  const out = oil.finish({ relief: 0.75, shade: 0.45, spec: 0.05, soften: 0.7 });
  // varnish: a faint warm glaze and a gentle falloff toward the frame
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    const u = x / w - 0.5, v = y / h - 0.5;
    const vig = 1 - 0.22 * Math.pow(u * u + v * v * 1.3, 1.2) * 2.2;
    let r = out[i] * vig * 1.01, g = out[i + 1] * vig, b = out[i + 2] * vig * 0.97;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * 1.08; g = l + (g - l) * 1.08; b = l + (b - l) * 1.08;
    const sc = (v) => { v = Math.min(1, Math.max(0, v)); return v + 0.10 * v * (1 - v) * (2 * v - 1) * 2; };
    out[i] = sc(r); out[i + 1] = sc(g); out[i + 2] = sc(b);
  }
  P.showSRGB(ctx, out, w, h);
  P.done();
})();

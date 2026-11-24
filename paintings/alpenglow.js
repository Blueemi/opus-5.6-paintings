// Alpenglow — a mirror lake at first light. The terrain is eroded noise, raymarched
// with soft sun shadows, snow that settles by slope and altitude, aerial perspective,
// a belt of Venus over the earth's shadow, morning mist on the water and a
// reflection that the faint wind breaks into long ripples.
(async function () {
  const W = 2400, H = 1600;
  const cv = P.canvas(W, H);
  const w = cv.width, h = cv.height;
  const seed = P.seed || 'alpenglow';
  const rng = P.rng(seed);
  const off = P.seed ? [rng.range(-50, 50), rng.range(-50, 50)] : [0, 0];

  const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uJitter;
uniform float uPass;
uniform float uPasses;
uniform vec2 uOff;
uniform float uScale;
out vec4 fragColor;

const vec3 SUN = normalize(vec3(0.66, 0.05, -0.75));
const vec3 SUNCOL = vec3(1.0, 0.50, 0.28);
const float WATER = 0.0;

// Metal's fast pow is undefined at 0; keep every fractional power safe
float spow(float x, float y) { return x <= 1e-7 ? 0.0 : pow(x, y); }

// integer hash for per-pixel randomness (no visible lattice)
uint pcg(uint v) { uint st = v * 747796405u + 2891336453u; uint w = ((st >> ((st >> 28u) + 4u)) ^ st) * 277803737u; return (w >> 22u) ^ w; }
float rand3(vec3 p) { uvec3 u = uvec3(ivec3(floor(p))); return float(pcg(u.x + pcg(u.y + pcg(u.z)))) / 4294967295.0; }

// ---------- noise ----------
float hash(vec2 p) {
  p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113));
  return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y));
}
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
vec3 noised(vec2 x) {
  vec2 p = floor(x), w = fract(x);
  vec2 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
  float a = hash(p), b = hash(p + vec2(1, 0)), c = hash(p + vec2(0, 1)), d = hash(p + vec2(1, 1));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
float vnoise(vec2 x) { return noised(x).x; }
float noise3(vec3 x) {
  vec3 p = floor(x), w = fract(x);
  vec3 u = w * w * (3.0 - 2.0 * w);
  float a = hash31(p), b = hash31(p + vec3(1, 0, 0)), c = hash31(p + vec3(0, 1, 0)), d = hash31(p + vec3(1, 1, 0));
  float e = hash31(p + vec3(0, 0, 1)), f = hash31(p + vec3(1, 0, 1)), g = hash31(p + vec3(0, 1, 1)), h = hash31(p + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f, u.x), mix(g, h, u.x), u.y), u.z);
}
const mat2 M2 = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p, int oct) {
  float a = 0.0, b = 0.5;
  for (int i = 0; i < 10; i++) { if (i >= oct) break; a += b * vnoise(p); b *= 0.5; p = M2 * p * 2.03; }
  return a;
}

// ---------- terrain ----------
float eroded(vec2 p, int oct) {
  float a = 0.0, b = 1.0;
  vec2 d = vec2(0.0);
  for (int i = 0; i < 18; i++) {
    if (i >= oct) break;
    vec3 n = noised(p);
    d += n.yz;
    a += b * n.x / (1.0 + dot(d, d));
    b *= 0.5;
    p = M2 * p * 2.0;
  }
  return a;
}

// a glacial horn: faces carved back by cirques meet in sharp aretes
float horn(vec2 q, float e) {
  q += vec2(e * 700.0, -e * 520.0);
  float d = -1e9;
  d = max(d, dot(q, normalize(vec2(0.15, -1.0))) * 1.00);
  d = max(d, dot(q, normalize(vec2(1.0, -0.25))) * 1.10);
  d = max(d, dot(q, normalize(vec2(-1.0, -0.45))) * 0.95);
  d = max(d, dot(q, normalize(vec2(-0.2, 1.0))) * 0.80);
  d = max(d, dot(q, normalize(vec2(0.8, 0.8))) * 0.85);
  float k = clamp(1.0 - d / 4300.0, 0.0, 1.0);
  return spow(k, 1.45);
}

float terrain(vec2 xz, int oct) {
  vec2 p = xz / 2500.0 + uOff + vec2(1.3, -0.4);
  float e = eroded(p, oct);
  float hh = clamp(e * 0.5 + 0.55, 0.0, 2.0);
  // a glacial valley: forested walls close in from both sides
  float cx = 300.0 + 500.0 * sin(xz.y / 4200.0 + 0.6);
  float halfw = 560.0 + 0.16 * max(xz.y, 0.0);
  float dx = abs(xz.x - cx);
  float wall = smoothstep(halfw + 200.0, halfw + 1700.0, dx);
  // the range at the valley head
  float far = smoothstep(5500.0, 10500.0, xz.y);
  float amp = clamp(max(wall * 0.62, far), 0.0, 1.0);
  float height = amp * spow(hh, 1.5) * 1900.0;
  // and the horn rising out of it
  float hn = horn(xz - vec2(1000.0, 11800.0), e);
  // the horn's faces are ribbed by their own finer erosion
  float e2 = hn > 0.0 ? eroded(xz / 700.0 + vec2(5.2, 1.7), max(oct - 2, 3)) : 0.0;
  float hornH = hn * 3750.0 + hn * e * 520.0 + spow(hn, 0.6) * e2 * 260.0;
  // smooth union, only where the horn actually rises
  float k = 1.0 + 450.0 * smoothstep(0.0, 0.08, hn);
  float hb = max(k - abs(height - hornH), 0.0) / k;
  float hs = max(height, hornH) + k * 0.25 * hb * hb;
  float n = vnoise(xz / 300.0);
  float floorH = mix(-38.0 + 30.0 * n, 20.0 + 55.0 * n + 0.012 * (xz.y - 3200.0), smoothstep(2700.0, 3600.0, xz.y));
  float ground = floorH + hs;
  // a canopy of conifers roughens everything below the tree line
  float treeMask = (1.0 - smoothstep(900.0, 1250.0, ground)) * smoothstep(4.0, 30.0, ground);
  float canopy = 0.0;
  if (oct >= 9 && treeMask > 0.0) {
    canopy = treeMask * (14.0 + 9.0 * vnoise(xz / 6.0) + 5.0 * vnoise(xz / 2.3) + 6.0 * vnoise(xz / 40.0));
  }
  return ground + canopy;
}

float terrainM(vec2 xz) { return terrain(xz, 9); }

vec3 terrainNormal(vec3 p, float t) {
  float e = max(0.35, 0.00045 * t);
  int oct = int(clamp(18.0 - log2(1.0 + t / 500.0) * 1.6, 11.0, 17.0));
  float h0 = terrain(p.xz, oct);
  return normalize(vec3(h0 - terrain(p.xz + vec2(e, 0), oct), e, h0 - terrain(p.xz + vec2(0, e), oct)));
}

float marchTerrain(vec3 ro, vec3 rd, float tmax) {
  float t = 1.0;
  for (int i = 0; i < 600; i++) {
    vec3 p = ro + rd * t;
    float h = p.y - terrainM(p.xz);
    if (abs(h) < 0.0008 * t || t > tmax) break;
    if (p.y > 6500.0 && rd.y > 0.0) return tmax + 1.0;
    t += 0.33 * h;
    if (t < 0.5) { t = 0.5; }
  }
  return t;
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 4.0;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd * t;
    float h = p.y - terrain(p.xz, 8);
    res = min(res, 18.0 * h / t);
    t += clamp(h * 0.6, 3.0 + t * 0.01, 400.0);
    if (res < -0.2 || p.y > 6500.0) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}

// ---------- sky ----------
vec3 skyColor(vec3 rd) {
  float y = max(rd.y, 0.0);
  float mu = dot(rd, SUN);
  float anti = 0.5 - 0.5 * mu;
  vec3 zenith = vec3(0.040, 0.075, 0.21);
  vec3 mid = vec3(0.36, 0.38, 0.62);
  vec3 col = mix(mid, zenith, smoothstep(0.0, 0.62, pow(y, 0.75)));
  // belt of Venus: a rose band over the earth's blue shadow, opposite the sun
  float belt = exp(-pow((y - 0.11) / 0.085, 2.0)) * (0.35 + 0.65 * anti);
  col = mix(col, vec3(0.92, 0.60, 0.62), belt * 0.6);
  float shadow = exp(-pow((y - 0.02) / 0.04, 2.0)) * (0.3 + 0.7 * anti);
  col = mix(col, vec3(0.36, 0.40, 0.60), shadow * 0.6);
  // brightening towards the hidden sun
  float s = max(mu, 0.0);
  col += vec3(1.0, 0.55, 0.30) * pow(s, 6.0) * 0.6;
  col += vec3(1.0, 0.72, 0.45) * pow(s, 60.0) * 1.5;
  return col * 1.0;
}

// high, thin altocumulus catching the first light
vec4 clouds(vec3 ro, vec3 rd) {
  if (rd.y < 0.01) return vec4(0.0);
  float tc = (5200.0 - ro.y) / rd.y;
  vec2 q = (ro + rd * tc).xz / 2600.0 + uOff * 0.3;
  q.x *= 0.7;
  vec2 w = vec2(fbm(q * 0.8 + 1.7, 4), fbm(q * 0.8 + 9.2, 4));
  q += 0.35 * w;
  float n = fbm(q * vec2(0.55, 3.6) + vec2(0.0, 3.0), 7);
  float band = smoothstep(0.06, 0.3, rd.y) * smoothstep(0.75, 0.3, rd.y);
  float m = fbm(q * 0.3 + 7.1, 4);
  float d = smoothstep(0.02, 0.5, n + 0.7 * (m - 0.1)) * band;
  d = d * d * 0.6;
  float lit = 0.5 + 0.5 * smoothstep(-0.05, 0.2, n - fbm(q * vec2(0.55, 3.6) + vec2(0.03, 3.05), 6));
  vec3 c = mix(vec3(0.42, 0.34, 0.50), vec3(1.15, 0.62, 0.55), lit);
  return vec4(c, d);
}

vec3 atmos(vec3 col, vec3 ro, vec3 rd, float t) {
  // height-falloff haze integrated along the ray
  float b = 1.0 / 900.0;
  float c = 0.000058;
  float ry = abs(rd.y) < 1e-4 ? 1e-4 : rd.y;
  float fogAmt = c * exp(-ro.y * b) * (1.0 - exp(-t * ry * b)) / (ry * b) ;
  fogAmt = 1.0 - exp(-fogAmt);
  vec3 fogCol = skyColor(normalize(vec3(rd.x, max(rd.y, 0.0) * 0.6 + 0.035, rd.z))) * vec3(0.82, 0.86, 1.0);
  fogCol += vec3(0.65, 0.35, 0.20) * pow(max(dot(rd, SUN), 0.0), 3.0) * 0.4;
  return mix(col, fogCol, fogAmt);
}

// ---------- materials ----------
vec3 shadeTerrain(vec3 p, vec3 rd, float t) {
  vec3 n = terrainNormal(p, t);
  float slope = n.y;
  float r1 = fbm(p.xz / 40.0, 4);
  float r2 = vnoise(p.xz / 9.0);
  float strata = 0.35 * vnoise(vec2(p.y / 55.0 + 3.0 * r1, p.x / 300.0));

  vec3 rock = mix(vec3(0.060, 0.052, 0.050), vec3(0.20, 0.17, 0.15), clamp(0.5 + 0.7 * r1 + 0.35 * strata, 0.0, 1.0));
  rock *= 0.75 + 0.5 * r2;
  float gully = smoothstep(0.1, 0.7, abs(vnoise(vec2(p.x / 45.0 + 4.0 * r1, p.z / 45.0 + p.y / 400.0))));
  rock *= 0.75 + 0.25 * gully;
  vec3 alb = rock;

  // scree and meadow on the gentler lower slopes, forest below the tree line
  float tree = (1.0 - smoothstep(950.0, 1300.0, p.y + 180.0 * r1)) * smoothstep(0.50, 0.72, slope);
  float crowns = 0.5 + 0.5 * vnoise(p.xz / 5.0);
  crowns *= 0.6 + 0.4 * (0.5 + 0.5 * vnoise(p.xz / 17.0 + 4.0));
  vec3 forest = mix(vec3(0.010, 0.020, 0.016), vec3(0.035, 0.060, 0.040), crowns);
  float meadow = smoothstep(0.75, 0.92, slope) * (1.0 - smoothstep(60.0, 420.0, p.y));
  alb = mix(alb, forest, tree);
  alb = mix(alb, vec3(0.06, 0.07, 0.035), meadow * 0.7);

  // snow holds where the face is gentle enough and the air cold enough
  float snowLine = 1250.0 + 300.0 * fbm(p.xz / 900.0, 3) - 260.0 * smoothstep(0.6, 0.95, slope);
  float snow = smoothstep(snowLine - 80.0, snowLine + 160.0, p.y);
  snow *= smoothstep(0.50, 0.74, slope + 0.16 * r1 + 0.08 * r2);
  vec3 snowAlb = vec3(0.78, 0.81, 0.88);
  alb = mix(alb, snowAlb, snow);

  // dawn: the earth's shadow still covers everything below a certain altitude
  float glowLine = 1450.0 + 160.0 * fbm(p.xz / 2500.0, 2) + 0.010 * (p.z - 10000.0);
  float earthLit = smoothstep(glowLine - 90.0, glowLine + 160.0, p.y);
  float sh = earthLit > 0.0 ? softShadow(p + n * 2.0, SUN) * earthLit : 0.0;
  float dif = clamp(dot(n, SUN), 0.0, 1.0) * sh;
  vec3 sunC = mix(vec3(1.0, 0.22, 0.12), vec3(1.0, 0.48, 0.26), smoothstep(glowLine, glowLine + 1300.0, p.y));
  float sky = 0.55 + 0.45 * n.y;
  float bounce = clamp(0.3 - 0.7 * n.y, 0.0, 1.0) * 0.4;
  // crude occlusion from relative height
  float occ = clamp(0.55 + (p.y - terrain(p.xz, 5)) / 120.0 + 0.45 * smoothstep(-0.2, 0.6, r1), 0.35, 1.0);

  vec3 skyAmb = vec3(0.30, 0.42, 0.78) * 0.72;
  vec3 lin = sunC * 4.6 * dif;
  lin += skyAmb * sky * occ;
  lin += vec3(0.30, 0.22, 0.22) * bounce * occ;
  vec3 col = alb * lin;

  // a little sheen on sunlit snow
  vec3 hlf = normalize(SUN - rd);
  col += snow * sh * sunC * pow(clamp(dot(n, hlf), 0.0, 1.0), 24.0) * 0.6;
  return col;
}

// trace terrain + sky + clouds (no water) — used for both direct and reflected rays
vec3 traceLand(vec3 ro, vec3 rd, out float tHit) {
  float tmax = 42000.0;
  float t = marchTerrain(ro, rd, tmax);
  vec3 col;
  if (t < tmax) {
    vec3 p = ro + rd * t;
    col = shadeTerrain(p, rd, t);
    col = atmos(col, ro, rd, t);
    tHit = t;
  } else {
    col = skyColor(rd);
    vec4 c = clouds(ro, rd);
    col = mix(col, c.rgb, c.a);
    tHit = 1e9;
  }
  return col;
}

// marched fog volume: wisps of mist on the lake and fog banks lying in the valley
vec4 mist(vec3 ro, vec3 rd, float tEnd) {
  float tMax = min(tEnd, 22000.0);
  float T = 1.0;
  vec3 acc = vec3(0.0);
  const int N = 72;
  float jitter = rand3(vec3(gl_FragCoord.xy, 3.0 + uPass));
  float tPrev = 0.0;
  for (int i = 0; i < N; i++) {
    float f = (float(i) + jitter) / float(N);
    float t = tMax * f * f;
    float dt = t - tPrev;
    tPrev = t;
    vec3 p = ro + rd * t;
    // lake mist: thin, clinging to the water
    float hgt = p.y - WATER;
    float d1 = exp(-max(hgt, 0.0) / 16.0) * smoothstep(-5.0, 3.0, hgt);
    vec3 q = p / vec3(160.0, 36.0, 380.0);
    float n1 = noise3(q) * 0.55 + noise3(q * 2.7 + 11.0) * 0.3 + noise3(q * 7.3 + 5.0) * 0.15;
    d1 *= smoothstep(0.48, 0.86, n1) * 0.0032 * smoothstep(400.0, 1600.0, t);
    // valley fog bank resting on the forest floor beyond the lake
    float floorY = 120.0 + 0.012 * max(p.z - 3200.0, 0.0);
    float band = exp(-pow((p.y - floorY) / 150.0, 2.0)) + 0.5 * exp(-pow((p.y - floorY - 420.0) / 90.0, 2.0));
    vec3 q2 = p / vec3(900.0, 160.0, 1400.0);
    float n2 = noise3(q2 + 3.0) * 0.6 + noise3(q2 * 2.3 + 7.0) * 0.4;
    float d2 = band * smoothstep(0.35, 0.75, n2) * 0.00055 * smoothstep(3000.0, 6000.0, p.z);
    float dens = d1 + d2;
    float a = 1.0 - exp(-dens * dt);
    // fog high enough to reach the dawn light glows faintly rose
    float glow = smoothstep(1400.0, 1900.0, p.y);
    vec3 c = mix(vec3(0.44, 0.50, 0.78) * 0.85, vec3(1.0, 0.6, 0.55), glow);
    acc += T * a * c;
    T *= 1.0 - a;
    if (T < 0.02) break;
  }
  return vec4(acc, 1.0 - T);
}

void main() {
  vec2 fc = gl_FragCoord.xy + uJitter;
  vec2 uv = (2.0 * fc - uRes) / uRes.y;

  vec3 ro = vec3(150.0, 14.0, -200.0);
  vec3 ta = vec3(720.0, 260.0, 5000.0);
  vec3 cw = normalize(ta - ro);
  vec3 cu = normalize(cross(vec3(0.0, 1.0, 0.0), cw));
  vec3 cvv = cross(cw, cu);
  vec3 rd = normalize(uv.x * cu + uv.y * cvv + 2.05 * cw);

  vec3 col;
  float tHit;
  float tw = rd.y < 0.0 ? (WATER - ro.y) / rd.y : 1e9;
  vec3 land = traceLand(ro, rd, tHit);
  float tEnd = tHit;
  if (tw < tHit) {
    vec3 p = ro + rd * tw;
    tEnd = tw;
    // glassy water; where a breath of wind touches it, the reflection goes glossy
    float wind = smoothstep(0.20, 0.40, fbm(p.xz / vec2(1500.0, 120.0) + 2.0, 5));
    float near = exp(-tw / 400.0) * (0.12 + 0.88 * wind);
    vec2 q = p.xz * vec2(1.0, 3.0);
    float r0 = fbm(q / 9.0, 4), rx = fbm((q + vec2(0.4, 0.0)) / 9.0, 4), rz = fbm((q + vec2(0.0, 0.4)) / 9.0, 4);
    vec2 g = vec2(rx - r0, rz - r0) / 0.4;
    // stratified across the AA passes so the gloss resolves smoothly
    float h1 = rand3(vec3(gl_FragCoord.xy, uPass * 7.0 + 1.0)) - 0.5;
    float h2 = (uPass + rand3(vec3(gl_FragCoord.yx, uPass * 5.0 + 2.0))) / max(uPasses, 1.0) - 0.5;
    wind *= 1.0 - 0.6 * smoothstep(1500.0, 3200.0, tw);
    vec3 n = normalize(vec3(g.x * 0.07 * near + h1 * 0.022 * wind, 1.0, g.y * 0.16 * near + h2 * 0.06 * wind));
    vec3 rr = reflect(rd, n);
    rr.y = abs(rr.y);
    float tr;
    vec3 refl = traceLand(p + vec3(0.0, 0.5, 0.0), rr, tr);
    float cosI = clamp(dot(n, -rd), 0.0, 1.0);
    float fres = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);
    fres = mix(0.16, 1.0, fres);
    vec3 body = vec3(0.006, 0.012, 0.016);
    col = mix(body, refl * 0.92, fres);
    col = atmos(col, ro, rd, tw);
  } else {
    col = land;
  }

  vec4 m = mist(ro, rd, tEnd);
  col = col * (1.0 - m.a) + m.rgb;

  fragColor = vec4(col, 1.0);
}`;

  const t0 = performance.now();
  const passes = P.params.get('passes') ? parseInt(P.params.get('passes')) : (P.scale < 1 ? 1 : 10);
  const hdr = await P.glRender({
    frag: FRAG, width: w, height: h, passes, tile: 160,
    uniforms: { uOff: off, uScale: P.scale, uPasses: passes },
    label: 'raymarching',
  });
  console.log('gl time', ((performance.now() - t0) / 1000).toFixed(1) + 's');

  // ---------- post: bloom, filmic curve, grade, vignette, grain ----------
  const N = w * h;
  const bright = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) bright[i] = Math.max(0, hdr[i] - 0.9);
  const bloom = P.boxBlur(bright, w, h, 3, 40 * P.scale, 3);
  const bloom2 = P.boxBlur(bright, w, h, 3, 10 * P.scale, 3);

  const out = new Float32Array(N * 3);
  const exposure = 1.05;
  const grain = P.rng(seed + 'grain');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const u = x / w - 0.5, v = y / h - 0.48;
      const vig = 1 - 0.55 * Math.pow(u * u * 1.1 + v * v * 1.6, 1.25);
      let r = (hdr[i] + bloom[i] * 0.22 + bloom2[i] * 0.12) * exposure * vig;
      let g = (hdr[i + 1] + bloom[i + 1] * 0.22 + bloom2[i + 1] * 0.12) * exposure * vig;
      let b = (hdr[i + 2] + bloom[i + 2] * 0.22 + bloom2[i + 2] * 0.12) * exposure * vig;
      r = P.aces(r); g = P.aces(g); b = P.aces(b);
      // split-tone: cool shadows, warm highlights
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sh = 1 - P.smooth(0.0, 0.35, l), hi = P.smooth(0.45, 1.0, l);
      r += -0.006 * sh + 0.018 * hi;
      g += 0.000 * sh + 0.006 * hi;
      b += 0.014 * sh - 0.012 * hi;
      const gn = (grain() + grain() - 1) * 0.012;
      out[i] = r + gn; out[i + 1] = g + gn; out[i + 2] = b + gn;
    }
  }
  const ctx = cv.getContext('2d');
  ctx.putImageData(P.toImageData(ctx, out, w, h), 0, 0);
  P.done();
})();

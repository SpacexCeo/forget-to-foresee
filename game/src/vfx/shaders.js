// GLSL for the VFX system. Particles are stateless on the GPU: position, size, colour and
// flipbook frame are closed-form functions of age (birth time is written once at emission), so a
// burst costs one attribute upload and no per-frame CPU work.

export const NOISE_GLSL = /* glsl */`
// Simplex 3D noise (Ashima Arts / Stefan Gustavson, MIT).
vec4 vfxPermute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 vfxTaylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float vfxSnoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = vfxPermute(vfxPermute(vfxPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = vfxTaylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
vec3 vfxNoise3(vec3 x) {
  return vec3(vfxSnoise(x), vfxSnoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)), vfxSnoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4)));
}
// Curl of a vector noise field (divergence-free: particles swirl without bunching up), after
// Bridson et al. 2007, "Curl-noise for procedural fluid flow".
vec3 vfxCurl(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
  vec3 px0 = vfxNoise3(p - dx), px1 = vfxNoise3(p + dx);
  vec3 py0 = vfxNoise3(p - dy), py1 = vfxNoise3(p + dy);
  vec3 pz0 = vfxNoise3(p - dz), pz1 = vfxNoise3(p + dz);
  vec3 c = vec3(py1.z - py0.z - pz1.y + pz0.y, pz1.x - pz0.x - px1.z + px0.z, px1.y - px0.y - py1.x + py0.x);
  return c / (2.0 * e) * 0.18;
}
float vfxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vfxVnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vfxHash(i), vfxHash(i + vec2(1, 0)), f.x), mix(vfxHash(i + vec2(0, 1)), vfxHash(i + vec2(1, 1)), f.x), f.y);
}
float vfxFbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vfxVnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

export const PARTICLE_VS = /* glsl */`
uniform float uTime;
uniform float uGrid;
uniform float uCurlScale;     // global multiplier (reduced motion halves it)
attribute vec2 corner;
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec4 aT;    // birth, life, seed, sprite id
attribute vec4 aSz;   // size0, size1, spin, stretch
attribute vec4 aC0;   // rgb0, intensity0
attribute vec4 aC1;   // rgb1, intensity1
attribute vec4 aPh;   // gravity, drag, curl strength, curl scale
attribute vec4 aFd;   // fadeIn, fadeOut, alpha, flipbook fps (0 = over life)
attribute vec2 aEx;   // soft distance, curl speed
varying vec2 vCorner;
varying vec2 vUv0;
varying vec2 vUv1;
varying float vBlend;
varying vec4 vColor;
varying float vAlpha;
varying float vLinDepth;
varying float vSoft;
varying float vSprite;
varying float vSeed;
${NOISE_GLSL}
void main() {
  float age = uTime - aT.x;
  float life = aT.y;
  if (age < 0.0 || age > life || life <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
  float u = age / life;
  float seed = aT.z;
  vec3 p = aPos;
  vec3 vel = aVel;
  float g = aPh.x, k = aPh.y;
  if (k > 1e-4) {
    float e = exp(-k * age);
    p += aVel * (1.0 - e) / k;
    vel = aVel * e;
    p.y += g * (age / k - (1.0 - e) / (k * k));
    vel.y += g * (1.0 - e) / k;
  } else {
    p += aVel * age;
    p.y += 0.5 * g * age * age;
    vel.y += g * age;
  }
  float cs = aPh.z * uCurlScale;
  if (cs > 0.0) {
    vec3 c = vfxCurl(aPos * aPh.w + vec3(seed * 7.0, seed * 3.0, uTime * aEx.y));
    p += c * cs * age;
    vel += c * cs;
  }
  float size = mix(aSz.x, aSz.y, u);
  float fin = aFd.x > 0.0 ? smoothstep(0.0, aFd.x, u) : 1.0;
  float fout = aFd.y > 0.0 ? 1.0 - smoothstep(1.0 - aFd.y, 1.0, u) : 1.0;
  vAlpha = fin * fout * aFd.z;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec2 off;
  if (aSz.w > 0.0) {
    vec2 vv = (viewMatrix * vec4(vel, 0.0)).xy;
    float sp = length(vv);
    vec2 ax = sp > 1e-4 ? vv / sp : vec2(0.0, 1.0);
    vec2 pr = vec2(-ax.y, ax.x);
    off = ax * corner.y * (size + aSz.w * sp) + pr * corner.x * size;
    vCorner = corner;
  } else {
    float a = seed * 6.2831 + aSz.z * age;
    float cr = cos(a), sr = sin(a);
    off = vec2(cr * corner.x - sr * corner.y, sr * corner.x + cr * corner.y) * size;
    vCorner = corner;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  vLinDepth = -mv.z;
  vSoft = max(aEx.x, 0.01);
  vSprite = aT.w;
  vSeed = seed;
  vColor = vec4(mix(aC0.rgb, aC1.rgb, u) * mix(aC0.a, aC1.a, u), 1.0);
  // Flipbook with frame blending; random horizontal flip per particle hides repetition.
  float frames = uGrid * uGrid;
  float f = aFd.w > 0.0 ? mod(age * aFd.w + seed * frames, frames) : u * (frames - 1.0);
  float f0 = floor(f);
  float f1 = min(f0 + 1.0, frames - 1.0);
  if (aFd.w > 0.0) f1 = mod(f0 + 1.0, frames);
  vBlend = f - f0;
  vec2 cuv = corner * 0.5 + 0.5;
  if (fract(seed * 13.7) > 0.5) cuv.x = 1.0 - cuv.x;
  vec2 cell0 = vec2(mod(f0, uGrid), uGrid - 1.0 - floor(f0 / uGrid));
  vec2 cell1 = vec2(mod(f1, uGrid), uGrid - 1.0 - floor(f1 / uGrid));
  vUv0 = (cell0 + cuv) / uGrid;
  vUv1 = (cell1 + cuv) / uGrid;
}
`;

export const PARTICLE_FS = /* glsl */`
uniform float uTime;
uniform vec3 uLit;            // light tint for alpha-blended (lit) sprites
#ifdef USE_ATLAS
uniform sampler2D uAtlas;
#endif
#ifdef SOFT
uniform sampler2D uDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
#endif
varying vec2 vCorner;
varying vec2 vUv0;
varying vec2 vUv1;
varying float vBlend;
varying vec4 vColor;
varying float vAlpha;
varying float vLinDepth;
varying float vSoft;
varying float vSprite;
varying float vSeed;

vec4 proceduralSprite(float id, vec2 c, float seed) {
  float r2 = dot(c, c);
  if (id < 0.5) {                     // dot: soft round blot
    return vec4(1.0, 1.0, 1.0, exp(-r2 * 5.0) * smoothstep(1.0, 0.7, r2));
  } else if (id < 1.5) {              // spark: hot core, short glow
    float a = exp(-r2 * 9.0) + 0.3 * exp(-r2 * 2.5);
    return vec4(vec3(1.0), a * smoothstep(1.0, 0.6, r2));
  } else if (id < 2.5) {              // mote: golden dust with a slow twinkle
    float tw = 0.7 + 0.3 * sin(uTime * (3.0 + seed * 4.0) + seed * 40.0);
    float a = (exp(-r2 * 16.0) * 1.2 + exp(-r2 * 3.5) * 0.28) * tw;
    return vec4(vec3(1.0), a * smoothstep(1.0, 0.6, r2));
  } else if (id < 3.5) {              // glyph: a tiny broken ring with a tick (a memory)
    float r = sqrt(r2);
    float ang = atan(c.y, c.x);
    float gap = smoothstep(0.25, 0.6, abs(sin(ang * 0.5 + seed * 6.28)));
    float ring = exp(-pow((r - 0.55) / 0.08, 2.0)) * gap;
    float ta = seed * 6.28;
    vec2 td = vec2(cos(ta), sin(ta));
    float along = dot(c, td);
    float tick = exp(-pow(length(c - td * clamp(along, 0.2, 0.85)) / 0.07, 2.0));
    float halo = exp(-r2 * 3.0) * 0.18;
    return vec4(vec3(1.0), clamp(ring + tick * 0.9 + halo, 0.0, 1.5) * smoothstep(1.0, 0.85, r));
  }
  // shard glint: a four-point star
  float sx = exp(-abs(c.x) * 16.0 - c.y * c.y * 2.0);
  float sy = exp(-abs(c.y) * 16.0 - c.x * c.x * 2.0);
  float a = max(sx, sy) * (1.0 - sqrt(r2) * 0.6) + exp(-r2 * 20.0);
  return vec4(vec3(1.0), a * smoothstep(1.0, 0.8, r2));
}

void main() {
  if (vAlpha <= 0.001) discard;
#ifdef USE_ATLAS
  vec4 tex = mix(texture2D(uAtlas, vUv0), texture2D(uAtlas, vUv1), vBlend);
#else
  vec4 tex = proceduralSprite(vSprite, vCorner, vSeed);
#endif
  float a = tex.a * vAlpha;
#ifdef SOFT
  float d = texture2D(uDepth, gl_FragCoord.xy / uResolution).x;
  float z = d * 2.0 - 1.0;
  float sceneZ = (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  a *= clamp((sceneZ - vLinDepth) / vSoft, 0.0, 1.0);
#endif
  if (a < 0.002) discard;
  vec3 col = vColor.rgb * tex.rgb;
#ifdef BLEND_ALPHA
  col *= uLit;
  gl_FragColor = vec4(col * a, a);
#else
  gl_FragColor = vec4(col * a, 0.0);
#endif
#ifndef SOFT
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
#endif
}
`;

export const FULLSCREEN_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const COMPOSITE_FS = /* glsl */`
uniform sampler2D tScene;
uniform sampler2D tParticles;
uniform float uHasParticles;
uniform float uTime;
uniform float uAspect;
uniform float uDistort;
uniform float uChroma;
uniform float uShock;
uniform float uShockT;
uniform vec2 uShockCenter;
uniform vec3 uTint;
uniform float uTintAmount;
uniform float uDesat;
uniform float uTension;
uniform vec3 uTensionTint;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 uv = vUv;
  vec2 c = (uv - 0.5) * vec2(uAspect, 1.0);
  float rc = length(c);
  // Vision: slow liquid warp, strongest toward the frame edges (the centre stays readable).
  if (uDistort > 0.0) {
    float edge = smoothstep(0.15, 0.8, rc);
    vec2 w = vec2(vfxSnoise(vec3(uv * 3.0, uTime * 0.18)), vfxSnoise(vec3(uv * 3.0 + 17.0, uTime * 0.15)));
    uv += w * 0.012 * uDistort * (0.25 + edge * 1.5);
  }
  // Shockwave: one refracting ring expanding from the event's screen position.
  if (uShock > 0.0) {
    vec2 d = (vUv - uShockCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float wave = uShockT * 0.75;
    float band = exp(-pow((r - wave) / 0.035, 2.0)) * (1.0 - uShockT);
    uv -= (d / max(r, 1e-4)) / vec2(uAspect, 1.0) * band * 0.018 * uShock;
  }
  vec3 col;
  if (uChroma > 0.0) {
    vec2 dir = (uv - 0.5);
    float ca = uChroma * 0.006 * (0.25 + rc * 1.8);
    col.r = texture2D(tScene, uv + dir * ca).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv - dir * ca).b;
  } else {
    col = texture2D(tScene, uv).rgb;
  }
  if (uHasParticles > 0.5) {
    vec4 p = texture2D(tParticles, uv);
    col = col * (1.0 - p.a) + p.rgb;
  }
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(l), uDesat);
  col = mix(col, l * uTint * 1.25 + col * 0.25, uTintAmount);
  // Vision vignette: a warm gold rim closes in.
  col += uTint * smoothstep(0.45, 1.0, rc) * uTintAmount * 0.25;
  // Tension: rust creeps into the shadows and the frame edges darken.
  float shadow = 1.0 - smoothstep(0.0, 0.5, l);
  col = mix(col, col * uTensionTint * 1.7, uTension * shadow * 0.5);
  col *= 1.0 - uTension * 0.35 * smoothstep(0.35, 1.0, rc);
  gl_FragColor = vec4(col, 1.0);
}
`;

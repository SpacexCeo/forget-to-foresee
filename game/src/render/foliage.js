// Instanced grass and flowers for the plateaus (owner references: dense grass and small flowers on
// the camp plateaus, wind in the blades). One InstancedMesh per kind = one draw call each. The
// vertex shader bends the blades with the wind and scales them down with camera distance, so far
// patches cost nothing to shade; reduced motion freezes the wind. Blades receive shadows and fog.
import * as THREE from 'three';

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A tapered blade: 3 segments, bent forward, 7 vertices, 5 triangles. Height 1, width 0.06. */
function bladeGeometry() {
  const segs = 3, pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const h = i / segs, w = 0.06 * (1 - h * 0.85), bend = 0.12 * h * h;
    if (i < segs) { pos.push(-w / 2, h, bend, w / 2, h, bend); uv.push(0, h, 1, h); } else { pos.push(0, 1, bend); uv.push(0.5, 1); }
  }
  for (let i = 0; i < segs - 1; i++) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  idx.push((segs - 1) * 2, (segs - 1) * 2 + 1, segs * 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Two crossed quads with a dot of colour: a small flower head on a stem. */
function flowerGeometry() {
  const parts = [];
  for (const rot of [0, Math.PI / 2]) {
    const q = new THREE.PlaneGeometry(0.16, 0.16);
    q.translate(0, 0.08, 0); q.rotateY(rot); q.translate(0, 0.22, 0);
    parts.push(q);
  }
  const stem = new THREE.PlaneGeometry(0.02, 0.24); stem.translate(0, 0.12, 0);
  parts.push(stem);
  const g = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  let base = 0;
  for (const p of parts) {
    const pp = p.attributes.position, pu = p.attributes.uv, pi = p.index;
    for (let i = 0; i < pp.count; i++) { pos.push(pp.getX(i), pp.getY(i), pp.getZ(i)); uv.push(pu.getX(i), pu.getY(i)); }
    for (let i = 0; i < pi.count; i++) idx.push(pi.getX(i) + base);
    base += pp.count; p.dispose();
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Shared wind + distance LOD injected into a standard material. */
function windMaterial(base, { fadeDistance, flower }) {
  const uniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uFade: { value: fadeDistance } };
  base.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind, uFade;
        varying float vBladeH;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        vec3 iWorld = (modelMatrix * vec4(iPos, 1.0)).xyz;
        float camD = distance(iWorld, cameraPosition);
        float lod = 1.0 - smoothstep(uFade * 0.55, uFade, camD);
        float gust = sin(uTime * 1.7 + iWorld.x * 0.35 + iWorld.z * 0.21) * 0.6 + sin(uTime * 2.9 + iWorld.z * 0.7) * 0.25 + 0.15;
        float sway = gust * uWind * ${flower ? '0.06' : '0.16'} * hBlade * hBlade;
        transformed.y *= lod;
        transformed.x += sway; transformed.z += sway * 0.4;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        float hBlade = clamp(position.y, 0.0, 1.0);
        vBladeH = hBlade;
        #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor.rgb *= mix(${flower ? '0.8' : '0.42'}, 1.0, hBlade);
        #endif`);
    base.userData.shader = shader;
  };
  base.userData.uniforms = uniforms;
  base.customProgramCacheKey = () => 'ftf-wind-' + (flower ? 'flower' : 'blade');
  return base;
}

const GRASS_COLORS = [0x5f8f4a, 0x6f9c4f, 0x7fa655, 0x89ac5b, 0x5a8747, 0x9bb064];
const FLOWER_COLORS = [0xd8c7ff, 0xf6f1ff, 0xf2d26a, 0xb58fe6, 0xffffff, 0xe9c6ea];

/**
 * @param {{patches: {center:number[], radius:number, tint?:number}[], blades:number, flowers:number,
 *          fadeDistance:number, seed?:number}} o
 */
export class Foliage {
  constructor({ patches, blades, flowers, fadeDistance, seed = 3 }) {
    this.group = new THREE.Group();
    this.group.name = 'foliage';
    this.patches = patches;
    this.seed = seed;
    this.grassMat = windMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }), { fadeDistance, flower: false });
    this.flowerMat = windMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0, side: THREE.DoubleSide, emissive: 0x111111 }), { fadeDistance, flower: true });
    this.bladeGeo = bladeGeometry();
    this.flowerGeo = flowerGeometry();
    this.grass = null; this.flowers = null;
    this.rebuild({ blades, flowers, fadeDistance });
  }

  /** Rebuilds both instanced meshes for a tier (blade and flower counts, fade distance). */
  rebuild({ blades, flowers, fadeDistance }) {
    for (const m of [this.grass, this.flowers]) if (m) { this.group.remove(m); m.dispose(); }
    this.grassMat.userData.uniforms.uFade.value = fadeDistance;
    this.flowerMat.userData.uniforms.uFade.value = fadeDistance;
    this.grass = this.scatter(this.bladeGeo, this.grassMat, blades, GRASS_COLORS, this.seed, { minScale: 0.55, maxScale: 1.25, h: 0.42, ring: 0.1 });
    this.flowers = this.scatter(this.flowerGeo, this.flowerMat, flowers, FLOWER_COLORS, this.seed + 17, { minScale: 0.8, maxScale: 1.4, h: 1, ring: 0.25 });
    this.grass.name = 'grass'; this.flowers.name = 'flowers';
    this.group.add(this.grass, this.flowers);
  }

  scatter(geo, mat, count, colors, seed, { minScale, maxScale, h, ring }) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
    const rnd = mulberry(seed);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), tint = new THREE.Color();
    const totalArea = this.patches.reduce((a, pt) => a + pt.radius * pt.radius, 0);
    let i = 0;
    for (const pt of this.patches) {
      const n = Math.round(count * (pt.radius * pt.radius) / totalArea);
      tint.set(pt.tint ?? 0xffffff);
      for (let k = 0; k < n && i < count; k++, i++) {
        // Denser toward the rim (bare ground around the camp center where people walk).
        const r = pt.radius * (ring + (1 - ring) * Math.sqrt(0.15 + 0.85 * rnd()));
        const a = rnd() * Math.PI * 2;
        p.set(pt.center[0] + Math.cos(a) * r, pt.center[1], pt.center[2] + Math.sin(a) * r);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
        const sc = minScale + rnd() * (maxScale - minScale);
        s.set(sc, sc * h * (0.8 + rnd() * 0.5), sc);
        m.compose(p, q, s); mesh.setMatrixAt(i, m);
        c.set(colors[Math.floor(rnd() * colors.length)]).lerp(tint, 0.25);
        mesh.setColorAt(i, c);
      }
    }
    for (; i < mesh.count; i++) { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); mesh.setColorAt(i, c); }
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  /** @param {number} dt seconds (0 under reduced motion) */
  update(dt) {
    for (const mat of [this.grassMat, this.flowerMat]) mat.userData.uniforms.uTime.value += dt;
  }

  setWind(strength) { for (const mat of [this.grassMat, this.flowerMat]) mat.userData.uniforms.uWind.value = strength; }
}

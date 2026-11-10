// Look-dev materials (owner concept 07.11, hybrid art direction: faceted silhouettes, detailed PBR).
// Greyboxes merge their parts per material SLOT (render/greybox.js), so a Shell is one nacre draw
// call, the Frost pavilion one glass draw call, every lantern body one amber draw call. The same
// materials upgrade loaded .glb assets by material name or asset kind (upgradeAssetMaterials).
// All materials take vertex colours, so greybox tints survive. Quality tiers toggle the expensive
// features in place (applyMaterialQuality), never swapping material objects.
//
// Nacre (the Shells): three.js thin-film iridescence under a wet clearcoat, plus a view-dependent
// pearl rim injected into the shader: the thin film alone reads as oil on a white ball; mother of
// pearl also has a soft glow where the surface turns away (the aragonite platelets scatter light
// back), and that rim is what the bloom picks up so the Shells read as the luminous landmark.
import * as THREE from 'three';

/** Shared greybox material: soft grey-green matte with faceted shading (hybrid art direction). */
export const greyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });

const NACRE_RIM = /* glsl */`
  uniform float uNacreRim;
  uniform vec3 uNacreRimColorA, uNacreRimColorB;
`;

/** Adds the pearl rim to a physical material (idempotent per material object). */
function withNacreRim(mat) {
  const uniforms = { uNacreRim: { value: 0.55 }, uNacreRimColorA: { value: new THREE.Color(0.95, 0.82, 1.0) }, uNacreRimColorB: { value: new THREE.Color(0.72, 0.92, 1.0) } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NACRE_RIM)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 nv = normalize( vViewPosition );
          float fres = pow( 1.0 - max( dot( normalize( normal ), nv ), 0.0 ), 3.0 );
          // The hue drifts with the view angle like a thin film: violet at grazing, aqua a little closer in.
          vec3 rimCol = mix( uNacreRimColorB, uNacreRimColorA, smoothstep( 0.2, 0.9, fres ) );
          totalEmissiveRadiance += rimCol * fres * uNacreRim * diffuseColor.rgb;
        }`);
  };
  mat.userData.nacreUniforms = uniforms;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => prevKey() + '-ftf-nacre';
  return mat;
}

/** Iridescent nacre for the Shells: thin-film iridescence, soft sheen, a wet clearcoat and the pearl rim. */
export const nacreMaterial = withNacreRim(new THREE.MeshPhysicalMaterial({
  vertexColors: true, color: 0xf4f1ee, roughness: 0.38, metalness: 0.0,
  iridescence: 0.75, iridescenceIOR: 1.32, iridescenceThicknessRange: [140, 460],
  sheen: 0.6, sheenColor: new THREE.Color(0xe6dcf5), sheenRoughness: 0.5,
  clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 1.35, side: THREE.DoubleSide,
}));

/** Glass for the Frost pavilion, Salt crystals and the Shell interior wall: transmission when the tier allows it. */
export const glassMaterial = new THREE.MeshPhysicalMaterial({
  vertexColors: true, color: 0xe6f3fa, roughness: 0.06, metalness: 0,
  transmission: 1.0, thickness: 0.35, ior: 1.45, attenuationColor: new THREE.Color(0xcfe6f2), attenuationDistance: 2.5,
  clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 1.6, side: THREE.DoubleSide,
});

/** Warm lantern bodies and amber floor lights: bright emissive so the bloom picks them up. */
export const amberMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, color: 0xfff1d6, emissive: new THREE.Color(0xffa23a), emissiveIntensity: 3.2, roughness: 0.5, metalness: 0,
});

/** Gold inlay for the plaza medallion and the anchor zone rings. */
export const goldMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xf0cf7a, roughness: 0.32, metalness: 1.0, envMapIntensity: 1.3 });

/** Violet iris-tent canopy: a cloth sheen without heavy translucency. */
export const clothMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.75, metalness: 0, sheen: 0.9, sheenColor: new THREE.Color(0xc8b3ff), sheenRoughness: 0.6, side: THREE.DoubleSide });

export const SLOT_MATERIALS = Object.freeze({ default: greyMaterial, nacre: nacreMaterial, glass: glassMaterial, amber: amberMaterial, gold: goldMaterial, cloth: clothMaterial });

/** Fallback glass values when transmission is off (low tier): plain alpha blending. */
const GLASS_FALLBACK = { transparent: true, opacity: 0.42, roughness: 0.12 };

/** Every nacre material in use (the shared slot material and the per-asset clones) for the tier toggles. */
const nacreClones = new Set();

/**
 * Slow shimmer of the mother of pearl (owner 08.11: everything is animated): the thin film's thickness
 * range breathes and the rim hue drifts violet <-> aqua over about half a minute, far below anything
 * that would read as flicker. t in seconds; pass a frozen t under reduced motion.
 */
export function setNacreTime(t) {
  const lo = 140 + 18 * Math.sin(t * 0.21), hi = 460 + 28 * Math.sin(t * 0.17 + 1.3);
  const hueA = 0.78 + 0.035 * Math.sin(t * 0.13), hueB = 0.53 + 0.03 * Math.sin(t * 0.11 + 0.7);
  for (const m of [nacreMaterial, ...nacreClones]) {
    m.iridescenceThicknessRange[0] = lo; m.iridescenceThicknessRange[1] = hi;
    const u = m.userData.nacreUniforms;
    if (u) { u.uNacreRimColorA.value.setHSL(hueA, 0.9, 0.9); u.uNacreRimColorB.value.setHSL(hueB, 0.9, 0.86); }
  }
}

/**
 * Applies a tier's material features in place. Changing transmission/iridescence between zero and
 * non-zero changes the shader program, so the materials are flagged for recompilation.
 * @param {{transmission:boolean, iridescence:boolean}} cfg
 */
export function applyMaterialQuality(cfg) {
  const iri = cfg.iridescence ? 0.75 : 0.0;
  for (const m of [nacreMaterial, ...nacreClones]) {
    if (m.iridescence === iri) continue;
    m.iridescence = iri; m.sheen = cfg.iridescence ? 0.6 : 0.0; m.clearcoat = cfg.iridescence ? 0.55 : 0.0;
    // Without the thin film the rim carries the pearl look alone, a little stronger.
    if (m.userData.nacreUniforms) m.userData.nacreUniforms.uNacreRim.value = cfg.iridescence ? 0.55 : 0.8;
    m.needsUpdate = true;
  }
  const tr = cfg.transmission ? 1.0 : 0.0;
  if (glassMaterial.transmission !== tr) {
    glassMaterial.transmission = tr;
    if (cfg.transmission) { glassMaterial.transparent = false; glassMaterial.opacity = 1; glassMaterial.roughness = 0.06; } else Object.assign(glassMaterial, GLASS_FALLBACK);
    glassMaterial.needsUpdate = true;
  }
}

/**
 * Which look-dev slot a loaded material belongs to, from the asset and the material name, or null
 * to keep the artist's material. Pure, so the rules are covered by node tests:
 *   Shell exteriors are nacre (every material; the glow one keeps its emissive), as is any material
 *   called nacre/pearl; "stone", "rock", "floor", "atlas" and "body" materials are never upgraded
 *   even when the asset is a Shell (the interior's dark cracked floor stayed stone for a reason);
 *   glass/crystal/quartz/ice are glass; amber/lantern/lamp/glow/ember are amber; gold/inlay/brass are gold.
 * @param {string} assetName catalog name (e.g. 'shell_2')
 * @param {string} materialName
 */
export function slotForMaterial(assetName, materialName) {
  const name = String(materialName || '');
  // The town's kit keeps its authored materials: its window glass is a dark reflective pane, not a transmissive one
  // (transmission renders the scene a second time), and its lamps and lit windows follow the hour (setEmissiveLevels).
  if (/^M_Town_/.test(name)) return null;
  const isShell = /^shell_[1-4](_r2|_m)?$/.test(assetName);
  if (/stone|rock|floor|atlas|_body|wood|cloth|rope|soil|grass|foliage|bark|leaf/i.test(name)) return null;
  if (/nacre|pearl/i.test(name)) return 'nacre';
  if (isShell) return 'nacre';
  if (/glass|crystal|quartz|ice\b/i.test(name)) return 'glass';
  if (/amber|lantern|lamp|glow|ember/i.test(name)) return 'amber';
  if (/gold|inlay|brass/i.test(name)) return 'gold';
  return null;
}

/**
 * Upgrades the materials of a loaded asset: Shells become nacre, material names that say glass /
 * amber / gold get the matching look. The loaded colour, maps and vertex colours are kept; only
 * the material class and its physical parameters change. Idempotent per material object.
 * @param {string} assetName catalog name (e.g. 'shell_2')
 * @param {THREE.Object3D} root
 */
export function upgradeAssetMaterials(assetName, root) {
  const done = new Map();
  registerLookMaterials(root);
  const upgrade = (mat) => {
    if (!mat || done.has(mat)) return done.get(mat) || mat;
    const name = mat.name || '';
    const slot = slotForMaterial(assetName, name);
    const src = slot ? SLOT_MATERIALS[slot] : null;
    if (!src) { done.set(mat, mat); return mat; }
    const out = src.clone();
    if (slot === 'nacre') { withNacreRim(out); nacreClones.add(out); }
    out.name = name; out.vertexColors = !!mat.vertexColors;
    for (const k of ['map', 'normalMap', 'normalScale', 'roughnessMap', 'metalnessMap', 'aoMap', 'aoMapIntensity', 'emissiveMap', 'alphaMap', 'alphaTest', 'transparent', 'opacity']) if (mat[k] !== undefined && mat[k] !== null) out[k] = mat[k];
    if (mat.color && src !== amberMaterial) out.color.copy(mat.color);
    // An emissive the artist set survives the upgrade (Shell glow strips, lantern panes); amber keeps its own warm value otherwise.
    if (mat.emissive && mat.emissive.getHex()) { out.emissive.copy(mat.emissive); out.emissiveIntensity = Math.max(out.emissiveIntensity || 1, mat.emissiveIntensity || 1); }
    out.userData.lookdevSlot = slot;
    done.set(mat, out);
    return out;
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(upgrade) : upgrade(o.material);
  });
  applyTextureQuality(root);
}

let textureAnisotropy = 1;

/** The renderer's anisotropy for loaded textures (LookDev sets it from `renderer.capabilities`). */
export function setTextureAnisotropy(n) { textureAnisotropy = Math.max(1, Math.min(16, Number(n) || 1)); }

/**
 * Texture sharpness for a loaded asset: anisotropic filtering on every colour / normal / ORM map
 * so ground and wall textures stay crisp at the grazing angles of the isometric camera (the single
 * cheapest legibility win on real hardware; SwiftShader ignores it). Called before the template's
 * first upload (AssetLibrary.load -> onTemplate), so no re-upload is needed.
 * @param {THREE.Object3D} root @param {number} [anisotropy] defaults to the value LookDev registered
 */
export function applyTextureQuality(root, anisotropy = textureAnisotropy) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
        const t = mat[key];
        if (t && t.isTexture && t.anisotropy < anisotropy) t.anisotropy = anisotropy;
      }
    }
  });
}


// ---- Materials that follow the hour, the weather and the wind (docs/atmosphere.md) ----
/** Material name -> role. Lit windows and lamp panes follow LookDev.light; cloth and foliage move with the wind. */
export const LOOK_ROLES = Object.freeze([
  [/^M_Town_GlassLit/, 'window'],
  [/^M_Town_Lamp/, 'lamp'],
  [/^M_Town_Cloth/, 'cloth'],
  [/^M_Town_Foliage/, 'foliage'],
]);
export function lookRole(materialName) {
  for (const [re, role] of LOOK_ROLES) if (re.test(materialName || '')) return role;
  return null;
}

const emissive = { window: new Set(), lamp: new Set() };
const levels = { windows: 1, lamps: 1 };
/** Authored lamp panes are far above the bloom threshold; windows sit just under it by day and cross it at dusk. */
const EMISSIVE_GAIN = { window: 1.0, lamp: 0.9 };

function applyEmissive(mat, role) {
  const base = mat.userData.ftfEmissiveBase ?? (mat.userData.ftfEmissiveBase = mat.emissiveIntensity || 1);
  mat.emissiveIntensity = base * EMISSIVE_GAIN[role] * (role === 'window' ? levels.windows : Math.min(1.6, 0.35 + levels.lamps));
}

/**
 * Finds the materials of a loaded model that play a look role and wires them: emissive level by the hour, wind on
 * cloth and foliage. Called for every streamed template (and safe to call again: each material is wired once).
 */
export function registerLookMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!mat) continue;
      // A wind material is wired once, but every mesh that wears it needs its own sway weights.
      if (mat.userData.ftfRole === 'cloth' || mat.userData.ftfRole === 'foliage') { windHook(null, { kind: mat.userData.ftfRole, geometry: o.geometry }); continue; }
      if (mat.userData.ftfRole !== undefined) continue;
      const role = lookRole(mat.name);
      mat.userData.ftfRole = role;
      if (role === 'window' || role === 'lamp') { emissive[role].add(mat); applyEmissive(mat, role); }
      else if (role === 'cloth' || role === 'foliage') windHook(mat, { kind: role, geometry: o.geometry, weight: o.geometry && o.geometry.getAttribute('_wind') ? 'attribute' : 'constant' });
    }
  });
}

let windHook = () => {};
/** render/weather.js registers its withWind here (materials.js stays free of the weather module's imports). */
export function setWindHook(fn) { windHook = fn; }

/** @param {{windows: number, lamps: number}} l what lit windows and lamps give now (LookDev.light) */
export function setEmissiveLevels(l) {
  if (levels.windows === l.windows && levels.lamps === l.lamps) return;
  levels.windows = l.windows; levels.lamps = l.lamps;
  for (const role of ['window', 'lamp']) for (const m of emissive[role]) applyEmissive(m, role);
}

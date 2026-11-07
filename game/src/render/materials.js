// Look-dev materials (owner concept 07.11, hybrid art direction: faceted silhouettes, detailed PBR).
// Greyboxes merge their parts per material SLOT (render/greybox.js), so a Shell is one nacre draw
// call, the Frost pavilion one glass draw call, every lantern body one amber draw call. The same
// materials upgrade loaded .glb assets by material name or asset kind (upgradeAssetMaterials).
// All materials take vertex colours, so greybox tints survive. Quality tiers toggle the expensive
// features in place (applyMaterialQuality), never swapping material objects.
import * as THREE from 'three';

/** Shared greybox material: soft grey-green matte with faceted shading (hybrid art direction). */
export const greyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });

/** Iridescent nacre for the Shells: thin-film iridescence, soft sheen, a wet clearcoat. */
export const nacreMaterial = new THREE.MeshPhysicalMaterial({
  vertexColors: true, color: 0xf4f1ee, roughness: 0.42, metalness: 0.0,
  iridescence: 0.55, iridescenceIOR: 1.28, iridescenceThicknessRange: [120, 380],
  sheen: 0.5, sheenColor: new THREE.Color(0xe6dcf5), sheenRoughness: 0.55,
  clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 1.2, side: THREE.DoubleSide,
});

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

/**
 * Applies a tier's material features in place. Changing transmission/iridescence between zero and
 * non-zero changes the shader program, so the materials are flagged for recompilation.
 * @param {{transmission:boolean, iridescence:boolean}} cfg
 */
export function applyMaterialQuality(cfg) {
  const iri = cfg.iridescence ? 0.55 : 0.0;
  if (nacreMaterial.iridescence !== iri) {
    nacreMaterial.iridescence = iri; nacreMaterial.sheen = cfg.iridescence ? 0.5 : 0.0; nacreMaterial.clearcoat = cfg.iridescence ? 0.4 : 0.0;
    nacreMaterial.needsUpdate = true;
  }
  const tr = cfg.transmission ? 1.0 : 0.0;
  if (glassMaterial.transmission !== tr) {
    glassMaterial.transmission = tr;
    if (cfg.transmission) { glassMaterial.transparent = false; glassMaterial.opacity = 1; glassMaterial.roughness = 0.06; } else Object.assign(glassMaterial, GLASS_FALLBACK);
    glassMaterial.needsUpdate = true;
  }
}

const NACRE_NAME = /nacre|shell|pearl/i, GLASS_NAME = /glass|crystal|ice/i, AMBER_NAME = /amber|lantern|lamp|glow|ember/i, GOLD_NAME = /gold|inlay|brass/i;

/**
 * Upgrades the materials of a loaded asset: Shells become nacre, material names that say glass /
 * amber / gold get the matching look. The loaded colour, maps and vertex colours are kept; only
 * the material class and its physical parameters change. Idempotent per material object.
 * @param {string} assetName catalog name (e.g. 'shell_2')
 * @param {THREE.Object3D} root
 */
export function upgradeAssetMaterials(assetName, root) {
  const isShell = /^shell_[1-4]$/.test(assetName);
  const done = new Map();
  const upgrade = (mat) => {
    if (!mat || done.has(mat)) return done.get(mat) || mat;
    const name = mat.name || '';
    let src = null;
    if (isShell || NACRE_NAME.test(name)) src = nacreMaterial;
    else if (GLASS_NAME.test(name)) src = glassMaterial;
    else if (AMBER_NAME.test(name)) src = amberMaterial;
    else if (GOLD_NAME.test(name)) src = goldMaterial;
    if (!src) { done.set(mat, mat); return mat; }
    const out = src.clone();
    out.name = name; out.vertexColors = !!mat.vertexColors;
    for (const k of ['map', 'normalMap', 'normalScale', 'roughnessMap', 'metalnessMap', 'aoMap', 'aoMapIntensity', 'emissiveMap', 'alphaMap', 'alphaTest', 'transparent', 'opacity']) if (mat[k] !== undefined && mat[k] !== null) out[k] = mat[k];
    if (mat.color && src !== amberMaterial) out.color.copy(mat.color);
    if (src === amberMaterial && mat.emissive) out.emissive.copy(mat.emissive.getHex() ? mat.emissive : out.emissive);
    out.userData.lookdevSlot = Object.keys(SLOT_MATERIALS).find((s) => SLOT_MATERIALS[s] === src);
    done.set(mat, out);
    return out;
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(upgrade) : upgrade(o.material);
  });
}

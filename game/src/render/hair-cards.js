import * as THREE from 'three';
// Alpha-tested hair cards (Iris's M_Iris_Hair): at game distance the mip chain averages a card's strand
// alpha below the glTF cutoff (0.5), the cards thin out and the scalp shell reads as a helmet. A lower
// cutoff keeps the strands, alpha-to-coverage softens their edges where the target is multisampled.
export const HAIR_ALPHA_TEST = 0.3;

/** Tunes every alpha-tested hair-card material under root (materials named ...Hair). Returns the count. */
export function tuneHairCards(root, alphaTest = HAIR_ALPHA_TEST) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !/Hair$/.test(m.name || '') || !(m.alphaTest > 0)) continue;
      m.alphaTest = alphaTest;
      m.alphaToCoverage = true;
      m.needsUpdate = true;
      n++;
    }
  });
  return n;
}


/** Iris's hair colour when the hair is drawn flat (owner 09.11: no shading, no colour shimmer, just brown). */
export const HAIR_FLAT_COLOR = 0x4a2f20;

/**
 * Flat hair (owner 09.11: "the hair turns black; no shadow effect, no shimmering colour, just brown"): every
 * hair material (`...Hair`, `...HairCap`) becomes unlit, one brown colour; the cards keep only the alpha of
 * their texture (the strand shapes), alpha-tested with alpha-to-coverage as before.
 * @returns {number} how many materials were replaced
 */
export function flatHair(root, color = HAIR_FLAT_COLOR, alphaTest = HAIR_ALPHA_TEST) {
  let n = 0;
  const done = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map((m) => {
      if (!m || !/Hair(Cap)?$/.test(m.name || '')) return m;
      if (done.has(m)) return done.get(m);
      const cards = m.alphaTest > 0 && !!m.map;
      const flat = new THREE.MeshBasicMaterial({ name: m.name, color, side: m.side, toneMapped: false });
      if (cards) {
        flat.map = m.map;
        flat.alphaTest = alphaTest;
        flat.alphaToCoverage = true;
        // the texture gives only the strand shape (alpha); the colour stays the one flat brown
        flat.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
            '#ifdef USE_MAP\n  diffuseColor.a *= texture2D( map, vMapUv ).a;\n#endif');
        };
        flat.customProgramCacheKey = () => 'ftf-flat-hair';
      }
      done.set(m, flat);
      n++;
      return flat;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  return n;
}


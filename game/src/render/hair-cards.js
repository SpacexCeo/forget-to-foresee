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

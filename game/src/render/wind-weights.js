// Sway weights for cloth and foliage that carry no authored `_WIND` attribute (render/weather.js withWind reads them).
// Pure maths on flat arrays, no three.js: render/wind-worker.js runs it off the main thread (on a mid laptop the town's
// biggest foliage mesh took a quarter of a second inside one frame; GPU bench 14.11), and the tests run it directly.

/** How computed sway weights are shaped (windWeights). Lengths in metres (model units). */
export const WIND_SHAPE = Object.freeze({
  touch: 0.03,        // parts whose boxes come this close are one object (a banner and its tail, an awning and its stripes)
  hangHeight: 1.2,    // a cloth at least this tall and taller than it is wide hangs free (a banner)
  hangFree: 0.45,     // only its lower part swings: the upper part carries an emblem made of another material
  awning: 0.3,        // a stretched sheet (awning, stall roof) only breathes a little at its lower edge
  crown: 1.5,         // foliage at least this tall is a tree crown or a big bush: it leans as one body
  smallFoliage: 0.22, // window boxes, planters: the tips barely stir (the push goes with the square of the weight)
  smallPart: 0.75,    // a foliage part lower than this is a small plant: it never joins a crown, whatever it touches
});

/**
 * Sway weights for a mesh whose file has no `_WIND` attribute (the town kit). Unknown geometry stays still: a part
 * moves only when its shape says what it is.
 *   1. The geometry is split into connected parts, and parts whose bounding boxes touch are joined into objects, so
 *      everything that belongs to one banner or one awning gets one answer and cannot slide apart.
 *   2. Cloth: a tall hanging sheet (a banner) is pinned along its upper part and free at the hem; a wide stretched
 *      sheet (an awning) breathes slightly at its lower edge; anything else made of cloth (rugs, candles, books) is 0.
 *   3. Foliage is rooted at the bottom of its object: a crown leans, small plants only stir at the tips and are
 *      never joined to a crown they touch.
 * Pure maths on the position attribute; runs once per geometry.
 * @param {{count:number, getX:(i:number)=>number, getY:(i:number)=>number, getZ:(i:number)=>number}} position
 * @param {{count:number, getX:(i:number)=>number}|null} index @param {'cloth'|'foliage'} kind
 * @returns {Float32Array} one weight per vertex, 0 = still
 */
export function windWeights(position, index, kind = 'cloth') {
  const n = position.count, parent = new Int32Array(n), S = WIND_SHAPE;
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  // the positions once into flat arrays (quantized glTF positions are read through getX), the indices as they are
  const xs = new Float64Array(n), ys = new Float64Array(n), zs = new Float64Array(n);
  for (let i = 0; i < n; i++) { xs[i] = position.getX(i); ys[i] = position.getY(i); zs[i] = position.getZ(i); }
  const idx = index ? (index.array && index.array.length >= index.count ? index.array : Array.from({ length: index.count }, (_, k) => index.getX(k))) : null;
  // Vertices at the same place are one point of the surface (seams split them for normals and UVs): welded on a
  // 0.5 mm grid through an open-addressing table of integer cells (the string keys this used to build cost half a
  // second per town chunk on a mid laptop; GPU bench 14.11)
  const qx = new Int32Array(n), qy = new Int32Array(n), qz = new Int32Array(n);
  let size = 1; while (size < n * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1), mask = size - 1;
  for (let i = 0; i < n; i++) {
    const a = Math.round(xs[i] * 2000), b = Math.round(ys[i] * 2000), c = Math.round(zs[i] * 2000);
    qx[i] = a; qy[i] = b; qz[i] = c;
    let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) & mask;
    for (;;) {
      const j = table[h];
      if (j < 0) { table[h] = i; parent[i] = i; break; }
      if (qx[j] === a && qy[j] === b && qz[j] === c) { parent[i] = j; break; }
      h = (h + 1) & mask;
    }
  }
  const tris = idx ? index.count : n;
  for (let t = 0; t + 2 < tris; t += 3) {
    const a = find(idx ? idx[t] : t), b = find(idx ? idx[t + 1] : t + 1), c = find(idx ? idx[t + 2] : t + 2);
    if (b !== a) parent[b] = a;
    const c2 = find(c); if (c2 !== a) parent[c2] = a;
  }
  // Bounding box per part (flat arrays indexed by the part's root), then parts that touch become one object.
  const bb = new Float64Array(n * 6), has = new Uint8Array(n), roots = [];
  for (let i = 0; i < n; i++) {
    const r = find(i), o = r * 6, x = xs[i], y = ys[i], z = zs[i];
    if (!has[r]) { has[r] = 1; roots.push(r); bb[o] = bb[o + 3] = x; bb[o + 1] = bb[o + 4] = y; bb[o + 2] = bb[o + 5] = z; }
    else { if (x < bb[o]) bb[o] = x; if (y < bb[o + 1]) bb[o + 1] = y; if (z < bb[o + 2]) bb[o + 2] = z; if (x > bb[o + 3]) bb[o + 3] = x; if (y > bb[o + 4]) bb[o + 4] = y; if (z > bb[o + 5]) bb[o + 5] = z; }
  }
  // Small plants (window boxes, planters) keep to themselves: a flower touching a tree crown or a bush must not
  // become part of it, or it would lean with the crown and leave its box.
  const small = new Uint8Array(n);
  if (kind === 'foliage') for (const r of roots) if (bb[r * 6 + 4] - bb[r * 6 + 1] < S.smallPart) small[r] = 1;
  const list = roots.sort((p, q) => bb[p * 6] - bb[q * 6]);
  for (let merged = true, pass = 0; merged && pass < 8; pass++) {
    merged = false;
    for (let i = 0; i < list.length; i++) {
      const A = list[i], a = A * 6;
      for (let j = i + 1; j < list.length && bb[list[j] * 6] <= bb[a + 3] + S.touch; j++) {
        const B = list[j], b = B * 6, ra = find(A), rb = find(B);
        if (ra === rb || small[A] !== small[B] || bb[b + 1] > bb[a + 4] + S.touch || bb[a + 1] > bb[b + 4] + S.touch || bb[b + 2] > bb[a + 5] + S.touch || bb[a + 2] > bb[b + 5] + S.touch) continue;
        parent[rb] = ra; merged = true;
      }
    }
  }
  // the objects' boxes, by their final roots
  const ob = new Float64Array(n * 6), hasO = new Uint8Array(n);
  for (const B of list) {
    const r = find(B), o = r * 6, b = B * 6;
    if (!hasO[r]) { hasO[r] = 1; for (let k = 0; k < 6; k++) ob[o + k] = bb[b + k]; }
    else { for (let k = 0; k < 3; k++) { if (bb[b + k] < ob[o + k]) ob[o + k] = bb[b + k]; if (bb[b + k + 3] > ob[o + k + 3]) ob[o + k + 3] = bb[b + k + 3]; } }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = find(i), o = r * 6, h = ob[o + 4] - ob[o + 1], wide = Math.max(ob[o + 3] - ob[o], ob[o + 5] - ob[o + 2]);
    if (h < 1e-4) continue;
    const k = (ys[i] - ob[o + 1]) / h; // 0 at the bottom of the object, 1 at its top
    if (kind === 'foliage') out[i] = k * (h >= S.crown && !small[r] ? 1 : S.smallFoliage);
    else if (h >= S.hangHeight && h >= wide * 1.2) out[i] = Math.max(0, 1 - k / S.hangFree);
    else if (wide >= 1.5 && h >= 0.2 && h < wide * 0.6) out[i] = S.awning * (1 - k);
  }
  return out;
}

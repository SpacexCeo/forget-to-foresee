// Deterministic helpers for the simulation: a private LCG for strategy choices
// (so the game RNG is never touched) and a seeded byte source for v2 salts.

/** LCG in [0,1). Same construction as tests/lib/policies.mjs. */
export function makeChooser(seed) {
  let q = (seed * 7919) >>> 0;
  return () => { q = (Math.imul(q, 1664525) + 1013904223) >>> 0; return q / 4294967296; };
}

/** Seeded replacement for crypto.getRandomValues: v2 salts become reproducible per seed.
 *  (The v2 tests prove the salt bytes never influence gameplay.) */
export function makeRandomBytes(seed) {
  let x = ((seed ^ 0x9e3779b9) >>> 0) || 1;
  return (n) => {
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; a[i] = x & 255; }
    return a;
  };
}

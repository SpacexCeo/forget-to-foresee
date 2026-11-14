// The sway-weight worker (render/weather.js windWeightsAsync): the town's cloth and foliage weights computed off the
// main thread. In: {id, pos: Float32Array xyz, idx: Uint32Array|null, kind}. Out: {id, out: Float32Array}.
import { windWeights } from './wind-weights.js';

self.onmessage = (e) => {
  const { id, pos, idx, kind } = e.data || {};
  let out = null;
  try {
    const n = pos.length / 3;
    const position = { count: n, getX: (i) => pos[i * 3], getY: (i) => pos[i * 3 + 1], getZ: (i) => pos[i * 3 + 2] };
    const index = idx ? { count: idx.length, array: idx, getX: (k) => idx[k] } : null;
    out = windWeights(position, index, kind);
  } catch { out = null; }
  if (out) self.postMessage({ id, out }, [out.buffer]); else self.postMessage({ id, out: null });
};

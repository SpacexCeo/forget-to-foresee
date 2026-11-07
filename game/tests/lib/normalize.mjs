// Canonical, comparable view of a season: drops UI-only and presentation fields.
import { createHash } from 'node:crypto';

const DROP = new Set(['feed', 'ui', 'fx', 'version', 'rulesVersion']);

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = canon(v[k]);
    return o;
  }
  return v;
}

export function normalize(S) {
  const o = {};
  for (const k of Object.keys(S)) if (!DROP.has(k)) o[k] = S[k];
  return canon(JSON.parse(JSON.stringify(o)));
}
export const stateHash = (S) => createHash('sha256').update(JSON.stringify(normalize(S))).digest('hex').slice(0, 16);

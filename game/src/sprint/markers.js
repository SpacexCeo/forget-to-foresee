// Map and waypoint markers shared by the journal, the tracker and the minimap (sprint plan 3.2). Each source owns its
// list: setMarkers(sourceId, list) replaces that source's markers; getMarkers() merges every source.
// marker = {id, kind: 'quest-available'|'quest-ready'|'quest-area'|'npc'|'portal'|'market', pos: [x, z], radius?, label,
// color?, pinned?} in town-local metres (the frame of quests-data.js waypoint.town).
const KINDS = new Set(['quest-available', 'quest-ready', 'quest-area', 'npc', 'portal', 'market']);
const sources = new Map();
const listeners = new Set();
let cache = null;

const valid = (m) => !!(m && typeof m.id === 'string' && KINDS.has(m.kind) && Array.isArray(m.pos) && m.pos.length === 2 && m.pos.every(Number.isFinite) && typeof m.label === 'string');

export function setMarkers(sourceId, list) {
  sources.set(String(sourceId), (Array.isArray(list) ? list : []).filter(valid).map((m) => ({ ...m, pos: [m.pos[0], m.pos[1]] })));
  cache = null;
  const all = getMarkers();
  for (const fn of [...listeners]) { try { fn(all); } catch { /* the listener's own problem */ } }
}
export function getMarkers() {
  if (!cache) { cache = []; for (const l of sources.values()) cache.push(...l); cache.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)); }
  return cache.slice();
}
export function onMarkers(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function _reset() { sources.clear(); listeners.clear(); cache = null; }

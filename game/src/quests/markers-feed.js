// Quest markers for the minimap and the big map (sprint §4.9; A2 draws them): a gold "!" at a giver with a quest on
// offer, a green "?" where a quest is turned in, the objective areas of active quests as circles, the Gate-Loom; the
// tracked quests' markers are pinned (drawn larger). Pure; positions [x, z] in town-local metres. Published by the host
// as a window event 'ftf:markers' {source: 'quests', list} (and, once A5's seam exists, setMarkers('quests', list)).
import { QUESTS } from '../game/quests-data.js';
import { JOURNAL_BY_ID } from '../game/journal-data.js';
import { questStatus } from '../game/quest-rules.js';
import { missingFor } from '../game/resources.js';

/**
 * @param {{qs: object, now?: number, have?: object, tracked?: string[], giverAt: (giver: string) => number[]|null, portal?: number[]|null, giverName?: (k: string) => string}} o
 *   giverAt returns a giver's town-local [x, z]
 */
export function questMarkers({ qs, now = 0, have = {}, tracked = [], giverAt, portal = null, giverName = (k) => k, tr = null }) {
  const L = (k, en) => { const v = tr ? tr(k) : null; return v && v !== k ? v : en; };
  const out = [], seen = new Set();
  for (const id of Object.keys(QUESTS)) {
    const def = QUESTS[id], j = JOURNAL_BY_ID[id], st = questStatus(qs, id, now), pinned = tracked.includes(id);
    if (st === 'ready' && !def.auto && !missingFor(def.needs, have).length) { const p = giverAt(j ? j.turnIn : def.giver); if (p && !seen.has('r:' + def.giver)) { seen.add('r:' + def.giver); out.push({ id: 'ready:' + id, kind: 'quest-ready', pos: p, label: giverName(def.giver), pinned }); } }
    else if (st === 'available' && !def.auto) { const p = giverAt(def.giver); if (p && !seen.has('a:' + def.giver)) { seen.add('a:' + def.giver); out.push({ id: 'avail:' + id, kind: 'quest-available', pos: p, label: giverName(def.giver), pinned }); } }
    if ((st === 'active' || st === 'ready') && j) for (const m of j.markers) if (m.kind === 'quest-area' && !seen.has('m:' + m.id)) { seen.add('m:' + m.id); out.push({ id: m.id, kind: 'quest-area', pos: m.pos.slice(), radius: m.radius, label: L('jq.marker.' + m.id, m.label), pinned }); }
  }
  if (portal) out.push({ id: 'portal', kind: 'portal', pos: portal.slice(), label: L('quest.marker.gate', 'Gate-Loom') });
  return out;
}

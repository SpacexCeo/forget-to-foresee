// Demo seeding (sprint plan 8.5): ?demo=video | quests | market, never active without the query. Browser-only state;
// a visible "Demo data" chip stays on screen while a seed is active (honest labels, rule 6). It never fakes on-chain
// silk. Each sprint area reads the seed it needs from the bus state 'demo.seed' (A1 quests, A2 level and skills,
// A3 bag and market, A4 tournament).
import { state, emit } from './bus.js';

export const SEEDS = Object.freeze({
  video: Object.freeze({
    intro: true,
    level: 6, xp: 1500, skillPoints: 5, learned: Object.freeze(['ling_diction', 'ling_echo']),
    quests: Object.freeze({ completed: ['q_welcome'], active: [{ id: 'q_spiders', count: 7, of: 10, pinned: true }], available: ['q_part', 's_chest', 's_trade'] }),
    bag: Object.freeze({ chests: 8, items: { spider_silk_thread: 12, chitin_plate: 4, shard: 2, spare_part: 1 } }),
    playSilk: 20,
    tournament: Object.freeze({ agents: ['Scribe-1', 'Scribe-2', 'Scribe-3'] }),
  }),
  quests: Object.freeze({ quests: Object.freeze({ completed: ['q_welcome'], active: [{ id: 'q_spiders', count: 7, of: 10, pinned: true }], available: ['q_part', 's_chest', 's_trade'] }) }),
  market: Object.freeze({ market: Object.freeze({ seller: 'Tobias', listings: 3, settlement: 'demo' }) }),
});

/** Pure: which seed the URL asks for (null when none). */
export function seedFromQuery(search = '') {
  let q = null; try { q = new URLSearchParams(search).get('demo'); } catch { q = null; }
  return q && Object.prototype.hasOwnProperty.call(SEEDS, q) ? q : null;
}

function chip(doc) {
  if (!doc || !doc.body || (doc.getElementById && doc.getElementById('ftf-demo-chip'))) return;
  const c = doc.createElement('div'); c.id = 'ftf-demo-chip'; c.textContent = 'Demo data'; c.setAttribute('role', 'note');
  c.style.cssText = 'position:fixed;left:calc(8px + env(safe-area-inset-left, 0px));top:calc(4px + env(safe-area-inset-top, 0px));z-index:var(--z-toast,70);padding:2px 8px;border-radius:6px;'
    + 'background:rgba(14,16,24,.85);border:1px solid var(--ftf-warn,#f0b24a);color:var(--ftf-warn,#f0b24a);font:700 12px/1.4 system-ui,sans-serif;pointer-events:none';
  doc.body.append(c);
}

/** applyDemoSeed(name): publishes the seed on the bus state and shows the chip. Returns the seed or null. */
export function applyDemoSeed(name, { doc = globalThis.document } = {}) {
  const seed = SEEDS[name]; if (!seed) return null;
  state.set('demo.seed', { name, ...seed });
  chip(doc);
  emit('demo.seeded', { name });
  return seed;
}

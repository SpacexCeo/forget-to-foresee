// The off-chain inventory (docs/entry-wheel-items-plan.md): item counts in this browser, from the items manifest
// (game/public/assets/items/manifest.json). Local only; the on-chain tab lists chain-confirmed tokens elsewhere
// (play/profile.js readOnChain). Pure apart from storage.
export const INVENTORY_KEY = 'ftf.inventory.v1';
export const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'legendary']);

// Every live inventory per storage: several parts of the game each make their own (the quests, the salvage drops, the
// game menu). Each one reads the saved state before every use and a write tells the others, so none keeps a stale copy
// in memory and overwrites another's item (owner 13.11: salvage parts vanished when the quests saved a chitin plate).
const LIVE = new Set();

export function createInventory({ storage = null, now = () => Date.now() } = {}) {
  let st = null;
  const read = () => { let s = null; try { s = JSON.parse((storage && storage.getItem(INVENTORY_KEY)) || 'null'); } catch { s = null; } return s && s.v === 1 ? s : { v: 1, items: {}, newest: null }; };
  st = read();
  const fresh = () => { if (storage) st = read(); return st; };   // without storage the memory copy is the only one
  const listeners = new Set();
  const self = { listeners, storage };
  const save = (id) => {
    try { if (storage) storage.setItem(INVENTORY_KEY, JSON.stringify(st)); } catch { /* memory only */ }
    if (storage) for (const o of [...LIVE]) if (o !== self && o.storage === storage) for (const fn of [...o.listeners]) fn(id);
  };
  if (storage) LIVE.add(self);
  return {
    count: (id) => { fresh(); return st.items[id] ? st.items[id].n : 0; },
    /** Re-reads the saved inventory (another part of the game may have added items since this one was made). */
    reload() { st = read(); for (const fn of [...listeners]) fn(null); },
    get newest() { return fresh().newest; },
    /** Adds `n` of an item; `source` is shown on the card ("wheel", "quest"). */
    add(id, n = 1, source = 'wheel') {
      fresh(); const cur = st.items[id] || { n: 0, source, first: now() };
      cur.n += n; st.items[id] = cur; st.newest = id; save(id);
      for (const fn of [...listeners]) fn(id);
      return cur.n;
    },
    /** Removes `n` of an item if there are that many (a quest turn-in consumes resources); true when taken. */
    take(id, n = 1) {
      fresh(); const cur = st.items[id]; if (!cur || cur.n < n || !(n > 0)) return false;
      cur.n -= n; if (cur.n === 0) delete st.items[id]; save(id);
      for (const fn of [...listeners]) fn(id);
      return true;
    },
    /** [{id, n, source, first}] for the manifest's items the player owns, rarest first. */
    list(manifest = []) {
      fresh(); const rank = (r) => -RARITIES.indexOf(r || 'common');
      return manifest.filter((m) => st.items[m.id]).map((m) => ({ ...m, ...st.items[m.id] })).sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.id.localeCompare(b.id));
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Stops hearing other inventories' writes (a closed view). */
    dispose() { LIVE.delete(self); listeners.clear(); },
  };
}

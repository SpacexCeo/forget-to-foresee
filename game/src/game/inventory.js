// The off-chain inventory (docs/entry-wheel-items-plan.md): item counts in this browser, from the items manifest
// (game/public/assets/items/manifest.json). Local only; the on-chain tab lists chain-confirmed tokens elsewhere
// (play/profile.js readOnChain). Pure apart from storage.
export const INVENTORY_KEY = 'ftf.inventory.v1';
export const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'legendary']);

export function createInventory({ storage = null, now = () => Date.now() } = {}) {
  let st = null;
  const read = () => { let s = null; try { s = JSON.parse((storage && storage.getItem(INVENTORY_KEY)) || 'null'); } catch { s = null; } return s && s.v === 1 ? s : { v: 1, items: {}, newest: null }; };
  st = read();
  const save = () => { try { if (storage) storage.setItem(INVENTORY_KEY, JSON.stringify(st)); } catch { /* memory only */ } };
  const listeners = new Set();
  return {
    count: (id) => (st.items[id] ? st.items[id].n : 0),
    /** Re-reads the saved inventory (another part of the game may have added items since this one was made). */
    reload() { st = read(); for (const fn of [...listeners]) fn(null); },
    get newest() { return st.newest; },
    /** Adds `n` of an item; `source` is shown on the card ("wheel", "quest"). */
    add(id, n = 1, source = 'wheel') {
      const cur = st.items[id] || { n: 0, source, first: now() };
      cur.n += n; st.items[id] = cur; st.newest = id; save();
      for (const fn of [...listeners]) fn(id);
      return cur.n;
    },
    /** Removes `n` of an item if there are that many (a quest turn-in consumes resources); true when taken. */
    take(id, n = 1) {
      const cur = st.items[id]; if (!cur || cur.n < n || !(n > 0)) return false;
      cur.n -= n; if (cur.n === 0) delete st.items[id]; save();
      for (const fn of [...listeners]) fn(id);
      return true;
    },
    /** [{id, n, source, first}] for the manifest's items the player owns, rarest first. */
    list(manifest = []) {
      const rank = (r) => -RARITIES.indexOf(r || 'common');
      return manifest.filter((m) => st.items[m.id]).map((m) => ({ ...m, ...st.items[m.id] })).sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.id.localeCompare(b.id));
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

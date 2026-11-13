// The friends list (owner, 13.11, Social track): players you added from their card, saved in this browser for your
// account (the Day 1 guest; "local" before one exists). Pure storage; the menu's Friends tab and the player card
// read it. Saved on this device only: the card and the menu say so.
export const FRIENDS_KEY = 'ftf.friends.v1';
const keyFor = (me) => FRIENDS_KEY + ':' + (me || 'local');
const idOf = (p) => p.account || 'name:' + String(p.name || '').toLowerCase();

export function createFriends({ storage, me = null, now = () => Date.now() }) {
  const read = () => { try { const v = JSON.parse(storage.getItem(keyFor(me)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const write = (list) => { try { storage.setItem(keyFor(me), JSON.stringify(list.slice(0, 200))); } catch { /* memory only */ } };
  return {
    list: () => read(),
    has: (p) => read().some((f) => f.id === idOf(p)),
    /** Adds a player ({name, account?, skin?, demo?}); returns false when already a friend or no name. */
    add(p) {
      if (!p || !p.name) return false;
      const l = read(); if (l.some((f) => f.id === idOf(p))) return false;
      l.push({ id: idOf(p), name: String(p.name).slice(0, 40), account: p.account || null, skin: p.skin || 'iris', demo: !!p.demo, since: now() }); write(l); return true;
    },
    remove(p) { const l = read(), n = l.filter((f) => f.id !== idOf(p)); write(n); return n.length !== l.length; },
  };
}

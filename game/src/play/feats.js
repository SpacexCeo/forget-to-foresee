// The shared town's action feed, the watching side (owner 13.11: "I want to see my friend's actions"): notices the
// player's notable actions (a level gained, a chest opened, the Crownrift felled, and what other code raises as the
// window event 'ftf:feat') and reports each once. No network and no three.js here: play/multiplayer.js passes them to
// the presence client (net/presence.js act), which sends only whitelisted kinds, never text.

/** The window event other parts of the game raise for a notable action: detail {k, v?} (net/presence.js ACTS). */
export const FEAT_EVENT = 'ftf:feat';

/**
 * Watches the game for notable actions and reports each once through `act(k, v)`. Returns the function that stops it.
 * @param {{act: Function, ledger?: object, chests?: object, win?: object}} o ledger: the town ledger (levels); chests: the chest bag
 */
export function watchFeats({ act, ledger = null, chests = null, win = globalThis.window }) {
  const offs = [];
  const levelNow = () => { try { const l = ledger.level; return Number(l && typeof l === 'object' ? l.level : l) || 0; } catch { return 0; } };
  if (ledger && ledger.subscribe) {
    let level = levelNow();
    offs.push(ledger.subscribe(() => { const n = levelNow(); if (n > level) act('level', Math.min(99, n)); level = Math.max(level, n); }));
  }
  if (chests && chests.subscribe) {
    const seen = new Set(chests.opened().map((c) => c.id));
    offs.push(chests.subscribe(() => { for (const c of chests.opened()) if (!seen.has(c.id)) { seen.add(c.id); act('chest', c.tier); } }));
  }
  if (win && win.addEventListener) {
    const onFeat = (e) => { const d = e && e.detail; if (d && typeof d.k === 'string') act(d.k, d.v ?? null); };
    const onMob = (e) => { const d = e && e.detail; if (d && d.type === 'crownrift') act('boss', 'crownrift'); };
    win.addEventListener(FEAT_EVENT, onFeat); win.addEventListener('ftf:mob-killed', onMob);
    offs.push(() => { win.removeEventListener(FEAT_EVENT, onFeat); win.removeEventListener('ftf:mob-killed', onMob); });
  }
  return () => { for (const f of offs.splice(0)) { try { if (f) f(); } catch { /* already gone */ } } };
}

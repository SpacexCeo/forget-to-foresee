// The first-seen tips owned by A4 (sprint 1.5, 7.7) and the queue rules every coach mark follows: one tip at a time,
// never during a cinematic, a dialogue or a modal, the next one 1.5 s after the last was dismissed, and at most
// three in any minute (the rest wait for the next minute). The coach-mark component itself is the seam's
// (sprint/first-seen.js); `registerTips` hands it these entries.
import TIPS from '../play/locales/en-tips.js';

/** id, bus trigger, anchor selector (the HUD owner's elements; first match wins). */
export const A4_TIPS = Object.freeze([
  { id: 'tip.silk', trigger: 'hud.mounted', anchor: '[data-anchor="silk"], .ph-silk' },
  { id: 'tip.hp', trigger: 'hud.mounted', anchor: '[data-anchor="hp"], .ph-hp' },
  { id: 'tip.mana', trigger: 'hud.mounted', anchor: '[data-anchor="mana"], .ph-st' },
  { id: 'tip.xp', trigger: 'xp.gained', anchor: '[data-anchor="xp"], .ph-xp' },
  { id: 'tip.hotbar', trigger: 'hud.mounted', anchor: '[data-anchor="hotbar"]' },
  { id: 'tip.minimap', trigger: 'hud.mounted', anchor: '[data-anchor="minimap"]' },
  { id: 'tip.tournament', trigger: 'tournament.opened', anchor: '[data-anchor="tournament"], .ftf-tour-card' },
  { id: 'tip.chat', trigger: 'hud.mounted', anchor: '[data-anchor="chat"]' },
]);
export const QUEUE = Object.freeze({ gapMs: 1500, perMinute: 3, windowMs: 60_000 });

const fmt = (s, a) => String(s).replace(/\{(\w+)\}/g, (m, k) => (a && a[k] != null ? String(a[k]) : m));
/** Title and body for a tip id with the placeholders filled. */
export const tipText = (id, vars = {}) => ({ title: fmt(TIPS[id + '.title'] || id, vars), body: fmt(TIPS[id + '.body'] || '', vars) });

/** Registers the A4 tips with the seam: firstSeen.registerTip({id, trigger, anchor, title, body}). */
export function registerTips(firstSeen, vars = {}) {
  for (const tip of A4_TIPS) firstSeen.registerTip({ ...tip, ...tipText(tip.id, vars) });
  return A4_TIPS.length;
}

/**
 * The queue (pure but for the clock): push(id) asks to show a tip; next(now, {busy}) returns the id to show now or
 * null; dismissed(now) records the end of the shown tip. `busy` is true while a cinematic, a dialogue or a modal is open.
 */
export function createTipQueue({ seen = new Set(), rules = QUEUE } = {}) {
  const waiting = []; const shownAt = []; let showing = null, lastEnd = -Infinity;
  return {
    push(id) { if (!seen.has(id) && !waiting.includes(id) && showing !== id) waiting.push(id); },
    next(now, { busy = false } = {}) {
      if (showing || busy || !waiting.length) return null;
      if (now - lastEnd < rules.gapMs) return null;
      while (shownAt.length && now - shownAt[0] >= rules.windowMs) shownAt.shift();
      if (shownAt.length >= rules.perMinute) return null;
      showing = waiting.shift(); shownAt.push(now); seen.add(showing);
      return showing;
    },
    dismissed(now) { showing = null; lastEnd = now; },
    skipAll() { for (const id of waiting.splice(0)) seen.add(id); },
    get showing() { return showing; }, get waiting() { return waiting.slice(); },
  };
}

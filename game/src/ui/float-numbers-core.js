// Floating numbers, the pure part (a reference game teardown M5 / F1; reimplemented from the behaviour, in our quiet palette).
// Kinds (sprint plan 5.13): damage dealt (white), critical ("34!", gold, a quick 1.0 -> 1.4 -> 1.0 pop), damage taken
// ("−7", red, drifts left), heal ("+12", green), silk gained ("+3 silk"), silk spent, XP ("+20 XP", violet, merges
// within XP_MERGE_MS), miss ("Miss", muted). Hits on the same target within MERGE_MS merge into one number that grows a
// little. Reduced motion: no pop, no jitter, no rise: a plain fade in place.

export const POOL = 24;
export const MERGE_MS = 250;
export const RISE_PX = 40;
export const XP_MERGE_MS = 400;
export const KIND = Object.freeze({
  damage: { life: 700, pop: 1.15, size: 18, color: '#ffffff', rise: 40 },
  crit: { life: 1100, pop: 'bounce', size: 26, color: '#f6c860', rise: 40, jitter: 4, jitterMs: 200 },
  taken: { life: 800, pop: 1.1, size: 20, color: '#ff6b62', rise: 30, drift: -14 },
  heal: { life: 800, pop: 1.1, size: 18, color: '#5ccf8a', rise: 40 },
  silk_gain: { life: 900, pop: 1.15, size: 16, color: '#e8dcb4', rise: 40 },
  silk_spend: { life: 900, pop: 1.0, size: 16, color: '#9a9283', rise: 30 },
  xp: { life: 900, pop: 1.1, size: 14, color: '#b06cff', rise: 40 },
  miss: { life: 700, pop: 1.0, size: 14, color: '#aab1c5', rise: 24 },
});
/** The colour a number shows: its tint for plain damage, else its kind's colour. */
export const colorOf = (n) => (n.kind === 'damage' && n.tint) || (KIND[n.kind] || KIND.damage).color;
/** Numbers of other players are smaller. */
export const OTHER_SIZE = Object.freeze({ normal: 14, crit: 20 });

const silkNum = (a) => (Number.isInteger(Math.round(a * 100) / 100) ? String(Math.round(a)) : (Math.round(a * 100) / 100).toFixed(2).replace(/0$/, ''));
/** The text of a number: "+3 silk" (whole, else up to 2 decimals), "+20 XP", "34!" for a crit, "−7" taken, "+12" healed, "Miss". */
export function textOf(kind, amount, xpUnit = 'XP', words = {}) {
  const a = Math.abs(Number(amount) || 0);
  if (kind === 'silk_gain') return '+' + silkNum(a) + ' ' + (words.silk || 'silk');
  if (kind === 'silk_spend') return '−' + silkNum(a) + ' ' + (words.silk || 'silk');
  if (kind === 'xp') return '+' + Math.round(a) + ' ' + xpUnit;
  if (kind === 'crit') return Math.round(a) + '!';
  if (kind === 'taken') return '−' + Math.round(a);
  if (kind === 'heal') return '+' + Math.round(a);
  if (kind === 'miss') return words.miss || 'Miss';
  return String(Math.round(a));
}

/**
 * Merge or add: a hit on the same target (same kind family) within MERGE_MS adds to the live number, which grows by 5 %
 * per merge up to 1.5x. Returns the number that now shows the event. `live` is mutated.
 */
export function mergeOrAdd(live, ev, now) {
  const family = ev.kind === 'crit' ? 'damage' : ev.kind;
  if (family === 'xp') {                                                           // XP stacks: one growing "+N XP" within the merge window
    const m = live.find((n) => n.family === 'xp' && n.target === (ev.target ?? null) && now - n.lastAt <= XP_MERGE_MS);
    if (m) { m.amount += ev.amount; m.merges++; m.lastAt = now; return m; }
  }
  if (ev.target != null && (family === 'damage')) {
    const m = live.find((n) => n.target === ev.target && n.family === 'damage' && now - n.lastAt <= MERGE_MS);
    if (m) {
      m.amount += ev.amount; m.merges++; m.grow = Math.min(1.5, 1 + 0.05 * m.merges); m.lastAt = now;
      if (ev.kind === 'crit') { m.kind = 'crit'; m.born = now; }
      return m;
    }
  }
  // `tint`: a plain damage number in the blow's element (the casts: ice blue, storm violet); crits stay gold
  const n = { kind: ev.kind, family, target: ev.target ?? null, amount: ev.amount, pos: ev.pos, other: !!ev.other, born: now, lastAt: now, merges: 0, grow: 1, tint: ev.tint || null };
  live.push(n);
  while (live.length > POOL) live.shift();
  return n;
}

/** Scale, rise (px), opacity and jitter (px) of a number at age `ms`. */
export function curve(kind, ms, reduced = false) {
  const k = KIND[kind] || KIND.damage;
  const t = Math.max(0, ms) / k.life;
  const opacity = t >= 1 ? 0 : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
  if (reduced) return { scale: 1, rise: 0, opacity, jitter: 0 };
  const popT = Math.min(1, ms / 120);
  const scale = k.pop === 'bounce' ? 1 + 0.4 * Math.sin(Math.PI * Math.min(1, ms / 160)) : k.pop + (1 - k.pop) * (1 - Math.pow(1 - popT, 3));
  const rise = (k.rise || RISE_PX) * Math.min(1, ms / 700);
  const jitter = k.jitter && ms < k.jitterMs ? k.jitter * (1 - ms / k.jitterMs) : 0;
  return { scale, rise, opacity, jitter, drift: (k.drift || 0) * Math.min(1, ms / 700) };
}

export const sizeOf = (n) => (n.other ? (n.kind === 'crit' ? OTHER_SIZE.crit : OTHER_SIZE.normal) : (KIND[n.kind] || KIND.damage).size);
export const alive = (n, now) => now - n.born < (KIND[n.kind] || KIND.damage).life;

// Floating numbers, the pure part (FEED FIRE teardown M5 / F1; reimplemented from the behaviour, in our quiet palette).
// Kinds: damage, crit (a finisher too), silk_gain, silk_spend, xp. Hits on the same target within MERGE_MS merge into
// one number that grows a little; crits pop larger and live longer. Reduced motion: no pop, no jitter, a plain fade.

export const POOL = 24;
export const MERGE_MS = 250;
export const RISE_PX = 33;
export const KIND = Object.freeze({
  damage: { life: 650, pop: 1.2, size: 18, color: '#f3ead6' },
  crit: { life: 1600, pop: 3.0, size: 46, color: '#f6c860', jitter: 6, jitterMs: 300 },
  silk_gain: { life: 900, pop: 1.2, size: 18, color: '#f2dfae' },
  silk_spend: { life: 900, pop: 1.0, size: 16, color: '#9a9283' },
  xp: { life: 900, pop: 1.15, size: 16, color: '#a9d6e6' },
});
/** Numbers of other players are smaller. */
export const OTHER_SIZE = Object.freeze({ normal: 16, crit: 28 });

/** The text of a number: silk with two decimals and a sign, XP with its unit, damage as a whole number. */
export function textOf(kind, amount, xpUnit = 'XP') {
  const a = Math.abs(Number(amount) || 0);
  if (kind === 'silk_gain') return '+' + a.toFixed(2);
  if (kind === 'silk_spend') return '−' + a.toFixed(2);
  if (kind === 'xp') return '+' + Math.round(a) + ' ' + xpUnit;
  return String(Math.round(a));
}

/**
 * Merge or add: a hit on the same target (same kind family) within MERGE_MS adds to the live number, which grows by 5 %
 * per merge up to 1.5x. Returns the number that now shows the event. `live` is mutated.
 */
export function mergeOrAdd(live, ev, now) {
  const family = ev.kind === 'crit' ? 'damage' : ev.kind;
  if (ev.target != null && (family === 'damage')) {
    const m = live.find((n) => n.target === ev.target && n.family === 'damage' && now - n.lastAt <= MERGE_MS);
    if (m) {
      m.amount += ev.amount; m.merges++; m.grow = Math.min(1.5, 1 + 0.05 * m.merges); m.lastAt = now;
      if (ev.kind === 'crit') { m.kind = 'crit'; m.born = now; }
      return m;
    }
  }
  const n = { kind: ev.kind, family, target: ev.target ?? null, amount: ev.amount, pos: ev.pos, other: !!ev.other, born: now, lastAt: now, merges: 0, grow: 1 };
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
  const scale = k.pop + (1 - k.pop) * (1 - Math.pow(1 - popT, 3));
  const rise = RISE_PX * Math.min(1, t * 1.4);
  const jitter = k.jitter && ms < k.jitterMs ? k.jitter * (1 - ms / k.jitterMs) : 0;
  return { scale, rise, opacity, jitter };
}

export const sizeOf = (n) => (n.other ? (n.kind === 'crit' ? OTHER_SIZE.crit : OTHER_SIZE.normal) : (KIND[n.kind] || KIND.damage).size);
export const alive = (n, now) => now - n.born < (KIND[n.kind] || KIND.damage).life;

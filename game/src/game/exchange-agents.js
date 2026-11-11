// The Foresight Exchange's scripted agents (docs/agent-market-plan.md §5.7). Each policy receives only the mids already
// public (window bars up to the current one), its own positions and cash, and returns one market order or null.
// Deterministic; no randomness; they never see a future bar because they are never given one.

const IDS = ['salt', 'amber', 'frost'];
const last = (a) => a[a.length - 1];

/** Salt, cautious: the last three changes share a sign -> buy 1 on a rise (when flat), sell all on a fall. */
function salt({ history, positions }) {
  for (const id of IDS) {
    const h = history[id];
    if (h.length < 4) continue;
    const d = [h[h.length - 3] - h[h.length - 4], h[h.length - 2] - h[h.length - 3], last(h) - h[h.length - 2]];
    if (d.every((x) => x > 0) && positions[id] === 0) return { echo: id, side: 'buy', qty: 1 };
    if (d.every((x) => x < 0) && positions[id] > 0) return { echo: id, side: 'sell', qty: positions[id] };
  }
  return null;
}

/** Amber, eager: sell what is back above its first price; else buy 1 of the Echo that fell most (at most 2 units held). */
function amber({ history, positions }) {
  for (const id of IDS) if (positions[id] > 0 && last(history[id]) > history[id][0]) return { echo: id, side: 'sell', qty: positions[id] };
  const held = IDS.reduce((s, id) => s + positions[id], 0);
  if (held >= 2) return null;
  let best = null, drop = 0;
  for (const id of IDS) { const dd = history[id][0] - last(history[id]); if (dd > drop) { drop = dd; best = id; } }
  return best ? { echo: best, side: 'buy', qty: 1 } : null;
}

/** Frost, mean reversion: buy 1 when the price is 0.3 % under the visible average; flatten when it is above. */
function frost({ history, positions }) {
  for (const id of IDS) {
    const h = history[id];
    if (h.length < 2) continue;
    const avg = h.reduce((s, x) => s + x, 0) / h.length;
    if (last(h) < avg * 0.997 && positions[id] === 0) return { echo: id, side: 'buy', qty: 1 };
    if (last(h) > avg && positions[id] > 0) return { echo: id, side: 'sell', qty: positions[id] };
  }
  return null;
}

export const POLICIES = Object.freeze({ salt, amber, frost });

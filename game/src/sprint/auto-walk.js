// Auto-walk (sprint §4.10; A1 implements this seam): "click a quest and Iris runs to the giver". planPath is a pure A*
// on a 1 m grid over what `blocked(x, z)` allows, smoothed by string pulling; without collider data it is a straight
// line (the town's physics still slides her along walls). createAutoWalk drives the town's own route steering (the same
// movement entry as the keyboard, so animation, footsteps and camera behave normally), stops at stopRadius from the
// target, refreshes a moving target every 2 s, and cancels on W A S D (the town clears its route on any movement key),
// on a new walk (replaced) or when no progress is made for 6 s (blocked). Events: autowalk.started / arrived /
// cancelled with {questId?, to: [x, z], reason?}.

/** A* on a grid: from/to [x, z]; returns [[x, z], ...] (to included) or null when no path within maxLen. */
export function planPath(from, to, { blocked = null, step = 1, maxLen = 400, maxNodes = 40_000 } = {}) {
  const direct = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (direct > maxLen) return null;
  if (!blocked) return [[to[0], to[1]]];
  const key = (x, z) => x + ',' + z, gx = (v) => Math.round(v / step);
  const start = [gx(from[0]), gx(from[1])], goal = [gx(to[0]), gx(to[1])];
  if (blocked(goal[0] * step, goal[1] * step)) return null;
  const h = (x, z) => Math.hypot(goal[0] - x, goal[1] - z);
  const open = new Map([[key(...start), { x: start[0], z: start[1], g: 0, f: h(...start), p: null }]]), closed = new Map();
  let nodes = 0;
  while (open.size && nodes++ < maxNodes) {
    let cur = null; for (const n of open.values()) if (!cur || n.f < cur.f) cur = n;
    open.delete(key(cur.x, cur.z)); closed.set(key(cur.x, cur.z), cur);
    if (cur.x === goal[0] && cur.z === goal[1]) {
      const out = []; for (let n = cur; n; n = n.p) out.push([n.x * step, n.z * step]);
      out.reverse(); out[out.length - 1] = [to[0], to[1]];
      return smoothPath([[from[0], from[1]], ...out.slice(1)], blocked, step).slice(1);
    }
    if (cur.g * step > maxLen) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = cur.x + dx, z = cur.z + dz, k = key(x, z);
      if (closed.has(k) || blocked(x * step, z * step)) continue;
      if (dx && dz && (blocked((cur.x + dx) * step, cur.z * step) || blocked(cur.x * step, (cur.z + dz) * step))) continue; // no corner cutting
      const g = cur.g + Math.hypot(dx, dz), o = open.get(k);
      if (!o || g < o.g) open.set(k, { x, z, g, f: g + h(x, z), p: cur });
    }
  }
  return null;
}

/** String pulling: drops waypoints that a straight, unblocked line can skip. */
export function smoothPath(path, blocked, step = 1) {
  if (!blocked || path.length < 3) return path;
  const clear = (a, b) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (step / 2)); for (let i = 1; i < n; i++) { const t = i / n; if (blocked(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false; } return true; };
  const out = [path[0]]; let i = 0;
  while (i < path.length - 1) { let j = path.length - 1; while (j > i + 1 && !clear(path[i], path[j])) j--; out.push(path[j]); i = j; }
  return out;
}

/** The point at `stop` metres short of the target along the last leg (where she stops to talk). */
export function stopPoint(from, to, stop) {
  const dx = to[0] - from[0], dz = to[1] - from[1], d = Math.hypot(dx, dz);
  if (d <= stop) return [from[0], from[1]];
  return [to[0] - dx / d * stop, to[1] - dz / d * stop];
}

/**
 * @param {object} o
 * @param {{setRoute: (points: number[][]) => void, cancel: () => void, active: () => boolean, ended?: () => 'done'|'cancel'|null, pos: () => number[]}} o.driver
 *   the town's route steering ([x, y, z] world points) and her position
 * @param {(name: string, payload: object) => void} [o.emit] @param {(text: string) => void} [o.toast]
 * @param {(k: string, a?: object) => string} [o.say] @param {Document} [o.doc] @param {(x: number, z: number) => boolean} [o.blocked]
 * @param {() => number} [o.now]
 */
export function createAutoWalk({ driver, emit = () => {}, toast = () => {}, say = (k) => k, doc = globalThis.document, blocked = null, now = () => performance.now() }) {
  let walk = null, label = null;
  const showLabel = (text) => {
    if (!doc) return;
    if (!label) { label = doc.createElement('div'); label.className = 'ftf-autowalk'; label.setAttribute('role', 'status');
      label.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 96px);transform:translateX(-50%);z-index:12;max-width:calc(100vw - 32px);padding:6px 14px;border-radius:999px;background:rgba(14,16,24,.82);color:#eef0f6;font:14px/1.3 system-ui,sans-serif;text-align:center;white-space:normal;pointer-events:none';
      doc.body.append(label); }
    label.textContent = text;
  };
  const hideLabel = () => { if (label) { label.remove(); label = null; } };
  function finish(kind, reason) {
    if (!walk) return; const w = walk; walk = null; hideLabel();
    if (kind === 'cancelled') driver.cancel();
    emit('autowalk.' + kind, { questId: w.questId || null, to: w.to.slice(), ...(reason ? { reason } : {}) });
    if (kind === 'arrived' && w.onArrive) w.onArrive();
  }
  function plan(w) {
    const p = driver.pos(), here = [p[0], p[2]], stop = stopPoint(here, w.to, w.stopRadius * 0.85);
    const path = planPath(here, stop, { blocked });
    if (!path) return false;
    w.path = path.map(([x, z]) => [x, p[1], z]);
    driver.setRoute(w.path);
    return true;
  }
  const api = {
    get active() { return !!walk; }, get target() { return walk && walk.to.slice(); }, /** The planned route ([x, y, z] world points) while walking. */ get path() { return walk && walk.path ? walk.path.map((q) => q.slice()) : null; },
    /** Walk to [x, z] (world). `follow` returns the target's current [x, z] (a walking giver). {cancel()} */
    autoWalkTo({ pos, stopRadius = 2.2, label: name = '', questId = null, follow = null, onArrive = null }) {
      if (walk) finish('cancelled', 'replaced');
      walk = { to: [pos[0], pos[1]], stopRadius, name, questId, follow, onArrive, lastPlan: now(), best: Infinity, bestAt: now() };
      if (!plan(walk)) { const w = walk; walk = null; emit('autowalk.cancelled', { questId, to: w.to, reason: 'blocked' }); toast(say('autowalk.blocked')); return { cancel() {} }; }
      emit('autowalk.started', { questId, to: walk.to.slice() });
      api.update();
      return { cancel: () => finish('cancelled', 'input') };
    },
    cancel(reason = 'input') { finish('cancelled', reason); },
    /** Per frame: arrival, input cancel (the town dropped the route), a moving target, no progress. */
    update() {
      if (!walk) return;
      const t = now(), p = driver.pos();
      if (!driver.active() && driver.ended && driver.ended() === 'cancel') { finish('cancelled', 'input'); return; } // a movement key first: a re-plan must not undo it
      if (walk.follow && t - walk.lastPlan > 2000) { const f = walk.follow(); if (f) walk.to = [f[0], f[1]]; walk.lastPlan = t; plan(walk); }
      const d = Math.hypot(walk.to[0] - p[0], walk.to[1] - p[2]);
      showLabel(say('autowalk.label', { target: walk.name, m: Math.round(d) }));
      if (d <= walk.stopRadius + 0.05) { driver.cancel(); finish('arrived'); return; }
      if (!driver.active()) {
        if (driver.ended && driver.ended() === 'done') { // the route ran out: a moving target walked off, plan again
          if (d <= walk.stopRadius * 1.6) { finish('arrived'); return; }
          if (!plan(walk)) { finish('cancelled', 'blocked'); toast(say('autowalk.blocked')); }
          return;
        }
        finish('cancelled', 'input'); return; // a movement key cleared the town's route
      }
      if (d < walk.best - 0.25) { walk.best = d; walk.bestAt = t; }
      else if (t - walk.bestAt > 6000) { finish('cancelled', 'blocked'); toast(say('autowalk.blocked')); }
    },
    dispose() { if (walk) finish('cancelled', 'replaced'); hideLabel(); },
  };
  return api;
}

/** The seam's free function (sprint §3.2): set by the host that owns the town (scenes/town-quests.js). */
let current = null;
export const setAutoWalker = (w) => { current = w; };
export function autoWalkTo(opts) { return current ? current.autoWalkTo(opts) : { cancel() {} }; }

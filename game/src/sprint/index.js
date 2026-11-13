// Mounts every sprint module behind its flag (sprint plan 3.2, 8.3). A module that fails to load or throws in mount
// is logged, reported with bus.emit('error.shown', {area, cause}) and skipped: the game never waits for it or breaks.
// ctx is completed here with the seam services (bus, flags, markers, tooltip, silk); see docs/sprint/CTX.md.
import { bus, emit } from './bus.js';
import * as markers from './markers.js';
import * as tooltip from './tooltip.js';
import * as silk from './silk-view.js';
import { MODULES } from './registry.js';
import { seedFromQuery, applyDemoSeed } from './demo-seed.js';

/**
 * @param {object} ctx the game context (boot-world.js) plus `flags` ({on(name)})
 * @param {{modules?: Array}} [o] tests pass their own module list
 * @returns {{dispose(): void, update(dt: number): void, ready: Promise<string[]>}}
 */
export function mountSprint(ctx = {}, { modules = MODULES, search = (globalThis.location && globalThis.location.search) || '', autoUpdate = true } = {}) {
  import('./tokens.css').catch(() => {}); // the design tokens (3.3); a plain Node test has no CSS loader
  const full = { ...ctx, bus, markers, tooltip, silk };
  if (silk._attach) silk._attach({ ledger: ctx.ledger || null });
  const seed = seedFromQuery(search); if (seed) applyDemoSeed(seed);
  const flags = ctx.flags && typeof ctx.flags.on === 'function' ? ctx.flags : { on: () => false };
  const live = []; let disposed = false;
  const ready = (async () => {
    const mounted = [];
    for (const m of modules) {
      if (disposed) break;
      if (!flags.on(m.flag)) continue;
      try {
        const mod = await m.load();
        if (disposed) break;
        const h = mod && typeof mod.mount === 'function' ? mod.mount(full) : null;
        if (h) { live.push({ id: m.id, h }); mounted.push(m.id); }
      } catch (e) {
        if (globalThis.console) globalThis.console.warn('[sprint]', m.id, e);
        emit('error.shown', { area: m.id, cause: 'mount' });
      }
    }
    emit('sprint.mounted', { modules: mounted });
    return mounted;
  })();
  // its own frame loop, so boot-world.js needs one mount call and nothing per frame
  let raf = 0, last = 0;
  const loop = (now) => { const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now; api.update(dt); if (!disposed) raf = requestAnimationFrame(loop); };
  if (autoUpdate && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
  const api = {
    ready,
    update(dt) { for (const { id, h } of live) { if (typeof h.update === 'function') { try { h.update(dt); } catch (e) { if (globalThis.console) globalThis.console.warn('[sprint]', id, e); } } } },
    dispose() { disposed = true; if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); for (const { h } of live.splice(0)) { try { h.dispose && h.dispose(); } catch { /* best effort */ } } },
  };
  return api;
}

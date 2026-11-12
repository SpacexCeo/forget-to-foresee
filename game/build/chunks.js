// Chunk plan for the first seconds (docs/first-seconds.md). Shared by vite.config.js and the tests.
//
// Two rules keep the production build bootable:
// 1. An entry module never goes into a shared chunk. Rollup keeps every module's top-level code when it joins a
//    chunk, so an entry with side effects (the UI preview mounts its own lobby into #app) would run inside the game
//    whenever that chunk loads. Entries stay in their own chunk and only their imports are shared.
// 2. The chunk graph stays acyclic. A module-level reference across two chunks that import each other is a TDZ
//    error at boot (`Cannot access 'x' before initialization`): Rollup orders modules inside a chunk, not across
//    chunks. The rules (`src/game/`) live with `ui` because ui modules read engine tables at module level while
//    `play` imports `ui`; `play/logogram.js` lives with `client-core` because the scenes draw logograms.

/** Entry scripts of the HTML pages (vite.config.js `input`), as path fragments. */
export const ENTRY_MODULES = [
  '/src/main.js',
  '/src/review/asset-review.js',
  '/src/vfx/dev-page.js',
  '/src/ui/preview.js',
  '/src/ui/world-hud/preview.js',
];

/** Modules outside src/ui that ui modules import statically; they import nothing from play or net. */
export const UI_LEAVES = ['/src/play/narration.js', '/src/net/exchange-deployment.js', '/src/play/i18n.js'];

/**
 * play modules the scenes and render import (town townsfolk, the shell's Guests stage, the beacons) and their own
 * imports; none imports play or net. They go with client-core so it never imports play (rule 2): with them in play,
 * the review page booted client-core first and world-map.js threw a TDZ error on layout.js.
 */
export const CORE_PLAY = ['/src/play/beacon-plan.js', '/src/play/guests-stage.js', '/src/play/townsfolk.js', '/src/play/townsfolk-plan.js',
  '/src/play/gait.js', '/src/play/anim-library.js', '/src/play/behaviour.js'];

/**
 * Name of the manual chunk a module belongs to, or undefined to let Rollup decide.
 * @param {string} id module id as Rollup passes it (absolute path, possibly with a query)
 * @returns {string | undefined}
 */
export function chunkFor(id) {
  const p = id.replace(/\\/g, '/');
  if (ENTRY_MODULES.some((e) => p.includes(e))) return undefined;
  if (/\.css(\?|$)/.test(p)) return undefined; // stylesheets stay with their importer: a CSS import must not bind the entry to a chunk
  if (p.includes('/src/ui/loading.js') || p.includes('/src/ui/webgl-guard.js') || p.includes('/src/ui/premise.js') || p.includes('/src/ui/motion/') || p.includes('vite/preload-helper')) return 'boot'; // tiny, static with the entry
  if (p.includes('/node_modules/three/')) return 'three';
  if (p.includes('/src/render/') || p.includes('/src/physics/') || p.includes('/src/scenes/') || p.includes('/src/play/logogram.js') || CORE_PLAY.some((m) => p.includes(m))) return 'client-core';
  if (p.includes('/src/locales/') || p.includes('/src/play/locales/')) return 'locales';
  // ui never imports play (rule 2): the leaf modules ui reads go with ui; the lazily opened replay screen, which pulls
  // the rules API (net/replay.js -> net/api.js), goes with play.
  if (UI_LEAVES.some((m) => p.includes(m))) return 'ui';
  if (p.includes('/src/ui/replay-view.js') || p.includes('/src/ui/endgame-pass.js') || p.includes('/src/ui/stall-panel.js') || p.includes('/src/ui/town-works-panel.js')) return 'play'; // they import net/ modules
  if (p.includes('/src/play/') || p.includes('/src/net/') || p.includes('/src/ui/world-hud/')) return 'play';
  if (p.includes('/src/ui/') || p.includes('/src/game/')) return 'ui';
  return undefined;
}

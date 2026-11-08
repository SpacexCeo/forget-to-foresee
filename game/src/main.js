// Forget to Foresee: 3D client entry, kept thin for the first seconds (docs/first-seconds.md).
// index.html paints the loading screen before any script; this module takes it over with real progress,
// mounts the lobby from the light UI chunk as soon as it arrives and loads the world (three.js, scenes,
// render, physics: src/boot-world.js) behind it; the play layer (src/play) loads when the player enters.
// Dev URL parameters (harmless in production): ?tier=ultra|high|low, ?motion=reduce,
// ?view=overview|camp|close (camera presets), ?play=direct (skip the lobby), ?seed=<32 hex> (fixed
// test season), ?lang=en|ru, ?hud=old (greybox overlay instead of the world HUD), ?hints=reset (Novice hints
// fire again), ?demo=judge (the judges' 3-minute path: fixed season, Novice, fresh hints).
import { createLoadingScreen, bootPlan, bootProgress, firstFrameBudget } from './ui/loading.js';

const params = new URLSearchParams(location.search);
const uiRoot = document.getElementById('ui');
const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
const plan = bootPlan({ play: params.get('play'), hash: location.hash, coarse });
const loading = createLoadingScreen(document);
if (window.__ftfBoot) window.__ftfBoot.stop();
const t0 = performance.now();
const marks = { plan: plan.first };
let chunksDone = 0; const chunksTotal = plan.lobby ? 2 : 3; // ui (+ locales), world, and the play layer on the direct path
let budget = null, bytesGot = 0, firstFrame = false;
const report = (label) => loading.set(bootProgress({ chunksDone, chunksTotal, bytesGot, bytesPlanned: budget ? budget.bytes : 0 }), label);

/** Streamer stats → the first-frame byte gate (the cheap visible set, see firstFrameBudget). */
function onProgress(stats) {
  if (!budget) {
    const rows = stats.list.filter((a) => a.priority >= 100);
    if (rows.length) budget = firstFrameBudget(rows);
  }
  if (budget) {
    let got = 0;
    for (const a of stats.list) if (budget.names.includes(a.name)) got += (a.state === 'loaded' || a.state === 'cold' ? 1 : a.progress || 0) * (a.bytes || 0);
    bytesGot = got;
  }
  report();
}

const ctxP = import('./play/i18n.js').then((m) => { chunksDone++; marks.ui = Math.round(performance.now() - t0); report('Loading the island'); return m.createPlayContext({ locale: params.get('lang') || undefined }); });
let shellUi = null, worldP = null;
const startWorld = (ctx) => (worldP ||= import('./boot-world.js').then((m) => {
  chunksDone++; marks.world = Math.round(performance.now() - t0); report();
  return m.createWorld({ params, ctx, uiRoot, onProgress, lobbyOpen: () => !!shellUi, closeLobby: () => { if (shellUi) { shellUi.destroy(); shellUi = null; } },
    onFirstFrame: () => { firstFrame = true; marks.firstFrame = Math.round(performance.now() - t0); } });
}));

ctxP.then(async (ctx) => {
  if (plan.lobby) {
    const ui = await import('./ui/index.js');
    shellUi = ui.mountShell(uiRoot, { ctx, onFirstContact: () => startWorld(ctx).then((w) => w.enterWorld()) });
    marks.lobby = Math.round(performance.now() - t0);
    await loading.finish(); // the lobby is painted beneath: cross-fade, no flash
    startWorld(ctx);        // the world loads behind the lobby while the player reads it
  } else {
    const w = await startWorld(ctx);
    const entered = w.enterWorld().then(() => { chunksDone++; marks.play = Math.round(performance.now() - t0); report(); });
    // Gate: the first frame is rendered and the cheap visible models are in, or six seconds have passed (greyboxes stand in).
    const gateStart = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const bytesOk = budget ? bytesGot >= budget.bytes * 0.98 : false;
        const waited = performance.now() - gateStart;
        if ((firstFrame && (bytesOk || (budget && budget.bytes === 0)) && chunksDone >= chunksTotal) || waited > 6000) resolve(); else setTimeout(tick, 100);
      };
      tick();
    });
    await entered.catch(() => {});
    marks.gate = Math.round(performance.now() - t0);
    await loading.finish();
  }
  marks.done = Math.round(performance.now() - t0);
  window.__ftfBootMarks = marks;
}).catch((e) => { console.error('[boot] failed', e); loading.fail('Something went wrong while loading. Reload the page.'); });

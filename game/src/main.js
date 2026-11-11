// Forget to Foresee: 3D client entry, kept thin for the first seconds (docs/first-seconds.md).
// index.html paints the loading screen before any script; this module takes it over with real progress,
// mounts the lobby from the light UI chunk as soon as it arrives and loads the world (three.js, scenes,
// render, physics: src/boot-world.js) behind it; the play layer (src/play) loads when the player enters.
// Dev URL parameters (harmless in production): ?tier=ultra|high|low, ?motion=reduce,
// ?view=overview|camp|close (camera presets), ?play=direct (skip the lobby), ?seed=<32 hex> (fixed
// test season), ?lang=en|ru, ?hud=old (greybox overlay instead of the world HUD), ?hints=reset (Novice hints
// fire again), ?demo=judge (the judges' 3-minute path: fixed season, Novice, fresh hints).
// Play starts in the town on the ground (docs/town.md); ?skip=town and the deep links above go straight to the
// archipelago, ?town=1 (or =altar, =flat) forces the town on a deep link (townPlan in ui/loading.js).
import { createLoadingScreen, bootPlan, bootProgress, firstFrameBudget, townPlan } from './ui/loading.js';
import { logKeysFromStats } from './ui/ink-bar.js';

const params = new URLSearchParams(location.search);
// Cinematic capture (docs/submission/trailer.md, tools/capture): a frame-stepped clock and scripted shots, only with ?cinematic=<name>.
if (params.has('cinematic')) await import('./cinematic/index.js').then((m) => m.boot(params.get('cinematic')));
const uiRoot = document.getElementById('ui');
const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
const plan = bootPlan({ play: params.get('play'), hash: location.hash, coarse, lobby: params.get('lobby') });
const town = townPlan({ skip: params.get('skip'), town: params.get('town'), play: params.get('play'), cinematic: params.get('cinematic'), view: params.get('view'), film: params.get('film') }).town;
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
    // The town has no stand-ins: its first view is every piece around Iris (the light `_m` set first), all of it gated.
    const rows = town ? stats.list.filter((a) => a.name.startsWith('town_') && a.priority >= 0 && a.state !== 'absent') : stats.list.filter((a) => a.priority >= 100);
    if (rows.length) budget = town ? { names: rows.map((a) => a.name), bytes: rows.reduce((n, a) => n + (a.bytes || 0), 0) } : firstFrameBudget(rows);
  }
  if (budget) {
    let got = 0;
    for (const a of stats.list) if (budget.names.includes(a.name)) got += (a.state === 'loaded' || a.state === 'cold' ? 1 : a.progress || 0) * (a.bytes || 0);
    bytesGot = got;
    for (const k of logKeysFromStats(stats, (a) => budget.names.includes(a.name)).slice(0, 1)) loading.log(k); // the log under the bar: what is loading now
  }
  report();
}

const ctxP = import('./play/i18n.js').then((m) => { chunksDone++; marks.ui = Math.round(performance.now() - t0); report(town ? 'Loading the town' : 'Loading the island'); return m.createPlayContext({ locale: params.get('lang') || undefined }); });
let shellUi = null, worldP = null;
const startWorld = (ctx) => (worldP ||= import('./boot-world.js').then((m) => {
  chunksDone++; marks.world = Math.round(performance.now() - t0); report();
  return m.createWorld({ params, ctx, uiRoot, onProgress, lobbyOpen: () => !!shellUi, closeLobby: () => { if (shellUi) { shellUi.destroy(); shellUi = null; } },
    onFirstFrame: () => { firstFrame = true; marks.firstFrame = Math.round(performance.now() - t0); } });
}));

/** The town is on the GPU (every piece around Iris real and warmed, Iris herself in), or `limit` ms have passed. */
const townShown = (w, limit = 30000) => new Promise((resolve) => {
  const start = performance.now();
  const tick = () => { if (w.townReady || performance.now() - start > limit) resolve(); else setTimeout(tick, 100); };
  tick();
});

ctxP.then(async (ctx) => {
  loading.setTranslator((k) => ctx.i18n.t(k));
  // ?replay=r1.…: replay a linked season and show its NEAR root check over whatever loads beneath (net/replay.js)
  if (params.has('replay')) import('./ui/replay-view.js').then((m) => m.openReplayView({ param: params.get('replay'), i18n: ctx.i18n })).catch((e) => console.warn('[replay]', e));
  if (plan.lobby) {
    const ui = await import('./ui/index.js');
    // Leaving the lobby before the town has streamed in: the loading screen comes back with the town's real progress,
    // so the first thing the player sees is the finished street, never pieces popping in.
    const enter = async () => {
      const early = !worldP || !(await Promise.race([worldP.then((w) => w.townReady), new Promise((r) => setTimeout(() => r(false), 0))]));
      const covered = town && early && loading.reopen('Loading the town');
      const w = await startWorld(ctx);
      await w.enterWorld();
      if (covered) { report('Loading the town'); await townShown(w); await loading.finish(); }
    };
    shellUi = ui.mountShell(uiRoot, { ctx, onFirstContact: enter });
    marks.lobby = Math.round(performance.now() - t0);
    await loading.finish(); // the lobby is painted beneath: cross-fade, no flash
    startWorld(ctx);        // the world loads behind the lobby while the player reads it
  } else {
    const w = await startWorld(ctx);
    const entered = w.enterWorld().then(() => { chunksDone++; marks.play = Math.round(performance.now() - t0); report(); });
    // Gate: the first frame is rendered and the cheap visible models are in, or six seconds have passed (greyboxes stand in).
    // The town has no stand-ins and no ground before its terrain: the gate waits for every piece around Iris to be
    // real and warmed (render/warmup.js) and for Iris herself, up to thirty seconds on a slow link.
    const gateStart = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const bytesOk = budget ? bytesGot >= budget.bytes * 0.98 : false;
        const waited = performance.now() - gateStart;
        if ((firstFrame && (bytesOk || (budget && budget.bytes === 0)) && chunksDone >= chunksTotal && w.townReady) || waited > (town ? 30000 : 6000)) resolve(); else setTimeout(tick, 100);
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

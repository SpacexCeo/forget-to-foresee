// The new-player intro (sprint 7.4, flag `newPlayerIntro`): prologue -> wake-up -> the 19-line townsfolk dialogue ->
// "What waits for you" -> control. A6's 3D lab prologue and wake-up shot are called when present
// (ctx.prologue or globalThis.__ftfPrologue = {playLabPrologue, playWakeUp}); without them a black title card
// ("FORGET TO FORESEE / Year 2048.") stands in for 2.5 s, so the intro never blocks. Emits npe.* and prologue.* on
// ctx.bus when there is one. Saved at ftf.npe.v1; ?intro=1 forces it, ?intro=0 never.
import NPE from '../play/locales/en-npe.js';
import { WAKEUP, lineVars } from './dialogue-script.js';
import { loadNpe, saveNpe, shouldRun, initial, reduce } from './flow.js';
import { playDialogue, createSubtitles, installCss } from './dialogue-ui.js';
import { openRoadmapCard } from './roadmap-card.js';
import { EXPEDITION } from '../game/expedition-config.js';

const fmt = (s, a) => String(s).replace(/\{(\w+)\}/g, (m, k) => (a && a[k] != null ? String(a[k]) : m));
/** The game's t() with the English sprint strings as the fallback (the locale import lines are the integrator's). */
export const withNpe = (t) => (k, a) => { const r = t ? t(k, a) : k; return r === k && NPE[k] != null ? fmt(NPE[k], a) : r; };

/** The black title-card stand-in for the 3D prologue: "FORGET TO FORESEE", "Year 2048.", Esc or Skip ends it. */
export function titleCard({ doc, t, ms = 2500, reduced = () => false }) {
  installCss(doc);
  const wrap = doc.createElement('div'); wrap.className = 'npe-title';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9990;background:#000;color:#eef0f6;display:grid;place-content:center;text-align:center;gap:14px;font:700 clamp(28px,5vw,64px)/1.1 Georgia,serif;letter-spacing:.08em';
  const a = doc.createElement('div'); a.textContent = t('npe.title');
  const b = doc.createElement('div'); b.textContent = t('npe.year'); b.style.cssText = 'font:400 clamp(16px,2.2vw,26px)/1.3 system-ui,sans-serif;letter-spacing:0;color:#aab1c5';
  const hint = doc.createElement('div'); hint.textContent = t('npe.skipHint'); hint.style.cssText = 'position:fixed;right:24px;bottom:20px;font:500 14px system-ui,sans-serif;color:#aab1c5;letter-spacing:0';
  hint.hidden = true; wrap.append(a, b, hint); doc.body.append(wrap);
  const showHint = setTimeout(() => { hint.hidden = false; }, 500);
  let resolve; const done = new Promise((r) => { resolve = r; });
  let ended = false;
  const end = (how) => { if (ended) return; ended = true; clearTimeout(timer); clearTimeout(showHint); wrap.remove(); if (doc.removeEventListener) doc.removeEventListener('keydown', onKey, true); resolve(how); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end('skipped'); } };
  if (doc.addEventListener) doc.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', () => end('skipped'));
  const timer = setTimeout(() => end('done'), reduced() ? Math.min(ms, 1500) : ms);
  return { done, skip: () => end('skipped') };
}

/**
 * Runs the intro once. Returns {state: Promise<final flow state>, skip()}.
 * @param {object} ctx {doc?, t, storage, toast, ledger?, bus?, flags?, reduced?, search?, prologue?, award?, lockControls?(on), cameraCue?(target), portrait?(sp)}
 */
export function runIntro(ctx) {
  const doc = ctx.doc || globalThis.document;
  const t = withNpe(ctx.t);
  const reduced = ctx.reduced || (() => false);
  const emit = (n, p) => { try { if (ctx.bus && ctx.bus.emit) ctx.bus.emit(n, p); } catch { /* telemetry never breaks the intro */ } };
  const vars = lineVars(ctx.search != null ? ctx.search : (globalThis.location && globalThis.location.search) || '');
  const award = ctx.award || ((c) => { if (ctx.ledger && ctx.ledger.grant) ctx.ledger.grant({ silk: c }); });
  const pro = ctx.prologue || globalThis.__ftfPrologue || null;
  const t0 = Date.now();
  let s = reduce(initial(loadNpe(ctx.storage)), { type: 'start' });
  let current = null; // what Skip / Esc ends now
  const step = (e) => {
    const prev = s.phase; s = reduce(s, e); saveNpe(ctx.storage, s.rec);
    if (s.award) { award(EXPEDITION.stipendC); if (ctx.toast) ctx.toast(t('npe.stipend', vars)); s = { ...s, award: false }; }
    if (s.phase !== prev) emit('npe.step', { step: s.phase, ms: Date.now() - t0 });
  };
  const lock = (on) => { try { if (ctx.lockControls) ctx.lockControls(on); } catch { /* */ } };

  const state = (async () => {
    emit('npe.started', { step: 'prologue', ms: 0 }); lock(true);
    const subs = createSubtitles({ doc });
    // prologue: A6's lab scene, or the title card
    emit('prologue.started', { ms: Date.now() - t0 });
    let how = 'done';
    try {
      if (pro && pro.playLabPrologue) {
        const off = ctx.bus && ctx.bus.on ? ctx.bus.on('prologue.cue', (c) => { if (c && c.text) subs.show(c.text, c.speaker || null, c.durMs || 0); }) : null;
        current = { skip: () => { if (pro.skip) pro.skip(); } };
        const r = await pro.playLabPrologue({ subtitles: subs, reduced: reduced() });
        if (off) off();
        how = r === 'skipped' ? 'skipped' : 'done';
      } else { current = titleCard({ doc, t, reduced }); how = await current.done; }
    } catch { current = titleCard({ doc, t, reduced }); how = await current.done; }
    subs.hide();
    emit(how === 'skipped' ? 'prologue.skipped' : 'prologue.completed', { ms: Date.now() - t0 });
    step({ type: how === 'skipped' ? 'prologue_skip' : 'prologue_done' });
    // wake-up shot
    try { if (pro && pro.playWakeUp) await pro.playWakeUp({ reduced: reduced() }); } catch { /* the dialogue starts anyway */ }
    step({ type: 'wakeup_done' });
    // the dialogue
    const lines = WAKEUP.map((l) => ({ ...l, text: t(l.key, vars) }));
    const d = playDialogue({ doc, lines, reduced, name: (sp) => t('npe.speaker.' + sp), hint: t('npe.hint'), count: (n, of) => t('npe.count', { n, of }), skipLabel: t('npe.skip'),
      portrait: ctx.portrait || ((sp) => (sp === 'iris' ? ((ctx.base || '/') + 'assets/cards/iris.webp') : null)),
      onLine: (i, l) => { if (l.camera && ctx.cameraCue) { try { ctx.cameraCue(l.camera); } catch { /* */ } } emit('npe.camera', { target: l.camera || null, line: l.id }); },
      onDone: (i, l) => step({ type: 'line_done', last: i === lines.length - 1, award: !!l.award }) });
    current = d;
    const end = await d.done;
    if (end === 'skipped') { step({ type: 'skip_all' }); emit('npe.skipped', { step: 'dialogue', ms: Date.now() - t0 }); if (ctx.toast) ctx.toast(t('npe.skipped')); }
    // the card
    const card = openRoadmapCard({ doc, t, vars }); current = { skip: card.close };
    const pick = await card.result;
    step({ type: pick === 'start' ? 'start_card' : 'later' });
    subs.dispose(); lock(false);
    step({ type: 'handoff_done' });
    emit('npe.completed', { step: 'done', ms: Date.now() - t0 });
    current = null;
    return s;
  })();
  return { state, skip: () => { if (current && current.skip) current.skip(); }, get phase() { return s.phase; } };
}

/** The sprint module entry (registry: { id: 'newPlayerIntro', flag: 'newPlayerIntro', load: () => import('../npe/index.js') }). */
export function mount(ctx) {
  const rec = loadNpe(ctx.storage);
  const flag = ctx.flags ? (typeof ctx.flags.get === 'function' ? ctx.flags.get('newPlayerIntro') : ctx.flags.newPlayerIntro) : true;
  const search = ctx.search != null ? ctx.search : (globalThis.location && globalThis.location.search) || '';
  const run = shouldRun({ flag, search, rec }) ? runIntro({ ...ctx, search }) : null;
  return { intro: run, dispose() { if (run) run.skip(); } };
}

/** Reopens "What waits for you" from the menu. */
export function openWhatsNext(ctx) {
  const t = withNpe(ctx.t);
  return openRoadmapCard({ doc: ctx.doc || globalThis.document, t, vars: lineVars(ctx.search != null ? ctx.search : (globalThis.location && globalThis.location.search) || '') });
}

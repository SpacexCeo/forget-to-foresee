// In-game settings (owner 12.11): a popup over the running town with tabs Graphics, Controls, Audio, Language, Help and
// Account. It never leaves the world; "Leave to main menu" is an explicit button with a confirm. Everything applies at
// once and is stored on this device. Plain DOM, no play imports (a ui -> play static import is a boot cycle): the caller
// passes `t`, the prefs and the hooks into the world.
import { KEY_ACTIONS, bindings, setBindings, defaultBindings, conflicts, keyLabel, isReserved, actionKey } from './keybinds.js';
import { loadSettings, saveSettings, SETTINGS_OPTIONS } from './settings-store.js';

export const TABS = Object.freeze(['graphics', 'controls', 'audio', 'language', 'help', 'account']);
const LOCALES = [['en', 'English'], ['ru', 'Русский'], ['uk', 'Українська'], ['it', 'Italiano'], ['zh', '中文']];
const CSS = `
.ftf-set { width: min(760px, calc(100vw - 32px)); max-height: min(86vh, 760px); padding: 0; border: 1px solid rgba(233,180,76,.5); border-radius: 14px;
  background: #121a1b; color: #f3ead6; font: 15px/1.45 system-ui, sans-serif; box-shadow: 0 18px 60px rgba(0,0,0,.6); overflow: hidden; }
.ftf-set::backdrop { background: rgba(6,10,11,.55); }
.ftf-set-wrap { display: grid; grid-template-columns: 180px 1fr; grid-template-rows: auto 1fr auto; height: min(86vh, 760px); }
.ftf-set-head { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid rgba(233,180,76,.25); }
.ftf-set-head h2 { margin: 0; font: 600 14px/1.2 system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #e9b44c; }
.ftf-set-tabs { display: flex; flex-direction: column; gap: 2px; padding: 10px 8px; border-right: 1px solid rgba(233,180,76,.18); overflow-y: auto; }
.ftf-set-tabs button { text-align: left; min-height: 40px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: #d8cfbd; font: 15px system-ui, sans-serif; cursor: pointer; }
.ftf-set-tabs button[aria-selected="true"] { background: rgba(233,180,76,.16); color: #f3ead6; box-shadow: inset 3px 0 0 #e9b44c; }
.ftf-set-body { padding: 14px 18px; overflow-y: auto; }
.ftf-set-body h3 { margin: 14px 0 8px; font: 600 12px/1.2 system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #b9b2a2; }
.ftf-set-body h3:first-child { margin-top: 0; }
.ftf-set-row { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(0, 1.4fr); gap: 12px; align-items: center; min-height: 44px; border-bottom: 1px solid rgba(255,255,255,.05); }
.ftf-set-row > span small { display: block; color: #9f998b; font-size: 12px; }
.ftf-set select, .ftf-set input[type=range] { width: 100%; min-height: 36px; accent-color: #d9a441; }
.ftf-set select { padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(233,180,76,.45); background: #1c2426; color: #f3ead6; font: 15px system-ui, sans-serif; }
.ftf-set .ftf-set-range { display: grid; grid-template-columns: 1fr 3.2em; gap: 10px; align-items: center; }
.ftf-set output { text-align: right; font-variant-numeric: tabular-nums; color: #d8cfbd; }
.ftf-set button.ftf-set-btn, .ftf-set .ftf-set-key { min-height: 38px; padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(233,180,76,.6); background: rgba(233,180,76,.12); color: #f3ead6; font: 15px system-ui, sans-serif; cursor: pointer; }
.ftf-set button.ftf-set-primary { background: #e9b44c; color: #1b1407; border-color: #e9b44c; font-weight: 600; }
.ftf-set .ftf-set-key { min-width: 92px; font-family: ui-monospace, monospace; }
.ftf-set .ftf-set-key[data-conflict="1"] { border-color: #f0a08a; color: #f0a08a; }
.ftf-set .ftf-set-key[data-wait="1"] { background: rgba(95,180,170,.25); border-color: #5fb4aa; }
.ftf-set .ftf-set-toggle { justify-self: start; width: 52px; height: 30px; border-radius: 15px; border: 1px solid rgba(233,180,76,.6); background: #1c2426; position: relative; cursor: pointer; }
.ftf-set .ftf-set-toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #7d8a86; transition: left .15s; }
.ftf-set .ftf-set-toggle[aria-checked="true"] { background: rgba(233,180,76,.3); }
.ftf-set .ftf-set-toggle[aria-checked="true"]::after { left: 25px; background: #e9b44c; }
.ftf-set .ftf-set-note { color: #b9b2a2; font-size: 13px; margin: 6px 0 10px; }
.ftf-set .ftf-set-warn { color: #f0a08a; font-size: 13px; margin: 6px 0; }
.ftf-set dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0 0 10px; }
.ftf-set dt { color: #e9b44c; font-family: ui-monospace, monospace; } .ftf-set dd { margin: 0; }
.ftf-set p { margin: 0 0 10px; }
.ftf-set-foot { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; padding: 10px 16px; border-top: 1px solid rgba(233,180,76,.25); }
.ftf-set-foot .ftf-set-leave { margin-right: auto; }
@media (max-width: 700px), (pointer: coarse) and (max-height: 520px) {
  .ftf-set { width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; border: 0; margin: 0; }
  .ftf-set-wrap { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr auto; height: 100dvh; }
  .ftf-set-tabs { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid rgba(233,180,76,.18); padding: 6px; }
  .ftf-set-tabs button { white-space: nowrap; min-height: 44px; }
  .ftf-set-tabs button[aria-selected="true"] { box-shadow: inset 0 -3px 0 #e9b44c; }
  .ftf-set-row { grid-template-columns: 1fr; gap: 4px; padding: 6px 0; }
  .ftf-set button.ftf-set-btn, .ftf-set .ftf-set-key, .ftf-set select { min-height: 46px; }
}`;

/**
 * @param {{doc?: Document, t: Function, i18n: object, prefs: object, storage: Storage, hooks: object}} o
 * hooks: onSettings(s), audio(), touch() -> {available, mode, setMode(m)}, day1() -> record, clearData(),
 *        returnToTown: {visible(), run()}, startOver: {visible(), run()}, leaveToMenu(), onOpen(), onClose()
 */
export function createSettingsPopup({ doc = globalThis.document, t, i18n, prefs, storage, hooks = {} }) {
  if (!doc.getElementById('ftf-set-css')) { const s = doc.createElement('style'); s.id = 'ftf-set-css'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (key, fn, cls = 'ftf-set-btn') => { const b = el('button', cls, t(key)); b.type = 'button'; b.addEventListener('click', fn); return b; };
  let settings = loadSettings(storage);
  let tab = 'graphics', waiting = null;
  const dialog = el('dialog', 'ftf-set'); dialog.setAttribute('aria-labelledby', 'ftf-set-title');
  doc.body.append(dialog);
  // Esc closes from anywhere while open (a re-render can drop focus out of the dialog, where its own cancel never fires)
  const onDocKey = (e) => { if (e.code === 'Escape' && dialog.open && !waiting && !dialog.contains(e.target)) { e.preventDefault(); e.stopPropagation(); dialog.close(); } };
  dialog.addEventListener('close', () => { waiting = null; doc.removeEventListener('keydown', onDocKey, true); if (hooks.onClose) hooks.onClose(); });
  dialog.addEventListener('cancel', (e) => { if (waiting) { e.preventDefault(); waiting = null; render(); } });
  dialog.addEventListener('keydown', (e) => {
    if (!waiting) { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); dialog.close(); } return; } // Esc closes, even without the browser's own cancel
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape') { waiting = null; render(); return; }
    if (isReserved(e.code)) return;
    setBindings({ ...bindings(), [waiting]: e.code }, storage); waiting = null; render();
  }, true);

  const setS = (patch) => { settings = { ...settings, ...patch }; saveSettings(storage, settings); if (hooks.onSettings) hooks.onSettings(settings); };
  const row = (labelKey, control, noteKey) => { const r = el('div', 'ftf-set-row'); const l = el('span', null, t(labelKey)); if (noteKey) l.append(el('small', null, t(noteKey))); r.append(l, control); return r; };
  const select = (opts, value, onChange, label) => {
    const s = el('select'); s.setAttribute('aria-label', label);
    for (const [v, text] of opts) { const o = el('option', null, text); o.value = String(v); if (String(v) === String(value)) o.selected = true; s.append(o); }
    s.addEventListener('change', () => onChange(s.value)); return s;
  };
  const toggle = (on, onChange, label) => {
    const b = el('button', 'ftf-set-toggle'); b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!on)); b.setAttribute('aria-label', label);
    b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); onChange(v); }); return b;
  };
  const range = (value, min, max, step, fmt, onInput, label) => {
    const w = el('div', 'ftf-set-range'); const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value; r.setAttribute('aria-label', label);
    const out = el('output', null, fmt(value)); r.addEventListener('input', () => { out.textContent = fmt(Number(r.value)); onInput(Number(r.value)); });
    w.append(r, out); return w;
  };

  const panes = {
    graphics() {
      const p = prefs.get();
      return [el('h3', null, t('set.gfx.title')),
        row('set.gfx.quality', select(['auto', 'low', 'medium', 'high'].map((q) => [q, t('set.gfx.q.' + q)]), p.quality, (v) => prefs.set({ quality: v }), t('set.gfx.quality')), 'set.gfx.qualityNote'),
        row('set.gfx.res', select(SETTINGS_OPTIONS.resScale.map((v) => [v, Math.round(v * 100) + ' %']), settings.resScale, (v) => setS({ resScale: Number(v) }), t('set.gfx.res'))),
        row('set.gfx.shadows', toggle(settings.shadows, (v) => setS({ shadows: v }), t('set.gfx.shadows'))),
        row('set.gfx.bloom', toggle(settings.bloom, (v) => setS({ bloom: v }), t('set.gfx.bloom')), 'set.gfx.bloomNote'),
        row('set.gfx.weather', toggle(settings.weather, (v) => setS({ weather: v }), t('set.gfx.weather'))),
        row('set.gfx.fps', select(SETTINGS_OPTIONS.fpsCap.map((v) => [v, v ? v + ' FPS' : t('set.gfx.fpsOff')]), settings.fpsCap, (v) => setS({ fpsCap: Number(v) }), t('set.gfx.fps'))),
        row('set.gfx.motion', select(['system', 'reduce', 'full'].map((m) => [m, t('set.gfx.m.' + m)]), p.motion, (v) => prefs.set({ motion: v }), t('set.gfx.motion'))),
        el('p', 'ftf-set-note', t('set.gfx.photo', { key: actionKey('photo') }))];
    },
    controls() {
      const out = [el('h3', null, t('set.ctl.camera')),
        row('set.ctl.sens', range(settings.sensitivity, 0.4, 2, 0.05, (v) => v.toFixed(2) + '×', (v) => setS({ sensitivity: SETTINGS_OPTIONS.sensitivity.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)) }), t('set.ctl.sens'))),
        row('set.ctl.invert', toggle(settings.invertY, (v) => setS({ invertY: v }), t('set.ctl.invert')))];
      if (!(touch && touch.available)) out.push(row('set.ctl.quick', toggle(loadSettings(storage).quickCast, (v) => setS({ quickCast: v }), t('set.ctl.quick')), 'set.ctl.quickNote'));
      const touch = hooks.touch && hooks.touch();
      if (touch && touch.available) out.push(row('set.ctl.touch', select([['sticks', t('set.ctl.sticks')], ['tap', t('set.ctl.tap')]], touch.mode, (v) => touch.setMode(v), t('set.ctl.touch'))));
      out.push(el('h3', null, t('set.ctl.keys')));
      const b = bindings(), clash = conflicts(b);
      for (const a of KEY_ACTIONS) {
        const k = el('button', 'ftf-set-key', waiting === a.id ? t('set.ctl.press') : keyLabel(b[a.id])); k.type = 'button';
        k.dataset.conflict = clash[b[a.id]] ? '1' : '0'; k.dataset.wait = waiting === a.id ? '1' : '0';
        k.setAttribute('aria-label', t(a.label) + ': ' + keyLabel(b[a.id]));
        k.addEventListener('click', () => { waiting = a.id; render(); const f = dialog.querySelector('.ftf-set-key[data-wait="1"]'); if (f) f.focus(); });
        out.push(row(a.label, k));
      }
      out.push(row('set.key.menu', el('span', 'ftf-set-note', 'Esc')));
      if (Object.keys(clash).length) out.push(el('p', 'ftf-set-warn', t('set.ctl.conflict', { keys: Object.keys(clash).map(keyLabel).join(', ') })));
      out.push(el('p', 'ftf-set-note', t('set.ctl.digits')), btn('set.ctl.reset', () => { setBindings(defaultBindings(), storage); render(); }));
      out.push(el('h3', null, t('set.ctl.pad')));
      const dl = el('dl');
      for (const [k, v] of [['A / ✕', 'set.pad.interact'], ['B / ○', 'set.pad.back'], ['Menu', 'set.pad.menu'], ['L', 'set.pad.move'], ['R', 'set.pad.look'], ['LB / RB', 'set.pad.zoom'], ['R3', 'set.pad.reset']]) dl.append(el('dt', null, k), el('dd', null, t(v)));
      out.push(dl);
      return out;
    },
    audio() {
      const a = hooks.audio ? hooks.audio() : null;
      const vols = a ? a.getVolumes() : (hooks.volumes ? hooks.volumes() : { master: 0.8, music: 0.7, sfx: 0.35 });
      const setVol = (bus, v) => { const rt = hooks.audio && hooks.audio(); if (rt) rt.setVolume(bus, v); else if (hooks.saveVolume) hooks.saveVolume(bus, v); };
      const out = [el('h3', null, t('set.audio.title'))];
      for (const bus of ['master', 'music', 'sfx']) out.push(row('set.audio.' + bus, range(Math.round((vols[bus] || 0) * 100), 0, 100, 5, (v) => v + ' %', (v) => setVol(bus, v / 100), t('set.audio.' + bus))));
      const muted = (vols.master || 0) === 0;
      out.push(row('set.audio.mute', toggle(muted, (on) => { if (on) { try { storage.setItem('ftf.audio.unmute', String(vols.master || 0.8)); } catch { /* private */ } setVol('master', 0); } else { let back = 0.8; try { back = Number(storage.getItem('ftf.audio.unmute')) || 0.8; } catch { /* private */ } setVol('master', back); } render(); }, t('set.audio.mute'))));
      out.push(el('p', 'ftf-set-note', t(a ? 'set.audio.note' : 'set.audio.noteLater')));
      return out;
    },
    language() {
      const cur = i18n.locale;
      const out = [el('h3', null, t('set.lang.title'))];
      const wrap = el('div'); wrap.setAttribute('role', 'radiogroup'); wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
      for (const [code, name] of LOCALES) { const b = el('button', 'ftf-set-btn' + (code === cur ? ' ftf-set-primary' : ''), name); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(code === cur)); b.lang = code; b.addEventListener('click', () => { prefs.set({ locale: code }); render(); }); wrap.append(b); }
      out.push(wrap, el('p', 'ftf-set-note', t('set.lang.note')));
      return out;
    },
    help() {
      const k = (a) => actionKey(a);
      const dl = el('dl');
      for (const [keys, what] of [[`${k('forward')} ${k('left')} ${k('back')} ${k('right')}`, 'set.help.move'], [k('run'), 'set.help.run'], [k('interact'), 'set.help.interact'], [`${k('strike')} / ${k('dash')}`, 'set.help.fight'],
        [`${k('lance')} / ${k('snare')}`, 'set.help.cast'], [k('photo'), 'set.help.photo'], [k('skin'), 'set.help.skin'], [k('chat'), 'set.help.chat'], ['Esc', 'set.help.menu']]) dl.append(el('dt', null, keys), el('dd', null, t(what)));
      return [el('h3', null, t('set.help.keyboard')), dl,
        el('h3', null, t('set.help.touchTitle')), el('p', null, t('set.help.touch')),
        el('h3', null, t('set.help.guideTitle')), ...['town', 'shops', 'hunt', 'chests', 'tournament', 'nft'].map((x) => el('p', null, t('set.help.' + x))),
        el('h3', null, t('set.help.judgeTitle')), el('p', null, t('set.help.judge'))];
    },
    account() {
      const d = (hooks.day1 && hooks.day1()) || {};
      const g = d.guest || {};
      const dl = el('dl');
      dl.append(el('dt', null, t('set.acc.name')), el('dd', null, d.nickname || '—'), el('dt', null, t('set.acc.account')), el('dd', null, g.account_id || t('set.acc.none')), el('dt', null, t('set.acc.token')), el('dd', null, g.token_id || '—'));
      const out = [el('h3', null, t('set.acc.title')), dl, el('p', 'ftf-set-note', t('set.acc.note'))];
      out.push(el('h3', null, t('set.acc.privacy')), el('p', null, t('set.acc.local')));
      out.push(btn('set.acc.clear', () => { if (globalThis.confirm && globalThis.confirm(t('set.acc.confirm'))) { if (hooks.clearData) hooks.clearData(); } }));
      return out;
    },
  };

  const wrap = el('div', 'ftf-set-wrap');
  const head = el('div', 'ftf-set-head'); const title = el('h2'); title.id = 'ftf-set-title';
  const close = el('button', 'ftf-set-btn', '×'); close.type = 'button'; close.addEventListener('click', () => dialog.close());
  head.append(title, close);
  const tabs = el('div', 'ftf-set-tabs'); tabs.setAttribute('role', 'tablist');
  const body = el('div', 'ftf-set-body'); body.setAttribute('role', 'tabpanel');
  const foot = el('div', 'ftf-set-foot');
  wrap.append(head, tabs, body, foot); dialog.append(wrap);

  function render() {
    title.textContent = t('set.title'); close.setAttribute('aria-label', t('set.close'));
    tabs.replaceChildren(...TABS.map((id) => { const b = el('button', null, t('set.tab.' + id)); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(id === tab)); b.addEventListener('click', () => { tab = id; waiting = null; render(); }); return b; }));
    const top = body.scrollTop;
    body.replaceChildren(...panes[tab]());
    body.scrollTop = top;
    const f = [];
    if (hooks.leaveToMenu) f.push(btn('set.leave', () => { if (globalThis.confirm && globalThis.confirm(t('set.leaveConfirm'))) { dialog.close(); hooks.leaveToMenu(); } }, 'ftf-set-btn ftf-set-leave'));
    if (hooks.startOver && hooks.startOver.visible()) f.push(btn('set.startOver', () => { if (globalThis.confirm && globalThis.confirm(t('set.startOverConfirm'))) { dialog.close(); hooks.startOver.run(); } }));
    if (hooks.endTournament && hooks.endTournament.visible()) f.push(btn('set.endTourney', () => { if (globalThis.confirm && globalThis.confirm(t('set.endTourneyConfirm'))) { dialog.close(); hooks.endTournament.run(); } }));
    if (hooks.returnToTown && hooks.returnToTown.visible()) f.push(btn('set.returnTown', () => { dialog.close(); hooks.returnToTown.run(); }));
    f.push(btn('set.resume', () => dialog.close(), 'ftf-set-btn ftf-set-primary'));
    foot.replaceChildren(...f);
    if (dialog.open && !dialog.contains(doc.activeElement)) { const sel = tabs.querySelector('[aria-selected="true"]'); if (sel) sel.focus({ preventScroll: true }); }
  }
  if (i18n && i18n.subscribe) i18n.subscribe(() => { if (dialog.open) render(); });

  return {
    dialog,
    get settings() { return settings; },
    get isOpen() { return dialog.open; },
    open(which) { if (which && TABS.includes(which)) tab = which; render(); if (!dialog.open) { dialog.showModal(); doc.addEventListener('keydown', onDocKey, true); } if (hooks.onOpen) hooks.onOpen(); const s = tabs.querySelector('[aria-selected="true"]'); if (s) s.focus(); },
    close() { if (dialog.open) dialog.close(); },
  };
}

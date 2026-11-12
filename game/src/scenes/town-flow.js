// The flow of the town on the ground (docs/town.md): Iris walks from the gate to the Tournament altar, registers,
// and is carried up to the archipelago, where the season (the play layer) starts exactly as it always did.
// This module owns the little UI the town has (an objective line, the altar prompt, the transition cover) and
// the registration sequence; boot-world.js owns the frame loop and tells it what "leaving the town" means.
// No world HUD, no hub and no hints exist here: the season has not begun. No game rule is evaluated.
import { steerTo } from '../physics/character.js';
import { TOWN_ROUTE, inAltarRange } from './town-layout.js';
import { talkTarget, TALK_LEAVE } from './town-quest.js';
import { HIRE, snapshotSeries } from '../game/town-economy.js';
import { matchIntent, replyFor } from '../game/intents.js';
import { guideAnim, GUIDE_ANIM_PAGES } from './guide-anim.js';
import { createPillStack, pillKey, parsePillKey } from './panel-pills.js';

/** Town spots that are shop doors: with walk-in shops (onDoor) E goes inside instead of opening the panel here. */
const DOORS = new Set(['exchange', 'scribe', 'inn']);
import { PLAY_MESSAGES } from '../play/i18n.js';
import { createVeil } from '../ui/loading.js';

const CSS = `
.ftf-town { position: fixed; inset: 0; pointer-events: none; z-index: 9; font-family: "Libre Caslon Text", "WH Cyrillic", "Palatino Linotype", Palatino, Georgia, serif; }
.ftf-town-objective { position: absolute; top: calc(14px + env(safe-area-inset-top, 0px)); left: calc(18px + env(safe-area-inset-left, 0px)); max-width: calc(100% - 190px);
  padding: 7px 14px 7px 12px; border-radius: 999px; background: rgba(12, 20, 21, .62); color: #f4ead0; font-size: 16px; line-height: 1.3;
  border: 1px solid rgba(232, 214, 172, .28); text-shadow: 0 1px 2px rgba(0, 0, 0, .5); transition: opacity .4s ease; }
.ftf-town-objective::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 9px; border-radius: 50%; background: #e9b44c; box-shadow: 0 0 8px #e9b44c; vertical-align: 1px; }
.ftf-town-objective[hidden], .ftf-town-prompt[hidden] { display: none; }
.ftf-town-prompt { position: fixed; left: 50%; bottom: calc(132px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 12; pointer-events: auto;
  display: inline-flex; align-items: center; gap: 10px; max-width: calc(100vw - 156px); min-height: 48px; padding: 10px 20px; border-radius: 999px; cursor: pointer;
  border: 1.5px solid #fbe6a6; background: rgba(217, 164, 65, .92); color: #1d1708; font: 600 17px/1.2 "Libre Caslon Text", "WH Cyrillic", "Palatino Linotype", Palatino, Georgia, serif;
  box-shadow: 0 0 0 4px rgba(251, 230, 166, .22), 0 6px 18px rgba(0, 0, 0, .4); touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.ftf-town-prompt:hover { background: rgba(232, 182, 84, .97); }
.ftf-town-prompt:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.ftf-town-prompt kbd { border: 1px solid rgba(29, 23, 8, .55); border-bottom-width: 2px; border-radius: 5px; padding: 1px 8px; font: 600 14px ui-monospace, Consolas, monospace; color: #1d1708; background: rgba(255, 255, 255, .35); }
.ftf-town-prompt kbd[hidden] { display: none; }
.ftf-town-cover { z-index: 9000; pointer-events: auto; opacity: 0; transition: opacity var(--ftf-town-fade, .9s) ease-in-out; }
.ftf-town-cover.is-on { opacity: 1; }
.ftf-town-cover .boot-sub { opacity: 0; transform: translateY(6px); transition: opacity .7s ease .25s, transform .7s ease .25s; }
.ftf-town-cover.is-on .boot-sub { opacity: 1; transform: none; }
html[data-motion="reduce"] .ftf-town-cover .boot-sub, .ftf-town-cover.is-plain .boot-sub { transform: none; transition: opacity .3s linear; }
/* the town quest (town-quest.js): one talk panel, bottom centre */
.ftf-quest-talk { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 13; width: min(560px, calc(100% - 32px));
.ftf-quest-talk > h3 { padding-right: 44px; }
  box-sizing: border-box; padding: 14px 16px; border-radius: 12px; background: rgba(14, 18, 20, .92); border: 1px solid rgba(233, 180, 76, .45); color: #f3ead6; font: 16px/1.45 system-ui, sans-serif; pointer-events: auto; }
.ftf-quest-talk[hidden], .ftf-quest-meta[hidden] { display: none; }
.ftf-quest-talk h3 { margin: 0 0 4px; font: 600 13px/1.3 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #e9b44c; }
.ftf-quest-talk p { margin: 0 0 10px; }
.ftf-quest-talk .ftf-quest-sign { width: 132px; height: 132px; margin: 0 auto 8px; display: block; }
.ftf-quest-talk .ftf-quest-sign svg { width: 100%; height: 100%; }
.ftf-quest-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.ftf-quest-choices button, .ftf-quest-meta button { min-height: 40px; padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(233, 180, 76, .6); background: rgba(233, 180, 76, .14); color: #f3ead6; font: 500 15px system-ui, sans-serif; cursor: pointer; }
.ftf-quest-choices button:first-child { background: rgba(233, 180, 76, .9); color: #1d1708; }
.ftf-quest-choices button:focus-visible, .ftf-quest-meta button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.ftf-quest-meta { position: absolute; top: calc(64px + env(safe-area-inset-top, 0px)); left: calc(18px + env(safe-area-inset-left, 0px)); display: flex; gap: 10px; align-items: center; color: #f3ead6; font: 14px system-ui, sans-serif; text-shadow: 0 1px 3px rgba(0, 0, 0, .8); pointer-events: auto; }
.ftf-town-profile { position: absolute; top: calc(62px + env(safe-area-inset-top, 0px)); right: calc(18px + env(safe-area-inset-right, 0px)); min-height: 36px; padding: 4px 12px; border-radius: 18px; border: 1px solid rgba(233, 180, 76, .6); background: rgba(14, 18, 20, .82); color: #f3ead6; font: 500 14px system-ui, sans-serif; cursor: pointer; pointer-events: auto; }
.ftf-town-profile[data-chests]::after { content: attr(data-chests); display: inline-grid; place-items: center; min-width: 18px; height: 18px; margin-left: 8px; padding: 0 5px; border-radius: 9px; background: #e9b44c; color: #14201c; font: 700 11px/1 system-ui, sans-serif; vertical-align: 1px; } /* sealed chests waiting in the bag */
.ftf-quest-talk dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0 0 8px; font-size: 14px; }
.ftf-quest-talk dt { color: #b9b2a2; } .ftf-quest-talk dd { margin: 0; }
.ftf-quest-talk .ftf-local { font-size: 12px; color: #b9b2a2; margin: 0 0 8px; }
.ftf-quest-meta button { min-height: 32px; padding: 2px 10px; font-size: 13px; }
@media (max-width: 700px) { .ftf-town-objective { font-size: 14px; max-width: calc(100% - 120px); } .ftf-town-prompt { font-size: 16px; bottom: calc(112px + env(safe-area-inset-bottom, 0px)); } }
@media (max-height: 440px) { .ftf-town-prompt { bottom: calc(64px + env(safe-area-inset-bottom, 0px)); } }
`;

/** Seconds of the registration sequence (docs/town.md): flare and camera lift, cover in, hold, cover out. */
/** The shrinekeeper's guide: pages of `guide.N`. */
export const GUIDE_PAGES = 5;
export const TOWN_TRANSITION = Object.freeze({ flare: 0.8, fade: 0.9, hold: 0.45, reducedFade: 0.4, islandWait: 20 });

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/**
 * @param {object} o
 * @param {object} o.town scenes/town.js handle @param {object} o.player CharacterController @param {object} o.rig camera rig
 * @param {() => boolean} o.reducedMotion @param {object} o.ctx play context (i18n) @param {Document} [o.doc]
 * @param {() => Promise<void>} o.leave moves Iris to the archipelago and starts the season (called under the cover)
 * @param {() => boolean} [o.islandReady] the archipelago's first models are in (the cover waits for it, bounded)
 * @param {() => number} [o.islandProgress] 0..1, how much of that first view has arrived (the cover's bar)
 * @param {() => string[]} [o.islandLog] `loading.log.*` keys of what is loading right now (the cover's log)
 * @param {boolean} [o.coarse] a touch device: the prompt shows no key cap
 * @param {() => void} [o.onRegister] the registration begins: Iris reaches for the altar ring (her `register` clip)
 */
export function createTownFlow({ town, player, rig, reducedMotion, ctx, doc = globalThis.document, leave, islandReady = () => true, islandProgress = () => 0, islandLog = () => [], coarse = false, onRegister = null, quest = null, npcAt = () => null, signSvg = null, ledger = null, folkNear = () => null, folkAt = () => null, onHireChange = null, onProfile = null, spots = [], onExchange = null, onMirror = null, folkList = [], onDoor = null, onWheel = null }) {
  const i18n = ctx.i18n;
  if (!doc.getElementById('ftf-town-style')) { const st = doc.createElement('style'); st.id = 'ftf-town-style'; st.textContent = CSS; doc.head.append(st); }
  const root = doc.createElement('div'); root.className = 'ftf-town'; root.hidden = true;
  const objective = doc.createElement('div'); objective.className = 'ftf-town-objective'; objective.setAttribute('role', 'status');
  const prompt = doc.createElement('button'); prompt.type = 'button'; prompt.className = 'ftf-town-prompt'; prompt.hidden = true;
  const cap = doc.createElement('kbd'); const promptText = doc.createElement('span');
  prompt.append(cap, promptText);
  // The town quest (optional): the purse and Skip under the objective, and one talk panel.
  const meta = doc.createElement('div'); meta.className = 'ftf-quest-meta'; meta.hidden = true;
  const purseEl = doc.createElement('span'); const skipBtn = doc.createElement('button'); skipBtn.type = 'button';
  meta.append(purseEl, skipBtn);
  const talkEl = doc.createElement('section'); talkEl.className = 'ftf-quest-talk'; talkEl.hidden = true; talkEl.setAttribute('aria-live', 'polite');
  talkEl.addEventListener('pointerdown', (e) => e.stopPropagation()); meta.addEventListener('pointerdown', (e) => e.stopPropagation());
  skipBtn.addEventListener('click', () => { skipBtn.blur(); if (quest) quest.skip(); });
  root.append(objective, meta);
  doc.body.append(root, prompt, talkEl);
  let talkNpc = null, talkKind = null; // the townsperson the prompt offers a talk with ('quest' | 'folk')
  let spotNear = null, spotPanel = null; // a town spot in reach (shop door, notice board, mirror) and its open panel
  let folkTalk = null; // a hire talk with any townsperson (game/town-economy.js): {npc, view: 'card' | 'result', result}
  const profileBtn = doc.createElement('button'); profileBtn.type = 'button'; profileBtn.className = 'ftf-town-profile';
  profileBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  profileBtn.addEventListener('click', () => { profileBtn.blur(); if (onProfile) onProfile(); });
  if (onProfile) root.append(profileBtn);
  let cover = null;
  let remote = false; // the open panel came from a pill: walking away does not close it
  // Collapsible panels (scenes/panel-pills.js): the chevron minimises the open panel into a pill at the right edge.
  const minBtn = doc.createElement('button'); minBtn.type = 'button'; minBtn.className = 'ftf-panel-min'; minBtn.textContent = '⌄';
  minBtn.addEventListener('click', () => { minBtn.blur(); minimise(); });
  const setTalk = (...kids) => { minBtn.setAttribute('aria-label', i18n.t('panel.minimise')); minBtn.title = i18n.t('panel.minimise'); talkEl.replaceChildren(minBtn, ...kids); };
  const openKey = () => (spotPanel ? pillKey('spot', spotPanel) : folkTalk ? pillKey('folk', folkTalk.npc) : quest && quest.talk ? pillKey('quest', quest.talk.npc) : null);
  function pillLabel(key) {
    const k = parsePillKey(key);
    if (!k) return key;
    if (k.kind === 'spot') return i18n.t('spot.' + k.id + '.title');
    if (k.kind === 'quest') return i18n.t('quest.name.' + k.id);
    const name = i18n.t('folk.name.' + k.id);
    const h = ledger && ledger.hireOf ? ledger.hireOf(k.id) : null;
    if (h && h.ready) return i18n.t('panel.pill.ready', { name });
    if (h) return i18n.t('panel.pill.hire', { name, done: h.done, total: h.rounds, s: Math.max(1, Math.ceil((h.endsAt - Date.now()) / 1000)), u: (h.unrealised >= 0 ? '+' : '') + (h.unrealised / 100).toFixed(2) });
    return name;
  }
  function closeOpen() {
    if (spotPanel) closeSpot(); else if (folkTalk) closeFolk(); else if (quest && quest.talk) quest.close(); else return false;
    return true;
  }
  function minimise() { const key = openKey(); if (!key) return false; closeOpen(); pills.add(key); return true; }
  function expandPill(key) {
    const k = parsePillKey(key);
    if (!k) return;
    if (spotPanel || folkTalk || (quest && quest.talk)) { const cur = openKey(); closeOpen(); if (cur && cur !== key) pills.add(cur); }
    remote = true;
    if (k.kind === 'spot') spotPanel = k.id;
    else if (k.kind === 'folk') folkTalk = { npc: k.id, view: k.id === 'shrinekeeper' ? 'guide' : 'card', result: null, page: 0 };
    else if (k.kind === 'quest' && quest) { remote = false; if (!quest.talkTo(k.id)) return; }
    renderTalk(); renderVisibility();
    const b = talkEl.querySelector('button:not([disabled]):not(.ftf-panel-min)'); if (b && b.focus) b.focus();
  }
  const pills = createPillStack({ doc, storage: ctx.storage || null, label: pillLabel, onExpand: expandPill, expandLabel: (text) => i18n.t('panel.expand', { name: text }) });
  pills.setVisible(false);
  let pillClock = 0;

  // phase: 'off' (not entered yet) -> 'town' -> 'transition' -> 'done'
  const state = { phase: 'off', ready: false, near: false, device: coarse ? 'touch' : 'keyboard', route: null, lift: 0, liftFrom: 0, focusK: 0, registering: null, startedAt: 0, arrivedAt: 0 };

  function renderText() {
    objective.textContent = i18n.t(state.ready ? (state.resume ? 'town.objective.resume' : quest ? quest.objective : 'town.objective') : 'town.loading');
    promptText.textContent = spotNear && !talkNpc ? i18n.t(onDoor && DOORS.has(spotNear.id) ? 'town.shop.enter.' + spotNear.id : 'spot.' + spotNear.id) : talkNpc ? i18n.t('quest.talk', { name: i18n.t((talkKind === 'quest' ? 'quest.name.' : 'folk.name.') + talkNpc) }) : i18n.t(state.resume ? 'town.altar.resume' : 'town.altar.prompt');
    if (onProfile && ledger) { const lv = ledger.level; profileBtn.textContent = i18n.t('profile.button', { level: lv.level }); }
    if (quest) {
      meta.hidden = !(state.ready && (quest.active || quest.purse > 0));
      purseEl.textContent = quest.purse > 0 || quest.step === 'deliver' ? i18n.t('quest.purse', { n: quest.purse }) : '';
      skipBtn.textContent = i18n.t('quest.skip'); skipBtn.hidden = !quest.active;
      renderTalk();
    }
    cap.textContent = state.device === 'gamepad' ? 'A' : 'E';
    cap.hidden = state.device === 'touch';
    if (cover) { const sb = cover.querySelector('.boot-sub'); if (sb) sb.textContent = i18n.t('town.transition.title'); }
  }
  function renderVisibility() {
    const on = state.phase === 'town';
    root.hidden = !on;
    const talking = !!((quest && quest.talk) || folkTalk || spotPanel);
    prompt.hidden = !(on && state.ready && (talkNpc || spotNear || state.near) && !talking);
    talkEl.hidden = !(on && talking);
    pills.setVisible(on);
  }
  /** The open talk: speaker, line, the sign when the line asks to read it, and the choices as buttons. */
  function renderTalk() {
    { const k = openKey(); if (k && pills.has(k)) pills.remove(k); }
    if (spotPanel) { renderSpot(); return; }
    if (folkTalk) { renderFolk(); return; }
    const tk = quest && quest.talk;
    if (!tk) { talkEl.replaceChildren(); return; }
    const h = doc.createElement('h3'); h.textContent = i18n.t('quest.name.' + tk.npc);
    const line = doc.createElement('p'); line.textContent = i18n.t(tk.node.line);
    const kids = [h];
    if (tk.node.sign && signSvg) {
      const box = doc.createElement('div'); box.className = 'ftf-quest-sign'; box.setAttribute('role', 'img'); box.setAttribute('aria-label', i18n.t('quest.signAlt'));
      try { const el = signSvg(); if (el) box.append(el); } catch (e) { console.warn('[town] quest sign', e); }
      kids.push(box);
    }
    const row = doc.createElement('div'); row.className = 'ftf-quest-choices';
    tk.node.choices.forEach((c, i) => {
      const b = doc.createElement('button'); b.type = 'button'; b.textContent = i18n.t(c.key); b.dataset.choice = String(i);
      b.addEventListener('click', () => { b.blur(); quest.choose(i); });
      row.append(b);
    });
    const close = doc.createElement('button'); close.type = 'button'; close.textContent = i18n.t('quest.close'); close.addEventListener('click', () => quest.close());
    row.append(close);
    kids.push(line, row);
    setTalk(...kids);
  }
  /** The hire talk: the townsperson's card, then the result card (docs/agent-rental-plan.md). */
  function renderFolk() {
    const { npc } = folkTalk;
    const T = (k, a) => i18n.t(k, a);
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const b = (key, fn, primary = false, disabled = false) => { const x = el('button', null, T(key)); x.type = 'button'; x.disabled = disabled; if (!primary) x.style.background = 'rgba(233,180,76,.14)', x.style.color = '#f3ead6'; x.addEventListener('click', () => { x.blur(); fn(); }); return x; };
    const kids = [el('h3', null, T('folk.name.' + npc))];
    const row = el('div', 'ftf-quest-choices');
    const h = ledger.hireOf(npc);
    if (folkTalk.view === 'guide') {
      // the shrinekeeper is the guide (owner, 11.11): what the tutorial screens used to say, as four short talks
      const last = GUIDE_PAGES - 1, pg = folkTalk.page;
      const anim = guideAnim(doc, pg + 1); if (anim) kids.push(anim);
      kids.push(el('p', null, T('guide.' + (pg + 1))));
      if (pg < last) row.append(b('quest.next', () => { folkTalk.page++; renderFolk(); }, true));
      row.append(b('quest.close', closeFolk, pg === last));
      kids.push(row);
      setTalk(...kids);
      return;
    }
    if (folkTalk.view === 'result' && !folkTalk.result) { talkEl.replaceChildren(); return; } // collecting: the result follows
    if (folkTalk.view === 'result' && folkTalk.result) {
      const r = folkTalk.result;
      kids.push(el('p', null, T('hire.result.title', { name: T('folk.name.' + npc) })));
      const dl = el('dl');
      for (const x of r.rounds) dl.append(el('dt', null, T('hire.result.round', { n: x.n })), el('dd', null, T('hire.result.roundLine', { stake: (x.stake / 100).toFixed(2), back: (x.back / 100).toFixed(2) })));
      dl.append(el('dt', null, T('hire.result.net')), el('dd', null, (r.net >= 0 ? '+' : '') + (r.net / 100).toFixed(2)), el('dt', null, T('hire.result.seed')), el('dd', null, r.seed));
      kids.push(dl, ledgerRow(npc, r, el, b), teeAdvisorRow(npc, r, el, b));
      row.append(b('quest.close', closeFolk, true));
    } else if (h && h.ready) {
      kids.push(el('p', null, T('hire.back')));
      row.append(b('hire.seeResult', () => { folkTalk.view = 'result'; const r = ledger.collect(npc); if (r.ok) { folkTalk.result = r.result; if (onHireChange) onHireChange(npc, false); } else folkTalk.view = 'card'; renderFolk(); renderText(); renderVisibility(); }, true), b('quest.close', closeFolk));
    } else if (h) {
      kids.push(el('p', null, T('hire.working', { s: Math.max(1, Math.ceil((h.endsAt - Date.now()) / 1000)) })), el('p', 'ftf-local', T('open.line', { name: T('folk.name.' + npc), done: h.done, total: h.rounds, u: (h.unrealised / 100).toFixed(2) })));
      row.append(b('quest.close', closeFolk, true));
    } else {
      const temp = ledger.temperamentOf ? ledger.temperamentOf(npc) : null;
      const ag = ledger.agent(npc);
      kids.push(el('p', null, T('hire.greet')));
      const dl = el('dl');
      dl.append(el('dt', null, T('hire.card.temperament')), el('dd', null, T('hire.temp.' + (temp || 'steady'))),
        el('dt', null, T('hire.card.terms')), el('dd', null, T('hire.card.termsLine', { price: ag.price, rounds: HIRE.rounds, seconds: HIRE.rounds * HIRE.roundSeconds })),
        el('dt', null, T('hire.card.return')), el('dd', null, ag.measured == null ? T('hire.card.returnLine') : T('hire.card.measured', { pct: (ag.measured * 100).toFixed(1), n: ag.recent.length, exp: ag.experience })),
        el('dt', null, T('hire.card.purse')), el('dd', null, (ledger.silk / 100).toFixed(2)));
      kids.push(dl);
      const why = ledger.canHire(npc);
      if (why) kids.push(el('p', 'ftf-local', T('hire.why.' + why)));
      row.append(b('hire.hire', () => { const r = ledger.hire(npc); if (r.ok && onHireChange) onHireChange(npc, true); renderText(); renderVisibility(); }, true, !!why), b('quest.close', closeFolk));
    }
    // scripted dialogue (game/intents.js): type a question, the townsperson answers from a script and its real state
    const form = el('form'); form.style.cssText = 'display:flex;gap:6px;margin:4px 0 8px';
    const input = el('input'); input.type = 'text'; input.maxLength = 120; input.placeholder = T('chat.placeholder', { name: T('folk.name.' + npc) });
    input.setAttribute('aria-label', input.placeholder);
    input.style.cssText = 'flex:1;min-height:36px;padding:4px 10px;border-radius:8px;border:1px solid rgba(233,180,76,.5);background:#1c2426;color:#f3ead6;font:15px system-ui,sans-serif';
    const send = el('button', null, T('chat.send')); send.type = 'submit'; send.style.background = 'rgba(233,180,76,.14)'; send.style.color = '#f3ead6';
    form.append(input, send);
    form.addEventListener('submit', (e) => { e.preventDefault(); folkTalk.replyIntent = chatIntent(input.value); folkTalk.reply = chatReply(npc, input.value); folkTalk.asked = input.value; teeSay(npc, input.value); renderFolk(); const i = talkEl.querySelector('input'); if (i) i.focus(); });
    form.addEventListener('keydown', (e) => e.stopPropagation());
    if (folkTalk.reply) kids.push(el('p', 'ftf-local', '“' + folkTalk.asked + '”'), el('p', null, folkTalk.reply));
    if (folkTalk.reply && folkTalk.tee) kids.push(teeLine(folkTalk.tee, el, b));
    if (folkTalk.replyIntent === 'verify') kids.push(copyStepsButton(npc, folkTalk.result || (ledger.results ? ledger.results(npc)[0] : null), el, b));
    kids.push(form, el('p', 'ftf-local', T('hire.local')), row);
    setTalk(...kids);
  }
  /** The matched intent of a typed question (the verify intent adds the copy button). */
  function chatIntent(text) {
    const en = PLAY_MESSAGES.en;
    return matchIntent(text, (k) => (i18n.t(k) === k ? '' : i18n.t(k)) + '|' + (en[k] || '')).intent;
  }
  // Track records on NEAR testnet (net/agent-ledger.js, loaded on first use: it stays out of this chunk).
  let ledgerMod = null, ledgerLoading = null;
  const withLedger = () => ledgerMod ? Promise.resolve(ledgerMod) : (ledgerLoading ||= import('../net/agent-ledger.js').then((m) => { ledgerMod = m; if (folkTalk) renderFolk(); return m; }));
  /** Record / status row under a hire result: honest states only ("Verified" after the read-back re-computes). */
  function ledgerRow(npc, r, el, b) {
    const box = el('div', 'ftf-local');
    if (!ledgerMod) { withLedger(); return box; }
    const st = folkTalk.chain || null;
    const why = ledgerMod.recordBlocker({ storage: ctx.storage || globalThis.localStorage, result: r });
    if (st && st.state === 'sending') box.append(el('p', null, i18n.t('ledger.sending')));
    else if (st && st.state === 'done') {
      box.append(el('p', null, st.verified ? i18n.t('ledger.verified') : i18n.t('ledger.mismatch', { reason: st.reason })));
      if (st.hash) { const a = el('a', null, i18n.t('ledger.view')); a.href = 'https://testnet.nearblocks.io/txns/' + st.hash; a.target = '_blank'; a.rel = 'noopener noreferrer'; box.append(a); }
      box.append(copyStepsButton(npc, r, el, b));
    } else if (why) box.append(el('p', null, i18n.t('ledger.why.' + why)));
    else {
      if (st && st.state === 'failed') box.append(el('p', null, i18n.t('ledger.failed', { reason: st.reason })));
      box.append(b('ledger.record', () => {
        folkTalk.chain = { state: 'sending' }; renderFolk();
        const talk = folkTalk;
        ledgerMod.recordHire({ storage: ctx.storage || globalThis.localStorage, npc, result: r })
          .then((x) => { talk.chain = x.ok ? { state: 'done', verified: x.verified, reason: x.reason, hash: x.hash } : { state: 'failed', reason: x.reason }; })
          .catch((e) => { talk.chain = { state: 'failed', reason: String((e && e.message) || e).slice(0, 60) }; })
          .finally(() => { if (folkTalk === talk) renderFolk(); });
      }, true));
    }
    return box;
  }
  // TEE agents (net/tee-agent.js, ui/tee-panel.js; docs/tee.md), loaded on first use. The scripted line shows at once;
  // a TEE line replaces it only when the relayer and this browser both verified its signature.
  let teeMod = null;
  const withTee = () => Promise.all([import('../net/tee-agent.js'), import('../ui/tee-panel.js')]).then(([a, p]) => (teeMod = { ...a, ...p }));
  function teeSay(npc, question) {
    const talk = folkTalk, facts = talk.reply;
    if (typeof globalThis.fetch !== 'function') return;
    withTee().then(async (m) => {
      if (!(await m.teeAvailable())) return;
      if (folkTalk !== talk || talk.reply !== facts) return;
      talk.tee = { state: 'asking' }; renderFolk();
      const r = await m.askTee('say', { npc, question, facts, lang: i18n.locale });
      if (talk.reply !== facts) return;
      if (r && r.body.text) { talk.reply = r.body.text; talk.tee = { state: 'ok', tee: r.body.tee, check: r.check }; } else talk.tee = { state: 'scripted' };
      if (folkTalk === talk) renderFolk();
    }).catch(() => {});
  }
  /** Under a line: "Asking the TEE…", the "Verified in TEE ✓" button that opens the detail panel, or the scripted note. */
  function teeLine(st, el, b, extra = () => []) {
    if (st.state === 'asking') return el('p', 'ftf-local', i18n.t('tee.asking'));
    if (st.state !== 'ok' || !teeMod) return el('p', 'ftf-local', i18n.t('tee.scripted'));
    return b('tee.badge', () => teeMod.openTeePanel({ doc, t: (k, a) => i18n.t(k, a), tee: st.tee, check: st.check, extra: extra() }));
  }
  /** Under a hire result: ask the TEE advisor for buy/sell/hold on the last market the trader worked; record it on-chain. */
  function teeAdvisorRow(npc, r, el, b) {
    const box = el('div', 'ftf-local');
    const last = r && r.rounds && r.rounds[r.rounds.length - 1];
    if (!last || !last.echo || typeof globalThis.fetch !== 'function') return box;
    const st = folkTalk.advice || null;
    if (!st) {
      box.append(b('tee.advise', () => {
        const talk = folkTalk; talk.advice = { state: 'asking' }; renderFolk();
        const t = last.t, bars = [];
        for (let i = Math.max(0, t - 15); i <= t; i++) bars.push(Math.round(snapshotSeries(last.echo, i)));
        withTee().then((m) => m.askTee('decide', { npc, echo: last.echo, bars, position: 0 }))
          .then((x) => { talk.advice = x && x.body.decision ? { state: 'ok', decision: x.body.decision, tee: x.body.tee, check: x.check } : { state: 'none' }; })
          .catch(() => { talk.advice = { state: 'none' }; })
          .finally(() => { if (folkTalk === talk) renderFolk(); });
      }));
      return box;
    }
    if (st.state === 'asking') { box.append(el('p', null, i18n.t('tee.asking'))); return box; }
    if (st.state === 'none') { box.append(el('p', null, i18n.t('tee.adviceNone'))); return box; }
    const d = st.decision;
    box.append(el('p', null, i18n.t('tee.advice', { echo: i18n.t('exch.echo.' + d.echo), action: i18n.t('tee.action.' + d.action), reason: d.reason || '' })));
    const chainNote = () => {
      if (!st.chain || st.chain.state === 'sending') return [];
      const reason = st.chain.reason && i18n.has && i18n.has('ledger.why.' + st.chain.reason) ? i18n.t('ledger.why.' + st.chain.reason) : String(st.chain.reason || '').replace(/_/g, ' ');
      const p = el('p', null, st.chain.ok ? i18n.t('tee.recorded') : i18n.t('tee.recordFailed', { reason }));
      if (!st.chain.hash) return [p];
      const a = el('a', null, i18n.t('ledger.view')); a.href = 'https://testnet.nearblocks.io/txns/' + st.chain.hash; a.target = '_blank'; a.rel = 'noopener noreferrer';
      return [p, a];
    };
    box.append(teeLine(st, el, b, chainNote));
    if (st.chain && st.chain.state === 'sending') box.append(el('p', null, i18n.t('tee.recording')));
    else if (st.chain) box.append(...chainNote());
    else if (teeMod.teeRecordBlocker(ctx.storage || globalThis.localStorage)) box.append(el('p', null, i18n.t('ledger.why.' + teeMod.teeRecordBlocker(ctx.storage || globalThis.localStorage))));
    else box.append(b('tee.record', () => {
      const talk = folkTalk; st.chain = { state: 'sending' }; renderFolk();
      teeMod.recordTeeDecision({ storage: ctx.storage || globalThis.localStorage, npc, decision: d, tee: st.tee })
        .then((x) => { st.chain = x; }).catch((e) => { st.chain = { ok: false, reason: String((e && e.message) || e).slice(0, 60) }; })
        .finally(() => { if (folkTalk === talk) renderFolk(); });
    }));
    return box;
  }
  /** Copies the verification steps (for a person or any AI agent) for this agent's latest recorded hire. */
  function copyStepsButton(npc, r, el, b) {
    const btn = b('ledger.copy', () => {
      withLedger().then((m) => {
        const g = m.guestFrom(ctx.storage || globalThis.localStorage);
        const text = m.verificationSteps({ accountId: g ? g.accountId : '<your guest account>', npc, epoch: r && r.epoch != null ? r.epoch : '<epoch>' });
        const done = () => { btn.textContent = i18n.t('ledger.copied'); };
        try { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(done, () => { globalThis.prompt && globalThis.prompt('', text); }); } catch { /* no clipboard */ }
      });
    });
    return btn;
  }
  /** The scripted answer to a typed question: the player's language and English words both match. */
  function chatReply(npc, text) {
    const en = PLAY_MESSAGES.en;
    const lex = (k) => (i18n.t(k) === k ? '' : i18n.t(k)) + '|' + (en[k] || '');
    const m = matchIntent(text, lex);
    const last = ledger.log(npc)[0] || null;
    const r = replyFor(m, { agent: ledger.agent(npc), lastTrade: last, rounds: HIRE.rounds });
    const a = { ...r.args };
    if (a.echo) a.echo = i18n.t('exch.echo.' + a.echo);
    if (a.side) a.side = i18n.t('log.side.' + a.side);
    if (a.reason) a.reason = i18n.t('log.reason.' + a.reason);
    return i18n.t(r.key, a);
  }
  /** A town spot's panel: the Exchange door, the Scribe's glossary, the Inn's hiring board, the notice board. */
  function renderSpot() {
    const T = (k, a) => i18n.t(k, a);
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const b = (key, fn, primary = false, disabled = false, args) => { const x = el('button', null, T(key, args)); x.type = 'button'; x.disabled = disabled; if (!primary) { x.style.background = 'rgba(233,180,76,.14)'; x.style.color = '#f3ead6'; } x.addEventListener('click', () => { x.blur(); fn(); }); return x; };
    const id = spotPanel;
    const kids = [el('h3', null, T('spot.' + id + '.title'))];
    const row = el('div', 'ftf-quest-choices');
    if (id === 'exchange') {
      kids.push(el('p', null, T('spot.exchange.line')));
      row.append(b('spot.exchange.shards', () => { closeSpot(); if (onProfile) onProfile(); }, true), b('spot.exchange.echo', () => { closeSpot(); if (onExchange) onExchange(); }, true));
      // the trading board on the wall: the last agent trades
      if (ledger) {
        const lines = ledger.log().slice(0, 6);
        kids.push(el('p', 'ftf-local', T('spot.exchange.board')));
        for (const l of lines) kids.push(el('p', 'ftf-local', T('log.line', { time: new Date(l.at).toLocaleTimeString(), name: T('folk.name.' + l.npc), echo: T('exch.echo.' + l.echo), side: T('log.side.' + l.side), size: l.size, entry: (l.entry / 100).toFixed(2), exit: (l.exit / 100).toFixed(2), result: (l.result >= 0 ? '+' : '') + (l.result / 100).toFixed(2), reason: T('log.reason.' + l.reason) })));
        if (!lines.length) kids.push(el('p', 'ftf-local', T('open.none')));
      }
    } else if (id === 'scribe') {
      const dl = el('dl');
      for (const k of ['sign', 'slots', 'silk', 'shell', 'trial', 'seal', 'memory', 'shard']) dl.append(el('dt', null, T('gloss.' + k)), el('dd', null, T('gloss.' + k + '.def')));
      kids.push(dl);
    } else if (id === 'inn') {
      kids.push(el('p', null, T('spot.inn.line')));
      const dl = el('dl');
      for (const npc of folkList) {
        const h = ledger.hireOf(npc), ag = ledger.agent(npc), why = ledger.canHire(npc);
        const dd = el('dd');
        dd.append(doc.createTextNode(T('hire.temp.' + (ledger.temperamentOf(npc) || 'steady')) + ' · ' + (ag.measured == null ? T('spot.inn.novice') : (ag.measured * 100).toFixed(1) + ' %') + ' · ' + ag.price + ' '));
        if (h && h.ready) dd.append(b('hire.seeResult', () => { spotPanel = null; folkTalk = { npc, view: 'result', result: null }; const r = ledger.collect(npc); if (r.ok) { folkTalk.result = r.result; if (onHireChange) onHireChange(npc, false); } renderTalk(); renderVisibility(); }, true));
        else if (h) dd.append(doc.createTextNode(T('open.line', { name: '', done: h.done, total: h.rounds, u: (h.unrealised / 100).toFixed(2) }).replace(/^:\s*/, '')));
        else dd.append(b('spot.inn.hire', () => { const r = ledger.hire(npc); if (r.ok && onHireChange) onHireChange(npc, true); renderSpot(); }, true, !!why));
        dl.append(el('dt', null, T('folk.name.' + npc)), dd);
      }
      kids.push(dl, el('p', 'ftf-local', T('hire.card.purse') + ': ' + (ledger.silk / 100).toFixed(2)));
    } else if (id === 'board') {
      for (const k of ['1', '2', '3', '4', '5', '6']) kids.push(el('p', null, T('board.' + k)));
    }
    if (id === 'inn' || id === 'exchange') kids.push(el('p', 'ftf-local', T('hire.local')));
    row.append(b('quest.close', closeSpot));
    kids.push(row);
    setTalk(...kids);
  }
  function closeSpot() { spotPanel = null; remote = false; renderText(); renderVisibility(); }
  function closeFolk() { folkTalk = null; remote = false; renderText(); renderVisibility(); }
  const unLedger = ledger && ledger.subscribe ? ledger.subscribe(() => { if (spotPanel === 'inn') renderSpot(); else if (folkTalk) renderFolk(); renderText(); }) : null;
  const unQuest = quest ? quest.subscribe(() => { renderText(); renderVisibility(); }) : null;
  const unsubscribe = typeof i18n.subscribe === 'function' ? i18n.subscribe(renderText) : null;
  prompt.addEventListener('click', () => { prompt.blur(); interact(); });
  prompt.addEventListener('pointerdown', (e) => e.stopPropagation()); // never a walk order
  renderText();

  /** The player is in the town from now on (the lobby closed, or the direct path began). */
  function begin() {
    if (state.phase !== 'off') return;
    state.phase = 'town'; state.startedAt = performance.now();
    if (quest) quest.begin();
    renderText(); renderVisibility();
  }

  /**
   * Per frame, after physics. No allocations; the DOM is touched only when something changed.
   * @param {number} dt @param {{device?: string}} o device: 'keyboard' | 'gamepad' (the last input device)
   */
  function update(dt, { device = 'keyboard' } = {}) {
    if (state.phase === 'transition') {
      if (state.lift > 0) {
        // the camera lifts off Iris toward the altar while the core flares
        state.focusK = Math.min(1, state.focusK + dt / TOWN_TRANSITION.flare);
        rig.dist = Math.min(state.liftFrom + 7, rig.dist + dt * 5.5);
        rig.tilt(dt * 0.3);
      }
      return;
    }
    if (state.phase !== 'town') return;
    const dev = coarse && device !== 'gamepad' ? 'touch' : device === 'gamepad' ? 'gamepad' : 'keyboard';
    const ready = !!town.ready, near = ready && inAltarRange(player.pos);
    if (near && !state.arrivedAt) state.arrivedAt = performance.now();
    if (dev !== state.device || ready !== state.ready) { state.device = dev; state.ready = ready; renderText(); }
    // the quest's townsperson in reach comes first (the shrinekeeper stands beside the altar), then the altar
    const qNpc = quest && ready ? talkTarget(quest, player.pos, npcAt) : null;
    const sp = !qNpc && ready ? spots.find((s) => s.near(player.pos)) || null : null;
    if (sp !== spotNear) { spotNear = sp; renderText(); renderVisibility(); }
    if (spotPanel && !sp && !remote) closeSpot(); // walked away from the door or the board
    const fNpc = !qNpc && !sp && ledger && ready ? folkNear(player.pos) : null;
    const npc = qNpc || fNpc, kind = qNpc ? 'quest' : fNpc ? 'folk' : null;
    if (npc !== talkNpc || kind !== talkKind) { talkNpc = npc; talkKind = kind; renderText(); renderVisibility(); }
    if (quest && quest.talk) { const p = npcAt(quest.talk.npc); if (p && Math.hypot(p[0] - player.pos[0], p[2] - player.pos[2]) > TALK_LEAVE) quest.close(); }
    if (folkTalk && !remote) { const p = folkAt(folkTalk.npc); if (p && Math.hypot(p[0] - player.pos[0], p[2] - player.pos[2]) > TALK_LEAVE) closeFolk(); }
    pillClock += dt; if (pillClock > 0.5) { pillClock = 0; pills.refresh(); }
    const talking = !!((quest && quest.talk) || folkTalk || spotPanel);
    if (near !== state.near || prompt.hidden === (ready && (near || !!talkNpc || !!spotNear) && !talking)) { state.near = near; renderVisibility(); }
  }

  /** E, the gamepad's interact button or a tap on the prompt: registers when the prompt is offered. */
  function interact() {
    if ((quest && quest.talk) || folkTalk || spotPanel) return Promise.resolve(false); // the talk's own buttons answer
    if (spotNear && !talkNpc) {
      if (spotNear.id === 'mirror') { if (onMirror) onMirror(); return Promise.resolve(false); }
      if (spotNear.id === 'wheel') { if (onWheel) onWheel(); return Promise.resolve(false); }
      if (onDoor && DOORS.has(spotNear.id) && onDoor(spotNear.id)) return Promise.resolve(false); // walk into the shop (scenes/town-shops.js)
      spotPanel = spotNear.id; renderTalk(); renderVisibility(); const b = talkEl.querySelector('button:not([disabled])'); if (b && b.focus) b.focus(); return Promise.resolve(false);
    }
    if (talkNpc && talkKind === 'folk') { folkTalk = { npc: talkNpc, view: talkNpc === 'shrinekeeper' ? 'guide' : 'card', result: null, page: 0 }; renderTalk(); renderVisibility(); const b = talkEl.querySelector('button:not([disabled])'); if (b && b.focus) b.focus(); return Promise.resolve(false); }
    if (talkNpc && quest.talkTo(talkNpc)) { const b = talkEl.querySelector('button'); if (b && b.focus) b.focus(); return Promise.resolve(false); }
    return register();
  }

  /** The registration sequence. Resolves true once the season runs on the archipelago, false when not offered. */
  function register() {
    if (state.registering) return state.registering;
    if (state.phase !== 'town' || !town.ready || !inAltarRange(player.pos)) return Promise.resolve(false);
    state.registering = run();
    return state.registering;
  }

  async function run() {
    const reduced = !!reducedMotion();
    state.phase = 'transition'; state.route = null;
    if (quest) quest.close();
    folkTalk = null; spotPanel = null;
    renderVisibility();
    // The cover is the loading screen itself (ui/loading.js createVeil): the same dark screen, its line following the
    // archipelago's real first-view progress, its log what is loading now, the subtitle "The Tournament begins".
    const veil = createVeil(doc, { sub: i18n.t('town.transition.title'), t: (k) => i18n.t(k) });
    cover = veil ? veil.el : doc.createElement('div');
    cover.classList.add('ftf-town-cover'); if (reduced) cover.classList.add('is-plain');
    cover.setAttribute('role', 'status');
    cover.style.setProperty('--ftf-town-fade', (reduced ? TOWN_TRANSITION.reducedFade : TOWN_TRANSITION.fade) + 's');
    if (!veil) { const sp = doc.createElement('span'); sp.className = 'boot-sub'; cover.append(sp); }
    const ink = { set: (v) => { if (veil) veil.set(v); }, log: (k) => { if (veil) veil.log(k); }, destroy() {} };
    let shown = 0;
    const progress = (v) => { shown = Math.max(shown, Math.min(1, v)); ink.set(shown); };
    renderText();
    doc.body.append(cover);
    town.setFlare(1);
    if (onRegister) { try { onRegister(); } catch (e) { console.warn('[town] register cue failed', e); } }
    if (!reduced) { state.lift = 1; state.liftFrom = rig.dist; await sleep(TOWN_TRANSITION.flare); }
    void cover.offsetWidth; // the opacity transition starts from 0
    cover.classList.add('is-on');
    await sleep(reduced ? TOWN_TRANSITION.reducedFade : TOWN_TRANSITION.fade);
    // The screen is covered: move to the archipelago and start the season.
    state.lift = 0; state.focusK = 0;
    town.setFlare(0);
    try { await leave(); } catch (e) { console.error('[town] the season failed to start', e); }
    const t0 = performance.now();
    while (!islandReady() && performance.now() - t0 < TOWN_TRANSITION.islandWait * 1000) { progress(Math.min(0.97, islandProgress())); for (const k of islandLog().slice(0, 1)) ink.log(k); await sleep(0.1); }
    progress(1); ink.log('loading.log.ready');
    await sleep(TOWN_TRANSITION.hold);
    state.phase = 'done';
    cover.classList.remove('is-on');
    const gone = cover;
    setTimeout(() => { ink.destroy(); gone.remove(); if (state.phase !== 'town') { root.remove(); prompt.remove(); talkEl.remove(); } }, (reduced ? TOWN_TRANSITION.reducedFade : TOWN_TRANSITION.fade) * 1000 + 100);
    cover = null;
    return true;
  }

  /** QA: follow the jury route from the nearest remaining point to the altar stand (the same physics as a player). */
  function walkRoute() {
    if (state.phase !== 'town') return false;
    let first = 0, best = Infinity;
    for (let i = 0; i < TOWN_ROUTE.length; i++) { const d = Math.hypot(TOWN_ROUTE[i][0] - player.pos[0], TOWN_ROUTE[i][2] - player.pos[2]); if (d < best) { best = d; first = i; } }
    state.route = TOWN_ROUTE.slice(Math.min(first + (best < 1 ? 1 : 0), TOWN_ROUTE.length - 1)).map((p) => p.slice());
    const stand = town.altar.stand;
    state.route[state.route.length - 1] = [stand[0], stand[1], stand[2]];
    return true;
  }
  function cancelRoute() { state.route = null; }

  /** Steering for the frame loop while the QA route is active; null when idle. */
  function routeWish() {
    while (state.route) {
      const last = state.route.length === 1;
      const w = steerTo(player.pos, state.route[0], last ? 0.3 : 0.7);
      if (w) { const l = Math.hypot(w[0], w[1]); return last || l === 0 ? w : [w[0] / l, w[1] / l]; }
      state.route.shift();
      if (!state.route.length) state.route = null;
    }
    return null;
  }

  /** Back from the archipelago (Return to town): the town UI again; the altar resumes the same season. */
  function reenter() {
    doc.body.append(root, prompt, talkEl);
    state.phase = 'town'; state.resume = true; state.registering = null; state.lift = 0; state.focusK = 0; state.near = false;
    renderText(); renderVisibility();
  }

  return {
    begin, update, reenter,
    /** Esc: closes the open talk panel. O: expands the newest minimised panel. */
    closePanel: () => closeOpen(), expandPill: () => pills.expandLatest(), get pills() { return pills; }, minimise,
    /** The shop counter (scenes/town-shops.js): opens the panel the door used to open. */
    openSpot(id) { if (spotPanel || folkTalk) closeOpen(); remote = true; spotPanel = id; renderTalk(); renderVisibility(); const b = talkEl.querySelector('button:not([disabled]):not(.ftf-panel-min)'); if (b && b.focus) b.focus(); },
    get questActive() { return !!(quest && quest.active); }, interact, register, walkRoute, cancelRoute, routeWish,
    get phase() { return state.phase; },
    /** Input and physics are held: the registration sequence is running. */
    get busy() { return state.phase === 'transition'; },
    get registered() { return state.phase === 'done'; },
    get routeActive() { return !!state.route; },
    get promptVisible() { return !prompt.hidden; },
    /** 0..1: how far the camera focus has left Iris for the altar during the flare. */
    get focusK() { return state.focusK; },
    /** Milliseconds from entering the town to first standing in the prompt radius (QA: the jury walk), or null. */
    get walkMs() { return state.arrivedAt ? Math.round(state.arrivedAt - state.startedAt) : null; },
    /** The townsperson the prompt offers a talk with, or null. */
    get talkNpc() { return talkNpc; },
    /** A talk or a spot panel is open (the barks hold back). */
    get talking() { return !!((quest && quest.talk) || folkTalk || spotPanel); },
    elements: { root, objective, prompt, talk: talkEl, questMeta: meta },
  };
}

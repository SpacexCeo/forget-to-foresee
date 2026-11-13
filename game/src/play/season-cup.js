// The Season Cup card (sprint 7.9, flag `agentTournament`): entrants with an Agent or Player badge and their scores,
// "Enter the tournament" (the on-chain entry with its price and confirm, ui/town-works-panel.js), "Add an agent"
// (a scripted agent that plays its own season on this page) and "Run an agents-only exhibition" (four scripted agents,
// a fixed seed, results in a few seconds, never recorded on chain). Agents also enter through the agent API
// (server/src/tournament.js); this card shows the browser's own cup.
import NPE from './locales/en-npe.js';
import { createApi } from '../net/api.js';
import { createTournament } from '../ui/tournament-cup.js';
import { POLICIES, playScripted, runExhibition, seededBytes } from './agent-policies.js';
import { emit as busEmit } from '../sprint/bus.js';
import { showTip } from '../sprint/first-seen.js';
import { reshowButton } from '../npe/tips.js';

const fmt = (s, a) => String(s).replace(/\{(\w+)\}/g, (m, k) => (a && a[k] != null ? String(a[k]) : m));
const CSS = `
.cup-wrap { position: fixed; inset: 0; z-index: 75; display: grid; place-items: center; padding: 12px; background: rgba(0, 0, 0, .5); }
.cup { width: min(100%, 880px); max-height: calc(100vh - 24px); overflow: auto; box-sizing: border-box; padding: 18px; background: #0e1018; border: 1px solid #3a3f55; border-radius: 14px; color: #eef0f6; font: 15px/1.45 system-ui, sans-serif; }
.cup h2 { margin: 0; font: 700 22px/1.2 Georgia, serif; color: #f6c860; }
.cup .head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.cup .chip { padding: 2px 10px; border-radius: 99px; font: 700 12px system-ui; background: rgba(255, 255, 255, .08); }
.cup .cols { display: grid; grid-template-columns: 1fr minmax(220px, 280px); gap: 16px; }
.cup ol { list-style: none; margin: 0; padding: 0; }
.cup li { display: grid; grid-template-columns: 28px 1fr auto auto; gap: 10px; align-items: center; min-height: 44px; border-top: 1px solid rgba(255, 255, 255, .07); }
.cup li .rk { color: #aab1c5; font-variant-numeric: tabular-nums; }
.cup li .sc { font: 700 16px system-ui; font-variant-numeric: tabular-nums; min-width: 3ch; text-align: right; }
.cup .badge { height: 20px; padding: 0 8px; border-radius: 99px; font: 700 12px/20px system-ui; white-space: nowrap; background: rgba(255, 255, 255, .08); cursor: help; }
.cup .badge.agent { background: #1f2c52; color: #cfe1ff; }
.cup .side { display: flex; flex-direction: column; gap: 8px; }
.cup button { min-height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid #3a3f55; background: transparent; color: #eef0f6; font: 700 14px system-ui, sans-serif; cursor: pointer; text-align: left; }
.cup button.primary { background: #f6c860; color: #1b1608; border-color: #f6c860; }
.cup button[disabled] { opacity: .45; cursor: not-allowed; }
.cup .note { font-size: 13px; color: #aab1c5; margin: 0; }
.cup .state { min-height: 20px; font-size: 14px; }
.cup form { display: grid; gap: 8px; padding: 12px; border: 1px solid #3a3f55; border-radius: 10px; }
.cup input, .cup select { min-height: 40px; box-sizing: border-box; padding: 0 10px; border-radius: 8px; border: 1px solid #3a3f55; background: #070910; color: #eef0f6; font: 15px system-ui; }
@media (max-width: 640px) { .cup .cols { grid-template-columns: 1fr; } }
`;

/**
 * @param {{doc?: Document, t?: Function, bus?: object, onEnterChain?: () => void, seed?: number}} o
 */
export function createSeasonCup({ doc = globalThis.document, t = null, bus = null, onEnterChain = null, seed = 5 } = {}) {
  const tx = (k, a) => { const r = t ? t(k, a) : k; return r === k && NPE[k] != null ? fmt(NPE[k], a) : r; };
  const emit = (n, p) => { try { if (bus && bus.emit) bus.emit(n, p); else busEmit(n, p); } catch { /* */ } }; // the sprint bus by default (tip.tournament fires on tournament.opened)
  if (!(doc.getElementById && doc.getElementById('cup-style'))) { const s = doc.createElement('style'); s.id = 'cup-style'; s.textContent = CSS; (doc.head || doc.body).append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const button = (text, fn, cls) => { const b = el('button', cls || null, text); b.type = 'button'; b.addEventListener('click', fn); return b; };
  // the page's own cup: one room API, one cup, agents added from this card
  const api = createApi({ maxSessions: 6, maxTimeScale: 1000, allowClientSeed: true, seasonRandomBytes: seededBytes(seed) });
  const cup = createTournament({ seasonId: 's1', autoSeal: false });
  const scoreOf = (e) => { const s = api.registry.sessions.get(e.sessionId); if (!s) return null; try { const o = s.room.observe(e.playerId); return o && o.season && o.season.outcome ? Number((o.iris && o.iris.silk) || 0) : null; } catch { return null; } };
  let root = null, box = null, msg = '', exhibition = null, adding = false, n = 0;

  function badge(e) {
    const b = el('span', 'badge' + (e.kind === 'agent' ? ' agent' : ''), e.kind === 'agent' ? '🤖 ' + tx('cup.badge.agent') : tx('cup.badge.player'));
    if (e.kind === 'agent') b.title = e.driver === 'llm' ? tx('cup.badge.llm', { model: e.model }) : tx('cup.badge.scripted');
    b.tabIndex = 0; return b;
  }
  function list(view) {
    if (!view.entrants.length) return el('p', 'note', tx('cup.empty'));
    const ol = el('ol');
    const ranked = new Map(view.leaderboard.map((r) => [r.name, r.rank]));
    const rows = view.entrants.slice().sort((p, q) => (ranked.get(p.name) || 99) - (ranked.get(q.name) || 99));
    for (const e of rows) {
      const li = el('li'); li.dataset.kind = e.kind;
      li.append(el('span', 'rk', ranked.has(e.name) ? String(ranked.get(e.name)) : '–'), el('span', null, e.name), badge(e), el('span', 'sc', e.score == null ? '…' : String(e.score)));
      ol.append(li);
    }
    return ol;
  }
  function addForm() {
    const f = el('form');
    const name = el('input'); name.maxLength = 20; name.value = 'Scribe-' + (7 + n); name.setAttribute('aria-label', tx('cup.add.name'));
    const pol = el('select'); pol.setAttribute('aria-label', tx('cup.add.policy'));
    for (const k of Object.keys(POLICIES)) { const o = el('option', null, tx('cup.policy.' + k)); o.value = k; pol.append(o); }
    const go = button(tx('cup.add.go'), () => addAgent(name.value, pol.value || 'explorer'), 'primary');
    const no = button(tx('cup.add.cancel'), () => { adding = false; render(); });
    f.addEventListener('submit', (e) => { e.preventDefault(); addAgent(name.value, pol.value || 'explorer'); });
    f.append(el('b', null, tx('cup.add.title')), name, pol, el('p', 'note', tx('cup.add.local')), go, no);
    return f;
  }
  async function addAgent(name, policy) {
    const c = api.createSession({ rules: 'v3', timeScale: 1000, worldRules: 'proximity', name: 'cup agent', label: 'cup' });
    if (c.status !== 201) { msg = tx('cup.err.failed'); render(); return; }
    const s = c.body;
    const r = cup.enter({ sessionId: 'page', playerId: s.playerId, realSession: s.sessionId }, { season_id: 's1', name: String(name).trim(), driver: 'scripted', model: null }, `cup-add-${++n}-${Date.now()}`);
    if (!r.body.ok) { msg = tx('cup.err.' + (['bad_name', 'already_entered', 'entry_limit'].includes(r.body.error.code) ? r.body.error.code : 'failed')); render(); return; }
    // the entry is keyed to the page (four per page); its season is the new session's
    sessions.set(r.body.result.entrant.id, s);
    adding = false; msg = tx('cup.add.playing', { name }); emit('tournament.agent_entered', { season: 's1', kind: 'agent', account: null });
    render();
    try { const out = await playScripted(api, s, POLICIES[policy] || POLICIES.explorer); msg = tx('cup.add.done', { name, score: out.silk ?? 0 }); }
    catch { msg = tx('cup.err.failed'); }
    render();
  }
  const sessions = new Map(); // entrant id -> its session
  const pageScore = (e) => { const s = sessions.get(e.id); return s ? scoreOf({ sessionId: s.sessionId, playerId: s.playerId }) : null; };

  function render() {
    if (!box) return;
    const view = exhibition || cup.view(pageScore);
    const head = el('div', 'head'); head.append(el('h2', null, exhibition ? tx('cup.exhibition.title') : tx('cup.title')), el('span', 'chip', tx('cup.status.' + view.season.status)), reshowButton({ doc, id: 'tip.tournament', show: showTip }));
    const left = el('div'); left.append(list(view));
    if (exhibition) left.append(el('p', 'note', tx('cup.exhibition.note')));
    const side = el('div', 'side');
    const enter = button(tx('cup.enter'), () => { close(); if (onEnterChain) onEnterChain(); }, 'primary'); enter.disabled = !onEnterChain;
    side.append(enter, el('p', 'note', tx('cup.enterNote')));
    if (adding) side.append(addForm());
    else side.append(button(tx('cup.add'), () => { adding = true; exhibition = null; render(); }));
    side.append(button(tx('cup.exhibition'), runEx), el('p', 'note', tx('cup.api')));
    const cols = el('div', 'cols'); cols.append(left, side);
    const state = el('p', 'state', msg); state.setAttribute('aria-live', 'polite');
    const x = button(tx('quest.close') === 'quest.close' ? 'Close' : tx('quest.close'), close);
    box.replaceChildren(head, cols, state, x);
  }
  async function runEx() {
    msg = tx('cup.exhibition.running'); adding = false; render();
    for (const b of box.querySelectorAll('button')) b.disabled = true;
    try { exhibition = await runExhibition({ seed }); msg = ''; } catch { msg = tx('cup.err.failed'); }
    render();
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  function open() {
    close();
    root = el('div', 'cup-wrap'); box = el('div', 'cup'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', tx('cup.title'));
    root.append(box); root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
    doc.body.append(root); if (doc.addEventListener) doc.addEventListener('keydown', onKey, true);
    exhibition = null; render();
    emit('tournament.opened', { season: 's1', kind: 'human', account: null });
  }
  try { const w = doc.defaultView || globalThis; if (w) { w.__ftfTest = w.__ftfTest || {}; (w.__ftfTest.panels ||= {}).tournament = { open, close, tip: 'tip.tournament', selector: '.cup' }; } } catch { /* */ } // the panels tip test (7.8)
  function close() { if (!root) return; root.remove(); root = null; box = null; if (doc.removeEventListener) doc.removeEventListener('keydown', onKey, true); }
  return { open, close, addAgent, runExhibition: runEx, get isOpen() { return !!root; } };
}

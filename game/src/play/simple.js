// Simple mode (Task Q, docs/accessibility.md): the third interface level next to Novice and Pro.
// Iris pre-reads every sign and proposes exactly one action per trial; the player confirms it with
// one button (or one key), changes it, or skips it. Trials with nothing to decide pass on their own,
// a Pause button stops everything, and there is never a timer the player must beat. The engine rules
// do not change: every proposal is an ordinary hub call (play/hub.js), which sends the same room
// commands an agent sends. Forgetting a memory, the vote and the Heir are never decided for the player:
// Iris only recommends, and "Forget for an Heir" needs a press-and-hold.
//   proposalFor(obs, {hub}) is pure; runProposal() drives the hub; createSimpleMode() is the card.
import { renderMsg, reasonText } from './i18n.js';
import { signsByShell, signForShell } from './hub.js';
import { confidenceBand } from '../ui/world-hud/from-obs.js';
import { logogramCanvas } from './logogram.js';
import { ensureA11yHost, holdToConfirm, reducedMotion, motionEnter } from '../ui/a11y.js';

const ROMAN = ['I', 'II', 'III', 'IV'];
const roman = (n) => ROMAN[(n || 1) - 1];
const POWER = [10, 20, 40, 80];
/** Real milliseconds before an idle trial passes on its own (pacing only; Pause stops it). */
export const AUTO_PASS_MS = 1600;

/** Iris's recommendation for a decision card, from the client projection only (never hidden state). */
export function recommendFor(card, obs) {
  switch (card.kind) {
    case 'offer': {
      const k = card.offer.kind;
      const choice = { gift: 'accept', sell: 'later', loan: 'decline', pact: 'accept', escrow: 'later' }[k] || 'later';
      return { choice, why: { key: 'simple.why.offer.' + (k in { gift: 1, sell: 1, loan: 1, pact: 1, escrow: 1 } ? k : 'escrow'), args: { who: { $agentId: card.offer.from } } } };
    }
    case 'fragment': return { choice: 'give', why: { key: 'simple.why.fragment', args: {} } };
    case 'speak': return { choice: 'speak', why: { key: 'simple.why.speak', args: {} } };
    case 'key': return { choice: 'memories', why: { key: 'simple.why.key', args: {} } };
    case 'vote': {
      const acts = (obs.chronicle || []).map((c) => c.meaning && c.meaning.action);
      const gifts = acts.filter((a) => a === 'gift').length, storms = acts.filter((a) => a === 'storm').length;
      const accept = gifts >= storms;
      return { choice: accept ? 'accept' : 'reject', why: { key: accept ? 'simple.why.vote.accept' : 'simple.why.vote.reject', args: { gifts, storms } } };
    }
    case 'heir': return { choice: null, why: { key: 'simple.why.heir', args: {} } };
    default: return { choice: 'later', why: { key: 'simple.why.offer.escrow', args: {} } };
  }
}

/** The sign Iris would stake on from the island: the newest waiting sign not yet staked, with its reading. */
export function waitingSign(obs) {
  const staked = new Set(((obs.iris && obs.iris.anchors) || []).map((a) => a.shell + ':' + a.tick));
  const open = [...signsByShell(obs).values()].flat()
    .filter((p) => p.impliedAnchor && p.impliedAnchor.tick >= obs.season.tick && !staked.has(p.impliedAnchor.shell + ':' + p.impliedAnchor.tick))
    .sort((a, b) => (b.vision - a.vision) || (b.publishedAt - a.publishedAt));
  return open[0] || null;
}

/** Text args of a reading: meanings travel as nested message refs so renderMsg names them in the UI language. */
function readingArgs(p, slots) {
  const [pl, ac, pw] = slots;
  return { place: { key: 'meaning.0.' + pl, args: {} }, action: { key: 'meaning.1.' + ac, args: {} }, power: POWER[pw], band: p.reading ? confidenceBand(p.reading.slots) : 'unsure' };
}

/**
 * One proposal for the current state, or null when the season is over and answered.
 * @param {object} obs  room observation (controller)
 * @param {{hub: import('./hub.js').ShellHub}} o
 * @returns {{kind: string, title: {key, args}, why: {key, args}, primary?: string, actions: string[], sign?: object, card?: object, choice?: string|null, auto?: boolean}|null}
 */
export function proposalFor(obs, { hub }) {
  if (!obs || !hub) return null;
  const s = obs.season, iris = obs.iris || {};
  const inShell = obs.you && obs.you.zone === 'shell';
  if (hub.advancing) return { kind: 'passing', title: { key: 'simple.passing.title', args: { tick: s.tick } }, why: { key: 'simple.passing.why', args: {} }, actions: [] };
  const card = hub.card;
  if (card) {
    const rec = recommendFor(card, obs);
    const args = cardArgs(card, obs);
    if (card.kind === 'heir') return { kind: 'heir', card, title: { key: 'hub.card.heir.title', args }, why: rec.why, actions: ['keep', 'heir'], choice: null };
    if (card.kind === 'key') return { kind: 'key', card, title: { key: 'hub.card.key.title', args }, why: rec.why, primary: 'memories', actions: ['memories', 'later'], choice: 'memories' };
    return { kind: 'card', card, title: { key: 'hub.card.' + card.kind + '.title', args }, why: rec.why, primary: 'do', actions: card.kind === 'vote' ? ['do', 'choose'] : ['do', 'choose', 'later'], choice: rec.choice };
  }
  if (s.phase === 'end') return null;
  if (inShell) {
    const p = signForShell(obs, obs.you.shell);
    if (!p) return { kind: 'leave', title: { key: 'simple.noSign.title', args: { shell: roman(obs.you.shell) } }, why: { key: 'simple.noSign.why', args: {} }, primary: 'leave', actions: ['leave'] };
    hub.syncDraft();
    const target = hub.target();
    const slots = hub.draft ? hub.draft.slots : p.reading.slots.map((x) => x.meaning);
    const r = readingArgs(p, slots);
    const staked = target && (iris.anchors || []).some((a) => a.shell === target.shell && a.tick === target.tick);
    const passed = target && (target.tick < s.tick || target.tick > s.ticks);
    const canStake = target && !staked && !passed && iris.attention >= 1 && iris.silk >= 10 && s.phase === 'play';
    const args = { ...r, shell: roman(target ? target.shell : obs.you.shell), tick: target ? target.tick : s.tick };
    if (staked) return { kind: 'leave', sign: p, title: { key: 'simple.staked.title', args }, why: { key: 'simple.staked.why', args }, primary: 'leave', actions: ['leave'] };
    if (!canStake) return { kind: 'leave', sign: p, title: { key: 'simple.cannot.title', args }, why: { key: passed ? 'simple.cannot.whyPassed' : 'simple.cannot.whyPoor', args }, primary: 'leave', actions: ['leave'] };
    return { kind: 'inside', sign: p, title: { key: 'simple.inside.title', args }, why: { key: 'simple.inside.why', args }, primary: 'stake', actions: ['stake', 'leave'] };
  }
  const wait = waitingSign(obs);
  if (wait && s.phase === 'play') {
    const r = readingArgs(wait, wait.reading.slots.map((x) => x.meaning));
    const args = { ...r, shell: roman(wait.impliedAnchor.shell), tick: wait.impliedAnchor.tick };
    if (iris.attention >= 1 && iris.silk >= 10) return { kind: 'stake', sign: wait, shell: wait.impliedAnchor.shell, title: { key: 'simple.stake.title', args }, why: { key: 'simple.stake.why', args }, primary: 'stake', actions: ['stake', 'read', 'skip'] };
    return { kind: 'pass', title: { key: 'simple.pass.title', args: { tick: s.tick } }, why: { key: 'simple.pass.whyLow', args: {} }, primary: 'pass', actions: ['pass'], auto: true };
  }
  if (s.phase === 'play') return { kind: 'pass', title: { key: 'simple.pass.title', args: { tick: s.tick } }, why: { key: 'simple.pass.why', args: {} }, primary: 'pass', actions: ['pass'], auto: true };
  return null;
}

function cardArgs(c, obs) {
  const iris = obs.iris || {};
  switch (c.kind) {
    case 'offer': return { who: { $agentId: c.offer.from }, offer: { key: c.offer.key || 'offer.' + c.offer.kind, args: c.offer.args || {} }, price: c.offer.price || 0, kind: c.offer.kind };
    case 'fragment': return { prize: iris.fragment.prize.amount, tick: iris.fragment.prize.tick, deadline: obs.season.contributionDeadline };
    case 'key': return { have: c.keyVision.confidentCells, need: c.keyVision.needCells };
    case 'heir': return { outcome: obs.season.outcome };
    default: return {};
  }
}

/**
 * Carries out one action of a proposal through the hub. `fly(n)` is the client's flight (cover, enter,
 * uncover); in tests it is hub.flyTo. Returns the last command result ({ok, reason}).
 * Actions: stake (fly in, stake on Iris's reading, leave) · read (fly in only) · skip / pass (let the trial
 * pass) · leave · do (the recommended card choice) · later · memories · keep · heir.
 */
export async function runProposal(hub, proposal, action, { fly = (n) => hub.flyTo(n), onOpenMemories = null } = {}) {
  if (!proposal) return { ok: false, reason: 'no_proposal' };
  switch (action) {
    case 'stake': {
      if (proposal.kind === 'stake') {
        await fly(proposal.shell);
        if (!hub.inShell) return { ok: false, reason: 'flight_failed' };
      }
      const r = await hub.stake();
      if (!r.ok && r.reason !== 'duplicate') { await hub.leave(); return r; }
      return hub.leave();
    }
    case 'read': await fly(proposal.shell); return { ok: hub.inShell, reason: hub.inShell ? null : 'flight_failed' };
    case 'leave': return hub.leave();
    case 'skip': case 'pass': { const r = await hub.advance(); return { ok: r.reason !== 'busy', reason: r.reason }; }
    case 'do': return hub.resolve(proposal.choice);
    case 'later': return hub.resolve('later');
    case 'memories': hub.dismiss(); if (onOpenMemories) onOpenMemories(); else if (hub.onOpenMemories) hub.onOpenMemories(); return { ok: true };
    case 'keep': return hub.resolve('keep');
    case 'heir': return hub.resolve('heir');
    default: return { ok: false, reason: 'unknown_action' };
  }
}

function el(doc, tag, attrs = {}, ...kids) {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  return e;
}

/**
 * The Simple-mode card. Active only while prefs.hudMode === 'simple' (and the hub is on); otherwise it
 * renders nothing and the ordinary Novice/Pro surfaces stay as they are.
 * @param {object} o
 * @param {HTMLElement} o.root @param {object} o.ctx @param {object} o.session @param {import('./hub.js').ShellHub} o.hub
 * @param {(n:number)=>Promise<void>} [o.fly]  the client's flight (play.fly)
 * @param {object} [o.narration]  spoken proposals when narration is on
 * @param {() => void} [o.onOpenMemories]
 * @param {(reason:string)=>void} [o.onRejected]
 * @param {() => void} [o.onOpen]  called when the card first shows a decision (other panels may close)
 * @param {() => void} [o.onRecap]  opens "What is happening?" (the card carries the ? button; the floating one hides)
 * @param {(fn:Function, ms:number)=>any} [o.setTimer] @param {(h:any)=>void} [o.clearTimer]  (tests)
 */
export function createSimpleMode({ root, ctx, session, hub, fly, narration = null, onOpenMemories = null, onRejected = () => {}, onOpen = () => {}, onRecap = null, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h) }) {
  const { i18n, prefs } = ctx;
  const doc = root.ownerDocument || document;
  const host = ensureA11yHost(root);
  const t = (k, a) => renderMsg(i18n, k, a);
  let paused = false, choosing = false, busy = false, autoTimer = null, card = null, spokenKey = '', lastKind = '', unhold = null;
  const active = () => !!(prefs && prefs.get().hudMode === 'simple' && hub);

  function labelFor(p, action) {
    switch (action) {
      case 'stake': return p.kind === 'inside' ? t('simple.inside.do') : t('simple.stake.do');
      case 'read': return t('simple.stake.read');
      case 'skip': return t('simple.skip');
      case 'pass': return t('simple.pass.do');
      case 'leave': return p.kind === 'inside' ? t('simple.inside.leave') : t('simple.leave.do');
      case 'do': return t('simple.card.do', { choice: t('hub.choice.' + p.card.kind + '.' + p.choice, cardArgs(p.card, session.obs)) });
      case 'choose': return t('simple.card.choose');
      case 'later': return t('hub.choice.' + p.card.kind + '.later', cardArgs(p.card, session.obs));
      case 'memories': return t('hub.choice.key.memories');
      case 'keep': return t('hub.choice.heir.keep');
      case 'heir': return t('simple.heir.forget');
      default: return action;
    }
  }

  async function act(p, action) {
    if (busy) return;
    if (action === 'choose') { choosing = true; render(); return; }
    busy = true; render();
    try {
      const r = await runProposal(hub, p, action, { fly: fly || ((n) => hub.flyTo(n)), onOpenMemories });
      if (r && !r.ok && r.reason && r.reason !== 'busy') onRejected(r.reason);
    } finally { busy = false; choosing = false; render(); }
  }

  function scheduleAuto(p) {
    if (autoTimer) { clearTimer(autoTimer); autoTimer = null; }
    if (!p || !p.auto || paused || busy || hub.busy || hub.advancing) return;
    autoTimer = setTimer(() => { autoTimer = null; const q = proposalFor(session.obs, { hub }); if (q && q.auto && !paused && !busy && !hub.busy && !hub.advancing && active()) act(q, 'pass'); }, AUTO_PASS_MS);
  }

  function speakProposal(p) {
    if (!narration || !narration.enabled() || !p) return;
    const key = p.kind + ':' + JSON.stringify(p.title) + ':' + session.obs.version;
    if (key === spokenKey) return;
    spokenKey = key;
    narration.speak(t(p.title.key, p.title.args) + '. ' + t(p.why.key, p.why.args), { channel: 'line', interrupt: true });
  }

  function render() {
    const obs = session.obs;
    const on = active() && !!obs;
    doc.body.classList.toggle('ftf-simple-on', on && !choosing);
    doc.body.classList.toggle('ftf-simple-choosing', on && choosing);
    if (unhold) { unhold(); unhold = null; }
    if (!on) { if (card) { card.remove(); card = null; } if (autoTimer) { clearTimer(autoTimer); autoTimer = null; } return; }
    const p = proposalFor(obs, { hub });
    if (!p || choosing) { if (card) { card.remove(); card = null; } return; }
    if (p.kind !== lastKind) { lastKind = p.kind; if (p.kind === 'card' || p.kind === 'heir' || p.kind === 'key') onOpen(); }
    const disabled = busy || !!hub.busy;
    const pauseBtn = el(doc, 'button', { type: 'button', class: 'a11y-pause', 'aria-pressed': String(paused), 'data-simple': 'pause', onclick: () => { paused = !paused; if (paused && hub.advancing) hub.stop(); render(); } },
      el(doc, 'kbd', { text: 'P' }), paused ? t('simple.resume') : t('simple.pause'));
    const recapBtn = onRecap ? el(doc, 'button', { type: 'button', class: 'a11y-recap-inline', 'data-simple': 'recap', 'aria-label': t('recap.button'), 'aria-haspopup': 'dialog', onclick: () => onRecap() }, '?') : null;
    const box = el(doc, 'section', { class: 'a11y-box a11y-simple', role: 'region', 'aria-live': 'polite', 'aria-label': t('simple.eyebrow'), 'data-kind': p.kind },
      el(doc, 'div', { class: 'a11y-simple-head' },
        el(doc, 'div', { class: 'a11y-eyebrow', text: paused ? t('simple.paused') : t('simple.eyebrow') }),
        el(doc, 'div', { class: 'a11y-simple-tools' }, recapBtn, pauseBtn)),
      el(doc, 'h3', { text: t(p.title.key, p.title.args) }),
      p.sign ? el(doc, 'div', { class: 'a11y-sign' }, safeCanvas(p.sign), el(doc, 'p', { class: 'a11y-why', text: t(p.why.key, p.why.args) })) : el(doc, 'p', { class: 'a11y-why', text: t(p.why.key, p.why.args) }));
    if (p.kind === 'passing') box.append(el(doc, 'div', { class: 'a11y-row' }, el(doc, 'button', { type: 'button', class: 'a11y-primary', 'data-simple': 'stop', onclick: () => { paused = true; hub.stop(); render(); } }, t('simple.stop'))));
    else if (p.actions.length) {
      const row = el(doc, 'div', { class: 'a11y-row' });
      for (const a of p.actions) {
        const primary = a === p.primary;
        const b = el(doc, 'button', { type: 'button', class: primary ? 'a11y-primary' : null, 'data-simple': a, disabled: disabled || null, onclick: a === 'heir' ? null : () => act(p, a) },
          primary ? el(doc, 'kbd', { text: 'Enter' }) : null, labelFor(p, a));
        if (a === 'heir') { b.setAttribute('title', i18n.t('a11y.hold')); unhold = holdToConfirm(b, { onConfirm: () => act(p, 'heir'), hint: i18n.t('a11y.hold') }); }
        row.append(b);
      }
      box.append(row);
      if (p.kind === 'heir') box.append(el(doc, 'p', { class: 'a11y-why', text: i18n.t('a11y.hold') }));
    }
    const focused = card && doc.activeElement && card.contains(doc.activeElement) ? doc.activeElement.getAttribute('data-simple') : null;
    const fresh = !card || card.getAttribute('data-kind') !== p.kind;
    if (card) card.remove();
    host.append(box);
    card = box;
    if (fresh) motionEnter(box, host, { from: 'rise' }); // a new proposal rises in; a re-render of the same one stays put
    if (focused) { const again = box.querySelector(`[data-simple="${focused}"]`); if (again && again.focus) again.focus(); }
    speakProposal(p);
    scheduleAuto(p);
  }

  function safeCanvas(sign) {
    try { return logogramCanvas({ forms: sign.forms, dots: sign.dots }, 72, { background: '#0f1a1b' }); } catch { return el(doc, 'div', { class: 'a11y-sign-missing' }); }
  }

  const offs = [
    session.on('obs', render),
    hub.on('change', render),
    hub.on('advanced', render),
    prefs ? prefs.subscribe(() => { choosing = false; render(); }) : null,
    i18n.subscribe(render),
  ].filter(Boolean);
  render();

  return {
    get active() { return active(); },
    get paused() { return paused; },
    get choosing() { return choosing; },
    proposal: () => (active() ? proposalFor(session.obs, { hub }) : null),
    setPaused(v) { paused = !!v; if (paused && hub.advancing) hub.stop(); render(); },
    /** Enter with nothing focused = the primary action; P = pause/resume; Escape returns from "let me choose". */
    handleKey(code, key) {
      if (!active()) return false;
      if (code === 'KeyP') { paused = !paused; if (paused && hub.advancing) hub.stop(); render(); return true; }
      if (code === 'Escape' && choosing) { choosing = false; render(); return true; }
      if ((code === 'Enter' || code === 'NumpadEnter' || key === 'Enter') && card) {
        const ae = doc.activeElement;
        if (ae && ae.tagName === 'BUTTON' && ae !== doc.body) return false; // a focused button handles its own Enter
        const b = card.querySelector('.a11y-primary');
        if (b && !b.disabled) { b.click(); return true; }
      }
      return false;
    },
    act: (action) => act(proposalFor(session.obs, { hub }), action),
    refresh: render,
    reducedMotion: () => reducedMotion(doc),
    destroy() { offs.forEach((f) => f()); if (autoTimer) clearTimer(autoTimer); if (unhold) unhold(); if (card) card.remove(); doc.body.classList.remove('ftf-simple-on', 'ftf-simple-choosing'); },
  };
}

export { reasonText };

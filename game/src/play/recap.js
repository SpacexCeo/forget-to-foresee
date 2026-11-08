// "What is happening?" (Task Q, docs/accessibility.md): two short sentences from Iris, built from the
// current observation and the session's goal, on a button and the key `?`. Sentence one says where we
// are (trial, place, silk, what came true), sentence two what to do next, in Iris's voice and without
// key letters. Spoken through the narration when it is on. Pure part: recapFor(); the sheet is a small
// self-styled panel in the shared accessibility host (ui/a11y.css). No rule is evaluated here.
import { renderMsg } from './i18n.js';
import { ensureA11yHost, reducedMotion } from '../ui/a11y.js';

const ROMAN = ['I', 'II', 'III', 'IV'];
const roman = (n) => ROMAN[(n || 1) - 1];

/** Goal ids → the recap sentence that says what to do next (hub and walking goals, plus decision cards). */
const NEXT_BY_GOAL = {
  fly: 'recap.next.fly', stake: 'recap.next.stake', leave: 'recap.next.leave', inside: 'recap.next.inside', fly_next: 'recap.next.fly_next',
  wait: 'recap.next.wait', ash_key: 'recap.next.ash_key', vote: 'recap.next.vote', intro: 'recap.next.intro',
  reach_scroll: 'recap.next.reach_scroll', fragment: 'recap.next.fragment', forget: 'recap.next.forget', anchor: 'recap.next.anchor',
  end_tick: 'recap.next.end_tick', talk: 'recap.next.talk', ask: 'recap.next.ask', season_over: 'recap.next.season_over',
  speak_key: 'recap.next.speak_key', mend: 'recap.next.mend', offer: 'recap.next.offer', fragment_decide: 'recap.next.fragment_decide',
  anchor_next: 'recap.next.anchor_next', auction: 'recap.next.auction', next_tick: 'recap.next.next_tick',
};

/**
 * @param {object} obs  the room observation (controller)
 * @param {{goal?: object|null, hub?: {card?: object|null, advancing?: boolean}|null}} [o]
 * @returns {{where: {key: string, args: object}, next: {key: string, args: object}}}
 */
export function recapFor(obs, { goal = null, hub = null } = {}) {
  if (!obs || !obs.season) return { where: { key: 'recap.where.intro', args: {} }, next: { key: 'recap.next.intro', args: {} } };
  const s = obs.season, iris = obs.iris || {};
  const inShell = obs.you && obs.you.zone === 'shell';
  // stakes that came true: a revealed Gift at a (Shell, trial) where Iris had anchored
  const anchors = iris.anchors || [];
  const verified = (obs.chronicle || []).filter((c) => c.meaning && c.meaning.action === 'gift' && anchors.some((a) => a.shell === c.meaning.place && a.tick === c.tick)).length;
  const base = { tick: s.tick, ticks: s.ticks, silk: iris.silk ?? 0 };
  let where;
  if (s.phase === 'intro') where = { key: 'recap.where.intro', args: {} };
  else if (s.phase === 'end') where = { key: 'recap.where.end', args: { outcome: { key: 'outcome.' + (s.outcome || 'gone'), args: {} } } };
  else if (s.phase === 'vote') where = { key: 'recap.where.vote', args: base };
  else if (hub && hub.advancing) where = { key: 'recap.where.passing', args: base };
  else if (inShell) where = { key: 'recap.where.shell', args: { ...base, shell: roman(obs.you.shell) } };
  else if (verified > 0) where = { key: 'recap.where.islandVerified', args: { ...base, n: verified } };
  else where = { key: 'recap.where.island', args: base };

  let next;
  const card = hub && hub.card;
  if (card) next = { key: 'recap.next.card.' + card.kind, args: card.kind === 'offer' ? { who: { $agentId: card.offer.from } } : {} };
  else if (hub && hub.advancing) next = { key: 'recap.next.passing', args: {} };
  else if (goal) {
    const args = { ...(goal.args || {}), ...(goal.hintArgs || {}) };
    let key = NEXT_BY_GOAL[goal.id] || 'recap.next.fallback';
    if (goal.key === 'goal.anchor.any') key = 'recap.next.anchor.any';
    if (goal.id === 'season_over' && goal.hintKey === 'goal.season_over.done') key = 'recap.next.season_over.done';
    next = { key, args };
  } else next = { key: 'recap.next.fallback', args: {} };
  return { where, next };
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
 * @param {object} o
 * @param {HTMLElement} o.root   the play UI root (#ui)
 * @param {object} o.ctx         play context (i18n, prefs)
 * @param {object} o.session     PlaySession (obs, goal)
 * @param {object} [o.hub]       ShellHub (card, advancing) when the hub mode is on
 * @param {object} [o.narration] createNarration() instance; the sheet is spoken when narration is on
 * @param {() => ({key, args}|null)} [o.nextOverride]  Simple mode supplies its proposal as the "next" sentence
 * @param {() => void} [o.onOpen]  called before the sheet opens (the host closes other panels)
 */
export function createRecap({ root, ctx, session, hub = null, narration = null, nextOverride = () => null, onOpen = () => {} }) {
  const { i18n } = ctx;
  const doc = root.ownerDocument || document;
  const host = ensureA11yHost(root);
  const t = (k, a) => renderMsg(i18n, k, a);
  let open = false, opener = null, sheet = null, scrim = null;

  const button = el(doc, 'button', { class: 'a11y-recap-btn', type: 'button', 'aria-label': t('recap.button'), 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: () => toggle() }, '?');
  const live = el(doc, 'div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  host.append(button, live);

  function current() {
    const r = recapFor(session.obs, { goal: session.goal, hub });
    const ov = nextOverride();
    if (ov) r.next = ov;
    // a title supplied by Simple mode has no full stop: the recap always speaks whole sentences
    const sentence = (text) => (/[.!?。！？]$/.test(text) ? text : text + (i18n.locale === 'zh' ? '。' : '.'));
    return { where: sentence(t(r.where.key, r.where.args)), next: sentence(t(r.next.key, r.next.args)) };
  }

  function speak(force = false) {
    if (!narration) return;
    const { where, next } = current();
    if (force) narration.force(true);
    const tk = narration.speak(where + ' ' + next, { channel: 'ui', interrupt: true });
    if (force) { if (tk) tk.done.then(() => narration.force(null)); else narration.force(null); }
  }

  function render() {
    if (!open) return;
    const { where, next } = current();
    const canSpeak = !!(narration && narration.available);
    const body = el(doc, 'section', { class: 'a11y-box a11y-recap', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'a11y-recap-title' },
      el(doc, 'div', { class: 'a11y-eyebrow', text: i18n.t('agent.iris') }),
      el(doc, 'h3', { id: 'a11y-recap-title', text: t('recap.title') }),
      el(doc, 'p', { class: 'a11y-where', text: where }),
      el(doc, 'p', { class: 'a11y-next', text: next }),
      el(doc, 'div', { class: 'a11y-row' },
        canSpeak ? el(doc, 'button', { type: 'button', 'data-recap': 'read', onclick: () => speak(true) }, t('recap.read')) : null,
        el(doc, 'button', { type: 'button', class: 'a11y-primary', 'data-recap': 'close', onclick: () => close() }, el(doc, 'kbd', { text: 'Esc' }), t('recap.close'))));
    // re-render in place; keep the focus on the same button when it was inside the sheet
    const focused = sheet && doc.activeElement && sheet.contains(doc.activeElement) ? doc.activeElement.getAttribute('data-recap') : null;
    if (sheet) sheet.remove();
    host.append(body);
    sheet = body;
    if (focused) { const again = body.querySelector(`[data-recap="${focused}"]`); if (again && again.focus) again.focus(); }
    live.textContent = where + ' ' + next;
  }

  function show() {
    if (open) return;
    onOpen();
    open = true;
    opener = doc.activeElement;
    scrim = el(doc, 'div', { class: 'a11y-scrim', onclick: () => close() });
    host.append(scrim);
    render();
    button.setAttribute('aria-expanded', 'true');
    doc.body.classList.add('ftf-recap-open');
    const first = sheet.querySelector('[data-recap="close"]');
    if (first && first.focus) first.focus();
    if (narration && narration.enabled()) speak(false);
  }
  function close() {
    if (!open) return;
    open = false;
    if (sheet) { sheet.remove(); sheet = null; }
    if (scrim) { scrim.remove(); scrim = null; }
    button.setAttribute('aria-expanded', 'false');
    doc.body.classList.remove('ftf-recap-open');
    if (narration) narration.cancel();
    // focus goes back to what opened the sheet; opened by key (focus on the page body) it lands on the ? button
    const back = opener && opener !== doc.body && opener !== doc.documentElement && opener.isConnected && opener.focus ? opener : button;
    if (back.focus) back.focus();
    opener = null;
  }
  function toggle() { if (open) close(); else show(); }

  const offs = [
    session.on('obs', render),
    session.on('goal', render),
    hub ? hub.on('change', render) : null,
    i18n.subscribe(() => { button.setAttribute('aria-label', t('recap.button')); render(); }),
  ].filter(Boolean);

  return {
    el: host, button,
    open: show, close, toggle,
    isOpen: () => open,
    /** The two sentences as plain text (tests, the Simple card, narration). */
    text: current,
    recap: () => recapFor(session.obs, { goal: session.goal, hub }),
    /** `?` (any layout: key '?' or Shift+Slash) toggles, Escape closes when open. Returns true when used. */
    handleKey(code, key) {
      if (key === '?' || code === 'Slash' || code === 'F1') { toggle(); return true; }
      if (code === 'Escape' && open) { close(); return true; }
      return false;
    },
    refresh: render,
    reducedMotion: () => reducedMotion(doc),
    destroy() { close(); offs.forEach((f) => f()); button.remove(); live.remove(); },
  };
}

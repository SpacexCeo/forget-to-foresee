// The Shell hub's screen layer (play/hub.js): the Shell dock on the island (four Shells, a mark where
// a sign waits, "let time pass"), the reading card inside a Shell (the Guest's sign, Iris's reading
// per slot that the player may change, the trial it points at, Stake / Leave), the one-click
// decision cards of the autopilot (offer, fragment, the Key, the vote, the Heir), the status line
// while trials pass, and the fade that covers a flight. It reuses the world HUD tokens (.wh-root)
// so it reads as part of the same HUD. All text is localized; every decision is a hub call.
import { renderMsg, reasonText } from './i18n.js';
import { logogramCanvas } from './logogram.js';
import { openSignsByShell, signForShell } from './hub.js';

const ROMAN = ['I', 'II', 'III', 'IV'];

const CSS = `
.hub-host { position: fixed; inset: 0; pointer-events: none; z-index: 3; }
.hub-host .hub-box { position: absolute; pointer-events: auto; background: var(--wh-panel-bg, rgba(16,26,27,.92)); border: 1px solid var(--wh-frame, rgba(232,214,172,.8));
  border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.35); backdrop-filter: blur(var(--wh-panel-blur, 10px)); color: var(--wh-text, #faf7ee); }
.hub-host h3 { margin: 0; font: 400 19px/1.2 var(--wh-font, Georgia, serif); color: var(--wh-text, #faf7ee); -webkit-text-stroke: .3px currentColor; }
.hub-host p { margin: 4px 0; font: var(--wh-font-body-weight, 500) 13.5px/1.35 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-2, #e6e3d7); }
.hub-host .hub-eyebrow { font: 600 10.5px/1 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: var(--wh-gold, #e4c272); }
.hub-host .hub-muted { color: var(--wh-text-muted, #c9c6b8); font-size: 12.5px; }
.hub-host .hub-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.hub-host button { font: 600 13.5px/1.2 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text, #faf7ee); background: var(--wh-btn-bg, rgba(10,22,23,.78));
  border: 1px solid rgba(232,214,172,.45); border-radius: 7px; padding: 8px 12px; cursor: pointer; }
.hub-host button:hover { border-color: var(--wh-gold, #e4c272); }
.hub-host button:focus-visible { outline: 3px solid var(--wh-gold, #e4c272); outline-offset: 2px; }
.hub-host button[disabled] { opacity: .45; cursor: default; }
.hub-host button.hub-primary { background: var(--wh-chip-active-bg, #5b4215); border-color: var(--wh-gold, #e4c272); color: var(--wh-text-on-gold, #fffcec); }
.hub-host kbd { font: 600 11px/1 var(--wh-font-body, system-ui, sans-serif); border: 1px solid rgba(232,214,172,.6); border-radius: 4px; padding: 2px 5px; margin-right: 6px; background: var(--wh-kbd-bg, rgba(42,38,30,.92)); }
.hub-dock { right: 16px; bottom: 84px; width: 330px; padding: 12px 14px 14px; }
.hub-shells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
.hub-shells button { position: relative; text-align: center; padding: 10px 0 8px; font: 400 20px/1 var(--wh-font, Georgia, serif); }
.hub-shells button small { display: block; margin-top: 4px; font: 600 10px/1 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-muted, #c9c6b8); letter-spacing: .04em; }
.hub-shells button.hub-wait { border-color: var(--wh-gold, #e4c272); box-shadow: 0 0 14px rgba(228,194,114,.35); }
.hub-shells button.hub-wait small { color: var(--wh-gold, #e4c272); }
.hub-read { right: 16px; top: 120px; width: 360px; padding: 12px 14px 14px; max-height: calc(100vh - 220px); overflow: auto; }
.hub-sign { display: grid; grid-template-columns: 112px 1fr; gap: 12px; align-items: center; margin-top: 8px; }
.hub-sign canvas { border-radius: 50%; background: #0f1a1b; }
.hub-slots { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
.hub-slots li { display: grid; grid-template-columns: 64px 28px 1fr 28px; align-items: center; gap: 6px; }
.hub-slots li > span:first-child { font: 600 11px/1 var(--wh-font-body, system-ui, sans-serif); text-transform: uppercase; letter-spacing: .08em; color: var(--wh-text-muted, #c9c6b8); }
.hub-slots li button { padding: 2px 0 4px; text-align: center; font: 400 18px/1 var(--wh-font, Georgia, serif); }
.hub-slots .hub-mean { text-align: center; font: 400 15px/1.15 var(--wh-font, Georgia, serif); }
.hub-slots .hub-mean small { display: block; font: 500 10.5px/1.2 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text-muted, #c9c6b8); }
.hub-slots .hub-mean.hub-edited small { color: var(--wh-gold, #e4c272); }
.hub-target { margin-top: 10px; padding: 8px 10px; border-radius: 7px; background: var(--wh-anchor-bg, rgba(38,34,22,.7)); font: 400 15px/1.3 var(--wh-font, Georgia, serif); }
.hub-card { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(440px, calc(100vw - 32px)); padding: 16px 18px; border-color: var(--wh-gold, #e4c272); background: rgba(12, 20, 21, .96) !important; }
.hub-status { left: 50%; top: 120px; transform: translateX(-50%); padding: 8px 16px; font: 400 15px/1.2 var(--wh-font, Georgia, serif); display: flex; gap: 12px; align-items: center; }
.hub-status button { padding: 4px 10px; font-size: 12px; }
.hub-fade { position: fixed; inset: 0; pointer-events: none; opacity: 0; transition: opacity .45s ease; z-index: 6;
  background: radial-gradient(circle at 50% 40%, rgba(255,250,238,.95), rgba(214,226,232,.98) 55%, rgba(170,186,196,1)); display: grid; place-items: center; }
.hub-fade span { font: 400 26px/1.2 var(--wh-font, Georgia, serif); color: #2b3433; letter-spacing: .06em; }
.hub-fade.on { opacity: 1; pointer-events: auto; }
@media (max-width: 700px), (pointer: coarse) and (max-height: 900px) {
  .hub-dock { left: 8px; right: 8px; width: auto; bottom: auto; top: calc(112px + env(safe-area-inset-top, 0px)); padding: 8px 10px 10px; }
  .hub-dock p { display: none; }
  .hub-shells { margin-top: 6px; gap: 6px; } .hub-shells button { padding: 7px 0 6px; font-size: 17px; }
  .hub-read { left: 8px; right: 8px; width: auto; top: calc(112px + env(safe-area-inset-top, 0px)); bottom: auto; max-height: calc(100vh - 260px); padding: 8px 10px 10px; background: rgba(12,20,21,.96); }
  body.hub-in-shell .wh-root .wh-quest-m, body.hub-in-shell .wh-root .wh-quest--mobile, body.hub-in-shell .wh-root .wh-trial--mobile, body.hub-in-shell .wh-root .wh-tiles { visibility: hidden; }
  .hub-dock h3, .hub-read .hub-sign p.hub-muted, .hub-read > p.hub-muted:last-child { display: none; }
  .hub-sign { grid-template-columns: 76px 1fr; } .hub-sign canvas { width: 76px; height: 76px; }
  .hub-host h3 { font-size: 16px; } .hub-host p { font-size: 12px; }
  .hub-host button { padding: 6px 9px; font-size: 12.5px; }
  .hub-status { top: calc(64px + env(safe-area-inset-top, 0px)); font-size: 13px; padding: 6px 10px; }
}
@media (prefers-reduced-motion: reduce) { .hub-fade { transition: none; } }
`;

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
 * @param {{root: HTMLElement, ctx: object, hub: import('./hub.js').ShellHub, onFly: (n:number)=>void, onRejected?: (reason:string)=>void}} o
 */
export function createHubUi({ root, ctx, hub, onFly, onRejected = () => {} }) {
  const { i18n } = ctx;
  const doc = root.ownerDocument || document;
  const t = (k, a) => renderMsg(i18n, k, a);
  if (!doc.getElementById('hub-style')) doc.head.append(el(doc, 'style', { id: 'hub-style', text: CSS }));
  const host = el(doc, 'div', { class: 'wh-root hub-host' });
  const fade = el(doc, 'div', { class: 'hub-fade', 'aria-hidden': 'true' }, el(doc, 'span'));
  root.append(host);
  doc.body.append(fade);
  let notice = null, noticeTimer = 0, signKey = '';

  const shellLabel = (n) => ROMAN[n - 1];
  const btn = (attrs, ...kids) => el(doc, 'button', { type: 'button', ...attrs }, ...kids);

  function dock(obs) {
    const by = openSignsByShell(obs);
    const busy = !!hub.busy || hub.advancing;
    const canPass = obs.season.phase === 'play';
    return el(doc, 'section', { class: 'hub-box hub-dock', 'aria-label': t('hub.dock.title') },
      el(doc, 'div', { class: 'hub-eyebrow', text: t('hub.dock.eyebrow') }),
      el(doc, 'h3', { text: t('hub.dock.title') }),
      el(doc, 'p', { text: t('hub.dock.hint') }),
      el(doc, 'div', { class: 'hub-shells' }, [1, 2, 3, 4].map((n) => {
        const k = by.get(n).length;
        return btn({ class: k ? 'hub-wait' : null, 'data-shell': n, disabled: busy || null, 'aria-label': t('hub.dock.shell', { shell: shellLabel(n), count: k }), onclick: () => onFly(n) },
          shellLabel(n), el(doc, 'small', { text: k ? t('hub.dock.signs', { count: k }) : t('hub.dock.quiet') }));
      })),
      el(doc, 'div', { class: 'hub-row' },
        btn({ class: by.size && [...by.values()].some((v) => v.length) ? null : 'hub-primary', id: 'hub-pass', disabled: busy || !canPass || null, onclick: () => hub.advance() }, el(doc, 'kbd', { text: 'T' }), t('hub.dock.pass', { tick: obs.season.tick }))));
  }

  function reading(obs) {
    const p = signForShell(obs, obs.you.shell);
    const box = el(doc, 'section', { class: 'hub-box hub-read', 'aria-label': t('hub.read.title') },
      el(doc, 'div', { class: 'hub-eyebrow', text: t('hub.read.eyebrow', { shell: shellLabel(obs.you.shell) }) }));
    if (!p) {
      box.append(el(doc, 'h3', { text: t('hub.read.silent') }), el(doc, 'p', { text: t('hub.read.silentHint') }),
        el(doc, 'div', { class: 'hub-row' }, btn({ class: 'hub-primary', id: 'hub-leave', disabled: !!hub.busy || null, onclick: () => hub.leave() }, el(doc, 'kbd', { text: 'T' }), t('hub.read.leave'))));
      return box;
    }
    hub.syncDraft();
    const d = hub.draft;
    const target = hub.target();
    const staked = target && obs.iris.anchors.some((a) => a.shell === target.shell && a.tick === target.tick);
    const passed = target && (target.tick < obs.season.tick || target.tick > obs.season.ticks);
    const canStake = target && !staked && !passed && obs.iris.attention >= 1 && obs.iris.silk >= 10 && obs.season.phase === 'play';
    const actionName = i18n.t('meaning.1.' + d.slots[1]);
    box.append(...[
      el(doc, 'h3', { text: p.vision ? t('hub.read.titleVision') : t('hub.read.title') }),
      el(doc, 'div', { class: 'hub-sign' },
        logogramCanvas({ forms: p.forms, dots: p.dots }, 112, { labels: true, background: '#0f1a1b' }),
        el(doc, 'div', {},
          el(doc, 'p', { text: p.vision ? t('hub.read.vision') : t('hub.read.published', { tick: p.publishedAt }) }),
          el(doc, 'p', { class: 'hub-muted', text: t('hub.read.howto') }))),
      el(doc, 'ul', { class: 'hub-slots' }, [0, 1, 2, 3].map((k) => {
        const s = p.reading ? p.reading.slots[k] : null;
        const edited = d.edited[k] && (!s || s.meaning !== d.slots[k]);
        const sub = edited ? t('hub.read.yours') : s ? t('hub.read.iris', { confidence: Math.round(s.confidence * 100) }) : '';
        return el(doc, 'li', {},
          el(doc, 'span', { text: i18n.t('slot.' + k) }),
          btn({ 'aria-label': t('hub.read.prev', { slot: i18n.t('slot.' + k) }), onclick: () => hub.cycleSlot(k, -1) }, '‹'),
          el(doc, 'div', { class: 'hub-mean' + (edited ? ' hub-edited' : '') }, i18n.t(`meaning.${k}.${d.slots[k]}`), el(doc, 'small', { text: sub })),
          btn({ 'aria-label': t('hub.read.next', { slot: i18n.t('slot.' + k) }), onclick: () => hub.cycleSlot(k, 1) }, '›'));
      })),
      el(doc, 'div', { class: 'hub-target' }, target ? t('hub.read.target', { action: actionName, shell: shellLabel(target.shell), tick: target.tick }) : ''),
      el(doc, 'p', { class: 'hub-muted', text: t('hub.read.purse', { silk: obs.iris.silk, attention: obs.iris.attention }) }),
      staked ? el(doc, 'p', { class: 'hub-muted', text: t('hub.read.staked') }) : passed ? el(doc, 'p', { class: 'hub-muted', text: t('hub.read.passed') }) : null,
      el(doc, 'div', { class: 'hub-row' },
        btn({ class: 'hub-primary', id: 'hub-stake', disabled: !canStake || !!hub.busy || null, onclick: () => stake() }, el(doc, 'kbd', { text: 'F' }), t('hub.read.stake')),
        d.edited.some(Boolean) ? btn({ onclick: () => hub.resetDraft() }, t('hub.read.reset')) : null,
        btn({ id: 'hub-leave', disabled: !!hub.busy || null, onclick: () => hub.leave() }, el(doc, 'kbd', { text: 'T' }), t('hub.read.leave'))),
      el(doc, 'p', { class: 'hub-muted', text: t('hub.read.leaveHint') })].filter(Boolean));
    return box;
  }

  function card(c, obs) {
    const box = el(doc, 'section', { class: 'hub-box hub-card', role: 'dialog', 'aria-modal': 'false', 'aria-label': t('hub.card.' + c.kind + '.title', cardArgs(c, obs)) },
      el(doc, 'div', { class: 'hub-eyebrow', text: t('hub.card.eyebrow') }),
      el(doc, 'h3', { text: t('hub.card.' + c.kind + '.title', cardArgs(c, obs)) }),
      el(doc, 'p', { text: t('hub.card.' + c.kind + '.body', cardArgs(c, obs)) }));
    const choices = {
      offer: [['accept', true], ['decline'], ['later']],
      fragment: [['give', true], ['later']],
      speak: [['speak', true], ['later']],
      key: [['memories', true], ['later']],
      vote: [['accept', true], ['reject']],
      heir: [['heir', true], ['keep']],
    }[c.kind] || [['later']];
    box.append(el(doc, 'div', { class: 'hub-row' }, choices.map(([id, primary], i) => btn({
      class: primary ? 'hub-primary' : null, 'data-choice': id, disabled: !!hub.busy || null,
      onclick: () => choose(id),
    }, el(doc, 'kbd', { text: String(i + 1) }), t('hub.choice.' + c.kind + '.' + id, cardArgs(c, obs))))));
    return box;
  }

  function cardArgs(c, obs) {
    const iris = obs.iris;
    switch (c.kind) {
      case 'offer': return { who: { $agentId: c.offer.from }, offer: { key: c.offer.key || 'offer.' + c.offer.kind, args: c.offer.args || {} }, price: c.offer.price || 0, kind: c.offer.kind };
      case 'fragment': return { prize: iris.fragment.prize.amount, tick: iris.fragment.prize.tick, deadline: obs.season.contributionDeadline };
      case 'key': return { have: c.keyVision.confidentCells, need: c.keyVision.needCells };
      case 'heir': return { outcome: obs.season.outcome };
      default: return {};
    }
  }

  async function choose(id) {
    const c = hub.card;
    if (!c) return;
    if (c.kind === 'key' && id === 'memories') { hub.dismiss(); if (hub.onOpenMemories) hub.onOpenMemories(); return; }
    const r = await hub.resolve(id);
    if (r && !r.ok && r.reason !== 'busy') onRejected(r.reason);
    // after a decision on the island, time keeps passing unless another card is waiting
    if (r && r.ok && !hub.card && hub.obs.season.phase === 'play' && !hub.inShell && ['offer', 'fragment', 'speak'].includes(c.kind)) hub.advance();
  }

  async function stake() {
    const r = await hub.stake();
    if (r && !r.ok && r.reason !== 'busy') onRejected(r.reason);
    else if (r && r.ok && hub.lastStake) flash(t('hub.notice.staked', { shell: shellLabel(hub.lastStake.shell), tick: hub.lastStake.tick }));
  }

  function status(obs) {
    if (!hub.advancing && !notice) return null;
    const text = hub.advancing ? t('hub.status.passing', { tick: obs.season.tick }) : t(notice.key, notice.args);
    return el(doc, 'div', { class: 'hub-box hub-status', role: 'status' }, el(doc, 'span', { text }),
      hub.advancing ? btn({ onclick: () => hub.stop() }, t('hub.status.stop')) : null);
  }

  function flash(text, ms = 4200) { notice = { key: 'wh.raw', args: { text } }; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice = null; render(); }, ms); render(); }

  function render() {
    const obs = hub.obs;
    if (!obs) return;
    const kids = [];
    const c = hub.card;
    doc.body.classList.toggle('hub-in-shell', obs.you.zone === 'shell' && !c);
    if (c) kids.push(card(c, obs));
    else if (obs.you.zone === 'shell') kids.push(reading(obs));
    else if (obs.season.phase === 'play') kids.push(dock(obs));
    const st = status(obs);
    if (st) kids.push(st);
    host.replaceChildren(...kids);
  }

  const offs = [
    hub.on('change', render),
    hub.on('advanced', ({ reason }) => {
      if (reason === 'sign' && hub.notice) flash(t(hub.notice.key, hub.notice.args), 6000);
    }),
    hub.on('auto', (reason) => flash(t(reason.key, reason.args))),
    hub.session.on('obs', () => {
      // a new sign inside the current Shell resets nothing; a different sign resets the draft view
      const p = hub.currentSign();
      const k = p ? p.index + ':' + hub.shell : '';
      if (k !== signKey) signKey = k;
      render();
    }),
    i18n.subscribe(render),
  ];
  render();

  return {
    render,
    flash,
    /** Covers the screen for a flight: resolves when fully covered. */
    async cover(text) {
      fade.firstChild.textContent = text || '';
      fade.classList.add('on');
      await new Promise((r) => setTimeout(r, reducedMotion(doc) ? 0 : 480));
    },
    uncover() { fade.classList.remove('on'); },
    /** Keys in hub mode: F stakes (in a Shell) or flies to the waiting Shell, T leaves or lets time pass, 1–3 answer a card. */
    handleKey(code) {
      const obs = hub.obs;
      if (!obs) return false;
      // during a flight or a running operation F and T are swallowed, not queued (QA-002); T still stops automatic trials
      if ((hub.transit || hub.busy) && (code === 'KeyF' || code === 'KeyT')) return true;
      if (hub.card) {
        const m = /^Digit([1-3])$/.exec(code);
        if (m) { const b = host.querySelectorAll('.hub-card [data-choice]')[Number(m[1]) - 1]; if (b && !b.disabled) b.click(); return true; }
        return false;
      }
      if (code === 'KeyF') {
        if (obs.you.zone === 'shell') { stake(); return true; }
        const by = openSignsByShell(obs);
        const n = [1, 2, 3, 4].find((s) => by.get(s).length);
        if (n) { onFly(n); return true; }
        return false;
      }
      if (code === 'KeyT') {
        if (hub.advancing) { hub.stop(); return true; }
        if (obs.you.zone === 'shell') hub.leave(); else hub.advance();
        return true;
      }
      return false;
    },
    destroy() { offs.forEach((f) => f()); host.remove(); fade.remove(); },
  };
}

function reducedMotion(doc) { try { return doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }

export { reasonText };

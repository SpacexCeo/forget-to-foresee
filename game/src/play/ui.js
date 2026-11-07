// The play UI over the 3D view: one goal card, the context menu at the player's feet, panels for
// memories (the Price of Memory), signs and visions, asking the Guests, dialogue, and the season's
// end; an end-tick button and the chronicle. Status and agent subtitles come from the UI shell's
// HUD (mountHud, src/ui/index.js). Everything renders from the room's observation; every decision
// goes out as a room command through the PlaySession. All text is localized (EN/RU).
import { renderMsg, reasonText } from './i18n.js';
import { logogramCanvas } from './logogram.js';
import { i18n as uiI18n } from '../ui/index.js';

const { effectEvent, renderEvent } = uiI18n;
const CLAN_INDEX = { iris: 0, salt: 1, ash: 2, moss: 3, amber: 4, frost: 5 };
const ROMAN = ['I', 'II', 'III', 'IV'];
const TELL = { good: '+', bad: '!', key: '◆', muted: '·', tick: '—', plain: '•' };

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v; // only trusted locale strings with <kbd> markup
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}

export function createPlayUi({ root, ctx, session, hud, handlers = {} }) {
  const { i18n } = ctx;
  const t = (k, a) => renderMsg(i18n, k, a);
  const goalEl = el('section', { class: 'pl-goal', 'aria-live': 'polite', id: 'pl-goal' });
  const ctxEl = el('section', { class: 'pl-context', id: 'pl-context', hidden: true });
  const panelEl = el('section', { class: 'pl-panel', id: 'pl-panel', role: 'dialog', hidden: true });
  const chronEl = el('ol', { class: 'pl-chronicle', id: 'pl-chronicle', 'aria-label': 'Chronicle' });
  const helpEl = el('section', { class: 'pl-help', id: 'pl-help', hidden: true });
  const bar = el('nav', { class: 'pl-bar' });
  const badge = el('div', { class: 'pl-badge' });
  const info = el('div', { class: 'pl-info', role: 'status', hidden: true });
  root.append(goalEl, ctxEl, panelEl, chronEl, helpEl, bar, badge, info);

  let panel = null, panelData = null, endConfirm = 0, infoTimer = 0;
  const ask = { slot: 0, form: 0, meaning: 0 };

  /* ---------- goal ---------- */
  function renderGoal() {
    const g = session.goal;
    goalEl.replaceChildren();
    if (!g) return;
    const args = g.args || {};
    goalEl.append(
      el('div', { class: 'pl-goal-head' }, el('span', { class: 'pl-goal-label', text: t('play.goal') }), g.onboarding ? el('span', { class: 'pl-step', text: t('play.step', { n: g.step, total: g.steps }) }) : null),
      el('h2', { class: 'pl-goal-title', text: t(g.key, args) }),
      el('p', { class: 'pl-goal-hint', text: t(g.hintKey, { ...args, ...(g.hintArgs || {}) }) }),
    );
    const row = el('div', { class: 'pl-row' });
    if (g.target) row.append(el('button', { class: 'pl-btn', type: 'button', id: 'pl-go', text: t('play.goTo'), onclick: () => handlers.onGo && handlers.onGo(g.target) }));
    if (g.id === 'forget') row.append(el('button', { class: 'pl-btn pl-primary', type: 'button', text: t('memory.title'), onclick: () => open('memory') }));
    if (g.id === 'end_tick' || g.id === 'next_tick') row.append(el('button', { class: 'pl-btn pl-primary', type: 'button', text: t('endtick.button', { tick: session.obs.season.tick }), onclick: () => endTick(true) }));
    if (g.id === 'fragment') row.append(el('button', { class: 'pl-btn', type: 'button', id: 'pl-hold', text: t('goal.fragment.hold'), onclick: () => session.holdFragment() }));
    if (g.id === 'season_over' && session.obs.season.heir == null) open('end');
    if (row.childNodes.length) goalEl.append(row);
  }

  /* ---------- context menu ---------- */
  function spotTitle(spot) {
    if (!spot) return '';
    switch (spot.kind) {
      case 'camp': return t('spot.camp', { who: { $agentId: spot.clan } });
      case 'anchor': return t('spot.anchor', { shell: ROMAN[spot.shell - 1] });
      case 'shell': case 'glass': return spot.kind === 'glass' ? t('spot.glass') : t('spot.shell', { shell: ROMAN[(session.obs.you.shell || 1) - 1] });
      default: return t('spot.' + spot.kind);
    }
  }
  function renderContext() {
    const opts = session.options;
    ctxEl.hidden = !opts.length || !!panel;
    if (ctxEl.hidden) return;
    const di = session.defaultIndex;
    ctxEl.replaceChildren(el('h3', { text: spotTitle(session.spot) }), el('ol', {}, opts.slice(0, 9).map((o, i) => {
      const label = t(o.label.key, o.label.args);
      const off = o.available === false;
      return el('li', {}, el('button', {
        type: 'button', class: 'pl-opt' + (i === di ? ' pl-default' : '') + (off ? ' pl-off' : ''), 'data-opt': o.id,
        title: off ? t('opt.unavailable', { reason: reasonText(i18n, o.reason) }) : null,
        onclick: () => choose(i),
      }, el('kbd', { text: i === di ? 'E' : String(i + 1) }), el('span', { text: label }), off ? el('small', { text: ' · ' + reasonText(i18n, o.reason) }) : null));
    })));
  }

  async function choose(i) {
    const o = session.options[i];
    if (!o) return;
    if (o.panel === 'ask') { open('ask'); return; }
    const r = await session.run(o);
    if (r && !r.ok) hud.showRejection(r.reason);
  }

  /* ---------- panels ---------- */
  function open(name, data = null) { panel = name; panelData = data; renderPanel(); renderContext(); }
  function close() { panel = null; panelData = null; panelEl.hidden = true; renderContext(); }

  function panelShell(title, ...body) {
    panelEl.replaceChildren(el('header', {}, el('h2', { text: title }), el('button', { class: 'pl-btn pl-small', type: 'button', text: t('panel.close') + ' (Esc)', onclick: close })), ...body);
    panelEl.hidden = false;
  }

  function memoryText(m) { return m.text; } // the room renders memory titles in English; effects are re-rendered per locale
  function memoryEffect(m) {
    const ev = effectEvent({ kind: m.kind, about: m.about != null ? CLAN_INDEX[m.about] : null, data: { amount: m.amount, due: m.dueTick, by: m.byTick } });
    if (m.kind === 'promise') ev.args.tick = m.byTick;
    return renderEvent(ev, i18n);
  }

  function renderPanel() {
    const obs = session.obs;
    if (!panel || !obs) { panelEl.hidden = true; return; }
    if (panel === 'memory') {
      const keyOpen = obs.iris.keyVision.open;
      const list = obs.memories.length ? el('ul', { class: 'pl-list' }, obs.memories.map((m) => el('li', { class: 'pl-mem' },
        el('div', { class: 'pl-mem-head' }, el('b', { text: memoryText(m) }), el('span', { class: 'pl-muted', text: t('memory.weight', { n: m.weight }) })),
        el('p', { class: 'pl-muted', text: memoryEffect(m) }),
        el('div', { class: 'pl-row' },
          el('button', { class: 'pl-btn pl-primary', type: 'button', 'data-forget': m.id, text: t('memory.forget'), onclick: () => forget(m.id, 'vision') }),
          keyOpen && m.weight >= 3 ? el('button', { class: 'pl-btn', type: 'button', text: t('memory.forgetKey'), onclick: () => forget(m.id, 'key') }) : null)))) : el('p', { text: t('memory.empty') });
      const forgotten = obs.iris.forgotten.length ? el('div', {}, el('h3', { text: t('memory.forgotten') }), el('ul', { class: 'pl-list pl-muted' }, obs.iris.forgotten.map((f) => el('li', { text: f.text + ' — ' + f.fate })))) : null;
      panelShell(t('memory.title'), el('p', { text: t('memory.intro') }), el('p', { class: 'pl-muted', text: t('memory.attention', { n: obs.iris.attention }) }), list, forgotten);
    } else if (panel === 'vision') {
      const signs = obs.prophecies || [];
      const rules = el('div', { class: 'pl-row' }, el('span', { text: t('vision.rule') + ':' }), ['unknown', 'top', 'dots'].map((r) => el('button', {
        class: 'pl-btn pl-small' + (obs.dictionary.readingRule === r ? ' pl-primary' : ''), type: 'button', text: t('vision.rule.' + r),
        onclick: () => session.send('set_reading_rule', { rule: r }),
      })));
      const body = signs.length ? el('ul', { class: 'pl-list' }, signs.map((p) => el('li', { class: 'pl-sign' },
        logogramCanvas({ forms: p.forms, dots: p.dots }, 112, { labels: true, background: '#141a18' }),
        el('div', {},
          el('b', { text: t('vision.sign', { index: p.index }) + ' · ' }), el('span', { class: 'pl-tag', text: p.vision ? t('vision.badge.vision') : t('vision.badge.published', { tick: p.publishedAt }) }),
          p.reading ? el('p', { class: 'pl-muted', text: t('vision.reading') }) : null,
          p.reading ? el('ul', { class: 'pl-slots' }, p.reading.slots.map((s, k) => el('li', { text: t('vision.slot', { slot: i18n.t('slot.' + k), meaning: i18n.t(`meaning.${k}.${s.meaning}`), confidence: Math.round(s.confidence * 100) }) }))) : null,
          p.impliedAnchor ? el('p', { class: 'pl-strong', text: t('vision.implied', { shell: ROMAN[p.impliedAnchor.shell - 1], tick: p.impliedAnchor.tick }) }) : null)))) : el('p', { text: t('vision.none') });
      panelShell(t('vision.title'), rules, el('p', { class: 'pl-muted', text: t('vision.dictionary', { n: obs.dictionary.confidentCells }) }), body);
    } else if (panel === 'ask') {
      const cell = obs.dictionary.cells.find((c) => c.slot === ask.slot && c.form === ask.form);
      const pick = (label, key, n, names) => el('div', { class: 'pl-pick' }, el('span', { text: label }), el('div', { class: 'pl-row' }, Array.from({ length: n }, (_, i) => el('button', {
        class: 'pl-btn pl-small' + (ask[key] === i ? ' pl-primary' : ''), type: 'button', text: names(i), onclick: () => { ask[key] = i; renderPanel(); },
      }))));
      const status = cell && cell.known != null ? t('ask.known', { meaning: i18n.t(`meaning.${ask.slot}.${cell.known}`) })
        : cell && cell.excluded.length ? t('ask.excluded', { list: cell.excluded.map((m) => i18n.t(`meaning.${ask.slot}.${m}`)).join(', ') }) : '';
      panelShell(t('ask.title'), el('p', { text: t('ask.intro') }),
        pick(t('ask.slot'), 'slot', 4, (i) => i18n.t('slot.' + i)),
        pick(t('ask.form'), 'form', 4, (i) => i18n.t('form.' + i)),
        pick(t('ask.meaning'), 'meaning', 4, (i) => i18n.t(`meaning.${ask.slot}.${i}`)),
        el('p', { class: 'pl-muted', text: status }),
        el('button', { class: 'pl-btn pl-primary', type: 'button', id: 'pl-ask-send', text: t('ask.send'), onclick: sendAsk }));
    } else if (panel === 'dialogue') {
      const d = panelData;
      panelShell(t('dialogue.title', { who: { $agentId: d.clan } }), el('ul', { class: 'pl-list' }, d.lines.map((ln) => {
        const text = ln.key.startsWith('dialogue.') ? t(ln.key, { ...ln.args, who: { $agentId: d.clan } }) : renderEvent({ key: ln.key, args: ln.args }, i18n);
        const btns = ln.offerId ? el('div', { class: 'pl-row' },
          el('button', { class: 'pl-btn pl-primary', type: 'button', text: t('dialogue.accept'), onclick: () => offer('accept_offer', ln.offerId) }),
          el('button', { class: 'pl-btn', type: 'button', text: t('opt.decline'), onclick: () => offer('decline_offer', ln.offerId) })) : null;
        return el('li', {}, el('p', { text }), btns);
      })));
    } else if (panel === 'info') {
      panelShell(panelData.title, ...panelData.lines.map((x) => el('p', { text: x })), panelData.signs ? el('div', { class: 'pl-row' }, panelData.signs.map((s) => logogramCanvas(s, 96, { background: '#141a18' }))) : null);
    } else if (panel === 'end') {
      const iris = obs.iris;
      panelShell(t('end.title'),
        el('p', { class: 'pl-strong', text: t('goal.season_over', { outcome: obs.season.outcome }) }),
        el('ul', { class: 'pl-list pl-muted' }, obs.memories.map((m) => el('li', { text: '✓ ' + memoryText(m) })), iris.forgotten.map((f) => el('li', { text: '✕ ' + f.text + ' — ' + f.fate }))),
        obs.season.heir == null ? el('div', { class: 'pl-row' },
          el('button', { class: 'pl-btn pl-primary', type: 'button', text: t('end.heir'), onclick: () => session.send('set_heir', { heir: true }) }),
          el('button', { class: 'pl-btn', type: 'button', text: t('end.keep'), onclick: () => session.send('set_heir', { heir: false }) })) : el('p', { text: t('goal.season_over.done') }));
    }
  }

  async function forget(id, purpose) {
    const r = await session.send('sacrifice_memory', { memoryId: id, purpose }, { key: session.bus.key('forget' + id) });
    if (!r.ok) { hud.showRejection(r.reason); return; }
    if (purpose === 'vision') open('vision'); else close();
  }
  async function sendAsk() {
    await session.syncPosition();
    const r = await session.send('ask_guests', { ...ask });
    if (!r.ok) hud.showRejection(r.reason); else if (handlers.onAsked) handlers.onAsked(r);
    renderPanel();
  }
  async function offer(type, offerId) {
    const r = await session.run({ cmd: { type, args: { offerId } }, key: session.bus.key(type) });
    if (r && !r.ok) hud.showRejection(r.reason);
    close();
  }

  async function endTick(confirmed = false) {
    const obs = session.obs;
    if (!obs || obs.season.phase !== 'play') return;
    if (!confirmed && obs.iris.attention > 0 && Date.now() - endConfirm > 4000) { endConfirm = Date.now(); flash(t('endtick.confirm', { n: obs.iris.attention })); return; }
    endConfirm = 0;
    const r = await session.send('end_tick', {});
    if (!r.ok) hud.showRejection(r.reason);
  }

  function flash(text, ms = 3500) { info.textContent = text; info.hidden = false; clearTimeout(infoTimer); infoTimer = setTimeout(() => { info.hidden = true; }, ms); }

  /* ---------- chronicle, bar, help ---------- */
  function renderChronicle() {
    const log = (session.obs && session.obs.log) || [];
    chronEl.replaceChildren(...log.slice(0, 8).map((e) => el('li', { 'data-tone': e.tone }, el('span', { class: 'pl-glyph', text: TELL[e.tone] || '•', 'aria-hidden': 'true' }), el('span', { class: 'pl-t', text: String(e.tick) }), el('span', { text: renderEvent({ key: e.key, args: e.args }, i18n) }))));
  }
  function renderBar() {
    const obs = session.obs;
    const tick = obs ? obs.season.tick : 1;
    bar.replaceChildren(
      el('button', { class: 'pl-btn', type: 'button', text: 'M · ' + t('memory.title').split('·')[0].trim(), onclick: () => toggle('memory') }),
      el('button', { class: 'pl-btn', type: 'button', text: 'V · ' + t('vision.title'), onclick: () => toggle('vision') }),
      el('button', { class: 'pl-btn pl-primary', type: 'button', id: 'pl-endtick', text: t('endtick.button', { tick }), disabled: !obs || obs.season.phase !== 'play', onclick: () => endTick() }),
      el('button', { class: 'pl-btn', type: 'button', text: i18n.locale === 'ru' ? 'EN' : 'RU', onclick: () => i18n.setLocale(i18n.locale === 'ru' ? 'en' : 'ru') }),
      el('button', { class: 'pl-btn', type: 'button', text: t('play.help.toggle'), onclick: () => { helpEl.hidden = !helpEl.hidden; } }));
    badge.textContent = t('play.badge');
    helpEl.replaceChildren(el('h3', { text: t('play.help.title') }), ...['move', 'go', 'context', 'panels', 'camera', 'misc'].map((k) => el('p', { html: i18n.t('play.help.' + k) })), el('p', { class: 'pl-muted', text: t('play.loop') }));
  }
  const toggle = (name) => (panel === name ? close() : open(name));

  function update() { renderGoal(); renderContext(); renderChronicle(); renderBar(); if (panel && panel !== 'dialogue' && panel !== 'info') renderPanel(); }

  const offs = [
    session.on('obs', update),
    session.on('goal', renderGoal),
    session.on('spot', renderContext),
    session.on('dialogue', (d) => open('dialogue', d)),
    session.on('inspect', (r) => open('info', inspectInfo(r))),
    i18n.subscribe(() => { update(); if (panel) renderPanel(); }),
  ];

  function inspectInfo(r) {
    const d = r.details || {}, obs = session.obs;
    let line = r.description;
    if (r.target === 'scroll_table') line = t('insp.scroll', { inScroll: (d.fragments || []).filter((f) => f.status === 'scroll').length, revealed: obs.chronicle.length });
    else if (r.target.startsWith('anchor_zone:')) line = t('insp.zone', { shell: ROMAN[d.shell - 1], count: (d.yourAnchors || []).length });
    else if (r.target === 'shard_pedestal') line = t('insp.pedestal', { open: (d.auctions || []).length });
    else if (r.target.startsWith('camp:')) line = t('insp.camp', { who: { $agentId: d.clan }, fragment: d.fragment, link: d.link });
    else if (r.target === 'guest_glass') line = t('insp.glass', { count: (d.signs || []).length });
    const lines = [line];
    if (r.target === 'scroll_table') for (const c of obs.chronicle.slice(-4)) lines.push(`${c.tick}: ${i18n.t('meaning.0.' + (c.meaning.place - 1))} · ${c.meaning.action} · ${c.meaning.power} · +${c.meaning.delay}`);
    const signs = r.target === 'guest_glass' ? (d.signs || []).map((s) => ({ forms: s.forms, dots: s.dots })) : null;
    return { title: spotTitle(session.spot) || r.target, lines, signs };
  }

  /** Keyboard: returns true when the key was used by the play UI. */
  function handleKey(code) {
    if (code === 'Escape') { if (panel) { close(); return true; } if (!helpEl.hidden) { helpEl.hidden = true; return true; } return false; }
    if (code === 'KeyE') { if (session.defaultIndex >= 0 && !panel) { choose(session.defaultIndex); return true; } return false; }
    const m = /^Digit([1-9])$/.exec(code);
    if (m && !panel) { choose(Number(m[1]) - 1); return true; }
    if (code === 'KeyM') { toggle('memory'); return true; }
    if (code === 'KeyV') { toggle('vision'); return true; }
    if (code === 'KeyT') { endTick(); return true; }
    if (code === 'KeyH') { helpEl.hidden = !helpEl.hidden; return true; }
    if (code === 'KeyL') { i18n.setLocale(i18n.locale === 'ru' ? 'en' : 'ru'); return true; }
    if (code === 'KeyG') { const g = session.goal; if (g && g.target && handlers.onGo) handlers.onGo(g.target); return true; }
    return false;
  }

  update();
  return { update, open, close, flash, handleKey, get panel() { return panel; }, destroy() { offs.forEach((f) => f()); for (const e of [goalEl, ctxEl, panelEl, chronEl, helpEl, bar, badge, info]) e.remove(); } };
}

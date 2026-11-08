// World HUD package P3b (docs/ui-world-hud.md §6.7–6.9, §7.5–7.6): the interaction prompt, the
// dialogue strip with its reply options, the desktop hotkey bar, and their mobile variants (gold
// prompt pill, collapsible dialogue bar). Mount contract and keyboard rules: §9.1.
import { h, tx, applyI18n } from '../dom.js';
import { icon } from './icons.js';

let uid = 0;

/** Local art (folded into icons.js by the orchestrator later; names are prefixed wh-a-). */
const LOCAL_ICONS = {
  // Mockup end of the dialogue strip: a full-height ")" hairline, a double diamond, a stub into the reply.
  'wh-a-connector': (cls) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 46" class="${cls}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">`
    + '<path class="wh-a-connector__arc" d="M0 .6C7.4 4.6 11 13.4 11.6 21.4c.1 1 .5 1.6 1.4 1.6-.9 0-1.3.6-1.4 1.6C11 32.6 7.4 41.4 0 45.4" stroke-width="1"/>'
    + '<path d="M18.6 17.2l5.8 5.8-5.8 5.8-5.8-5.8Z" stroke-width="1.1"/>'
    + '<path d="M18.6 20.2l2.8 2.8-2.8 2.8-2.8-2.8Z" stroke-width=".8" opacity=".75"/>'
    + '<path d="M24.4 23H33" stroke-width="1"/></svg>',
  // Mobile dialogue bar: an empty speech bubble with the tail at the bottom centre.
  'wh-a-bubble': (cls) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 18" class="${cls}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">`
    + '<path d="M4 1h14a3 3 0 0 1 3 3v6.4a3 3 0 0 1-3 3h-5.2L10.6 16.6 8.4 13.4H4a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3Z"/></svg>',
};

function ensureCss() {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.querySelector('link[data-wh-css="actions"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./actions.css', import.meta.url).href;
  link.dataset.whCss = 'actions';
  document.head.appendChild(link);
}

function ic(name, cls, opts) {
  const s = h('span', { class: 'wh-icon ' + cls, attrs: { 'aria-hidden': 'true' } });
  s.innerHTML = LOCAL_ICONS[name] ? LOCAL_ICONS[name]('') : icon(name, opts);
  return s;
}

/** Keyboard letter of a KeyboardEvent, independent of the active layout (RU keyboards send "у" for E). */
function letterOf(e) {
  if (e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  return typeof e.key === 'string' && e.key.length === 1 ? e.key.toUpperCase() : '';
}

function isTyping(target) {
  if (!target || !target.tagName) return false;
  const tag = String(target.tagName).toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

/**
 * @param {HTMLElement} root  the `.wh-root` element
 * @param {{model: object, i18n: object, layout?: 'desktop'|'mobile', onAction?: Function, prefs?: object}} o
 */
export function mountActions(root, o = {}) {
  ensureCss();
  const i18n = o.i18n;
  const emit = (...a) => { if (o.onAction) o.onAction(...a); };
  const el = h('div', { class: 'wh-actions' });
  root.appendChild(el);

  const id = 'wh-actions-' + (++uid).toString(36);
  let model = o.model;
  let layout = o.layout === 'mobile' ? 'mobile' : 'desktop';
  let expanded = !!(model && model.dialogue && model.dialogue.expanded);
  let refs = {};

  const say = (el2, ref) => (ref ? tx(el2, i18n, ref.key, ref.args) : el2);
  const speakerName = () => i18n.t('agent.' + model.dialogue.speaker);

  function render() {
    el.textContent = '';
    refs = {};
    if (!model) return;
    if (layout === 'mobile') {
      if (model.prompt) el.appendChild(renderPrompt(true));
      if (model.dialogue) el.appendChild(renderMobileDialogue());
    } else {
      if (model.prompt) el.appendChild(renderPrompt(false));
      if (model.dialogue) el.appendChild(renderDialogue());
      if (model.hotbar && model.hotbar.length) el.appendChild(renderHotbar());
    }
    applyI18n(el, i18n);
    watchFit();
  }

  // ---------- desktop: keep the dialogue clear of the hotkey bar ----------
  // Long translations (RU) widen both; when they would touch, the dialogue moves up one row.
  let ro = null;
  function fitDialogue() {
    const d = el.querySelector('.wh-dialogue');
    const bar = el.querySelector('.wh-hotbar');
    if (!d || !bar || typeof d.getBoundingClientRect !== 'function') return;
    d.classList.remove('wh-dialogue--lifted');
    const a = d.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    d.classList.toggle('wh-dialogue--lifted', a.right > b.left - 8 && a.left < b.right && a.bottom > b.top && a.top < b.bottom);
  }
  function watchFit() {
    if (ro) ro.disconnect();
    ro = null;
    if (layout !== 'desktop' || typeof ResizeObserver !== 'function') return;
    ro = new ResizeObserver(() => fitDialogue());
    for (const n of el.querySelectorAll('.wh-dialogue, .wh-hotbar')) ro.observe(n);
  }

  // ---------- prompt (§6.7 / §7.5) ----------
  function renderPrompt(mobile) {
    const p = model.prompt;
    const text = say(h('span', { class: 'wh-prompt__text' }), p.text);
    const btn = h('button', {
      class: 'wh-prompt wh-interactive ' + (mobile ? 'wh-prompt--mobile' : 'wh-panel'),
      attrs: { type: 'button', 'aria-keyshortcuts': p.hotkey || null },
      i18nAttrs: { 'aria-label': 'wh.prompt.aria' },
      attrArgs: () => ({ key: p.hotkey, text: p.text ? i18n.t(p.text.key, p.text.args) : '' }),
      on: { click: () => emit('prompt') },
    },
    mobile ? null : ic('knot', 'wh-prompt__knot wh-prompt__knot--top'),
    h('span', { class: 'wh-kbd wh-kbd--lg wh-prompt__kbd', attrs: { 'aria-hidden': 'true' }, text: p.hotkey || '' }),
    text,
    mobile ? null : ic('knot', 'wh-prompt__knot wh-prompt__knot--bottom'));
    setHidden(btn, !p.visible);
    refs.prompt = btn;
    return btn;
  }

  function setHidden(node, hidden) {
    node.classList.toggle('wh-is-hidden', hidden);
    if (hidden) { node.setAttribute('aria-hidden', 'true'); node.tabIndex = -1; } else { node.removeAttribute('aria-hidden'); node.removeAttribute('tabindex'); }
  }

  // ---------- replies (shared by both layouts) ----------
  function renderReplies(cls) {
    const d = model.dialogue;
    return h('div', { class: cls }, (d.replies || []).slice(0, 3).map((r) => h('button', {
      class: 'wh-dialogue__reply wh-panel wh-interactive',
      attrs: { type: 'button', 'data-reply': r.id, 'aria-keyshortcuts': r.hotkey || null },
      i18nAttrs: { 'aria-label': 'wh.dialogue.reply' },
      attrArgs: () => ({ key: r.hotkey, text: i18n.t(r.text.key, r.text.args) }),
      on: { click: () => emit('reply', r.id) },
    },
    h('span', { class: 'wh-kbd wh-kbd--lg wh-dialogue__kbd', attrs: { 'aria-hidden': 'true' }, text: r.hotkey || '' }),
    h('span', { class: 'wh-dialogue__sep', attrs: { 'aria-hidden': 'true' } }),
    say(h('span', { class: 'wh-dialogue__reply-text' }), r.text))));
  }

  // ---------- desktop dialogue (§6.8) ----------
  function renderDialogue() {
    const d = model.dialogue;
    const speaker = h('span', { class: 'wh-dialogue__speaker' });
    tx(speaker, i18n, 'agent.' + d.speaker);
    const strip = h('div', {
      class: 'wh-dialogue__line wh-panel',
      attrs: { 'aria-live': 'polite', role: 'group' },
      i18nAttrs: { 'aria-label': 'wh.dialogue.label' },
    }, speaker,
    h('span', { class: 'wh-dialogue__sep', attrs: { 'aria-hidden': 'true' } }),
    say(h('span', { class: 'wh-dialogue__text' }), d.line),
    ic('wh-a-connector', 'wh-dialogue__connector'));
    return h('div', { class: 'wh-dialogue' }, strip, renderReplies('wh-dialogue__replies'));
  }

  // ---------- mobile dialogue bar (§7.6) ----------
  function renderMobileDialogue() {
    const d = model.dialogue;
    const moreId = `${id}-more`;
    const speaker = h('span', { class: 'wh-dialogue__speaker' });
    tx(speaker, i18n, 'wh.dialogue.speaker', () => ({ name: speakerName() }));
    const bar = h('button', {
      class: 'wh-dialogue__bar',
      attrs: { type: 'button', 'aria-controls': moreId },
      on: { click: () => setDialogueExpanded(!expanded, true) },
    },
    ic('wh-a-bubble', 'wh-dialogue__bubble'),
    speaker,
    say(h('span', { class: 'wh-dialogue__text' }), d.lineMobile || d.line),
    ic('chevron-up', 'wh-dialogue__chevron'));
    const more = h('div', { class: 'wh-dialogue__more', attrs: { id: moreId } },
      h('div', { class: 'wh-dialogue__more-inner' }, renderReplies('wh-dialogue__replies')));
    const box = h('div', {
      class: 'wh-dialogue--mobile wh-panel wh-interactive',
      attrs: { 'aria-live': 'polite', role: 'group' },
      i18nAttrs: { 'aria-label': 'wh.dialogue.label' },
    }, bar, more);
    refs.bar = bar; refs.dialogueBox = box; refs.more = more;
    syncExpanded();
    return box;
  }

  function syncExpanded() {
    if (!refs.bar) return;
    refs.bar.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    refs.bar.dataset.i18nAttrs = JSON.stringify({ title: expanded ? 'wh.dialogue.collapse' : 'wh.dialogue.expand' });
    refs.bar.setAttribute('title', i18n.t(expanded ? 'wh.dialogue.collapse' : 'wh.dialogue.expand'));
    refs.dialogueBox.classList.toggle('wh-is-expanded', expanded);
    if (expanded) refs.more.removeAttribute('inert'); else refs.more.setAttribute('inert', '');
  }

  function setDialogueExpanded(next, fromUser = false) {
    next = !!next;
    if (next === expanded) return;
    expanded = next;
    syncExpanded();
    if (fromUser) emit('dialogueToggle', expanded);
  }

  // ---------- hotkey bar (§6.9) ----------
  function renderHotbar() {
    return h('nav', { class: 'wh-hotbar wh-panel wh-interactive', i18nAttrs: { 'aria-label': 'wh.hotbar.label' } },
      model.hotbar.map((it) => h('button', {
        class: 'wh-hotbar__btn',
        attrs: { type: 'button', 'data-hotkey': it.id, 'aria-keyshortcuts': it.hotkey || null },
        on: { click: () => emit('hotkey', it.id) },
      },
      it.hotkey
        ? h('span', { class: 'wh-kbd wh-hotbar__kbd', attrs: { 'aria-hidden': 'true' }, text: it.hotkey })
        : ic('gear', 'wh-hotbar__gear'),
      h('span', { class: 'wh-hotbar__label', i18n: 'wh.hotbar.' + it.id }))));
  }

  // ---------- keyboard (§9.1): E prompt, A/S/D replies, M/I/H hotkeys; never V ----------
  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (isTyping(e.target) || (typeof document !== 'undefined' && isTyping(document.activeElement))) return;
    if (!model) return;
    const k = letterOf(e);
    if (!k || k === 'V') return;
    const p = model.prompt;
    if (p && p.visible && (p.hotkey || 'E').toUpperCase() === k) {
      if (e.repeat) return;
      e.preventDefault();
      emit('prompt');
      return;
    }
    const reply = model.dialogue && (model.dialogue.replies || []).slice(0, 3).find((r) => (r.hotkey || '').toUpperCase() === k);
    if (reply) { if (!e.repeat) { e.preventDefault(); emit('reply', reply.id); } return; }
    const hot = (model.hotbar || []).find((it) => it.hotkey && it.hotkey.toUpperCase() === k && it.id !== 'signs');
    if (hot) { if (!e.repeat) { e.preventDefault(); emit('hotkey', hot.id); } }
  }
  const win = typeof window !== 'undefined' ? window : null;
  if (win) win.addEventListener('keydown', onKey);
  if (win) win.addEventListener('resize', fitDialogue);

  render();

  return {
    el,
    setDialogueExpanded: (v) => setDialogueExpanded(v, false),
    isDialogueExpanded: () => expanded,
    update(next, nextLayout) {
      const l = nextLayout === 'mobile' ? 'mobile' : nextLayout === 'desktop' ? 'desktop' : layout;
      if (next === model && l === layout) return;
      const prev = model;
      model = next;
      if (next && next.dialogue && prev && prev.dialogue && next.dialogue.expanded !== prev.dialogue.expanded) expanded = !!next.dialogue.expanded;
      if (l !== layout) { layout = l; render(); return; }
      if (prev && next && prev.prompt === next.prompt && prev.dialogue === next.dialogue && prev.hotbar === next.hotbar) return;
      // Only the prompt's visibility changed: toggle it in place (keeps focus, plays the fade).
      if (prev && next && refs.prompt && prev.dialogue === next.dialogue && prev.hotbar === next.hotbar && next.prompt
        && prev.prompt && prev.prompt.text === next.prompt.text && prev.prompt.hotkey === next.prompt.hotkey) {
        setHidden(refs.prompt, !next.prompt.visible);
        return;
      }
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const restore = active && el.contains(active) ? selectorOf(active) : null;
      render();
      if (restore) { const n = el.querySelector(restore); if (n) n.focus(); }
    },
    destroy() {
      if (win) win.removeEventListener('keydown', onKey);
      if (win) win.removeEventListener('resize', fitDialogue);
      if (ro) ro.disconnect();
      ro = null;
      el.textContent = '';
      el.remove();
      refs = {};
    },
  };
}

/** A stable selector for re-focusing the same control after a re-render. */
function selectorOf(node) {
  const d = node.dataset || {};
  if (d.reply) return `[data-reply="${d.reply}"]`;
  if (d.hotkey) return `[data-hotkey="${d.hotkey}"]`;
  if (node.classList.contains('wh-prompt')) return '.wh-prompt';
  if (node.classList.contains('wh-dialogue__bar')) return '.wh-dialogue__bar';
  return null;
}

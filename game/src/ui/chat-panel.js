// The town chat (docs/multiplayer.md): a "N players here · Room k" chip bottom-left that opens a small collapsible
// chat. Enter opens it and focuses the line; Enter sends; Escape leaves the line. A name opens Mute / Report. Plain
// DOM, no play imports: the caller passes `t` and the presence client.
const CSS = `.ftf-chat { position: fixed; left: calc(12px + env(safe-area-inset-left, 0px)); bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 12;
  width: min(340px, calc(100vw - 24px)); font: 14px/1.4 system-ui, sans-serif; color: #f3ead6; pointer-events: none; }
.ftf-chat > * { pointer-events: auto; }
.ftf-chat-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 12px; border-radius: 16px; border: 1px solid rgba(233,180,76,.5);
  background: rgba(16,22,24,.78); color: #f3ead6; font: 600 13px system-ui, sans-serif; cursor: pointer; }
.ftf-chat-chip i { width: 8px; height: 8px; border-radius: 50%; background: #7d8a86; display: inline-block; }
.ftf-chat-chip[data-on="1"] i { background: #9fd49a; }
.ftf-chat-box { margin-bottom: 6px; border-radius: 12px; border: 1px solid rgba(233,180,76,.45); background: rgba(16,22,24,.84); padding: 8px; }
.ftf-chat-box[hidden] { display: none; }
.ftf-chat-log { max-height: 180px; overflow-y: auto; margin: 0 0 6px; padding: 0; list-style: none; }
.ftf-chat-log li { margin: 0 0 3px; overflow-wrap: anywhere; }
.ftf-chat-log button { all: unset; cursor: pointer; color: #e9b44c; font-weight: 600; }
.ftf-chat-log li.sys { color: #b9b2a2; font-size: 12px; }
.ftf-chat-row { display: flex; gap: 6px; }
.ftf-chat-row input { flex: 1; min-height: 34px; padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(233,180,76,.5); background: #1c2426; color: #f3ead6; font: 14px system-ui, sans-serif; }
.ftf-chat-row button, .ftf-chat-menu button { min-height: 34px; padding: 4px 12px; border-radius: 8px; border: 1px solid rgba(233,180,76,.6); background: rgba(233,180,76,.14); color: #f3ead6; cursor: pointer; }
.ftf-chat-menu { display: flex; gap: 6px; margin: 0 0 6px; align-items: center; flex-wrap: wrap; font-size: 13px; }
.ftf-chat-menu[hidden] { display: none; }`;

/**
 * @param {{doc?: Document, t: (k: string, a?: object) => string, presence: object, phone?: boolean}} o
 * @returns {{render(): void, destroy(): void, el: HTMLElement}}
 */
export function createChatPanel({ doc = globalThis.document, t, presence, phone = false }) {
  if (!doc.getElementById('ftf-chat-css')) { const s = doc.createElement('style'); s.id = 'ftf-chat-css'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('div', 'ftf-chat'); root.setAttribute('role', 'region'); root.setAttribute('aria-label', t('mp.chat'));
  const box = el('div', 'ftf-chat-box'); box.hidden = true;
  const log = el('ul', 'ftf-chat-log'); log.setAttribute('aria-live', 'polite');
  const menu = el('div', 'ftf-chat-menu'); menu.hidden = true;
  const form = el('form', 'ftf-chat-row');
  const input = el('input'); input.type = 'text'; input.maxLength = 140; input.placeholder = t('mp.placeholder'); input.setAttribute('aria-label', t('mp.placeholder')); input.autocomplete = 'off';
  const send = el('button', null, t('mp.send')); send.type = 'submit';
  form.append(input, send);
  box.append(log, menu, form);
  const chip = el('button', 'ftf-chat-chip'); chip.type = 'button'; chip.append(el('i'), el('span'));
  root.append(box, chip);
  doc.body.append(root);
  for (const ev of ['pointerdown', 'keydown', 'keyup', 'wheel']) root.addEventListener(ev, (e) => e.stopPropagation());

  let open = false, menuFor = null;
  const setOpen = (on) => { open = on; box.hidden = !on; chip.setAttribute('aria-expanded', String(on)); if (on) render(); };
  chip.addEventListener('click', () => { setOpen(!open); if (open && !phone) input.focus(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); presence.say(input.value); input.value = ''; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.blur(); if (phone) setOpen(false); } });
  const onKey = (e) => {
    if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey) return;
    const a = doc.activeElement; if (a && a !== doc.body && a.tagName !== 'CANVAS') return; // another field or button has the key
    if (presence.status !== 'online') return;
    e.preventDefault(); setOpen(true); input.focus();
  };
  doc.addEventListener('keydown', onKey);

  function openMenu(m) {
    menuFor = m; menu.hidden = false; menu.replaceChildren(el('span', null, m.name));
    const muted = presence.isMuted(m.name);
    const mute = el('button', null, t(muted ? 'mp.unmute' : 'mp.mute')); mute.type = 'button';
    mute.addEventListener('click', () => { if (muted) presence.unmute(m.name); else presence.mute(m.name); closeMenu(); });
    const rep = el('button', null, t('mp.report')); rep.type = 'button';
    rep.addEventListener('click', () => { presence.report(m.id); closeMenu(); });
    const x = el('button', null, '×'); x.type = 'button'; x.setAttribute('aria-label', t('mp.close')); x.addEventListener('click', closeMenu);
    menu.append(mute, rep, x);
  }
  function closeMenu() { menuFor = null; menu.hidden = true; render(); }

  let lastLen = -1, lastSys = null;
  function render() {
    const on = presence.status === 'online';
    const demo = presence.status === 'demo';
    chip.dataset.on = on || demo ? '1' : '0'; chip.dataset.n = String(on || demo ? presence.count : 0); // the HUD's compact chip: people icon + number
    chip.querySelector('span').textContent = on ? t('mp.chip', { n: presence.count, room: presence.room }) : demo ? t('mp.demo', { n: presence.count - 1 }) : presence.status === 'connecting' ? t('mp.connecting') : t('mp.offline');
    chip.title = chip.querySelector('span').textContent; chip.setAttribute('aria-label', chip.title); // the compact chip hides the line
    input.disabled = send.disabled = !on;
    if (!open) return;
    const sys = presence.sys;
    if (presence.chat.length === lastLen && sys === lastSys && log.childElementCount) return;
    lastLen = presence.chat.length; lastSys = sys;
    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
    log.replaceChildren(...presence.chat.map((m) => {
      const li = el('li');
      const who = el('button', null, m.name); who.type = 'button';
      if (!m.mine) who.addEventListener('click', () => openMenu(m)); else who.disabled = true;
      li.append(who, doc.createTextNode(': ' + m.text));
      return li;
    }));
    if (sys && ['muted', 'slow_down', 'filtered', 'reported', 'full', 'kicked'].includes(sys.key)) log.append(el('li', 'sys', t('mp.sys.' + sys.key, { s: sys.s || 0 })));
    if (!presence.chat.length && !sys) log.append(el('li', 'sys', on ? t('mp.empty') : demo ? t('mp.demoLine') : t('mp.offlineLine')));
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  render();
  return { render, el: root, destroy() { doc.removeEventListener('keydown', onKey); root.remove(); } };
}

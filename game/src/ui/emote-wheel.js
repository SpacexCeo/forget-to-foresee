// The emote wheel (owner 14.11): hold the middle mouse button and a pie of 15 emotes opens round the cursor; move
// toward one and let go to play it on the heroine (her clip `emote_<id>`, art/heroes/*_game_clips.json). Letting go in
// the centre (or Escape) plays nothing. Pure DOM; boot-world.js decides when it may open and what a pick does.

export const EMOTES = Object.freeze(['wave', 'greet', 'bow', 'agree', 'clap', 'cheer', 'laugh', 'laugh_b', 'angry', 'complain', 'cry', 'hug', 'heart', 'dance', 'arms']);
export const EMOTE_ICONS = Object.freeze({ wave: '👋', greet: '🙌', bow: '🙇', agree: '👍', clap: '👏', cheer: '🎉', laugh: '😂', laugh_b: '🤣', angry: '😠',
  complain: '😤', cry: '😢', hug: '🤗', heart: '💖', dance: '💃', arms: '🙅' });
const R_IN = 46, R_OUT = 168; // px: the dead centre and the ring

/** The slice under a pointer offset (dx, dy) from the centre (pure): index into EMOTES, or -1 in the centre. */
export function sliceAt(dx, dy, n = EMOTES.length) {
  if (Math.hypot(dx, dy) < R_IN) return -1;
  const a = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI); // 0 at the top, clockwise
  return Math.floor((a / (2 * Math.PI)) * n + 0.5) % n;
}

/**
 * @param {{doc?: Document, t: (key: string) => string, canOpen?: () => boolean, onPick: (id: string) => void, target?: EventTarget}} o
 */
export function createEmoteWheel({ doc = document, t, canOpen = () => true, onPick, target = doc }) {
  const root = doc.createElement('div'); root.className = 'emote-wheel'; root.hidden = true;
  const st = doc.createElement('style');
  st.textContent = `.emote-wheel{position:fixed;left:0;top:0;width:${R_OUT * 2 + 120}px;height:${R_OUT * 2 + 120}px;transform:translate(-50%,-50%);z-index:60;pointer-events:none;font:600 12px/1.15 system-ui,sans-serif;color:#f4efe6}
.emote-wheel .ew-ring{position:absolute;inset:60px;border-radius:50%;background:radial-gradient(circle,rgba(12,14,18,.15) 0 ${R_IN}px,rgba(12,14,18,.62) ${R_IN + 1}px)}
.emote-wheel .ew-item{position:absolute;width:76px;margin:-30px 0 0 -38px;text-align:center;opacity:.78;transition:transform .08s,opacity .08s}
.emote-wheel .ew-item b{display:block;font-size:24px;line-height:30px}
.emote-wheel .ew-item.on{opacity:1;transform:scale(1.22)}
.emote-wheel .ew-name{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:13px;text-align:center;width:${R_IN * 2}px}`;
  doc.head.append(st);
  const ring = doc.createElement('div'); ring.className = 'ew-ring'; root.append(ring);
  const name = doc.createElement('div'); name.className = 'ew-name'; root.append(name);
  const C = R_OUT + 60, items = EMOTES.map((id, i) => {
    const el = doc.createElement('div'); el.className = 'ew-item';
    const a = (i / EMOTES.length) * 2 * Math.PI, r = (R_IN + R_OUT) / 2 + 16;
    el.style.left = C + Math.sin(a) * r + 'px'; el.style.top = C - Math.cos(a) * r + 'px';
    el.innerHTML = `<b>${EMOTE_ICONS[id]}</b><span></span>`; el.querySelector('span').textContent = t('emote.' + id);
    root.append(el); return el;
  });
  doc.body.append(root);
  let open = false, cx = 0, cy = 0, sel = -1;
  const show = (x, y) => { open = true; cx = x; cy = y; sel = -1; root.style.left = x + 'px'; root.style.top = y + 'px'; root.hidden = false; mark(-1); };
  const mark = (i) => { sel = i; items.forEach((el, k) => el.classList.toggle('on', k === i)); name.textContent = i >= 0 ? t('emote.' + EMOTES[i]) : ''; };
  const close = (pick) => { if (!open) return; open = false; root.hidden = true; if (pick && sel >= 0) onPick(EMOTES[sel]); };
  const down = (e) => { if (e.button !== 1 || !canOpen()) return; e.preventDefault(); show(e.clientX, e.clientY); };
  const move = (e) => { if (open) mark(sliceAt(e.clientX - cx, e.clientY - cy)); };
  const up = (e) => { if (open && e.button === 1) { e.preventDefault(); close(true); } };
  const key = (e) => { if (open && e.key === 'Escape') close(false); };
  const noAuto = (e) => { if (e.button === 1) e.preventDefault(); }; // no browser autoscroll on the middle button
  target.addEventListener('pointerdown', down); target.addEventListener('pointermove', move); target.addEventListener('pointerup', up);
  target.addEventListener('mousedown', noAuto); doc.addEventListener('keydown', key);
  return {
    get open() { return open; },
    dispose() { target.removeEventListener('pointerdown', down); target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('mousedown', noAuto); doc.removeEventListener('keydown', key); root.remove(); st.remove(); },
  };
}

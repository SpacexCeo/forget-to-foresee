// Day 1 (docs/day1-free-mint-plan.md): the arrival overlay in the town. "Welcome · Day 1", the name, a burst, two
// face-down "Free mint" cards; the picked one flips into Elise and the real mint runs (play/day1-mint.js) with honest
// states; "Claim to inventory" flies the card to the Profile button. Then the hints, in order, and the two 10-second
// story trailers (in-engine camera moves with subtitles, skippable). DOM only; the camera moves are callbacks.
import { cue } from '../audio/town-audio.js';

const CSS = `
.d1 { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; font: 16px/1.45 system-ui, sans-serif; color: #fff7e6; pointer-events: none; }
.d1 > * { pointer-events: auto; }
.d1-title { text-align: center; text-shadow: 0 2px 18px rgba(0,0,0,.6); animation: d1-in .9s ease both; }
.d1-title h1 { margin: 0; font: 600 clamp(36px, 7vw, 72px)/1 Georgia, serif; letter-spacing: .04em; }
.d1-title p { margin: 6px 0 0; font: 600 clamp(16px, 2.6vw, 24px)/1 system-ui, sans-serif; letter-spacing: .4em; text-indent: .4em; color: #ffd27a; }
.d1-panel { background: linear-gradient(160deg, rgba(40, 28, 70, .92), rgba(16, 40, 60, .92)); border: 2px solid rgba(255, 210, 122, .8); border-radius: 22px; padding: 22px 24px; width: min(440px, calc(100% - 32px)); box-shadow: 0 12px 50px rgba(0,0,0,.5), inset 0 0 30px rgba(255, 210, 122, .15); text-align: center; animation: d1-pop .35s cubic-bezier(.2, 1.4, .4, 1) both; }
.d1-panel h2 { margin: 0 0 12px; font: 700 22px/1.2 system-ui, sans-serif; }
.d1-panel input { width: 100%; box-sizing: border-box; min-height: 48px; border-radius: 14px; border: 2px solid rgba(255,255,255,.35); background: rgba(0,0,0,.35); color: #fff; font: 600 20px system-ui, sans-serif; text-align: center; padding: 6px 12px; }
.d1-btn { margin-top: 14px; min-height: 48px; min-width: 160px; padding: 8px 22px; border-radius: 24px; border: 0; cursor: pointer; font: 800 17px system-ui, sans-serif; color: #2a1600; background: linear-gradient(180deg, #ffe08a, #ffb238); box-shadow: 0 4px 0 #b86d00, 0 8px 24px rgba(255, 178, 56, .45); }
.d1-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 #b86d00; }
.d1-btn.d1-ghost { background: rgba(255,255,255,.14); color: #fff; box-shadow: none; }
.d1-btn:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
.d1-burst { position: fixed; inset: 0; background: radial-gradient(circle at 50% 50%, rgba(255, 244, 200, .95), rgba(255, 190, 90, .35) 30%, transparent 62%); animation: d1-burst 1.1s ease-out both; pointer-events: none; }
.d1-cards { display: flex; gap: clamp(14px, 4vw, 40px); justify-content: center; perspective: 900px; }
.d1-card { width: clamp(130px, 28vw, 200px); aspect-ratio: 2 / 3; position: relative; transform-style: preserve-3d; transition: transform .8s cubic-bezier(.3, 1.3, .5, 1); cursor: pointer; border: 0; padding: 0; background: none; }
.d1-card.is-flipped { transform: rotateY(180deg) scale(1.08); cursor: default; }
.d1-card .d1-face { position: absolute; inset: 0; border-radius: 18px; backface-visibility: hidden; display: grid; place-items: center; overflow: hidden; }
.d1-card .d1-back { background: conic-gradient(from 0deg, #7a5cff, #3ad6ff, #ffd27a, #ff7ad9, #7a5cff); box-shadow: 0 0 30px rgba(122, 92, 255, .6); animation: d1-holo 4s linear infinite; }
.d1-card .d1-back b { font: 900 64px/1 Georgia, serif; color: #fff; text-shadow: 0 0 16px rgba(255,255,255,.9); }
.d1-card .d1-front { transform: rotateY(180deg); background: #e9e4f2; box-shadow: 0 0 34px rgba(255, 210, 122, .55); }
.d1-card .d1-front img { width: 100%; height: 100%; object-fit: cover; display: block; }
.d1-free { margin-top: 8px; font: 800 14px/1 system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #ffe08a; }
.d1-status { min-height: 1.5em; margin: 12px 0 0; font-weight: 700; }
.d1-status.is-busy { background: linear-gradient(90deg, #fff7e6 30%, #ffd27a 50%, #fff7e6 70%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: d1-shimmer 1.4s linear infinite; }
.d1-status a { color: #ffe08a; }
.d1-note { font-size: 12px; color: rgba(255,247,230,.75); margin: 10px 0 0; }
.d1-hint { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); width: min(520px, calc(100% - 32px)); box-sizing: border-box; padding: 14px 16px; border-radius: 18px; background: linear-gradient(160deg, rgba(40, 28, 70, .94), rgba(16, 40, 60, .94)); border: 2px solid rgba(255, 210, 122, .7); color: #fff7e6; font: 15px/1.45 system-ui, sans-serif; z-index: 70; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; animation: d1-pop .3s ease both; }
.d1-hint p { margin: 0; flex: 1 1 240px; }
.d1-hint .d1-btn { margin: 0; min-height: 40px; min-width: 0; font-size: 14px; }
.d1-trailer { position: fixed; inset: 0; z-index: 85; display: grid; align-items: end; justify-items: center; padding-bottom: 12vh; background: linear-gradient(transparent 60%, rgba(0,0,0,.55)); }
.d1-trailer p { margin: 0; max-width: min(720px, 90vw); text-align: center; font: italic 400 clamp(18px, 2.6vw, 28px)/1.35 Georgia, serif; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.8); animation: d1-in .6s ease both; }
.d1-trailer button { position: fixed; right: 18px; bottom: 18px; }
@keyframes d1-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes d1-pop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: none; } }
@keyframes d1-burst { 0% { opacity: 0; transform: scale(.2); } 30% { opacity: 1; } 100% { opacity: 0; transform: scale(1.6); } }
@keyframes d1-holo { to { filter: hue-rotate(360deg); } }
@keyframes d1-shimmer { to { background-position: -200% 0; } }
html[data-motion="reduce"] .d1 *, html[data-motion="reduce"] .d1-hint { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) { .d1 *, .d1-hint { animation: none !important; transition: none !important; } }
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ensureStyle(doc) { if (!doc.getElementById('d1-style')) { const s = doc.createElement('style'); s.id = 'd1-style'; s.textContent = CSS; doc.head.append(s); } }
function el(doc, tag, cls, text) { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(doc, text, fn, ghost = false) { const b = el(doc, 'button', 'd1-btn' + (ghost ? ' d1-ghost' : ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; }

/**
 * The arrival: title, name, burst, the two cards, the mint, the claim. Resolves when the card is claimed.
 * @param {{doc?: Document, t: Function, mint: object, flyIn?: (ms: number) => void, reduced?: () => boolean, inventoryEl?: () => Element|null, nickname?: string}} o
 */
let chimed = false;
export async function runArrival({ doc = document, t, mint, flyIn = null, reduced = () => false, inventoryEl = () => null, nickname = '' }) {
  ensureStyle(doc);
  const root = el(doc, 'div', 'd1'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('day1.welcome'));
  root.addEventListener('pointerdown', (e) => e.stopPropagation()); root.addEventListener('keydown', (e) => e.stopPropagation());
  doc.body.append(root);
  const fast = reduced();
  // 1. the camera settles on the heroine; the title card
  if (flyIn) flyIn(fast ? 0 : 3200);
  const title = el(doc, 'div', 'd1-title'); title.append(el(doc, 'h1', null, t('day1.welcome')), el(doc, 'p', null, t('day1.day')));
  root.replaceChildren(title);
  await sleep(fast ? 600 : 3000);
  // 2. the name
  const name = await new Promise((resolve) => {
    const p = el(doc, 'form', 'd1-panel');
    const input = el(doc, 'input'); input.maxLength = 24; input.placeholder = t('day1.name.ph'); input.value = nickname; input.setAttribute('aria-label', t('day1.name.q'));
    const ok = el(doc, 'button', 'd1-btn', t('day1.name.ok')); ok.type = 'submit';
    p.append(el(doc, 'h2', null, t('day1.name.q')), input, ok);
    p.addEventListener('submit', (e) => { e.preventDefault(); resolve(input.value.trim() || 'Guest'); });
    root.replaceChildren(p); input.focus();
  });
  // 3. the burst
  const burst = el(doc, 'div', 'd1-burst'); doc.body.append(burst); setTimeout(() => burst.remove(), 1200);
  const gift = el(doc, 'div', 'd1-title'); gift.append(el(doc, 'h1', null, t('day1.gift')));
  gift.querySelector('h1').style.fontSize = 'clamp(26px, 4.5vw, 44px)';
  root.replaceChildren(gift);
  await sleep(fast ? 400 : 1600);
  // 4. two face-down cards; the picked one flips into Elise, the mint starts
  const card = await new Promise((resolve) => {
    const wrap = el(doc, 'div'); wrap.style.textAlign = 'center';
    const cards = el(doc, 'div', 'd1-cards');
    for (let i = 0; i < 2; i++) {
      const c = el(doc, 'button', 'd1-card'); c.type = 'button'; c.setAttribute('aria-label', t('day1.free') + ' ' + (i + 1));
      const back = el(doc, 'div', 'd1-face d1-back'); back.append(el(doc, 'b', null, '?'));
      const front = el(doc, 'div', 'd1-face d1-front');
      const img = el(doc, 'img'); img.src = 'assets/cards/elise.webp'; img.alt = t('day1.elise');
      front.append(img);
      c.append(back, front);
      const holder = el(doc, 'div'); holder.append(c, el(doc, 'div', 'd1-free', t('day1.free')));
      c.addEventListener('click', () => { if (wrap.dataset.picked) return; wrap.dataset.picked = '1'; c.classList.add('is-flipped'); for (const o of cards.querySelectorAll('.d1-card')) if (o !== c) o.parentElement.style.opacity = '.25'; resolve({ c, wrap }); }, { once: true });
      cards.append(holder);
    }
    wrap.append(el(doc, 'h2', null, t('day1.pick')), cards);
    wrap.querySelector('h2').style.cssText = 'font: 700 22px system-ui; text-shadow: 0 2px 10px rgba(0,0,0,.6)';
    root.replaceChildren(wrap);
  });
  await sleep(fast ? 100 : 900);
  // 5. the mint, with honest states, and the claim
  const panel = el(doc, 'div', 'd1-panel');
  const status = el(doc, 'p', 'd1-status');
  const claim = btn(doc, t('day1.claim'), () => {});
  panel.append(el(doc, 'h2', null, t('day1.elise') + ' · ' + t('day1.elise.sub')), status, claim, el(doc, 'p', 'd1-note', t('day1.local')));
  card.wrap.append(panel);
  const paint = () => {
    const ph = mint.phase;
    status.classList.toggle('is-busy', ['keygen', 'sending', 'checking'].includes(ph));
    status.replaceChildren();
    if (ph === 'minted') {
      status.append(doc.createTextNode(t('day1.mint.minted') + ' '));
      if (!chimed) { chimed = true; cue('gift_chime'); } // sound and a pulse when the mint is confirmed on-chain
      const l = mint.links; if (l) { const a = el(doc, 'a', null, t('day1.mint.view')); a.href = l.token; a.target = '_blank'; a.rel = 'noopener noreferrer'; status.append(a); }
    } else if (ph === 'failed') {
      const r = el(doc, 'button', 'd1-btn d1-ghost', t('day1.mint.failed')); r.type = 'button'; r.addEventListener('click', () => mint.retry()); status.append(r);
    } else if (ph === 'unavailable') status.textContent = t('day1.mint.unavailable');
    else status.textContent = t('day1.mint.' + (ph === 'idle' ? 'keygen' : ph));
  };
  const off = mint.subscribe(paint); paint();
  mint.mint(name);
  await new Promise((resolve) => claim.addEventListener('click', resolve, { once: true }));
  off();
  // the card flies into the inventory
  const target = inventoryEl();
  if (target && !fast && card.c.animate) {
    const a = card.c.getBoundingClientRect(), b = target.getBoundingClientRect();
    await card.c.animate([{ transform: 'rotateY(180deg) scale(1.08)' }, { transform: `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) rotateY(180deg) scale(.15)`, opacity: 0.2 }], { duration: 700, easing: 'cubic-bezier(.5, 0, .7, 1)', fill: 'forwards' }).finished.catch(() => {});
  }
  mint.setRecord({ claimed: true, nickname: name });
  root.remove();
  return { name };
}

/**
 * One hint at a time at the bottom; each has a Next button and optional extra buttons. Resolves after the last.
 * @param {{doc?: Document, t: Function, steps: Array<{key: string, buttons?: Array<{key: string, fn: Function}>, when?: () => boolean}>}} o
 */
export async function runHints({ doc = document, t, steps }) {
  ensureStyle(doc);
  for (const s of steps) {
    if (s.when && !s.when()) continue;
    await new Promise((resolve) => {
      const box = el(doc, 'div', 'd1-hint'); box.setAttribute('role', 'status');
      box.addEventListener('pointerdown', (e) => e.stopPropagation());
      box.append(el(doc, 'p', null, t(s.key)));
      for (const b of s.buttons || []) box.append(btn(doc, t(b.key), async () => { box.remove(); await b.fn(); resolve(); }));
      box.append(btn(doc, t('day1.hint.next'), () => { box.remove(); resolve(); }, !!(s.buttons && s.buttons.length)));
      doc.body.append(box);
    });
  }
}

/**
 * A 10-second story: three subtitle lines over an in-engine camera move (`camera(progress 0..1)`), skippable.
 * @param {{doc?: Document, t: Function, keys: string[], camera?: (p: number) => void, seconds?: number}} o
 */
export function playTrailer({ doc = document, t, keys, camera = null, seconds = 10 }) {
  ensureStyle(doc);
  return new Promise((resolve) => {
    const root = el(doc, 'div', 'd1-trailer'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', t(keys[0]));
    const line = el(doc, 'p'); root.append(line);
    let done = false, raf = 0;
    const end = () => { if (done) return; done = true; cancelAnimationFrame(raf); root.remove(); doc.removeEventListener('keydown', onKey, true); resolve(); };
    const skip = btn(doc, t('day1.trailer.skip'), end, true); root.append(skip);
    const onKey = (e) => { if (e.key === 'Escape' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); end(); } };
    doc.addEventListener('keydown', onKey, true);
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    doc.body.append(root);
    const t0 = performance.now();
    let shown = -1;
    const tick = () => {
      if (done) return;
      const p = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      const k = Math.min(keys.length - 1, Math.floor(p * keys.length));
      if (k !== shown) { shown = k; line.textContent = t(keys[k]); line.style.animation = 'none'; void line.offsetWidth; line.style.animation = ''; }
      if (camera) try { camera(p); } catch { /* the camera is optional */ }
      if (p >= 1) { end(); return; }
      raf = requestAnimationFrame(tick);
    };
    tick();
  });
}

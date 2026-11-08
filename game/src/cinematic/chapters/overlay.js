// Screen layer of a chapter film: letterbox bars, the chapter title card, one narrator line per shot as
// a subtitle (always on, readable size), the final "What matters now" card, the hold-to-skip ring and the
// progress dots. Every opacity is set from the film clock each frame (no CSS transitions), so the frames
// are the same under the capture clock, under reduced motion and on a slow software renderer. Typography
// follows the trailer's overlay (src/cinematic/overlay.js): Cormorant Garamond titles, Source Sans 3
// body, the world HUD gold. All text arrives rendered: no i18n here.
import { envelope } from '../ease.js';

const CSS = `
#ch-film { position: fixed; inset: 0; z-index: 40; pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none;
  font-family: 'Cormorant Garamond', 'Libre Caslon Text', 'Noto Serif SC', 'Songti SC', Georgia, serif; color: #efe9df; }
#ch-film[hidden] { display: none; }
#ch-film * { box-sizing: border-box; }
#ch-film .ch-bar { position: absolute; left: 0; right: 0; background: #050708; height: 0; }
#ch-film .ch-bar.top { top: 0; } #ch-film .ch-bar.bottom { bottom: 0; }
#ch-film .ch-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 50%, rgba(5,8,9,.5) 100%); opacity: .8; }
#ch-film .ch-black { position: absolute; inset: 0; background: #06090a; opacity: 0; }
#ch-film .ch-card { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; opacity: 0; padding: 6vh 8vw; }
#ch-film .ch-eyebrow { font: 600 clamp(11px, 1.05vw, 20px)/1 'Source Sans 3', 'Noto Sans SC', 'Segoe UI', system-ui, sans-serif; letter-spacing: .32em; text-transform: uppercase; color: #e4c272; margin-bottom: 2.2vh; }
#ch-film .ch-title { font-weight: 300; font-size: clamp(30px, 4.6vw, 92px); line-height: 1.12; letter-spacing: .22em; text-transform: uppercase; text-shadow: 0 2px 28px rgba(0,0,0,.6); margin: 0; }
#ch-film .ch-rule { display: flex; align-items: center; justify-content: center; gap: 14px; margin: 3vh auto 0; width: min(42vw, 560px); }
#ch-film .ch-rule span { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(228,194,114,0), rgba(228,194,114,.9), rgba(228,194,114,0)); }
#ch-film .ch-rule i { width: 7px; height: 7px; border-radius: 50%; background: #e4c272; box-shadow: 0 0 14px 3px rgba(228,194,114,.55); }
#ch-film .ch-matters { font-weight: 400; font-size: clamp(22px, 2.5vw, 48px); line-height: 1.3; max-width: min(84vw, 980px); margin: 0; text-shadow: 0 2px 24px rgba(0,0,0,.7); }
#ch-film .ch-sub { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--ch-bar, 0px) + 3.2vh); width: min(86vw, 1040px); text-align: center; opacity: 0;
  font: 500 clamp(17px, 1.55vw, 27px)/1.4 'Source Sans 3', 'Noto Sans SC', 'Segoe UI', system-ui, sans-serif; color: #f6f1e6; text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 18px rgba(0,0,0,.8); }
#ch-film .ch-sub span { display: inline; background: rgba(5, 8, 9, .62); padding: .18em .55em; border-radius: 6px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
#ch-film .ch-dots { position: absolute; left: 50%; transform: translateX(-50%); top: calc(var(--ch-bar, 0px) + 2vh); display: flex; gap: 8px; opacity: .9; }
#ch-film .ch-dots i { width: 7px; height: 7px; border-radius: 50%; border: 1px solid rgba(228,194,114,.7); background: transparent; }
#ch-film .ch-dots i.on { background: #e4c272; box-shadow: 0 0 10px rgba(228,194,114,.6); }
#ch-film .ch-skip { position: absolute; right: calc(16px + env(safe-area-inset-right, 0px)); top: calc(var(--ch-bar, 0px) + 14px); display: flex; align-items: center; gap: 10px; opacity: 0;
  font: 600 clamp(12px, 1vw, 16px)/1 'Source Sans 3', 'Noto Sans SC', 'Segoe UI', system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #e6dfd3; text-shadow: 0 1px 2px rgba(0,0,0,.9); }
#ch-film .ch-ring { width: 30px; height: 30px; border-radius: 50%; background: conic-gradient(#e4c272 calc(var(--ch-hold, 0) * 1turn), rgba(228,194,114,.18) 0); display: grid; place-items: center; }
#ch-film .ch-ring::after { content: ''; width: 20px; height: 20px; border-radius: 50%; background: rgba(5,8,9,.85); }
#ch-film .ch-hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--ch-bar, 0px) + 1vh); opacity: 0;
  font: 600 clamp(11px, .95vw, 15px)/1 'Source Sans 3', 'Noto Sans SC', 'Segoe UI', system-ui, sans-serif; letter-spacing: .18em; text-transform: uppercase; color: #c9c6b8; text-shadow: 0 1px 2px rgba(0,0,0,.9); }
body.ch-film-on #ui, body.ch-film-on #prompt, body.ch-film-on #toast, body.ch-film-on #badge, body.ch-film-on #scene-controls, body.ch-film-on #hud, body.ch-film-on .hub-fade, body.ch-film-on .ch-fab { visibility: hidden !important; }
body.ch-film-on, body.ch-film-on * { cursor: none !important; }
@media (max-width: 700px) { #ch-film .ch-title { letter-spacing: .14em; } #ch-film .ch-matters { font-size: clamp(19px, 5.2vw, 30px); } #ch-film .ch-sub { font-size: clamp(16px, 4.2vw, 20px); width: 92vw; } }
`;

function h(doc, tag, cls, text) { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

/** The letterbox height as a fraction of the viewport (0 in portrait: the bars become subtitle bands). */
export function letterboxFraction(width, height, ratio = 2.2) {
  if (!width || !height) return 0;
  if (width < height) return 0.085; // portrait phones: fixed bands top and bottom
  return Math.max(0, Math.min(0.2, (1 - (width / height) / ratio) / 2));
}

/**
 * @param {Document} doc
 * @param {{reducedMotion?: () => boolean}} [o]
 */
export function createFilmOverlay(doc = document, { reducedMotion = () => false } = {}) {
  if (!doc.getElementById('ch-film-style')) { const s = h(doc, 'style'); s.id = 'ch-film-style'; s.textContent = CSS; doc.head.appendChild(s); }
  const root = h(doc, 'div'); root.id = 'ch-film'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-live', 'polite');
  const barTop = h(doc, 'div', 'ch-bar top'), barBottom = h(doc, 'div', 'ch-bar bottom');
  const vignette = h(doc, 'div', 'ch-vignette');
  const black = h(doc, 'div', 'ch-black');
  const title = h(doc, 'div', 'ch-card');
  const titleInner = h(doc, 'div');
  const eyebrow = h(doc, 'div', 'ch-eyebrow'), titleText = h(doc, 'h1', 'ch-title');
  const rule = h(doc, 'div', 'ch-rule'); rule.append(h(doc, 'span'), h(doc, 'i'), h(doc, 'span'));
  titleInner.append(eyebrow, titleText, rule); title.append(titleInner);
  const card = h(doc, 'div', 'ch-card');
  const cardInner = h(doc, 'div');
  const cardEyebrow = h(doc, 'div', 'ch-eyebrow'), cardText = h(doc, 'p', 'ch-matters');
  cardInner.append(cardEyebrow, cardText); card.append(cardInner);
  const sub = h(doc, 'div', 'ch-sub'); const subSpan = h(doc, 'span'); sub.append(subSpan);
  const dots = h(doc, 'div', 'ch-dots');
  const skip = h(doc, 'div', 'ch-skip'); const ring = h(doc, 'div', 'ch-ring'); const skipText = h(doc, 'span'); skip.append(ring, skipText);
  const hint = h(doc, 'div', 'ch-hint');
  root.append(vignette, barTop, barBottom, title, card, sub, dots, skip, hint, black);
  doc.body.appendChild(root);

  let dotEls = [];
  let hintUntil = -1, skipUntil = -1;

  function layout() {
    const win = doc.defaultView || globalThis;
    const f = letterboxFraction(win.innerWidth, win.innerHeight);
    const px = Math.round(f * (win.innerHeight || 0));
    barTop.style.height = barBottom.style.height = px + 'px';
    root.style.setProperty('--ch-bar', px + 'px');
  }

  const api = {
    root,
    /** Shows the layer for a film: title texts, the card text, one dot per shot. */
    show({ eyebrowText, titleText: tt, cardEyebrow: ce, cardText: ct, shots }) {
      eyebrow.textContent = eyebrowText; titleText.textContent = tt;
      cardEyebrow.textContent = ce; cardText.textContent = ct;
      dots.replaceChildren(); dotEls = [];
      for (let i = 0; i < shots; i++) { const d = h(doc, 'i'); dots.append(d); dotEls.push(d); }
      subSpan.textContent = ''; sub.style.opacity = '0'; title.style.opacity = '0'; card.style.opacity = '0'; black.style.opacity = '0';
      skip.style.opacity = '0'; hint.style.opacity = '0'; root.style.setProperty('--ch-hold', '0');
      hintUntil = -1; skipUntil = -1;
      layout();
      root.hidden = false;
      doc.body.classList.add('ch-film-on');
    },
    hide() { root.hidden = true; doc.body.classList.remove('ch-film-on'); },
    setSubtitle(text) { subSpan.textContent = text || ''; },
    setSkipText(text) { skipText.textContent = text; },
    setHintText(text) { hint.textContent = text; },
    /** Keeps the skip ring visible for a moment (a key was touched). */
    showSkip(t, seconds = 1.6) { skipUntil = t + seconds; },
    showHint(t, seconds = 1.8) { hintUntil = t + seconds; },
    layout,
    /**
     * Applies the film clock. `tl` = {t, titleEnd, shotIndex, shotStart, shotEnd, cardStart, end, hold}.
     * Fades are time-based envelopes; reduced motion shortens them to a few frames.
     */
    update(tl) {
      const fade = reducedMotion() ? 0.12 : 0.6;
      const { t } = tl;
      title.style.opacity = envelope(t, 0.1, tl.titleEnd, fade, fade).toFixed(3);
      const subOn = tl.shotIndex >= 0 && t >= tl.shotStart + (tl.shotIndex === 0 ? tl.titleEnd * 0.55 : 0.15) && t < tl.cardStart;
      sub.style.opacity = subOn ? envelope(t, tl.shotIndex === 0 ? tl.titleEnd * 0.55 : tl.shotStart + 0.15, Math.min(tl.shotEnd, tl.cardStart), fade * 0.6, fade * 0.5).toFixed(3) : '0';
      card.style.opacity = envelope(t, tl.cardStart, tl.end + 1, fade, 0.01).toFixed(3);
      black.style.opacity = envelope(t, tl.end - 0.35, tl.end + 5, 0.35, 0.01).toFixed(3);
      dotEls.forEach((d, i) => d.classList.toggle('on', i <= tl.shotIndex));
      root.style.setProperty('--ch-hold', String(Math.min(1, Math.max(0, tl.hold || 0))));
      skip.style.opacity = tl.hold > 0 || t < skipUntil ? '1' : '0';
      hint.style.opacity = t < hintUntil ? '1' : '0';
    },
    destroy() { root.remove(); doc.body.classList.remove('ch-film-on'); },
  };
  const win = doc.defaultView || globalThis;
  if (win.addEventListener) win.addEventListener('resize', layout);
  return api;
}

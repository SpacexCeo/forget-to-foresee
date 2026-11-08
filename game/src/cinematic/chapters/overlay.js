// Screen layer of a chapter film: letterbox bars, the chapter title card, one narrator line per shot as
// a subtitle (always on, readable size), the final "What matters now" card, the hold-to-skip ring and the
// progress dots. Every opacity is set from the film clock each frame (no CSS transitions), so the frames
// are the same under the capture clock, under reduced motion and on a slow software renderer. Typography
// follows the trailer's overlay (src/cinematic/overlay.js): Cormorant Garamond titles, Source Sans 3
// body, the world HUD gold. All text arrives rendered: no i18n here.
import { MOTION, ease, staggerDelay } from '../../ui/motion/index.js';

/**
 * Motion of one overlay element on the film clock (seconds): visible from `from` to `to`, entering over `enter`
 * ms with a rise and the expo-out ease, leaving over `exit` ms with the ease-in; `delay` staggers siblings.
 * Tokens from the motion design system (src/ui/motion, docs/motion.md). Reduced motion: fades of
 * MOTION.duration.reduced, no rise. Pure; returns {opacity, y} (y in px, downward).
 */
export function filmMotion(t, from, to, { reduced = false, enter = MOTION.duration.base, exit = MOTION.duration.fast, rise = MOTION.distance.rise, delay = 0 } = {}) {
  const s = from + delay / 1000;
  if (!(t >= s) || t >= to) return { opacity: 0, y: reduced ? 0 : rise };
  const ein = (reduced ? MOTION.duration.reduced : enter) / 1000, eout = (reduced ? MOTION.duration.reduced : exit) / 1000;
  const a = ein > 0 ? Math.min(1, (t - s) / ein) : 1;
  const b = eout > 0 ? Math.min(1, (to - t) / eout) : 1;
  const inE = ease.out(a), outE = 1 - ease.in(1 - b);
  return { opacity: Math.min(inE, outE), y: reduced ? 0 : (1 - inE) * rise };
}

const CSS = `
#ch-film { position: fixed; inset: 0; z-index: 40; pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none;
  font-family: 'Cormorant Garamond', 'Libre Caslon Text', 'Noto Serif SC', 'Songti SC', Georgia, serif; color: #efe9df; }
#ch-film[hidden] { display: none; }
#ch-film * { box-sizing: border-box; }
#ch-film .ch-bar { position: absolute; left: 0; right: 0; background: #050708; height: 0; }
#ch-film .ch-bar.top { top: 0; } #ch-film .ch-bar.bottom { bottom: 0; }
#ch-film .ch-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 50%, rgba(5,8,9,.5) 100%); opacity: .8; }
#ch-film .ch-black { position: absolute; inset: 0; background: #06090a; opacity: 0; }
#ch-film .ch-card { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 6vh 8vw; }
#ch-film .ch-card > div > * { opacity: 0; will-change: transform, opacity; }
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
#ch-film .ch-dots i { width: 7px; height: 7px; border-radius: 50%; border: 1px solid rgba(228,194,114,.7); background: transparent; transition: background-color var(--mo-fast, 120ms) var(--mo-ease-out, ease-out), box-shadow var(--mo-fast, 120ms) var(--mo-ease-out, ease-out), transform var(--mo-slow, 320ms) var(--mo-ease-out, ease-out); }
#ch-film .ch-dots i.now { transform: scale(var(--mo-pop, 1.04)); }
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
      subSpan.textContent = ''; sub.style.opacity = '0'; black.style.opacity = '0';
      for (const el of [eyebrow, titleText, rule, cardEyebrow, cardText]) el.style.opacity = '0';
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
     * Every element's opacity and rise come from filmMotion (the motion tokens) at the film time.
     */
    update(tl) {
      const reduced = reducedMotion();
      const { t } = tl;
      const D = MOTION.duration;
      const put = (el, m) => { el.style.opacity = m.opacity.toFixed(3); el.style.transform = m.y ? `translate3d(0, ${m.y.toFixed(2)}px, 0)` : 'none'; };
      // chapter title: eyebrow, title and rule rise in a stagger over a screen duration, leave together
      [eyebrow, titleText, rule].forEach((el, i) => put(el, filmMotion(t, 0.1, tl.titleEnd, { reduced, enter: D.screen, exit: D.slow, delay: staggerDelay(i) })));
      // the narrator line: in with the shot (after the title on the first), out just before the next shot or the card
      const subFrom = tl.shotIndex === 0 ? tl.titleEnd * 0.55 : tl.shotStart + 0.15;
      const subTo = Math.min(tl.shotEnd, tl.cardStart);
      put(sub, tl.shotIndex >= 0 ? filmMotion(t, subFrom, subTo, { reduced, enter: D.base, exit: D.fast }) : { opacity: 0, y: 0 });
      // the final card: eyebrow then sentence, held until the fade to black
      [cardEyebrow, cardText].forEach((el, i) => put(el, filmMotion(t, tl.cardStart, tl.end + 1, { reduced, enter: D.screen, exit: D.fast, delay: staggerDelay(i) })));
      // the fade to black at the end
      black.style.opacity = filmMotion(t, tl.end - D.screen / 1000, tl.end + 5, { reduced, enter: D.screen, exit: 0, rise: 0 }).opacity.toFixed(3);
      dotEls.forEach((d, i) => { d.classList.toggle('on', i <= tl.shotIndex); d.classList.toggle('now', i === tl.shotIndex); });
      root.style.setProperty('--ch-hold', String(Math.min(1, Math.max(0, tl.hold || 0))));
      // the skip ring while a key is held (or just released); the "hold to skip" hint after a short press
      put(skip, tl.hold > 0 || t < skipUntil ? filmMotion(t, -1e9, 1e9, { reduced, rise: MOTION.distance.nudge }) : { opacity: 0, y: 0 });
      put(hint, filmMotion(t, hintUntil - 1.8, hintUntil, { reduced, enter: D.fast, exit: D.fast, rise: MOTION.distance.nudge }));
    },
    destroy() { root.remove(); doc.body.classList.remove('ch-film-on'); },
  };
  const win = doc.defaultView || globalThis;
  if (win.addEventListener) win.addEventListener('resize', layout);
  return api;
}

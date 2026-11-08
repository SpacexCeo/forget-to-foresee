// Screen overlays for the shots: fades, letterbox bars, a vignette, title and end cards in the game's
// typography (the lobby's Cormorant Garamond title with the world HUD's Libre Caslon / Source Sans as
// the bundled fallbacks). Every element's opacity is set from the shot clock each frame, never from a
// CSS transition, so a card fades in over exactly the frames the script says. Spoken captions are not
// drawn here: they come from the subtitle file the capture tool burns in (tools/capture/subtitles.mjs),
// so the same frames serve the clean and the captioned versions.
import { envelope } from './ease.js';

const CSS = `
#cine { position: fixed; inset: 0; pointer-events: none; z-index: 50; font-family: 'Cormorant Garamond', 'Libre Caslon Text', Georgia, serif; color: #efe9df; }
#cine * { box-sizing: border-box; }
.cine-black { position: absolute; inset: 0; background: #06090a; opacity: 0; }
.cine-bar { position: absolute; left: 0; right: 0; background: #000; height: 0; }
.cine-bar.top { top: 0; } .cine-bar.bottom { bottom: 0; }
.cine-vignette { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 48%, rgba(5,8,9,.55) 100%); }
.cine-card { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; opacity: 0; padding: 6vh 8vw; }
.cine-card.left { place-items: center start; text-align: left; padding-left: 10vw; }
.cine-card.low { align-content: end; padding-bottom: 12vh; }
.cine-eyebrow { font: 600 clamp(10px, 1.05vw, 20px)/1 'Source Sans 3', 'Segoe UI', system-ui, sans-serif; letter-spacing: .32em; text-transform: uppercase; color: #e4c272; margin-bottom: 2.2vh; }
.cine-title { font-weight: 300; font-size: clamp(28px, 4.6vw, 92px); line-height: 1.12; letter-spacing: .3em; text-transform: uppercase; text-shadow: 0 2px 28px rgba(0,0,0,.55); margin: 0; }
.cine-title b { display: block; font-weight: 300; font-size: .62em; letter-spacing: .44em; color: #c9c6b8; margin-top: .3em; }
.cine-rule { display: flex; align-items: center; justify-content: center; gap: 14px; margin: 3vh auto 0; width: min(42vw, 560px); }
.cine-card.left .cine-rule { margin-left: 0; justify-content: flex-start; }
.cine-rule span { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(228,194,114,0), rgba(228,194,114,.9), rgba(228,194,114,0)); }
.cine-rule i { width: 7px; height: 7px; border-radius: 50%; background: #e4c272; box-shadow: 0 0 14px 3px rgba(228,194,114,.55); }
.cine-sub { font: 400 clamp(12px, 1.25vw, 24px)/1.5 'Source Sans 3', 'Segoe UI', system-ui, sans-serif; letter-spacing: .3em; text-transform: uppercase; color: #e6dfd3; margin-top: 2.2vh; }
.cine-lines { font: 400 clamp(12px, 1.15vw, 22px)/1.9 'Source Sans 3', 'Segoe UI', system-ui, sans-serif; letter-spacing: .08em; color: #c9c6b8; margin-top: 3.5vh; }
.cine-lines b { color: #efe9df; font-weight: 500; }
.cine-lines .gold { color: #e4c272; }
.cine-word { position: absolute; left: 0; right: 0; text-align: center; opacity: 0; font-weight: 400; font-size: clamp(22px, 2.6vw, 54px); letter-spacing: .26em; text-transform: uppercase; text-shadow: 0 2px 22px rgba(0,0,0,.6); }
.cine-word.low { bottom: 14vh; } .cine-word.high { top: 12vh; }
body.cine-clean #ui, body.cine-clean #prompt, body.cine-clean #toast, body.cine-clean #badge, body.cine-clean #scene-controls, body.cine-clean #hud, body.cine-clean .hub-fade { visibility: hidden !important; }
body.cine-nohub .hub-host, body.cine-nohub #prompt, body.cine-nohub #toast { visibility: hidden !important; }
body.cine-nodev #badge, body.cine-nodev #hud { visibility: hidden !important; }
body.cine-on, body.cine-on * { cursor: none !important; }
body.cine-on .wh-root, body.cine-on .hub-host, body.cine-on .pl-panel, body.cine-on .pl-context { transition: none !important; }
`;

function h(doc, tag, cls, html) { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Builds the overlay layer. items: the shot's `overlays` list (see docs/submission/trailer.md). */
export function createOverlay(doc = document) {
  if (!doc.getElementById('cine-style')) { const s = h(doc, 'style', null, CSS); s.id = 'cine-style'; doc.head.appendChild(s); }
  const root = h(doc, 'div'); root.id = 'cine';
  const black = h(doc, 'div', 'cine-black');
  const barTop = h(doc, 'div', 'cine-bar top'), barBottom = h(doc, 'div', 'cine-bar bottom');
  const vignette = h(doc, 'div', 'cine-vignette');
  root.append(vignette, barTop, barBottom, black);
  doc.body.appendChild(root);
  doc.body.classList.add('cine-on');
  let items = [];
  let nodes = [];

  function build(item) {
    switch (item.kind) {
      case 'title': {
        const card = h(doc, 'div', 'cine-card' + (item.align === 'left' ? ' left' : '') + (item.low ? ' low' : ''));
        const inner = h(doc, 'div');
        if (item.eyebrow) inner.append(h(doc, 'div', 'cine-eyebrow', esc(item.eyebrow)));
        const title = h(doc, 'h1', 'cine-title', esc(item.text) + (item.text2 ? '<b>' + esc(item.text2) + '</b>' : ''));
        inner.append(title);
        if (item.rule !== false) inner.append(h(doc, 'div', 'cine-rule', '<span></span><i></i><span></span>'));
        if (item.sub) inner.append(h(doc, 'div', 'cine-sub', esc(item.sub)));
        if (item.lines) inner.append(h(doc, 'div', 'cine-lines', item.lines.map((l) => (l.startsWith('*') ? '<b>' + esc(l.slice(1)) + '</b>' : l.startsWith('@') ? '<span class="gold">' + esc(l.slice(1)) + '</span>' : esc(l))).join('<br>')));
        card.append(inner);
        return card;
      }
      case 'word': return h(doc, 'div', 'cine-word ' + (item.position || 'low'), esc(item.text));
      default: return null;
    }
  }

  return {
    root,
    /** Replaces the overlay items for the current shot. */
    set(list = []) {
      for (const n of nodes) n.el && n.el.remove();
      items = list;
      nodes = items.map((item) => ({ item, el: build(item) }));
      for (const n of nodes) if (n.el) root.insertBefore(n.el, black);
      const lb = items.find((i) => i.kind === 'letterbox');
      const ratio = lb ? lb.ratio : 0;
      const bar = ratio ? Math.max(0, (1 - (window.innerWidth / window.innerHeight) / ratio) / 2) * 100 : 0;
      barTop.style.height = barBottom.style.height = bar.toFixed(3) + 'vh';
      const vg = items.find((i) => i.kind === 'vignette');
      vignette.style.opacity = vg ? String(vg.amount ?? 0.6) : '0';
    },
    /** Applies the shot time (seconds) to every timed element. */
    update(t) {
      let dark = 0;
      for (const { item, el } of nodes) {
        if (item.kind === 'black') { dark = Math.max(dark, envelope(t, item.from, item.to, item.fadeIn ?? 0.8, item.fadeOut ?? 0.8) * (item.amount ?? 1)); continue; }
        if (!el) continue;
        el.style.opacity = envelope(t, item.from, item.to, item.fadeIn ?? 0.7, item.fadeOut ?? 0.7).toFixed(4);
        if (item.rise) { const u = Math.min(1, Math.max(0, (t - item.from) / Math.max(0.01, item.to - item.from))); el.style.transform = `translateY(${((1 - u) * item.rise).toFixed(2)}px)`; }
      }
      black.style.opacity = dark.toFixed(4);
    },
    destroy() { root.remove(); doc.body.classList.remove('cine-on', 'cine-clean', 'cine-nohub', 'cine-nodev'); },
  };
}

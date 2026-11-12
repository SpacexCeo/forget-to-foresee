// A collapse handle on the inside-Shell reading panel (owner 12.11: "let me fold it to look around inside the Shell").
// The panel (play/hub-ui.js .hub-read) gets a chevron at its top right; a tap, or a swipe down on it, folds it to its
// header and its main buttons (Stake / Leave); a tap or a swipe up unfolds it. The fold is kept while the player stays
// inside that Shell and forgotten when the panel goes away. Expanded by default; desktop has the same small button.

const CSS = `
.pc-toggle { position: absolute; top: 6px; right: 6px; z-index: 3; width: 36px; height: 36px; border-radius: 50%; padding: 0; border: 1px solid rgba(201, 163, 90, .6);
  background: rgba(12, 20, 17, .92); color: #f3d7a0; font: 700 16px/1 system-ui, sans-serif; cursor: pointer; transition: transform .2s; }
.pc-toggle:focus-visible { outline: 2px solid #f3d7a0; outline-offset: 2px; }
@media (pointer: coarse) { .pc-toggle { width: 40px; height: 40px; } }
.hub-read.pc-min { max-height: none !important; overflow: visible !important; }
.hub-read.pc-min > *:not(.hub-head):not(.hub-row):not(.pc-toggle) { display: none !important; }
.hub-read.pc-min .hub-guide { display: none !important; }
.hub-read.pc-min .pc-toggle { transform: rotate(180deg); }
`;

export function createPanelCollapse({ doc = document, t = (k) => k } = {}) {
  if (!(doc.getElementById && doc.getElementById('pc-style'))) { const st = doc.createElement('style'); st.id = 'pc-style'; st.textContent = CSS; doc.head.append(st); }
  let min = false, key = '', swipe = null;
  const set = (panel, on) => {
    min = on; panel.classList.toggle('pc-min', on);
    const b = panel.querySelector('.pc-toggle');
    if (b) { b.setAttribute('aria-expanded', String(!on)); b.setAttribute('aria-label', t(on ? 'hud.panel.expand' : 'hud.panel.collapse')); b.title = b.getAttribute('aria-label'); }
  };
  return {
    /** Per frame (cheap: one query). */
    update() {
      const panel = doc.querySelector && doc.querySelector('.hub-read');
      if (!panel || panel.hidden) { if (key) { key = ''; min = false; } return; }
      const head = panel.querySelector('.hub-eyebrow'); const k = head ? head.textContent : 'shell';
      if (k !== key) { key = k; min = false; }
      if (!panel.querySelector('.pc-toggle')) {
        const b = doc.createElement('button'); b.type = 'button'; b.className = 'pc-toggle'; b.textContent = '▾';
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', (e) => { e.stopPropagation(); set(panel, !min); });
        panel.append(b);
        if (!panel.dataset.pcSwipe) {
          panel.dataset.pcSwipe = '1';
          panel.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') swipe = { id: e.pointerId, y: e.clientY }; });
          panel.addEventListener('pointerup', (e) => {
            if (!swipe || swipe.id !== e.pointerId) return;
            const dy = e.clientY - swipe.y; swipe = null;
            if (dy > 50 && !min) set(panel, true); else if (dy < -50 && min) set(panel, false);
          });
          panel.addEventListener('pointercancel', () => { swipe = null; });
        }
        set(panel, min);
      } else if (panel.classList.contains('pc-min') !== min) set(panel, min);
    },
    get collapsed() { return min; },
  };
}

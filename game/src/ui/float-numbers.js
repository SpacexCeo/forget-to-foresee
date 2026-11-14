// Floating numbers, the DOM part (flag `damageNumbers`, src/features.js): a pool of 24 elements projected from world to
// screen each frame; transform and opacity only. Fed through push({kind, amount, pos: [x, y, z] world, target?, other?}).
import { POOL, KIND, mergeOrAdd, curve, textOf, sizeOf, alive, colorOf } from './float-numbers-core.js';

const CSS = `
.fn { position: fixed; left: 0; top: 0; z-index: 6; pointer-events: none; font: 800 18px/1 system-ui, sans-serif; white-space: nowrap;
  text-shadow: -1px 0 #000, 1px 0 #000, 0 -1px #000, 0 1px #000, 0 0 6px rgba(0, 0, 0, .55); will-change: transform, opacity; opacity: 0; }
.fn.crit::after { content: ''; position: absolute; left: 50%; top: 50%; width: 1.4em; height: 1.4em; margin: -.7em 0 0 -.7em; border-radius: 50%;
  border: 2px solid rgba(246, 200, 96, .7); animation: fn-ring .35s ease-out forwards; }
@keyframes fn-ring { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.8); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fn.crit::after { animation: none; display: none; } }
`;

/**
 * @param {{camera: object, THREE: object, doc?: Document, win?: Window, reduced?: () => boolean, xpUnit?: () => string, now?: () => number}} o
 */
export function createFloatNumbers({ camera, THREE, doc = globalThis.document, win = globalThis.window, reduced = () => false, xpUnit = () => 'XP', now = () => performance.now() }) {
  if (!doc.getElementById('fn-style')) { const s = doc.createElement('style'); s.id = 'fn-style'; s.textContent = CSS; doc.head.append(s); }
  const els = Array.from({ length: POOL }, () => { const e = doc.createElement('div'); e.className = 'fn'; e.setAttribute('aria-hidden', 'true'); doc.body.append(e); return e; });
  const live = [];
  const v3 = new THREE.Vector3();
  return {
    push(ev) { if (ev && ev.pos && KIND[ev.kind]) mergeOrAdd(live, ev, now()); },
    update() {
      const t = now(), w = win.innerWidth, h = win.innerHeight, red = reduced();
      for (let i = live.length - 1; i >= 0; i--) if (!alive(live[i], t)) live.splice(i, 1);
      for (let i = 0; i < POOL; i++) {
        const e = els[i], n = live[i];
        if (!n) { if (e.style.opacity !== '0') e.style.opacity = '0'; continue; }
        v3.set(n.pos[0], n.pos[1], n.pos[2]).project(camera);
        if (v3.z > 1) { e.style.opacity = '0'; continue; }
        const c = curve(n.kind, t - n.born, red), k = KIND[n.kind];
        const jx = c.jitter ? (Math.random() * 2 - 1) * c.jitter : 0;
        const text = textOf(n.kind, n.amount, xpUnit());
        if (e.textContent !== text) e.textContent = text;
        e.className = 'fn' + (n.kind === 'crit' && !red ? ' crit' : '');
        e.style.color = colorOf(n); e.style.fontSize = sizeOf(n) + 'px';
        e.style.transform = `translate(${((v3.x + 1) / 2 * w + jx + (c.drift || 0)).toFixed(1)}px, ${((1 - v3.y) / 2 * h - c.rise).toFixed(1)}px) translate(-50%, -50%) scale(${(c.scale * n.grow).toFixed(3)})`;
        e.style.opacity = c.opacity.toFixed(3);
      }
    },
    get count() { return live.length; },
    dispose() { for (const e of els) e.remove(); live.length = 0; },
  };
}

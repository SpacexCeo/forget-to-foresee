// STUB — replaced by its work package (docs/ui-world-hud.md §9). Keeps the preview runnable.
import { h } from '../dom.js';

export function mountStatus(root, o = {}) {
  const el = h('div', { class: 'wh-status', dataset: { stub: '' } });
  root.appendChild(el);
  return { el, update() {}, destroy() { el.remove(); } };
}

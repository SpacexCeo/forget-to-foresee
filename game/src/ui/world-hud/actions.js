// STUB — replaced by its work package (docs/ui-world-hud.md §9). Keeps the preview runnable.
import { h } from '../dom.js';

export function mountActions(root, o = {}) {
  const el = h('div', { class: 'wh-actions', dataset: { stub: '' } });
  root.appendChild(el);
  return { el, update() {}, destroy() { el.remove(); } };
}

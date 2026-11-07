import { h } from './dom.js';
import { icon } from './icons.js';

/** Keep translation on the label so re-rendering cannot erase the icon. */
export function actionButton({ label, key, variant = 'secondary', symbol, trailing = false, attrs = {}, onClick } = {}) {
  const caption = h('span', { class: 'ftf-btn-label', text: label, i18n: key });
  const drawing = symbol ? icon(symbol) : null;
  return h('button', {
    class: `ftf-btn ftf-btn-${variant}`,
    attrs: { type: 'button', ...attrs },
    on: onClick ? { click: onClick } : {},
  }, trailing ? caption : drawing, trailing ? drawing : caption);
}

/** A descriptive cue, or a native action when an activation callback is supplied. */
export function contextCue({ title, detail, keycap = 'E', device = 'keyboard', symbol = 'eye', onClick }) {
  return h(onClick ? 'button' : 'div', {
    class: 'ftf-context-cue',
    attrs: onClick ? { type: 'button' } : {},
    on: onClick ? { click: onClick } : {},
  },
    icon(symbol),
    h('span', { class: 'ftf-cue-copy' }, h('strong', { text: title }), detail ? h('span', { text: detail }) : null),
    h('kbd', { class: 'ftf-keycap', dataset: { device }, attrs: onClick ? { 'aria-hidden': 'true' } : {}, text: keycap }));
}

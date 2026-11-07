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

/** A descriptive cue. Callers supply localized labels and bind any action themselves. */
export function contextCue({ title, detail, keycap = 'E', device = 'keyboard', symbol = 'eye' }) {
  return h('div', { class: 'ftf-context-cue' },
    icon(symbol),
    h('div', { class: 'ftf-cue-copy' }, h('strong', { text: title }), detail ? h('span', { text: detail }) : null),
    h('kbd', { class: 'ftf-keycap', dataset: { device }, text: keycap }));
}

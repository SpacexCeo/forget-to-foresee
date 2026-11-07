import { h, ensureStyles } from './dom.js';
import { actionButton, contextCue } from './controls.js';
import { icon } from './icons.js';
import { controlsReference, sceneKeycap } from './scene-controls.js';

const copy = (tag, text, className) => h(tag, { text, class: className });

function referenceSection(title, detail, ...children) {
  return h('section', { class: 'ftf-reference-section' },
    h('header', {}, copy('h2', title), copy('p', detail, 'ftf-muted')),
    h('div', { class: 'ftf-reference-examples' }, children));
}

export function mountUiReference(root) {
  ensureStyles();
  const result = h('p', { class: 'ftf-muted ftf-reference-result', attrs: { role: 'status' }, text: 'Choose an action to preview its response.' });
  const preview = (message) => () => { result.textContent = message; };
  const sample = (title, ...children) => h('div', { class: 'ftf-reference-sample' }, copy('p', title, 'ftf-overline'), children);
  const memoryWarning = h('div', { class: 'ftf-notice', dataset: { tone: 'danger' } }, icon('warning'),
    h('div', {}, copy('strong', 'This memory is permanently forgotten.'),
      copy('p', 'In a season, it becomes a shard for auction. The vision assumes no intervention. This example uses no resources.')));
  memoryWarning.id = 'ftf-reference-memory-warning';

  const buttons = referenceSection('Button states',
    'Amber marks the primary decision. Quiet actions sit beside it or lead back. Tab through the samples to see the focus treatment.',
    h('div', { class: 'ftf-reference-button-grid' },
      sample('Primary', actionButton({ label: 'Enter the world', variant: 'primary', symbol: 'arrow', trailing: true, onClick: preview('Previewed the primary action.') })),
      sample('Secondary', actionButton({ label: 'Inspect the Scroll', symbol: 'eye', onClick: preview('Previewed the secondary action.') })),
      sample('Quiet', actionButton({ label: 'Return to lobby', variant: 'ghost', symbol: 'back', onClick: preview('Previewed the quiet action.') })),
      sample('Selected', actionButton({ label: 'Low quality', attrs: { 'aria-pressed': true }, onClick: preview('Previewed the selected state.') })),
      sample('Unavailable', actionButton({ label: 'Access locked', symbol: 'lock', attrs: { disabled: true } })),
      sample('Busy', actionButton({ label: 'Checking access', symbol: 'hourglass', attrs: { disabled: true, 'aria-busy': true } }))),
    result);

  const cues = referenceSection('Contextual cues',
    'Show one available action at a time. A position label identifies the controller button across layouts.',
    h('div', { class: 'ftf-reference-device-grid' }, ['keyboard', 'gamepad'].map((device) =>
      sample(device === 'gamepad' ? 'Gamepad' : 'Keyboard & mouse',
        contextCue({ title: 'Inspect the Scroll', device, keycap: sceneKeycap(device, 'interact') }),
        contextCue({ title: 'Leave inspection', detail: 'The Scroll', device, symbol: 'back', keycap: sceneKeycap(device, 'cancel') }),
        controlsReference(device)))));

  const outcome = h('p', { class: 'ftf-muted ftf-reference-result', attrs: { role: 'status' }, text: 'Simulated choice · no season is running.' });
  const closeChoice = (message) => () => { outcome.textContent = message; };
  const memory = referenceSection('The price of memory',
    'Put the consequence beside the destructive action. Give the player a clear way back.',
    h('div', { class: 'ftf-reference-memory' },
      copy('h3', 'Forget the promise?'),
      copy('p', 'Simulated choice', 'ftf-overline'),
      memoryWarning,
      h('div', { class: 'ftf-row' },
        actionButton({ label: 'Keep memory', symbol: 'back', onClick: closeChoice('Preview cancelled. The sample memory was kept.') }),
        actionButton({ label: 'Forget memory', variant: 'danger', symbol: 'warning', attrs: { 'aria-describedby': memoryWarning.id }, onClick: closeChoice('Preview confirmed. No memory or season data was changed.') })),
      outcome));

  root.append(h('main', { class: 'ftf-root ftf-reference' },
    h('header', { class: 'ftf-reference-header' },
      h('nav', { class: 'ftf-row', attrs: { 'aria-label': 'Preview pages' } },
        h('a', { attrs: { href: './ui-preview.html' }, text: 'Lobby preview' }),
        h('a', { attrs: { href: './' }, text: '3D exploration' })),
      copy('h1', 'The future costs a memory.'),
      copy('p', 'The Forget to Foresee UI reference covers exploration, decisions and their consequences. Every example is simulated.', 'ftf-muted')),
    buttons, cues, memory));
}

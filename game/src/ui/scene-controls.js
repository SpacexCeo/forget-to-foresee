import { h } from './dom.js';
import { actionButton, contextCue } from './controls.js';

const BINDINGS = [
  ['Move', 'W A S D or click the ground', 'Left stick'],
  ['Orbit and tilt', 'Right-drag or arrow keys', 'Right stick'],
  ['Interact', 'E', 'South button'],
  ['Inspect', 'I or select the cue', 'Press left stick'],
  ['Back or open controls', 'Esc', 'East button'],
  ['Zoom', 'Mouse wheel or + / −', 'Left / right bumper'],
  ['Reset camera', 'R', 'Press right stick'],
  ['Navigate menus', 'Tab, Enter and Esc', 'D-pad / left stick, South, East'],
];

export const sceneKeycap = (device, action) => {
  const keys = { interact: ['I', 'Left stick'], cancel: ['Esc', 'East'], menu: ['Esc', 'Menu'] };
  return keys[action][Number(device === 'gamepad')];
};

export function controlsReference(device) {
  return h('dl', { class: 'ftf-bindings' }, BINDINGS.map(([action, keyboard, pad]) =>
    h('div', {}, h('dt', { text: action }), h('dd', { text: device === 'gamepad' ? pad : keyboard }))));
}

/** Presentation only. World actions remain with the scene owner. */
export function mountSceneControls(root, { onContext, onTransition }) {
  const hint = h('span', { class: 'ftf-scene-hint', attrs: { 'aria-hidden': 'true' }, text: 'Esc' });
  const opener = actionButton({ label: 'Controls', symbol: 'settings', attrs: { 'aria-haspopup': 'dialog' }, onClick: open });
  opener.append(hint);
  const source = h('p', { class: 'ftf-overline', text: 'Keyboard & mouse' });
  const bindings = h('div', {});
  const resume = actionButton({ label: 'Resume exploration', variant: 'primary', symbol: 'arrow', trailing: true, onClick: () => dialog.close() });
  const dialog = h('dialog', { class: 'ftf-dialog ftf-scene-dialog', attrs: { 'aria-labelledby': 'ftf-scene-controls-title' } },
    h('div', { class: 'ftf-dialog-head' },
      h('h2', { text: 'Exploration controls', attrs: { id: 'ftf-scene-controls-title' } })),
    h('div', { class: 'ftf-dialog-body' }, source, bindings,
      h('p', { class: 'ftf-muted', text: 'Gamepad labels describe button positions. Menu opens this reference.' }),
      resume));
  const cue = h('div', { class: 'ftf-scene-cue', attrs: { hidden: true } });
  const announcer = h('div', { class: 'sr-only', attrs: { role: 'status' } });
  root.append(h('div', { class: 'ftf-scene-tools' }, opener), dialog, cue, announcer);

  let device;
  let lastKey;
  function open() {
    if (dialog.open) return;
    onTransition();
    dialog.showModal();
    resume.focus();
  }
  dialog.addEventListener('close', () => {
    onTransition();
    opener.focus();
  });

  function update(nextDevice, near, inspecting) {
    if (device !== nextDevice) {
      device = nextDevice;
      hint.textContent = sceneKeycap(device, 'menu');
      source.textContent = device === 'gamepad' ? 'Gamepad' : 'Keyboard & mouse';
      bindings.replaceChildren(controlsReference(device));
    }
    const item = inspecting || near;
    const title = inspecting ? 'Leave inspection' : item ? `${item.verb} ${item.label}` : '';
    const detail = inspecting ? item.label : '';
    const key = JSON.stringify([title, detail, device, Boolean(inspecting)]);
    if (key === lastKey) return;
    lastKey = key;
    cue.hidden = !item;
    if (announcer.textContent !== title) announcer.textContent = title;
    const wasFocused = cue.contains(document.activeElement);
    cue.replaceChildren(...(item ? [contextCue({
      title, detail, device, onClick: onContext,
      symbol: inspecting ? 'back' : 'eye',
      keycap: sceneKeycap(device, inspecting ? 'cancel' : 'interact'),
    })] : []));
    if (wasFocused) (cue.firstElementChild ?? opener).focus({ preventScroll: true });
  }
  return { dialog, open, update };
}

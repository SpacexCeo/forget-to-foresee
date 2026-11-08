import { GamepadInput, PAD, readGamepads } from './gamepad.js';

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex="0"]';

function showGamepadFocus(item) {
  if (item.hasAttribute('data-gamepad-focus')) return;
  item.setAttribute('data-gamepad-focus', '');
  item.addEventListener('blur', () => item.removeAttribute('data-gamepad-focus'), { once: true });
}

function focusFromGamepad(item) {
  showGamepadFocus(item);
  item.focus();
}

// Return true when the menu consumed an action. Uses native controls and their existing callbacks.
export function navigateGamepadMenu(root, pad) {
  if (pad.hit(PAD.cancel) || pad.hit(PAD.menu)) {
    if (root.matches('dialog[open]')) {
      const cancel = new Event('cancel', { cancelable: true });
      if (root.dispatchEvent(cancel)) root.close();
      return true;
    }
    const back = [...root.querySelectorAll('[data-gamepad-back]')].at(-1);
    if (back && !back.matches(':disabled')) { back.click(); return true; }
    return false;
  }

  const accept = pad.hit(PAD.interact);
  const { navigation } = pad;
  if (!accept && navigation === null) return false;
  const doc = root.ownerDocument;
  const focused = doc.activeElement;
  const items = [...root.querySelectorAll(FOCUSABLE)].filter((el) =>
    !el.matches(':disabled, [aria-disabled="true"]') && !el.closest('[inert]') &&
    el.getClientRects().length && doc.defaultView.getComputedStyle(el).visibility === 'visible');
  if (!items.length) return false;

  const index = items.indexOf(focused);
  if (index < 0) {
    focusFromGamepad(items.find((el) => el.classList.contains('ftf-btn-primary')) ?? items[0]);
  } else if (accept) {
    showGamepadFocus(focused);
    if (!focused.matches('select, textarea, input:not([type="checkbox"], [type="radio"], [type="button"])')) focused.click();
  } else if (focused.matches('select, input[type="range"]') && (navigation === PAD.left || navigation === PAD.right)) {
    showGamepadFocus(focused);
    const step = navigation === PAD.left ? -1 : 1;
    if (focused.matches('select')) {
      focused.selectedIndex = Math.max(0, Math.min(focused.length - 1, focused.selectedIndex + step));
    } else if (step < 0) focused.stepDown();
    else focused.stepUp();
    focused.dispatchEvent(new Event('input', { bubbles: true }));
    focused.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const step = navigation === PAD.up || navigation === PAD.left ? -1 : 1;
    focusFromGamepad(items[(index + step + items.length) % items.length]);
  }
  return true;
}

// A single poller follows the active preview screen or modal, including after onboarding renders.
export function bindGamepadMenus(root) {
  const pad = new GamepadInput();
  let focused = document.hasFocus();
  window.addEventListener('blur', () => { focused = false; pad.clear(); });
  window.addEventListener('focus', () => { focused = true; });
  window.addEventListener('gamepaddisconnected', (e) => pad.disconnect(e.gamepad.index));
  document.addEventListener('visibilitychange', () => pad.clear());
  function tick() {
    if (focused && !document.hidden) {
      pad.poll(readGamepads());
      const scope = root.querySelector('dialog[open]') ?? root;
      if (navigateGamepadMenu(scope, pad) && (scope !== (root.querySelector('dialog[open]') ?? root))) pad.clear();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

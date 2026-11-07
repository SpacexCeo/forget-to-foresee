import { PAD } from './gamepad.js';

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex="0"]';

// Return true when the menu consumed an action. Uses native controls and their existing callbacks.
export function navigateGamepadMenu(root, pad) {
  if (pad.hit(PAD.cancel) || pad.hit(PAD.menu)) {
    if (root.matches('dialog[open]')) {
      const cancel = new Event('cancel', { cancelable: true });
      if (root.dispatchEvent(cancel)) root.close();
      return true;
    }
    const back = root.querySelector('[data-gamepad-back]');
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
    (items.find((el) => el.classList.contains('ftf-btn-primary')) ?? items[0]).focus();
  } else if (accept) {
    if (!focused.matches('select, textarea, input:not([type="checkbox"], [type="radio"], [type="button"])')) focused.click();
  } else if (focused.matches('select, input[type="range"]') && (navigation === PAD.left || navigation === PAD.right)) {
    const step = navigation === PAD.left ? -1 : 1;
    if (focused.matches('select')) {
      focused.selectedIndex = Math.max(0, Math.min(focused.length - 1, focused.selectedIndex + step));
    } else if (step < 0) focused.stepDown();
    else focused.stepUp();
    focused.dispatchEvent(new Event('input', { bubbles: true }));
    focused.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const step = navigation === PAD.up || navigation === PAD.left ? -1 : 1;
    items[(index + step + items.length) % items.length].focus();
  }
  return true;
}

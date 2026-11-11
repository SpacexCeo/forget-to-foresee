// Haptics (feature 6): the same cues as the town sound (audio/town-audio.js `ftf:sound`) become a short vibration on
// phones (navigator.vibrate, where the browser has it) and a rumble on a gamepad (vibrationActuator), where the device
// supports them. Light by design: a few short pulses, never continuous. Off with localStorage ftf.haptics = "off" and
// under reduced motion.
export const HAPTICS_KEY = 'ftf.haptics';
/** Cue -> [vibrate pattern in ms, gamepad strength 0..1, gamepad ms]. */
export const PATTERNS = Object.freeze({
  bid_tick: Object.freeze([[6], 0.15, 25]),
  gift_chime: Object.freeze([[30, 40, 60], 0.6, 160]),
  ui_confirm: Object.freeze([[18], 0.3, 60]),
  vision_whoosh: Object.freeze([[25], 0.45, 90]),
  storm_crack: Object.freeze([[40, 30, 25], 0.8, 180]),
  ui_error: Object.freeze([[50, 40, 50], 0.5, 120]),
});

/** Whether haptics are on for this browser. */
export function hapticsOn(storage, reduced = false) {
  if (reduced) return false;
  try { return !storage || storage.getItem(HAPTICS_KEY) !== 'off'; } catch { return true; }
}

/**
 * @param {{win?: Window, nav?: Navigator, storage?: object, reduced?: () => boolean}} o
 * @returns {{pulse: (cue: string) => boolean, dispose: () => void}}
 */
export function createHaptics({ win = globalThis, nav = globalThis.navigator, storage = null, reduced = () => false } = {}) {
  function pulse(cue) {
    const p = PATTERNS[cue];
    if (!p || !hapticsOn(storage, reduced())) return false;
    let did = false;
    try { if (nav && typeof nav.vibrate === 'function') did = nav.vibrate(p[0]) || did; } catch { /* not allowed */ }
    try {
      const pads = nav && typeof nav.getGamepads === 'function' ? nav.getGamepads() : [];
      for (const g of pads || []) {
        const a = g && g.vibrationActuator;
        if (a && typeof a.playEffect === 'function') { a.playEffect('dual-rumble', { duration: p[2], strongMagnitude: p[1], weakMagnitude: p[1] * 0.6 }).catch(() => {}); did = true; }
      }
    } catch { /* no gamepads */ }
    return did;
  }
  const onCue = (e) => pulse(e.detail);
  if (win && win.addEventListener) win.addEventListener('ftf:sound', onCue);
  return { pulse, dispose() { if (win && win.removeEventListener) win.removeEventListener('ftf:sound', onCue); } };
}

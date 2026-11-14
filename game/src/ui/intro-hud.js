// While the intro runs (the lab prologue, the wake-up dialogue, "What waits for you"), the town's HUD steps aside
// (QA pass 2 #5): no quest tracker, hotbar, minimap, talk prompt or profile under the dialogue box, and the intro's
// Skip button no longer sits on the minimap. The intro sets it through the sprint ctx's lockControls (boot-world.js),
// the same call that keeps E and the movement keys away from the town under the intro's windows.

/** Everything of the game's HUD the intro hides (the intro's own .npe-* elements stay). */
export const INTRO_HIDDEN = Object.freeze([
  '#rpg-hud', '.ph', '.ftf-story-goal', '.ftf-town-prompt', '#prompt', '.wh-root', '.hub-host', '.ftf-run-toggle',
  '.ftf-map-fab', '.ftf-scene-controls', '#scene-controls', '.ftf-tour-card', '.ftf-town-profile',
]);

export const INTRO_CLASS = 'npe-intro-on';

/** The stylesheet text: every hidden selector under body.npe-intro-on. Pure. */
export function introHudCss() {
  return INTRO_HIDDEN.map((s) => `body.${INTRO_CLASS} ${s}`).join(', ') + ' { visibility: hidden !important; }';
}

/** Hides (on) or restores (off) the HUD for the intro. */
export function setIntroHud(doc, on) {
  if (!doc || !doc.body) return;
  if (on && doc.head && !doc.getElementById('npe-intro-hud-css')) {
    const s = doc.createElement('style'); s.id = 'npe-intro-hud-css'; s.textContent = introHudCss(); doc.head.append(s);
  }
  doc.body.classList.toggle(INTRO_CLASS, !!on);
}

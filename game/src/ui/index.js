// Public mount API of the UI shell. See docs/ui.md for integration with main.js.
import { getUiContext } from './context.js';
import { mountLobby } from './lobby.js';
import { mountOnboarding } from './onboarding.js';
import { createOnboardingFlow } from './flow.js';

export { mountLobby } from './lobby.js';
export { mountOnboarding } from './onboarding.js';
export { mountHud, createEngineStore } from './hud.js';
export { mountConstructor } from './hologram/constructor.js';
export { mountTournamentCard } from './tournament-card.js';
export { getUiContext, createUiContext } from './context.js';
export { ensureStyles } from './dom.js';
export * as i18n from './i18n/index.js';

/**
 * Lobby → onboarding (demo entitlement → tutorial → hologram → first contact).
 * Calls onFirstContact({guestId, entitlement, recipe, recipeHash, locale}) when the
 * player steps onto the island; the caller then unmounts the shell (or keeps it)
 * and starts the world.
 */
export function mountShell(root, opts = {}) {
  const ctx = opts.ctx || getUiContext();
  const flow = createOnboardingFlow(ctx.storage);
  let current = null;
  function showLobby() {
    if (current) current.destroy();
    current = mountLobby(root, { ctx, flow, onEnter: showOnboarding });
  }
  function showOnboarding() {
    if (current) current.destroy();
    current = mountOnboarding(root, { ctx, flow, onExit: showLobby, onFirstContact: opts.onFirstContact, firstContactNoteKey: opts.firstContactNoteKey });
  }
  showLobby();
  return { ctx, flow, showLobby, showOnboarding, destroy() { if (current) current.destroy(); current = null; } };
}

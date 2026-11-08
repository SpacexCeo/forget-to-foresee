# Premium UI and Souls-style controls — cloud continuation

Status: partial implementation checkpoint, not a completed or visually approved feature.

## Owner request

Preserve the luxurious appearance of Forget to Foresee and create coherent buttons and visual interaction cues. The owner suggested the Impeccable skill, then specified Dark Souls-style controls and confirmed **keyboard and mouse plus gamepad**. The owner also wants cooperation with Claude through GitHub and asked to continue this work in the cloud so the local PC can be switched off.

All communication and deliverables must be English. `AGENTS.md` supersedes historical language instructions in `CLAUDE.md`, `docs/spec.md`, and `docs/decisions.md`. Never translate canonical identifiers, signed proof bytes, or saved game payloads in place.

## Repository and isolation

- Repository: https://github.com/SpacexCeo/forget-to-foresee
- Continue on `codex/premium-ui`, based on `integration/slice` at `9e72e4e`.
- The local main working copy was returned to `integration/slice`. UI work is isolated from Claude's working copies.
- Claude branches observed: `ui/lobby-i18n`, `client/season-loop`, `client/3d-skeleton`, `render/lookdev`, `api/agent-play`, and separate art and contract branches.
- No direct messaging connection to Claude has been established. Coordinate through reviewable commits and an integration note; do not claim Claude has accepted an assignment. Check fresh remote changes before integrating. Preserve unrelated work.
- Commit and push small completed pieces, per project instructions. Do not merge to main or deploy.

## Design direction

Preserve the existing charcoal, cold grey-green, mist, pearl/nacre and amber palette. The floating archipelago and ammonite Shells are the visual authority. Amber marks human decisions; Iris violet is secondary. Keep the four-slot logogram unchanged. Souls-style means deliberate movement, camera control, restrained UI and contextual input prompts; it does not authorize copying Dark Souls art or adding combat, stamina, dodge mechanics or economic rules.

Use native, responsive buttons with live text and scalable original SVG icons. Maintain one clear primary action per decision group, visible keyboard focus, colour-independent status cues, comfortable target sizes, reduced-motion support and honest local-demo labels. Keep costs and irreversible consequences beside the relevant action. Avoid generic glowing cards, oversized HUD panels and decorative motion. Preserve the current identity rather than redesigning it.

## Changes already made

- `game/src/ui/icons.js`: original consistent 24-unit line icons.
- `game/src/ui/controls.js`: shared `actionButton` and `contextCue` helpers. Translation belongs on a label child so locale re-rendering does not erase the icon.
- `game/src/ui/styles.css`: control dimensions and timing tokens; native appearance reset; explicit enabled hover and active states; primary, secondary, quiet, danger, disabled and busy treatment; keyboard/gamepad cue styling; selection and scrollbar colours.
- Lobby and onboarding primary buttons use the new helper; the lobby primary action is linked to its explanatory text; navigation has matching icons.

These changes are a starting point. The styles and helpers still need the final browser review. `contextCue` is not yet integrated into the 3D scene. A proposed gamepad/input patch was rejected atomically before writing files: **no controller or camera changes have been implemented**.

## Finish the work

1. Read `AGENTS.md`, `CLAUDE.md`, `docs/decisions.md`, `docs/spec.md`, `docs/ui.md` and the current source before editing. Use Impeccable if available. It was already applied to establish the refinement direction locally.
2. Implement Souls-style camera-relative WASD and analog left-stick movement, mouse/right-stick camera control, E/south-face-button interaction, Escape/east-face-button cancel, and appropriate camera reset/menu/zoom controls. Adapt to the current noncombat game. If mouse capture is used, request it only from a real click, release it for menus, and retain a usable fallback. Keep collision and never-first-person behavior.
3. Support browser-standard gamepads with deadzones, normalized diagonal movement, edge-triggered actions, disconnect/blur cleanup, and prompts matching the active input. Avoid stale held buttons executing another action after a menu transition. Include controller menu navigation and cancellation, not just world movement. Prefer explicit generic labels where controller branding is uncertain.
4. Integrate contextual prompts and a compact controls reference into the actual scene. Coordinate the small changes in `main.js` and camera code with the scene owner's latest branch; do not replace their integration work wholesale.
5. Create a useful in-project UI reference view showing real button states, device prompts, contextual help and memory-choice warnings. Clearly label any simulated examples. Make it available in the production preview build if that is the intended handoff artifact.
6. Keep newly exposed UI English. The current UI context can select Russian from browser preferences and still exposes EN/RU controls. Address the presentation configuration safely; preserve the engine's frozen parity data and legacy translation tests unless an explicit migration is necessary.
7. Add a concise durable design/asset guideline and a Claude integration note listing changed files, APIs and remaining limitations. Record the owner’s new input direction in the decision log as superseding the relevant historical camera/input preferences.
8. Verify with `cd game && npm ci && npm test && npm run build`. Add meaningful tests for input handling, deadzones, held-button edges, focus loss and disconnects. Existing engine parity, collision and UI accessibility tests must remain green. Visually inspect desktop and narrow layouts in one batched pass, fix real defects together, and confirm once. State honestly if physical gamepad testing is unavailable.

## Useful current entry points

- `game/index.html` and `game/src/main.js`: 3D skeleton, currently separate from the UI preview; inspect the latest scene integration before merging.
- `game/src/ui/input.js`: current keyboard, mouse, right-drag and click-to-move input; no gamepad polling.
- `game/src/render/camera-rig.js`: limited isometric yaw and zoom toward third person; inspect orbit and collision sweep.
- `game/src/physics/character.js`: fixed-step capsule movement already preserves analog magnitudes below one and caps diagonal magnitude.
- `game/ui-preview.html`: lobby, onboarding, constructor, tournament and HUD preview.
- `game/vite.config.js`: currently builds the game and asset review only; UI preview is not yet in build inputs.
- `game/src/ui/dom.js`: translation re-render replaces `textContent` on nodes carrying `data-i18n`.
- `game/tests/ui-a11y.test.mjs`: palette and focus expectations.

## Verification at transfer

Automated checks are recorded in the cloud continuation prompt. The final visual pass, controller implementation, physical-controller verification and completed UI reference are still pending. Never report the whole feature as finished from this checkpoint.

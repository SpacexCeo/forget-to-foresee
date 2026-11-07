# Collaboration: file ownership between Claude Code and Codex

Two coding agents work on this repository in parallel. Each owns a set of paths; neither edits the
other's paths. Changes cross over only through merges into the integration branch, done by the
Claude Code lead (`integration/slice-frkc4d`).

## Codex — branch `codex/premium-ui`
Buttons, visual cues, UI consistency and polish:
- `game/src/ui/**` except `game/src/ui/input.js` and `game/src/ui/dev-hud.js`
- `game/src/ui/styles.css`, `game/ui-preview.html`
- `game/src/locales/**` (en/ru strings; keep key parity, `tests/ui-i18n.test.mjs` must stay green)
- `game/tests/ui-*.test.mjs`

## Claude Code team — branch `integration/slice-frkc4d`
Movement, camera, gameplay, rendering, VFX, audio, art, API:
- movement and camera: `game/src/physics/**`, `game/src/render/camera-rig.js`, `game/src/ui/input.js`
- gameplay and scenes: `game/src/main.js`, `game/src/play/**`, `game/src/scenes/**`, `game/index.html`
- rendering: `game/src/render/**`, `game/src/ui/dev-hud.js`; VFX `game/src/vfx/**`; audio `game/src/audio/**`
- agent API: `game/src/net/**`, `server/**`, `docs/api/**`
- art: `art/**`, `game/public/assets/**`, `docs/art/**`
- never edited by either UI work: `game/src/game/engine.js`, `prototype-2d/` (parity tests)

## Contract between the two
- The gameplay layer calls the UI only through the public functions exported from `game/src/ui/index.js`
  and documented in `docs/ui.md`. If Codex changes a signature there, note it in `docs/ui.md` in the same commit.
- If Codex needs a new hook from gameplay (an event, a state field), write the request in
  `docs/collab-requests.md`; the Claude lead picks it up. Same in the other direction.
- Both keep `cd game && npm test` and `npm run build` green; English-only repository text.
- Codex pushes `codex/premium-ui`; the Claude lead merges it into `integration/slice-frkc4d`, runs all tests and pushes.

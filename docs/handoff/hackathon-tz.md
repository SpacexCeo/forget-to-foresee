# Handoff: hackathon spec (`docs/hackathon-tz.md`)

Branch `claude/hackathon-tz`, draft PR #34 to `main` (the owner merges; never push or tag `main`). State: 11.11.2026.

## Done (tests green: `cd game && npm test` 667, `cd server && npm test` 28)
- **P0-B** first-contact copy for the town start; **P0-C** terms taught in context; **P0-D** slot names are buttons
  with a one-line hint (`flow.js` `tapLabel`, `hintSlot`); **P0-E** one Begin, preview paints at once. Five locales,
  tests in `game/tests/tutorial.test.mjs`, notes in `docs/tutorial.md` §2.1.
- Signs panel test fixed after the subtitle removal.

- **P0-A** Shell hall: the model was never mixed up; the flight entered before it streamed. Pins (`JUDGE_PINS`),
  the flight cover waits for the hall, arrival on the hall floor at the foot of the stairs (`scenes/shell-layout.js`,
  `tests/client/shell-layout.test.mjs`). Checked on real WebGL.
- **P0-F** the only play-path read-back was the sky LUT: cached per atmosphere; Controls shows first
  (`tests/client/readback.test.mjs`, `docs/smoothness.md`).

## P1 (done 11.11)
- **P1-C** honest shard card: `previewCard` in `ui/world-hud/shard-card-model.js`, the DOM in `shard-card.js`, tests
  in `tests/client/shard-nft-hud.test.mjs`; README judge row 7.
- **P1-A** `fixedSteps(..., carry)` + `PHYSICS_CARRY` in `boot-world.js`, `clickStuck` in `physics/character.js`;
  tests in `movement.test.mjs` and `input.test.mjs` (`KeyW` + `ц`); `docs/movement.md`.
- **P1-B** the full three-NPC quest: `scenes/town-quest.js` + `town-flow.js`, `tests/client/town-quest.test.mjs`,
  `docs/town.md`. Checked in headless Chromium with `?play=direct&town=1&quest=1` (all three talks, no errors).
- Server: `tests/demo.test.mjs` runs on a fixed seed (it failed on about 1 run in 4 on main: some seeds end at tick
  16 as `gone`, with no vote).

- After the lead's competitor-map note: on `?demo=judge`, Memories opens by itself on Iris's shard card after
  the trial-6 auction (checked headless: a real token when the call is forgotten, the preview otherwise). Copy pass
  §7 is in `docs/submission/copy-alignment.md` (`ent.wallet` fixed; the repo description is the owner's to change).

## Next
- Not done and not asked: P1-D (owner mint), P2. After the freeze: copy pass (spec section 7), video shot list.
- Not walked on the GPU yet: the town quest and the shard preview toast (only headless/unit).

## How to resume
- GPU server (real WebGL): `tools/gpu-server/jx.py` with the host and token in an uncommitted directory. On the
  server: `/root/w/tz/ftf` (clone of this branch), `bash /root/w/tzbuild.sh` rebuilds and serves port 4311,
  `. /root/w/tz/env.sh && node /root/w/tz/shellcap.cjs shots/<name>` flies into Shell I and takes frames.
- Local: `cd game && npm run dev`, headless Chromium works for the onboarding screens (SwiftShader).
- NFT-001 cards: in the game (Day 1 flip, profile, on-chain Elise row); no-name art at `assets/nft/elise.webp` = the deployed `elise_media` URL. Left: NFTs/inventory tabs with (d).
- Relayer (relayer/): signs create_guest server-side; client POSTs when VITE_FTF_RELAYER_URL is set; Pages passes vars.FTF_RELAYER_URL, no key in the page. Left: lead deploys, sets the variable.
- Relayer standalone: node relayer/server.js + Dockerfile, ALLOWED_ORIGIN, TRUST_PROXY. Left: owner hosts it, sets FTF_RELAYER_URL.
- Casts restored: Return to town now remounts Frost Lance / Storm Snare (leaveTown disposed them); first two skill-bar slots, placeholder art. Left: UI-003 icons.
- QW-4: og/twitter meta, og.jpg (town still), favicon.svg, test. Left: owner updates the GitHub description/topics/homepage.
- QW-5: WebGL 2 check before the world chunk (?forceNoGL=1), no-GPU links on the boot screen, software-renderer note; tests.
- QW-3: ?demo=judge Memories button opens the recorded on-chain shard #7 (labelled coordinator-minted), offline honest; scripts/judge-replay-link.mjs. README link with QW-1.
- QW-1/QW-12/QW-7: README rewritten for the screener (old one = docs/status.md), numbers from docs/STATS.md (scripts/stats.mjs), scripts/verify-all.sh, Rust pinned 1.99.1, engines/.nvmrc. Left: cargo-near version pin (no release list reachable here).
- Collapsible town panels: chevron → pill at the right edge with live hire progress, stack, O expands, Esc closes, remembered; tests + headless.
- China/greybox: self-hosted Cormorant (no Google Fonts), town never revealed half-loaded (slow-link note at 30 s, Reload at 90 s), no greybox capsule for players (Iris fetch/attach retried), jsDelivr asset mirror (China time zones / ?mirror=1 start on it, errors and timeouts switch). Mobile first view ~18 MB models.

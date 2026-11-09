# GPU / character-art session — handoff (09.11.2026)

Server: Clore order 2419013, RTX 4090 (Ubuntu, Blender 4.5.3 as `blender`, MPFB 2.0.18, Node + Playwright in
`/root/pw`, Chromium with ANGLE Vulkan args in `/root/gpu-args.vk.json`). Reached through its Jupyter
endpoint (contents API for put, `/files/<path>` for get, a terminal websocket to run commands); the URL and
token are held by the lead/owner, never in the repo. Do not stop or reconfigure the server; never touch
order 2419123.

## Iris hero (done, deployed)
- Coat version: MPFB body, Hair Curves master groom (~30k strands, tied ponytail) + game hair cards from
  strand groups, painted face, costume, rig `agent_rig`, clips from `agent_anim`. Built by
  `art/agents/iris_hero/build_iris_hero.py -- full` (`IRIS_COSTUME=coat`), deployed through main.
- Game side: `tuneHairCards` (alpha test 0.3 + alpha to coverage), cache-busted model URLs
  (`versionedModelUrl`).

## Iris athletic sportswear (WIP on `claude/iris-hero`)
- Body approved by the owner (MakeHuman targets, original face transferred). Do not change proportions.
- Costume (default `IRIS_COSTUME=athletic`): sports top (convex sections, no nipple shape), cropped jacket
  whose front is laid on one constructed surface (`hero_costume.front_surface`: convex per height and along
  the height, over the top), straight zip edges, raised plackets, rib hem band, neckline tucked into a stand
  collar, clearance pass against the top (`shell_from_body(..., clear=)`); leggings from the body with the
  crotch and a restrained glute cleft bridged, level top under a reinforced waistband; parametric high-top
  trainers. Palette (`hero_shading.py`): graphite jacket, near-black top, dark graphite leggings,
  nacre-violet piping; trainers with graphite uppers, off-white soles, a pale violet stripe.
- QA: `qa_ortho.py` (neutral ortho front/side/back, `only=jacket|leggings`, `QA_ZOOM=scale,z` for close-ups).
  Renders in `docs/art/qa/iris-hero/athletic/`.
- Full GPU build of the athletic version: first run failed in `agent_anim` (no spring params for the
  `tail` chain) — fixed in 92ece76; the rerun's result is in the lead summary.
- Next: owner review of the jacket and the full outfit; ribbed cuffs; knit normal detail; deformation
  check in idle/walk/turn/arm raise/crouch; in-game check on desktop + phone; then merge to main.

## GPU jobs today
- J3 jury plates rounds 1–3 (44ed2fd, 5b64ae9, 8e35537): 4K30 ultra, no layers, ANGLE Vulkan; proxies,
  stills, camera logs in `docs/media/plates/jury-test-*`; 4K masters server-only (inventory).
- Round 4 (262cd3a, HDR clamp + black-block gate): **not run** — the wrap-up order arrived first.
- Iris builds: coat (deployed), athletic (see above).

## Saved
- Branch `art-sources` (Git LFS): every art binary that was only on the server (shell blends, raw glbs,
  textures, guest, Iris blends) and the v2 1080p videos, with `SHA256SUMS`.
- `docs/art/server-inventory.md` + `docs/art/server-only-files-2026-11-09.tsv`: every server-only file
  over 1 MB with size and sha256; the files over 100 MB stay on the server.

## Left
- Round 4 jury plates (command in the lead's message, commit 262cd3a).
- Athletic Iris: owner approval → in-game check → merge.

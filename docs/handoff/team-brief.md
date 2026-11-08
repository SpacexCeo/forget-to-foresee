# Forget to Foresee: art + tech team brief (read fully before working)

Repo: /home/user/forget-to-foresee (branch integration/slice-frkc4d). Read CLAUDE.md, docs/decisions.md (esp. sections 4-5),
docs/spec.md, docs/art/brief.md, docs/art/manifest.md, docs/art/review/ and game/src/scenes/layout.js (the world layout is the
source of truth: plaza r 9 m, camps on a 30 m ring, walk 1.7 m/s, anchor zones on the plaza rim, balcony 120 deg / 46 m).
Everything in the repo is ENGLISH (code, comments, docs, game text). Owner wants an AAA feel: take inspiration from big studios'
published techniques (e.g. Naughty Dog/Guerrilla/Remedy GDC talks: GTAO, TAA, volumetric fog, flipbook VFX, trim sheets,
secondary motion) and adapt them to Three.js in the browser (min spec RTX 2060 Super). Hybrid art direction: faceted
low-poly silhouettes readable from the isometric camera + detailed PBR. The Guests are truly ALIEN (no Arrival heptapods):
nacre-crystal bodies, sail/fin membranes, they draw round logograms.

## GPU servers (RTX 5090, 32 GB). Blender 4.5.3 at /usr/local/bin/blender (has Pillow+numpy), node 22, gltf-transform 4.5, toktx 4.4.
Tools (absolute paths, run from Bash):
- `JKID=<yourname> <scratchpad>/jx/jr "<shell cmd>" [timeoutSec<=110]`  runs on SERVER 1. ALWAYS set JKID to your own agent name
  (each name = its own Jupyter kernel; a kernel runs one request at a time).
- `JKID=<yourname> <scratchpad>/jx/jr2 "<shell cmd>" [timeoutSec]` runs on SERVER 2 via ssh from server 1 (may not be available yet:
  if it says Permission denied, use server 1 only).
- `<scratchpad>/jx/jget /root/<path> <local path>` download a file from server 1; `<scratchpad>/jx/jput <local> /root/<path>` upload to server 1.
  For server 2 files: scp them to server 1 first (jr "scp -i /root/.ssh/to_5090b -P 3018 root@n1.de.clorecloud.net:/path /root/...").
- Long jobs: ALWAYS `nohup ... > /root/logs/<you>_<job>.log 2>&1 &` and poll the log with short jr calls. A jr call never
  blocks more than ~110 s.
- Server workspace: your own clone `/root/w/<yourname>` (create: `git clone -q /root/ftf /root/w/<yourname> && cd /root/w/<yourname> && git fetch -q https://github.com/SpacexCeo/forget-to-foresee.git integration/slice-frkc4d && git checkout -q FETCH_HEAD`).
  Upload your edited scripts there with jput. Never touch other agents' dirs, /root/ftf or /root/raw.
- Keep the GPU busy: bakes and Cycles renders on OPTIX (art/common/ftf_pipeline.py or art/common/ftf.py have use_gpu).
  Several Blender jobs in parallel are fine (32 GB VRAM, 24 cores, 128 GB RAM).
- KTX2 compression: `/root/tools/compress-glb.sh in.glb out.glb <asset-name>` (texture names must be <name>_basecolor/_orm/_normal).
- Shared pipeline helpers: art/common/ (ftf_pipeline.py, ftf.py). Existing procedural examples: art/anchor, art/camps, art/agents, art/shells.

## Rules
- Work ONLY inside the paths you own (listed in your task). Do NOT run git (no add/commit/push/checkout/stash): the lead commits.
- Do not edit game/src/game/engine.js or prototype-2d/ (parity tests). `cd game && npm test` must stay green if you touch game code.
- Every shipped asset: procedural Blender source in art/<asset>/, glb in game/public/assets/models/<exact name>.glb (KTX2+meshopt),
  QA renders in docs/art/qa/<asset>/ (jpg, keep total small: <=8 renders, <=300 KB each), and a manifest row text in your final report.
- Budgets (doubled brief): hero runtime <=16k tris, _inspect <=60k, characters <=16k, props <=4k each, camp <=24k, island <=120k.
- No secrets in files. No third-party assets unless CC0 and recorded with source URL.
- Final report (<=250 words): files produced (paths), triangle counts, what you verified (with numbers), what is not done.
  Write it also to <scratchpad>/reports/<yourname>.md.

## Style addendum (owner, 07.11): inspired by Elden Ring's art direction — adapt, never copy
Take the *principles*, not any asset, character, symbol, layout or name: monumental scale and melancholy grandeur;
weathered, eroded, ancient stone with moss and lichen in crevices; golden-hour light, warm gold haze against cool blue-grey
shadows; one luminous sacred landmark dominating the skyline (for us: the iridescent Shells and the floating glyph, glowing
gold/nacre); strong silhouettes readable from far away; ruined grandeur (cracked arches, toppled columns, overgrowth);
restrained, desaturated palette with gold accents; fog layering for depth; worn cloth with frayed edges; ornate but
functional metalwork; creatures that feel ancient and unknowable. Characters: weathered garments, layered cloth, heavy
silhouettes. No Erdtree, no recognisable FromSoftware motifs, glyphs or character designs.

## Server 2 is now available (07.11 15:35)
`JKID=<you> jr2 "<cmd>"` works. Setup (Blender 4.5.3 + Pillow/numpy/scipy, node 22, gltf-transform, toktx, /root/ftf clone,
/root/tools/compress-glb.sh) is installing; ready when `/root/logs/setup.log` on server 2 ends with SETUP_DONE.
Load balance: agents guests, characters, fauna -> run GPU jobs on SERVER 2; island, heroes, props, vfx, lookdev, audio -> SERVER 1.
Move results from server 2 to server 1 with scp (key /root/.ssh/to_5090b on server 1; from server 1:
`scp -i /root/.ssh/to_5090b -P 3018 root@n1.de.clorecloud.net:/root/w/<you>/file /root/w/<you>/`), then jget.

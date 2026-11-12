# Task for the local Claude Code on the owner's PC (RTX 2060 Super): the GPU host after the rented server stopped

The rented RTX 5090 server is off. This PC takes over its two jobs: real-GPU browser captures of the game and
Blender work. Work in the terminal; push results to the branch `claude/local-gpu`; report briefly at the end
(paste to the lead session). English in the repo, no secrets, nothing copied from other games.

## 1. Setup (once)
1. Install: Git, Node.js 22 LTS, Python 3.11+, ffmpeg, Blender 4.2 LTS (add `blender` to PATH), Chrome or Edge.
2. `git clone https://github.com/SpacexCeo/forget-to-foresee.git` then `git checkout -b claude/local-gpu origin/main`.
3. `cd game && npm ci && npm test` (all green) and `npx playwright install chromium` only if no system Chrome is found.
4. GPU check: `npx vite build --base=/forget-to-foresee/` then `npx vite preview --base=/forget-to-foresee/ --port 4173`,
   open http://localhost:4173/forget-to-foresee/ in Chrome: the town loads; `chrome://gpu` shows WebGL hardware-accelerated.
   In scripts, launch Playwright with `headless: false` or `--use-angle=d3d11` so the real GPU is used.

## 2. Jobs, in order
1. **Rain clip** (weather is on main): run the capture the weather worker wrote (look in `art/weather/` or `art/combat/` for
   `*rain*.mjs`; otherwise film with `?weather=rain&tod=dusk` over the square, slow dolly, 15 s, 1280×720, 30 fps)
   → `docs/art/weather/rain.mp4` + 3 stills.
2. **60 fps animation films** of the new Iris clips: `node art/anim/iris_film.mjs loco|cast|combat` (see
   `docs/art/animation-pipeline.md`), at 60 fps on this GPU → `docs/art/iris_anim/*_60fps.mp4`.
3. **Trailer v4** with the new HUD, phone controls, music and weather: re-capture the scenes the trailer script uses
   (`art/combat/*.mjs`, `python3 art/combat/trailer.py`) → `docs/submission/trailer_v4.mp4` (+ vertical 15 s).
4. **Blender queue**: do every open item in `docs/handoff/local-gpu-queue.md` (cloud workers add Blender jobs there:
   bakes, renders, model fixes). For each: run the named script with `blender -b <file> -P <script>`, commit the outputs
   the item names, tick the item.

## 3. Rules
- Commit after each job and push `claude/local-gpu` right away; never push to `main`.
- Only use 8 GB of VRAM wisely: one Blender job or one capture at a time; lower Cycles samples if it runs out of memory.
- Report: list of commits, clip paths, anything that failed and why.

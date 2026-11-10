# Task J3 report: the jury video (paused 09.11 ~10:30 UTC on the owner's wrap-up order)

Branch `claude/jury-video` (worker J3). Storyboard and facts: `docs/submission/jury-video.md` (v1 storyboard, v2 two
pillars, **v3 the cinematic test**, the verified-facts table). Plates come back on `claude/jury-plates`; the owner's look
references are on `claude/jury-video-ref` (`docs/submission/jury-video-ref/`, README items 1–8, `layers/`).

## Where it stands

The owner rejected the motion-graphics drafts (v1/v2) and set a final directive: **the world comes first**. That means a
cinematic trailer on in-engine footage, with the data anchored in depth. The **18.5 s cinematic test** (two chapters: I ·
The Agents, II · The Memory Shard) is built and runs end to end. Its final 4K render is not done yet.

### Done
- **Storyboard v3** (`docs/submission/jury-video.md`, section "v3: the cinematic test"). Seven in-engine shots: fly-in,
  clans-back, clans-front, conflict, shard-macro, token, proof. Each has its camera, environment and data layer, and
  each element is marked real / data layer / new art.
- **Script** `tools/capture/shots/jury-test.mjs` (`--check` green, 18.5 s). The data comes from
  `game/cine/jury-data.json`, written by `tools/capture/jury-data.mjs` from the engine, the judge playthrough, the deployment
  record and the shard contract's SVG.
- **Depth-anchored layers** `game/src/cinematic/layers.js` (a shot's `layers`), projected through each frame's camera on
  the virtual clock. The components follow the owner's style sheet:
  - `lockup`: the ring lockup with a subtitle;
  - `clanCard`: frosted glass with the clan material from `game/cine/jury-ds.js`; the card nearest the centre leads;
  - `transfer`: Event A, the shard on a violet→frost silk thread with a spool and "13 SILK";
  - `quote`: Event B, Salt's "It is a weapon" with a reticle disc;
  - `fracture`: Event C, the 16 silk moves Amber → Ash, then the tie cracks with a spark and amber flakes;
  - `panel`: "Minted on NEAR testnet", the contract SVG drawing itself, the real fields;
  - `seal`, `node`, `screenLink` (the dotted "same" link to "leaf #3 / ftf-seasons"), `crumb` (Iris · Memory rail),
    `rule` ("to see the future first"), `sign`, `cracks`, `text`.
- **Clean plates + CPU layers pass.** With `FTF_NO_LAYERS=1` the GPU renders clean plates and records each frame's
  view-projection and the tracked heads (`layerLog` in `<shot>.json`). `tools/capture/layers-pass.mjs` then draws the
  layers over the plate frames on CPU (`game/cine/layers.html`). The frosted glass blurs the real world, and a per-shot
  film grade is applied to the plate only. Restyling never needs the GPU again.
- **Capture-only look** (runner actions; the game's defaults are unchanged):
  - `look`: a time-of-day preset plus atmosphere overrides, a mood tint, `lanterns` (light-spill scale) and `clampHdr`;
  - `dof`: a BokehPass refocused every frame on a world point.
  
  The test uses an overcast dusk (sun at 7°, cool, thin fog, exposure 0.35, grey-green tint), lanterns at 0.6, and DOF on
  the shard and token shots.
- **Bugs found and fixed:**
  - Push cameras were static. Their `from` position overwrote the segment start, so every push camera in every video sat
    at its end pose.
  - The `forget` action found no memory button. It now opens the Memories panel itself and picks the memory by kind.
  - Hot reload during capture is now stubbed.
  - Black squares in round 3: an Inf/NaN in the HDR target is spread by the bloom.
    - **HDR guard**, `game/src/render/hdr-guard.js`. It is now in the game's post chain by default, after the god rays and
      before the bloom (commit 262cd3a, to be merged to main separately).
    - **Black-block gate** in the frame check (connected pure-black rectangles in a lit frame: re-render, then fail).
- **Tools:**
  - `tools/capture/gpu-job.sh`: new `FTF_FORMAT=<W>x<H>@<fps>` option.
  - `tools/capture/jury-composite.sh`: the server-side composite (layers pass, assembly, 1080p downscale).
  - `tools/capture/contact-sheet.mjs`.
  - `tools/capture/lib/page.mjs` and `lib/compose.mjs`: page shots and the ffmpeg luma check.
- **Earlier, still usable:**
  - the v2 motion-graphics scenes `game/cine/jury.html` / `jury.js` and the 60 s v2 script `shots/jury.mjs`;
  - the two-pillar draft `docs/media/jury-pillars-draft.mp4` (rejected as the visual direction).
- Previews in `docs/media/jury-test/`:
  - `early-look-gpu-plates.jpg`: round 1;
  - `overcast-dusk-look-cpu.png` and `shard-token-look-cpu.png`: the look on CPU;
  - `round3-look-with-layers.jpg`: conflict and token over the round-3 GPU plates.

### Not done
- **Deliverables A–F** of the owner's final directive:
  - A: the revised 18.5 s test video;
  - B: clean plates;
  - C: UI components as separate files;
  - D: transition specs;
  - E: the authenticity table (real / newly rendered / generated reference);
  - F: the mobile readability test.
- **The 4K composite** and the final 18.5 s test video.
- **The full 60 s** (the directive says: not before the 18.5 s test is approved).
- **The shard fracture**, the owner's six-step choreography. The test only draws cracks over the real `shard.glb`, with
  the two real future signs rising out of it. A real fracture would be a newly rendered element.
- **The owner's card art and badges:** Salt, Iris, Frost, Ash and Amber were sent; Moss is missing; the badges were sent
  inline only. All six cards and all badges use procedural art for now.
- **The guest/emerge GPU hang** (the original capture defect 1) is not investigated. The test does not use the Guests.

## Plates rounds (GPU, owner's RTX 4090, routed by the lead)

| Round | Commit | Server folder | Proxies on `claude/jury-plates` | State |
|---|---|---|---|---|
| 1 | 44ed2fd | `/root/ftf-media/jury-test/` | `docs/media/plates/jury-test-44ed2fd/` | old framing, old light |
| 2 | 5b64ae9 | `/root/ftf-media/jury-test-2/` | `docs/media/plates/jury-test-5b64ae9/` | new framing, old light |
| 3 | 8e35537 | `/root/ftf-media/jury-test-3b/` | `docs/media/plates/jury-test-8e35537/` | dusk look; **black squares** in fly-in, clans-back, clans-front, shard-macro, proof; conflict and token clean |
| 4 | 45ac336 (main head, Iris v7) | `/root/ftf-media/jury-test-4/` on order 2423705 | `docs/media/plates/jury-test-45ac336/` (log excerpt and two stills only) | rendered clean on 09.11 (0 runner errors, no black-block re-render, retries only on proof frame 17, ANGLE gl-egl without a context loss), then the order expired 48 min later before the proxies were pulled: masters, json and proxies lost. Re-run from the head on the next server; pull each shot as it finishes |

The 4K masters (98–234 MB per shot) stay on the server. The proxies are 1080p mp4 files plus the json files (with
`layerLog`) plus mid stills.

## Next steps (exact)
1. **Check the round-4 proxies.** Fetch `claude/jury-plates`. Run the black-block detector (the same rule as
   `runner.js` `blackBlock`, pure black < 3 on a 48×27 grid, rectangular fill ≥ 0.9, > 1% of the frame) and look for
   light shafts. If anything is wrong, re-run the plates:
   `FTF_FORMAT=3840x2160@30 FTF_NO_LAYERS=1 bash tools/capture/gpu-job.sh <commit> /root/ftf-media/jury-test-5 jury-test`
2. **Iterate on the 1080p proxies locally.** Copy them as `<shot>.mp4` plus `<shot>.json` into
   `<dir>/jury-test-1920x1080-ultra/`, then:
   `node tools/capture/layers-pass.mjs jury-test <plates> <out>/jury-test-1920x1080-ultra --width 1920 --height 1080`
   (it starts its own dev server, or pass `--base`), then
   `node tools/capture/capture.mjs jury-test --resume --width 1920 --height 1080 --fps 30 --tier ultra --work <out> --out <final>`,
   then `node tools/capture/contact-sheet.mjs <final>/jury-test.mp4 sheet.jpg`.
3. **The 4K master on the GPU server** (via the lead), from the same commit as the plates:
   `bash tools/capture/jury-composite.sh jury-test /root/ftf-media/jury-test-4/work/jury-test-3840x2160-ultra /root/ftf-media/jury-test-4/final 3840x2160 30`.
   It writes `jury-test.mp4` (4K, crf 18; it must stay under 100 MB for GitHub, otherwise keep it server-only) and
   `jury-test-1080p.mp4`.
4. Then deliverables A–F, the shard fracture element, and after approval the full 60 s on the same system. The two pillars
   and the support beats are in jury-video.md v2; port them to in-engine shots with layers.

## Open notes
- **Iris silk 63 at trial 1** (lead, `?demo=judge&mode=walk`): every clan starts at 60 in the engine (`newSeason`);
  the +3 at trial 1 is not yet explained. The cards show **no** silk numbers. The 59/57/53/46 in the owner's directive
  were a mid-animation frame of my 2D draft, not game data.
- **Event lines** are in the serif (done, bb70814); SILK stays in spaced caps.
- **The Iris · Memory rail** contrast is raised (done, bb70814). Check it on the next proxies.
- **Iris** is out of every close-up (the hair cards, and the owner's sportswear re-dress). Re-render any shot that shows
  her once the art fix lands.
- **The fly-in** rises into the low sun on purpose (silhouettes). Watch for glare on the 4K plates.
- The HDR-guard commit 262cd3a is meant for main on its own.
- **Real / generated:** every gameplay pixel is in-engine. The layers are programmatic and use real data. The owner's
  AI frames are references only, not used in any frame.

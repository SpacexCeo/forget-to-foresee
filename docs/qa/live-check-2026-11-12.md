# Live check, 12 Nov 2026 (jury-readiness worker)

Live site https://spacexceo.github.io/forget-to-foresee/?demo=judge&mode=walk, headless Chromium on **software GL
(SwiftShader, no GPU)** in a datacenter container. A real GPU is much faster; these numbers are a floor, not a target.

## Load (boot marks from `window.__ftfBootMarks`, ms from navigation)

| Device | first frame | town revealed (`done`) | requests / MB until ready | fps after 8 s |
|---|---:|---:|---|---:|
| Desktop 1280×720 | 5,115 | 19,224 | 165 / 36.5 | ~8 |
| iPhone 13 (emulated) | 3,348 | 10,427 | 164 / 27.8 | ~9 |

MB counts `content-length` of responses; the jsDelivr mirror and cached fonts can change it.

## Judge path (README), live

| Step | Result |
|---|---|
| Title + premise lower-third (first 5 s) | shown (after this branch is deployed) |
| 1 Walk to the altar, E | Trial 1 of 17, Silk 63 |
| 2 G, wait until Iris stops, E | Silk 53 (keys pressed while she is still walking do nothing; at ~5 fps the walk takes minutes) |
| 4 | Trial 4 of 17, Silk 72 |
| 5–6 Forget the Call at trial 4, T to trial 6 | toast "Minted on NEAR testnet", card token `793f6c05e89839f2-7` |
| Shard shortcut (Memories, trial 1) | card `793f6c05e89839f2-7`, owner `lambada_eth.testnet`, leaf #3, "minted by the coordinator, not by your session", nearblocks link |
| Replay link | 19 of 19 commands replayed; "The replayed root equals the root committed on NEAR testnet" |
| Holder access, judge account | 4 tokens (3 shards, 1 agent card), "Unlocked: Shard keeper", title and portrait ring in Profile |
| Page errors / 4xx | none |

## Accessibility (axe-core 4.10, WCAG 2 A/AA)

Town screen, game menu, NFTs tab: no violations after the XP-bar label fix (one `aria-progressbar-name`).

## Not covered

Firefox and Safari (only Chromium is installed here); a real phone GPU; screen-reader walkthrough.

## Final run, 12.11 ~03:50 Kyiv (live, after the premise deploy)

Premise and goal chip shown at 23 s; trial 1 silk 63; at the pad, once Iris stopped, E gave silk 53; no page errors, no
4xx. On software GL the end of a trial can take over a minute after T (keys pressed meanwhile are ignored), so the
scripted run fell out of step after trial 1 and forgot no memory; the full path to the "Minted on NEAR testnet" toast and
card `793f6c05e89839f2-7` passed in the earlier run tonight (table above). A judge with a GPU is not affected; on a
software renderer, wait for the trial counter to change before pressing T again.

## Phone low tier with CPU throttling (12.11 ~04:30 Kyiv, current main built locally)

Pixel 7 emulation (412×839, pixel ratio 1, tier `low`), CDP CPU throttling 4×, software GL. The fps value is bounded by
the software renderer (~7 fps even unthrottled here), so read the draw calls and triangles, which a real phone GPU pays.

| Where | fps | p95 ms | draw calls | triangles rendered |
|---|---:|---:|---:|---:|
| Town street at the spawn | 7.3 | 250 | 107 | 298k |
| Outside the lower gate, 12–15 m from the first skitter pack (11 monsters alive) | 6.3 | 250 | 166 | 410k |

Biggest visible groups outside the gate (triangles before frustum culling, meshes): town terrain 70k (9); Iris 34k (23);
town blocks gate / square / mid 34k / 33k / 32k; temple 27k; every townsperson 16k in one mesh, and they stay visible
while Iris is outside the walls.

Hot spots filed with the lead: townsfolk at 16k triangles each on the low tier and still drawn from outside the walls
(distance cull or a lower LOD); +59 draw calls and +112k triangles when stepping outside (town blocks behind Iris stay
in the frame); Iris at 23 meshes / 34k triangles on a phone.

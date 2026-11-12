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

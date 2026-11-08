# Server inventory

Owner rule: nothing produced on a rented server may be lost. Everything rebuildable is in git (sources,
scripts, built models, QA). This lists the important files that exist **only on the server**. Never
stop or close a server while it holds a server-only item the owner has not downloaded.

## Clore order 2419013 (server 50256, RTX 4090), checked 08.11 19:10 UTC

| Path | Size | sha256 | Produced by | Where |
|---|---|---|---|---|
| `/root/ftf-media/vk1080/demo-captions.mp4` | 65 289 520 | `14b94ecf607562ab58f38242a2ea772e86c376b2f1363687046d29cd85ba9452` | `tools/gpu-server/vkall.sh` on b7e310b | server-only (captionless version in git at 838b4e1, `docs/media/`) |
| `/root/ftf-media/vk1080/trailer-captions.mp4` | 24 987 872 | `d64907ed44f5dd55991945a684c7a2cc38947d60c7ef666777d9ef917048935f` | same | server-only |
| `/root/ftf-media/vk1080/clip-shell-captions.mp4` | 11 738 673 | `960d21fc43a7a2e9c064a6e947c775280bbbf802fbdcbc5ece8c75568aa652bb` | same | server-only |
| `/root/ftf-media/vk1080/clip-memory-captions.mp4` | 13 403 900 | `4320bba57865b6120a81bc3d595fed37bc6ae10a2c644af2e8fd8dca224414a6` | same | server-only |
| `/root/ftf-media/vk1080/clip-verified-captions.mp4` | 14 143 171 | `a1967103318828e8fe2d487161308d9e6bed895d01bebc6c0e640d47024bb6de` | same | server-only |
| `/root/ftf-media/vk4k/*` | in progress | — | `vkall.sh`, 3840x2160 60 fps ultra, b7e310b | server-only (4K masters, not for git) |
| `/root/w/shell_1_r2_raw.glb` | 32 558 172 | `49561ea96717f317de62d73d724c0002125e07928691b9c2253b20db30bad9a9` | `art/shells/build_shells.py` (r2), before KTX2/meshopt | server-only, rebuildable (about 1 h GPU each) |
| `/root/w/shell_2_r2_raw.glb` | 25 829 292 | `1289338b2eb83832d305ccf1b957bb743484ae2aa756e9a36839010b1a0a5724` | same | server-only, rebuildable |
| `/root/w/shell_3_r2_raw.glb` | 27 878 568 | `b2b3d5311932a0b607b8cc5526d86ce6cca913d6e31a48776893f57fadcd97e3` | same | server-only, rebuildable |
| `/root/w/shell_4_r2_raw.glb` | 28 824 972 | `f61a1f36a9886ca87111ad8b93914236cf544e28446dc2044aeada2071fd2753` | same | server-only, rebuildable |
| `/root/w/amber_blowout_evidence.png` | 1.3 MB | `501fc8385506ac5bce8e4aa7c31f2b5250966115c5e9885ee5a28dac714e34b9` | Task J capture, Amber camp over-exposed at ultra | server-only (look-dev evidence) |

Not listed (rebuildable or public, safe to lose): git clones `/root/ftf*` (no unpushed commits;
`ftf_o`'s modified `guest.glb` equals the one in git), frame caches `/root/ftf-media/{vkwork,vkwork4k,work,test,bisect-*}`,
`/root/w/nv` and the NVIDIA installer (public download), `_raw` agent glbs (rebuilt by `build_agents.py`),
old transfer bundles `/root/w/*.tgz`, `/root/r5.tgz`, `/root/r6.tgz`.

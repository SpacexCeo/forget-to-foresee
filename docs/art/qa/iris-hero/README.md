# Iris hero: QA

Built by `art/agents/iris_hero/build_iris_hero.py` on the RTX 4090 (commit 73b598a), rendered by
`qa_hair.py` (Cycles, master groom) and screenshot in the game on real WebGL (Chromium, ANGLE Vulkan).

- `master_*`: the Hair Curves master (about 30k tapered strands, 420 strand groups, a narrow parting,
  combed back into a low tie, a volumetric tail), front, three-quarters, profile, back, crown, hairline,
  strands. The master lives in the build `.blend` (`Hair_Master` collection), not in the game.
- `ingame_*`: `agent_iris.glb` in the game: the hair is cards built from the master's strand groups with a
  strand atlas rendered from master-style strands.

Counts of the shipped glb: 48,996 triangles, 61 skinned bones, 23 face morphs, 8 clips, 8.0 MB
(KTX2 + meshopt). Known issues: in Cycles previews the cards render too dark (many alpha layers; the game
uses an alpha test and looks right); finger tips touch the coat's front panels at hip height.

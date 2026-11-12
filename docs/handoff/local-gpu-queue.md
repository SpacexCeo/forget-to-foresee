# Local GPU queue (owner's PC, RTX 2060 Super)

Cloud workers: add Blender/real-GPU jobs here as unchecked items (script, inputs, outputs, acceptance). The local
executor (docs/handoff/local-gpu-task.md) runs them in order and ticks them.

- [x] (done 12.11, 596e41f: low bun, sheet docs/art/agents/c001_moh_hair_fix.jpg) Moss clan agent: hair strand over the nose. Script: art/townsfolk (cast.py AGENTS["clan_moh"] hair
  ("chestnut","long_side") — switch to a style without a front lock, e.g. ("chestnut","long"), or trim the side lock in
  tf_wardrobe.py hair()), rebuild with the townsfolk pipeline for key clan_moh, publish townsfolk_clan_moh.glb ->
  game/public/assets/models/agent_moh.glb. Acceptance: face close-up shows no hair crossing the nose or mouth; the rest of
  the agent unchanged; npm test green.

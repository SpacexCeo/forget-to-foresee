# Iris hero reference (owner, 09.11)

Inputs from the owner for the Iris hero-character rework. Reference only: nothing in this folder ships in
the game build.

- `iris-hero-reference.webp`: the target look. Stylized realism: realistic anatomy with slightly stylized
  eyes, soft skin with tone variation, chestnut hair in volumetric strands, a long open charcoal wool coat
  with a smoky trim and a shoulder capelet, a near-black navy dress, a dusty-violet scarf with a fringed
  tail, a silver pendant, a leather belt with a cognac pouch, laced brown-black boots.
- `create_scrollkeeper_character.py`: the owner's procedural Blender 4.0+ blockout of that costume and
  its proportions (body, face, hair, clothing, accessories and a stage in named collections). It is a
  proportion and costume blockout, not a game-ready mesh: no rig, UVs, shape keys or export.

The owner's suggested pipeline: a human base from MPFB (MakeHuman Plugin for Blender), face refined in
Sculpt Mode with slight asymmetry, mesh-strand or hair-card hair, clothing as separate objects with
thickness, seams and folds, a skeleton with face shape keys and extra cloak bones. Targets: 25-50k
triangles with clothing, 2K textures for the main materials, 60-100 bones, 15-30 face shape keys, glTF 2.0.

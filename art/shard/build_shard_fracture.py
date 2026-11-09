"""shard_fracture.glb: the memory shard breaking open, a cinematic element for the jury video.

The crystal of shard.glb (same rings, lean, broken tip and chipped shoulder from build_shard.py) is cut
into Voronoi cells. Every cell is convex (the crystal is a convex solid, each cell is the crystal
clipped by the half-spaces closer to its seed), so the pieces fit back together exactly. One glTF
animation, `fracture` (4.0 s at 30 fps), moves the pieces as nodes (no skin):

    0.0-0.6 s  intact, a breath of light from inside (pieces still)
    0.6-1.2 s  cracks open: every piece eases 1-2 mm out along its seed direction
    1.2-2.4 s  split: the pieces part 2.5-7.5 cm, the top ones rise a little, each turns 8-30 deg
    2.4-4.0 s  hold: the pieces hang apart and drift slowly (room for the two future signs inside)

Pieces carry two materials: the crystal outside (frosted glass, like shard.glb) and the fracture
faces inside (pale nacre with a faint gold self-light, the "thin gold edges" of the owner's frame).
The clasp is left out: the element is shown alone over the video plate.

    blender -b --factory-startup -P art/shard/build_shard_fracture.py -- build
    blender -b --factory-startup -P art/shard/build_shard_fracture.py -- render   # QA stills
"""

import json
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO, "art", "common"))
import ftf_pipeline as P  # noqa: E402
import build_shard as S  # noqa: E402  (geometry only; its build stage does not run on import)

P.set_tag("shard_fracture")
ASSET = "shard_fracture"
GLB_PATH = os.path.join(REPO, "docs", "media", "elements", f"{ASSET}.glb")
QA_DIR = os.path.join(REPO, "docs", "art", "qa", ASSET)
FPS = 30
SEEDS = 13
CRYSTAL = (0.74, 0.84, 0.80)
INNER = (0.86, 0.90, 0.92)
GOLD = (1.00, 0.74, 0.36)


def crystal_bm():
    bm, _ = S.main_crystal_bm(random.Random(1107))
    return bm


def seeds_inside(planes, rng, n):
    """Seeds spread through the crystal, denser toward the broken tip (where the vision breaks out)."""
    out = []
    while len(out) < n:
        z = 0.02 + 0.40 * rng.random() ** 0.8
        c = S.lean(z) + Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), z))
        if S.inside(planes, c, 0.004) and all((c - o).length > 0.035 for o in out):
            out.append(c)
    return out


def cell(src, seed, others, inner_mat):
    bm = src.copy()
    for o in others:
        mid = (seed + o) / 2
        S.cut(bm, mid, o - seed, inner_mat)
    return bm


def material(name, color, rough, transmission=0.0, emit=None, strength=0.0):
    m = P.mat_simple(name, color, rough=rough, emit=emit, emit_strength=strength)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Transmission Weight"].default_value = transmission
    b.inputs["IOR"].default_value = 1.5
    m.use_backface_culling = True
    return m


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def stage_build():
    sc = P.reset_scene()
    sc.render.fps = FPS
    col = P.new_collection("Export")
    rng = random.Random(4405)
    m_out = material("M_ShardFracture_Crystal", CRYSTAL, 0.18, transmission=0.82)
    m_in = material("M_ShardFracture_Inner", INNER, 0.30, transmission=0.55, emit=GOLD, strength=0.25)
    src = crystal_bm()
    for f in src.faces:
        f.material_index = 0
    tmp = bpy.data.meshes.new("tmp")
    src.to_mesh(tmp)
    probe = bpy.data.objects.new("probe", tmp)
    planes = S.crystal_planes(probe)
    seeds = seeds_inside(planes, rng, SEEDS)
    centre = S.lean(0.22) + Vector((0, 0, 0.22))
    pieces, stats = [], {"seeds": len(seeds), "pieces": []}
    for i, s in enumerate(seeds):
        bm = cell(src, s, [o for j, o in enumerate(seeds) if j != i], 1)
        if not bm.faces:
            bm.free()
            continue
        c = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
        for v in bm.verts:                       # each piece pivots on its own centre
            v.co -= c
        o = P.bm_object(f"piece_{i:02d}", bm, m_out, col)
        o.data.materials.append(m_in)
        P.triangulate_ngons(o)
        P.finish_shading(o, flat=True)
        P.smart_uv(o, margin=0.004)
        o.location = c
        pieces.append((o, c))
    bpy.data.objects.remove(probe)
    # animation: one action per piece, NLA-free (the exporter merges same-named actions into `fracture`)
    end = int(4.0 * FPS)
    for k, (o, c) in enumerate(pieces):
        d = (c - centre)
        d.z *= 0.6
        d = d.normalized() if d.length > 1e-6 else Vector((0, 0, 1))
        far = 0.025 + 0.035 * rng.random() + 0.015 * max(0.0, (c.z - 0.22) / 0.2)
        lift = 0.012 * max(0.0, (c.z - 0.15) / 0.3)
        turn = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
        ang = math.radians(rng.uniform(8, 30))
        drift = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0, 1))) * 0.008
        o.animation_data_create()
        o.animation_data.action = bpy.data.actions.new(f"fracture_{o.name}")
        o.rotation_mode = "XYZ"
        for f in range(0, end + 1, 2):
            t = f / FPS
            crack = 0.0015 * ease((t - 0.6) / 0.6)
            split = far * ease((t - 1.2) / 1.2)
            hold = max(0.0, t - 2.4) / 1.6
            o.location = c + d * (crack + split) + Vector((0, 0, lift * ease((t - 1.2) / 1.2))) + drift * hold
            a = ang * ease((t - 1.2) / 1.2) + ang * 0.15 * hold
            o.rotation_euler = Euler((turn.x * a, turn.y * a, turn.z * a))
            o.keyframe_insert("location", frame=f)
            o.keyframe_insert("rotation_euler", frame=f)
        o.location = c
        o.rotation_euler = (0, 0, 0)
        tr = o.animation_data.nla_tracks.new()
        tr.name = "fracture"
        tr.strips.new("fracture", 0, o.animation_data.action)
        o.animation_data.action = None
        stats["pieces"].append({"name": o.name, "triangles": P.mesh_tris(o), "travel_m": round(far + lift, 3)})
    sc.frame_start, sc.frame_end = 0, end
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    P.select_only([o for o, _ in pieces], pieces[0][0])
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", use_selection=True, export_yup=True,
                              export_extras=True, export_animations=True, export_animation_mode="NLA_TRACKS",
                              export_force_sampling=True, export_cameras=False, export_lights=False)
    stats["triangles"] = sum(p["triangles"] for p in stats["pieces"])
    stats["glb_bytes"] = os.path.getsize(GLB_PATH)
    stats["seconds"] = end / FPS
    os.makedirs(QA_DIR, exist_ok=True)
    with open(os.path.join(QA_DIR, "build-stats.json"), "w") as fh:
        json.dump(stats, fh, indent=2)
    P.log("stats", json.dumps({k: v for k, v in stats.items() if k != "pieces"}))


def stage_render(res=720, samples=24):
    sc = P.reset_scene()
    P.setup_render(sc, res=res, samples=samples)
    sc.cycles.transmission_bounces = 12
    P.use_gpu(sc)
    sc.render.image_settings.file_format = "JPEG"
    env = P.new_collection("Env")
    P.add_lights(env)
    w = sc.world
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.055, 0.07, 1)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    cam = P.add_camera("cam", (0.55, -0.85, 0.40), (0.0, 0.0, 0.22), lens=60)
    sc.camera = cam
    os.makedirs(QA_DIR, exist_ok=True)
    for sec in (0.0, 1.0, 1.8, 3.5):
        sc.frame_set(int(sec * FPS))
        sc.render.filepath = os.path.join(QA_DIR, f"{ASSET}_{sec:.1f}s.jpg")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    {"build": stage_build, "render": stage_render}[argv[0] if argv else "build"]()

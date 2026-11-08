"""Animation review renders for one clan agent (contact sheet, face close-ups, walk turntable).

    blender -b -P review_anim.py -- <raw agent glb> <out dir> <clan> [face]

With the optional `face` argument only the face close-ups are rendered.

Uses the uncompressed glb (Blender cannot import KTX2). Renders with EEVEE on the GPU.
Outputs: <clan>_anim_sheet.jpg (8 walk + 8 idle + 4 talk), <clan>_face.jpg (idle, blink,
talk jaw open, rest straight on; the `understand` wink row), <clan>_walk_turntable.mp4 (2.5 s, ffmpeg).
"""

import math
import os
import subprocess
import sys

import bpy
from mathutils import Vector
from PIL import Image

argv = sys.argv[sys.argv.index("--") + 1:]
GLB, OUT, CLAN = argv[0], argv[1], argv[2]
FACE_ONLY = len(argv) > 3 and argv[3] == "face"
os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(OUT, "_tmp")
os.makedirs(TMP, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 30          # before the import: the importer maps glTF seconds at the scene fps
bpy.ops.import_scene.gltf(filepath=GLB)
arm = next(o for o in sc.objects if o.type == "ARMATURE")
arm.location = (0, 0, 0)
for o in list(sc.objects):
    if o.name.endswith("_col"):                  # collision proxy capsule
        bpy.data.objects.remove(o)
acts = {a.name.split("|")[-1]: a for a in bpy.data.actions}

sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [
    e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] \
    else "BLENDER_EEVEE"
sc.render.film_transparent = False
sc.view_settings.view_transform = "AgX"
sc.render.fps = 30
w = bpy.data.worlds.new("w")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.32, 0.30, 0.28, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
sc.world = w
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.0
sun.data.color = (1.0, 0.88, 0.70)
sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
sc.collection.objects.link(sun)
fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
fill.data.energy = 1.0
fill.data.color = (0.6, 0.7, 1.0)
fill.rotation_euler = (math.radians(60), 0, math.radians(150))
sc.collection.objects.link(fill)
bpy.ops.mesh.primitive_plane_add(size=8)
gmat = bpy.data.materials.new("ground")
gmat.diffuse_color = (0.18, 0.17, 0.16, 1)
gmat.use_nodes = True
gmat.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.18, 0.17, 0.16, 1)
sc.objects["Plane"].data.materials.append(gmat)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam


def look(loc, target, lens):
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens


def set_action(name):
    arm.animation_data_create()
    arm.animation_data.action = acts[name]
    if hasattr(arm.animation_data, "action_slot") and acts[name].slots:
        arm.animation_data.action_slot = acts[name].slots[0]
    fr = acts[name].frame_range
    return int(fr[0]), int(fr[1])


def render(path, res):
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


tiles = []
cell = (240, 330)
if not FACE_ONLY:
    look((1.9, -3.0, 1.55), (0, 0, 0.95), 50)     # 3/4 front, slightly high
    for clip, n in (("walk", 8), ("idle", 8), ("talk", 4)):
        f0, f1 = set_action(clip)
        for i in range(n):
            f = f0 + round((f1 - f0) * i / n)
            sc.frame_set(f)
            p = os.path.join(TMP, f"{clip}_{i}.png")
            render(p, cell)
            tiles.append((clip, p))
    cols = 8
    rows = 3
    sheet = Image.new("RGB", (cols * cell[0], rows * cell[1]), (20, 20, 20))
    r = {"walk": 0, "idle": 1, "talk": 2}
    cnt = {"walk": 0, "idle": 0, "talk": 0}
    for clip, p in tiles:
        sheet.paste(Image.open(p).convert("RGB"), (cnt[clip] * cell[0], r[clip] * cell[1]))
        cnt[clip] += 1
    sheet.save(os.path.join(OUT, f"{CLAN}_anim_sheet.jpg"), quality=80)


# face close-ups. Row 1: idle rest, idle blink, talk jaw open (3/4), rest straight on (symmetry).
# Row 2: `understand` (study the sign, the aha with the raised finger, the wink 3/4 and
# straight on). Clips missing from an older glb are skipped.
Q34 = ((0.22, -0.75, 1.68), (0, 0, 1.63), 85)
FRONT = ((0.0, -0.78, 1.64), (0, 0, 1.63), 85)
MEDIUM = ((-0.60, -1.25, 1.55), (-0.08, 0, 1.45), 50)
SHOTS = ((("idle", 0, Q34), ("idle", 40, Q34), ("talk", 2, Q34), ("idle", 0, FRONT)),
         (("understand", 14, Q34), ("understand", 32, MEDIUM), ("understand", 43, Q34),
          ("understand", 43, FRONT)))
fs = Image.new("RGB", (1600, 400 * len(SHOTS)), (20, 20, 20))
for row, shots in enumerate(SHOTS):
    for col, (clip, f, (loc, tgt, lens)) in enumerate(shots):
        if clip not in acts:
            continue
        look(loc, tgt, lens)
        set_action(clip)
        sc.frame_set(f)
        p = os.path.join(TMP, f"face_{row}_{col}.png")
        render(p, (400, 400))
        fs.paste(Image.open(p).convert("RGB"), (col * 400, row * 400))
fs.save(os.path.join(OUT, f"{CLAN}_face.jpg"), quality=85)

if not FACE_ONLY:
    # walk turntable: 75 frames, camera orbits once
    f0, f1 = set_action("walk")
    L = f1 - f0
    for i in range(75):
        a = 2 * math.pi * i / 75
        look((3.2 * math.sin(a), -3.2 * math.cos(a), 1.5), (0, 0, 0.95), 50)
        sc.frame_set(f0 + (i % L))
        render(os.path.join(TMP, f"tt_{i:03d}.png"), (360, 420))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "30", "-i",
                    os.path.join(TMP, "tt_%03d.png"), "-c:v", "libx264", "-crf", "28",
                    "-pix_fmt", "yuv420p", os.path.join(OUT, f"{CLAN}_walk_turntable.mp4")], check=True)

print("REVIEW_DONE", CLAN)

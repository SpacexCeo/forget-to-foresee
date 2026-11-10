"""QA of an exported townsperson: import the .glb and render what the game gets.

    blender -b -P qa_glb.py -- <glb> <out_prefix> [clip ...]
Writes <prefix>_turn.jpg (front, three-quarter, back and a face close-up at rest) and, per clip,
<prefix>_<clip>.jpg: eight evenly spaced frames from the side and the three-quarter front.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tf_render as R  # noqa: E402

V = Vector
argv = sys.argv[sys.argv.index("--") + 1:]
glb, prefix, clips = argv[0], argv[1], argv[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
R.setup(samples=32, res=(560, 1000))
R.floor(color=(0.30, 0.29, 0.28))
bpy.context.scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
bpy.context.view_layer.update()
top = max((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
sc = bpy.context.scene
tmp = os.path.dirname(prefix) + "/_tmp_" + os.path.basename(prefix)


def set_clip(name):
    for o in [rig] + meshes:
        tgt = o if o.type == "ARMATURE" else (o.data.shape_keys if o.data.shape_keys else None)
        if tgt is None or not tgt.animation_data:
            continue
        ad = tgt.animation_data
        for tr in ad.nla_tracks:
            tr.mute = True
            tr.is_solo = False
        ad.action = None
        for tr in ad.nla_tracks:
            if tr.name == name or (tr.strips and tr.strips[0].action and tr.strips[0].action.name.split(".")[0].startswith(name)):
                tr.mute = False
                if tgt is rig:
                    return tr.strips[0].action.frame_range
    return None


def lit(angle, scale=1.0, target=(0, 0, 1.0)):
    piv = bpy.data.objects.new("piv", None)
    sc.collection.objects.link(piv)
    ls = R.three_point(scale, target)
    for l in ls:
        l.data.energy *= 0.42
        l.parent = piv
    piv.rotation_euler.z = angle
    return ls + [piv]


def grid(paths, cols, out):
    """Compose with Blender's image API (no PIL in every Blender)."""
    import numpy as np
    ims = [bpy.data.images.load(p) for p in paths]
    w, h = ims[0].size
    rows = (len(ims) + cols - 1) // cols
    canvas = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
    canvas[..., 3] = 1
    for i, im in enumerate(ims):
        a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
        r, c = i // cols, i % cols
        canvas[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = a
    o = bpy.data.images.new("grid", cols * w, rows * h)
    o.pixels[:] = canvas.ravel()
    o.filepath_raw = out
    o.file_format = "JPEG"
    o.save()
    for p in paths:
        os.remove(p)


zc = top / 2
set_clip("idle")
sc.frame_set(0)
paths = []
for i, ang in enumerate((0, 40, 180)):
    a = math.radians(ang)
    ls = lit(a)
    paths.append(R.shot(f"{tmp}_t{i}.png", (math.sin(a) * 8, -math.cos(a) * 8, zc), (0, 0, zc), ortho=top * 1.12))
    for l in ls:
        bpy.data.objects.remove(l)
hb = rig.pose.bones.get("head")
ez = (rig.matrix_world @ hb.head).z + 0.10 * rig.scale.z
ls = lit(0, 0.6, (0, 0, ez))
paths.append(R.shot(f"{tmp}_t3.png", (0.30, -1.05 * rig.scale.z, ez + 0.02), (0, 0, ez - 0.01), lens=100))
for l in ls:
    bpy.data.objects.remove(l)
grid(paths, 4, prefix + "_turn.jpg")

sc.render.resolution_x, sc.render.resolution_y = 380, 680
for clip in clips:
    fr = set_clip(clip)
    if fr is None:
        print("[qa] no clip", clip)
        continue
    f0, f1 = int(fr[0]), int(fr[1])
    paths = []
    for row, ang in enumerate((90, 30)):
        a = math.radians(ang)
        ls = lit(a)
        for i in range(8):
            sc.frame_set(f0 + round((f1 - f0) * i / 8))
            paths.append(R.shot(f"{tmp}_{clip}_{row}_{i}.png", (math.sin(a) * 8, -math.cos(a) * 8, zc), (0, 0, zc), ortho=top * 1.12))
        for l in ls:
            bpy.data.objects.remove(l)
    grid(paths, 8, f"{prefix}_{clip}.jpg")

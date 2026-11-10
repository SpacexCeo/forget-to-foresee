"""QA turnaround sheet of one townsperson: front, three-quarter, side, back and a face close-up.

    blender -b -P qa_sheet.py -- <key> <out_dir> [--clay]
Writes <out_dir>/<key>/{front,q,side,back,face}.jpg, costume.blend and facts.json (triangles, landmarks).
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tf_body  # noqa: E402
import tf_render as R  # noqa: E402
import tf_shading as SH  # noqa: E402
import tf_wardrobe as W  # noqa: E402
from cast import CAST  # noqa: E402
from tf_costume import Ctx  # noqa: E402

V = Vector
argv = sys.argv[sys.argv.index("--") + 1:]
key, out = argv[0], os.path.join(argv[1], argv[0])
os.makedirs(out, exist_ok=True)
e = CAST[key]
bm, rig, eyes, facts = tf_body.build_body(key)
ctx = Ctx(bm, rig, key)
W.dress(ctx, e)
facts["stripped_body_vertices"] = ctx.strip_covered()
objs = [bm, *eyes, *ctx.garments.values()]
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs}
facts["triangles"] = sum(tris.values())
top0 = max(v.co.z for o in objs for v in o.data.vertices)
facts["frame_m"] = round(top0 * 1.10 * facts["export_scale"], 4)
facts["triangles_by_part"] = tris
tf_body.log("costume", key, facts["triangles"], "triangles", len(ctx.garments), "parts")
SH.assign_live(e, rig, bm, eyes, ctx.garments)
json.dump(facts, open(os.path.join(out, "facts.json"), "w"), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "costume.blend"))

R.setup(samples=64, res=(640, 1180))
R.floor(color=(0.30, 0.29, 0.28))
bpy.context.scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
top = max(v.co.z for o in objs for v in o.data.vertices)
zc = top / 2
for name, ang in (("front", 0), ("q", 35), ("side", 90), ("back", 180)):
    a = math.radians(ang)
    piv = bpy.data.objects.new("piv", None)
    bpy.context.scene.collection.objects.link(piv)
    lights = R.three_point(1.0, (0, 0, 1.0))
    for l in lights:
        l.data.energy *= 0.42
        l.parent = piv
    piv.rotation_euler.z = a
    loc = V((math.sin(a) * 8.0, -math.cos(a) * 8.0, zc))
    R.shot(os.path.join(out, name + ".jpg"), loc, (0, 0, zc), ortho=top * 1.10)
    for l in lights:
        bpy.data.objects.remove(l)
    bpy.data.objects.remove(piv)
lights = R.three_point(0.6, (0, 0, 1.62))
for l in lights:
    l.data.energy *= 0.42
ez = rig.data.bones["eye_L"].head_local.z
R.shot(os.path.join(out, "face.jpg"), (0.38, -1.25, ez + 0.03), (0, -0.02, ez - 0.035), lens=110, res=(820, 820))

"""QA: the twelve bare bodies in a line at their real heights (clay), front view. Checks the range of
ages, builds and heights before costumes.   blender -b -P qa_lineup_bodies.py -- <out_dir> <png>"""
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tf_render as R  # noqa: E402
from cast import CAST, ORDER, SKIN  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
out, png = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
R.setup(samples=32, res=(3000, 900))
x = -(len(ORDER) - 1) * 0.75 / 2
for key in ORDER:
    with bpy.data.libraries.load(os.path.join(out, key, "body.blend")) as (src, dst):
        dst.objects = list(src.objects)
    objs = [o for o in dst.objects if o]
    rig = next(o for o in objs if o.type == "ARMATURE")
    for o in objs:
        bpy.context.scene.collection.objects.link(o)
    body = next(o for o in objs if o.name.startswith("body"))
    k = json.loads(body["facts"])["export_scale"]
    rig.scale = (k, k, k)
    rig.location.x = x
    x += 0.75
    m = R.clay("skin_" + key, SKIN[CAST[key]["skin"]][0], 0.6)
    body.data.materials.clear()
    body.data.materials.append(m)
R.floor()
R.three_point(2.2)
R.shot(png, (0, -30, 1.0), (0, 0, 1.0), ortho=9.6)

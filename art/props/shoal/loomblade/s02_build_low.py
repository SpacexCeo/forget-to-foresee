"""Step 2: the game mesh with its UVs. The coded sword gets a hand-built low mesh from the same parts.json (seams on
hard edges and where the builders put them); a replacement source is decimated to the budget and unwrapped by angle.

    blender -b --python s02_build_low.py [-- --tris 3000]

Reads $LB_WORK/high.blend, writes $LB_WORK/low.blend (objects HIGH and LOW) and $LB_WORK/low_report.json.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402

import lb_common as L  # noqa: E402


def unwrap(ob, by_seams):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    if by_seams:
        bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.002)
    else:
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.003)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")


def uv_fill(ob):
    me = ob.data
    uv = me.uv_layers.active.data
    area = 0.0
    for p in me.polygons:
        pts = [uv[i].uv for i in p.loop_indices]
        area += abs(sum(pts[i].x * pts[(i + 1) % len(pts)].y - pts[(i + 1) % len(pts)].x * pts[i].y for i in range(len(pts)))) / 2
    return area


def main():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(L.WORK, "high.blend"))
    high = bpy.data.objects["HIGH"]
    coded = high.get("lb_source") == "coded"
    budget = int(L.opt("--tris", L.SPEC["budget_tris"]))
    if coded:
        parts = [L.build_part(n, False) for n in L.LOW_PARTS]
        counts = {o.name: L.tris(o) for o in parts}
        low = L.join(parts, "LOW")
    else:
        bpy.ops.object.select_all(action="DESELECT")
        high.select_set(True)
        bpy.context.view_layer.objects.active = high
        bpy.ops.object.duplicate()
        low = bpy.context.view_layer.objects.active
        low.name = low.data.name = "LOW"
        low.data.materials.clear()
        mod = low.modifiers.new("dec", "DECIMATE")
        mod.ratio = min(1.0, budget / max(L.tris(low), 1))
        bpy.ops.object.modifier_apply(modifier="dec")
        for p in low.data.polygons:
            p.use_smooth = True
        counts = {}
    low.data.uv_layers.new(name="UVMap") if not low.data.uv_layers else None
    unwrap(low, coded)
    bm = bmesh.new()
    bm.from_mesh(low.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(low.data)
    bm.free()
    n = L.tris(low)
    lo, hi = L.bounds([low])
    report = {"tris": n, "budget": budget, "parts": counts, "uv_fill": round(uv_fill(low), 3), "length_m": round(hi.z - lo.z, 4),
              "size_m": [round(hi[i] - lo[i], 4) for i in range(3)]}
    L.log(report)
    assert n <= budget, f"{n} tris over the budget {budget}"
    json.dump(report, open(os.path.join(L.WORK, "low_report.json"), "w"), indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(L.WORK, "low.blend"))


main()

"""Step 1: the high mesh. Builds every part of parts.json with procedural materials and prints the gap report
(every part must touch the part it attaches to: gap 0), or takes a replacement source mesh instead.

    blender -b --python s01_build_high.py                         # the coded sword
    blender -b --python s01_build_high.py -- --source ultra.glb   # the owner's own generation (any scale / axis)

Writes $LB_WORK/high.blend (one object HIGH) and $LB_WORK/high_report.json.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import lb_common as L  # noqa: E402

GOLD = (1.0, 0.68, 0.24)


def materials():
    m = {}
    # woven flats: two crossing thread families, glow in the grooves between the threads
    k = L.NK("lb_blade_flat")
    x, _, z = k.xyz()
    kk = math.tau / 0.0026
    a = k.math("ABSOLUTE", k.math("SINE", k.math("MULTIPLY", k.math("ADD", x, z), kk)))
    b = k.math("ABSOLUTE", k.math("SINE", k.math("MULTIPLY", k.math("SUBTRACT", x, z), kk)))
    h = k.math("MAXIMUM", a, b)
    groove = k.math("POWER", k.math("SUBTRACT", 1.0, h), 1.5)
    base = k.mix(h, (0.72, 0.46, 0.18, 1), (1.0, 0.84, 0.56, 1))
    m["flat"] = k.finish(base, k.math("MULTIPLY_ADD", groove, 0.25, 0.26), 1.0,
                         emit=k.mix(k.math("MULTIPLY", groove, 0.55), (0, 0, 0, 1), (*GOLD, 1)), height=h, bump=0.6, dist=0.0003)
    # polished pearl-steel bevels, brushed along the length
    k = L.NK("lb_blade_edge")
    n = k.noise(900, 2, 0.5, stretch=(1, 1, 0.02))
    m["edge"] = k.finish((0.93, 0.91, 0.87, 1), k.math("MULTIPLY_ADD", n, 0.08, 0.10), 1.0, height=n, bump=0.08, dist=0.0001)
    k = L.NK("lb_fuller")
    m["floor"] = k.finish((0.30, 0.17, 0.05, 1), 0.45, 1.0, emit=(0.42, 0.22, 0.05, 1))
    # glowing threads: fine fibres along the strand
    for name, glow, scale in (("braid", 1.0, 2600), ("warp", 1.0, 2600), ("bobbin", 0.55, 0), ("wrap", 0.22, 2600)):
        k = L.NK("lb_" + name)
        if name == "bobbin":
            x, _, _ = k.xyz()
            h = k.math("ABSOLUTE", k.math("SINE", k.math("MULTIPLY", x, math.tau / 0.0018)))
        else:
            h = k.noise(scale, 2, 0.6, stretch=(1, 1, 0.12))
        base = k.mix(h, (0.86, 0.60, 0.24, 1), (1.0, 0.84, 0.48, 1))
        em = k.mix(k.math("MULTIPLY_ADD", h, 0.35 * glow, 0.65 * glow), (0, 0, 0, 1), (*GOLD, 1))
        m[name] = k.finish(base, 0.30, 1.0, emit=em, height=h, bump=0.5, dist=0.0002)
    # hand-finished brass: soft patina in the noise lows, a faint hammered surface
    k = L.NK("lb_brass")
    n = k.noise(160, 4, 0.6)
    fine = k.noise(1400, 2, 0.5)
    base = k.mix(k.ramp(n, 0.35, 0.75), (0.50, 0.32, 0.12, 1), (0.86, 0.63, 0.29, 1))
    m["brass"] = k.finish(base, k.math("MULTIPLY_ADD", n, -0.22, 0.46), 1.0, height=fine, bump=0.12, dist=0.0002)
    # leather strip wound in a spiral, with a fine grain
    k = L.NK("lb_leather")
    x, y, z = k.xyz()
    ang = k.math("DIVIDE", k.math("ARCTAN2", y, x), math.tau)
    s = k.math("FRACT", k.math("ADD", k.math("DIVIDE", z, 0.0135), ang))
    strip = k.math("SUBTRACT", 1.0, k.math("POWER", k.math("ABSOLUTE", k.math("MULTIPLY_ADD", s, 2.0, -1.0)), 10.0))
    grain = k.noise(2200, 3, 0.6)
    h = k.math("MULTIPLY_ADD", grain, 0.18, strip)
    base = k.mix(grain, (0.050, 0.030, 0.024, 1), (0.115, 0.070, 0.052, 1))
    base = k.mix(k.math("SUBTRACT", 1.0, strip), base, (0.02, 0.012, 0.01, 1))
    m["leather"] = k.finish(base, k.math("MULTIPLY_ADD", grain, 0.2, 0.58), 0.0, height=h, bump=0.8, dist=0.0007)
    # pearl: milk white with slow pink and teal drifts
    k = L.NK("lb_pearl")
    n1 = k.noise(70, 2, 0.5)
    n2 = k.noise(110, 2, 0.5)
    base = k.mix(k.ramp(n1, 0.45, 0.8), (0.95, 0.93, 0.90, 1), (0.95, 0.80, 0.84, 1))
    base = k.mix(k.math("MULTIPLY", k.ramp(n2, 0.5, 0.85), 0.7), base, (0.74, 0.90, 0.88, 1))
    m["pearl"] = k.finish(base, 0.13, 0.0)
    return m


PART_MAT = {"pearl": "pearl", "collar": "brass", "claws": "brass", "ferrule_bot": "brass", "grip": "leather", "wrap": "wrap", "ferrule_top": "brass",
            "shuttle": "brass", "bobbins": "bobbin", "ring": "brass", "studs": "pearl", "warp": "warp", "habaki": "brass", "braid": "braid"}


def coded():
    mats = materials()
    parts = {}
    for name in L.HIGH_PARTS:
        ob = L.build_part(name, True)
        if name == "blade":
            L.blade_face_materials(ob, mats["flat"], mats["edge"], mats["floor"])
        else:
            ob.data.materials.append(mats[PART_MAT[name]])
        parts[name] = ob
    report = {"parts": {}, "source": "coded"}
    worst = 0.0
    for name, ob in parts.items():
        g = L.gap(ob, parts[L.P[name]["attach"]])
        worst = max(worst, g)
        lo, hi = L.bounds([ob])
        report["parts"][name] = {"attach": L.P[name]["attach"], "gap_m": round(g, 6), "tris": L.tris(ob),
                                 "size_m": [round(hi[i] - lo[i], 4) for i in range(3)], "z_range": [round(lo.z, 4), round(hi.z, 4)]}
        L.log(f"{name:12s} -> {L.P[name]['attach']:12s} gap {g * 1000:.3f} mm  tris {L.tris(ob)}")
    lo, hi = L.bounds(parts.values())
    report["length_m"] = round(hi.z - lo.z, 4)
    report["worst_gap_m"] = worst
    report["tris"] = sum(L.tris(o) for o in parts.values())
    L.log("length", report["length_m"], "worst gap", worst, "tris", report["tris"])
    assert worst == 0.0, "a part floats: fix parts.json"
    assert abs(report["length_m"] - L.SPEC["length"]) < 0.002, "length is off the spec"
    return L.join(list(parts.values()), "HIGH"), report


def from_source(path):
    """Any sword mesh: longest axis -> +Z, the hilt (the end with the widest slice) down, length to the spec,
    origin on the grip centre (the same fraction of the length as the coded sword)."""
    bpy.ops.import_scene.gltf(filepath=path) if path.lower().endswith((".glb", ".gltf")) else bpy.ops.wm.obj_import(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    ob = L.join(meshes, "HIGH")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o != ob:
            bpy.data.objects.remove(o)
    lo, hi = L.bounds([ob])
    size = hi - lo
    axis = max(range(3), key=lambda i: size[i])
    rot = {0: Matrix.Rotation(-math.pi / 2, 4, "Y"), 1: Matrix.Rotation(math.pi / 2, 4, "X"), 2: Matrix.Identity(4)}[axis]
    ob.data.transform(rot)
    lo, hi = L.bounds([ob])
    size = hi - lo
    if size.x < size.y:  # the flat of the blade faces Y
        ob.data.transform(Matrix.Rotation(math.pi / 2, 4, "Z"))
        lo, hi = L.bounds([ob])
    # the hilt half holds the widest slice
    mid = (lo.z + hi.z) / 2
    wide_lo = max((abs(v.co.x - (lo.x + hi.x) / 2) for v in ob.data.vertices if v.co.z < mid), default=0)
    wide_hi = max((abs(v.co.x - (lo.x + hi.x) / 2) for v in ob.data.vertices if v.co.z >= mid), default=0)
    if wide_hi > wide_lo:
        ob.data.transform(Matrix.Rotation(math.pi, 4, "X"))
        lo, hi = L.bounds([ob])
    s = L.SPEC["length"] / (hi.z - lo.z)
    grip_frac = 0.156 / 1.100
    c = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z + (hi.z - lo.z) * grip_frac))
    ob.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-c))
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    lo, hi = L.bounds([ob])
    return ob, {"source": os.path.basename(path), "length_m": round(hi.z - lo.z, 4), "tris": L.tris(ob), "parts": {}}


def main():
    L.reset()
    src = L.opt("--source")
    ob, report = from_source(src) if src else coded()
    ob["lb_source"] = report["source"]
    json.dump(report, open(os.path.join(L.WORK, "high_report.json"), "w"), indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(L.WORK, "high.blend"))
    L.log("saved high.blend", report["tris"], "tris")


main()

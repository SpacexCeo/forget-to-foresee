"""The silk coin, the in-game currency icon (owner task via the lead, 12.11): silk is woven memory-thread, so
the coin is a warm gold piece whose field is woven ivory silk, a teal thread laid in a groove inside the
milled rim, and the round sign (a ring with four short strokes) struck in gold on a polished centre.

    blender -b -P art/ui/build_silk_coin.py -- <out_dir>

Renders (Cycles, transparent film) <out_dir>/coin_front.png (512 px, the coin tipped 12 degrees so the rim
reads) and coin_spin_{0..7}.png (a half turn about the vertical axis: the two faces are identical, so eight
frames over 180 degrees loop). art/ui/ship_silk_coin.py makes the shipped sizes, the spin strip and the sheet.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import ftf  # noqa: E402

R = 1.0            # coin radius
T = 0.17           # thickness at the rim
FIELD = 0.74       # woven field radius
GROOVE = 0.80      # teal thread radius

GOLD = (1.0, 0.80, 0.42)
GOLD_DEEP = (0.86, 0.55, 0.22)
IVORY = (0.86, 0.66, 0.38)
IVORY_B = (0.70, 0.50, 0.27)
TEAL = (0.015, 0.36, 0.37)
ENAMEL = (0.035, 0.02, 0.012)   # dark warm bronze enamel behind the sign: the ring reads at 24 px without a second hue


def mat(name, col, rough, metal, sheen=0.0, emit=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Tint"].default_value = (1, 0.95, 0.85, 1)
    if coat:
        b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


def obj(name, bm, material, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = smooth
    return o


def lathe(profile, n, rfunc=None):
    """Revolve [(r, z)] about +Z (closed loop of rings, no caps); rfunc(r, z, a) may perturb the radius."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        ring = []
        for i in range(n):
            a = math.tau * i / n
            rr = rfunc(r, z, a) if rfunc else r
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    return bm


def coin_body(gold):
    """Rim and edge for both faces: milled (reeded) edge, rounded lip, a sunk groove for the thread, the field floor."""
    h = T / 2
    prof = [(0.0, h - 0.035), (FIELD + 0.01, h - 0.035), (FIELD + 0.03, h - 0.03), (0.765, h - 0.045), (0.835, h - 0.045),
            (0.86, h - 0.02), (0.885, h + 0.012), (0.93, h + 0.02), (0.975, h + 0.008), (0.995, h - 0.02), (R, h - 0.04)]
    full = prof + [(r, -z) for r, z in reversed(prof)]

    def reed(r, z, a):
        if r < 0.999:
            return r
        return r - 0.008 * (0.5 + 0.5 * math.cos(a * 120))
    bm = lathe(full, 480, reed)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return obj("coin_body", bm, gold)


def weave(ivory, ivory_b, side=1):
    """Basket-woven silk ribbons over the field: warp along X and weft along Y, each ribbon dipping under the
    crossing ones. Clipped to the field circle by dropping quads outside it."""
    parts = []
    w, gap, amp = 0.088, 0.012, 0.008
    pitch = w + gap
    z0 = T / 2 - 0.035 + 0.006
    seg = 0.03
    n_rib = int(FIELD * 2 / pitch) + 2
    for axis in (0, 1):
        bm = bmesh.new()
        for k in range(-n_rib // 2, n_rib // 2 + 1):
            c = k * pitch
            steps = int(FIELD * 2 / seg) + 2
            rows = []
            for s in range(steps + 1):
                t = -FIELD - 0.02 + s * seg
                # over / under: the ribbon rises where it crosses an odd neighbour
                phase = (t / pitch + 0.5) * math.pi + (k % 2) * math.pi + axis * math.pi
                lift = amp * (1 + math.sin(phase)) + amp
                row = []
                for u in (-w / 2, -w / 4, 0, w / 4, w / 2):
                    crown = 0.004 * (1 - (2 * u / w) ** 2)
                    x, y = (t, c + u) if axis == 0 else (c + u, t)
                    row.append((x, y, (z0 + lift + crown) * side))
                rows.append(row)
            vs = [[bm.verts.new(p) for p in row] for row in rows]
            for r0, r1 in zip(vs, vs[1:]):
                for i in range(4):
                    q = (r0[i], r0[i + 1], r1[i + 1], r1[i]) if side > 0 else (r1[i], r1[i + 1], r0[i + 1], r0[i])
                    if all(math.hypot(v.co.x, v.co.y) < FIELD + 0.01 for v in q) and not all(math.hypot(v.co.x, v.co.y) < 0.34 for v in q):
                        bm.faces.new(q)
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        parts.append(obj("coin_weave_%s_%d" % ("a" if side > 0 else "b", axis), bm, ivory if axis == 0 else ivory_b))
    return parts


def bezel(gold):
    """Gold wires that close the woven field: round its edge and round the centre."""
    out = []
    for side in (1, -1):
        for rc, rt in ((FIELD + 0.012, 0.022), (0.372, 0.018)):
            bm = bmesh.new()
            n, m = 240, 10
            zc = (T / 2 - 0.035 + 0.02) * side
            rings = [[bm.verts.new((math.cos(a) * (rc + math.cos(b) * rt), math.sin(a) * (rc + math.cos(b) * rt), zc + math.sin(b) * rt))
                      for b in (math.tau * j / m for j in range(m))] for a in (math.tau * i / n for i in range(n))]
            for i in range(n):
                r0, r1 = rings[i], rings[(i + 1) % n]
                for j in range(m):
                    k = (j + 1) % m
                    bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            out.append(obj("coin_bezel", bm, gold))
    return out


def lining(silk):
    """Dark silk laid in the groove under the cord, up to the lip (gold walls mirrored the teal cord green)."""
    out = []
    h = T / 2
    prof = [(0.758, h - 0.03), (0.766, h - 0.043), (0.835, h - 0.043), (0.859, h - 0.018), (0.88, h + 0.006)]
    for side in (1, -1):
        bm = lathe([(r, (z + 0.002) * side) for r, z in prof], 240)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        out.append(obj("coin_lining_%d" % side, bm, silk))
    return out


def thread(teal):
    """The teal memory-thread in the groove: a twisted two-ply cord around the coin, on both faces."""
    out = []
    for side in (1, -1):
        bm = bmesh.new()
        n, m = 360, 8
        rc, rt = 0.03, 0.017   # fills the groove: bare gold under a teal cord mirrors it green
        zc = (T / 2 - 0.045 + rc * 0.9) * side
        for ply in (0, 1):
            rings = []
            for i in range(n):
                a = math.tau * i / n
                tw = a * 40 + ply * math.pi
                cr = GROOVE + math.cos(tw) * rc * 0.45
                cz = zc + math.sin(tw) * rc * 0.45
                ring = []
                for j in range(m):
                    b = math.tau * j / m
                    rr = cr + math.cos(b) * rt
                    ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, cz + math.sin(b) * rt)))
                rings.append(ring)
            for i in range(n):
                r0, r1 = rings[i], rings[(i + 1) % n]
                for j in range(m):
                    k = (j + 1) % m
                    bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
        out.append(obj("coin_thread_%d" % side, bm, teal))
    return out


def sign(gold, ivory):
    """The polished centre and the round sign struck on it: a raised ring and four short strokes on the diagonals."""
    out = []
    for side in (1, -1):
        z0 = T / 2 - 0.035
        # polished medallion: a low dome over the weave
        prof = [(0.0, z0 + 0.05), (0.2, z0 + 0.048), (0.33, z0 + 0.044), (0.36, z0 + 0.04), (0.365, z0 - 0.01)]
        bm = lathe([(r, z * side) for r, z in prof], 96)
        if side < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        out.append(obj("coin_centre_%d" % side, bm, ivory))
        # the ring of the sign
        zt = z0 + 0.075
        prof = [(0.185, z0 + 0.04), (0.19, zt - 0.006), (0.198, zt), (0.252, zt), (0.26, zt - 0.006), (0.265, z0 + 0.04)]
        bm = lathe([(r, z * side) for r, z in prof], 96)
        if side < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        out.append(obj("coin_ring_%d" % side, bm, gold))
        # four strokes on the diagonals, across the ring (as the shop signs and the altar)
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            for v in bm.verts:
                v.co.x *= 0.15
                v.co.y *= 0.05
                v.co.z = (z0 + 0.03 + (v.co.z + 0.5) * 0.05) * side
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.008, segments=2, affect="EDGES")
            for v in bm.verts:
                x, y = v.co.x + 0.225, v.co.y
                v.co.x, v.co.y = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
            if side < 0:
                bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
            out.append(obj("coin_stroke_%d_%d" % (side, k), bm, gold))
    return out


def build():
    ftf.reset_scene()
    gold = mat("M_Coin_Gold", GOLD, 0.2, 1.0)
    ivory = mat("M_Coin_Silk", IVORY, 0.4, 0.1, sheen=0.9)
    ivory_b = mat("M_Coin_Silk_B", IVORY_B, 0.45, 0.1, sheen=0.9)
    enamel = mat("M_Coin_Enamel", ENAMEL, 0.32, 0.0, coat=0.15)   # a glossier coat flashed silver-grey mid-spin
    teal = mat("M_Coin_Thread", TEAL, 0.38, 0.0, sheen=0.6)
    lin = mat("M_Coin_Lining", (0.16, 0.10, 0.05), 0.6, 0.0, sheen=0.5)
    parts = [coin_body(gold)] + weave(ivory, ivory_b, 1) + weave(ivory, ivory_b, -1) + bezel(gold) + lining(lin) + thread(teal) + sign(gold, enamel)
    root = bpy.data.objects.new("coin", None)
    bpy.context.scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root


def stage(out):
    root = build()
    sc = bpy.context.scene
    ftf.use_gpu(sc, "coin")
    ftf.setup_cycles(sc, 512, 512, 128, jpeg=False, look="AgX - Medium High Contrast")
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    nt = world.node_tree
    coord = nt.nodes.new("ShaderNodeTexCoord")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    ramp.color_ramp.elements[0].color = (0.12, 0.09, 0.07, 1)   # a dark warm floor
    ramp.color_ramp.elements[1].color = (1.0, 0.9, 0.74, 1)     # a bright warm sky: the gold has something to mirror
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[1].position = 0.6
    nt.links.new(ramp.outputs["Color"], nt.nodes["Background"].inputs["Color"])
    nt.nodes["Background"].inputs["Strength"].default_value = 0.8
    sc.world = world

    def area(name, loc, energy, size, col=(1, 0.95, 0.88)):
        L = bpy.data.lights.new(name, "AREA")
        L.energy, L.size, L.color = energy, size, col
        o = bpy.data.objects.new(name, L)
        sc.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        return o
    area("key", (-2.6, -3.2, 4.2), 520, 2.2)
    area("fill", (3.4, -2.0, 1.6), 140, 3.0, (0.85, 0.92, 1.0))
    area("rim", (0.8, 3.4, 2.4), 260, 1.6)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.28
    cam.location = (0, -10, 0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    # the coin faces the camera (-Y), tipped back 12 degrees so the milled rim shows under it
    root.rotation_euler = (math.radians(90 - 12), 0, 0)
    sc.render.filepath = os.path.join(out, "coin_front.png")
    bpy.ops.render.render(write_still=True)
    sc.cycles.samples = 64
    for f in range(8):
        root.rotation_euler = (math.radians(90 - 12), 0, 0)
        root.rotation_mode = "XYZ"
        # turn about the screen's vertical axis: world Z
        root.rotation_euler = (math.radians(90 - 12), 0, math.radians(180.0 * f / 8))
        sc.render.filepath = os.path.join(out, "coin_spin_%d.png" % f)
        bpy.ops.render.render(write_still=True)
    print("COIN done", out)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = argv[0] if argv else os.path.join(HERE, "out_coin")
    os.makedirs(out, exist_ok=True)
    stage(out)

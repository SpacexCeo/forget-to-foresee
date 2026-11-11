"""Procedural source of the Shells, version 3 (owner 11.11: "an alien object, not identical elongated forms").

Four originals of one family, after the brief's characters (I thin, II massive, III asymmetric, IV cracked open).
Each Shell is the round sign made physical: a pearl horn whose tube grows along a logarithmic spiral and coils into
an open ring standing on edge in the air; the gap of the ring is crossed by a long tapering spike (the sign's tick);
a pearl core hangs in the hollow of the ring; amber glyph strokes are inlaid along the outer flank of the tube; the
inner flank (facing the hollow) is nacre. Growth ridges ring the tube. Nothing is taken from any film or game.

    blender -b --factory-startup -P art/shells/build_shell_v3.py -- <out_dir> [1 2 3 4] [--lite]

Output per Shell i: <out_dir>/shell_<i>.glb (and shell_<i>_m.glb with --lite), meshes `shell` (M_Shell_Exterior,
M_Shell_Nacre, M_Shell_Glow), convex `shell_hull_<k>_col` meshes, the empty `socket_aperture`. Pivot: bottom centre,
18 m tall, the ring faces -Y (glTF +Z, toward the plaza). Blender Z-up, glTF Y-up, metres. No textures: the banding
is vertex colour (COLOR_0), so the files stay small.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

TAU = math.tau
TARGET_H = 18.0

# Per Shell: turns of the coil, ring radius at the aperture, tube radius at the aperture, growth ridges per
# turn, the gap (the angle where the coil starts, measured from the bottom), helical drift out of plane (III),
# spike length and angle, cracks (IV), pearl size.
SPECS = {
    1: dict(turns=1.18, R=6.4, r=1.25, r0=0.10, ribs=34, start=-60, drift=0.0, spike=(1.30, 105), cracks=(), pearl=1.05, squash=1.38, seed=11),
    2: dict(turns=0.98, R=5.6, r=2.75, r0=0.30, ribs=22, start=-40, drift=0.0, spike=(1.05, 120), cracks=(), pearl=1.55, squash=1.0, seed=12),
    3: dict(turns=1.42, R=6.0, r=1.70, r0=0.12, ribs=30, start=-80, drift=4.6, spike=(1.20, 70), cracks=(), pearl=1.20, squash=1.12, seed=13),
    4: dict(turns=1.08, R=6.2, r=1.90, r0=0.16, ribs=28, start=-55, drift=0.0, spike=(0.95, 112), cracks=(0.36, 0.71), pearl=1.25, squash=1.15, seed=14),
}


def srgb(c):
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def material(name, base, rough, emit=None, strength=0.0, vcol=False, sheen=0.0, film=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*base, 1)
    p.inputs["Roughness"].default_value = rough
    if vcol:
        a = nt.nodes.new("ShaderNodeVertexColor")
        a.layer_name = "Col"
        nt.links.new(a.outputs["Color"], p.inputs["Base Color"])
    if sheen:
        p.inputs["Sheen Weight"].default_value = sheen
    if film and "Thin Film Thickness" in p.inputs:
        p.inputs["Thin Film Thickness"].default_value = film
    if emit:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = strength
    return m


def frame(t_vec, up):
    t = t_vec.normalized()
    n = up - t * up.dot(t)
    if n.length < 1e-5:
        n = Vector((1, 0, 0)) - t * t.x
    n.normalize()
    b = t.cross(n)
    return t, n, b


def build(i, lite=False):
    S = SPECS[i]
    rnd = random.Random(S["seed"])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = material("M_Shell_Exterior", (1, 1, 1), 0.38, vcol=True, sheen=0.25)
    nac = material("M_Shell_Nacre", srgb((0.88, 0.86, 0.94)), 0.16, vcol=True, film=420.0)
    glow = material("M_Shell_Glow", srgb((1.0, 0.72, 0.30)), 0.3, emit=srgb((1.0, 0.62, 0.22)), strength=3.5)
    mats = [ext, nac, glow]
    seg = 150 if lite else 300
    sides = 14 if lite else 22
    turns, R, r_ap, r0 = S["turns"], S["R"], S["r"], S["r0"]
    th0 = math.radians(S["start"]) - math.pi / 2          # 0 = bottom of the ring
    k = math.log(R / (R * 0.36)) / (turns * TAU)            # log-spiral: the coil radius grows to R at the aperture

    def centre(t):
        th = th0 + t * turns * TAU
        rp = R * math.exp(-k * (1 - t) * turns * TAU)
        y = -S["drift"] * (t - 0.5)                         # III: the coil drifts out of its plane
        return Vector((rp * math.cos(th), y, rp * math.sin(th) * S["squash"]))

    def tube_r(t):
        r = r0 + (r_ap - r0) * t ** 1.35
        if t > 0.93:                                        # flared aperture lip
            r *= 1.0 + 0.14 * ((t - 0.93) / 0.07) ** 2
        return r

    cracks = S["cracks"]
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    rings, ring_t = [], []
    coil_c = Vector((0, 0, 0))
    for s in range(seg + 1):
        t = s / seg
        c = centre(t)
        tang = centre(min(1, t + 1e-3)) - centre(max(0, t - 1e-3))
        _t, n, b = frame(tang, (c - coil_c) if (c - coil_c).length > 1e-4 else Vector((0, 0, 1)))
        rt = tube_r(t)
        rib = 1.0 + 0.045 * max(0.0, math.sin(t * turns * S["ribs"] * TAU)) ** 6
        # cracks (IV): the tube narrows to a jagged seam and parts slightly
        crack = 1.0
        for cz in cracks:
            d = abs(t - cz)
            if d < 0.012:
                crack = 0.55 + 0.45 * (d / 0.012)
        ring = []
        for j in range(sides):
            a = TAU * j / sides
            ca, sa = math.cos(a), math.sin(a)
            sx = math.copysign(abs(ca) ** 0.8, ca)          # a slightly squared section: flanks and a keel
            sy = math.copysign(abs(sa) ** 0.8, sa)
            keel = 1.0 + 0.10 * max(0.0, ca) ** 8            # a ridge along the outer edge of the coil
            p = c + (n * sx * keel + b * sy * 0.92) * rt * rib * crack
            ring.append(bm.verts.new(p))
        rings.append(ring)
        ring_t.append(t)
    faces = []
    for s in range(seg):
        t = ring_t[s]
        if any(abs(t - cz) < 0.5 / seg for cz in cracks):
            continue                                        # the crack is an open gap in the tube
        for j in range(sides):
            f = bm.faces.new((rings[s][j], rings[s][(j + 1) % sides], rings[s + 1][(j + 1) % sides], rings[s + 1][j]))
            faces.append((f, t, j))
    # caps: the apex tip closed, the aperture closed by a recessed nacre chamber wall
    tip = bm.verts.new(centre(0) - (centre(0.01) - centre(0)).normalized() * r0 * 2.0)
    for j in range(sides):
        bm.faces.new((rings[0][(j + 1) % sides], rings[0][j], tip))
    ca = centre(1.0)
    inner = [bm.verts.new(ca + (v.co - ca) * 0.62 - (ca - centre(0.985)).normalized() * 1.6) for v in rings[-1]]
    for j in range(sides):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % sides], inner[(j + 1) % sides], inner[j]))
    back = bm.faces.new(list(reversed(inner)))
    bm.normal_update()
    # crack seams glow: close each side of a gap with an amber cap
    for cz in cracks:
        s = round(cz * seg)
        for ss, flip in ((s, True), (s + 1, False)):
            if 0 <= ss <= seg:
                vs = rings[ss] if not flip else list(reversed(rings[ss]))
                f = bm.faces.new(vs)
                f.material_index = 2
    # materials and vertex colour: nacre on the side facing the hollow, banded off-white outside
    hollow = Vector((0, 0, 0))
    for f, t, j in faces:
        fc = f.calc_center_median()
        to_c = (hollow - fc)
        to_c.y = 0
        inward = f.normal.dot(to_c.normalized()) > 0.35
        f.material_index = 1 if inward else 0
        band = 0.5 + 0.5 * math.sin(t * turns * S["ribs"] * TAU / 3.0)
        for lo in f.loops:
            if inward:
                hue = 0.5 + 0.5 * math.sin(lo.vert.co.x * 0.9 + lo.vert.co.z * 0.7)
                c = (0.86 + 0.08 * hue, 0.84 + 0.06 * (1 - hue), 0.92, 1.0)
            else:
                # warm pearl with growth bands and three thin umber spiral stripes along the tube
                base = (0.90, 0.84, 0.74)
                k2 = 0.78 + 0.22 * band
                jj = j % sides
                stripe = jj in (sides // 8, sides // 8 + 1, sides // 2 - 2, sides - sides // 6)
                c = (0.58, 0.42, 0.30, 1.0) if stripe else (base[0] * k2, base[1] * k2, base[2] * k2, 1.0)
            lo[col] = c
    for f in bm.faces:
        if f.material_index == 0 and f not in [x[0] for x in faces[:0]]:
            pass
    back.material_index = 1
    for f in bm.faces:
        for lo in f.loops:
            if lo[col][3] == 0 or (lo[col][0] == 0 and lo[col][1] == 0):
                lo[col] = (0.9, 0.88, 0.92, 1.0)
    me = bpy.data.meshes.new("shell")
    bm.to_mesh(me)
    bm.free()
    shell = bpy.data.objects.new("shell", me)
    bpy.context.scene.collection.objects.link(shell)
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    objs = [shell]

    # amber glyph strokes inlaid on the outer flank: short arcs, ticks and loops riding the tube
    gb = bmesh.new()
    NG = 16 if not lite else 10
    for g in range(NG):
        t = 0.14 + 0.78 * g / (NG - 1) + rnd.uniform(-0.01, 0.01)
        if any(abs(t - cz) < 0.04 for cz in cracks):
            continue
        c = centre(t)
        tang = (centre(t + 0.002) - centre(t - 0.002)).normalized()
        _t, n, b = frame(tang, c - coil_c)
        rt = tube_r(t) * 1.035
        kind = g % 3
        L = 0.035 + 0.02 * kind
        pts = []
        a0 = -math.pi / 2 if b.y > 0 else math.pi / 2   # the face of the tube that looks toward the plaza (-Y)
        for q in range(9):
            u = q / 8.0
            if kind == 0:      # an arc across the face
                a = a0 - 0.6 + 1.2 * u
                tt = t
            elif kind == 1:    # a stroke along the tube
                a = a0 + 0.1
                tt = t - L / 2 + L * u
            else:              # a hook: along, then across
                a = a0 + 0.1 + 0.8 * max(0, u - 0.5) * 2
                tt = t - L / 2 + L * min(u, 0.5) * 2
            cc = centre(tt)
            tg = (centre(tt + 0.002) - centre(tt - 0.002)).normalized()
            _a, nn, bb = frame(tg, cc - coil_c)
            rr = tube_r(tt) * 1.035
            # on the tube's own (squared, keeled) section outline, a little proud of it
            ca_, sa_ = math.cos(a), math.sin(a)
            sx_ = math.copysign(abs(ca_) ** 0.8, ca_) * (1.0 + 0.10 * max(0.0, ca_) ** 8)
            sy_ = math.copysign(abs(sa_) ** 0.8, sa_) * 0.92
            rib_ = 1.0 + 0.045 * max(0.0, math.sin(tt * turns * S["ribs"] * TAU)) ** 6
            pts.append((cc + (nn * sx_ + bb * sy_) * rr * rib_ * 1.012, (nn * sx_ + bb * sy_).normalized(), tg))
        w = 0.10 + 0.12 * tube_r(t)
        prev = None
        for p, nrm, tg in pts:
            side = nrm.cross(tg).normalized() if kind != 0 else tg
            a1 = gb.verts.new(p + side * w / 2 + nrm * 0.02)
            a2 = gb.verts.new(p - side * w / 2 + nrm * 0.02)
            if prev:
                gb.faces.new((prev[0], prev[1], a2, a1))
            prev = (a1, a2)
    gme = bpy.data.meshes.new("glyphs")
    gb.normal_update()
    gb.to_mesh(gme)
    gb.free()
    glyphs = bpy.data.objects.new("glyphs", gme)
    bpy.context.scene.collection.objects.link(glyphs)
    gme.materials.append(glow)
    objs.append(glyphs)

    # the spike (the sign's tick) across the gap of the ring, and the pearl core in the hollow
    sl, sa = S["spike"]
    a = math.radians(sa)
    gap_dir = Vector((math.cos(th0 - 0.25), 0, math.sin(th0 - 0.25) * S["squash"])).normalized()
    base_p = gap_dir * R * 0.45
    tip_p = gap_dir * R * (0.45 + sl * 0.95) + Vector((0, 0, 0))
    rot = Matrix.Rotation(a - math.pi / 2, 4, "Y")
    tip_p = base_p + rot @ ((tip_p - base_p))
    sb = bmesh.new()
    d = (tip_p - base_p)
    L = d.length
    bmesh.ops.create_cone(sb, cap_ends=True, segments=12 if lite else 18, radius1=0.42 + 0.1 * (i == 2), radius2=0.0, depth=L)
    bmesh.ops.translate(sb, vec=(0, 0, L / 2), verts=sb.verts)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(sb, verts=sb.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(sb, vec=base_p, verts=sb.verts)
    sme = bpy.data.meshes.new("spike")
    sb.to_mesh(sme)
    sb.free()
    spike = bpy.data.objects.new("spike", sme)
    bpy.context.scene.collection.objects.link(spike)
    sme.materials.append(ext)
    vc = sme.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for d_ in vc.data:
        d_.color = (0.95, 0.91, 0.84, 1.0)
    for p in sme.polygons:
        p.use_smooth = True
    objs.append(spike)
    pb = bmesh.new()
    bmesh.ops.create_icosphere(pb, subdivisions=2 if lite else 3, radius=S["pearl"])
    pme = bpy.data.meshes.new("pearl")
    pb.to_mesh(pme)
    pb.free()
    pearl = bpy.data.objects.new("pearl", pme)
    bpy.context.scene.collection.objects.link(pearl)
    pearl.location = Vector((0, 0, 0)) + Vector((0.0, 0.0, -R * 0.08))
    pme.materials.append(nac)
    vc = pme.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for d_ in vc.data:
        d_.color = (0.97, 0.90, 0.93, 1.0)
    for p in pme.polygons:
        p.use_smooth = True
    objs.append(pearl)
    # a thin amber band round the pearl's equator (the glow mask the client pulses)
    ring_bm = bmesh.new()
    n_r = 40
    vs1 = [ring_bm.verts.new((math.cos(TAU * j / n_r) * S["pearl"] * 1.04, math.sin(TAU * j / n_r) * S["pearl"] * 1.04, -0.05)) for j in range(n_r)]
    vs2 = [ring_bm.verts.new((math.cos(TAU * j / n_r) * S["pearl"] * 1.04, math.sin(TAU * j / n_r) * S["pearl"] * 1.04, 0.05)) for j in range(n_r)]
    for j in range(n_r):
        ring_bm.faces.new((vs1[j], vs1[(j + 1) % n_r], vs2[(j + 1) % n_r], vs2[j]))
    rme = bpy.data.meshes.new("pearl_band")
    ring_bm.to_mesh(rme)
    ring_bm.free()
    band = bpy.data.objects.new("pearl_band", rme)
    bpy.context.scene.collection.objects.link(band)
    band.location = pearl.location
    band.rotation_euler = (math.radians(90), 0, 0)
    rme.materials.append(glow)
    objs.append(band)

    # IV: drifting fragments beside the cracks
    if cracks:
        for cz in cracks:
            for f_ in range(3):
                c = centre(cz) + Vector((rnd.uniform(-1, 1), -rnd.uniform(1.2, 2.4), rnd.uniform(-1, 1))) * 1.0
                fb = bmesh.new()
                pts = [Vector((rnd.uniform(-1, 1), rnd.uniform(-0.3, 0.3), rnd.uniform(-1, 1))) * 0.55 for _ in range(10)]
                for p in pts:
                    fb.verts.new(p)
                bmesh.ops.convex_hull(fb, input=fb.verts)
                fme = bpy.data.meshes.new("fragment")
                fb.to_mesh(fme)
                fb.free()
                fo = bpy.data.objects.new("fragment", fme)
                bpy.context.scene.collection.objects.link(fo)
                fo.location = c
                fo.rotation_euler = (rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3))
                fme.materials.append(ext)
                fme.materials.append(glow)
                vc = fme.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
                for d_ in vc.data:
                    d_.color = (0.92, 0.88, 0.82, 1.0)
                fme.polygons[0].material_index = 1
                objs.append(fo)

    # join everything into the mesh `shell`, scale to 18 m, pivot at the bottom centre
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = shell.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    s_ = TARGET_H / (max(zs) - min(zs))
    off = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)))
    me.transform(Matrix.Diagonal((s_, s_, s_, 1)) @ Matrix.Translation(-off))
    me.update()
    shell.data.set_sharp_from_angle(angle=math.radians(70))

    # convex hulls along the coil for collision, and the aperture socket
    for kk in range(6):
        hb = bmesh.new()
        for s in range(int(seg * kk / 6), int(seg * (kk + 1) / 6) + 1, 4):
            t = s / seg
            c = centre(t)
            rt = tube_r(t)
            for dx in (-1, 1):
                for dy in (-1, 1):
                    for dz in (-1, 1):
                        hb.verts.new(((c + Vector((dx, dy, dz)) * rt * 0.75) - off) * s_)
        bmesh.ops.convex_hull(hb, input=hb.verts)
        hme = bpy.data.meshes.new(f"shell_hull_{kk}_col")
        hb.to_mesh(hme)
        hb.free()
        ho = bpy.data.objects.new(f"shell_hull_{kk}_col", hme)
        bpy.context.scene.collection.objects.link(ho)
    sock = bpy.data.objects.new("socket_aperture", None)
    bpy.context.scene.collection.objects.link(sock)
    sock.location = (centre(1.0) - off) * s_
    tri = sum(len(p.vertices) - 2 for p in me.polygons)
    return tri


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_extras=True, export_vertex_color="ACTIVE" if bpy.app.version >= (4, 2) else None)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    out = argv[0]
    lite_too = "--lite" in argv
    ids = [int(a) for a in argv[1:] if a.isdigit()] or [1, 2, 3, 4]
    os.makedirs(out, exist_ok=True)
    for i in ids:
        for lite in ([False, True] if lite_too else [False]):
            n = build(i, lite)
            name = f"shell_{i}" + ("_m" if lite else "")
            try:
                export(os.path.join(out, name + ".glb"))
            except TypeError:
                bpy.ops.object.select_all(action="SELECT")
                bpy.ops.export_scene.gltf(filepath=os.path.join(out, name + ".glb"), export_format="GLB", use_selection=True,
                                          export_apply=True, export_yup=True, export_extras=True)
            print("SHELL", name, "tris", n, flush=True)


if __name__ == "__main__":
    main()

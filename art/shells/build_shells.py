"""Procedural source for shell_1.glb .. shell_4.glb (Forget to Foresee Shells).

Four levitating Shells, about 18 m tall, from one family: ammonite-like spiral
seashells with strong growth ribs, a deep umbilical spiral and a pearly nacre
interior (owner concepts 07.11, hybrid direction: bold faceted silhouettes that
read from the isometric camera, detailed baked PBR for close inspection). Each
number reads by shape:

  I   elongated: an evolute coil with slender whorls whose last whorl uncoils into
      a long descending shaft ending in a hook (a tall "J" stroke).
  II  massive: tightly involute, inflated whorls, heavy ribs, a round mass.
  III asymmetric: a skewed, oval, trochospiral coil with a one-sided flared lip.
  IV  cracked open: the last whorl is broken away in jagged plates, some plates
      drift beside the break and the dark nacre interior shows through.

Nothing is taken from the film Arrival. Pivot: bottom centre of each Shell
(the Shell floats; the game lifts it). Blender Z-up, glTF Y-up, metres.

Run with Blender 4.5 LTS:

    blender -b --factory-startup -P build_shells.py -- build 2     # one shell
    blender -b --factory-startup -P build_shells.py -- render 2
    blender -b --factory-startup -P build_shells.py -- all 1 2 3 4
"""

import json
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "art", "common"))
import ftf_pipeline as P  # noqa: E402

TEX_SIZE = 4096
BAKE_SIZE = 8192
RUNTIME_TRI_BUDGET = 30000
MASTER_EDGE = 0.030
WALL = 0.32                     # shell wall thickness (solidify)

COL_PEARL = (0.40, 0.42, 0.42)          # pale pearly grey (linear)
TINTS = ((0.58, 0.40, 0.48), (0.38, 0.56, 0.47), (0.38, 0.46, 0.62))   # pink, green, blue sheen

SPECS = {
    1: dict(numeral="I", W=1.9, a_ratio=0.34, t_ratio=0.62, whorls=3.6, ribs=24, rib_amp=0.12,
            sides=18, target_h=18.0, hook=dict(straight=1.75, hook_deg=120.0, hook_r=0.62,
                                                grow=1.22), theta_end=math.pi),
    2: dict(numeral="II", W=3.0, a_ratio=0.66, t_ratio=0.95, whorls=3.4, ribs=18, rib_amp=0.17,
            sides=24, target_h=17.5, theta_end=-math.pi / 2),
    3: dict(numeral="III", W=2.6, a_ratio=0.58, t_ratio=0.70, whorls=3.4, ribs=20, rib_amp=0.14,
            sides=24, target_h=17.0, theta_end=-math.pi * 0.35, troch=0.50, oval=0.28,
            flare=0.85, tilt=(math.radians(24), 0.0, math.radians(38)), mirror=True),
    4: dict(numeral="IV", W=2.8, a_ratio=0.62, t_ratio=0.85, whorls=3.4, ribs=20, rib_amp=0.15,
            sides=24, target_h=17.5, theta_end=-math.pi / 2, broken=True),
}


def paths(n):
    asset = f"shell_{n}"
    return dict(
        asset=asset,
        qa=os.path.join(REPO, "docs", "art", "qa", asset),
        tex=os.path.join(HERE, "textures"),
        glb=os.path.join(REPO, "game", "public", "assets", "models", f"{asset}.glb"),
        blend=os.path.join(HERE, f"{asset}.blend"),
        stats=os.path.join(REPO, "docs", "art", "qa", asset, "build-stats.json"))


# ------------------------------------------------------------------ geometry

def rib_profile(frac):
    v = math.sin(math.pi * (frac - 0.4) / 0.6)
    return max(0.0, v) ** 1.2


def coil_frames(spec):
    """Frames along the spiral: (centre, e1 in-plane outward, e2 axis, a, t, u, rib)."""
    W, whorls, nr = spec["W"], spec["whorls"], spec["ribs"]
    k = math.log(W) / (2 * math.pi)
    t_end = spec["theta_end"]
    t_start = t_end - whorls * 2 * math.pi
    R0 = 1.0
    frames = []
    th = t_start
    while th <= t_end + 1e-9:
        g = math.exp(k * (th - t_end))
        whorl_from_end = (t_end - th) / (2 * math.pi)
        per_rib = 4 if whorl_from_end < 2.0 else (2 if whorl_from_end < 2.8 else 1)
        oval = 1.0 + spec.get("oval", 0.0) * math.cos(th - 0.6)
        R = R0 * g * oval
        e1 = Vector((math.cos(th), 0.0, math.sin(th)))
        c = R * e1 + Vector((0.0, spec.get("troch", 0.0) * R0 * (1.0 - g) * 1.4, 0.0))
        a = spec["a_ratio"] * R0 * g * (1.0 + spec.get("oval", 0.0) * 0.5 * math.cos(th - 0.6))
        t = spec["t_ratio"] * a
        u = (th - t_start) * nr / (2 * math.pi)
        frac = u % 1.0
        rib = rib_profile(frac) if whorl_from_end < 2.8 else 0.0
        lip_w = math.radians(28)
        if th > t_end - lip_w and not spec.get("hook"):
            lip = 1.0 + 0.13 * ((th - (t_end - lip_w)) / lip_w) ** 2
            a *= lip
            t *= lip
        flare = 0.0
        if spec.get("flare") and th > t_end - math.radians(70):
            flare = spec["flare"] * ((th - (t_end - math.radians(70))) / math.radians(70)) ** 2
        frames.append(dict(c=c, e1=e1, e2=Vector((0, 1, 0)), a=a, t=t, u=u, rib=rib,
                           flare=flare, th=th))
        th += 2 * math.pi / (nr * per_rib)
    return frames, k


def hook_frames(spec, frames, k):
    """Uncoil the last whorl into a descending shaft that ends in a hook (shell I)."""
    hk = spec["hook"]
    last = frames[-1]
    th = last["th"]
    tan = Vector((k * math.cos(th) - math.sin(th), 0.0, k * math.sin(th) + math.cos(th))).normalized()
    heading = math.atan2(tan.z, tan.x)
    pos = last["c"].copy()
    a0, nr = last["a"], spec["ribs"]
    rib_len = (2 * math.pi * (pos.length)) / nr          # keep the coil's rib spacing
    step = rib_len / 4
    out = []
    u = last["u"]
    total = 0.0
    straight_left = hk["straight"]
    turned = 0.0
    target_down = -math.pi / 2
    phase = "align"
    while True:
        if phase == "align":
            d = (target_down - heading + math.pi) % (2 * math.pi) - math.pi
            if abs(d) < 0.02:
                heading, phase = target_down, "straight"
            else:
                heading += max(-step / 0.9, min(step / 0.9, d))
        elif phase == "straight":
            straight_left -= step
            if straight_left <= 0:
                phase = "hook"
        else:
            dturn = step / hk["hook_r"]
            heading += dturn
            turned += dturn
            if turned >= math.radians(hk["hook_deg"]):
                break
        T = Vector((math.cos(heading), 0.0, math.sin(heading)))
        pos = pos + T * step
        total += step
        u += 0.25
        frac = u % 1.0
        e1 = Vector((T.z, 0.0, -T.x))
        grow = 1.0 + (hk["grow"] - 1.0) * min(1.0, total / (hk["straight"] + 1.0))
        a = a0 * grow
        if phase == "hook" and turned > math.radians(hk["hook_deg"]) - 0.35:
            a *= 1.0 + 0.13 * ((turned - (math.radians(hk["hook_deg"]) - 0.35)) / 0.35) ** 2
        out.append(dict(c=pos.copy(), e1=e1, e2=Vector((0, 1, 0)), a=a, t=spec["t_ratio"] * a,
                        u=u, rib=rib_profile(frac), flare=0.0, th=None))
    return out


def section_point(f, s, spec, p=0.80):
    cs, sn = math.cos(s), math.sin(s)
    x = math.copysign(abs(cs) ** p, cs)
    y = math.copysign(abs(sn) ** p, sn)
    rib_w = 0.25 + 0.75 * max(0.0, cs) ** 0.7
    m = 1.0 + spec["rib_amp"] * f["rib"] * rib_w
    flare = 1.0 + f["flare"] * max(0.0, sn) ** 1.5           # one-sided lip (shell III)
    return f["c"] + f["e1"] * (f["a"] * m * flare * x) + f["e2"] * (f["t"] * m * flare * y)


def build_tube(bm, frames, spec, uv_spiral):
    ns = spec["sides"]
    rings = []
    for f in frames:
        rings.append([bm.verts.new(section_point(f, 2 * math.pi * j / ns, spec)) for j in range(ns)])
    faces = []
    lay = bm.faces.layers.int["ring"]
    for i in range(len(rings) - 1):
        for j in range(ns):
            jj = (j + 1) % ns
            fc = bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][jj], rings[i][jj]))
            fc[lay] = i
            for loop, (ii, js) in zip(fc.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uv_spiral].uv = (frames[ii]["u"], js / ns)
            faces.append(fc)
    # Outward check on a mid frame: the section point at s=0 must face e1.
    mid = faces[(len(faces) // 2) - (len(faces) // 2) % ns]
    mid.normal_update()
    i0 = mid[lay]
    if mid.normal.dot(frames[i0]["e1"]) < 0:
        bmesh.ops.reverse_faces(bm, faces=faces)
    # Close the inner (tiny) end with a fan.
    c0 = bm.verts.new(frames[0]["c"])
    cap = []
    for j in range(ns):
        cap.append(bm.faces.new((c0, rings[0][(j + 1) % ns], rings[0][j])))
    for fc in cap:
        fc.normal_update()
    tang = (frames[1]["c"] - frames[0]["c"]).normalized()
    if cap[0].normal.dot(tang) > 0:
        bmesh.ops.reverse_faces(bm, faces=cap)
    return rings, faces


def break_shell(bm, frames, spec, rng):
    """Shell IV: knock jagged holes into the last whorl; return drifting plates."""
    n = len(frames)
    th_end = frames[-1]["th"]
    lay = bm.faces.layers.int.get("ring")
    victims = []
    for f in bm.faces:
        if lay is None or f[lay] < 0:
            continue
        i = f[lay]
        th = frames[i]["th"]
        if th is None:
            continue
        span = th_end - th
        if span > math.radians(215):
            continue
        cen = f.calc_center_median()
        fr = frames[i]
        local = cen - fr["c"]
        s = math.atan2(local.dot(fr["e2"]), local.dot(fr["e1"]))
        # Big opening on the outer flank toward the aperture, ragged edge.
        reach = 1.0 - span / math.radians(215)
        # Coherent ragged border (low-frequency waves, no per-face noise).
        edge = (0.15 + 1.05 * reach + 0.30 * math.sin(5.0 * th + 2.0 * s)
                + 0.16 * math.sin(11.0 * th - 3.0 * s + 1.3))
        side = abs(s + 0.5)
        if side < edge and s < 1.0:
            victims.append(f)
    # Drifting plates: small clusters taken from the hole border.
    plates = []
    vset = set(victims)
    border = [f for f in victims if any(g not in vset for e in f.edges for g in e.link_faces)]
    rng.shuffle(border)
    used = set()
    for seed in border[:5]:
        if seed in used:
            continue
        cluster = [seed]
        for e in seed.edges:
            for g in e.link_faces:
                if g in vset and g not in used and g not in cluster and len(cluster) < 4:
                    cluster.append(g)
        used.update(cluster)
        plates.append([[Vector(v.co) for v in f.verts] for f in cluster])
    bmesh.ops.delete(bm, geom=victims, context="FACES")
    return len(victims), plates


def add_plates(bm, plates, rng, frames):
    centre = sum((f["c"] for f in frames[-40:]), Vector()) / 40
    out = []
    for pl in plates:
        pts = [p for f in pl for p in f]
        pc = sum(pts, Vector()) / len(pts)
        away = (pc - centre).normalized()
        off = away * rng.uniform(0.10, 0.30) + Vector((0, rng.uniform(-0.08, 0.08), rng.uniform(-0.06, 0.06)))
        rot = Matrix.Rotation(rng.uniform(-0.45, 0.45), 3, Vector((rng.uniform(-1, 1), rng.uniform(-1, 1),
                                                                   rng.uniform(-1, 1))).normalized())
        for f in pl:
            vs = [bm.verts.new(pc + off + rot @ (p - pc) * rng.uniform(0.82, 0.95)) for p in f]
            fc = bm.faces.new(vs)
            fc[bm.faces.layers.int["ring"]] = -1
            out.append(fc)
    return out


def body_bounds(obj):
    """Bounds of the shell body only (faces whose 'ring' attribute is >= 0)."""
    me = obj.data
    attr = me.attributes.get("ring")
    verts = set()
    for p in me.polygons:
        if attr is None or attr.data[p.index].value >= 0:
            verts.update(p.vertices)
    cs = [me.vertices[i].co for i in verts]
    lo = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
    hi = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
    return lo, hi


def build_shell(n, col, m_ext, m_nacre):
    spec = SPECS[n]
    rng = random.Random(500 + n)
    frames, k = coil_frames(spec)
    if spec.get("hook"):
        frames = frames + hook_frames(spec, frames, k)
    bm = bmesh.new()
    bm.faces.layers.int.new("ring")
    uv_sp = bm.loops.layers.uv.new("spiral")
    build_tube(bm, frames, spec, uv_sp)
    info = {"frames": len(frames)}
    if spec.get("broken"):
        removed, plates = break_shell(bm, frames, spec, rng)
        plate_faces = add_plates(bm, plates, rng, frames)
        info.update(broken_faces_removed=removed, plates=len(plates), plate_faces=len(plate_faces))
    shell = P.bm_object(f"shell_{n}_body", bm, m_ext, col)
    shell.data.materials.append(m_nacre)
    # Orientation and scale: tilt (III), then scale to the target height with the
    # pivot at the bottom centre. Frames are mapped with the same transform.
    R = Matrix.Identity(3)
    if spec.get("mirror"):              # sinistral coil: winds the other way round
        R = Matrix.Diagonal((-1.0, 1.0, 1.0))
    if spec.get("tilt"):
        rx, ry, rz = spec["tilt"]
        R = Matrix.Rotation(rz, 3, "Z") @ Matrix.Rotation(ry, 3, "Y") @ Matrix.Rotation(rx, 3, "X") @ R
    if R != Matrix.Identity(3):
        shell.data.transform(R.to_4x4())
        if R.determinant() < 0:
            shell.data.flip_normals()
    lo, hi = body_bounds(shell)            # drifting plates do not count
    sc = spec["target_h"] / (hi.z - lo.z)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    M = Matrix.Diagonal((sc, sc, sc, 1)) @ Matrix.Translation(-centre)
    shell.data.transform(M)
    info["scale"] = round(sc, 4)
    # Wall thickness: inner faces get the nacre slot, rims stay exterior.
    so = shell.modifiers.new("wall", "SOLIDIFY")
    so.thickness = WALL
    so.offset = -1.0
    so.use_rim = True
    so.use_even_offset = True
    so.material_offset = 1
    so.material_offset_rim = 0
    P.apply_modifiers(shell)
    last, prev = frames[-1], frames[-2]
    T = (R @ (last["c"] - prev["c"])).normalized()
    c_world = (M @ (R @ last["c"]).to_4d()).to_3d()
    P.triangulate_ngons(shell)
    P.finish_shading(shell, angle=28)
    return shell, dict(aperture=c_world, forward=T, aperture_radius=last["a"] * sc, **info), frames, M, R


def spiral_seams(obj, spec):
    """Seam edges from the spiral parametrisation: a ring every quarter whorl and
    one line along the hidden inner side, so each patch unwraps flat."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    sp = bm.loops.layers.uv["spiral"]
    uv = {}
    for f in bm.faces:
        for lp in f.loops:
            uv.setdefault(lp.vert.index, (lp[sp].uv.x, lp[sp].uv.y))
    K = max(1, spec["ribs"] // 4)
    out = set()
    for e in bm.edges:
        a, b = e.verts[0].index, e.verts[1].index
        (ua, va), (ub, vb) = uv.get(a, (0, 0)), uv.get(b, (0, 0))
        ring = abs(ua - ub) < 1e-4 and abs(ua / K - round(ua / K)) < 1e-4
        inner = abs(va - 0.5) < 1e-4 and abs(vb - 0.5) < 1e-4
        if ring or inner:
            out.add((min(a, b), max(a, b)))
    bm.free()
    return out


# ---------------------------------------------------------- master shading

def pearl_material(name, nacre):
    """Pearly calcite / nacre. Growth lines follow the 'spiral' UV (u = rib index)."""
    m, k, out = P.new_procedural(name)
    co = k.coord()
    uvn = k.new("ShaderNodeUVMap")
    uvn.uv_map = "spiral"
    sp = k.sep(uvn.outputs["UV"])
    u = sp.outputs["X"]
    lines = k.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X", wave_profile="SIN")
    k.link(uvn.outputs["UV"], lines.inputs["Vector"])
    lines.inputs["Scale"].default_value = 1.6           # ~8 growth lines per rib
    lines.inputs["Distortion"].default_value = 1.2
    lines.inputs["Detail"].default_value = 2.0
    n1 = k.noise(co, 0.35, 5.0, 0.6)
    n2 = k.noise(co, 1.6, 4.0, 0.55)
    hue = k.noise(co, 0.18, 3.0, 0.55)
    tint = k.mix(k.maprange(hue, 0.35, 0.55), TINTS[0], TINTS[1])
    tint = k.mix(k.maprange(hue, 0.52, 0.70), tint, TINTS[2])
    if nacre:
        base = k.mix(0.75, (0.66, 0.66, 0.70), tint)
        c = k.mix(k.maprange(lines.outputs["Fac"], 0.3, 0.9, 0.0, 0.25), base, (0.80, 0.80, 0.82))
        dirt = k.maprange(k.ao(0.8), 0.4, 0.95, 0.6, 0.0)
        c = k.mix(dirt, c, (0.10, 0.11, 0.12))
        rough = k.maprange(n2, 0.3, 0.7, 0.10, 0.22)
        metal = 0.0
        bump_h = k.math("ADD", lines.outputs["Fac"], k.math("MULTIPLY", n2, 0.3))
        return m, P.finish_procedural(k, out, c, rough, metal, bump_h, 0.10, 0.01)
    base = k.mix(0.62, COL_PEARL, tint)
    c = k.mix(k.maprange(n1, 0.3, 0.7, 0.0, 0.45), base, (0.27, 0.30, 0.30))
    c = k.mix(k.maprange(lines.outputs["Fac"], 0.55, 0.95, 0.0, 0.18), c, (0.74, 0.75, 0.75))
    # Weathering: darker grey-green in crevices between ribs, chalky crests.
    geo = k.geometry()
    crest = k.maprange(geo.outputs["Pointiness"], 0.52, 0.58, 0.0, 0.35)
    c = k.mix(crest, c, (0.78, 0.79, 0.78))
    dirt = k.maprange(k.ao(0.7), 0.35, 0.95, 0.85, 0.0)
    c = k.mix(dirt, c, (0.10, 0.115, 0.11))
    rough = k.math("ADD", k.maprange(n2, 0.3, 0.7, 0.32, 0.52),
                   k.math("MULTIPLY", dirt, 0.25), clamp=True)
    bump_h = k.math("ADD", k.math("MULTIPLY", lines.outputs["Fac"], 0.8),
                    k.math("MULTIPLY", k.noise(co, 9.0, 4.0, 0.6), 0.5))
    return m, P.finish_procedural(k, out, c, rough, 0.0, bump_h, 0.22, 0.02)


def final_material(name, tex, film_nm):
    m = P.textured_material(name, tex["base"], tex["orm"], tex["normal"])
    b = m.node_tree.nodes["Principled BSDF"]
    for sock, v in (("Thin Film Thickness", film_nm), ("Thin Film IOR", 1.45)):
        if sock in b.inputs:
            b.inputs[sock].default_value = v
    return m


def build_collision(col, shell, frames, M, R, n, spec):
    """One or two simple convex hulls from a sparse sample of the outer surface."""
    groups = [list(range(len(frames)))]
    if spec.get("hook"):
        ncoil = next(i for i, f in enumerate(frames) if f["th"] is None)
        groups = [list(range(0, ncoil)), list(range(ncoil - 2, len(frames)))]
    objs = []
    for gi, idx in enumerate(groups):
        pts = []
        for i in idx[::2]:
            f = frames[i]
            for j in range(0, spec["sides"], 2):
                p = section_point(f, 2 * math.pi * j / spec["sides"], spec)
                pts.append((M @ (R @ p).to_4d()).to_3d())
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in pts]
        bmesh.ops.convex_hull(bm, input=vs)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(14), verts=bm.verts[:], edges=bm.edges[:])
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        name = f"shell_{n}_hull{'_' + 'ab'[gi] if len(groups) > 1 else ''}_col"
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        objs.append(P.link(bpy.data.objects.new(name, me), col))
    return objs


# --------------------------------------------------------------------- build

def stage_build(n):
    pa = paths(n)
    P.set_tag(pa["asset"])
    clock = P.StageClock()
    stats = {"asset": pa["asset"], "numeral": SPECS[n]["numeral"], "blender": bpy.app.version_string,
             "stages": clock.stages}

    clock.start("model_runtime")
    sc = P.reset_scene()
    stats["cycles_device"] = P.use_gpu(sc)
    sc.render.engine = "CYCLES"
    work = P.new_collection("Work")
    m_ext = P.mat_simple("tmp_ext", COL_PEARL)
    m_nac = P.mat_simple("tmp_nacre", (0.7, 0.7, 0.72))
    shell, info, frames, M, R = build_shell(n, work, m_ext, m_nac)
    stats["geometry"] = {k: (list(v) if isinstance(v, Vector) else v) for k, v in info.items()}
    stats["runtime_triangles"] = P.mesh_tris(shell)
    stats["nonmanifold_edges"] = P.nonmanifold_edges(shell)
    P.log("runtime tris", stats["runtime_triangles"])

    clock.start("uv_unwrap")
    seams = spiral_seams(shell, SPECS[n])
    shell.data.uv_layers.new(name="UVMap")
    shell.data.uv_layers.active = shell.data.uv_layers["UVMap"]
    # Interior nacre gets half the texel density (it is mostly hidden).
    stats["uv_seams"] = P.seam_unwrap(
        shell, lambda e: (min(e.verts[0].index, e.verts[1].index),
                          max(e.verts[0].index, e.verts[1].index)) in seams,
        sharp_deg=40, margin=0.001, scale_faces=(lambda f: f.material_index == 1, 0.5))
    stats["uv_exterior"] = P.uv_metrics(shell, TEX_SIZE, material_indices={0})
    stats["uv_nacre"] = P.uv_metrics(shell, TEX_SIZE, material_indices={1})
    P.log("uv", json.dumps(stats["uv_exterior"]))

    clock.start("master_highpoly")
    master = P.duplicate(shell, f"{pa['asset']}_master", work)
    passes, nt = P.densify(master, MASTER_EDGE)
    stats["master_densify"] = {"max_edge_m": MASTER_EDGE, "passes": passes, "triangles": nt}
    P.groups_from_materials(master)
    P.add_displace(master, "weather", "CLOUDS", 1.4, 0.035, "tmp_ext", noise_depth=4)
    P.add_displace(master, "pits", "VORONOI", 0.12, -0.008, "tmp_ext")
    P.add_displace(master, "nacre_wave", "CLOUDS", 0.6, 0.012, "tmp_nacre", noise_depth=2)
    h_ext, kit_e = pearl_material("H_Exterior", False)
    h_nac, kit_n = pearl_material("H_Nacre", True)
    slot = {s.material.name: i for i, s in enumerate(master.material_slots)}
    master.material_slots[slot["tmp_ext"]].material = h_ext
    master.material_slots[slot["tmp_nacre"]].material = h_nac
    stats["master_triangles"] = P.evaluated_tris(master)
    P.log("master triangles", stats["master_triangles"])

    clock.start("bake_gpu")
    orig = [s.material for s in shell.material_slots]
    for i, sl in enumerate(shell.material_slots):
        sl.material = P.bake_target_material(f"bake_{i}")
    imgs, stats["bakes"] = P.run_bakes(sc, master, [kit_e, kit_n], (
        ("normal", "NORMAL", shell, 32, "bsdf"),
        ("color", "EMIT", shell, 32, "color"),
        ("rough", "EMIT", shell, 16, "rough"),
        ("ao", "AO", shell, 512, "bsdf")), BAKE_SIZE, cage=0.06, ray=0.12)

    clock.start("textures")
    tex_paths, stats["texture_files"] = P.write_textures(imgs, BAKE_SIZE, TEX_SIZE, pa["tex"],
                                                         pa["asset"], REPO)
    for img in imgs.values():
        bpy.data.images.remove(img)

    clock.start("materials")
    tex = P.load_textures(tex_paths)
    m_e = final_material("M_Shell_Exterior", tex, 260.0)
    m_n = final_material("M_Shell_Nacre", tex, 420.0)
    table = {"tmp_ext": m_e, "tmp_nacre": m_n}
    for sl, mat in zip(shell.material_slots, orig):
        sl.material = table[mat.name]
    shell.data.uv_layers.remove(shell.data.uv_layers["spiral"])
    master.hide_render = True
    master.hide_set(True)

    clock.start("assemble_export")
    out = P.new_collection("Export")
    shell.name = shell.data.name = pa["asset"]
    work.objects.unlink(shell)
    out.objects.link(shell)
    cols = build_collision(out, shell, frames, M, R, n, SPECS[n])
    q = info["forward"].to_track_quat("-Y", "Z")
    sock = P.socket_empty("socket_aperture", out, tuple(info["aperture"]), socket="aperture",
                          radius_m=round(info["aperture_radius"], 3),
                          note="aperture centre; forward (glTF +Z of the node) looks out of the mouth")
    sock.rotation_mode = "QUATERNION"
    sock.rotation_quaternion = q
    stats["collision_triangles"] = {o.name: P.mesh_tris(o) for o in cols}
    stats["materials"] = [s.material.name for s in shell.material_slots]
    lo, hi = P.world_bounds([shell])
    stats["bounds_blender_zup"] = {"min": [round(x, 3) for x in lo], "max": [round(x, 3) for x in hi]}
    stats["glb_bytes"] = P.export_glb(pa["glb"], [shell] + cols + [sock], shell)
    stats["glb"] = P.glb_summary(pa["glb"])
    clock.stop()
    stats["budget_ok"] = {"runtime": stats["runtime_triangles"] <= RUNTIME_TRI_BUDGET,
                          "materials_per_object": len(stats["materials"]) <= 3}
    bpy.ops.wm.save_as_mainfile(filepath=pa["blend"], relative_remap=True)
    os.makedirs(pa["qa"], exist_ok=True)
    with open(pa["stats"], "w") as fh:
        json.dump(stats, fh, indent=2)
    P.log("stats", json.dumps({k: v for k, v in stats.items() if k != "glb"}))


# -------------------------------------------------------------------- render

def stage_render(n, res=1600, samples=384):
    pa = paths(n)
    P.set_tag(pa["asset"])
    clock = P.StageClock()
    clock.start("qa_renders")
    sc = P.reset_scene()
    P.setup_render(sc, res=res, samples=samples)
    device = P.use_gpu(sc)
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 92
    env = P.new_collection("ReviewEnv")
    P.add_lights(env)
    P.add_ground_and_scale(env, ground_r=40.0, ruler_h=20.0, ruler_seg=1.0, ruler_x=-10.0,
                           ruler_y=0.0, ruler_w=0.22,
                           marks=((5.0, "5 m"), (10.0, "10 m"), (18.0, "18 m")),
                           human_at=(11.0, 0.0), label_size=0.75, grid=(1.0, 5.0))
    bpy.ops.import_scene.gltf(filepath=pa["glb"])
    objs = {o.name: o for o in bpy.context.scene.objects}
    shell = objs[pa["asset"]]
    cols = [o for nme, o in objs.items() if nme.endswith("_col")]
    sock = objs.get("socket_aperture")
    lo, hi = P.world_bounds([shell])
    cz = (lo.z + hi.z) / 2
    views = {
        "front": ((0, -80, cz), (0, 0, cz), 28.0, None),
        "side": ((80, 0, cz), (0, 0, cz), 28.0, None),
        "three_quarter": ((30, -36, 25), (0, 0, cz - 1.0), None, 42),
        "top": ((0, 0, 80), (0, 0, 0), 25.0, None),
        "low": ((20, -28, 0.8), (0, 0, cz), None, 32),
    }
    close = {}
    if sock:
        ap = sock.matrix_world.translation
        fwd = sock.matrix_world.to_3x3() @ Vector((0, -1, 0))
        cam = ap + fwd * 9.0 + Vector((0, -4.0, 2.5))
        close["close_aperture"] = (tuple(cam), tuple(ap), None, 40)
    close["close_flank"] = ((lo.x * 0.2 + 3.0, lo.y - 9.0, cz + 2.0), ((lo.x + hi.x) / 2, 0, cz), None, 45)
    close["close_umbilicus"] = ((1.5, lo.y - 6.5, cz + 0.5), ((lo.x + hi.x) / 2 * 0.3, 0, cz), None, 55)
    out = os.path.join(pa["qa"], "final")
    timings = {}
    for c in cols:
        c.hide_render = True
    P.shoot(sc, views, pa["asset"], out, timings, REPO)
    P.shoot(sc, close, pa["asset"], out, timings, REPO)
    cm = P.mat_simple("ColOverlay", (0.9, 0.1, 0.1), 0.5)
    cm.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.35
    for c in cols:
        c.data.materials.clear()
        c.data.materials.append(cm)
        c.hide_render = False
    P.shoot(sc, {"three_quarter": views["three_quarter"]}, f"{pa['asset']}_collision", out, timings, REPO)
    clock.stop()
    with open(os.path.join(out, "render-stats.json"), "w") as fh:
        json.dump({"device": device, "resolution": res, "samples": samples,
                   "seconds_per_render": timings, "stages": clock.stages}, fh, indent=2)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    nums = [int(x) for x in argv[1:]] or [1, 2, 3, 4]
    for num in nums:
        if stage in ("build", "all"):
            stage_build(num)
        if stage in ("render", "all"):
            stage_render(num)

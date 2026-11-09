"""Procedural source for shard.glb (Forget to Foresee hero asset).

A memory shard: a crystallised memory about 0.4 m tall. A slender, slightly
twisted and leaning six-sided crystal with a broken, slanted tip and chipped
shoulder corners, two thin splinters intergrown at its base, held upright by an
aged-bronze clasp with three claws (a human-made binding around something
fragile). Thread-like cracks run through the inside as fine branching filaments.
The crystal uses glTF transmission + volume + IOR; the glow is added by code.

Run with Blender 4.5 LTS:

    blender -b --factory-startup -P build_shard.py -- build    # model, bake, export
    blender -b --factory-startup -P build_shard.py -- render   # QA renders of the .glb
    blender -b --factory-startup -P build_shard.py -- all

Blender is Z-up with the front facing -Y; the glTF exporter converts to Y-up.
Metres throughout.
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

P.set_tag("shard")
ASSET = "shard"
QA_DIR = os.path.join(REPO, "docs", "art", "qa", ASSET)
TEX_DIR = os.path.join(HERE, "textures")
GLB_PATH = os.path.join(REPO, "game", "public", "assets", "models", f"{ASSET}.glb")
BLEND_PATH = os.path.join(HERE, f"{ASSET}.blend")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")

TEX_SIZE = 2048               # 0.4 m object: 2048 already gives ~0.2 mm per texel
BAKE_SIZE = int(os.environ.get("FTF_BAKE_SIZE", "4096"))   # 2048 for a CPU-only build (same texture size)
RUNTIME_TRI_BUDGET = 16000
INSPECT_TRI_BUDGET = 60000
MASTER_EDGE = 0.0005

# Crystal: six irregular sides, rings bottom -> shoulder, then the termination.
SIDE_ANGLES = [math.radians(a + 15) for a in (0, 58, 121, 183, 238, 301)]
SIDE_RADII = [0.041, 0.046, 0.039, 0.044, 0.042, 0.037]
RINGS = [(0.012, 1.00, 0.0), (0.090, 0.97, 3.0), (0.170, 0.92, 6.0), (0.240, 0.87, 9.0),
         (0.282, 0.85, 10.0)]          # (z, taper, twist deg)
APEX_Z = 0.445
FRACTURE_TIP = ((0.0, 0.0, -0.050), (-0.72, -0.32, 0.62))   # offset from apex, normal

COL_CRYSTAL = (0.74, 0.84, 0.80)
COL_FROST = (0.86, 0.90, 0.88)
COL_FLAKE = (0.86, 0.92, 0.94)      # cold white internal fractures (review 07.11: not ivory roots)
GLOW_FLAKE = (0.70, 0.80, 0.86)     # a faint self-light so the fractures catch the eye through the glass
ATTENUATION = (0.80, 0.90, 0.88)    # milky nacre-frost: light enough that a 40 cm ray is not extinguished
ATTENUATION_DISTANCE = 0.75
THICKNESS = 0.03


def lean(z):
    t = max(z, 0.0) / 0.40
    return Vector((0.024 * t ** 1.6, -0.006 * t ** 1.6, 0.0))


def ring_points(z, taper, twist_deg, scale=1.0):
    tw = math.radians(twist_deg)
    off = lean(z)
    return [Vector((r * taper * scale * math.cos(a + tw), r * taper * scale * math.sin(a + tw), z)) + off
            for a, r in zip(SIDE_ANGLES, SIDE_RADII)]


def apex_point():
    return lean(APEX_Z) + Vector((0.010, -0.004, APEX_Z))


# ------------------------------------------------------------------ geometry

def cut(bm, co, no, mat_index):
    """Planar fracture: remove everything on the +normal side and cap the hole."""
    no = Vector(no).normalized()
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True)
    edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    if edges:
        made = bmesh.ops.contextual_create(bm, geom=edges)
        for f in made["faces"]:
            f.material_index = mat_index
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bool(edges)


def main_crystal_bm(rng):
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in ring_points(z, t, tw)] for z, t, tw in RINGS]
    n = len(SIDE_ANGLES)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bottom = bm.faces.new(list(reversed(rings[0])))
    bottom.material_index = 1                 # broken base, hidden in the clasp
    apex = bm.verts.new(apex_point())
    for i in range(n):
        bm.faces.new((rings[-1][i], rings[-1][(i + 1) % n], apex))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # Broken, slanted tip.
    off, no = FRACTURE_TIP
    tip_co = apex_point() + Vector(off)
    cut(bm, tip_co, no, 1)
    # Chipped shoulder corners (convex corners only, so the chips stay local).
    shoulder = ring_points(*RINGS[-1])
    for idx, depth in ((1, 0.006), (3, 0.0045), (5, 0.0035)):
        v = shoulder[idx]
        axis = lean(v.z) + Vector((0, 0, v.z))
        out = (v - axis)
        out.z = 0
        # Keep the chip normal inside the corner's normal cone (between the side
        # faces and the steep termination faces) so the cut stays a local chip.
        tang = Vector((-out.y, out.x, 0)).normalized()
        nrm = (out.normalized() + tang * rng.uniform(-0.22, 0.22) +
               Vector((0, 0, rng.uniform(-0.10, 0.10)))).normalized()
        cut(bm, v - nrm * depth, nrm, 1)
    return bm, tip_co


def splinter_bm(rng, base, direction, length, radius, broken):
    bm = bmesh.new()
    d = Vector(direction).normalized()
    rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    m = Matrix.Translation(base) @ rot
    n = 5
    radii = [radius * rng.uniform(0.8, 1.15) for _ in range(n)]
    angs = [2 * math.pi * i / n + rng.uniform(-0.2, 0.2) for i in range(n)]
    tip_len = radius * 2.4
    rings = []
    for z, taper in ((0.0, 1.0), (length * 0.5, 0.94), (length - tip_len, 0.86)):
        rings.append([bm.verts.new(m @ Vector((r * taper * math.cos(a), r * taper * math.sin(a), z)))
                      for a, r in zip(angs, radii)])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    f = bm.faces.new(list(reversed(rings[0])))
    f.material_index = 1
    apex = bm.verts.new(m @ Vector((radius * 0.2, 0, length)))
    for i in range(n):
        bm.faces.new((rings[-1][i], rings[-1][(i + 1) % n], apex))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if broken:
        co = m @ Vector((0, 0, length - tip_len * 1.25))
        cut(bm, co, (rot.to_3x3() @ Vector((0.6, 0.2, 0.75))), 1)
    return bm


def crystal_planes(obj):
    me = obj.data
    return [(Vector(p.normal), Vector(p.center)) for p in me.polygons]


def inside(planes, x, margin):
    return all(n.dot(x - c) < -margin for n, c in planes)


def grow_veins(planes, rng, primaries, step, max_steps, branch_p, margin):
    """Branching random walks inside the convex crystal. Returns polylines with
    a radius function per line."""
    lines = []

    def walk(start, direction, steps, r0, r1, depth):
        pts = [start]
        d = direction.normalized()
        p = start.copy()
        for s in range(steps):
            jitter = Vector((rng.gauss(0, 0.32), rng.gauss(0, 0.32), rng.gauss(0, 0.20)))
            d = (d + jitter * 0.55).normalized()
            if depth == 0:
                d = (d + Vector((0, 0, 0.35))).normalized()      # threads run along the crystal
            q = p + d * step
            if not inside(planes, q, margin + r0):
                break
            pts.append(q)
            p = q
            if depth < 2 and len(pts) > 3 and rng.random() < branch_p / (depth + 1):
                bd = (d + Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 0.5)))).normalized()
                walk(q.copy(), bd, int(steps * rng.uniform(0.25, 0.5)), r0 * 0.6, r1, depth + 1)
        if len(pts) >= 3:
            lines.append((pts, r0, r1))

    for _ in range(primaries):
        for _try in range(50):
            z = rng.uniform(0.03, 0.09)
            c = lean(z) + Vector((rng.uniform(-0.025, 0.025), rng.uniform(-0.025, 0.025), z))
            if inside(planes, c, margin + 0.004):
                break
        walk(c, Vector((rng.gauss(0, 0.3), rng.gauss(0, 0.3), 1.0)), max_steps, 0.00085, 0.00025, 0)
    return lines


def fracture_planes(rng, count):
    """Two or three oblique cleavage planes through the crystal body (point, normal)."""
    out = []
    for z in (0.12, 0.20, 0.28)[:count]:
        az = rng.uniform(0, 2 * math.pi)
        tilt = math.radians(rng.uniform(38, 62))
        n = Vector((math.sin(tilt) * math.cos(az), math.sin(tilt) * math.sin(az), math.cos(tilt)))
        out.append((lean(z) + Vector((rng.uniform(-0.006, 0.006), rng.uniform(-0.006, 0.006), z)), n))
    return out


def fracture_flakes(name, planes, cleave, rng, per_plane, mat, col):
    """Planar fracture flakes (review 07.11 fix 2): thin, slightly dished irregular polygons 0.5-1.5 cm
    wide lying on a few cleavage planes, every vertex inside the crystal. Opaque on purpose: three.js
    draws only opaque objects into the transmission pass, so a blended flake would vanish behind the glass."""
    bm = bmesh.new()
    made = 0
    for (c, n), count in zip(cleave, per_plane):
        u = n.orthogonal().normalized()
        v = n.cross(u).normalized()
        placed, tries = 0, 0
        while placed < count and tries < count * 60:
            tries += 1
            a, b = rng.uniform(-0.034, 0.034), rng.uniform(-0.034, 0.034)
            p = c + u * a + v * b
            if not inside(planes, p, 0.005):
                continue
            R = rng.uniform(0.0025, 0.0075)
            k = rng.choice((5, 6, 7))
            ring = []
            for i in range(k):
                ang = 2 * math.pi * i / k + rng.uniform(-0.25, 0.25)
                r = R * rng.uniform(0.55, 1.0)
                q = p + (u * math.cos(ang) + v * math.sin(ang)) * r + n * rng.uniform(-0.0004, 0.0004)
                while not inside(planes, q, 0.0015) and r > 0.0008:
                    r *= 0.7
                    q = p + (u * math.cos(ang) + v * math.sin(ang)) * r
                ring.append(bm.verts.new(q))
            mid = bm.verts.new(p + n * 0.0006)                       # a shallow conchoidal dish
            for i in range(k):
                bm.faces.new((mid, ring[i], ring[(i + 1) % k]))
            placed += 1
        made += placed
    o = P.bm_object(name, bm, mat, col)
    P.finish_shading(o, angle=80)
    P.smart_uv(o, margin=0.002)
    return o, made


def veins_object(name, lines, sides, mat, col):
    bm = bmesh.new()
    for pts, r0, r1 in lines:
        P.tube(bm, pts, lambda t, r0=r0, r1=r1: r0 + (r1 - r0) * t, sides)
    o = P.bm_object(name, bm, mat, col)
    P.finish_shading(o, angle=80)
    return o


def clasp_parts(col, m_bronze):
    parts = []
    bm = bmesh.new()
    # two steps (review 07.11 fix 6: a bound relic, not a trophy), a bevelled inner rim
    P.revolve(bm, [(0.0545, 0.000), (0.0565, 0.003), (0.0565, 0.011), (0.0535, 0.0145),
                   (0.0505, 0.017), (0.0505, 0.036), (0.0525, 0.039), (0.0510, 0.0425),
                   (0.0480, 0.0440), (0.0458, 0.0428), (0.0450, 0.0395), (0.0440, 0.030),
                   (0.0420, 0.022)],
              48, cap_bottom=True, cap_top=False)
    # resin floor 1 cm under the rim: no black pit, no fan in sight
    P.revolve(bm, [(0.0425, 0.0215), (0.0425, 0.0330)], 48, cap_top=True)
    o = P.bm_object("clasp_ring", bm, m_bronze, col)
    P.finish_shading(o, angle=35)
    parts.append(o)
    # Three claws, each hugging a crystal face and curling inward at the tip.
    bm = bmesh.new()
    for i in (0, 2, 4):
        pts = []
        for s in range(14):
            t = s / 13
            z = 0.038 + 0.072 * t
            ring = ring_points(z, *_taper_twist(z))
            a, b = ring[i], ring[(i + 1) % 6]
            mid = (a + b) * 0.5
            axis = lean(z) + Vector((0, 0, z))
            nrm = mid - axis
            nrm.z = 0
            nrm.normalize()
            bow = 0.0045 * math.sin(math.pi * min(t * 1.15, 1.0)) - 0.0015 * t ** 4
            pts.append(mid + nrm * (0.0032 + bow) + Vector((0, 0, 0)))
        P.tube(bm, pts, lambda t: 0.0034 - 0.0022 * t, 3, twist=math.pi / 2)    # a wedge: 6 mm base, 2 mm tip
    o = P.bm_object("clasp_claws", bm, m_bronze, col)
    P.finish_shading(o, angle=50)
    parts.append(o)
    return parts


def _taper_twist(z):
    for (z0, t0, w0), (z1, t1, w1) in zip(RINGS, RINGS[1:]):
        if z <= z1:
            u = (z - z0) / (z1 - z0)
            return t0 + (t1 - t0) * u, w0 + (w1 - w0) * u
    return RINGS[-1][1], RINGS[-1][2]


def build_collision(col, crystal, splinters):
    pts = []
    for k in range(10):
        a = 2 * math.pi * k / 10
        for z in (0.0, 0.043):
            pts.append(Vector((0.064 * math.cos(a), 0.064 * math.sin(a), z)))
    for o in [crystal] + splinters:
        vs = [Vector(v.co) for v in o.data.vertices]
        vs.sort(key=lambda v: v.z)
        pts += vs[-4:]
        pts += ring_points(*RINGS[-1])
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in pts]
    bmesh.ops.convex_hull(bm, input=verts)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(6), verts=bm.verts[:], edges=bm.edges[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("shard_hull_col")
    bm.to_mesh(me)
    bm.free()
    return [P.link(bpy.data.objects.new("shard_hull_col", me), col)]


# ---------------------------------------------------------- master shading

def crystal_master_material(name, fracture, impact):
    m, k, out = P.new_procedural(name)
    co = k.coord()
    n = k.noise(co, 60.0, 4.0, 0.55)
    if fracture:
        rel = k.new("ShaderNodeVectorMath", operation="SUBTRACT")
        k.link(co, rel.inputs[0])
        rel.inputs[1].default_value = tuple(impact)
        rings = k.new("ShaderNodeTexWave", wave_type="RINGS", rings_direction="SPHERICAL")
        k.link(rel.outputs["Vector"], rings.inputs["Vector"])
        rings.inputs["Scale"].default_value = 160.0
        rings.inputs["Distortion"].default_value = 2.5
        rings.inputs["Detail"].default_value = 3.0
        c = k.mix(k.maprange(n, 0.3, 0.7, 0.0, 0.3), COL_FROST, (0.78, 0.85, 0.82))
        rough = k.math("ADD", k.maprange(n, 0.3, 0.7, 0.26, 0.40),
                       k.math("MULTIPLY", rings.outputs["Fac"], 0.08), clamp=True)
        bump_h = k.math("ADD", rings.outputs["Fac"], k.math("MULTIPLY", k.noise(co, 500.0, 3.0, 0.6), 0.6))
        return m, P.finish_procedural(k, out, c, rough, 0.0, bump_h, 0.35, 0.0006)
    streak_map = k.new("ShaderNodeMapping")
    k.link(co, streak_map.inputs["Vector"])
    streak_map.inputs["Scale"].default_value = (1.0, 1.0, 0.04)
    streaks = k.noise(streak_map.outputs["Vector"], 260.0, 2.0, 0.5)
    c = k.mix(k.maprange(n, 0.3, 0.7, 0.0, 0.25), COL_CRYSTAL, (0.68, 0.80, 0.76))
    rough = k.math("ADD", k.maprange(n, 0.35, 0.65, 0.15, 0.22),
                   k.maprange(streaks, 0.62, 0.70, 0.0, 0.10), clamp=True)
    bump_h = k.math("ADD", k.math("MULTIPLY", k.noise(co, 140.0, 2.0, 0.4), 0.4),
                    k.maprange(streaks, 0.62, 0.70, 0.0, -0.5))
    return m, P.finish_procedural(k, out, c, rough, 0.0, bump_h, 0.06, 0.0004)


def crystal_final_material(name, tex, normal_img):
    m = P.textured_material(name, tex["base"], tex["orm"], normal_img, use_ao=False)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Transmission Weight"].default_value = 0.82      # a frosted crystal, not clear glass (review fix 3)
    b.inputs["IOR"].default_value = 1.50
    vol = nt.nodes.new("ShaderNodeVolumeAbsorption")
    vol.inputs["Color"].default_value = (*ATTENUATION, 1.0)
    vol.inputs["Density"].default_value = 1.0 / ATTENUATION_DISTANCE
    nt.links.new(vol.outputs["Volume"], nt.nodes["Material Output"].inputs["Volume"])
    grp = nt.nodes.new("ShaderNodeGroup")
    grp.node_tree = P.gltf_output_group()
    grp.inputs["Thickness"].default_value = THICKNESS
    return m


# --------------------------------------------------------------------- build

def split_by_material(obj, col):
    """One object per material slot (copies), keeping UVs."""
    out = {}
    for idx, slot in enumerate(obj.material_slots):
        o = P.duplicate(obj, f"{obj.name}_{slot.material.name}", col)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != idx], context="FACES")
        bm.to_mesh(o.data)
        bm.free()
        out[slot.material.name] = o
    return out


def stage_build():
    clock = P.StageClock()
    stats = {"asset": ASSET, "blender": bpy.app.version_string, "stages": clock.stages}
    rng = random.Random(1107)

    clock.start("model_runtime")
    sc = P.reset_scene()
    stats["cycles_device"] = P.use_gpu(sc)
    sc.render.engine = "CYCLES"
    work = P.new_collection("Work")
    m_facet = P.mat_simple("tmp_facet", COL_CRYSTAL, 0.05)
    m_frac = P.mat_simple("tmp_fracture", COL_FROST, 0.35)
    m_bronze = P.mat_simple("tmp_bronze", P.COL_BRONZE)
    m_vein = P.mat_simple("M_Shard_Fractures", COL_FLAKE, rough=0.16, emit=GLOW_FLAKE, emit_strength=0.25)

    bm, impact = main_crystal_bm(rng)
    crystal = P.bm_object("crystal", bm, m_facet, work)
    crystal.data.materials.append(m_frac)
    splinters = []
    for base, direction, length, radius, broken in (
            (Vector((0.016, 0.017, 0.020)), (0.40, 0.46, 1.0), 0.160, 0.0110, False),   # start inside the cup
            (Vector((-0.015, -0.018, 0.020)), (-0.50, -0.38, 1.0), 0.115, 0.0095, True)):
        o = P.bm_object(f"splinter_{len(splinters)}", splinter_bm(rng, base, direction, length,
                                                                  radius, broken), m_facet, work)
        o.data.materials.append(m_frac)
        splinters.append(o)
    for o in [crystal] + splinters:
        P.triangulate_ngons(o)
        P.crease_edges(o, hard=12, soft=12)
        P.finish_shading(o, angle=18)
    planes = crystal_planes(crystal)
    clasp = clasp_parts(work, m_bronze)
    for o in clasp:
        P.crease_edges(o)
    for o in [crystal] + splinters + clasp:
        nm = P.nonmanifold_edges(o)
        if nm:
            P.log(f"part {o.name}: {nm} non-manifold edges")
    body = P.join([crystal] + splinters + clasp, f"{ASSET}_body")
    stats["ngons_triangulated"] = P.triangulate_ngons(body)
    cleave = fracture_planes(random.Random(2211), 3)
    flakes, stats["flakes"] = fracture_flakes("flakes", planes, cleave, random.Random(2212), (11, 13, 10), m_vein, work)
    lines = grow_veins(planes, random.Random(2213), primaries=4, step=0.0042, max_steps=60, branch_p=0.04,
                       margin=0.0028)[:12]                       # a few hairlines, not roots (review fix 7)
    hair = veins_object("veins", [(pts, 0.00042, 0.00012) for pts, _, _ in lines], 3, m_vein, work)
    veins = P.join([flakes, hair], "veins")
    stats["vein_lines"] = len(lines)
    stats["runtime_body_triangles"] = P.mesh_tris(body)

    clock.start("uv_unwrap")
    P.smart_uv(body, margin=0.004, angle=40)
    P.smart_uv(veins, margin=0.002)
    stats["uv"] = P.uv_metrics(body, TEX_SIZE)
    P.log("uv", json.dumps(stats["uv"]))

    clock.start("master_highpoly")
    master = P.duplicate(body, f"{ASSET}_master", work)
    s1 = master.modifiers.new("smooth", "SUBSURF")
    s1.levels = s1.render_levels = 2
    s1.uv_smooth = "NONE"
    P.apply_modifiers(master)
    passes, n = P.densify(master, MASTER_EDGE)
    stats["master_densify"] = {"max_edge_m": MASTER_EDGE, "passes": passes, "triangles": n}
    P.groups_from_materials(master)
    # no facet_wave: 0.12 mm of displacement only terraced the 8-bit normal map (review 07.11 fix 1)
    P.add_displace(master, "fracture_conch", "CLOUDS", 0.004, 0.00045, "tmp_fracture", noise_depth=3)
    P.add_displace(master, "bronze_hammer", "CLOUDS", 0.006, 0.00035, "tmp_bronze", noise_depth=2)
    h_facet, kit_f = crystal_master_material("H_Facet", False, impact)
    h_frac, kit_r = crystal_master_material("H_Fracture", True, impact)
    h_bronze, kit_b = P.bronze_material("H_Bronze")
    slot = {s.material.name: i for i, s in enumerate(master.material_slots)}
    master.material_slots[slot["tmp_facet"]].material = h_facet
    master.material_slots[slot["tmp_fracture"]].material = h_frac
    master.material_slots[slot["tmp_bronze"]].material = h_bronze
    kits = [kit_f, kit_r, kit_b]
    stats["master_triangles"] = P.evaluated_tris(master)
    P.log("master triangles", stats["master_triangles"])

    clock.start("inspect_mesh")
    parts = split_by_material(body, work)
    glass = P.join([parts["tmp_facet"], parts["tmp_fracture"]], "glass_inspect")
    bev = P.add_bevel(glass, 0.0007, 2, angle=20)
    bev.harden_normals = True
    P.apply_modifiers(glass)
    bronze_i = parts["tmp_bronze"]
    s = bronze_i.modifiers.new("smooth", "SUBSURF")
    s.levels = s.render_levels = 1
    s.uv_smooth = "PRESERVE_BOUNDARIES"
    sw = bronze_i.modifiers.new("fit", "SHRINKWRAP")
    sw.target, sw.wrap_method = master, "NEAREST_SURFACEPOINT"
    P.apply_modifiers(bronze_i)
    P.finish_shading(bronze_i, angle=40)
    insp = P.join([glass, bronze_i], f"{ASSET}_inspect_body")
    P.triangulate_ngons(insp)
    flakes_i, _ = fracture_flakes("flakes_i", planes, cleave, random.Random(2212), (11, 13, 10), m_vein, work)
    lines_i = grow_veins(planes, random.Random(2213), primaries=7, step=0.0032, max_steps=90,
                         branch_p=0.06, margin=0.0025)[:24]
    hair_i = veins_object("veins_i", [(pts, 0.00040, 0.00010) for pts, _, _ in lines_i], 4, m_vein, work)
    veins_i = P.join([flakes_i, hair_i], "veins_i")
    P.smart_uv(veins_i, margin=0.002)
    stats["vein_lines_inspect"] = len(lines_i)

    clock.start("bake_gpu")
    body_slots = [s.material for s in body.material_slots]
    insp_slots = [s.material for s in insp.material_slots]
    for o in (body, insp):
        for i, sl in enumerate(o.material_slots):
            sl.material = P.bake_target_material(f"bake_{o.name}_{i}")
    cpu = stats["cycles_device"] == "CPU"                       # a CPU build: fewer samples, same maps
    imgs, stats["bakes"] = P.run_bakes(sc, master, kits, (
        ("normal", "NORMAL", body, 16 if cpu else 64, "bsdf"),
        ("normal_inspect", "NORMAL", insp, 16 if cpu else 64, "bsdf"),
        ("color", "EMIT", body, 8 if cpu else 32, "color"),
        ("rough", "EMIT", body, 8 if cpu else 32, "rough"),
        ("metal", "EMIT", body, 4 if cpu else 16, "metal"),
        ("ao", "AO", body, 128 if cpu else 1024, "bsdf")), BAKE_SIZE, cage=0.003, ray=0.008)

    clock.start("textures")
    paths, stats["texture_files"] = P.write_textures(imgs, BAKE_SIZE, TEX_SIZE, TEX_DIR, ASSET, REPO)
    for img in imgs.values():
        bpy.data.images.remove(img)

    clock.start("materials")
    tex = P.load_textures(paths)
    m_crys = crystal_final_material("M_Shard_Crystal", tex, tex["normal"])
    m_crys_i = crystal_final_material("M_Shard_Crystal_Inspect", tex, tex["normal_inspect"])
    m_brz = P.textured_material("M_Shard_Bronze", tex["base"], tex["orm"], tex["normal"])
    m_brz_i = P.textured_material("M_Shard_Bronze_Inspect", tex["base"], tex["orm"],
                                  tex["normal_inspect"])
    for m in (m_brz, m_brz_i):                                  # closed meshes: single-sided (review fix 8)
        m.use_backface_culling = True
    table = {"tmp_facet": m_crys, "tmp_fracture": m_crys, "tmp_bronze": m_brz}
    table_i = {"tmp_facet": m_crys_i, "tmp_fracture": m_crys_i, "tmp_bronze": m_brz_i}
    for o, orig, tb in ((body, body_slots, table), (insp, insp_slots, table_i)):
        for sl, mat in zip(o.material_slots, orig):
            sl.material = tb[mat.name]
        merge_duplicate_slots(o)
    master.hide_render = True
    master.hide_set(True)

    clock.start("assemble_export")
    out = P.new_collection("Export")
    runtime = P.join([body, veins], ASSET)
    inspect = P.join([insp, veins_i], f"{ASSET}_inspect")
    for o in (runtime, inspect):
        work.objects.unlink(o)
        out.objects.link(o)
        stats.setdefault("ngons_triangulated_export", {})[o.name] = P.triangulate_ngons(o)
    cols = build_collision(out, crystal_copy_for_hull(runtime), [])
    core = P.socket_empty("socket_core", out, tuple(lean(0.20) + Vector((0, 0, 0.20))),
                          socket="glow", note="centre of the crystal body for code-driven glow")
    stats["runtime_triangles"] = P.mesh_tris(runtime)
    stats["inspect_triangles"] = P.mesh_tris(inspect)
    stats["collision_triangles"] = {o.name: P.mesh_tris(o) for o in cols}
    stats["materials_runtime"] = [s.material.name for s in runtime.material_slots]
    stats["materials_inspect"] = [s.material.name for s in inspect.material_slots]
    lo, hi = P.world_bounds([runtime])
    stats["bounds_blender_zup"] = {"min": [round(x, 4) for x in lo], "max": [round(x, 4) for x in hi]}
    stats["glb_bytes"] = P.export_glb(GLB_PATH, [runtime, inspect] + cols + [core], runtime)
    stats["glb"] = P.glb_summary(GLB_PATH)
    clock.stop()
    stats["budget_ok"] = {
        "runtime": stats["runtime_triangles"] <= RUNTIME_TRI_BUDGET,
        "inspect": stats["inspect_triangles"] <= INSPECT_TRI_BUDGET,
        "materials_per_object": max(len(stats["materials_runtime"]),
                                    len(stats["materials_inspect"])) <= 3,
    }
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, relative_remap=True)
    os.makedirs(QA_DIR, exist_ok=True)
    with open(STATS_PATH, "w") as fh:
        json.dump(stats, fh, indent=2)
    P.log("stats", json.dumps({k: v for k, v in stats.items() if k != "glb"}))


def crystal_copy_for_hull(runtime):
    """Hull input: the runtime glass + clasp vertices (veins are inside anyway)."""
    return runtime


def merge_duplicate_slots(obj):
    mats = [s.material for s in obj.material_slots]
    uniq = []
    for m in mats:
        if m not in uniq:
            uniq.append(m)
    if len(uniq) == len(mats):
        return
    remap = [uniq.index(m) for m in mats]
    idx = [0] * len(obj.data.polygons)
    obj.data.polygons.foreach_get("material_index", idx)
    idx = [remap[i] for i in idx]
    obj.data.materials.clear()
    for m in uniq:
        obj.data.materials.append(m)
    obj.data.polygons.foreach_set("material_index", idx)
    obj.data.update()


# -------------------------------------------------------------------- render

FINAL_VIEWS = {
    "front": ((0, -3, 0.215), (0, 0, 0.215), 0.56, None),
    "side": ((3, 0, 0.215), (0, 0, 0.215), 0.56, None),
    "three_quarter": ((0.62, -0.78, 0.52), (0.0, 0, 0.19), None, 62),
    "top": ((0, 0, 3), (0, 0, 0), 0.20, None),
}
CLOSE_VIEWS = {
    "close_tip": ((0.11, -0.27, 0.43), (0.012, 0.0, 0.37), None, 85),
    "close_veins": ((0.06, -0.24, 0.22), (0.008, 0.0, 0.20), None, 70),
    "close_base": ((0.15, -0.24, 0.13), (0.0, 0.0, 0.045), None, 75),
}


def stage_render(res=None, samples=None):
    res = res or int(os.environ.get("QA_RES", "1600"))              # 900 / 64 for a CPU check
    samples = samples or int(os.environ.get("QA_SAMPLES", "768"))
    clock = P.StageClock()
    clock.start("qa_renders")
    sc = P.reset_scene()
    P.setup_render(sc, res=res, samples=samples)
    sc.cycles.max_bounces = 16
    sc.cycles.transmission_bounces = 16
    sc.cycles.transparent_max_bounces = 16
    device = P.use_gpu(sc)
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 92
    env = P.new_collection("ReviewEnv")
    P.add_lights(env)
    P.add_ground_and_scale(env, ground_r=1.2, ruler_h=0.5, ruler_seg=0.05, ruler_x=-0.17,
                           ruler_y=0.05, ruler_w=0.006,
                           marks=((0.2, "0.2 m"), (0.4, "0.4 m"), (0.5, "0.5 m")),
                           human_at=None, label_size=0.016, grid=(0.05, 0.25))
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    objs = {o.name: o for o in bpy.context.scene.objects}
    runtime, inspect = objs[ASSET], objs[f"{ASSET}_inspect"]
    cols = [o for n, o in objs.items() if n.endswith("_col")]

    def show(rt=True, insp=False, col=False):
        runtime.hide_render = not rt
        inspect.hide_render = not insp
        for c in cols:
            c.hide_render = not col

    out = os.path.join(QA_DIR, "final")
    timings = {}
    show(rt=True)
    P.shoot(sc, FINAL_VIEWS, ASSET, out, timings, REPO)
    P.shoot(sc, CLOSE_VIEWS, ASSET, out, timings, REPO)
    show(rt=False, insp=True)
    P.shoot(sc, CLOSE_VIEWS, f"{ASSET}_inspect", out, timings, REPO)
    cm = P.mat_simple("ColOverlay", (0.9, 0.1, 0.1), 0.5)
    cm.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.35
    for c in cols:
        c.data.materials.clear()
        c.data.materials.append(cm)
    show(rt=True, col=True)
    P.shoot(sc, {"three_quarter": FINAL_VIEWS["three_quarter"]}, f"{ASSET}_collision", out,
            timings, REPO)
    clock.stop()
    with open(os.path.join(out, "render-stats.json"), "w") as fh:
        json.dump({"device": device, "resolution": res, "samples": samples,
                   "seconds_per_render": timings, "stages": clock.stages}, fh, indent=2)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    stage = argv[0] if argv else "build"
    {"build": stage_build, "render": stage_render,
     "all": lambda: (stage_build(), stage_render())}[stage]()

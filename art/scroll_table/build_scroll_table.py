"""Procedural source for scroll_table.glb (Forget to Foresee hero asset).

The Scroll table stands at the centre of the island plaza: a low, wide round
stone medallion (3.4 m across, 0.42 m high; owner concepts 07.11: a floor-level
medallion of six wedge segments with bronze inlay lines). Its top carries a ring
of six sector sockets (one per clan) where the message fragments are laid, and a
central stepped recess with two concentric seat grooves for the "double ring".
Original design: a stepped foot, a drum with one shell growth rib and an
overhanging growth lip under the slab, six short shell-rib buttresses under the
six dividers, polished bronze inlay rings and divider strips on the top.

Run with Blender 4.5 LTS:

    blender -b --factory-startup -P build_scroll_table.py -- build    # model, bake, export
    blender -b --factory-startup -P build_scroll_table.py -- render   # QA renders of the .glb
    blender -b --factory-startup -P build_scroll_table.py -- all

Blender is Z-up with the front facing -Y; the glTF exporter converts to Y-up
(front +Z). Sector 1 faces the front; sectors 2..6 follow counter-clockwise seen
from above. Metres throughout.
"""

import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "art", "common"))
import ftf_pipeline as P  # noqa: E402

P.set_tag("scroll_table")
ASSET = "scroll_table"
QA_DIR = os.path.join(REPO, "docs", "art", "qa", ASSET)
TEX_DIR = os.path.join(HERE, "textures")
GLB_PATH = os.path.join(REPO, "game", "public", "assets", "models", f"{ASSET}.glb")
BLEND_PATH = os.path.join(HERE, f"{ASSET}.blend")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")

TEX_SIZE = 4096
BAKE_SIZE = 8192
RUNTIME_TRI_BUDGET = 16000
INSPECT_TRI_BUDGET = 60000
MASTER_EDGE = 0.0040          # max master edge before displacement (near-square cells)

TOP_Z = 0.420                 # table top (low medallion)
SOCKET_DEPTH = 0.040
SOCKET_R = (0.560, 1.200)     # socket inner / outer radius
SOCKET_HALF = math.radians(26.0)
SOCKET_DISH = 0.006           # gentle dish in each socket floor
SEAT_Z = 0.360                # floor of the central recess (double ring seat)
SEAT_GROOVES = ((0.150, 0.200), (0.255, 0.310))
LOBE_AMP = 0.0                # round medallion (hexafoil option kept, off)

COL_AMBER = P.COL_AMBER
STOP_AFTER_MASTER = False     # stage "master": stop after the dense master (pipeline test)


def sector_angle(k):
    """Centre angle of sector k (1..6): sector 1 faces the front (-Y)."""
    return -math.pi / 2 + (k - 1) * math.pi / 3


def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def lobe(th, z, r):
    """Hexafoil outline: bulges at sector centres, waists at the dividers."""
    return r * (1.0 + LOBE_AMP * math.cos(6 * (th - sector_angle(1))) * smoothstep(1.25, 1.38, r))


def radial_seam(e):
    """UV seam on the radial lines every 30 deg (dividers and sector centres), so
    the rings and bands of the medallion unwrap as arcs that pack densely."""
    angs = []
    for v in e.verts:
        if math.hypot(v.co.x, v.co.y) < 0.05:
            return False
        angs.append(math.degrees(math.atan2(v.co.y, v.co.x)))
    if abs(((angs[0] - angs[1]) + 180) % 360 - 180) > 0.01:
        return False
    return abs(((angs[0] + 90.0) + 15.0) % 30.0 - 15.0) < 0.01


def lin(z, z0, z1, r0, r1):
    return r0 + (r1 - r0) * (z - z0) / (z1 - z0)


# ------------------------------------------------------------------ geometry

def build_top(bm, mat_stone, mat_socket):
    """Polar grid between the collar (r 0.42) and the outer inlay (r 1.24) with
    six recessed sockets. Material indices: 0 stone, 1 socket floor."""
    cols = []
    for k in range(1, 7):
        c = sector_angle(k)
        for m in range(21):
            cols.append(c - SOCKET_HALF + 2 * SOCKET_HALF * m / 20)
        cols.append(c + math.pi / 6)          # divider centre line
    rows = [0.42, 0.49, SOCKET_R[0], 0.72, 0.88, 1.04, SOCKET_R[1], 1.26, 1.31]
    nr, nc = len(rows), len(cols)
    v = [[bm.verts.new((r * math.cos(t), r * math.sin(t), TOP_Z)) for t in cols] for r in rows]
    sockets = {k: [] for k in range(1, 7)}
    for i in range(nr - 1):
        for j in range(nc):
            jj = (j + 1) % nc
            f = bm.faces.new((v[i][j], v[i + 1][j], v[i + 1][jj], v[i][jj]))
            f.material_index = mat_stone
            k, m = divmod(j, 22)
            if 2 <= i <= 5 and m < 20:
                sockets[k + 1].append(f)
    walls_all, floors_all = [], []
    for k, faces in sockets.items():
        ret = bmesh.ops.extrude_face_region(bm, geom=faces)
        new_v = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMVert)]
        new_f = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMFace)]
        bmesh.ops.translate(bm, verts=new_v, vec=(0, 0, -SOCKET_DEPTH))
        leftovers = [f for f in faces if f.is_valid]
        if leftovers:
            bmesh.ops.delete(bm, geom=leftovers, context="FACES")
        c = sector_angle(k)
        rc = 0.5 * (SOCKET_R[0] + SOCKET_R[1])
        centre = Vector((rc * math.cos(c), rc * math.sin(c)))
        floors = [f for f in new_f if all(abs(x.co.z - (TOP_Z - SOCKET_DEPTH)) < 1e-6 for x in f.verts)]
        walls = [f for f in new_f if f not in floors]
        for f in floors:
            f.material_index = mat_socket
            f.normal_update()
            if f.normal.z < 0:
                bmesh.ops.reverse_faces(bm, faces=[f])
        for f in walls:
            f.normal_update()
            fc = f.calc_center_median()
            to_c = Vector((centre.x - fc.x, centre.y - fc.y, 0))
            if f.normal.dot(to_c) < 0:
                bmesh.ops.reverse_faces(bm, faces=[f])
        # Gentle dish: deepest in the middle of the socket.
        for vert in {x for f in floors for x in f.verts}:
            r = math.hypot(vert.co.x, vert.co.y)
            d = (math.atan2(vert.co.y, vert.co.x) - c + math.pi) % (2 * math.pi) - math.pi
            ur = (r - SOCKET_R[0]) / (SOCKET_R[1] - SOCKET_R[0])
            ut = (d + SOCKET_HALF) / (2 * SOCKET_HALF)
            if 0.001 < ur < 0.999 and 0.001 < ut < 0.999:
                vert.co.z -= SOCKET_DISH * math.sin(math.pi * ur) * math.sin(math.pi * ut)
        walls_all += walls
        floors_all += floors
    return len(walls_all), len(floors_all)


def build_parts(col, m_stone, m_bronze, m_socket, m_amber):
    stone, bronze = [], []

    def part(name, mat, fill, bevel=None, angle=32):
        bm = bmesh.new()
        fill(bm)
        o = P.bm_object(name, bm, mat, col)
        if bevel:
            P.add_bevel(o, *bevel)
            P.apply_modifiers(o)
        P.finish_shading(o, angle=angle)
        nm = P.nonmanifold_edges(o)
        if nm:
            P.log(f"part {name}: {nm} non-manifold edges")
        (stone if mat is m_stone else bronze if mat is m_bronze else []).append(o)
        return o

    # Body of revolution: stepped foot, drum with one asymmetric growth rib, an
    # overhanging growth lip under the slab, rounded slab edge, top rim (ends under
    # the inner inlay ring).
    prof = [(1.700, 0.000), (1.700, 0.058), (1.690, 0.080), (1.666, 0.094), (1.620, 0.100),
            (1.575, 0.104), (1.560, 0.120), (1.556, 0.176), (1.580, 0.190), (1.577, 0.202),
            (1.553, 0.232), (1.548, 0.288), (1.588, 0.308), (1.604, 0.315), (1.600, 0.328),
            (1.628, 0.336), (1.644, 0.350), (1.650, 0.372), (1.644, 0.396), (1.628, 0.413),
            (1.600, 0.420), (1.285, 0.420)]
    part("body", m_stone, lambda bm: P.revolve(bm, prof, 120, rfunc=lobe,
                                               phase=sector_angle(1)), angle=30)

    # Top with the six sockets (stone + socket floor faces in one object).
    bm = bmesh.new()
    build_top(bm, 0, 1)
    top = P.bm_object("top", bm, m_stone, col)
    top.data.materials.append(m_socket)
    P.finish_shading(top, angle=30)
    stone.append(top)

    # Central recess: stepped well with two seat grooves and a boss for the amber.
    (g1a, g1b), (g2a, g2b) = SEAT_GROOVES
    gz = SEAT_Z - 0.026
    rec = [(0.420, TOP_Z), (0.360, TOP_Z - 0.006), (0.360, SEAT_Z + 0.004),
           (0.352, SEAT_Z), (g2b, SEAT_Z), (g2b - 0.003, gz), (g2a + 0.003, gz), (g2a, SEAT_Z),
           (g1b, SEAT_Z), (g1b - 0.003, gz), (g1a + 0.003, gz), (g1a, SEAT_Z),
           (0.108, SEAT_Z), (0.096, SEAT_Z + 0.010), (0.012, SEAT_Z + 0.010)]
    part("recess", m_stone, lambda bm: P.revolve(bm, rec, 48, cap_top=True), angle=30)

    # Bronze collar over the recess edge (overhangs the wall as a lip) and the
    # outer inlay ring; both also hide the joints between the stone parts.
    part("collar", m_bronze, lambda bm: P.revolve(bm, [
        (0.447, TOP_Z - 0.002), (0.449, TOP_Z + 0.003), (0.444, TOP_Z + 0.008),
        (0.400, TOP_Z + 0.010), (0.362, TOP_Z + 0.008), (0.355, TOP_Z + 0.003),
        (0.354, TOP_Z - 0.010), (0.362, TOP_Z - 0.014), (0.372, TOP_Z - 0.008)], 48))
    part("inlay_ring", m_bronze, lambda bm: P.revolve(bm, [
        (1.348, TOP_Z - 0.002), (1.349, TOP_Z + 0.002), (1.343, TOP_Z + 0.005),
        (1.267, TOP_Z + 0.005), (1.261, TOP_Z + 0.002), (1.262, TOP_Z - 0.002)], 120,
        rfunc=lobe, phase=sector_angle(1)))
    part("inlay_ring_outer", m_bronze, lambda bm: P.revolve(bm, [
        (1.538, TOP_Z - 0.002), (1.539, TOP_Z + 0.0015), (1.535, TOP_Z + 0.0035),
        (1.517, TOP_Z + 0.0035), (1.513, TOP_Z + 0.0015), (1.514, TOP_Z - 0.002)], 120,
        rfunc=lobe, phase=sector_angle(1)))

    # Bronze strips along the six dividers, running out to the outer inlay ring.
    def strips(bm):
        for k in range(1, 7):
            a = sector_angle(k) + math.pi / 6
            P.box(bm, Vector((0.9875 * math.cos(a), 0.9875 * math.sin(a), TOP_Z + 0.0013)),
                  (1.035, 0.018, 0.0045), a)
    part("divider_strips", m_bronze, strips, bevel=(0.0022, 1, 40))

    # Six short shell-rib buttresses on the drum under the dividers, bronze shoes.
    fin = [(1.50, 0.098), (1.645, 0.098), (1.645, 0.128)]
    for i in range(1, 9):
        ph = math.radians(90 * i / 8)
        fin.append((1.645 - 0.065 * math.sin(ph), 0.305 - 0.177 * math.cos(ph)))
    fin.append((1.50, 0.305))
    for k in range(1, 7):
        a = sector_angle(k) + math.pi / 6
        part(f"fin_{k}", m_stone,
             lambda bm, a=a: P.prism(bm, fin, lambda z: 0.046 - 0.012 * (z - 0.10) / 0.2, a),
             bevel=(0.007, 1))
        part(f"fin_shoe_{k}", m_bronze,
             lambda bm, a=a: P.box(bm, Vector((1.615 * math.cos(a), 1.615 * math.sin(a), 0.118)),
                                   (0.080, 0.112, 0.046), a), bevel=(0.005, 1))

    # Amber cabochon on the central boss: the human-decision mark (not baked).
    bm = bmesh.new()
    P.revolve(bm, [(0.078, SEAT_Z + 0.008), (0.076, SEAT_Z + 0.016), (0.066, SEAT_Z + 0.025),
                   (0.048, SEAT_Z + 0.031), (0.024, SEAT_Z + 0.034)], 32, cap_top=True)
    amber = P.bm_object("amber", bm, m_amber, col)
    P.finish_shading(amber, angle=60)
    return stone, bronze, amber


def build_sockets(col):
    out = []
    rc = 0.5 * (SOCKET_R[0] + SOCKET_R[1])
    floor = TOP_Z - SOCKET_DEPTH
    for k in range(1, 7):
        c = sector_angle(k)
        out.append(P.socket_empty(
            f"socket_sector_{k}", col, (rc * math.cos(c), rc * math.sin(c), floor),
            rot_z=c + math.pi / 2, socket="sector", sector=k,
            inner_radius_m=SOCKET_R[0], outer_radius_m=SOCKET_R[1],
            half_angle_deg=math.degrees(SOCKET_HALF), depth_m=SOCKET_DEPTH,
            note="forward (glTF +Z of the node) points radially outward; floor is dished 6 mm"))
    out.append(P.socket_empty(
        "socket_center", col, (0, 0, SEAT_Z), socket="double_ring",
        groove_inner_m=list(SEAT_GROOVES[0]), groove_outer_m=list(SEAT_GROOVES[1]),
        groove_depth_m=0.026, recess_radius_m=0.36,
        note="seat floor height; two concentric grooves hold the double ring"))
    return out


def build_collision(col):
    objs = []

    def ngon(name, n, r0, r1, z0, z1):
        bm = bmesh.new()
        k = 1.0 / math.cos(math.pi / n)      # circumscribe the round shape
        P.revolve(bm, [(r0 * k, z0), (r1 * k, z1)], n, phase=math.pi / n,
                  cap_bottom=True, cap_top=True)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        objs.append(P.link(bpy.data.objects.new(name, me), col))

    ngon("scroll_table_foot_col", 24, 1.70, 1.70, 0.0, 0.10)
    ngon("scroll_table_body_col", 24, 1.65, 1.65, 0.10, TOP_Z)
    return objs


# ---------------------------------------------------------- master shading

def slate_material(name):
    """Socket floors: darker, finer, softly polished stone with fine engraved
    concentric rings around the table axis."""
    m, k, out = P.new_procedural(name)
    co = k.coord()
    n1 = k.noise(co, 11.0, 7.0, 0.6)
    speck = k.noise(co, 90.0, 3.0, 0.5)
    ramp = k.new("ShaderNodeValToRGB")
    k.link(n1, ramp.inputs["Fac"])
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.30, (0.020, 0.024, 0.025, 1)
    el[1].position, el[1].color = 0.80, (0.105, 0.122, 0.116, 1)
    rings = k.new("ShaderNodeTexWave", wave_type="RINGS", rings_direction="Z", wave_profile="SIN")
    k.link(co, rings.inputs["Vector"])
    rings.inputs["Scale"].default_value = 26.0        # ~12 mm period
    rings.inputs["Distortion"].default_value = 0.4
    rings.inputs["Detail"].default_value = 1.0
    groove = k.maprange(rings.outputs["Fac"], 0.0, 0.12, 1.0, 0.0)
    c = k.mix(k.math("MULTIPLY", groove, 0.6), ramp.outputs["Color"], P.COL_CHARCOAL)
    c = k.mix(0.3, c, k.maprange(speck, 0.3, 0.7, 0.8, 1.1), blend="MULTIPLY")
    dirt = k.maprange(k.ao(0.04), 0.5, 0.95, 0.7, 0.0)
    c = k.mix(dirt, c, (0.012, 0.014, 0.015))
    rough = k.math("ADD", k.maprange(speck, 0.3, 0.7, 0.42, 0.58), k.math("MULTIPLY", groove, 0.2),
                   clamp=True)
    bump_h = k.math("ADD", k.math("MULTIPLY", groove, -1.0),
                    k.math("MULTIPLY", k.noise(co, 300.0, 3.0, 0.5), 0.3))
    return m, P.finish_procedural(k, out, c, rough, 0.0, bump_h, 0.16, 0.0015)


# --------------------------------------------------------------------- build

def stage_build():
    clock = P.StageClock()
    stats = {"asset": ASSET, "blender": bpy.app.version_string, "stages": clock.stages}

    clock.start("model_runtime")
    sc = P.reset_scene()
    stats["cycles_device"] = P.use_gpu(sc)
    sc.render.engine = "CYCLES"
    work = P.new_collection("Work")
    m_stone = P.mat_simple("tmp_stone", P.COL_STONE)
    m_bronze = P.mat_simple("tmp_bronze", P.COL_BRONZE)
    m_socket = P.mat_simple("tmp_socket", P.COL_CHARCOAL)
    m_amber = P.mat_simple("M_ScrollTable_Amber", (0.95, 0.40, 0.07), rough=0.18,
                           emit=COL_AMBER, emit_strength=0.5)
    stone, bronze, amber = build_parts(work, m_stone, m_bronze, m_socket, m_amber)
    body = P.join(stone + bronze, f"{ASSET}_body")
    stats["ngons_triangulated"] = P.triangulate_ngons(body)
    stats["runtime_body_triangles"] = P.mesh_tris(body)
    P.log("runtime body tris", stats["runtime_body_triangles"])

    clock.start("uv_unwrap")
    stats["uv_seams"] = P.seam_unwrap(body, radial_seam, sharp_deg=35, margin=0.0012)
    P.smart_uv(amber, margin=0.02)
    stats["uv"] = P.uv_metrics(body, TEX_SIZE)
    P.log("uv", json.dumps(stats["uv"]))

    clock.start("master_highpoly")
    master = P.duplicate(body, f"{ASSET}_master", work)
    P.crease_edges(master)
    s1 = master.modifiers.new("smooth", "SUBSURF")
    s1.levels = s1.render_levels = 2
    s1.uv_smooth = "NONE"
    P.apply_modifiers(master)
    passes, n = P.densify(master, MASTER_EDGE)
    stats["master_densify"] = {"max_edge_m": MASTER_EDGE, "passes": passes, "triangles": n}
    if STOP_AFTER_MASTER:
        P.log("master test", json.dumps(stats))
        return
    P.groups_from_materials(master)
    P.add_displace(master, "stone_weather", "CLOUDS", 0.060, 0.0042, "tmp_stone", noise_depth=4)
    P.add_displace(master, "stone_chips", "VORONOI", 0.032, -0.0034, "tmp_stone")
    P.add_displace(master, "stone_pits", "DISTORTED_NOISE", 0.012, 0.0010, "tmp_stone", distortion=2.0)
    P.add_displace(master, "socket_wave", "CLOUDS", 0.050, 0.0010, "tmp_socket", noise_depth=2)
    P.add_displace(master, "bronze_hammer", "CLOUDS", 0.012, 0.0007, "tmp_bronze", noise_depth=2)
    h_stone, kit_s = P.stone_material("H_Stone", lichen_top=0.14, scale=1.3, pale=0.55, lichen=0.55,
                                     cracks=0.85, dirt_strength=0.5)
    h_bronze, kit_b = P.bronze_material("H_Bronze", patina=0.35)
    h_socket, kit_k = slate_material("H_Socket")
    slot = {s.material.name: i for i, s in enumerate(master.material_slots)}
    master.material_slots[slot["tmp_stone"]].material = h_stone
    master.material_slots[slot["tmp_bronze"]].material = h_bronze
    master.material_slots[slot["tmp_socket"]].material = h_socket
    kits = [kit_s, kit_b, kit_k]
    stats["master_triangles"] = P.evaluated_tris(master)
    P.log("master triangles", stats["master_triangles"])

    clock.start("inspect_mesh")
    insp = P.duplicate(body, f"{ASSET}_inspect_body", work)
    P.crease_edges(insp)
    s = insp.modifiers.new("smooth", "SUBSURF")
    s.levels = s.render_levels = 1
    s.uv_smooth = "PRESERVE_BOUNDARIES"
    sw = insp.modifiers.new("fit", "SHRINKWRAP")
    sw.target, sw.wrap_method = master, "NEAREST_SURFACEPOINT"
    P.apply_modifiers(insp)
    P.finish_shading(insp, angle=40)

    clock.start("bake_gpu")
    # Body keeps its material slots (stone / bronze / socket) but every slot gets
    # a bake-target material for the duration of the bake.
    body_slots = [s.material for s in body.material_slots]
    insp_slots = [s.material for s in insp.material_slots]
    for o in (body, insp):
        for i, sl in enumerate(o.material_slots):
            sl.material = P.bake_target_material(f"bake_{o.name}_{i}")
    imgs, stats["bakes"] = P.run_bakes(sc, master, kits, (
        ("normal", "NORMAL", body, 64, "bsdf"),
        ("normal_inspect", "NORMAL", insp, 64, "bsdf"),
        ("color", "EMIT", body, 64, "color"),
        ("rough", "EMIT", body, 32, "rough"),
        ("metal", "EMIT", body, 32, "metal"),
        ("ao", "AO", body, 1024, "bsdf")), BAKE_SIZE, cage=0.02, ray=0.05)

    clock.start("textures")
    paths, stats["texture_files"] = P.write_textures(imgs, BAKE_SIZE, TEX_SIZE, TEX_DIR, ASSET, REPO)
    for img in imgs.values():
        bpy.data.images.remove(img)

    clock.start("materials")
    tex = P.load_textures(paths)
    m_body = P.textured_material("M_ScrollTable_Body", tex["base"], tex["orm"], tex["normal"])
    m_sock = P.textured_material("M_ScrollTable_Socket", tex["base"], tex["orm"], tex["normal"])
    m_body_i = P.textured_material("M_ScrollTable_Body_Inspect", tex["base"], tex["orm"],
                                   tex["normal_inspect"])
    m_sock_i = P.textured_material("M_ScrollTable_Socket_Inspect", tex["base"], tex["orm"],
                                   tex["normal_inspect"])
    final = {"tmp_stone": m_body, "tmp_bronze": m_body, "tmp_socket": m_sock}
    final_i = {"tmp_stone": m_body_i, "tmp_bronze": m_body_i, "tmp_socket": m_sock_i}
    for o, orig, table in ((body, body_slots, final), (insp, insp_slots, final_i)):
        for sl, mat in zip(o.material_slots, orig):
            sl.material = table[mat.name]
    for o in (body, insp):     # stone and bronze slots now share the body material
        _merge_duplicate_slots(o)
    master.hide_render = True
    master.hide_set(True)

    clock.start("assemble_export")
    out = P.new_collection("Export")
    amber_i = P.duplicate(amber, "amber_i", work)
    runtime = P.join([body, amber], ASSET)
    inspect = P.join([insp, amber_i], f"{ASSET}_inspect")
    for o in (runtime, inspect):
        work.objects.unlink(o)
        out.objects.link(o)
    cols = build_collision(out)
    for c in cols:
        P.triangulate_ngons(c)
    sockets = build_sockets(out)
    stats["runtime_triangles"] = P.mesh_tris(runtime)
    stats["inspect_triangles"] = P.mesh_tris(inspect)
    if stats["inspect_triangles"] > INSPECT_TRI_BUDGET:
        ratio = (INSPECT_TRI_BUDGET - 400) / stats["inspect_triangles"]
        dec = inspect.modifiers.new("budget", "DECIMATE")
        dec.ratio = ratio
        P.apply_modifiers(inspect)
        stats["inspect_decimated_ratio"] = round(ratio, 4)
        stats["inspect_triangles"] = P.mesh_tris(inspect)
    stats["collision_triangles"] = {o.name: P.mesh_tris(o) for o in cols}
    stats["materials_runtime"] = [s.material.name for s in runtime.material_slots]
    stats["materials_inspect"] = [s.material.name for s in inspect.material_slots]
    lo, hi = P.world_bounds([runtime])
    stats["bounds_blender_zup"] = {"min": [round(x, 4) for x in lo], "max": [round(x, 4) for x in hi]}
    stats["glb_bytes"] = P.export_glb(GLB_PATH, [runtime, inspect] + cols + sockets, runtime)
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


def _merge_duplicate_slots(obj):
    """Collapse material slots that reference the same material."""
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
    "front": ((0, -14, 0.9), (0, 0, 0.9), 5.3, None),
    "side": ((14, 0, 0.9), (0, 0, 0.9), 5.3, None),
    "three_quarter": ((5.6, -6.6, 4.9), (0, 0, 0.2), None, 50),
    "top": ((0, 0, 12), (0, 0, 0), 3.75, None),
}
CLOSE_VIEWS = {
    "close_socket": ((0.70, -2.25, 1.40), (0.0, -0.88, 0.38), None, 50),
    "close_center": ((0.40, -0.95, 1.20), (0, 0, 0.36), None, 62),
    "close_base": ((1.95, -2.95, 0.55), (0.82, -1.38, 0.18), None, 42),
}


def stage_render(res=1600, samples=512):
    clock = P.StageClock()
    clock.start("qa_renders")
    sc = P.reset_scene()
    P.setup_render(sc, res=res, samples=samples)
    device = P.use_gpu(sc)
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 92
    env = P.new_collection("ReviewEnv")
    P.add_lights(env)
    P.add_ground_and_scale(env, ground_r=6.0, ruler_x=-2.15, ruler_y=0.0,
                           human_at=(2.30, 0.55))
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    objs = {o.name: o for o in bpy.context.scene.objects}
    runtime, inspect = objs[ASSET], objs[f"{ASSET}_inspect"]
    cols = [o for n, o in objs.items() if n.endswith("_col")]
    sockets = [o for n, o in objs.items() if n.startswith("socket_")]

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
    sm = P.mat_simple("SocketMarker", (0.1, 0.5, 0.95), 0.4, emit=(0.1, 0.5, 0.95), emit_strength=2.0)
    for s in sockets:
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.035)
        mk = P.bm_object(f"marker_{s.name}", bm, sm, env)
        mk.location = s.matrix_world.translation
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
    STOP_AFTER_MASTER = stage == "master"
    {"build": stage_build, "master": stage_build, "render": stage_render,
     "all": lambda: (stage_build(), stage_render())}[stage]()

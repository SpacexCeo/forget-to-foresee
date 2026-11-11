"""Procedural source of the town on the ground (T-001) and the Tournament altar (A-001).

Run headless with Blender 4.5 LTS from the repository root:

    blender -b -P art/town/build_town.py -- textures   # bake the tiling texture sets (GPU)
    blender -b -P art/town/build_town.py -- build      # geometry, collision, sockets, raw .glb export
    blender -b -P art/town/build_town.py -- render     # QA renders of the exported .glb files (GPU)
    blender -b -P art/town/build_town.py -- all

`build` without baked textures (art/town/textures/ is empty) exports the blockout: the same geometry
with flat vertex-coloured materials. Raw exports go to art/town/out/ (not committed); the shipped,
compressed files are made by art/town/compress_town.sh into game/public/assets/models/town/.

Pieces (one .glb each, pivot on the ground, Y up, metres):
    town_terrain        terraces, retaining walls, stairs, ramps, town wall, gatehouse, cliff, slopes
    town_block_gate     houses and props of the gate court and the lower lane
    town_block_mid      houses and props of the middle terrace
    town_block_square   houses and props around the square
    town_temple         the round shrine, its two houses and trees
    town_altar          the Tournament altar (hero): dais, ring, amber core; altar_focus, altar_stand
    town_sky            the far archipelago in the sky (impostor, visual only)
    town_shop_exchange / town_shop_scribe / town_shop_inn   walkable shop interiors (S-001..S-003)
Every piece carries `<piece>_col` collision meshes and `socket_lamp_*` empties for warm lights.
The layout is art/town/town_plan.py; the client contract game/src/scenes/town-data.js is written here.
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
sys.path.insert(0, os.path.join(HERE, "..", "common"))
sys.path.insert(0, HERE)
import ftf  # noqa: E402
import town_plan as P  # noqa: E402
import town_geo  # noqa: E402
from town_geo import TownBuilder, T, RY, bl  # noqa: E402
import town_terrain  # noqa: E402
import town_houses as H  # noqa: E402
import town_altar  # noqa: E402
import town_shops  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.path.join(HERE, "out")
TEX_DIR = os.path.join(HERE, "textures")
QA_DIR = os.path.join(REPO, "docs", "art", "town", "qa")
DATA_JS = os.path.join(REPO, "game", "src", "scenes", "town-data.js")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")
TAG = "town"

# Tiling sets: metres per texture repeat. Vertex colour multiplies the base colour.
TILE = {"cobble": 3.0, "ground": 6.0, "stone": 3.0, "rock": 9.0, "timber": 1.6, "roof": 2.4,
        "plaster": 3.5, "cloth": 1.2, "foliage": 2.5, "altar_stone": 2.4}
TEX_OF = {"altar_stone": "stone"}          # material key -> texture set when it differs
FLAT = {  # blockout colours (linear) standing in for the tiling base colour
    "cobble": (0.30, 0.28, 0.25), "ground": (0.16, 0.22, 0.09), "stone": (0.36, 0.34, 0.30), "rock": (0.22, 0.22, 0.21),
    "timber": (0.36, 0.30, 0.24), "roof": (0.50, 0.20, 0.10), "plaster": (0.72, 0.68, 0.60), "cloth": (0.75, 0.72, 0.66),
    "foliage": (0.20, 0.32, 0.10), "altar_stone": (0.40, 0.38, 0.34),
}
MAT_NAME = {"altar_stone": "M_Altar_Stone", "altar_core": "M_Altar_Core", "altar_metal": "M_Altar_Metal"}
SHADE_ANGLE = {"foliage": 80, "flower": 80, "sky": 50, "pearl": 42}


def log(*a):
    ftf.log(TAG, *a)


# ------------------------------------------------------------------ content

def populate(tb):
    town_terrain.build(tb)
    lamp_i = 0
    shop_of = {sp["house"]: sp["icon"] for sp in P.SHOPS}
    plasters = ["ivory", "ochre", "ivory2", "ivory", "ochre2", "ivory2"]
    for n_h, (hid, block, tname, cx, cz, w, d, face, kind) in enumerate(P.HOUSES):
        tb.piece = P.BLOCKS[block]["name"]
        y = P.TERRACE_Y[tname]
        dx, dz, drot = P.HOUSE_TWEAK.get(hid, (0.0, 0.0, 0.0))
        with tb.at(T(cx + dx, y, cz + dz), RY(P.FACING[face] + drot)):
            H.house(tb, w, d, kind, seed=hash_id(hid), lamp_name=f"socket_lamp_{hid}", roof=H.ROOF_ORDER[(n_h * 3 + n_h // 6) % len(H.ROOF_ORDER)],
                    plaster=plasters[(n_h * 5 + n_h // 6) % len(plasters)], shop=shop_of.get(hid), smoke_name=f"socket_smoke_{hid}")
        lamp_i += 1
    for i, (bx, bz, brot, btn) in enumerate(P.BENCHES):
        tb.piece = P.BLOCKS[{"t0": "gate", "t1": "mid", "t2": "square", "t3": "temple"}[btn]]["name"]
        H.bench(tb, bx, bz, P.TERRACE_Y[btn], brot)
    y0, y1, y2, y3 = (P.TERRACE_Y[k] for k in ("t0", "t1", "t2", "t3"))

    tb.piece = P.BLOCKS["gate"]["name"]
    H.lamp_post(tb, -8.9, 31.6, y0, "socket_lamp_court_w")
    H.lamp_post(tb, 8.9, 31.6, y0, "socket_lamp_court_e")
    for i, x in enumerate((17.2, 21.8, 26.4)):
        H.stall(tb, x, 13.4, y0, rot=0.0, seed=40 + i)
    H.cart(tb, -18.5, 15.2, y0, rot=70)
    rr = random.Random(7)
    for (x, z) in ((-24.0, 13.0), (-23.1, 13.2), (-23.6, 13.9), (9.0, 21.0), (8.6, 21.9), (-46.5, 14.0), (33.0, 21.2)):
        H.barrel(tb, x, z, y0, rr=rr)
    for (x, z, s, r) in ((-26.0, 13.1, 0.8, 8), (-27.0, 13.2, 0.7, -12), (-26.4, 13.2, 0.6, 30), (10.2, 13.1, 0.8, 5), (11.1, 13.2, 0.65, 40), (-9.0, 21.2, 0.75, 14)):
        H.crate(tb, x, z, y0 + (0.8 if s == 0.6 else 0.0), s, r)
    H.banner(tb, -5.9, 19.0, y0, rot=0)
    H.banner(tb, 5.9, 19.0, y0, rot=180, col=(0.20, 0.30, 0.34))
    H.tree(tb, -48.5, 16.0, y0, seed=3)
    H.tree(tb, 48.5, 17.0, y0, seed=4, h=6.2)
    H.tree(tb, -33.6, 29.0, y0, seed=5, h=5.0, r=1.9)
    H.tree(tb, 33.6, 30.0, y0, seed=6, h=5.6)
    H.planter(tb, -8.9, 25.0, y0, rot=90, seed=1)
    H.planter(tb, 8.9, 26.5, y0, rot=90, seed=2)

    tb.piece = P.BLOCKS["mid"]["name"]
    for i, x in enumerate((-36.0, -14.0, 14.0, 37.0)):
        H.lamp_post(tb, x, 11.1, y1, f"socket_lamp_lane_{i}")
    H.tree(tb, -32.4, 3.4, y1, seed=11, h=6.0, r=2.5)
    H.tree(tb, 37.0, 5.6, y1, seed=12, h=5.0, r=2.0)
    for (x, z) in ((-16.3, 2.0), (-15.7, 2.8), (-16.5, 3.6), (27.6, 6.6), (28.4, 6.9)):
        H.barrel(tb, x, z, y1, rr=rr)
    for (x, z, s, r) in ((-16.1, 5.4, 0.8, 10), (16.0, 6.6, 0.8, 0), (16.1, 6.6, 0.6, 25), (-27.4, 6.8, 0.7, 20)):
        H.crate(tb, x, z, y1 + (0.8 if s == 0.6 else 0.0), s, r)
    H.planter(tb, -28.2, 1.2, y1, w=2.0, seed=3)
    H.planter(tb, -36.4, 1.2, y1, w=2.0, seed=4)
    H.banner(tb, -4.9, 3.6, y1, rot=0, col=(0.45, 0.30, 0.12))
    H.banner(tb, 4.9, 3.6, y1, rot=180)

    tb.piece = P.BLOCKS["square"]["name"]
    for i, (x, z) in enumerate(((-7.6, -4.4), (7.6, -4.4), (-7.6, -17.6), (7.6, -17.6))):
        H.lamp_post(tb, x, z, y2, f"socket_lamp_square_{i}")
    H.banner(tb, -6.6, -20.6, y2, rot=0)
    H.banner(tb, 6.6, -20.6, y2, rot=180)
    H.stall(tb, 11.6, -4.6, y2, rot=-90, seed=51)
    H.stall(tb, 11.6, -15.4, y2, rot=-90, seed=52)
    H.stall(tb, -11.6, -15.2, y2, rot=90, seed=53)
    H.well(tb, -10.2, -25.6, y2)
    H.cart(tb, 9.6, -24.6, y2, rot=-25)
    H.tree(tb, 10.6, -27.4, y2, seed=21, h=5.2, r=2.0)
    H.tree(tb, -33.0, -22.0, y2, seed=22, h=6.4, r=2.6)
    H.tree(tb, 42.0, -24.5, y2, seed=23, h=6.0, r=2.4)
    H.tree(tb, 46.0, -6.0, y2, seed=24, h=5.2)
    H.planter(tb, -13.2, -3.2, y2, rot=90, seed=5)
    H.planter(tb, 13.2, -3.2, y2, rot=90, seed=6)
    for (x, z) in ((-12.6, -26.6), (-12.0, -27.4), (12.6, -1.0 - 2.6)):
        H.barrel(tb, x, z, y2, rr=rr)
    for (x, z, s, r) in ((12.4, -10.2, 0.8, 12), (12.5, -10.2, 0.6, 33), (-12.3, -11.0, 0.75, -8)):
        H.crate(tb, x, z, y2 + (0.8 if s == 0.6 else 0.0), s, r)

    tb.piece = P.BLOCKS["temple"]["name"]
    with tb.at(T(P.TEMPLE["x"], P.TEMPLE["y"], P.TEMPLE["z"])):
        town_altar.shrine(tb)
    for i, (x, z, hh, r) in enumerate(((-18.5, -34.6, 5.6, 2.2), (18.5, -34.6, 5.8, 2.3), (-44.5, -36.0, 6.6, 2.6), (44.0, -37.5, 6.2, 2.4), (42.0, -51.0, 7.0, 2.8), (-45.0, -52.0, 6.8, 2.7), (-16.0, -52.5, 6.0, 2.4), (20.0, -53.0, 6.4, 2.5))):
        H.tree(tb, x, z, y3, seed=31 + i, h=hh, r=r)
    H.banner(tb, -12.6, -33.4, y3, rot=0, h=6.0)
    H.banner(tb, 12.6, -33.4, y3, rot=180, h=6.0)
    H.lamp_post(tb, -16.0, -31.2, y3, "socket_lamp_terrace_w")
    H.lamp_post(tb, 16.0, -31.2, y3, "socket_lamp_terrace_e")
    H.planter(tb, -22.0, -31.0, y3, w=2.4, seed=7)
    H.planter(tb, 22.0, -31.0, y3, w=2.4, seed=8)

    tb.piece = "town_altar"
    with tb.at(T(P.ALTAR["x"], P.ALTAR["y"], P.ALTAR["z"])):
        town_altar.altar(tb)

    tb.piece = "town_sky"
    with tb.at(T(P.SKY["x"], P.SKY["y"], P.SKY["z"])):
        town_altar.sky_archipelago(tb, P.SKY["scale"])

    for sp in P.SHOPS:
        tb.piece = sp["piece"]
        town_shops.BUILDERS[sp["id"]](tb)


def hash_id(s):
    h = 2166136261
    for ch in s:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h


PIVOT = {"town_terrain": (0.0, 0.0, 0.0), "town_altar": (P.ALTAR["x"], P.ALTAR["y"], P.ALTAR["z"]),
         "town_sky": (P.SKY["x"], P.SKY["y"], P.SKY["z"])}
for _b in P.BLOCKS.values():
    PIVOT[_b["name"]] = _b["pivot"]
KIND = {"town_terrain": "town_terrain", "town_altar": "town_hero", "town_sky": "town_sky"}
for _s in P.SHOPS:
    PIVOT[_s["piece"]] = (0.0, 0.0, 0.0)
    KIND[_s["piece"]] = "town_interior"


# ------------------------------------------------------------------ materials

def vc_material(name, base, rough=0.85, metal=0.0, emit=0.0, double_sided=False):
    """Untextured material whose base colour is the vertex colour times `base`."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = not double_sided
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[7].default_value = (*base, 1.0)
    nt.links.new(vc.outputs["Color"], mix.inputs[6])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        nt.links.new(mix.outputs[2], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = emit
    return m


def have_textures():
    return all(os.path.exists(os.path.join(TEX_DIR, f"town_{s}_{ch}.jpg"))
               for s in set(TEX_OF.get(k, k) for k in TILE) for ch in ("basecolor", "orm", "normal"))


def make_materials():
    mats = {}
    textured = have_textures()
    imgs = {}
    for key in TILE:
        name = MAT_NAME.get(key, "M_Town_" + key.capitalize())
        if textured:
            tset = TEX_OF.get(key, key)
            for ch in ("basecolor", "orm", "normal"):
                if (tset, ch) not in imgs:
                    im = bpy.data.images.load(os.path.join(TEX_DIR, f"town_{tset}_{ch}.jpg"))
                    if ch != "basecolor":
                        im.colorspace_settings.name = "Non-Color"
                    imgs[(tset, ch)] = im
            mats[key] = ftf.pbr_material(name, imgs[(tset, "basecolor")], imgs[(tset, "orm")], imgs[(tset, "normal")],
                                         vertex_color=True, double_sided=(key in ("foliage", "cloth")))
        else:
            mats[key] = vc_material(name, FLAT[key], double_sided=(key in ("foliage", "cloth")))
    # wildflower heads: no texture, the vertex colour is the petal; the name keeps them in the foliage wind
    mats["flower"] = vc_material("M_Town_Foliage_Flower", (1.0, 1.0, 1.0), rough=0.8, double_sided=True)
    mats["glass"] = ftf.simple_material("M_Town_Glass", (0.035, 0.05, 0.06), 0.12, metal=0.0)
    mats["glass_lit"] = ftf.simple_material("M_Town_GlassLit", (0.55, 0.36, 0.14), 0.4, emit=(1.0, 0.62, 0.24), emit_strength=0.9)
    mats["lamp"] = ftf.simple_material("M_Town_Lamp", (1.0, 0.72, 0.38), 0.4, emit=(1.0, 0.62, 0.26), emit_strength=1.6)
    # emission hierarchy (GPT review): core : glyph inlays : waystone eyes about 1 : 0.3 : 0.1
    core = vc_material("M_Altar_Core", (1.0, 0.50, 0.12), rough=0.16)
    cb = core.node_tree.nodes["Principled BSDF"]
    cb.inputs["Emission Color"].default_value = (1.0, 0.46, 0.08, 1.0)
    cb.inputs["Emission Strength"].default_value = 1.5
    mats["altar_core"] = core
    glyph = ftf.simple_material("M_Altar_Glyph", (0.95, 0.56, 0.14), 0.3, emit=(1.0, 0.52, 0.10), emit_strength=0.6)
    for k in range(16):
        mats[f"altar_glyph_{k:02d}"] = glyph
    mats["altar_eye"] = ftf.simple_material("M_Altar_Eye", (0.9, 0.55, 0.18), 0.35, emit=(1.0, 0.55, 0.14), emit_strength=0.2)
    mats["ink"] = ftf.simple_material("M_Shop_Ink", (0.02, 0.022, 0.03), 0.5)
    mats["fire"] = ftf.simple_material("M_Shop_Fire", (1.0, 0.5, 0.1), 0.5, emit=(1.0, 0.42, 0.06), emit_strength=5.0)
    # Interior-only materials (S-001..S-003). Interiors are lit by their baked vertex colour under a plain
    # ambient light in the client, so nothing here is a true metal (a metal has no diffuse and would go black).
    mats["window_day"] = vc_material("M_Shop_Daylight", (1.0, 1.0, 1.0), rough=0.9)          # painted daylight, never baked
    mats["bronze"] = vc_material("M_Shop_Bronze", (0.80, 0.56, 0.26), rough=0.38, metal=0.2)
    mats["iron"] = vc_material("M_Shop_Iron", (0.10, 0.095, 0.09), rough=0.6)
    mats["ceramic"] = vc_material("M_Shop_Ceramic", (1.0, 1.0, 1.0), rough=0.45)
    mats["paper"] = vc_material("M_Shop_Paper", (0.93, 0.87, 0.72), rough=0.9, double_sided=True)
    mats["wax"] = vc_material("M_Shop_Wax", (1.0, 0.95, 0.84), rough=0.5)
    for key, name, base, emit in (("shard", "M_Shop_Shard", (0.62, 0.50, 0.98), (0.30, 0.20, 0.62)),
                                  ("shard_amber", "M_Shop_ShardAmber", (1.0, 0.66, 0.30), (0.62, 0.30, 0.06))):
        m = vc_material(name, base, rough=0.14)
        mb = m.node_tree.nodes["Principled BSDF"]
        mb.inputs["Emission Color"].default_value = (*emit, 1.0)
        mb.inputs["Emission Strength"].default_value = 1.0
        mats[key] = m
    mats["case_glass"] = ftf.simple_material("M_Shop_CaseGlass", (0.80, 0.90, 0.96), 0.06, alpha=0.16, double_sided=True)
    mats["water"] = ftf.simple_material("M_Town_Water", (0.05, 0.10, 0.11), 0.06)
    mats["altar_metal"] = ftf.simple_material("M_Altar_Metal", (0.66, 0.44, 0.20), 0.38, metal=1.0)
    mats["pearl"] = vc_material("M_Town_Pearl", (0.93, 0.89, 0.82), rough=0.3, metal=0.0)
    mats["sky"] = vc_material("M_Town_Sky", (1.0, 1.0, 1.0), rough=1.0)
    return mats, textured


def color_fn_for(piece, mat):
    """Cheap grounding: vertical faces darken toward the ground they stand on, undersides darken."""
    if mat in ("sky", "pearl", "foliage", "flower", "lamp", "glass", "glass_lit", "altar_metal", "altar_eye", "water", "window_day", "shard", "shard_amber", "ink", "fire", "bronze", "iron", "ceramic", "paper", "wax", "case_glass") or piece.startswith("town_shop_") or mat.startswith(("altar_glyph", "altar_core")) or piece == "town_sky":
        return None
    px, py, pz = PIVOT[piece]
    terrain = piece == "town_terrain"

    def fn(p, n, c):
        k = 1.0
        if n[2] < -0.5:
            k *= 0.72
        elif abs(n[2]) < 0.6 and not terrain:
            gx, gz, gy = p[0], -p[1], p[2]
            hgt = gy if piece.startswith("town_shop_") else (gy - P.terrace_at(gz)[1] if piece != "town_altar" else gy - P.ALTAR["y"])
            k *= 0.70 + 0.30 * max(0.0, min(1.0, hgt / 1.4))
        return (c[0] * k, c[1] * k, c[2] * k)
    _ = (px, py, pz)
    return fn


def build_objects(tb, mats):
    out = ftf.new_collection("Export")
    pieces = {}
    node_meshes = {}
    for (piece, mat, node), geo in sorted(tb.geos.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2] or "")):
        if not geo.f:
            continue
        o = geo.to_object(f"{node or piece}_{mat}", mats[mat], out, uv_tile=TILE.get(mat, 1.0), color_fn=color_fn_for(piece, mat))
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0005)
        bm.to_mesh(o.data)
        bm.free()
        ftf.triangulate_ngons(o)
        ftf.finish_shading(o, angle=SHADE_ANGLE.get(mat, 38))
        MAT_KEY[o.name] = mat
        grp = pieces.setdefault(piece, {"meshes": [], "cols": [], "sockets": [], "nodes": []})
        grp["meshes"].append(o)
        if node:
            node_meshes.setdefault((piece, node), []).append(o)
    for piece, bm in tb.cols.items():
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0005)
        o = ftf.bm_object(f"{piece}_col", bm, None, out)
        ftf.triangulate_ngons(o)
        pieces[piece]["cols"].append(o)
    for piece, socks in tb.sockets.items():
        for name, pos, rot, props in socks:
            e = ftf.add_empty(name, bl(pos), out, math.radians(rot), dict(props, socket=name.replace("socket_", "")), 0.3)
            pieces[piece]["sockets"].append(e)
    # move every piece so its pivot is the origin
    for piece, grp in pieces.items():
        pv = Vector(bl(PIVOT[piece]))
        for o in grp["meshes"] + grp["cols"]:
            o.data.transform(Matrix.Translation(-pv))
        for e in grp["sockets"]:
            e.location = Vector(e.location) - pv
    # separate rigid nodes (hanging signs, lantern heads): an empty at the hook, the meshes as its children
    for (piece, node), info in sorted(tb.nodes.items()):
        meshes = node_meshes.get((piece, node), [])
        if not meshes:
            continue
        hook = Vector(bl(info["pivot"])) - Vector(bl(PIVOT[piece]))
        e = ftf.add_empty(node, hook, out, 0.0, dict(info["props"], swing=node.split("_")[1]), 0.2)
        for o in meshes:
            o.data.transform(Matrix.Translation(-hook))
            o.parent = e
        pieces[piece]["nodes"].append(e)
    bpy.context.view_layer.update()
    return pieces


MAT_KEY = {}   # object name -> material key


# ------------------------------------------------------------------ interior light bake

# Mean albedo per material key for the bounce light of the bake (the tiling base colours are not sampled there).
BAKE_ALBEDO = {"timber": (0.34, 0.24, 0.16), "stone": (0.42, 0.40, 0.36), "plaster": (0.70, 0.66, 0.58), "cloth": (0.62, 0.60, 0.56),
               "cobble": (0.30, 0.28, 0.25), "foliage": (0.20, 0.30, 0.10), "bronze": (0.55, 0.38, 0.18), "iron": (0.08, 0.08, 0.08),
               "ceramic": (0.8, 0.8, 0.8), "paper": (0.80, 0.74, 0.60), "wax": (0.85, 0.80, 0.70), "ink": (0.03, 0.03, 0.04),
               "shard": (0.5, 0.4, 0.8), "shard_amber": (0.8, 0.5, 0.2), "altar_metal": (0.5, 0.35, 0.16)}
BAKE_EMIT = {"lamp": ((1.0, 0.62, 0.26), 6.0), "fire": ((1.0, 0.40, 0.08), 14.0), "shard": ((0.55, 0.42, 1.0), 1.5),
             "shard_amber": ((1.0, 0.55, 0.16), 1.5), "window_day": (None, 5.0)}
BAKE_SKIP = ("lamp", "fire", "window_day", "case_glass", "glass_lit", "glass")   # keep their authored colour
BAKE_EDGE = float(os.environ.get("TOWN_BAKE_EDGE", "0.34"))       # longest edge after tessellation, metres
BAKE_SAMPLES = int(os.environ.get("TOWN_BAKE_SAMPLES", "768"))
BAKE_MID = 0.50                                                     # where the median lit surface lands (0..1)


def _bake_material(key):
    m = bpy.data.materials.new("Bake_" + key)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    outn = nt.nodes.new("ShaderNodeOutputMaterial")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    if key == "window_day":
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Strength"].default_value = BAKE_EMIT[key][1]
        nt.links.new(vc.outputs["Color"], em.inputs["Color"])
        nt.links.new(em.outputs[0], outn.inputs["Surface"])
        return m
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[7].default_value = (*BAKE_ALBEDO.get(key, (0.5, 0.5, 0.5)), 1.0)
    nt.links.new(vc.outputs["Color"], mix.inputs[6])
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    nt.links.new(mix.outputs[2], dif.inputs["Color"])
    if key in BAKE_EMIT:
        col, strength = BAKE_EMIT[key]
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*col, 1.0)
        em.inputs["Strength"].default_value = strength
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(dif.outputs[0], add.inputs[0])
        nt.links.new(em.outputs[0], add.inputs[1])
        nt.links.new(add.outputs[0], outn.inputs["Surface"])
    else:
        nt.links.new(dif.outputs[0], outn.inputs["Surface"])
    return m


def tessellate(o, max_edge):
    """Splits long edges so the per-vertex light bake has something to hold the falloff."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for _ in range(8):
        long_edges = [e for e in bm.edges if e.calc_length() > max_edge]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(o.data)
    bm.free()


def bake_interior(sc, piece, grp, tb, all_objects, exposure=1.0):
    """Bakes the room's own lamps, hearth and window light (Cycles, diffuse direct + indirect, no colour)
    into the vertex colour of every mesh of an interior: Col = tint x light. The client shows interiors
    under a plain ambient light, so this is the whole lighting of the room on every quality tier."""
    import numpy as np
    meshes = [o for o in grp["meshes"]]
    # everything else that renders (other pieces, every *_col collision mesh) is hidden during the bake: the
    # collision floor and furniture boxes would otherwise occlude the room
    others = [o for o in bpy.data.objects if o.type == "MESH" and o not in meshes and not o.hide_render]
    for o in others:
        o.hide_render = True
    lights = []
    for i, L in enumerate(tb.lights.get(piece, [])):
        lt = bpy.data.lights.new(f"bake_{piece}_{i}", "POINT")
        lt.energy = L["power"]
        lt.color = L["color"]
        lt.shadow_soft_size = L["radius"]
        lo = bpy.data.objects.new(lt.name, lt)
        sc.collection.objects.link(lo)
        lo.location = bl(L["pos"])
        lights.append(lo)
    world = bpy.data.worlds.new("BakeWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.9, 0.75, 0.6, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.012
    sc.world = world
    sc.render.engine = "CYCLES"
    sc.cycles.samples = BAKE_SAMPLES
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 4
    sc.cycles.sample_clamp_indirect = 8.0
    sc.render.bake.target = "VERTEX_COLORS"
    sc.render.bake.use_pass_direct = True
    sc.render.bake.use_pass_indirect = True
    sc.render.bake.use_pass_color = False
    bake_mats, keep = {}, {}
    for o in meshes:
        key = MAT_KEY[o.name]
        if key not in BAKE_SKIP:
            tessellate(o, BAKE_EDGE)
        keep[o.name] = o.data.materials[0]
        if key == "case_glass":
            o.hide_render = True
            continue
        if key not in bake_mats:
            bake_mats[key] = _bake_material(key)
        o.data.materials[0] = bake_mats[key]
    lit = [o for o in meshes if MAT_KEY[o.name] not in BAKE_SKIP]
    for o in lit:
        la = o.data.color_attributes.new("Light", "FLOAT_COLOR", "CORNER")
        o.data.color_attributes.active_color = la
        ftf.select_only([o], o)
        r = bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, target="VERTEX_COLORS")
        if r != {"FINISHED"}:
            log("bake", o.name, "returned", r)
    # exposure from the median lit wall / floor / furniture corner, then a soft shoulder per channel
    data = {}
    lum_all = []
    for o in lit:
        n = len(o.data.loops)
        a = np.zeros(n * 4, dtype=np.float32)
        o.data.color_attributes["Light"].data.foreach_get("color", a)
        a = a.reshape(n, 4)[:, :3]
        data[o.name] = a
        if os.environ.get("TOWN_BAKE_DEBUG"):
            log("bake max", o.name, MAT_KEY[o.name], float(a.max()), "zero", round(float((a.max(axis=1) <= 0).mean()), 3), "n", len(a), "active", o.data.color_attributes.active_color.name, "render", o.hide_render)
        if MAT_KEY[o.name] in ("plaster", "timber", "stone"):
            lum_all.append(a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))
    med = float(np.median(np.concatenate(lum_all)))
    k = -math.log(1.0 - BAKE_MID) / max(med, 1e-6) * exposure
    for o in lit:
        n = len(o.data.loops)
        c = np.zeros(n * 4, dtype=np.float32)
        o.data.color_attributes["Col"].data.foreach_get("color", c)
        c = c.reshape(n, 4)
        light = np.maximum(1.0 - np.exp(-k * data[o.name]), 0.03)
        c[:, :3] = np.clip(c[:, :3] * light, 0.0, 1.0)
        o.data.color_attributes["Col"].data.foreach_set("color", c.ravel())
        o.data.color_attributes.remove(o.data.color_attributes["Light"])
        o.data.color_attributes.active_color = o.data.color_attributes["Col"]
        try:
            o.data.color_attributes.render_color_index = o.data.color_attributes.active_color_index
        except AttributeError:
            pass
    for o in meshes:
        o.data.materials[0] = keep[o.name]
        o.hide_render = False
    for lo in lights:
        bpy.data.objects.remove(lo, do_unlink=True)
    for o in others:
        o.hide_render = False
    log("bake", piece, "objects", len(lit), "lights", len(lights), "median", round(med, 4), "k", round(k, 3))
    return {"median": med, "k": k, "lights": len(lights)}


def stage_build(only=None):
    clock = ftf.StageClock(TAG)
    clock.start("geometry")
    ftf.reset_scene()
    tb = TownBuilder()
    populate(tb)
    clock.start("objects")
    mats, textured = make_materials()
    pieces = build_objects(tb, mats)
    clock.start("export")
    os.makedirs(OUT_DIR, exist_ok=True)
    stats = {"textured": textured, "pieces": {}}
    data_pieces = []
    order = ["town_terrain", "town_block_gate", "town_block_mid", "town_block_square", "town_temple", "town_altar", "town_sky"] + [sp["piece"] for sp in P.SHOPS]
    data_interiors = []
    only = set(only or [])
    all_meshes = [o for g in pieces.values() for o in g["meshes"]]
    if not os.environ.get("TOWN_NO_BAKE"):
        clock.start("bake")
        sc = bpy.context.scene
        ftf.use_gpu(sc, TAG)
        for sp in P.SHOPS:
            if only and sp["piece"] not in only:
                continue
            stats.setdefault("bake", {})[sp["piece"]] = bake_interior(sc, sp["piece"], pieces[sp["piece"]], tb, all_meshes, sp.get("exposure", 1.0))
        clock.start("export")
    for piece in order:
        grp = pieces[piece]
        path = os.path.join(OUT_DIR, piece + ".glb")
        if only and piece not in only:
            continue
        size = ftf.export_glb(path, grp["meshes"] + grp["cols"] + grp["sockets"] + grp["nodes"])
        info = ftf.inspect_glb(path)
        lo, hi = ftf.world_bounds(grp["meshes"])
        pv = PIVOT[piece]
        # bounds back in game space, town-local
        gmin = (lo.x + pv[0], lo.z + pv[1], -hi.y + pv[2])
        gmax = (hi.x + pv[0], hi.z + pv[1], -lo.y + pv[2])
        if piece == "town_terrain":   # streaming bounds: the walled town, not the far slopes
            gmin, gmax = (-60.0, -6.0, -70.0), (60.0, 34.0, 42.0)
        center = [round((a + b) / 2, 2) for a, b in zip(gmin, gmax)]
        radius = round(0.5 * math.dist(gmin, gmax), 1)
        stats["pieces"][piece] = {"raw_bytes": size, "triangles": info["triangles_render"], "collision_triangles": info["triangles_collision"],
                                  "materials": [m["name"] for m in info["materials"]], "nodes": {k: v["triangles"] for k, v in info["nodes"].items()},
                                  "sockets": sorted(e.name for e in grp["sockets"]), "swing": sorted(e.name for e in grp["nodes"]), "bounds_min": [round(v, 2) for v in gmin], "bounds_max": [round(v, 2) for v in gmax]}
        entry = {"name": piece, "kind": KIND.get(piece, "town_block"), "position": [round(v, 3) for v in pv], "center": center, "radius": radius}
        (data_interiors if piece.startswith("town_shop_") else data_pieces).append(entry)
        log(piece, "tris", info["triangles_render"], "col", info["triangles_collision"], "bytes", size)
    clock.stop()
    stats["stages"] = clock.stages
    os.makedirs(QA_DIR, exist_ok=True)
    if only:   # a partial rebuild (art iteration): the contract and the full stats are left alone
        with open(os.path.join(OUT_DIR, "partial-stats.json"), "w") as fh:
            json.dump(stats, fh, indent=2)
    else:
        stats["total_triangles"] = sum(p["triangles"] for p in stats["pieces"].values())
        data = P.write_town_data(DATA_JS, data_pieces, data_interiors)
        stats["route_length_m"] = data["routeLength"]
        with open(STATS_PATH, "w") as fh:
            json.dump(stats, fh, indent=2)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "town.blend"))
        log("total tris", stats["total_triangles"])
    if os.environ.get("TOWN_PREVIEW"):
        preview_interiors(pieces, only)


def _preview_material(src):
    """What the client shows inside a shop: base colour x baked vertex colour under a flat light, plus emission."""
    m = src.copy()
    m.name = "Pv_" + src.name
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    outn = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    em = nt.nodes.new("ShaderNodeEmission")
    base = b.inputs["Base Color"]
    if base.is_linked:
        nt.links.new(base.links[0].from_socket, em.inputs["Color"])
    else:
        em.inputs["Color"].default_value = base.default_value
    shader = em.outputs[0]
    es = b.inputs["Emission Strength"].default_value
    if es > 0:
        em2 = nt.nodes.new("ShaderNodeEmission")
        em2.inputs["Color"].default_value = b.inputs["Emission Color"].default_value
        em2.inputs["Strength"].default_value = es
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(shader, add.inputs[0])
        nt.links.new(em2.outputs[0], add.inputs[1])
        shader = add.outputs[0]
    alpha = b.inputs["Alpha"].default_value
    if alpha < 1.0:
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mx = nt.nodes.new("ShaderNodeMixShader")
        mx.inputs[0].default_value = alpha
        nt.links.new(tr.outputs[0], mx.inputs[1])
        nt.links.new(shader, mx.inputs[2])
        shader = mx.outputs[0]
    nt.links.new(shader, outn.inputs["Surface"])
    return m


def preview_interiors(pieces, only=None):
    """Fast QA frames of the baked interiors as the game lights them (no lights: albedo x baked colour)."""
    sc = bpy.context.scene
    ftf.use_gpu(sc, TAG)
    col = ftf.new_collection("Preview")
    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    sc.world = world
    pv = {}
    every = [o for g in pieces.values() for o in g["meshes"] + g["cols"]]
    out_dir = os.environ.get("TOWN_PREVIEW")
    if out_dir in ("1", "qa"):
        out_dir = QA_DIR
    os.makedirs(out_dir, exist_ok=True)
    for sp in P.SHOPS:
        if only and sp["piece"] not in only:
            continue
        mine = pieces[sp["piece"]]["meshes"]
        for o in every:
            o.hide_render = o not in mine
        for o in mine:
            src = o.data.materials[0]
            if src.name not in pv:
                pv[src.name] = _preview_material(src)
            o.data.materials[0] = pv[src.name]
        w, d = sp["interior"]
        h = sp.get("height", 3.6)
        views = [("door", (0.0, 1.62, d / 2 - 0.35), (0.0, 1.35, -d / 2), 15, None),
                 ("counter", (sp["stand"][0] - 0.5, 1.75, sp["stand"][1] - 0.35), (0.0, 1.0, d / 2), 15, None),
                 ("play", (0.9, 2.6, d / 2 - 2.2), (sp["stand"][0] * 0.6, 1.0, -d / 2 + 2.0), 20, None),
                 ("top", (0.0, h - 0.45, 0.0), (0.0, 0.0, -0.001), None, max(w, d) * 1.08)]
        for name, loc, tgt, lens, ortho in views:
            if os.environ.get("TOWN_PREVIEW_VIEWS") and name not in os.environ["TOWN_PREVIEW_VIEWS"].split(","):
                continue
            ftf.setup_cycles(sc, 1600, 1000 if not ortho else 1600, 24, look="None")
            sc.view_settings.view_transform = "Standard"
            sc.view_settings.exposure = 0.0
            sc.cycles.max_bounces = 8
            sc.cycles.transparent_max_bounces = 8
            cam = ftf.add_camera(f"pv_{sp['id']}_{name}", bl(loc), bl(tgt), lens=lens or 35, ortho=ortho, col=col, clip_end=200)
            cam.data.clip_start = 0.05
            t = ftf.render_to(sc, cam, os.path.join(out_dir, f"shop_{sp['id']}_{name}.jpg"))
            log("preview", sp["id"], name, t, "s")


# ------------------------------------------------------------------ render

def stage_render(which=None):
    """QA renders of the exported files, re-imported into an empty scene (Cycles, golden hour)."""
    sc = ftf.reset_scene()
    dev = ftf.use_gpu(sc, TAG)
    col = ftf.new_collection("QA")
    for piece, pv in PIVOT.items():
        path = os.path.join(OUT_DIR, piece + ".glb")
        if not os.path.exists(path):
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        for o in set(bpy.data.objects) - before:
            if o.parent is None:
                o.location = Vector(o.location) + Vector(bl(pv))
            if o.name.endswith("_col") or "_col." in o.name:
                o.hide_render = True
    # daylight (brief): a clear pale sky and a warm sun from the south-west; the haze is the game's own fog
    sc.world = ftf.sky_world("TownSky", zenith=(0.16, 0.34, 0.62), horizon=(0.80, 0.84, 0.86), ground=(0.50, 0.52, 0.52), strength=1.25)
    ftf.add_sun(col, energy=5.0, color=(1.0, 0.90, 0.72), elev=46, azim=-140, angle=2)
    for i, (x, z) in enumerate(((3.6, 26.0), (-6.2, -7.6), (2.5, 8.0), (9.0, -12.0), (-12.9, -7.6))):
        hp = bpy.data.meshes.new(f"human{i}")
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.28, radius2=0.2, depth=1.7)
        bm.to_mesh(hp)
        bm.free()
        o = ftf.link(bpy.data.objects.new(f"human{i}", hp), col)
        o.location = bl((x, P.ground_y(x, z) + 0.85, z))
        o.data.materials.append(ftf.simple_material(f"Human{i}", (0.30, 0.20, 0.50), 0.7))
    views = {
        "top": dict(loc=(0, 190, -10), tgt=(0, 0, -10.01), ortho=128, res=(2000, 2000)),
        "spawn": dict(loc=(0, 2.9, 32.0), tgt=(0, 5.2, 0), lens=22, res=(1920, 1200)),
        "altar": dict(loc=(-2.6, 6.5, 3.6), tgt=(3.2, 11.4, -14), lens=22, res=(1920, 1200)),
        "altar_play": dict(loc=(0.0, 8.6, -1.6), tgt=(0, 6.6, -11), lens=30, res=(1920, 1200)),
        "elevation": dict(loc=(0.0, 9.4, -9.0), tgt=(-18.6, 9.4, -9.0), ortho=15, res=(1600, 1200)),
        "altar_close": dict(loc=(3.4, 6.6, -5.2), tgt=(0, 7.0, -11), lens=40, res=(1920, 1200)),
        "aerial": dict(loc=(64, 62, 86), tgt=(0, 4, -8), lens=32, res=(1920, 1200)),
        "square": dict(loc=(-11.5, 6.4, -3.6), tgt=(8, 7.0, -18), lens=24, res=(1920, 1200)),
        "lane": dict(loc=(-30, 4.2, 10.2), tgt=(0, 4.6, 9.0), lens=28, res=(1920, 1200)),
        "temple": dict(loc=(-1.5, 11.4, -19.5), tgt=(5, 16.5, -44), lens=22, res=(1920, 1200)),
        "sky": dict(loc=(-4, 6.3, -4.5), tgt=(66, 92, -150), lens=30, res=(1920, 1200)),
    }
    samples = int(os.environ.get("TOWN_SAMPLES", "96"))
    times = {}
    for name, v in views.items():
        if which and name not in which:
            continue
        ftf.setup_cycles(sc, v["res"][0], v["res"][1], samples)
        sc.view_settings.exposure = -0.6
        for o in col.objects:
            if o.name.startswith("human"):
                o.hide_render = name not in ("aerial", "lane", "square", "top", "elevation")
        cam = ftf.add_camera("cam_" + name, bl(v["loc"]), bl(v["tgt"]), lens=v.get("lens", 35), ortho=v.get("ortho"), col=col, clip_end=3000)
        times[name] = ftf.render_to(sc, cam, os.path.join(QA_DIR, f"town_{name}.jpg"))
        log("render", name, times[name], "s", dev)
    return times


def stage_render_shops():
    """QA renders of the shop interiors: from the door and from behind the counter, lit by their own lamps."""
    for sp in P.SHOPS:
        sc = ftf.reset_scene()
        ftf.use_gpu(sc, TAG)
        col = ftf.new_collection("QA")
        path = os.path.join(OUT_DIR, sp["piece"] + ".glb")
        if not os.path.exists(path):
            continue
        bpy.ops.import_scene.gltf(filepath=path)
        for o in list(bpy.data.objects):
            if o.name.endswith("_col") or "_col." in o.name:
                o.hide_render = True
            if o.type == "EMPTY" and o.name.startswith("socket_lamp"):
                lt = bpy.data.lights.new(o.name, "POINT")
                lt.energy = 90.0
                lt.color = (1.0, 0.72, 0.42)
                lt.shadow_soft_size = 0.2
                lo = ftf.link(bpy.data.objects.new("L_" + o.name, lt), col)
                lo.location = o.matrix_world.translation
        sc.world = ftf.sky_world("In", zenith=(0.05, 0.05, 0.06), horizon=(0.08, 0.08, 0.09), ground=(0.03, 0.03, 0.03), strength=0.6)
        w, d = sp["interior"]
        samples = int(os.environ.get("TOWN_SAMPLES", "96"))
        for name, loc, tgt, lens in (("door", (0.6, 1.75, d / 2 - 0.5), (-0.2, 1.25, -d / 2), 17), ("counter", (0.4, 1.9, -d / 2 + 1.0), (-0.3, 1.1, d / 2), 17)):
            ftf.setup_cycles(sc, 1920, 1200, samples)
            sc.view_settings.exposure = 0.4
            cam = ftf.add_camera(f"cam_{name}", bl(loc), bl(tgt), lens=lens, col=col, clip_end=200)
            t = ftf.render_to(sc, cam, os.path.join(QA_DIR, f"shop_{sp['id']}_{name}.jpg"))
            log("render shop", sp["id"], name, t, "s")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["all"]
    stage = argv[0]
    if stage in ("textures", "all"):
        import town_textures
        town_textures.stage_textures(TEX_DIR, QA_DIR, (argv[1:] or None) if stage == "textures" else None)
    if stage in ("build", "all"):
        stage_build((argv[1:] or None) if stage == "build" else None)
    if stage in ("render", "all"):
        stage_render(argv[1:] or None)
    if stage in ("shops", "all"):
        stage_render_shops()

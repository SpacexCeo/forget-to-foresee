"""Build one townsperson for the game: body, costume, reduction to the triangle budget, one baked texture
set, skin weights, spring chains, clips, glTF export.

    blender -b -P art/townsfolk/build_townsfolk.py -- <key> <out_dir> [--noshade] [--size 2048] [--budget 16000]

Output in <out_dir>/<key>/: townsfolk_<key>.glb (uncompressed; art/tools/compress-glb.sh makes the game
file), townsfolk_<key>.blend (textures packed), build.json (facts, triangle counts, clip list, foot slip).
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tf_body  # noqa: E402
import tf_shading as SH  # noqa: E402
import tf_wardrobe as W  # noqa: E402
from cast import CAST, HAIR, SKIN  # noqa: E402
from tf_costume import Ctx, HEAD  # noqa: E402

import agent_anim  # noqa: E402
import agent_rig  # noqa: E402
import build_iris_hero as IH  # noqa: E402
import hero_shading as S  # noqa: E402
import tf_anim  # noqa: E402

V = Vector
log = tf_body.log


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def decimate(o, ratio):
    if ratio >= 0.98:
        return
    m = o.modifiers.new("lod", "DECIMATE")
    m.ratio = max(0.03, ratio)
    # open edges (hems, cuffs, necklines, panel edges) are cut lines the eye follows: the collapse spends its
    # budget inside the cloth and leaves them alone (group weight 0 = protected)
    bb = bmesh.new()
    bb.from_mesh(o.data)
    bnd = [v.index for v in bb.verts if v.is_boundary]
    near = {w.index for v in bb.verts if v.is_boundary for e in v.link_edges for w in e.verts} - set(bnd)
    n_all = len(bb.verts)
    bb.free()
    if bnd and len(bnd) < 0.5 * n_all:
        g = o.vertex_groups.get("tf_keep") or o.vertex_groups.new(name="tf_keep")
        g.add(list(range(n_all)), 1.0, "REPLACE")
        g.add(list(near), 0.6, "REPLACE")
        g.add(bnd, 0.0, "REPLACE")
        m.vertex_group = "tf_keep"
        m.vertex_group_factor = 8.0
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


def split_skin(bm):
    """The face (head and neck, keeps the morphs) stays in `body`; hands, arms and legs that still show
    become `skin`, which can be reduced."""
    dom = IH.dominant(bm)
    face = {i for i, d in enumerate(dom) if d in HEAD or d == "neck"}
    # neighbours of the face stay with it, so the cut never sits on the visible neck
    for _ in range(2):
        for e in bm.data.edges:
            a, b = e.vertices
            if a in face or b in face:
                face.add(a)
                face.add(b)
    skin = bm.copy()
    skin.data = bm.data.copy()
    skin.name = "skin"
    bpy.context.scene.collection.objects.link(skin)
    if skin.data.shape_keys:
        skin.shape_key_clear()
    IH.delete_verts(skin, lambda i, co: i in face)
    IH.delete_verts(bm, lambda i, co: i not in face)
    return skin


def decimate_face(bm, target):
    """Reduce the face mesh and keep its morphs: the shape keys ride through the decimation as vertex
    attributes (offsets from the basis) and are rebuilt afterwards."""
    n0 = tris(bm)
    if n0 <= target:
        return
    me = bm.data
    keys = me.shape_keys.key_blocks
    names = [k.name for k in keys][1:]
    basis = [v.co.copy() for v in keys[0].data]
    for nm in names:
        a = me.attributes.new("sk_" + nm, "FLOAT_VECTOR", "POINT")
        kd = keys[nm].data
        for i in range(len(basis)):
            a.data[i].vector = kd[i].co - basis[i]
    bm.shape_key_clear()
    decimate(bm, target / n0)
    me = bm.data
    bm.shape_key_add(name="Basis", from_mix=False)
    for nm in names:
        kb = bm.shape_key_add(name=nm, from_mix=False)
        a = me.attributes["sk_" + nm]
        for i, v in enumerate(me.vertices):
            kb.data[i].co = v.co + Vector(a.data[i].vector)
        kb.value = 0.0
    for nm in names:
        me.attributes.remove(me.attributes["sk_" + nm])


def reduce(bm, skin, eyes, garments, budget, face_target=5000):
    decimate_face(bm, face_target)
    fixed = tris(bm)
    for o in eyes:
        decimate(o, 0.5)
    fixed += sum(tris(o) for o in eyes)
    rest = [skin] + list(garments.values())
    for o in garments.values():
        SH.trim_field(o)
    keep = [o for o in rest if tris(o) < 260 or o.get("mat") == "hair" or o.name.startswith("hat")]
    for o in keep:
        if tris(o) > 900:
            decimate(o, 0.6)
    big = [o for o in rest if o not in keep]
    want = budget - fixed - sum(tris(o) for o in keep)
    ratio = min(1.0, want / max(1, sum(tris(o) for o in big)))
    for o in big:
        decimate(o, ratio)
    for o in rest + [bm]:                            # glTF tangents need tris/quads
        if o is bm:
            continue
        bb = bmesh.new()
        bb.from_mesh(o.data)
        ng = [f for f in bb.faces if len(f.verts) > 4]
        if ng:
            bmesh.ops.triangulate(bb, faces=ng)
            bb.to_mesh(o.data)
        bb.free()
    return round(ratio, 3)


def chains_for(ctx):
    """Spring chains the costume needs (same simulation as the agents): skirts, capes, hanging hair."""
    L = ctx.L
    rules = {o.get("rule") for o in ctx.garments.values()}
    ay = ctx.axis.y
    out = []
    if "skirt" in rules:
        hem = min(min(v.co.z for v in o.data.vertices) for o in ctx.garments.values() if o.get("rule") == "skirt")
        hem = min(hem, L.hip - 0.20)
        mid = (L.hip + hem) / 2
        out += [("skirt_F", ((0, ay - 0.13, L.hip), (0, ay - 0.17, mid), (0, ay - 0.20, hem)), "pelvis"),
                ("skirt_B", ((0, ay + 0.14, L.hip), (0, ay + 0.18, mid), (0, ay + 0.21, hem)), "pelvis")]
    if "cape" in rules:
        hem = min(min(v.co.z for v in o.data.vertices) for o in ctx.garments.values() if o.get("rule") == "cape")
        top = L.sh.z - 0.02
        mid = (top + hem) / 2
        out += [("cloak", ((0, ay + 0.15, top), (0, ay + 0.19, mid), (0, ay + 0.22, hem)), "chest"),
                ("cloak_L", ((0.19, ay - 0.06, top), (0.23, ay - 0.08, mid), (0.25, ay - 0.09, hem)), "chest"),
                ("cloak_R", ((-0.19, ay - 0.06, top), (-0.23, ay - 0.08, mid), (-0.25, ay - 0.09, hem)), "chest")]
    if "hair" in rules:
        hc = ctx.head_c
        z0, z1 = hc.z - 0.04, L.bust + 0.03
        zm = (z0 + z1) / 2
        out += [("hair_L", ((0.085, hc.y, z0), (0.095, hc.y - 0.02, zm), (0.09, hc.y - 0.05, z1)), "head"),
                ("hair_R", ((-0.085, hc.y, z0), (-0.095, hc.y - 0.02, zm), (-0.09, hc.y - 0.05, z1)), "head"),
                ("hair_B", ((0, hc.y + 0.09, z0), (0, hc.y + 0.12, zm), (0, hc.y + 0.13, z1)), "head")]
    return tuple(out)


def skin_all(ctx, rig, skin_obj):
    L = ctx.L
    ay = ctx.axis.y
    hc = ctx.head_c
    # weight sources: sleeved tops read the whole body; everything else never reads the arms or hands
    # (trousers and skirts hang beside the hands), and each side never reads the other leg or foot
    ARMSET = set(IH.HAND_BONES) | {"upperarm_L", "upperarm_R", "forearm_L", "forearm_R"}

    def tree(pred):
        idx = [i for i in range(len(ctx.co)) if pred(ctx.dom[i])]
        t = KDTree(len(idx))
        for j, i in enumerate(idx):
            t.insert(ctx.co[i], i)
        t.balance()
        return t
    kd = tree(lambda d: True)
    kd_side = {s: tree(lambda d, s=s: d not in ARMSET and not d.endswith("_R" if s == "L" else "_L") or d.startswith("shoulder"))
               for s in ("L", "R")}

    class Side:                                        # a KD tree picked by the side of the query point
        @staticmethod
        def find_n(p, n):
            return kd_side["L" if p.x >= 0 else "R"].find_n(p, n)
    SLEEVED = ("shirt", "under_shirt", "robe_top", "dress_top", "vest", "tabard_yoke", "bracers", "pauldron", "shirt_rolls",
               "robe_rolls", "dress_rolls", "shirt_sleeve", "robe_sleeve", "dress_sleeve", "collar", "scarf", "stole_neck",
               "capelet", "shawl", "beard", "apron_halter", "beads", "satchel_strap", "lute_strap")
    sm = IH.smoothstep

    def skirt_rule(p):
        if p.z > L.hip:
            return None
        return ("skirt_F" if p.y < ay else "skirt_B", 0.72 * sm((L.hip - p.z) / 0.30))

    def cape_rule(p):
        top = L.sh.z - 0.04
        if p.z > top:
            return None
        f = 0.65 * sm((top - p.z) / 0.25)
        if p.y > ay + 0.02:
            return ("cloak", f)
        return ("cloak_L" if p.x > 0 else "cloak_R", f)

    def hair_rule(p):
        z0 = hc.z - 0.05
        if p.z > z0:
            return None
        f = sm((z0 - p.z) / 0.10)
        if p.y > hc.y + 0.06 and abs(p.x) < 0.05:
            return ("hair_B", f)
        return ("hair_L" if p.x > 0 else "hair_R", f)
    rules = {"skirt": skirt_rule, "cape": cape_rule, "hair": hair_rule}
    for o in ctx.garments.values():
        r = o.get("rule") or "fit"
        if r == "head" or r.startswith("rigid:"):
            for g in list(o.vertex_groups):
                o.vertex_groups.remove(g)
            bone = "head" if r == "head" else r.split(":")[1]
            o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
        else:
            src = kd if (o.name.startswith(SLEEVED) and not o.name.endswith(("_skirt", "_tails"))) or "_cord" in o.name else Side
            if o.name.endswith(("_L", "_R")) and not o.name.startswith(SLEEVED):
                src = kd_side[o.name[-1]]              # a shoe never reads the other foot, wherever its inner edge is
            IH.skin_garment(o, src, ctx.wts, rules.get(r))
        IH.bind(o, rig)
    for o in (skin_obj,):
        for g in list(o.vertex_groups):               # keep bone groups only
            if g.name not in rig.data.bones:
                o.vertex_groups.remove(g)


def build(key, out_root, shade=True, size=2048, budget=16000, samples=16):
    e = CAST[key]
    out = os.path.join(out_root, key)
    os.makedirs(out, exist_ok=True)
    name = f"townsfolk_{key}"
    bm, rig, eyes, facts = tf_body.build_body(key)
    import tf_costume
    tf_costume.SOLID = False
    ctx = Ctx(bm, rig, key)
    W.dress(ctx, e)
    IH.lips_attr(bm)
    facts["stripped_body_vertices"] = ctx.strip_covered()
    facts["stripped_layer_faces"] = tf_costume.strip_layers(ctx)
    skin = split_skin(bm)
    facts["triangles_full"] = sum(tris(o) for o in [bm, skin, *eyes, *ctx.garments.values()])
    facts["reduce_ratio"] = reduce(bm, skin, eyes, ctx.garments, budget)
    garments = list(ctx.garments.values())
    allmesh = [bm, skin, *eyes, *garments]
    facts["triangles"] = sum(tris(o) for o in allmesh)
    facts["triangles_face"] = tris(bm)
    log("reduced", key, facts["triangles_full"], "->", facts["triangles"], "ratio", facts["reduce_ratio"], "face", tris(bm))

    # ---- one texture set
    if shade:
        sc = bpy.context.scene
        sc.render.engine = "CYCLES"
        try:
            if os.environ.get("TF_CPU"):
                raise RuntimeError("TF_CPU set")
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "OPTIX"
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
            sc.cycles.device = "GPU"
        except Exception as ex:
            sc.cycles.device = "CPU"
            log("bake on cpu:", ex)
        if not sc.world:
            sc.world = bpy.data.worlds.new("w")
        SH.paint_colours(garments)
        for o in eyes:
            SH.eye_attr(o)
        SH.pack_one_atlas([bm, skin, *eyes], garments, boost=[bm, *eyes])
        tone, blush = SKIN[e["skin"]]
        hairc = HAIR[e["hair"][0]]
        brow = SH._lerp(hairc, SH._mul(tone, 0.25), 0.35) if e["hair"][0] not in ("white", "grey") else (0.45, 0.44, 0.42)
        skin_kw = dict(land=SH.landmarks(rig, bm), tone=tone, blush=blush, brow=brow, brow_w=e.get("brows", 1.0) * 0.62,
                       age=e["macros"]["age"], freckles=e.get("freckles", 0.0),
                       stubble=SH._lerp(HAIR[e["beard"][0]], tone, 0.35) if e.get("beard", ("", ""))[1] == "short" else None)
        groups = [([bm, skin], SH.skin_shader, skin_kw), (list(eyes), SH.eye_shader, dict(iris=SH.IRIS[e["skin"]]))]
        kinds = {}
        for o in garments:
            kinds.setdefault(o.get("mat", "cloth"), []).append(o)
        for kind, objs in kinds.items():
            groups.append((objs, SH.surface_shader, dict(gcol=None, tcol=None, kind=kind)))
        SH.bake_atlas(groups, name, size, out, samples)
        log("baked", key, size)

    # ---- rig: chains, weights
    chains = chains_for(ctx)
    IH.install_chains(chains)
    for nm in ("cloak", "cloak_L", "cloak_R", "skirt_F", "skirt_B"):
        pass
    bpy.data.objects.remove(rig)
    rig = IH.rebuild_rig(bm)
    for o in (bm, skin, *eyes):
        if not any(m.type == "ARMATURE" for m in o.modifiers):
            IH.bind(o, rig)
        for m in o.modifiers:
            if m.type == "ARMATURE":
                m.object = rig
        o.parent = rig
    skin_all(ctx, rig, skin)
    for g in list(bm.vertex_groups):
        if g.name not in rig.data.bones:
            bm.vertex_groups.remove(g)

    # ---- clips
    info, actions = tf_anim.bake(rig, key, e, facts["export_scale"], log=log)
    face = IH.bake_face(rig, bm, actions)
    IH.to_nla(rig, actions)
    IH.to_nla(bm.data.shape_keys, face)
    facts["clips"] = info

    # ---- join everything but the face into one mesh, name, scale to the real height, export
    bpy.ops.object.select_all(action="DESELECT")
    rest = [skin, *eyes, *garments]
    for o in rest:
        o.select_set(True)
    bpy.context.view_layer.objects.active = skin
    bpy.ops.object.join()
    skin.name = f"{name}_body"
    bm.name = f"{name}_face"
    rig.name = "rig"
    rig["chains"] = json.dumps([[n, [list(p) for p in pts], par] for n, pts, par in chains])
    k = facts["export_scale"]
    rig.scale = (k, k, k)
    facts["bones"] = len(rig.data.bones)
    json.dump(facts, open(os.path.join(out, "build.json"), "w"), indent=1)
    try:
        bpy.ops.file.pack_all()
    except Exception as ex:
        log("pack", ex)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, name + ".blend"))
    path = os.path.join(out, name + ".glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in (rig, bm, skin):
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=False,
        export_yup=True, export_tangents=True, export_extras=False, export_image_format="AUTO",
        export_cameras=False, export_lights=False, export_skins=True, export_all_influences=False,
        export_def_bones=False, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_frame_step=1, export_morph=True, export_morph_normal=True,
        export_morph_animation=True, export_reset_pose_bones=True, export_optimize_animation_size=False,
        export_rest_position_armature=True)
    log("exported", path, os.path.getsize(path))
    return path


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:]
    opt = lambda n, d: int(argv[argv.index(n) + 1]) if n in argv else d
    build(argv[0], argv[1], shade="--noshade" not in argv, size=opt("--size", 2048), budget=opt("--budget", 16000))

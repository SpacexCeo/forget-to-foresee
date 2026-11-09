"""Iris hero build: stylized-realism Iris for agent_iris.glb (Blender 4.5 + MPFB 2.0.18).

    blender -b -P art/agents/iris_hero/build_iris_hero.py -- <stage> [--quick]

Stages: body (MPFB body, rig, skin, face shape keys -> .blend), full (body + costume, hair, textures,
clips, export to agent_iris.glb), render (QA renders of the exported glb).

Pipeline (owner brief 09.11, docs in art/agents/iris_hero/README.md):
1. Human base from MPFB (MakeHuman base mesh, macro and expression targets: CC0).
2. Re-posed into the shared agent rest stance with MPFB's own CC0 weights, then re-rigged onto the
   game's armature (same bone names as every agent, plus eye bones and hair chains).
3. Face: MakeHuman expression units as morph targets (blink, brows, mouth), slight sculpted asymmetry.
4. Costume, hair cards and props as separate skinned meshes; textures baked to 2K.
5. Clips from agent_anim (same names and timings) plus a face layer: irregular blinks, gaze, brows, lips.
"""

import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
AGENTS = os.path.dirname(HERE)
sys.path.insert(0, AGENTS)
sys.path.insert(0, HERE)

import agent_geometry as G  # noqa: E402
import agent_rig  # noqa: E402
import agent_anim  # noqa: E402
import hero_costume as C  # noqa: E402
import hero_shading as S  # noqa: E402

from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.targetservice import TargetService  # noqa: E402
import bl_ext.user_default.mpfb as MPFB  # noqa: E402

V = Vector
OUT = os.path.join(AGENTS, "_raw", "iris_hero")
MPFB_TARGETS = os.path.join(os.path.dirname(MPFB.__file__), "data", "targets")
EYE_HEIGHT = 1.640          # the agent rig's eye line (agent_geometry.FACE): the body is scaled to it
ARM_DEG = 14.0              # agent rest stance: arms 14 deg off the body, hanging straight

MACROS = {"gender": 0.0, "age": 0.48, "muscle": 0.5, "weight": 0.42, "height": 0.62, "proportions": 0.75,
          "cupsize": 0.45, "firmness": 0.55, "race": {"african": 0.08, "asian": 0.17, "caucasian": 0.75}}

# Stylization and slight asymmetry (MakeHuman detail targets, CC0): name -> weight.
DETAIL = {
    "eyes/r-eye-scale-incr": 0.35, "eyes/l-eye-scale-incr": 0.32,
    "eyes/r-eye-move-up": 0.10, "eyes/l-eye-move-up": 0.14,
    "nose/nose-scale-horiz-decr": 0.25, "nose/nose-width2-decr": 0.2,
    "chin/chin-width-decr": 0.25, "mouth/mouth-lowerlip-volume-incr": 0.25,
    "cheek/l-cheek-bones-incr": 0.22, "cheek/r-cheek-bones-incr": 0.16,
    "head/head-fat-decr": 0.2,
}

# Face morph targets kept on the body (MakeHuman expression units, caucasian set): morph name -> unit.
FACE_KEYS = {
    "blink_L": "eye-left-closure", "blink_R": "eye-right-closure",
    "squint_L": "eye-left-slit", "squint_R": "eye-right-slit",
    "wide_L": "eye-left-opened-up", "wide_R": "eye-right-opened-up",
    "brow_up_L": "eyebrows-left-up", "brow_up_R": "eyebrows-right-up",
    "brow_down_L": "eyebrows-left-down", "brow_down_R": "eyebrows-right-down",
    "brow_inner_L": "eyebrows-left-inner-up", "brow_inner_R": "eyebrows-right-inner-up",
    "brow_outer_L": "eyebrows-left-extern-up", "brow_outer_R": "eyebrows-right-extern-up",
    "mouth_open": "mouth-open", "smile": "mouth-corner-puller", "frown": "mouth-depression",
    "pucker": "mouth-pursing", "press": "mouth-compression", "lips_part": "mouth-parling",
    "upper_lip_up": "mouth-upward-retraction", "mouth_wide": "mouth-retraction",
    "nose_wrinkle": "nose-compression",
}

# MPFB "default" rig vertex groups -> agent bones (weights summed).
def agent_bone(n):
    s = "_L" if n.endswith(".L") else "_R" if n.endswith(".R") else ""
    b = n[:-2] if s else n
    if b in ("root", "pelvis"):
        return "pelvis"
    if b in ("spine05", "spine04"):
        return "spine"
    if b.startswith("spine") or b == "breast":
        return "chest"
    if b.startswith("neck"):
        return "neck"
    if b.startswith(("upperleg",)):
        return "thigh" + s
    if b.startswith("lowerleg"):
        return "shin" + s
    if b == "foot":
        return "foot" + s
    if b.startswith("toe"):
        return "toe" + s
    if b in ("clavicle", "shoulder01"):
        return "shoulder" + s
    if b.startswith("upperarm"):
        return "upperarm" + s
    if b.startswith("lowerarm"):
        return "forearm" + s
    if b in ("wrist",) or b.startswith("metacarpal"):
        return "hand" + s
    if b.startswith("finger1"):
        return "thumb" + s
    if b.startswith("finger2"):
        return "index" + s
    if b.startswith("finger"):
        return "fingers" + s
    if b == "jaw" or b.startswith("tongue") or b in ("special04", "oris02", "oris01", "oris06", "oris07"):
        return "jaw"
    if b == "eye":
        return "eye" + s
    return "head"


def log(*a):
    print("[iris_hero]", *a, flush=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def unit_path(unit):
    return os.path.join(MPFB_TARGETS, "expression", "units", "caucasian", unit + ".target.gz")


def detail_path(name):
    return os.path.join(MPFB_TARGETS, name + ".target.gz")


# ===================================================================== body

def make_human():
    bm = HumanService.create_human(mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True,
                                   feet_on_ground=True, scale=0.1, macro_detail_dict=MACROS)
    for name, w in DETAIL.items():
        p = detail_path(name)
        if os.path.exists(p):
            TargetService.load_target(bm, p, weight=w)
        else:
            log("missing detail target", name)
    TargetService.bake_targets(bm)
    rig = HumanService.add_builtin_rig(bm, "default")
    return bm, rig


def bone_world(rig, n, tail=False):
    pb = rig.pose.bones[n]
    return rig.matrix_world @ (pb.tail if tail else pb.head)


def aim_pose_bone(rig, n, direction):
    """Rotate pose bone n (in armature space) so it points along direction."""
    pb = rig.pose.bones[n]
    bpy.context.view_layer.update()
    cur = (pb.tail - pb.head).normalized()
    q = cur.rotation_difference(direction.normalized())
    M = pb.matrix.copy()
    t = M.translation.copy()
    R = q.to_matrix().to_4x4() @ Matrix.Translation(-t)
    pb.matrix = Matrix.Translation(t) @ R @ M
    bpy.context.view_layer.update()


def repose(bm, rig):
    """Arms down to the agent stance, legs straight under the hips; the result becomes the rest mesh."""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    a = math.radians(ARM_DEG)
    for side, s in ((1, "L"), (-1, "R")):
        d = V((side * math.sin(a), 0.0, -math.cos(a)))
        aim_pose_bone(rig, f"upperarm01.{s}", d)
        aim_pose_bone(rig, f"upperarm02.{s}", d)
        fd = (d + V((0, -0.10, 0))).normalized()          # a soft elbow
        aim_pose_bone(rig, f"lowerarm01.{s}", fd)
        aim_pose_bone(rig, f"lowerarm02.{s}", fd)
        aim_pose_bone(rig, f"wrist.{s}", fd)
        hip = bone_world(rig, f"upperleg01.{s}")
        ank = bone_world(rig, f"foot.{s}")
        want = V((side * 0.095, hip.y, 0.0)) - hip
        aim_pose_bone(rig, f"upperleg01.{s}", (want.normalized() + (ank - hip).normalized() * 0.0))
    bpy.ops.object.mode_set(mode="OBJECT")
    # bake the pose into the mesh (the basemesh has no shape keys after bake_targets)
    bpy.context.view_layer.objects.active = bm
    for m in list(bm.modifiers):
        if m.type == "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=m.name)
    return {pb.name: (bone_world(rig, pb.name), bone_world(rig, pb.name, True)) for pb in rig.pose.bones}


def delete_verts(obj, pred):
    me = obj.data
    b = bmesh.new()
    b.from_mesh(me)
    b.verts.ensure_lookup_table()
    kill = [v for v in b.verts if pred(v.index, v.co)]
    bmesh.ops.delete(b, geom=kill, context="VERTS")
    b.to_mesh(me)
    b.free()
    me.update()


def group_verts(obj, name, thr=0.5):
    gi = obj.vertex_groups[name].index
    out = set()
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group == gi and g.weight >= thr:
                out.add(v.index)
    return out


def split_helpers(bm):
    """Eyes and eyelashes become their own objects; every other helper is deleted."""
    for m in list(bm.modifiers):
        if m.type == "MASK":
            bm.modifiers.remove(m)
    keep = {}
    for part in ("helper-l-eye", "helper-r-eye"):
        keep[part] = group_verts(bm, part)
    lashes = group_verts(bm, "helper-l-eyelashes-1") | group_verts(bm, "helper-r-eyelashes-1")
    helpers = group_verts(bm, "HelperGeometry", 0.01) | group_verts(bm, "JointCubes", 0.01)
    eyes = {}
    for part, idx in keep.items():
        pts = [bm.data.vertices[i].co.copy() for i in idx]
        c = sum(pts, V()) / len(pts)
        r = sum((p - c).length for p in pts) / len(pts)
        eyes[part] = (c, r)
    a = bm.data.attributes.new("lash", "FLOAT", "POINT")
    for i in lashes:
        a.data[i].value = 1.0
    delete_verts(bm, lambda i, co: i in helpers and i not in lashes)
    return eyes


def scale_to_eye_line(objs, eyes):
    ez = sum(c.z for c, _ in eyes.values()) / 2
    k = EYE_HEIGHT / ez
    for o in objs:
        o.scale = (k, k, k)
        o.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    return k


def load_face_keys(bm):
    bm.shape_key_add(name="Basis", from_mix=False)
    for name, unit in FACE_KEYS.items():
        TargetService.load_target(bm, unit_path(unit), weight=0.0, name=name)
    # MPFB names the keys after the target; rename to the morph names the clips use
    keys = bm.data.shape_keys.key_blocks
    have = [k.name for k in keys]
    for name, unit in FACE_KEYS.items():
        if name not in have:
            for k in keys:
                if unit in k.name:
                    k.name = name
                    break
    return [k.name for k in keys][1:]


# ===================================================================== rig

def hero_layout(J, eyes):
    """(name, head, tail, parent, deform): agent bone names placed on the MPFB joints."""
    B = []

    def add(n, h, t, p, d=True):
        B.append((n, V(h), V(t), p, d))

    j = lambda n, tail=False: J[n][1 if tail else 0]
    add("root", (0, 0, 0), (0, 0.25, 0), None, False)
    add("pelvis", j("root") * 0 + V((0, j("spine05").y, j("spine05").z)), j("spine04"), "root")
    add("spine", j("spine04"), j("spine02"), "pelvis")
    add("chest", j("spine02"), j("neck01"), "spine")
    add("neck", j("neck01"), j("head"), "chest")
    add("head", j("head"), j("head", True) + V((0, 0, 0.06)), "neck")
    for s in ("L", "R"):
        add(f"shoulder_{s}", j(f"clavicle.{s}"), j(f"upperarm01.{s}"), "chest")
        add(f"upperarm_{s}", j(f"upperarm01.{s}"), j(f"lowerarm01.{s}"), f"shoulder_{s}")
        add(f"forearm_{s}", j(f"lowerarm01.{s}"), j(f"wrist.{s}"), f"upperarm_{s}")
        tip = j(f"finger3-3.{s}", True)
        add(f"hand_{s}", j(f"wrist.{s}"), tip, f"forearm_{s}")
        palm = (j(f"wrist.{s}") + j(f"finger3-1.{s}")) / 2
        dirh = (tip - j(f"wrist.{s}")).normalized()
        side = 1 if s == "L" else -1
        inward = V((-side, 0, 0))
        grip = palm + inward * 0.028
        add(f"prop_{s}", grip, grip + dirh * 0.10, f"hand_{s}")
    for s in ("L", "R"):
        add(f"thigh_{s}", j(f"upperleg01.{s}"), j(f"lowerleg01.{s}"), "pelvis")
        add(f"shin_{s}", j(f"lowerleg01.{s}"), j(f"foot.{s}"), f"thigh_{s}")
        add(f"foot_{s}", j(f"foot.{s}"), j(f"toe3-1.{s}"), f"shin_{s}")
        add(f"toe_{s}", j(f"toe3-1.{s}"), j(f"toe3-3.{s}", True), f"foot_{s}")
    add("jaw", j("jaw"), j("jaw", True), "head")
    for s in ("L", "R"):
        c, r = eyes["helper-l-eye" if s == "L" else "helper-r-eye"]
        add(f"eye_{s}", c, c + V((0, -0.03, 0)), "head")
        add(f"lid_up_{s}", c, c + V((0, -0.02, 0)), "head")
        add(f"lid_lo_{s}", c + V((0, 0.001, 0)), c + V((0, -0.019, 0)), "head")
        add(f"brow_{s}", c + V((0, 0.012, 0.024)), c + V((0, -0.018, 0.024)), "head")
    for s in ("L", "R"):
        add(f"thumb_{s}", j(f"finger1-1.{s}"), j(f"finger1-3.{s}", True), f"hand_{s}")
        add(f"index_{s}", j(f"finger2-1.{s}"), j(f"finger2-3.{s}", True), f"hand_{s}")
        add(f"fingers_{s}", j(f"finger3-1.{s}"), (j(f"finger4-3.{s}", True) + j(f"finger3-3.{s}", True)) / 2,
            f"hand_{s}")
    for name, pts, parent in agent_rig.CHAINS_REST:
        prev = parent
        for i in range(len(pts) - 1):
            add(f"{name}_{i}", pts[i], pts[i + 1], prev)
            prev = f"{name}_{i}"
    return B


def build_armature(layout):
    data = bpy.data.armatures.new("rig")
    obj = bpy.data.objects.new("rig", data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = data.edit_bones
    for n, h, t, p, d in layout:
        b = eb.new(n)
        b.head, b.tail = h, t
        b.align_roll(agent_rig._roll_axis((t - h).normalized()))
        b.use_connect = False
        b.use_deform = d
        if p:
            b.parent = eb[p]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return obj


def remap_weights(obj, rig, mpfb_bones):
    """MPFB default-rig groups -> agent bone groups (summed, top 4, normalised)."""
    old = {g.index: g.name for g in obj.vertex_groups}
    acc = []
    for v in obj.data.vertices:
        w = {}
        for g in v.groups:
            n = old[g.group]
            if n not in mpfb_bones:
                continue
            b = agent_bone(n)
            w[b] = w.get(b, 0.0) + g.weight
        top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
        s = sum(x for _, x in top) or 1.0
        acc.append([(b, x / s) for b, x in top if x / s > 0.01])
    keep_names = {"scalp", "lips", "ears"}
    for g in list(obj.vertex_groups):
        if g.name not in keep_names:
            obj.vertex_groups.remove(g)
    groups = {}
    for i, lst in enumerate(acc):
        for b, x in lst:
            if b not in groups:
                groups[b] = obj.vertex_groups.new(name=b)
            groups[b].add([i], x, "REPLACE")
    return groups


def bind(obj, rig):
    obj.parent = rig
    m = obj.modifiers.new("Armature", "ARMATURE")
    m.object = rig


# ===================================================================== eyes

def make_eyes(eyes, k):
    """Separate eyeball meshes (iris looks along -Y), each fully weighted to its eye bone."""
    objs = []
    for part, (c, r) in eyes.items():
        s = "L" if part == "helper-l-eye" else "R"
        c = c * k
        r = r * k
        me = bpy.data.meshes.new(f"eyeball_{s}")
        b = bmesh.new()
        bmesh.ops.create_uvsphere(b, u_segments=20, v_segments=14, radius=r * 0.98)
        uv = b.loops.layers.uv.new("UVMap")
        for f in b.faces:
            for lo in f.loops:
                p = lo.vert.co
                lo[uv].uv = (0.5 + p.x / (2.2 * r), 0.5 + p.z / (2.2 * r)) if p.y < 0 else (0.02, 0.02)
        b.to_mesh(me)
        b.free()
        o = bpy.data.objects.new(f"eyeball_{s}", me)
        o.location = c
        bpy.context.scene.collection.objects.link(o)
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.transform_apply(location=True)
        o.select_set(False)
        o.vertex_groups.new(name=f"eye_{s}").add(list(range(len(me.vertices))), 1.0, "REPLACE")
        objs.append(o)
    return objs


# ===================================================================== stages

def stage_body():
    reset()
    bm, mrig = make_human()
    J = repose(bm, mrig)
    eyes = split_helpers(bm)
    k = scale_to_eye_line([bm], eyes)
    J = {n: (h * k, t * k) for n, (h, t) in J.items()}
    eyes_k = {p: (c * k, r * k) for p, (c, r) in eyes.items()}
    mpfb_bones = {b.name for b in mrig.data.bones}
    bpy.data.objects.remove(mrig)
    bm.name = "body"
    keys = load_face_keys(bm)
    LAYOUT[:] = hero_layout(J, eyes_k)
    rig = build_armature(LAYOUT)
    remap_weights(bm, rig, mpfb_bones)
    bind(bm, rig)
    eye_objs = make_eyes(eyes, k)
    for o in eye_objs:
        bind(o, rig)
    log("body", len(bm.data.polygons), "faces", len(keys), "keys", len(rig.data.bones), "bones",
        "height", round(max((bm.matrix_world @ v.co).z for v in bm.data.vertices), 3))
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "iris_body.blend"))
    return bm, rig, eye_objs, keys


# ===================================================================== costume

HAND_BONES = {f"{b}_{s}" for b in ("hand", "thumb", "index", "fingers") for s in ("L", "R")}
FOOT_BONES = {f"{b}_{s}" for b in ("foot", "toe", "shin") for s in ("L", "R")}


def dominant(obj):
    names = {g.index: g.name for g in obj.vertex_groups}
    out = []
    for v in obj.data.vertices:
        best = max(((g.weight, names[g.group]) for g in v.groups if names[g.group] not in ("scalp", "lips", "ears")),
                   default=(0, ""))
        out.append(best[1])
    return out


def weights_of(obj):
    names = {g.index: g.name for g in obj.vertex_groups}
    return [{names[g.group]: g.weight for g in v.groups if names[g.group] not in ("scalp", "lips", "ears")}
            for v in obj.data.vertices]


def hero_chains(P, coat_o, tail_pts, head_c):
    c, rx, ry = P.section(1.30)
    back = c.y + ry + 0.05
    front = c.y - ry - 0.03
    return (
        ("cloak", ((0, back, 1.38), (0, back + 0.03, 1.05), (0, back + 0.07, 0.72), (0, back + 0.10, 0.40)), "chest"),
        ("cloak_L", ((0.15, front, 1.28), (0.20, front - 0.01, 0.85), (0.24, front - 0.02, 0.40)), "chest"),
        ("cloak_R", ((-0.15, front, 1.28), (-0.20, front - 0.01, 0.85), (-0.24, front - 0.02, 0.40)), "chest"),
        ("scarf", tuple(tuple(tail_pts[i]) for i in (0, 3, 6, 9)), "chest"),
        ("hood", ((0, back - 0.02, 1.50), (0, back + 0.02, 1.44), (0, back + 0.04, 1.39)), "chest"),
        ("skirt_F", ((0, c.y - 0.10, 0.92), (0, c.y - 0.16, 0.52), (0, c.y - 0.19, 0.17)), "pelvis"),
        ("skirt_B", ((0, c.y + 0.12, 0.92), (0, c.y + 0.17, 0.52), (0, c.y + 0.20, 0.17)), "pelvis"),
        ("hair_L", ((0.085, head_c.y, 1.62), (0.10, head_c.y + 0.01, 1.52), (0.11, head_c.y + 0.02, 1.42)), "head"),
        ("hair_R", ((-0.085, head_c.y, 1.62), (-0.10, head_c.y + 0.01, 1.52), (-0.11, head_c.y + 0.02, 1.42)), "head"),
        ("hair_B", ((0, head_c.y + 0.09, 1.62), (0, head_c.y + 0.11, 1.52), (0, head_c.y + 0.12, 1.42)), "head"),
    )


def install_chains(chains):
    agent_rig.CHAINS_REST = chains
    agent_rig.CHAIN_BONES = {n: [f"{n}_{i}" for i in range(len(p) - 1)] for n, p, _ in chains}
    agent_rig.CHAIN_PTS = {n: [V(x) for x in p] for n, p, _ in chains}
    agent_anim.CHAINS_REST = chains
    if "eye_L" not in agent_anim.EXTRA_BONES:
        agent_anim.EXTRA_BONES = tuple(agent_anim.EXTRA_BONES) + ("eye_L", "eye_R")
    for h in ("hair_L", "hair_R", "hair_B"):
        agent_anim.CHAIN_PARAMS[h] = (95.0, 8.0, 1.4, 0.72, 35.0, False)
    agent_anim.CHAIN_PARAMS["hood"] = (160.0, 10.0, 1.0, 0.8, 20.0, False)


def smoothstep(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def skin_garment(o, src_co_kd, src_w, chain_rule=None):
    """Nearest-body-vertex weights, then blended toward a spring chain where chain_rule says so."""
    for g in list(o.vertex_groups):
        o.vertex_groups.remove(g)
    groups = {}
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        acc = {}
        for (q, i, d) in src_co_kd.find_n(p, 4):
            wd = 1.0 / max(d, 1e-4)
            for b, x in src_w[i].items():
                acc[b] = acc.get(b, 0.0) + x * wd
        s = sum(acc.values()) or 1.0
        w = {b: x / s for b, x in acc.items()}
        if chain_rule:
            r = chain_rule(p)
            if r:
                chain, f = r
                cw = agent_rig.chain_weights(chain, p, by="z" if not chain.startswith("scarf") else "near")
                w = {b: x * (1 - f) for b, x in w.items()}
                for b, x in cw.items():
                    w[b] = w.get(b, 0.0) + x * f
        top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
        s = sum(x for _, x in top) or 1.0
        for b, x in top:
            if x / s < 0.01:
                continue
            if b not in groups:
                groups[b] = o.vertex_groups.new(name=b)
            groups[b].add([v.index], x / s, "REPLACE")


def stage_costume(bm=None, rig=None, eye_objs=None):
    from mathutils.kdtree import KDTree
    if bm is None:
        bm, rig, eye_objs, _ = stage_body()
    dom = dominant(bm)
    wts = weights_of(bm)
    P = C.BodyProbe(bm, lambda i: dom[i])
    bones = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones}
    head_pts = [P.co[i] for i, d in enumerate(dom) if d == "head" and P.co[i].z > 1.50]
    hx = [p.x for p in head_pts]; hy = [p.y for p in head_pts]; hz = [p.z for p in head_pts]
    head_c = V(((max(hx) + min(hx)) / 2, (max(hy) + min(hy)) / 2, (max(hz) + min(hz)) / 2))
    head_r = ((max(hx) - min(hx)) / 2, (max(hy) - min(hy)) / 2, (max(hz) - min(hz)) / 2)
    kd = KDTree(len(P.co))
    for i, p in enumerate(P.co):
        kd.insert(p, i)
    kd.balance()

    garments = {}
    garments["coat"] = C.coat(P)
    garments["collar"] = C.collar(P)
    for s in ("L", "R"):
        garments[f"sleeve_{s}"] = C.sleeve((bones[f"upperarm_{s}"][0] + V((0, 0, 0.02)), bones[f"forearm_{s}"][0],
                                            bones[f"hand_{s}"][0] - (bones[f"hand_{s}"][1] - bones[f"hand_{s}"][0]).normalized() * 0.01),
                                           1 if s == "L" else -1, f"sleeve_{s}")
    garments["capelet"] = C.capelet(P)
    garments["hood"] = C.hood_down(P)
    garments["dress"] = C.dress(P)
    garments["boots"] = C.boots_from_body(bm, lambda co: co.z < 0.30)
    sc_objs, tail_pts = C.scarf(P, bones)
    for o in sc_objs:
        garments[o.name] = o
    for o in C.belt_and_props(P):
        garments[o.name] = o
    scalp = sorted(group_verts(bm, "scalp", 0.5))
    garments["hair_cap"] = C.hair_cap(bm, scalp)
    brow_z = max(c.z for c, _ in [(h, 0) for h in (bones["eye_L"][0], bones["eye_R"][0])]) + 0.028
    garments["hair"] = C.hair_cards(C.scalp_points(bm, scalp), head_c, head_r, brow_z)

    chains = hero_chains(P, garments["coat"], tail_pts, head_c)
    install_chains(chains)
    bpy.data.objects.remove(rig)
    rig = rebuild_rig(bm)

    c13, rx13, ry13 = P.section(1.0)

    def coat_rule(p):
        if p.z > 1.08:
            return None
        f = smoothstep((1.08 - p.z) / 0.30)
        if p.y > c13.y + 0.02:
            return ("cloak", f)
        return ("cloak_L" if p.x > 0 else "cloak_R", f)

    def dress_rule(p):
        if p.z > 0.92:
            return None
        return ("skirt_F" if p.y < c13.y else "skirt_B", 0.75 * smoothstep((0.92 - p.z) / 0.35))

    def hair_rule(p):
        if p.z > head_c.z + 0.02:
            return None
        f = smoothstep((head_c.z + 0.02 - p.z) / 0.12)
        if p.y > head_c.y + 0.05:
            return ("hair_B", f)
        return ("hair_L" if p.x > 0 else "hair_R", f)

    rules = {"coat": coat_rule, "dress": dress_rule, "hair": hair_rule,
             "scarf_tail": lambda p: ("scarf", smoothstep((1.42 - p.z) / 0.06)) if p.z < 1.42 else None,
             "scarf_fringe": lambda p: ("scarf", 1.0), "hood": lambda p: ("hood", 0.6)}
    for name, o in garments.items():
        skin_garment(o, kd, wts, rules.get(name))
        bind(o, rig)

    # the body keeps the head, neck, hands and lashes; everything under the costume is removed
    def covered(i, co):
        d = dom[i]
        if co.z > 1.445:
            return False
        if d in HAND_BONES:
            return False
        return True
    delete_verts(bm, covered)
    log("costume", {n: len(o.data.polygons) for n, o in garments.items()})
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "iris_costume.blend"))
    return bm, rig, eye_objs, garments


def rebuild_rig(bm):
    """The armature again, now with the hero chains (bone positions kept from the body stage)."""
    lay = [l for l in LAYOUT if not any(l[0].startswith(c[0] + "_") and l[0][len(c[0]) + 1:].isdigit()
                                        for c in agent_rig.CHAINS_REST) and not l[0].startswith(("cloak", "scarf_", "hood_", "skirt_", "hair_"))]
    for name, pts, parent in agent_rig.CHAINS_REST:
        prev = parent
        for i in range(len(pts) - 1):
            lay.append((f"{name}_{i}", V(pts[i]), V(pts[i + 1]), prev, True))
            prev = f"{name}_{i}"
    rig = build_armature(lay)
    for o in bpy.data.objects:
        for m in o.modifiers:
            if m.type == "ARMATURE":
                m.object = rig
        if o.parent is None and o.type == "MESH":
            pass
    for o in bpy.data.objects:
        if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers):
            o.parent = rig
    return rig


LAYOUT = []


# ===================================================================== face layer

def _pulse(t, t0, close=0.07, hold=0.03, open_=0.12):
    d = t - t0
    if d < -close or d > hold + open_:
        return 0.0
    if d < 0:
        x = 1 + d / close
        return x * x
    if d < hold:
        return 1.0
    x = 1 - (d - hold) / open_
    return x * x * (3 - 2 * x)


def face_curves(clip, n, loop):
    """Morph weights and eye rotations per frame: irregular blinks, gaze saccades, brows and lips."""
    fps = agent_anim.FPS
    T = n / fps
    rnd = random.Random(hash(clip) % 9973)
    blinks, t = [], rnd.uniform(0.4, 1.4)
    while t < T - 0.25:
        blinks.append(t)
        if rnd.random() < 0.18:
            blinks.append(t + 0.32)                              # an occasional double blink
        t += rnd.uniform(1.6, 4.2)
    if clip in ("walk", "run"):
        blinks = [] if T < 1.0 else blinks
    sacc, t = [(0.0, 0.0, 0.0)], 0.0
    while t < T:
        t += rnd.uniform(0.6, 1.8)
        if clip == "talk":
            yaw, pitch = (0.0, 0.0) if rnd.random() < 0.6 else (rnd.uniform(-10, 10), rnd.uniform(-4, 2))
        elif clip == "think":
            yaw, pitch = rnd.uniform(-14, 14), rnd.uniform(2, 8)
        else:
            yaw, pitch = rnd.uniform(-7, 7), rnd.uniform(-3, 3)
        sacc.append((t, yaw, pitch))
    if loop:
        sacc.append((T, 0.0, 0.0))
    out = {k: [0.0] * n for k in ("blink_L", "blink_R", "brow_up_L", "brow_up_R", "brow_inner_L", "brow_inner_R",
                                   "brow_down_L", "brow_down_R", "mouth_open", "lips_part", "smile", "frown",
                                   "press", "mouth_wide", "squint_L", "squint_R")}
    eyes = []
    for f in range(n):
        t = f / fps
        u = f / n
        b = max([_pulse(t, x) for x in blinks] + [0.0])
        out["blink_L"][f] = b
        out["blink_R"][f] = max([_pulse(t, x + 0.012) for x in blinks] + [0.0])
        # gaze: hold, then a quick 3-frame saccade to the next target
        yaw = pitch = 0.0
        for i in range(len(sacc)):
            t0, y0, p0 = sacc[i]
            t1 = sacc[i + 1][0] if i + 1 < len(sacc) else 1e9
            if t0 <= t < t1:
                _, yp, pp = sacc[i - 1] if i else (0, 0.0, 0.0)
                k = min(1.0, (t - t0) / 0.1)
                k = k * k * (3 - 2 * k)
                yaw, pitch = yp + (y0 - yp) * k, pp + (p0 - pp) * k
                break
        eyes.append((pitch, yaw))
        micro = 0.06 * math.sin(math.tau * u * 2 + 0.7) + 0.04 * math.sin(math.tau * u * 5)
        if clip == "idle":
            out["brow_up_L"][f] = out["brow_up_R"][f] = max(0.0, micro)
            out["smile"][f] = 0.10 + 0.05 * math.sin(math.tau * u)
            out["press"][f] = 0.08 * max(0.0, math.sin(math.tau * u * 3))
        elif clip == "talk":
            syl = max(0.0, math.sin(math.tau * u * 11)) * (0.6 + 0.4 * math.sin(math.tau * u * 3 + 1))
            out["mouth_open"][f] = 0.32 * syl
            out["lips_part"][f] = 0.25 * syl
            out["mouth_wide"][f] = 0.15 * max(0.0, math.sin(math.tau * u * 4 + 2))
            beat = max(0.0, math.sin(math.tau * u * 4))
            out["brow_up_L"][f] = 0.35 * beat + micro
            out["brow_up_R"][f] = 0.25 * beat + micro
            out["smile"][f] = 0.18
        elif clip == "think":
            out["brow_inner_L"][f] = out["brow_inner_R"][f] = 0.35
            out["brow_down_L"][f] = 0.30
            out["brow_down_R"][f] = 0.18
            out["press"][f] = 0.30
            out["squint_L"][f] = out["squint_R"][f] = 0.15
        elif clip == "gesture_offer":
            out["smile"][f] = 0.35 * math.sin(math.pi * min(1.0, u * 1.5))
            out["brow_up_L"][f] = out["brow_up_R"][f] = 0.25 * math.sin(math.pi * u)
        elif clip == "celebrate":
            out["smile"][f] = 0.85
            out["brow_up_L"][f] = out["brow_up_R"][f] = 0.55
            out["mouth_open"][f] = 0.25 + 0.1 * math.sin(math.tau * u * 2)
            out["squint_L"][f] = out["squint_R"][f] = 0.3
        elif clip == "defeat":
            out["brow_inner_L"][f] = out["brow_inner_R"][f] = 0.7 * min(1.0, u * 3)
            out["frown"][f] = 0.5 * min(1.0, u * 3)
        elif clip in ("walk", "run"):
            out["smile"][f] = 0.08
            out["mouth_open"][f] = 0.12 if clip == "run" else 0.0
    return out, eyes


def bake_face(rig, body, actions):
    """Shape-key actions (same names as the clips) and eye-bone keys added to each armature action."""
    sk = body.data.shape_keys
    sk.animation_data_create()
    face_actions = {}
    for clip, act in actions.items():
        n, loop, _ = agent_anim.CLIPS[clip]
        curves, eyes = face_curves(clip, n, loop)
        fa = bpy.data.actions.new(clip + "_face")
        fa.use_fake_user = True
        sk.animation_data.action = fa
        for name, vals in curves.items():
            if name not in sk.key_blocks:
                continue
            kb = sk.key_blocks[name]
            for f, x in enumerate(vals):
                kb.value = max(0.0, min(1.0, x))
                kb.keyframe_insert("value", frame=f)
        rig.animation_data.action = act
        for f, (pitch, yaw) in enumerate(eyes):
            for s in ("L", "R"):
                pb = rig.pose.bones[f"eye_{s}"]
                pb.rotation_quaternion = __import__("mathutils").Euler((math.radians(pitch), 0.0, math.radians(yaw))).to_quaternion()
                pb.keyframe_insert("rotation_quaternion", frame=f, group=f"eye_{s}")
        face_actions[clip] = fa
    sk.animation_data.action = None
    rig.animation_data.action = None
    return face_actions


def to_nla(obj_or_key, actions_by_clip):
    ad = obj_or_key.animation_data_create()
    for clip, act in actions_by_clip.items():
        tr = ad.nla_tracks.new()
        tr.name = clip
        st = tr.strips.new(clip, int(act.frame_range[0]), act)
        st.name = clip
    ad.action = None


def add_collision_and_sockets(rig):
    b = bmesh.new()
    bmesh.ops.create_cone(b, cap_ends=True, segments=10, radius1=0.26, radius2=0.20, depth=1.75)
    for v in b.verts:
        v.co.z += 0.875
    me = bpy.data.meshes.new("agent_iris_col")
    b.to_mesh(me)
    b.free()
    col = bpy.data.objects.new("agent_iris_col", me)
    bpy.context.scene.collection.objects.link(col)
    col.parent = rig
    socks = []
    for name, bone, loc in (("socket_head", "head", None), ("socket_hand_r", "prop_R", None)):
        e = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(e)
        bb = rig.data.bones[bone]
        e.location = rig.matrix_world @ (bb.head_local if bone == "prop_R" else (bb.head_local + bb.tail_local) / 2)
        e.parent = rig
        e.parent_type = "BONE"
        e.parent_bone = bone
        e.matrix_world = Matrix.Translation(rig.matrix_world @ (bb.head_local if bone == "prop_R" else (bb.head_local + bb.tail_local) / 2))
        socks.append(e)
    return col, socks


def lips_attr(body):
    if "lips" not in body.vertex_groups:
        return
    gi = body.vertex_groups["lips"].index
    a = body.data.attributes.get("lipsw") or body.data.attributes.new("lipsw", "FLOAT", "POINT")
    for v in body.data.vertices:
        a.data[v.index].value = next((g.weight for g in v.groups if g.group == gi), 0.0)


def stage_full(shade=True, size=2048, samples=16):
    bm, rig, eye_objs, garments = stage_costume()
    lips_attr(bm)
    hair = [garments.pop("hair"), garments.pop("hair_cap")]
    cloth = list(garments.values())
    if shade:
        land = {"cheeks": [], "ears": [], "brows": []}
        for s, sx in (("L", 1), ("R", -1)):
            e = rig.data.bones[f"eye_{s}"].head_local
            land["cheeks"].append((e.x + sx * 0.012, e.y - 0.006, e.z - 0.042))
            land["ears"].append((sx * 0.075, e.y + 0.09, e.z - 0.02))
            land["brows"].append(((e.x - sx * 0.006, e.y - 0.004, e.z + 0.024), sx))
        e = rig.data.bones["eye_L"].head_local
        land["nose"] = (0.0, e.y - 0.03, e.z - 0.035)
        sc = bpy.context.scene
        sc.render.engine = "CYCLES"
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "OPTIX"
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
            sc.cycles.device = "GPU"
        except Exception as e:
            log("gpu", e)
        if not sc.world:
            sc.world = bpy.data.worlds.new("w")
        S.paint_garment_attrs(cloth)
        S.pack_atlas(cloth)
        S.bake_set([bm], "M_Iris_Skin", S.skin_shader, size, OUT, "skin", samples, land=land)
        S.bake_set(cloth, "M_Iris_Garment", S.garment_shader, size, OUT, "garment", samples)
        S.bake_set(hair, "M_Iris_Hair", S.hair_shader, size, OUT, "hair", samples, ao=False)
        S.bake_set(eye_objs, "M_Iris_Eye", S.eye_shader, 512, OUT, "eye", samples, ao=False)
        lash = S.flat_material("M_Iris_Lashes", (0.012, 0.008, 0.006), 0.8)
        bm.data.materials.append(lash)
        la = bm.data.attributes.get("lash")
        if la:
            for p in bm.data.polygons:
                if all(la.data[i].value > 0.5 for i in p.vertices):
                    p.material_index = 1
    acts = agent_anim.bake_clips(rig, "iris", log=log)
    actions = {c: bpy.data.actions[c] for c in agent_anim.CLIPS}
    face = bake_face(rig, bm, actions)
    to_nla(rig, actions)
    to_nla(bm.data.shape_keys, face)
    col, socks = add_collision_and_sockets(rig)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "iris_hero.blend"))
    path = os.path.join(OUT, "agent_iris.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in [rig, bm, col, *eye_objs, *cloth, *hair, *socks]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=False,
        export_yup=True, export_tangents=True, export_extras=True, export_image_format="AUTO",
        export_cameras=False, export_lights=False, export_skins=True, export_all_influences=False,
        export_def_bones=False, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_frame_step=1, export_morph=True, export_morph_normal=True,
        export_morph_animation=True, export_reset_pose_bones=True, export_optimize_animation_size=False,
        export_rest_position_armature=True)
    log("exported", path, os.path.getsize(path))
    return path


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    stage = argv[0] if argv else "body"
    if stage == "full":
        stage_full(shade="--noshade" not in argv)
    else:
        {"body": stage_body, "costume": stage_costume}[stage]()

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
import hero_hair as H  # noqa: E402
import hero_anatomy as A  # noqa: E402

from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.targetservice import TargetService  # noqa: E402
import bl_ext.user_default.mpfb as MPFB  # noqa: E402

V = Vector
OUT = os.path.join(AGENTS, "_raw", "iris_hero")
MPFB_TARGETS = os.path.join(os.path.dirname(MPFB.__file__), "data", "targets")
EYE_HEIGHT = 1.640          # the agent rig's eye line (agent_geometry.FACE): the body is scaled to it
ARM_DEG = 14.0              # agent rest stance: arms 14 deg off the body, hanging straight

COSTUME = os.environ.get("IRIS_COSTUME", "athletic")    # athletic (owner 09.11) | wanderer (the coat)

ATHLETIC = {                  # owner's body reference and anatomy brief 09.11 (proportions; volume in hero_anatomy.py)
    # waist: narrow and clean, a long soft curve into the hips; a flat, toned stomach
    "torso/measure-waist-circ-decr": 0.70, "torso/measure-underbust-circ-decr": 0.25,
    "torso/measure-waisttohip-dist-incr": 0.35, "stomach/stomach-pregnant-decr": 0.90,
    # pelvis: the reference's hips are about as wide as its shoulders (0.21 H from the back)
    "torso/measure-hips-circ-decr": 0.05,
    # seat: anatomical gluteal volume (the MakeHuman target places it on the gluteus maximus)
    "buttocks/buttocks-volume-incr": 0.60, "hip/hip-scale-depth-incr": 0.10,
    # legs: a long line; upper thighs full enough to balance the seat (the reference's thigh is 0.10-0.12 H
    # deep in profile), quadriceps and hamstrings, a gradual taper to natural knees and calves
    "legs/upperlegs-height-incr": 0.15, "legs/lowerlegs-height-incr": 0.10,
    "legs/l-upperleg-muscle-incr": 0.40, "legs/r-upperleg-muscle-incr": 0.40,
    "legs/l-upperleg-scale-depth-incr": 0.30, "legs/r-upperleg-scale-depth-incr": 0.30,
    "legs/measure-thigh-circ-incr": 0.20,
    "legs/l-lowerleg-fat-decr": 0.20, "legs/r-lowerleg-fat-decr": 0.20,
    # bust: natural, medium and lifted
    "breast/breast-trans-up": 0.35, "breast/breast-volume-vert-up": 0.30, "breast/breast-point-decr": 0.80,
    # upper body: slightly narrower shoulders, lean arms
    "torso/measure-shoulder-dist-decr": 1.00,
    "arms/l-upperarm-fat-decr": 0.30, "arms/r-upperarm-fat-decr": 0.30,
    "arms/l-lowerarm-fat-decr": 0.20, "arms/r-lowerarm-fat-decr": 0.20,
}

MACROS = {"gender": 0.0, "age": 0.48, "muscle": 0.5, "weight": 0.42, "height": 0.62, "proportions": 0.75,
          "cupsize": 0.45, "firmness": 0.55, "race": {"african": 0.08, "asian": 0.17, "caucasian": 0.75}}

# Stylization and slight asymmetry (MakeHuman detail targets, CC0): name -> weight.
DETAIL = {
    "eyes/r-eye-scale-incr": 0.35, "eyes/l-eye-scale-incr": 0.32,
    "eyes/r-eye-trans-up": 0.10, "eyes/l-eye-trans-up": 0.14,
    "eyes/r-eye-bag-decr": 0.8, "eyes/l-eye-bag-decr": 0.8,                 # a smaller lower lid
    "eyes/r-eye-bag-height-decr": 0.6, "eyes/l-eye-bag-height-decr": 0.6,
    "eyes/r-eye-corner2-up": 0.25, "eyes/l-eye-corner2-up": 0.22,           # a lifted outer corner
    "nose/nose-scale-horiz-decr": 0.25, "nose/nose-width2-decr": 0.2,
    "chin/chin-width-decr": 0.25, "mouth/mouth-lowerlip-volume-incr": 0.25,
    "cheek/l-cheek-bones-incr": 0.22, "cheek/r-cheek-bones-incr": 0.16,
    "head/head-fat-decr": 0.2,
    # head refinement: an oval head with a fuller back (visible with the hair tied back), a slender
    # longer neck, a defined chin, a softer nose with a slightly lifted tip, a cupid's bow
    "head/head-oval": 0.45, "head/head-back-scale-depth-incr": 0.30, "forehead/forehead-temple-decr": 0.20,
    "chin/chin-prominent-incr": 0.15, "chin/chin-height-incr": 0.10, "chin/chin-jaw-drop-decr": 0.15,
    "cheek/l-cheek-volume-decr": 0.18, "cheek/r-cheek-volume-decr": 0.12,
    "nose/nose-hump-decr": 0.35, "nose/nose-point-up": 0.25, "nose/nose-nostrils-width-decr": 0.20,
    "mouth/mouth-cupidsbow-incr": 0.45, "mouth/mouth-angles-up": 0.15,
    "neck/measure-neck-circ-decr": 0.25, "neck/neck-scale-vert-incr": 0.15,
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

def make_human(athletic=None):
    athletic = (COSTUME == "athletic") if athletic is None else athletic
    bm = HumanService.create_human(mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True,
                                   feet_on_ground=True, scale=0.1,
                                   macro_detail_dict={**MACROS, **({"muscle": 0.55, "weight": 0.42, "cupsize": 0.85,
                                                                    "firmness": 0.85, "proportions": 1.0} if athletic else {})})
    for name, w in {**DETAIL, **(ATHLETIC if athletic else {})}.items():
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


# Posture (owner 09.11: "a hunched dog; stand her straight: a straight back, a curve in the small of the
# back, the head over the shoulders, as in the reference"). MakeHuman's neutral stance has the neck and head
# forward and the upper back rounded. Degrees about the body's X axis at each bone's head, applied root
# to tip in the pose before it is baked, so the joints (and the agent rig built from them) move with the mesh;
# negative = the part above leans back. The head is turned back by the sum so the gaze stays level.
POSTURE = {"spine01": -1.0, "neck01": -12.0, "neck02": -4.0}   # neck and head only: the pelvis and lumbar stay neutral (owner brief: no posture to fake the seat)


def lean_pose_bone(rig, n, deg):
    pb = rig.pose.bones[n]
    bpy.context.view_layer.update()
    M = pb.matrix.copy()
    t = M.translation.copy()
    pb.matrix = Matrix.Translation(t) @ Matrix.Rotation(math.radians(deg), 4, "X") @ Matrix.Translation(-t) @ M
    bpy.context.view_layer.update()


def repose(bm, rig):
    """Upright posture, arms down to the agent stance, legs straight under the hips; the result becomes the
    rest mesh."""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    if COSTUME == "athletic":
        for n in ("spine05", "spine04", "spine03", "spine02", "spine01", "neck01", "neck02", "neck03"):
            if POSTURE.get(n):
                lean_pose_bone(rig, n, POSTURE[n])
        lean_pose_bone(rig, "head", -sum(POSTURE.values()))
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
        want = V((side * 0.085, hip.y, 0.0)) - hip
        aim_pose_bone(rig, f"upperleg01.{s}", want.normalized())
        aim_pose_bone(rig, f"upperleg02.{s}", want.normalized())
        knee = bone_world(rig, f"lowerleg01.{s}")
        down = V((side * 0.085, hip.y, 0.0)) - knee                # shins vertical: the body stands upright
        aim_pose_bone(rig, f"lowerleg01.{s}", down.normalized())
        aim_pose_bone(rig, f"lowerleg02.{s}", down.normalized())
    bpy.ops.object.mode_set(mode="OBJECT")
    # bake the pose into the mesh (the basemesh has no shape keys after bake_targets)
    bpy.context.view_layer.objects.active = bm
    for m in list(bm.modifiers):
        if m.type == "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=m.name)
    J = {pb.name: (bone_world(rig, pb.name), bone_world(rig, pb.name, True)) for pb in rig.pose.bones}
    # straightening the legs pushes the soles below the ground (3.6 cm on the athletic body): stand her on it
    feet = set()
    for gname in ("foot.L", "foot.R", "toe1-1.L", "toe1-1.R"):
        if gname in bm.vertex_groups:
            feet |= group_verts(bm, gname, 0.3)
    dz = -min(bm.data.vertices[i].co.z for i in feet) if feet else 0.0
    if abs(dz) > 1e-4:
        for v in bm.data.vertices:
            v.co.z += dz
        J = {n: (h + V((0, 0, dz)), t + V((0, 0, dz))) for n, (h, t) in J.items()}
    return J


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
    lashes = set()
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

def sculpt_body(bm, J):
    """The anatomical volume pass (hero_anatomy.py) on the athletic body, and the editable body shape key:
    iris_body_shape.blend holds the body before the pass as Basis and after it as BODY_FEM_TARGET."""
    import json
    me = bm.data
    me.update()
    H = max(v.co.z for v in me.vertices)
    names = {g.index: g.name for g in bm.vertex_groups}
    cos = [tuple(v.co) for v in me.vertices]
    nrm = [tuple(v.normal) for v in me.vertices]
    wts = [{names[g.group]: g.weight for g in v.groups} for v in me.vertices]
    joints = {n: (list(h), list(t)) for n, (h, t) in J.items()}
    off = A.offsets(cos, nrm, wts, joints, H)
    off = A.smooth_field(off, [tuple(e.vertices) for e in me.edges])
    for v, (dx, dy, dz) in zip(me.vertices, off):
        v.co += V((dx, dy, dz))
    # the editable shape key, in a copy of the body (the production body has no extra key)
    tmp = bm.copy()
    tmp.data = me.copy()
    tmp.name = "body_shape"
    bpy.context.scene.collection.objects.link(tmp)
    tmp.shape_key_add(name="Basis", from_mix=False)
    for v, c in zip(tmp.data.shape_keys.key_blocks["Basis"].data, cos):
        v.co = V(c)
    key = tmp.shape_key_add(name="BODY_FEM_TARGET", from_mix=False)
    for v, c in zip(key.data, me.vertices):
        v.co = c.co.copy()
    key.value = 1.0
    key.slider_max = 1.5
    tmp["amounts"] = json.dumps(A.amounts())
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "iris_body_shape.blend"), copy=True)
    bpy.data.objects.remove(tmp)


def stage_body():
    reset()
    bm, mrig = make_human()
    J = repose(bm, mrig)
    eyes = split_helpers(bm)
    k = scale_to_eye_line([bm], eyes)
    k_body = k
    if COSTUME == "athletic":
        # Iris's own face: the athletic macros also reshape the head, so the head and neck are taken from
        # a body built with the original macros (same topology), blended into the new body down the neck
        ref, rrig = make_human(athletic=False)
        repose(ref, rrig)
        eyes_ref = split_helpers(ref)
        k_ref = scale_to_eye_line([ref], eyes_ref)
        bpy.data.objects.remove(rrig)
        assert len(ref.data.vertices) == len(bm.data.vertices)
        zs = [v.co.z for v in bm.data.vertices]
        H = max(zs)
        z_lo, z_hi = 0.815 * H, 0.865 * H              # base of the neck .. under the jaw
        for va, vr in zip(bm.data.vertices, ref.data.vertices):
            z = va.co.z
            if z <= z_lo:
                continue
            t = min(1.0, (z - z_lo) / (z_hi - z_lo))
            t = t * t * (3 - 2 * t)
            va.co = va.co.lerp(vr.co, t)
        bpy.data.objects.remove(ref)
        eyes, k = eyes_ref, k_ref
    J = {n: (h * k_body, t * k_body) for n, (h, t) in J.items()}
    eyes_k = {p: (c * k, r * k) for p, (c, r) in eyes.items()}
    mpfb_bones = {b.name for b in mrig.data.bones}
    bpy.data.objects.remove(mrig)
    bm.name = "body"
    # the body before any sculpt, with its MPFB weights and the joints: the base for iterating on the sculpt
    # (hero_anatomy.py) and the Basis of the editable body shape key
    import json
    bm["joints"] = json.dumps({n: [list(h), list(t)] for n, (h, t) in J.items()})
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "iris_body_pre.blend"), copy=True)
    if COSTUME == "athletic":                      # the athletic body (owner reference: owner_athletic_body_reference.py)
        sculpt_body(bm, J)
        # soften the nipple detail so tight tops and the jacket lie smoothly over the bust
        b = bmesh.new()
        b.from_mesh(bm.data)
        b.verts.ensure_lookup_table()
        nip = set()
        for gname in ("nipple", "nippleTip"):
            if gname in bm.vertex_groups:
                nip |= group_verts(bm, gname, 0.01)
        ring = set(nip)
        for _ in range(2):
            ring |= {e.other_vert(b.verts[i]).index for i in list(ring) for e in b.verts[i].link_edges}
        sel = [b.verts[i] for i in ring]
        for _ in range(12):
            bmesh.ops.smooth_vert(b, verts=sel, factor=0.7, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        b.to_mesh(bm.data)
        b.free()
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


def drape_front(o, P, soft=1.0):
    """Fabric over the bust falls straight from its fullest point instead of hugging the under-bust:
    each front vertex below the bust line is pulled forward to the bust's front plane (per x column)."""
    import bmesh as _bm
    me = o.data
    c, _, _ = P.section(1.25)
    pts = [o.matrix_world @ v.co for v in me.vertices]
    front = [p for p in pts if p.y < c.y and 1.22 < p.z < 1.32]
    if not front:
        return
    def bust_y(x):                                     # the most forward point near this column
        near = [p.y for p in front if abs(p.x - x) < 0.02]
        return min(near) if near else None
    for v, p in zip(me.vertices, pts):
        if p.y >= c.y or not (1.13 < p.z < 1.26):
            continue
        by = bust_y(p.x)
        if by is None or p.y <= by:
            continue
        w = soft * (1.0 if p.z < 1.22 else (1.26 - p.z) / 0.04)
        v.co.y += (by - p.y) * w * (0.85 if p.z > 1.18 else 1.0)
    me.update()


def athletic_chains(head_c, tie):
    """Sportswear is tight: springs only for the hair, the ponytail and the jacket's open front."""
    t = V(tie)
    return (
        ("hair_L", ((0.085, head_c.y, 1.62), (0.10, head_c.y + 0.01, 1.55), (0.105, head_c.y + 0.02, 1.50)), "head"),
        ("hair_R", ((-0.085, head_c.y, 1.62), (-0.10, head_c.y + 0.01, 1.55), (-0.105, head_c.y + 0.02, 1.50)), "head"),
        ("hair_B", ((0, head_c.y + 0.09, 1.66), (0, head_c.y + 0.10, 1.60), (0, head_c.y + 0.10, 1.56)), "head"),
        ("tail", (tuple(t), tuple(t + V((0, 0.025, -0.06))), tuple(t + V((0, 0.045, -0.12))), tuple(t + V((0, 0.055, -0.18)))), "head"),
    )


def athletic_costume(bm, P, dom, bones):
    """Premium fitted sportswear (owner 09.11): a cropped graphite zip jacket (continuous front panels
    from convex torso sections, a stand collar, zip plackets, fitted sleeves with violet piping), a matte
    black sports bra (one continuous compressing surface), high-rise leggings cut from the body with
    anatomical side panels, and trainers modelled as footwear."""
    co = {i: (bm.matrix_world @ v.co) for i, v in enumerate(bm.data.vertices)}
    TORSO = ("chest", "spine", "pelvis")
    torso_pts = [co[i] for i in co if dom[i] in TORSO]
    c, rx, ry = P.section(1.25)
    out = {}
    # sports bra: continuous compression top from convex sections, a scooped neckline (higher at the
    # sides and back), a supportive underbust band
    zs = [1.168 + (1.385 - 1.168) * k / 18 for k in range(19)]
    bra, n = C.hull_loft("sports_top", C.without_nipples(torso_pts), zs, 0.004, n=60, smooth=2)
    rows = len(zs)
    def neckline(th_front):                                   # top edge height by how frontal the column is
        return 1.385 - 0.060 * th_front ** 1.6 - 0.038 * th_front ** 8   # a soft scoop: cleavage (owner 09.11)
    me = bra.data
    cxy = sum((v.co for v in me.vertices), V()) / len(me.vertices)
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons([vv.co.copy() for vv in bm.data.vertices], [list(pp.vertices) for pp in bm.data.polygons])
    for i, v in enumerate(me.vertices):
        j, r = i % n, i // n
        th = math.atan2(v.co.y - cxy.y, v.co.x - cxy.x)
        front = max(0.0, -math.sin(th))
        top = neckline(front)
        z0 = zs[0]
        v.co.z = z0 + (v.co.z - z0) * (top - z0) / (zs[-1] - z0)
        loc, nrm, _, d = tree.find_nearest(v.co)
        if loc is not None and (v.co - loc).dot(nrm) < 0.004:
            v.co = loc + nrm * 0.004
    C.set_attr(bra, "trim", lambda i, p: 1.0 if p.z < 1.195 or (i // n) == rows - 1 else 0.0)
    C.set_attr(bra, "accent", lambda i, p: 0.0)
    C.solidify(bra, 0.0025, 1.0, even=False)
    C.smooth(bra, 50)
    out["sports_top"] = bra
    # jacket: the front is laid on one constructed garment surface (the chest as one volume, straight
    # fabric from the bust to the hem), the rest follows the body; clean zip plackets, a ribbed hem band,
    # a neckline cut round the stand collar
    x_edge = lambda z: 0.036 + 0.040 * (1.43 - z) / 0.28      # the zip edge: falls open toward the hem
    HEM = 1.15
    nc, nrx, nry = P.section(1.455, bones=("neck",))
    def neck_r(p):                                            # 1.0 on the collar base ellipse
        return math.hypot((p.x - nc.x) / (nrx + 0.010), (p.y - nc.y) / (nry + 0.011))
    wrist = {sx: bones[f"hand_{sx}"][0] for sx in ("L", "R")}
    ARM = ("shoulder_L", "shoulder_R", "upperarm_L", "upperarm_R", "forearm_L", "forearm_R")
    def upper_keep(i, _):
        p = co[i]
        d = dom[i]
        if d in TORSO + ("neck", "head", "shoulder_L", "shoulder_R"):
            if p.z < HEM or p.z > (1.460 if d == "head" else 1.470):
                return False
            if p.y < c.y and abs(p.x) < x_edge(min(p.z, 1.43)):
                return False
            if p.z > 1.38 and neck_r(p) < 1.0:
                return False
            return True
        if abs(p.x) > 0.15 and p.z < 1.10 or d in ARM:        # the forearm by position (thumb-side skin near the
            sx = "L" if p.x > 0 else "R"                      # wrist is weighted to the hand), cut straight
            E = bones[f"forearm_{sx}"][0]                     # across inside the cuff
            ax = (wrist[sx] - E).normalized()
            t = (wrist[sx] - p).dot(ax)
            radial = ((p - wrist[sx]) + ax * t).length
            return t > 0.020 and (d in ARM or (t < 0.10 and radial < 0.05))
        return False
    def upper_trim(p, nrm):
        return 0.0
    def upper_accent(p, nrm):                                 # a white stripe down the outer sleeve to the cuff,
        side = 1 if p.x > 0 else -1                           # carried over the shoulder to the collar
        sleeve = abs(p.x) > 0.16 and nrm.x * side > 0.90 and 1.02 < p.z < 1.40
        shoulder = p.z > 1.38 and abs(p.y - (c.y + 0.01)) < 0.012 and abs(p.x) > 0.085
        return 1.0 if sleeve or shoulder else 0.0
    def upper_edges(v):
        p = v.co
        if 1.08 < p.z < 1.17 and abs(p.x) < 0.25:              # the hem, never a sleeve's cut at the wrist
            p.z = HEM
        elif p.y < c.y and abs(p.x) < x_edge(p.z) + 0.03 and p.z < 1.42:    # straight zip edges
            p.x = math.copysign(x_edge(p.z), p.x)
        # the neckline is tucked inside the stand collar, which hides it
    def ease(p, nrm):                                         # snug at shoulder, elbow and wrist
        if abs(p.x) < 0.15:
            return 0.0085
        sx = "L" if p.x > 0 else "R"
        E, W, S0 = bones[f"forearm_{sx}"][0], wrist[sx], bones[f"upperarm_{sx}"][0]
        dE, dW, dS = (p - E).length, (p - W).length, (p - S0).length
        k = min(1.0, dE / 0.06) * min(1.0, dS / 0.07)          # the wrist: the ribbed cuff gathers it
        return 0.0030 + 0.0050 * k
    under = C.without_nipples(torso_pts) + [bra.matrix_world @ v.co for v in bra.data.vertices]
    depth = C.front_surface(under, 0.0050)                   # laid over the sports top, never through it
    def drape_w(p):
        if p.y > c.y or p.z < HEM - 0.01:
            return 0.0
        return (1.0 - C.smooth01(0.120, 0.172, abs(p.x))) * (1.0 - C.smooth01(1.355, 1.405, p.z))
    jk = C.shell_from_body(bm, "jacket", upper_keep, ease, 0.0035, trim=upper_trim,
                           accent=lambda p, nrm: 0.0, edges=upper_edges,   # (upper_accent off: jagged blocks at this density)
                           envelope=(lambda p: abs(p.x) < 0.17 and 1.14 < p.z < 1.40 and p.y > c.y,
                                     torso_pts, 0.013), edge_relax=4,
                           drape=(drape_w, depth, x_edge, HEM, 40), clear=(bra, 0.0035),
                           loop_smooth=(lambda p: p.z > 1.38 and not (p.y < c.y and abs(p.x) < x_edge(p.z) + 0.006
                                                                       and p.z < 1.415), 15))
    out["jacket"] = jk
    from mathutils.bvhtree import BVHTree
    jt = BVHTree.FromPolygons([jk.matrix_world @ v.co for v in jk.data.vertices], [list(f.vertices) for f in jk.data.polygons])
    def hit_front(x, z):                                      # the jacket's outer surface seen from the front
        h = jt.ray_cast(V((x, c.y - 0.5, z)), V((0, 1, 0)))
        return h[0]
    # zip plackets: a raised band on each front edge, edge to collar
    for sx, side in (("L", 1), ("R", -1)):
        def rows(t, side=side):
            z = HEM + 0.0005 + (1.414 - HEM) * t
            xe = x_edge(z)
            a = hit_front(side * (xe + 0.0010), z)
            b = hit_front(side * (xe + 0.0105), z)
            if a is None or b is None:
                return None
            lift = V((0, -0.0003, 0))                         # flush with the jacket (owner: no seam stands proud)
            return (a + lift + V((-side * 0.0012, 0, 0)), b + lift * 0.3)
        out[f"jacket_placket_{sx}"] = C.edge_strip(f"jacket_placket_{sx}", rows, 40, 0.0008)
    # ribbed hem band all round, open at the zip
    def hit_round(th, z):                                     # from inside out: the torso, never a sleeve
        d = V((math.cos(th), math.sin(th), 0))
        h = jt.ray_cast(V((c.x, c.y, z)), d)
        return None if h[0] is None else h[0] + d * 0.0035
    def hem_rows(t):
        th = -math.pi / 2 + math.radians(14) + t * (2 * math.pi - math.radians(28))
        a, b = hit_round(th, HEM + 0.0008), hit_round(th, HEM + 0.017)
        if a is None or b is None or (a.y < c.y and abs(a.x) < x_edge(HEM) + 0.001):
            return None
        d = V((math.cos(th), math.sin(th), 0)) * 0.0004
        return (a + d, b + d)
    out["jacket_hem"] = C.edge_strip("jacket_hem", hem_rows, 120, 0.0010, rib=True)
    # ribbed cuffs: a knit band round each sleeve end, cast from the forearm axis onto the sleeve
    for sx in ("L", "R"):
        E, W = bones[f"forearm_{sx}"][0], wrist[sx]
        ax = (W - E).normalized()
        u = ax.orthogonal().normalized()
        w = ax.cross(u).normalized()
        def hit_sleeve(th, back, W=W, ax=ax, u=u, w=w):       # the forearm skin from inside, plus the ease
            o = W - ax * back
            d = u * math.cos(th) + w * math.sin(th)
            h = tree.ray_cast(o, d, 0.12)
            return None if h[0] is None else h[0] + d * 0.0090
        def on_sleeve(th, back, W=W, ax=ax, u=u, w=w):        # the sleeve's outer surface (no ledge at the top)
            o = W - ax * back
            d = u * math.cos(th) + w * math.sin(th)
            h = jt.ray_cast(o, d, 0.12)
            return None if h[0] is None else h[0] + d * 0.0012
        def cuff_rows(t, hit_sleeve=hit_sleeve, on_sleeve=on_sleeve):   # from 1.2 cm past the sleeve's cut up over it
            th = t * 2 * math.pi
            a, b = hit_sleeve(th, 0.012), (on_sleeve(th, 0.046) or hit_sleeve(th, 0.046))
            if a is None or b is None:
                return None
            return (a, b)
        out[f"jacket_cuff_{sx}"] = C.edge_strip(f"jacket_cuff_{sx}", cuff_rows, 64, 0.0012, rib=True)
    gap = math.degrees(math.asin(min(0.95, (x_edge(1.42) + 0.004) / (nrx + 0.016))))
    out["jacket_collar"] = C.stand_collar(P, z0=1.400, gap_deg=gap)
    # leggings: from the body surface, high-rise, the crotch relaxed so it never cuts in
    LEG = ("thigh_L", "thigh_R", "shin_L", "shin_R")
    def leg_keep(i, _):
        p = co[i]
        return dom[i] in LEG + ("pelvis", "spine") and 0.115 < p.z < 1.03
    def leg_panel(p, nrm):
        side = 1 if p.x > 0 else -1
        centre = side * (0.095 + 0.022 * math.sin((p.z - 0.2) * 3.5))
        return 1.0 if 0.18 < p.z < 0.95 and side * (p.x - centre) > 0.016 else 0.0
    def leg_stripes(p, nrm):                                  # white stripes: outer hip to mid-thigh, outer shin
        side = 1 if p.x > 0 else -1
        outer = nrm.x * side
        thigh = 0.62 < p.z < 0.98 and outer > 0.80 and abs(nrm.y + 0.25) < 0.10
        shin = 0.22 < p.z < 0.42 and outer > 0.55 and abs(nrm.y + 0.45 - (p.z - 0.22) * 0.8) < 0.08
        return 1.0 if thigh or shin else 0.0
    def leg_edges(v):
        if v.co.z < 0.6:
            v.co.z = 0.12
        else:                                                 # a level top edge, hidden in the waistband
            v.co.z = 1.020
    # compression fabric unifies the forms: the crotch and a restrained glute cleft are bridged
    crotch = lambda p: (abs(p.x) < 0.07 and 0.70 < p.z < 0.88) or (abs(p.x) < 0.045 and p.y > c.y and 0.78 < p.z < 0.99)
    out["leggings"] = C.shell_from_body(bm, "leggings", leg_keep, 0.0028, 0.0018,
                                        trim=lambda p, nrm: 1.0 if p.z > 0.995 else leg_panel(p, nrm),
                                        accent=lambda p, nrm: 0.0, edges=leg_edges, relax=(crotch, 12),
                                        # compression knit lies over the glute cleft (owner: the cheeks rest together, no gap)
                                        bridge=(lambda p: p.y > c.y and abs(p.x) < 0.06 and 0.855 < p.z < 1.0, 0.028, 0.003))
    # (leg_stripes is off: per-vertex stripes read as jagged blocks on this mesh density; clean leggings)
    # waistband: a clean high-rise band over the leggings' top edge (no gaps at the waist)
    hip_pts = [co[i] for i in co if dom[i] in ("pelvis", "spine", "thigh_L", "thigh_R")]
    zs = [0.972 + (1.050 - 0.972) * k / 6 for k in range(7)]   # a reinforced band over the leggings' top
    wb, n = C.hull_loft("leggings_band", hip_pts, zs, 0.0050, n=72, smooth=2)   # just over the leggings' top
    C.set_attr(wb, "trim", lambda i, p: 1.0)
    C.set_attr(wb, "accent", lambda i, p: 0.0)
    # the band's lower edge dips in a V at the centre back (owner's reference: the seam runs on into the cleft)
    for v in wb.data.vertices:
        if v.co.y > c.y and v.co.z < 0.990:
            v.co.z -= 0.030 * max(0.0, 1.0 - abs(v.co.x) / 0.075) * min(1.0, (0.990 - v.co.z) / 0.016)
    C.solidify(wb, 0.0012, 1.0, even=False)
    C.smooth(wb, 50)
    out["leggings_band"] = wb
    # piping, the centre back seam and the sleeve stripes as clean lines on the fabric (owner's reference 09.11)
    sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(max(0.0, min(1.0, (x - a) / (b - a))))
    leg = out["leggings"]
    for sx, side in (("L", 1), ("R", -1)):
        hip, knee = bones[f"thigh_{sx}"][0], bones[f"shin_{sx}"][0]
        def pipe_ray(t, side=side, hip=hip, knee=knee):
            # one continuous path: rays from an axis that moves from the pelvis centre to the thigh's axis,
            # turning from near the centre back (18 deg) round the cheek to the outside of the leg (92 deg)
            z = 0.985 - (0.985 - 0.30) * t
            f = (hip.z - z) / max(hip.z - knee.z, 1e-3)
            lc = hip.lerp(knee, max(0.0, min(1.3, f)))
            k = sm(0.93, 0.82, z)
            cen = V((lc.x * k, c.y * (1 - k) + lc.y * k, z))
            phi = math.radians(18 + 44 * sm(0.985, 0.86, z) + 30 * sm(0.86, 0.50, z))
            d = V((side * math.sin(phi), math.cos(phi), 0))
            return cen + d * 0.4, -d
        o = C.surface_line(f"leggings_piping_{sx}", leg, pipe_ray, 180, 0.0028, lift=0.0012)
        if o:
            out[o.name] = o
    o = C.surface_line("leggings_seam_back", leg, lambda t: (V((0.0, 0.6, 0.944 - 0.070 * t)), V((0, -1, 0))), 24, 0.0016, lift=0.0010,
                       trim=1.0, accent=0.0)
    if o:
        out[o.name] = o
    jk = out.get("jacket")
    if jk:
        for sx, side in (("L", 1), ("R", -1)):
            sh, el = bones[f"upperarm_{sx}"]
            wr = bones[f"forearm_{sx}"][1]
            def stripe_ray(t, side=side, sh=sh, el=el, wr=wr):
                a = sh.lerp(el, min(1.0, t * 2)) if t < 0.5 else el.lerp(wr, (t - 0.5) * 2 * 0.86)
                axis = (el - sh).normalized() if t < 0.5 else (wr - el).normalized()
                out_d = V((side, 0.12, 0))
                out_d = (out_d - axis * out_d.dot(axis)).normalized()
                return a + out_d * 0.3, -out_d
            o = C.surface_line(f"jacket_stripe_{sx}", jk, stripe_ray, 120, 0.011, lift=0.0010)
            if o:
                out[o.name] = o
    # trainers (built from the foot) and grey ankle socks that tuck under the leggings' hem (owner 09.11:
    # the ankle under the hem was empty and the old shoe twisted)
    for sfx, side in (("L", 1), ("R", -1)):
        foot_idx = [i for i in co if dom[i] in (f"foot_{sfx}", f"toe_{sfx}", f"shin_{sfx}") and co[i].z < 0.11]
        out[f"trainers_{sfx}"] = C.trainer(bm, foot_idx, f"trainers_{sfx}", side)
        sock_keep = lambda i, _, sfx=sfx: dom[i] in (f"foot_{sfx}", f"shin_{sfx}", f"toe_{sfx}") and 0.030 < co[i].z < 0.140
        def sock_edges(v):
            if v.co.z > 0.09:
                v.co.z = 0.138                                   # tucked under the leggings' hem (0.12)
        out[f"ankle_socks_{sfx}"] = C.shell_from_body(bm, f"ankle_socks_{sfx}", sock_keep, 0.0016, 0.0012,
                                                      trim=lambda p, n: 0.0, accent=lambda p, n: 0.0, edges=sock_edges)
    return out


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
    if COSTUME == "athletic":
        garments.update(athletic_costume(bm, P, dom, bones))
        tail_pts = None
    else:
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
    scalp = hair_region(bm, dom)
    garments["hair_cap"] = C.hair_cap(bm, inset_region(bm, scalp, 0.008), offset=0.0015)
    brow_z = max(c.z for c, _ in [(h, 0) for h in (bones["eye_L"][0], bones["eye_R"][0])]) + 0.028
    garments["hair"], _master, tie = groom_hair(bm, rig, garments, scalp, head_c, head_r)

    chains = (athletic_chains(head_c, tie) if COSTUME == "athletic"
              else hero_chains(P, garments["coat"], tail_pts, head_c))
    install_chains(chains)
    bpy.data.objects.remove(rig)
    rig = rebuild_rig(bm)
    for nm in ("hair_master", "hair_master_guides"):          # the master groom follows the head bone
        o = bpy.data.objects.get(nm)
        if o:
            mw = o.matrix_world.copy()
            o.parent = rig
            o.parent_type = "BONE"
            o.parent_bone = "head"
            o.matrix_world = mw

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
        if COSTUME == "athletic" and p.y > tie.y - 0.015 and p.z < tie.z + 0.005:
            return ("tail", smoothstep((tie.z + 0.005 - p.z) / 0.04))
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
    cz, crx, cry = P.section(1.10)

    wrists = {sx: rig.data.bones[f"hand_{sx}"].head_local.copy() for sx in ("L", "R")}

    def covered(i, co):
        d = dom[i]
        if co.z > 1.445:
            return False
        if d in HAND_BONES:
            return False
        if COSTUME == "athletic" and d in ("spine", "pelvis", "chest"):
            if (0.990 if co.y < cz.y else 1.035) < co.z < 1.205:   # the bare midriff, kept under the band's front and the top's hem
                return False                                        # (no see-through gap; never through the band at the back)
            if 1.27 < co.z and co.y < cz.y:             # the neckline and cleavage above the top, inside the open jacket
                return False
        if d in ("forearm_L", "forearm_R") and (co - wrists[d[-1]]).length < 0.055:
            return False                                # skin under the cuff: no see-through at the wrist
        return True
    ref = bm.copy()                                   # the full body, for anatomy review only (not exported)
    ref.data = bm.data.copy()
    ref.name = "body_review_full"
    bpy.context.scene.collection.objects.link(ref)
    ref.hide_render = True
    delete_verts(bm, covered)
    log("costume", {n: len(o.data.polygons) for n, o in garments.items()})
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "iris_costume.blend"))
    return bm, rig, eye_objs, garments


def inset_region(bm, idx, d):
    """The region shrunk by d metres from its border."""
    from mathutils.kdtree import KDTree
    sset = set(idx)
    me = bm.data
    ec = {}
    for p in me.polygons:
        if all(v in sset for v in p.vertices):
            for e in p.edge_keys:
                ec[e] = ec.get(e, 0) + 1
    border = {v for e, n in ec.items() if n == 1 for v in e}
    kd = KDTree(len(border))
    for i, v in enumerate(border):
        kd.insert(me.vertices[v].co, i)
    kd.balance()
    return [i for i in idx if kd.find(me.vertices[i].co)[2] > d]


def hair_region(bm, dom):
    """Vertices where hair grows: a natural hairline over the forehead and temples, above and behind the
    ears and down the back of the head to the nape (the MakeHuman scalp group alone leaves the temples
    and the area behind the ears bare)."""
    pts = [(i, bm.matrix_world @ v.co) for i, v in enumerate(bm.data.vertices) if dom[i] == "head"]
    zs = [p.z for _, p in pts]
    hp = [p for _, p in pts if p.z > 1.50]
    xs = [p.x for p in hp]; ys = [p.y for p in hp]
    c = V(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(zs) + 1.50) / 2))
    r = ((max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2, (max(zs) - 1.50) / 2)
    ears = group_verts(bm, "ears", 0.3) if "ears" in bm.vertex_groups else set()
    out = []
    for i, p in pts:
        if i in ears:
            continue
        q = p - c
        fy, sx, zz = q.y / r[1], abs(q.x) / r[0], q.z / r[2]
        if fy < -0.35:                                   # forehead: a rounded hairline, lower at the temples
            need = 0.52 - 0.22 * min(1.0, sx / 0.75) ** 2
        elif fy < 0.0:                                   # temples and above the ears
            need = 0.15 - 0.40 * (fy + 0.35) / 0.35
        else:                                            # behind the ears and the back, down to the nape
            need = -0.25 - 0.50 * min(1.0, fy / 0.5)
        if zz > need:
            out.append(i)
    return out


def groom_hair(bm, rig, garments, scalp, head_c, head_r):
    """Master groom (Hair Curves, kept in the 'Hair_Master' collection) and the game cards built from it."""
    neck_z = rig.data.bones["head"].head_local.z - 0.01
    head = bm.copy()
    head.data = bm.data.copy()
    head.name = "_head_collider"
    if head.data.shape_keys:
        head.shape_key_clear()
    bpy.context.scene.collection.objects.link(head)
    for m in list(head.modifiers):
        head.modifiers.remove(m)
    head.parent = None
    delete_verts(head, lambda i, co: co.z < neck_z - 0.04)
    body_parts = [garments[k] for k in ("collar", "hood", "capelet", "scarf_wrap_0", "scarf_wrap_1", "coat",
                                        "jacket", "jacket_collar") if k in garments]
    cols = (H.Collider([head], 0.003), H.Collider(body_parts + [head], 0.010))
    G = H.Tied(bm, scalp, head_c, head_r, cols)
    strands, radii, guides = G.strands(None, 30000)
    coll = bpy.data.collections.new("Hair_Master")
    bpy.context.scene.collection.children.link(coll)
    gmat = H.hair_material()
    H.build_curves("hair_master_guides", [g["pts"] for g in guides], [0.0002] * len(guides), gmat, coll).hide_render = True
    master = H.build_curves("hair_master", strands, radii, gmat, coll)
    garments["hair_tie"] = H.hair_tie(G.T + V((0, 0.006, -0.004)), G.tail[2] - G.tail[0])
    bpy.data.objects.remove(head)
    cards = H.cards_from_groom(guides, strands, head_c=head_c, tie=G.T)
    master["groom"] = "Hair Curves master: edit here, rebuild the cards with cards_from_groom"
    log("hair", len(guides), "guides", len(strands), "strands", len(cards.data.polygons), "card faces")
    return cards, master, G.T


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
        n, loop, _ = agent_anim.clip_spec("iris", clip)
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


def beauty_mark(body):
    """A point on the skin of her left cheek, up and out from the left mouth corner."""
    a = body.data.attributes["lipsw"]
    pts = [body.matrix_world @ v.co for v in body.data.vertices if a.data[v.index].value > 0.5]
    m = sum(pts, V()) / len(pts)
    corner = max(pts, key=lambda p: p.x)
    want = V((corner.x + 0.011, m.y, m.z + 0.019))
    front = [body.matrix_world @ v.co for v in body.data.vertices
             if (body.matrix_world @ v.co).y < m.y + 0.03 and abs((body.matrix_world @ v.co).z - want.z) < 0.03]
    return tuple(min(front, key=lambda p: (p.x - want.x) ** 2 + (p.z - want.z) ** 2 + 0.05 * (p.y - want.y) ** 2))


def add_lashes(body, rig):
    """Upper lashes: a strip rooted on the upper lid margin, curling up and out, longer at the outer
    corner. The strip is part of the body mesh, and every face morph moves it with its lid vertex."""
    me = body.data
    b = bmesh.new()
    b.from_mesh(me)
    b.verts.ensure_lookup_table()
    layers = [b.verts.layers.shape[k.name] for k in me.shape_keys.key_blocks] if me.shape_keys else []
    basis_l = layers[0] if layers else None
    lash_a = b.verts.layers.float.get("lash") or b.verts.layers.float.new("lash")
    for sfx, sx in (("L", 1), ("R", -1)):
        E = rig.data.bones[f"eye_{sfx}"].head_local
        r = max(bpy.data.objects[f"eyeball_{sfx}"].dimensions) / 2
        bins = {}
        for v in b.verts:
            d = v.co - E
            if not (r * 0.95 < d.length < r * 1.25 and d.y < -r * 0.35 and d.z > -r * 0.05):
                continue
            ang = math.atan2(d.z, d.x * sx)
            k = int(ang / math.pi * 12)
            if 0 <= k <= 11 and (k not in bins or d.length < (bins[k].co - E).length):
                bins[k] = v
        margin = [bins[k] for k in sorted(bins, reverse=True)]          # inner corner -> outer corner
        prev = None
        for i, mv in enumerate(margin):
            t = i / max(len(margin) - 1, 1)
            out = (mv.co - E).normalized()
            dirn = (out * 0.55 + V((sx * 0.25 * t, -0.35, 0.85))).normalized()
            L = 0.0055 + 0.0055 * t ** 1.4
            row = []
            for j, k in enumerate((0.0, 1.0)):
                base = mv.co + dirn * (L * k) + V((0, 0, 0.0012 * k))
                for w in (-0.0006, 0.0006):
                    nv = b.verts.new(base + V((0, w, 0)))
                    nv[lash_a] = 1.0
                    for lay in layers:
                        nv[lay] = mv[lay] + (nv.co - mv.co)
                    row.append(nv)
            if prev:
                b.faces.new((prev[0], row[0], row[2], prev[2]))
                b.faces.new((prev[1], prev[3], row[3], row[1]))
            prev = row
    b.to_mesh(me)
    b.free()
    me.update()


def hair_textures(cards, size):
    """Card material: the strand atlas rendered from master-style strands (RGBA), flat ORM and normal."""
    import numpy as np
    p = H.render_strand_atlas(os.path.join(OUT, "agent_iris_hair_basecolor.png"), size)
    # alpha coverage that survives the mip chain: grow each strand by a pixel and lift soft edges, so
    # a card stays mostly opaque where its strands are dense when the game samples a small mip
    from PIL import Image, ImageFilter
    im = Image.open(p).convert("RGBA")
    r, g, b2, a = im.split()
    a = a.filter(ImageFilter.MaxFilter(3)).point(lambda x: min(255, int(x * 1.35)))
    rgb = Image.merge("RGB", (r, g, b2)).filter(ImageFilter.MaxFilter(3))     # colour under the grown alpha
    Image.merge("RGBA", (*rgb.split(), a)).save(p)
    base = bpy.data.images.load(p)
    base.name = "agent_iris_hair_basecolor"
    small = 64
    # colour space first: changing it on a generated image regenerates the buffer, which had saved both
    # maps as zeros (occlusion 0, roughness 0, a (0,0,0) normal: the black hair cards in close-ups)
    orm = bpy.data.images.new("agent_iris_hair_orm", small, small)
    orm.colorspace_settings.name = "Non-Color"
    orm.pixels[:] = np.tile([1.0, 0.55, 0.0, 1.0], small * small)
    nrm = bpy.data.images.new("agent_iris_normal_hair", small, small)
    nrm.colorspace_settings.name = "Non-Color"
    nrm.pixels[:] = np.tile([0.5, 0.5, 1.0, 1.0], small * small)
    for img, want in ((orm, (1.0, 0.55, 0.0)), (nrm, (0.5, 0.5, 1.0))):
        img.filepath_raw = os.path.join(OUT, img.name + ".png")
        img.file_format = "PNG"
        img.save()
        got = tuple(img.pixels[:3])
        assert all(abs(a - b) < 0.01 for a, b in zip(got, want)), (img.name, got)
    m = S.final_material("M_Iris_Hair", base, orm, nrm, alpha=True)
    cards.data.materials.clear()
    cards.data.materials.append(m)


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
        land = {"cheeks": [], "ears": [], "eyes": []}
        for s, sx in (("L", 1), ("R", -1)):
            e = rig.data.bones[f"eye_{s}"].head_local
            r = max(bpy.data.objects[f"eyeball_{s}"].dimensions) / 2
            land["cheeks"].append((e.x + sx * 0.012, e.y - 0.006, e.z - 0.042))
            land["ears"].append((sx * 0.075, e.y + 0.09, e.z - 0.02))
            land["eyes"].append((tuple(e), r, sx))
        land["mole"] = beauty_mark(bm)
        e = rig.data.bones["eye_L"].head_local
        land["nose"] = (0.0, e.y - 0.03, e.z - 0.035)
        sc = bpy.context.scene
        sc.render.engine = "CYCLES"
        try:
            if os.environ.get("IRIS_CPU"):              # bake on the CPU (a GPU whose driver fails Cycles bakes)
                raise RuntimeError("IRIS_CPU set")
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "OPTIX"
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
            sc.cycles.device = "GPU"
        except Exception as e:
            sc.cycles.device = "CPU"
            log("gpu", e)
        if not sc.world:
            sc.world = bpy.data.worlds.new("w")
        S.paint_garment_attrs(cloth)
        S.pack_atlas(cloth)
        S.bake_set([bm], "M_Iris_Skin", S.skin_shader, size, OUT, "skin", samples, land=land)
        S.bake_set(cloth, "M_Iris_Garment", S.garment_shader, size, OUT, "garment", samples)
        hair_textures(hair[0], size)
        cap = S.flat_material("M_Iris_HairCap", (0.140, 0.070, 0.036), 0.8)       # the hair hue (mid of the atlas)
        hair[1].data.materials.clear()
        hair[1].data.materials.append(cap)
        S.bake_set(eye_objs, "M_Iris_Eye", S.eye_shader, 512, OUT, "eye", samples, ao=False)
        lash = S.flat_material("M_Iris_Lashes", (0.012, 0.008, 0.006), 0.8)
        bm.data.materials.append(lash)
        la = bm.data.attributes.get("lash")
        if la:
            for p in bm.data.polygons:
                if all(la.data[i].value > 0.5 for i in p.vertices):
                    p.material_index = 1
    ank = rig.data.bones["shin_L"].tail_local                  # the clips' foot model on Iris's own ankle
    agent_anim.set_ankle(abs(ank.x), ank.z)
    log("ankle", round(abs(ank.x), 3), round(ank.z, 3))
    acts = agent_anim.bake_clips(rig, "iris", log=log)
    actions = {c: bpy.data.actions[c] for c in agent_anim.CLIPS}
    face = bake_face(rig, bm, actions)
    to_nla(rig, actions)
    to_nla(bm.data.shape_keys, face)
    col, socks = add_collision_and_sockets(rig)
    for o in [bm, *eye_objs, *cloth, *hair]:                       # glTF tangents need tris/quads
        bb = bmesh.new()
        bb.from_mesh(o.data)
        ng = [f for f in bb.faces if len(f.verts) > 4]
        if ng:
            bmesh.ops.triangulate(bb, faces=ng)
            bb.to_mesh(o.data)
        bb.free()
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

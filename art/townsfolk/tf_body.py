"""Townsfolk bodies: a MakeHuman (MPFB, CC0) body per cast entry on the shared agent rig (Blender 4.5).

Follows the Iris hero pipeline (art/agents/iris_hero/build_iris_hero.py, imported, not changed): macro and
detail targets -> re-posed into the agent rest stance -> scaled so the eye line sits at 1.64 m (the rig's
eye line; the real height is a scale on export) -> the agent armature placed on the body's own joints (same
bone names, rolls and parenting as every agent) -> MPFB weights summed onto the agent bones -> eyes and
the 23 face morphs.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
AGENTS = os.path.join(os.path.dirname(HERE), "agents")
os.environ.setdefault("IRIS_COSTUME", "wanderer")          # the hero module's non-athletic code paths
sys.path.insert(0, AGENTS)
sys.path.insert(0, os.path.join(AGENTS, "iris_hero"))
sys.path.insert(0, HERE)

import build_iris_hero as IH  # noqa: E402
from cast import CAST  # noqa: E402

V = Vector
OUT = os.environ.get("TF_OUT", os.path.join(HERE, "_raw"))
ARM_DEG = 14.0


def log(*a):
    print("[townsfolk]", *a, flush=True)


def make_human(c):
    bm = IH.HumanService.create_human(mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True,
                                      feet_on_ground=True, scale=0.1, macro_detail_dict=dict(c["macros"]))
    for name, w in c.get("detail", {}).items():
        p = IH.detail_path(name)
        if os.path.exists(p):
            IH.TargetService.load_target(bm, p, weight=w)
        else:
            log("missing detail target", name)
    IH.TargetService.bake_targets(bm)
    rig = IH.HumanService.add_builtin_rig(bm, "default")
    return bm, rig


def repose(bm, rig):
    """Arms down to the agent stance, legs straight under the hips; the result becomes the rest mesh.
    (As the hero's repose, with the foot track taken from the body's own hips instead of Iris's.)"""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    a = math.radians(ARM_DEG)
    for side, s in ((1, "L"), (-1, "R")):
        d = V((side * math.sin(a), 0.0, -math.cos(a)))
        IH.aim_pose_bone(rig, f"upperarm01.{s}", d)
        IH.aim_pose_bone(rig, f"upperarm02.{s}", d)
        fd = (d + V((0, -0.10, 0))).normalized()
        IH.aim_pose_bone(rig, f"lowerarm01.{s}", fd)
        IH.aim_pose_bone(rig, f"lowerarm02.{s}", fd)
        IH.aim_pose_bone(rig, f"wrist.{s}", fd)
        hip = IH.bone_world(rig, f"upperleg01.{s}")
        fx = side * max(0.06, abs(hip.x) * 0.92)
        want = V((fx, hip.y, 0.0)) - hip
        IH.aim_pose_bone(rig, f"upperleg01.{s}", want.normalized())
        IH.aim_pose_bone(rig, f"upperleg02.{s}", want.normalized())
        knee = IH.bone_world(rig, f"lowerleg01.{s}")
        down = V((fx, hip.y, 0.0)) - knee
        IH.aim_pose_bone(rig, f"lowerleg01.{s}", down.normalized())
        IH.aim_pose_bone(rig, f"lowerleg02.{s}", down.normalized())
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = bm
    for m in list(bm.modifiers):
        if m.type == "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=m.name)
    J = {pb.name: (IH.bone_world(rig, pb.name), IH.bone_world(rig, pb.name, True)) for pb in rig.pose.bones}
    feet = set()
    for gname in ("foot.L", "foot.R", "toe1-1.L", "toe1-1.R"):
        if gname in bm.vertex_groups:
            feet |= IH.group_verts(bm, gname, 0.3)
    dz = -min(bm.data.vertices[i].co.z for i in feet) if feet else 0.0
    if abs(dz) > 1e-4:
        for v in bm.data.vertices:
            v.co.z += dz
        J = {n: (h + V((0, 0, dz)), t + V((0, 0, dz))) for n, (h, t) in J.items()}
    return J


def build_body(key):
    """-> body mesh, rig, eye objects, facts (scale to the real height, landmarks)."""
    c = CAST[key]
    IH.reset()
    bm, mrig = make_human(c)
    J = repose(bm, mrig)
    eyes = IH.split_helpers(bm)
    h_real_mpfb = max(v.co.z for v in bm.data.vertices)
    k = IH.scale_to_eye_line([bm], eyes)
    J = {n: (h * k, t * k) for n, (h, t) in J.items()}
    eyes_k = {p: (cc * k, r * k) for p, (cc, r) in eyes.items()}
    mpfb_bones = {b.name for b in mrig.data.bones}
    bpy.data.objects.remove(mrig)
    bm.name = "body"
    keys = IH.load_face_keys(bm)
    layout = IH.hero_layout(J, eyes_k)
    IH.LAYOUT[:] = layout
    rig = IH.build_armature(layout)
    IH.remap_weights(bm, rig, mpfb_bones)
    IH.bind(bm, rig)
    eye_objs = IH.make_eyes(eyes, k)
    for o in eye_objs:
        IH.bind(o, rig)
    h_norm = max(v.co.z for v in bm.data.vertices)
    facts = {"key": key, "norm_height": round(h_norm, 4), "export_scale": round(c["height"] / h_norm, 4),
             "mpfb_height": round(h_real_mpfb, 4), "faces": len(bm.data.polygons), "morphs": len(keys),
             "bones": len(rig.data.bones)}
    bm["facts"] = json.dumps(facts)
    bm["joints"] = json.dumps({n: [list(h), list(t)] for n, (h, t) in J.items()})
    log("body", facts)
    return bm, rig, eye_objs, facts


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    key = argv[0]
    os.makedirs(os.path.join(OUT, key), exist_ok=True)
    build_body(key)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, key, "body.blend"))

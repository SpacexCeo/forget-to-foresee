"""Ambient animals of the hillside outside the town: two small rigged low-poly files with looping clips.

    blender -b -P art/town/build_fauna.py        # art/town/out/fauna_grazer.glb, fauna_bird.glb

    fauna_grazer   a small deer-like grazer, about 0.8 m at the shoulder; clips `idle_graze` (4 s) and `walk` (1 s)
    fauna_bird     a meadow bird, 0.7 m wingspan; clip `fly` (0.5 s flap loop)

Blender is Z up with the front toward -Y (the glTF comes out Y up, front +Z, feet / body centre at the origin).
Every part is skinned rigidly to one bone; colour is the vertex colour (no textures). Placement and behaviour
are the client's job.
"""

import math
import os

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
FPS = 24


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


class Parts:
    """Collects primitives into one bmesh; every vertex remembers its bone and colour."""

    def __init__(self):
        self.bm = bmesh.new()
        self.bone = {}
        self.col = {}

    def _take(self, verts, bone, col, shade=None):
        for v in verts:
            self.bone[v] = bone
            k = shade(v.co) if shade else 1.0
            self.col[v] = (col[0] * k, col[1] * k, col[2] * k)

    def blob(self, bone, center, size, col, sub=1, rot=None, shade=None):
        r = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1.0)
        m = Matrix.Translation(center) @ (rot.to_matrix().to_4x4() if rot else Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1.0))
        bmesh.ops.transform(self.bm, matrix=m, verts=r["verts"])
        self._take(r["verts"], bone, col, shade)

    def limb(self, bone, a, b, r0, r1, col, n=5, shade=None):
        """A tapered prism from a to b."""
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        x = d.cross(Vector((0, 1, 0)))
        if x.length < 1e-4:
            x = d.cross(Vector((1, 0, 0)))
        x.normalize()
        y = d.cross(x)
        ra = [self.bm.verts.new(a + (x * math.cos(math.tau * k / n) + y * math.sin(math.tau * k / n)) * r0) for k in range(n)]
        rb = [self.bm.verts.new(b + (x * math.cos(math.tau * k / n) + y * math.sin(math.tau * k / n)) * r1) for k in range(n)]
        for k in range(n):
            self.bm.faces.new([ra[k], ra[(k + 1) % n], rb[(k + 1) % n], rb[k]])
        self.bm.faces.new(rb)
        self.bm.faces.new(list(reversed(ra)))
        self._take(ra + rb, bone, col, shade)

    def fan(self, bone, pts, col, col_tip=None):
        """A flat double-faced polygon (wings, tail, ears): the last points take `col_tip`."""
        for order in (pts, list(reversed(pts))):
            vs = [self.bm.verts.new(p) for p in order]
            self.bm.faces.new(vs)
            for v in vs:
                self.bone[v] = bone
                self.col[v] = col
        if col_tip:
            far = max(pts, key=lambda p: abs(p[0]))
            for v in self.bm.verts:
                if self.bone.get(v) == bone and (v.co - Vector(far)).length < 1e-6:
                    self.col[v] = col_tip

    def finish(self, name, mat):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        bmesh.ops.triangulate(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(name)
        self.bm.verts.index_update()
        bone = {v.index: b for v, b in self.bone.items()}
        col = {v.index: c for v, c in self.col.items()}
        self.bm.to_mesh(me)
        self.bm.free()
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        for i, c in col.items():
            ca.data[i].color = (*c, 1.0)
        me.color_attributes.active_color = ca
        me.materials.append(mat)
        for p in me.polygons:
            p.use_smooth = False
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        for b in sorted(set(bone.values())):
            o.vertex_groups.new(name=b).add([i for i, bb in bone.items() if bb == b], 1.0, "REPLACE")
        return o


def material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    vc = m.node_tree.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    m.node_tree.links.new(vc.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    m.use_backface_culling = False
    return m


def armature(name, bones):
    """bones: [(name, head, tail, parent)] in Blender space."""
    arm = bpy.data.armatures.new(name + "_rig")
    o = bpy.data.objects.new(name + "_rig", arm)
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    for bn, head, tail, parent in bones:
        eb = arm.edit_bones.new(bn)
        eb.head, eb.tail = head, tail
        eb.roll = 0.0
        if parent:
            eb.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in o.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return o


def bind(mesh, rig):
    mesh.parent = rig
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = rig


def clip(rig, name, seconds, pose, step=2):
    """Bakes pose(t in 0..1) -> {bone: (world-axis rotation, world offset)} into an action and stashes it
    on an NLA track. Rotations are given about armature-space axes so the clips read like the model."""
    frames = round(seconds * FPS)
    rig.animation_data_create()
    act = bpy.data.actions.new(name)
    rig.animation_data.action = act
    for f in list(range(0, frames, step)) + [frames]:
        vals = pose((f % frames) / frames)
        for pb in rig.pose.bones:
            rot, off = vals.get(pb.name, ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0)))
            rest = pb.bone.matrix_local.to_3x3()
            q = (rest.inverted() @ Euler(rot, "XYZ").to_matrix() @ rest).to_quaternion()
            pb.rotation_quaternion = q
            pb.location = rest.inverted() @ Vector(off)
            pb.keyframe_insert("rotation_quaternion", frame=f)
            pb.keyframe_insert("location", frame=f)
    for fc in getattr(act, "fcurves", []):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)


def export(path, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
                              export_animations=True, export_animation_mode="NLA_TRACKS", export_skins=True,
                              export_vertex_color="ACTIVE", export_force_sampling=True, export_optimize_animation_size=True,
                              export_cameras=False, export_lights=False)
    return os.path.getsize(path)


S = math.sin
TAU = math.tau


# ---------------------------------------------------------------- the grazer

def grazer():
    reset()
    FUR, BELLY, DARK, PALE = (0.62, 0.42, 0.24), (0.86, 0.74, 0.56), (0.20, 0.14, 0.10), (0.93, 0.88, 0.78)
    p = Parts()
    hip_z, sh_z = 0.70, 0.74                       # body height at the hips and the shoulders
    belly = lambda co: 0.82 + 0.3 * max(0.0, min(1.0, (co.z - 0.55) / 0.3))   # noqa: E731
    p.blob("body", (0, 0.02, 0.72), (0.19, 0.44, 0.2), FUR, sub=2, shade=belly)
    p.blob("body", (0, 0.36, 0.74), (0.17, 0.17, 0.19), FUR, sub=1, shade=belly)          # haunches
    p.blob("body", (0, -0.30, 0.76), (0.165, 0.17, 0.2), FUR, sub=1, shade=belly)         # chest
    p.blob("body", (0, 0.05, 0.60), (0.14, 0.34, 0.1), BELLY, sub=1)
    p.limb("neck", (0, -0.36, 0.84), (0, -0.56, 1.12), 0.095, 0.065, FUR, 6)
    p.blob("head", (0, -0.63, 1.16), (0.075, 0.13, 0.085), FUR, sub=1)
    p.limb("head", (0, -0.70, 1.15), (0, -0.83, 1.10), 0.055, 0.035, tuple(c * 0.9 for c in FUR), 5)   # muzzle
    p.blob("head", (0, -0.84, 1.10), (0.03, 0.025, 0.025), DARK, sub=1)                    # nose
    for sx in (-1, 1):
        p.blob("head", (sx * 0.066, -0.66, 1.19), (0.014, 0.02, 0.02), DARK, sub=1)        # eye
        p.fan("head", [(sx * 0.05, -0.56, 1.22), (sx * 0.17, -0.53, 1.30), (sx * 0.08, -0.52, 1.27)], FUR, PALE)   # ear
        p.limb("head", (sx * 0.035, -0.60, 1.23), (sx * 0.06, -0.57, 1.36), 0.014, 0.006, PALE, 4)   # antler nub
    p.fan("tail", [(-0.04, 0.50, 0.80), (0.04, 0.50, 0.80), (0.0, 0.60, 0.70)], PALE)
    legs = {"fl": (-0.10, -0.30, sh_z - 0.12), "fr": (0.10, -0.30, sh_z - 0.12), "bl": (-0.10, 0.36, hip_z - 0.08), "br": (0.10, 0.36, hip_z - 0.08)}
    bones = [("root", (0, 0, 0), (0, 0, 0.2), None), ("body", (0, 0.1, 0.72), (0, -0.3, 0.76), "root"),
             ("neck", (0, -0.36, 0.84), (0, -0.56, 1.12), "body"), ("head", (0, -0.56, 1.12), (0, -0.80, 1.12), "neck"),
             ("tail", (0, 0.50, 0.80), (0, 0.60, 0.70), "body")]
    for key, (x, y, z) in legs.items():
        knee = (x, y + (0.03 if key[0] == "b" else -0.01), z * 0.52)
        foot = (x, y, 0.0)
        p.limb(f"leg_{key}_up", (x, y, z), knee, 0.055, 0.032, FUR, 5)
        p.limb(f"leg_{key}_lo", knee, (foot[0], foot[1], 0.05), 0.03, 0.022, tuple(c * 0.85 for c in FUR), 5)
        p.limb(f"leg_{key}_lo", (foot[0], foot[1], 0.05), foot, 0.028, 0.03, DARK, 5)      # hoof
        bones += [(f"leg_{key}_up", (x, y, z), knee, "body"), (f"leg_{key}_lo", knee, foot, f"leg_{key}_up")]
    mesh = p.finish("fauna_grazer", material("M_Fauna_Grazer"))
    rig = armature("fauna_grazer", bones)
    bind(mesh, rig)

    def graze(t):
        # head down in the grass for most of the loop, one look up, tail flicks, weight shifting
        up = math.exp(-((t - 0.72) / 0.09) ** 2)                 # the look-up
        down = 1.0 - up
        chew = S(TAU * t * 10) * 0.035 * down
        out = {"neck": ((1.3 * down + 0.05 * S(TAU * t), 0, 0.10 * S(TAU * t * 2) * down + 0.5 * up * S(TAU * t * 3)), (0, 0, 0)),
               "head": ((0.5 * down + chew - 0.25 * up, 0, 0), (0, 0, 0)),
               "body": ((0.05 * down, 0, 0.012 * S(TAU * t)), (0, 0, -0.012 * down)),
               "tail": ((0.5 * max(0.0, S(TAU * t * 4)) ** 6, 0, 0.5 * S(TAU * t * 8) * (1 if 0.2 < t < 0.45 else 0.15)), (0, 0, 0))}
        step = math.exp(-((t - 0.34) / 0.07) ** 2)               # a front hoof lifts and sets down once
        out["leg_fl_up"] = ((-0.35 * step, 0, 0), (0, 0, 0))
        out["leg_fl_lo"] = ((0.7 * step, 0, 0), (0, 0, 0))
        return out

    def walk(t):
        out = {"body": ((0.02 * S(TAU * t * 2), 0, 0.03 * S(TAU * t)), (0, 0, 0.012 * S(TAU * t * 2 + 0.6))),
               "neck": ((0.10 + 0.06 * S(TAU * t * 2 + 1.2), 0, 0), (0, 0, 0)),
               "head": ((-0.08 - 0.05 * S(TAU * t * 2 + 1.2), 0, 0), (0, 0, 0)),
               "tail": ((0, 0, 0.25 * S(TAU * t * 2)), (0, 0, 0))}
        # lateral-sequence walk: back left, front left, back right, front right
        for key, ph in (("bl", 0.0), ("fl", 0.25), ("br", 0.5), ("fr", 0.75)):
            a = TAU * (t + ph)
            swing = 0.42 * S(a)
            lift = max(0.0, -math.cos(a))                        # the knee folds while the leg comes forward
            out[f"leg_{key}_up"] = ((swing - 0.25 * lift, 0, 0), (0, 0, 0))
            out[f"leg_{key}_lo"] = ((0.75 * lift if key[0] == "f" else -0.1 + 0.8 * lift, 0, 0), (0, 0, 0))
        return out

    clip(rig, "idle_graze", 4.0, graze)
    clip(rig, "walk", 1.0, walk, step=1)
    return export(os.path.join(OUT, "fauna_grazer.glb"), [rig, mesh]), len(mesh.data.polygons)


# ---------------------------------------------------------------- the bird

def bird():
    reset()
    BACK, BREAST, WING, TIP, BEAK = (0.36, 0.30, 0.26), (0.92, 0.78, 0.56), (0.42, 0.34, 0.28), (0.16, 0.13, 0.12), (0.90, 0.62, 0.18)
    p = Parts()
    breast = lambda co: 1.0 if co.z > -0.005 else 2.2                    # noqa: E731
    p.blob("body", (0, 0, 0), (0.055, 0.14, 0.05), BACK, sub=1, shade=breast)
    p.blob("body", (0, -0.14, 0.02), (0.038, 0.045, 0.036), BACK, sub=1)
    p.limb("body", (0, -0.17, 0.018), (0, -0.225, 0.008), 0.012, 0.002, BEAK, 4)
    for sx in (-1, 1):
        p.blob("body", (sx * 0.03, -0.155, 0.03), (0.007, 0.009, 0.009), TIP, sub=1)
        p.fan(f"wing_{'l' if sx < 0 else 'r'}_in", [(sx * 0.04, -0.07, 0.02), (sx * 0.19, -0.09, 0.02), (sx * 0.19, 0.05, 0.02), (sx * 0.04, 0.08, 0.02)], WING)
        p.fan(f"wing_{'l' if sx < 0 else 'r'}_out", [(sx * 0.19, -0.09, 0.02), (sx * 0.35, -0.045, 0.02), (sx * 0.31, 0.04, 0.02), (sx * 0.19, 0.05, 0.02)], WING, TIP)
    p.fan("tail", [(-0.03, 0.11, 0.0), (0.03, 0.11, 0.0), (0.055, 0.25, 0.0), (-0.055, 0.25, 0.0)], WING)
    bones = [("root", (0, 0, 0), (0, 0, 0.1), None), ("body", (0, 0.1, 0), (0, -0.1, 0), "root"), ("tail", (0, 0.11, 0), (0, 0.25, 0), "body")]
    for sx, s in ((-1, "l"), (1, "r")):
        bones += [(f"wing_{s}_in", (sx * 0.04, 0, 0.02), (sx * 0.19, 0, 0.02), "body"), (f"wing_{s}_out", (sx * 0.19, 0, 0.02), (sx * 0.35, 0, 0.02), f"wing_{s}_in")]
    mesh = p.finish("fauna_bird", material("M_Fauna_Bird"))
    rig = armature("fauna_bird", bones)
    bind(mesh, rig)

    def fly(t):
        a = TAU * t
        flap = 0.15 + 0.95 * S(a)                     # up (+) and down (-) around a slightly raised rest
        tip = 0.55 * S(a - 1.0)                       # the hand lags the arm
        out = {"body": ((0.05 * S(a + 2.0), 0, 0), (0, 0, -0.02 * S(a))), "tail": ((0.18 * S(a + 2.4), 0, 0), (0, 0, 0))}
        for sx, s in ((-1, "l"), (1, "r")):
            out[f"wing_{s}_in"] = ((0, -sx * flap, 0), (0, 0, 0))     # rotation about the body's long axis (Y)
            out[f"wing_{s}_out"] = ((0, -sx * tip, 0), (0, 0, 0))
        return out

    clip(rig, "fly", 0.5, fly, step=1)
    return export(os.path.join(OUT, "fauna_bird.glb"), [rig, mesh]), len(mesh.data.polygons)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("fauna_grazer", grazer())
    print("fauna_bird", bird())

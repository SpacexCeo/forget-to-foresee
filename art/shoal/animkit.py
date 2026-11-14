"""Clips in code (TZ steps 13-14), shared by the creatures of the Glass Shoal.
A pose is a dict bone -> rotation about the ARMATURE axes of the rest pose (X left, -Y forward, Z up), so bone rolls
never matter and a rotation reads the same for every bone; `Baker` turns pose functions of time into actions (one
key per frame, 30 fps, first frame 1), one NLA track per clip, and measures every clip."""
import bpy, math
import numpy as np
from mathutils import Quaternion, Vector
from lib import *


def q(x=0, y=0, z=0):
    return Quaternion((0, 0, 1), math.radians(z)) @ Quaternion((0, 1, 0), math.radians(y)) @ Quaternion((1, 0, 0), math.radians(x))


def mirror(Q): return Quaternion((Q.w, Q.x, -Q.y, -Q.z))


class Pose(dict):
    """bone -> rotation. `loc` moves the root bone (armature axes, metres)."""
    loc = (0, 0, 0)

    def add(self, name, Q): self[name] = Q @ self.get(name, Quaternion()); return self


def blend(a, b, k):
    out = Pose()
    for n in set(a) | set(b): out[n] = a.get(n, Quaternion()).slerp(b.get(n, Quaternion()), k)
    out.loc = tuple(x + (y - x) * k for x, y in zip(a.loc, b.loc)); return out


class Baker:
    def __init__(self, rig, mesh, fps=30, skip=('saddle',)):
        self.rig, self.mesh, self.fps = rig, mesh, fps
        bpy.context.scene.render.fps = fps
        self.rest = {pb.name: pb.bone.matrix_local.to_3x3().to_quaternion() for pb in rig.pose.bones}
        self.bones = [pb.name for pb in rig.pose.bones if pb.name not in skip]
        for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'
        rig.animation_data_create()
        self.co0 = coords(mesh); ed = np.empty(len(mesh.data.edges) * 2, np.int32); mesh.data.edges.foreach_get('vertices', ed); self.ed = ed.reshape(-1, 2)
        self.rest_len = np.linalg.norm(self.co0[self.ed[:, 0]] - self.co0[self.ed[:, 1]], axis=1); self.long = self.rest_len > 0.01
        self.checks = {}

    def apply(self, p):
        for n in self.bones:
            pb = self.rig.pose.bones[n]; Q = p.get(n)
            pb.rotation_quaternion = (self.rest[n].inverted() @ Q @ self.rest[n]) if Q is not None else Quaternion()
        root = self.rig.pose.bones['root']; root.location = root.bone.matrix_local.to_3x3().inverted() @ Vector(p.loc)

    def deformed(self):
        bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); ev = self.mesh.evaluated_get(dg); me = ev.to_mesh()
        a = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', a); ev.to_mesh_clear(); return a.reshape(-1, 3).astype(np.float64)

    def bone_tip(self, p, bone):
        """Armature-space tail of a bone in pose p (for fitting a pose to a target, e.g. the head on the ground)."""
        self.apply(p); bpy.context.view_layer.update(); return np.array(self.rig.pose.bones[bone].tail)

    def bake(self, name, fn, seconds, loop, ends_like=None):
        rig = self.rig; n = int(round(seconds * self.fps)); act = bpy.data.actions.new(name); rig.animation_data.action = act
        last = {}; lows = []; worst = 0.0; first = None; end = None
        for f in range(n + 1):
            t = (f / n) % 1.0 if loop else f / n
            self.apply(fn(t))
            for bn in self.bones:
                pb = rig.pose.bones[bn]; Q = pb.rotation_quaternion.copy()
                if bn in last and last[bn].dot(Q) < 0: Q.negate(); pb.rotation_quaternion = Q
                last[bn] = Q; pb.keyframe_insert('rotation_quaternion', frame=f + 1)
            rig.pose.bones['root'].keyframe_insert('location', frame=f + 1)
            if f % 3 == 0 or f == n:
                d = self.deformed(); lows.append(float(d[:, 2].min()))
                ratio = np.linalg.norm(d[self.ed[:, 0]] - d[self.ed[:, 1]], axis=1)[self.long] / self.rest_len[self.long]; worst = max(worst, float(np.quantile(ratio, 0.999)))
                if f == 0: first = d
                if f == n: end = d
        c = dict(frames=n, seconds=seconds, loop=loop, lowest_z=round(min(lows), 3), end_lowest_z=round(lows[-1], 3), stretch_p999=round(worst, 2))
        if loop: c['loop_closure_m'] = round(float(np.abs(end - first).max()), 5)
        if ends_like is not None:
            self.apply(ends_like); c['end_gap_m'] = round(float(np.abs(end - self.deformed()).max()), 5)
        self.checks[name] = c
        tr = rig.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, act); st.name = name
        rig.animation_data.action = None; return c

    def sheet(self, prefix, clips, box, frames=6, views=('q34', 'side'), res=520, pad=0.62):
        """Workbench frame sheets: clips = [(name, fn, loop)]. Returns the files, clip by clip."""
        self.rig.animation_data.use_nla = False; workbench(res, True); files = []
        for name, fn, loop in clips:
            for k in range(frames):
                self.apply(fn(k / frames if loop else k / (frames - 1))); bpy.context.view_layer.update()
                files += ortho_views(f'{prefix}_{name}_{k}', [self.mesh], views=(views[k % len(views)],), res=res, box=box, pad=pad)
        self.apply(Pose()); self.rig.animation_data.use_nla = True; return files


def mirror_pose(p):
    """The same pose seen in a mirror (left <-> right): for clips that must be exact mirrors of each other."""
    out = Pose()
    for n, Q in p.items():
        m = n[:-2] + ('.R' if n.endswith('.L') else '.L') if n[-2:] in ('.L', '.R') else n
        out[m] = mirror(Q)
    out.loc = (-p.loc[0], p.loc[1], p.loc[2]); return out


def align(a, b):
    """The smallest rotation (3x3) that turns direction a into direction b."""
    a = np.asarray(a, float); b = np.asarray(b, float); a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = float(a @ b)
    if c < -0.999999:
        ax = np.cross(a, [1.0, 0, 0]); ax = ax if np.linalg.norm(ax) > 1e-3 else np.cross(a, [0, 1.0, 0]); ax /= np.linalg.norm(ax)
        return 2 * np.outer(ax, ax) - np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K / (1 + c)


def quat(R): return Matrix(np.asarray(R).tolist()).to_quaternion()


class Skel:
    """Forward kinematics of the rest skeleton in plain numpy, in the pose convention of this file: every bone turns
    about its own head by a rotation written in armature axes. fk(p)[bone] = (R, t): a rest point x that rides on the
    bone goes to R @ x + t. Used for IK that is baked into plain rotation keys (nothing to solve in the game)."""
    def __init__(self, rig):
        bones = list(rig.data.bones)
        self.head = {b.name: np.array(b.head_local) for b in bones}; self.tail = {b.name: np.array(b.tail_local) for b in bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.order = []
        def walk(b):
            self.order.append(b.name)
            for c in b.children: walk(c)
        for b in bones:
            if b.parent is None: walk(b)

    def fk(self, p, upto=None):
        out = {}; I = np.eye(3)
        for n in self.order:
            par = self.parent[n]; Rp, tp = out[par] if par else (I, np.zeros(3))
            Q = p.get(n); Rq = np.array(Q.to_matrix()) if Q is not None else I; h = self.head[n]
            t = Rp @ (h - Rq @ h) + tp
            if par is None: t = t + np.array(p.loc, float)
            out[n] = (Rp @ Rq, t)
            if n == upto: break
        return out

    def at(self, F, bone, point=None):
        """Where the bone's head (or a rest point riding on it) is in the pose F = fk(p)."""
        R, t = F[bone]; return R @ (self.head[bone] if point is None else np.asarray(point, float)) + t

    def aim(self, p, bone, direction, vec=None):
        """Point the bone (its rest vector `vec`, default head -> tail) along a world direction with the smallest turn
        from the rest orientation (no twist); the parents' pose is taken from p."""
        vec = (self.tail[bone] - self.head[bone]) if vec is None else np.asarray(vec, float)
        par = self.parent[bone]; Rp = self.fk(p, par)[par][0] if par else np.eye(3)
        p[bone] = quat(Rp.T @ align(vec, direction)); return p

    def plant(self, p, upper, lower, end, target, R_end=None, k=1.0, pole=None):
        """Two-bone IK: the head of `end` (ankle, wrist) goes to `target`; `end` takes the world rotation R_end
        (default: its rest orientation, a flat foot). If the target is out of reach the leg points straight at it.
        k < 1 blends from the rotations already in p. Returns True when the target is reached."""
        par = self.parent[upper]; Rp, tp = self.fk(p, par)[par]
        h = Rp @ self.head[upper] + tp; a = self.head[lower] - self.head[upper]; b = self.head[end] - self.head[lower]
        la, lb = np.linalg.norm(a), np.linalg.norm(b); d = np.asarray(target, float) - h; dist = float(np.linalg.norm(d)); dirn = d / dist
        reach = dist <= (la + lb) * 0.9995; dc = min(max(dist, abs(la - lb) * 1.001), (la + lb) * 0.9995)
        if pole is None: ab = a + b; pole = Rp @ (a - ab * (a @ ab) / (ab @ ab))
        pole = np.asarray(pole, float); pole = pole - dirn * (pole @ dirn); pole /= np.linalg.norm(pole)
        ca = (la * la + dc * dc - lb * lb) / (2 * la * dc); sa = math.sqrt(max(0.0, 1 - ca * ca))
        knee = h + la * (ca * dirn + sa * pole); tip = h + dc * dirn
        R1 = align(Rp @ a, knee - h) @ Rp; R2 = align(R1 @ b, tip - knee) @ R1
        new = {upper: quat(Rp.T @ R1), lower: quat(R1.T @ R2), end: quat(R2.T @ (np.eye(3) if R_end is None else R_end))}
        for n, Q in new.items(): p[n] = Q if k >= 1 else p.get(n, Quaternion()).slerp(Q, k)
        return reach

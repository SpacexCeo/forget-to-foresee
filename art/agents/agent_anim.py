"""Procedural keyframe animation for the clan agents (Blender 4.5).

Every clip is a pure function of the clip phase u (0..1) that returns a Pose: hip
offset/rotation, armature-axis rotations for FK bones, chest-relative wrist targets
for arm IK, and ground-space ankle targets for the legs (feet planted exactly; the
walk's planted foot slides back at the contract speed). A small solver turns a
Pose into bone-local quaternions, cloth chains and hanging props are then
spring-simulated over the whole clip (with warm-up cycles so loops close) and
everything is baked to one key per frame at 30 fps.

Root-motion-free: the `root` bone never moves; gameplay moves the model.
Axes (Blender rest space): X = agent's left, -Y = forward, Z = up. Rotation
helpers take degrees about armature axes: +X pitches a down-pointing limb
backwards and an up-pointing one forwards; +Z turns the face to the agent's left.
"""

import math
from collections import defaultdict

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

from agent_rig import CHAINS_REST

FPS = 30
WALK_SPEED = 1.7            # m/s (game: AGENT_SPEED)
WALK_FRAMES = 24            # cycle 0.8 s -> stride 1.36 m
RUN_SPEED = 3.8
RUN_FRAMES = 20             # cycle 0.667 s -> stride 2.533 m

# name: (frames, loop, air speed m/s)
CLIPS = {
    "idle": (120, True, 0.0),
    "walk": (WALK_FRAMES, True, WALK_SPEED),
    "run": (RUN_FRAMES, True, RUN_SPEED),
    "talk": (90, True, 0.0),
    "think": (120, True, 0.0),
    "gesture_offer": (60, False, 0.0),
    "celebrate": (60, True, 0.0),
    "defeat": (75, False, 0.0),
}

TAU = 2 * math.pi
R = math.radians


def sm(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, t):
    return a + (b - a) * t


def wave(u, k=1, ph=0.0):
    return math.sin(TAU * (k * u + ph))


def keys(u, table, loop=False):
    """Smoothstep interpolation through (u, value) pairs (floats or Vectors)."""
    if u <= table[0][0]:
        return table[0][1]
    for (u0, v0), (u1, v1) in zip(table, table[1:]):
        if u <= u1:
            t = sm((u - u0) / max(u1 - u0, 1e-6))
            return v0 * (1 - t) + v1 * t if not isinstance(v0, Vector) else v0.lerp(v1, t)
    return table[-1][1]


def env(u, a, b, c, d):
    """0 before a, rises to 1 at b, holds, falls to 0 from c to d."""
    if u < a or u > d:
        return 0.0
    if u < b:
        return sm((u - a) / max(b - a, 1e-6))
    if u <= c:
        return 1.0
    return 1.0 - sm((u - c) / max(d - c, 1e-6))


V = Vector

# ===================================================================== pose


class Pose:
    def __init__(self):
        self.hips = V((0, 0, 0))
        self.hips_rot = V((0, 0, 0))
        self.rot = defaultdict(lambda: V((0, 0, 0)))
        self.twist = defaultdict(float)
        self.ik = {}                 # side -> (wrist target, pole) in chest rest space
        self.feet = {}               # side -> dict(ankle=V, pitch=deg, toe=deg)
        self.prop = {}               # side -> dict(mode, ground)
        self.knee_out = 0.0

    def r(self, bone, x=0.0, y=0.0, z=0.0):
        self.rot[bone] = self.rot[bone] + V((x, y, z))
        return self


def eq(v):
    return Euler((R(v[0]), R(v[1]), R(v[2])), "XYZ").to_quaternion()


# foot geometry relative to the ankle (rest): heel and ball contact points
HEEL = V((0, 0.040, -0.085))
BALL = V((0, -0.092, -0.085))
ANKLE_Z = 0.085


def ankle_rest(side):
    return V((0.114 * side, 0.0, ANKLE_Z))


def planted(x, gy, pitch):
    """Ankle position for a foot whose flat-foot ankle projection is at (x, gy) on the
    ground, rolled by pitch (deg, + toe up about the heel, - heel up about the ball)."""
    q = Quaternion((1, 0, 0), -R(pitch))
    A = V((x, gy, ANKLE_Z))
    piv = A + (HEEL if pitch > 0 else BALL)
    return piv + q @ (A - piv)


def stand_feet(P, width=0.0, fwd_l=0.0, fwd_r=0.0):
    for side, f in ((1, fwd_l), (-1, fwd_r)):
        a = ankle_rest(side) + V((width * side, -f, 0))
        P.feet[side] = {"ankle": a, "pitch": 0.0, "toe": 0.0}


def hermite(p0, p1, m0, m1, s):
    s2, s3 = s * s, s * s * s
    return ((2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1
            + (s3 - s2) * m1)


def gait_foot(ph, side, speed, T, stance, lift, strike_pitch, off_pitch, width, tang=0.6,
              fwd_bias=0.0):
    """One foot of a locomotion cycle. ph: foot phase (0 = heel strike).
    Returns dict(ankle, pitch, toe). The flat-foot reference moves back at exactly
    `speed` while planted (no foot sliding against the ground)."""
    stride = speed * T
    a = stride * stance / 2 + fwd_bias          # forward coordinate at strike
    x = (0.114 + width) * side
    roll_in = 0.14 * stance                      # heel rocker
    rise = 0.62 * stance                         # heel rise starts
    if ph < stance:
        gf = a - speed * T * ph
        if ph < roll_in:
            pitch = strike_pitch * (1 - sm(ph / roll_in))
        elif ph > rise:
            pitch = off_pitch * sm((ph - rise) / (stance - rise)) ** 1.3
        else:
            pitch = 0.0
        ank = planted(x, -gf, pitch)
        return {"ankle": ank, "pitch": pitch, "toe": max(0.0, -pitch)}
    s = (ph - stance) / (1 - stance)
    g0 = a - speed * T * stance
    A0 = planted(x, -g0, off_pitch)
    A1 = planted(x, -a, strike_pitch)
    D = (1 - stance) * T
    m = -speed * D * tang
    f = hermite(-A0.y, -A1.y, m, m, s)
    z = lerp(A0.z, A1.z, sm(s)) + lift * math.sin(math.pi * min(1.0, s ** 0.8))
    pitch = keys(s, [(0.0, off_pitch), (0.35, off_pitch * 0.25), (0.75, strike_pitch * 0.6),
                     (1.0, strike_pitch)])
    toe = keys(s, [(0.0, -off_pitch * 0.6), (0.3, 8.0), (1.0, 0.0)])
    return {"ankle": V((x, -f, z)), "pitch": pitch, "toe": toe}


# ===================================================================== solver


class Solver:
    def __init__(self, arm_obj):
        self.arm = arm_obj
        bones = arm_obj.data.bones
        self.order = [b.name for b in bones]
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.rest_q = {k: m.to_quaternion() for k, m in self.rest.items()}
        self.len = {b.name: b.length for b in bones}
        self.chain_names = {f"{c}_{i}" for c, pts, _ in CHAINS_REST for i in range(len(pts) - 1)}
        self.Lleg = self.len["thigh_L"] + self.len["shin_L"]

    # carried rest: bone with identity basis under its posed parent
    def carried(self, pose, b):
        p = self.parent[b]
        if p is None:
            return self.rest[b].copy()
        return pose[p] @ self.rest[p].inverted() @ self.rest[b]

    def set_basis(self, pose, basis, b, q, loc=None):
        C = self.carried(pose, b)
        M = Matrix.Translation(loc if loc is not None else V()) @ q.to_matrix().to_4x4()
        basis[b] = (loc if loc is not None else V(), q)
        pose[b] = C @ M
        return pose[b]

    def rot_arm(self, pose, basis, b, e, twist=0.0, loc_arm=None):
        rq = self.rest_q[b]
        q = rq.inverted() @ eq(e) @ rq
        if twist:
            q = q @ Quaternion((0, 1, 0), R(twist))
        loc = None
        if loc_arm is not None:
            C = self.carried(pose, b)
            loc = C.to_quaternion().inverted() @ loc_arm
        return self.set_basis(pose, basis, b, q, loc)

    def aim(self, pose, basis, b, target, twist=0.0):
        C = self.carried(pose, b)
        cq = C.to_quaternion()
        d0 = cq @ V((0, 1, 0))
        d1 = (target - C.translation).normalized()
        sw = d0.rotation_difference(d1)
        q = cq.inverted() @ sw @ cq
        if twist:
            q = q @ Quaternion((0, 1, 0), R(twist))
        return self.set_basis(pose, basis, b, q)

    def orient(self, pose, basis, b, q_des, loc_world=None):
        C = self.carried(pose, b)
        if loc_world is None:
            q = C.to_quaternion().inverted() @ q_des
            return self.set_basis(pose, basis, b, q)
        Mdes = Matrix.Translation(loc_world) @ q_des.to_matrix().to_4x4()
        Mb = C.inverted() @ Mdes
        return self.set_basis(pose, basis, b, Mb.to_quaternion(), Mb.translation)

    @staticmethod
    def two_bone(root, target, a, b, pole):
        d = target - root
        dist = max(abs(a - b) + 1e-4, min(a + b - 1e-4, d.length))
        dn = d.normalized()
        T = root + dn * dist
        ca = (a * a + dist * dist - b * b) / (2 * a * dist)
        ca = max(-1.0, min(1.0, ca))
        n = pole - dn * pole.dot(dn)
        if n.length < 1e-6:
            n = V((0, -1, 0))
        n.normalize()
        E = root + dn * (a * ca) + n * (a * math.sqrt(max(0.0, 1 - ca * ca)))
        return E, T

    def solve(self, P, prop_override=None):
        pose, basis = {}, {}
        pose["root"] = self.rest["root"].copy()
        basis["root"] = (V(), Quaternion())
        # pelvis + reach clamp so planted feet stay planted
        hips = P.hips.copy()
        clamp = 0.0
        for _ in range(2):
            self.rot_arm(pose, basis, "pelvis", P.hips_rot, loc_arm=hips)
            dz = 0.0
            for side, sfx in ((1, "L"), (-1, "R")):
                H = self.carried(pose, f"thigh_{sfx}").translation
                A = P.feet[side]["ankle"]
                Lmax = self.Lleg * 0.997
                h2 = (A.x - H.x) ** 2 + (A.y - H.y) ** 2
                need = H.z - A.z - math.sqrt(max(0.0, Lmax * Lmax - h2))
                dz = max(dz, need)
            if dz <= 1e-5:
                break
            hips.z -= dz
            clamp += dz
        # legs
        for side, sfx in ((1, "L"), (-1, "R")):
            F = P.feet[side]
            H = self.carried(pose, f"thigh_{sfx}").translation
            pole = V((side * (0.12 + P.knee_out), -1.0, 0.0))
            E, T = self.two_bone(H, F["ankle"], self.len[f"thigh_{sfx}"], self.len[f"shin_{sfx}"],
                                 pole)
            self.aim(pose, basis, f"thigh_{sfx}", E)
            self.aim(pose, basis, f"shin_{sfx}", T)
            qf = Quaternion((1, 0, 0), -R(F["pitch"])) @ self.rest_q[f"foot_{sfx}"]
            self.orient(pose, basis, f"foot_{sfx}", qf)
            self.rot_arm(pose, basis, f"toe_{sfx}", (-F.get("toe", 0.0), 0, 0))
        # spine, head
        for b in ("spine", "chest", "neck", "head"):
            self.rot_arm(pose, basis, b, P.rot[b])
        Mc = pose["chest"] @ self.rest["chest"].inverted()
        # arms
        for side, sfx in ((1, "L"), (-1, "R")):
            self.rot_arm(pose, basis, f"shoulder_{sfx}", P.rot[f"shoulder_{sfx}"])
            if side in P.ik:
                tgt, pole = P.ik[side]
                tw = Mc @ tgt
                pw = Mc.to_quaternion() @ pole
                S = self.carried(pose, f"upperarm_{sfx}").translation
                E, T = self.two_bone(S, tw, self.len[f"upperarm_{sfx}"],
                                     self.len[f"forearm_{sfx}"], pw)
                self.aim(pose, basis, f"upperarm_{sfx}", E, P.twist[f"upperarm_{sfx}"])
                self.aim(pose, basis, f"forearm_{sfx}", T, P.twist[f"forearm_{sfx}"])
            else:
                self.rot_arm(pose, basis, f"upperarm_{sfx}", P.rot[f"upperarm_{sfx}"],
                             P.twist[f"upperarm_{sfx}"])
                self.rot_arm(pose, basis, f"forearm_{sfx}", P.rot[f"forearm_{sfx}"],
                             P.twist[f"forearm_{sfx}"])
            self.rot_arm(pose, basis, f"hand_{sfx}", P.rot[f"hand_{sfx}"], P.twist[f"hand_{sfx}"])
            pr = P.prop.get(side)
            name = f"prop_{sfx}"
            if prop_override and name in prop_override:
                q_des = prop_override[name]
                self.prop_place(pose, basis, name, q_des, pr)
            elif pr and pr["mode"] in ("upright", "hang"):
                self.prop_place(pose, basis, name, self.rest_q[name], pr)
            else:
                self.set_basis(pose, basis, name, Quaternion())
        # chains: rigid follow (the spring pass overrides them)
        for b in self.order:
            if b in self.chain_names:
                self.set_basis(pose, basis, b, Quaternion())
        return pose, basis, clamp

    def prop_place(self, pose, basis, name, q_des, pr):
        C = self.carried(pose, name)
        loc = C.translation.copy()
        if pr and pr.get("ground"):
            bottom = loc.z - self.rest[name].translation.z     # staff foot (rest z = 0)
            if pr["ground"] == "plant":
                loc.z -= bottom
            elif bottom < 0.015:
                loc.z += 0.015 - bottom
        self.orient(pose, basis, name, q_des, loc)


# ===================================================================== styles

STYLE = {
    # lean: forward lean deg; hunch: shoulder raise; protract: shoulders forward;
    # chin: + looks down; tilt: head roll; width: extra stance per foot (m);
    # knee: hip drop when standing (m); swing: walk arm swing scale; sway: pelvis
    # roll/yaw scale; bounce: vertical bob scale; tempo: speed of idle cycles (int)
    "iris": dict(lean=4, hunch=0, protract=-3, chin=-1, tilt=0, width=0.03, knee=0.012,
                 swing=1.1, sway=0.9, bounce=1.0, tempo=1, cloth=1.0),
    "sol": dict(lean=1, hunch=2, protract=2, chin=2, tilt=6, width=0.015, knee=0.01,
                swing=0.6, sway=1.6, bounce=0.6, tempo=1, cloth=0.8),
    "pepel": dict(lean=11, hunch=8, protract=7, chin=-7, tilt=0, width=0.05, knee=0.04,
                  swing=0.7, sway=0.7, bounce=1.2, tempo=2, cloth=1.0),
    "moh": dict(lean=-1, hunch=-2, protract=0, chin=3, tilt=3, width=0.04, knee=0.015,
                swing=0.65, sway=1.1, bounce=0.7, tempo=1, cloth=1.2),
    "yantar": dict(lean=5, hunch=5, protract=8, chin=0, tilt=0, width=0.02, knee=0.02,
                   swing=0.6, sway=1.0, bounce=1.4, tempo=3, cloth=0.9),
    "iney": dict(lean=-2, hunch=0, protract=-2, chin=-6, tilt=0, width=0.01, knee=0.005,
                 swing=0.5, sway=0.6, bounce=0.7, tempo=1, cloth=1.0),
    "suit": dict(lean=3, hunch=0, protract=0, chin=0, tilt=0, width=0.035, knee=0.015,
                 swing=1.0, sway=0.8, bounce=1.0, tempo=1, cloth=1.0),
}

# left-hand prop handling: mode (hang = pendulum under gravity, upright = held
# vertical), ground behaviour of the prop foot in standing clips
PROP_L = {"sol": "hang", "moh": "hang", "yantar": "hang", "iney": "upright"}

POLE_R = V((-1.0, 0.4, -0.7))
POLE_L = V((1.0, 0.4, -0.7))
REST_WRIST_R = V((-0.293, 0.0, 0.891))
REST_WRIST_L = V((0.293, 0.0, 0.891))


def base_pose(key, S, standing=True):
    """Clan attitude shared by every clip."""
    P = Pose()
    P.r("spine", S["lean"] * 0.4)
    P.r("chest", S["lean"] * 0.6)
    P.r("neck", S["lean"] * -0.3 + S["chin"] * 0.4)
    P.r("head", S["lean"] * -0.4 + S["chin"] * 0.6, S["tilt"])
    P.r("shoulder_L", 0, -S["hunch"], -S["protract"])
    P.r("shoulder_R", 0, S["hunch"], S["protract"])
    if standing:
        stand_feet(P, S["width"])
        P.hips.z = -S["knee"]
    mode = PROP_L.get(key)
    if mode:
        P.prop[1] = {"mode": mode, "ground": "plant" if mode == "upright" else None}
    return P


def left_hold(key, P, u=0.0, active=True):
    """Default left-arm pose per clan (the left hand carries the clan's prop)."""
    if key == "sol":            # balance raised in front at the waist
        P.ik[1] = (V((0.20, -0.25, 1.02)), POLE_L)
        P.r("hand_L", -10, 0, 0)
    elif key == "pepel":        # shield raised on guard
        P.ik[1] = (V((0.02, -0.33, 1.13)), V((1.0, 0.2, -0.6)))
        P.r("hand_L", 0, 0, 0)
    elif key == "moh":          # cauldron hanging from a slightly bent arm
        P.ik[1] = (V((0.30, -0.10, 0.92)), POLE_L)
    elif key == "yantar":       # keys held in front of the belly
        P.ik[1] = (V((0.10, -0.26, 1.00)), POLE_L)
    elif key == "iney":         # staff planted beside the left foot
        P.ik[1] = (V((0.29, -0.17, 1.02)), POLE_L)
    else:
        P.r("upperarm_L", 4, 0, 0).r("forearm_L", -10, 0, 0)


def right_rest(key, P):
    if key == "iney":           # scholar: right hand behind the back
        P.ik[-1] = (V((0.02, 0.20, 0.98)), V((-1.0, 0.8, -0.2)))
        P.r("hand_R", 0, 0, 0)
    elif key == "yantar":       # rubbing hands with the key hand
        P.ik[-1] = (V((-0.02, -0.27, 1.01)), POLE_R)
    elif key == "pepel":        # tense, hand near the belt knife
        P.ik[-1] = (V((-0.22, -0.12, 0.95)), POLE_R)
    else:
        P.r("upperarm_R", 3, 0, 0).r("forearm_R", -12, 0, 0)


def breathe(P, u, S, rate):
    b = wave(u, rate)
    P.r("chest", -1.3 * b)
    P.r("spine", -0.4 * b)
    P.r("shoulder_L", 0, -0.8 * b, 0)
    P.r("shoulder_R", 0, 0.8 * b, 0)
    P.r("neck", 0.6 * b)


def weight_shift(P, u, S, amt=1.0, k=1):
    s = wave(u, k)
    P.hips.x += 0.022 * amt * s
    P.hips_rot.y += -2.0 * amt * s
    P.r("spine", 0, 1.2 * amt * s, 0)
    P.r("chest", 0, 0.8 * amt * s, 0)


def glance(u, table):
    """Head yaw snaps through (u, deg) pairs with quick transitions (paranoid looks)."""
    out = table[-1][1]
    for (u0, a0), (u1, a1) in zip(table, table[1:]):
        if u0 <= u <= u1:
            t = (u - u0) / max(u1 - u0, 1e-6)
            return lerp(a0, a1, sm(min(1.0, t * 4)))
    return out


# ===================================================================== clips

def clip_idle(key, S, u):
    P = base_pose(key, S)
    rate = {"pepel": 2, "yantar": 2}.get(key, 1)
    breathe(P, u, S, rate)
    weight_shift(P, u, S, {"sol": 1.6, "moh": 0.8, "pepel": 0.5, "iney": 0.4}.get(key, 1.0))
    left_hold(key, P, u)
    right_rest(key, P)
    if key == "pepel":          # paranoid glances, shield twitch
        yaw = glance(u, [(0.0, 0), (0.18, 0), (0.24, 38), (0.40, 38), (0.46, -8), (0.62, -8),
                         (0.67, -40), (0.80, -40), (0.86, 0), (1.0, 0)])
        P.r("head", 0, 0, yaw * 0.7).r("neck", 0, 0, yaw * 0.3).r("chest", 0, 0, yaw * 0.12)
        P.r("forearm_L", -3 * wave(u, 6), 0, 0)
    elif key == "yantar":       # fidget: hands rub, eyes on the keys, quick looks
        P.ik[-1] = (V((-0.02 + 0.03 * wave(u, 6), -0.27 + 0.015 * wave(u, 6, 0.25),
                       1.01 + 0.012 * wave(u, 12))), POLE_R)
        P.ik[1] = (V((0.10, -0.26, 1.00 + 0.01 * wave(u, 6, 0.5))), POLE_L)
        P.r("head", 6 + 4 * env(u, 0.3, 0.35, 0.55, 0.6), 0,
            glance(u, [(0, 0), (0.62, 0), (0.66, 22), (0.78, 22), (0.82, 0), (1.0, 0)]))
        P.r("shoulder_L", 0, -2 * wave(u, 3), 0).r("shoulder_R", 0, 2 * wave(u, 3), 0)
    elif key == "sol":          # sly sidelong look, slow head roll
        P.r("head", 0, 3 * wave(u, 1, 0.1), 14 * keys(u, [(0, 0), (0.3, 0), (0.42, 1), (0.7, 1),
                                                           (0.82, 0), (1, 0)]))
        P.r("hand_R", 0, 0, 0)
        P.ik[-1] = (V((-0.20, -0.12, 1.02)), POLE_R)        # hand resting on the belt
    elif key == "moh":          # calm: slow head nod, soft sway
        P.r("head", 2 * wave(u, 1, 0.2), 2 * wave(u, 1), 0)
    elif key == "iney":         # reading the room: slow head scan, chin up
        P.r("head", -2 * env(u, 0.2, 0.35, 0.6, 0.75), 0,
            keys(u, [(0, 0), (0.15, 0), (0.35, 18), (0.55, 18), (0.75, -10), (0.9, -10),
                     (1.0, 0)]))
    elif key in ("iris", "suit"):
        a = env(u, 0.50, 0.60, 0.78, 0.90)                   # adjusts the scarf
        P.ik[-1] = (REST_WRIST_R.lerp(V((-0.07, -0.16, 1.36)), a)
                    + V((0, 0, 0.01 * wave(u, 4) * a)), POLE_R) if key == "iris" else P.ik.get(-1)
        if P.ik[-1] is None:
            del P.ik[-1]
        P.r("hand_R", -40 * a, 0, 0)
        P.r("head", 4 * a, 0, -6 * a + 5 * keys(u, [(0, 0), (0.15, 1), (0.4, 1), (0.5, 0),
                                                     (1, 0)]))
    return P


def clip_locomotion(key, S, u, run=False):
    T = (RUN_FRAMES if run else WALK_FRAMES) / FPS
    speed = RUN_SPEED if run else WALK_SPEED
    P = base_pose(key, S, standing=False)
    stance = 0.36 if run else 0.60
    lift = 0.20 if run else 0.075
    width = (0.0 if run else -0.01) + S["width"] * 0.3
    sp, op = (8.0, -45.0) if run else (14.0, -36.0)
    for side, ph0 in ((1, 0.0), (-1, 0.5)):
        P.feet[side] = gait_foot((u + ph0) % 1.0, side, speed, T, stance, lift, sp, op, width,
                                 tang=0.45 if run else 0.6)
    c, s2 = math.cos(TAU * u), math.cos(2 * TAU * u)
    sw = S["sway"]
    if run:
        P.hips.z = -0.07 + 0.035 * S["bounce"] * math.cos(2 * TAU * (u - stance / 2) + math.pi)
        lean = 12 + S["lean"] * 0.5
    else:
        P.hips.z = -0.035 - 0.022 * S["bounce"] * s2
        lean = 3 + S["lean"] * 0.8
    P.hips.x = 0.018 * sw * math.sin(TAU * u) * (0.5 if run else 1.0)
    P.hips_rot = V((lean * 0.25, -3.0 * sw * math.sin(TAU * u), -6.0 * sw * c))
    P.r("spine", lean * 0.35, 0, 3.0 * sw * c)
    P.r("chest", lean * 0.3 + 1.5 * s2, 1.5 * sw * math.sin(TAU * u), 5.0 * sw * c)
    P.r("neck", -lean * 0.3, 0, -1.0 * sw * c)
    P.r("head", -lean * 0.35, 1.5 * sw * math.sin(TAU * u), -0.8 * sw * c)
    # arms swing opposite to the legs (left foot strikes at u = 0)
    A = (32 if run else 20) * S["swing"]
    lag = 0.04
    cl = math.cos(TAU * (u - lag))
    flex = 85 if run else 18
    for side, sfx, sgn in ((1, "L", 1), (-1, "R", -1)):
        sw_a = A * cl * sgn                    # + = backwards
        P.r(f"upperarm_{sfx}", sw_a - (8 if run else 2), 0, -side * (6 if run else 2))
        P.r(f"forearm_{sfx}", -flex - (0.4 * A * max(0.0, -cl * sgn) if not run else 10 * cl * sgn),
            0, -side * (25 if run else 0))
    P.r("hand_L", 0, 0, 0)
    # clan overrides of the arms
    if key == "iney":
        P.rot.pop("upperarm_R", None), P.rot.pop("forearm_R", None)
        right_rest(key, P)
        P.ik[1] = (V((0.27, -0.22 - 0.05 * cl, 1.04 + 0.02 * s2)), POLE_L)
        P.prop[1] = {"mode": "upright", "ground": "above"}
    elif key == "pepel":
        left_hold(key, P)
        P.ik[1] = (P.ik[1][0] + V((0, 0.02 * cl, 0.015 * s2)), P.ik[1][1])
        yaw = 10 * math.sin(TAU * u * 1) if not run else 0
        P.r("head", 0, 0, yaw)
    elif key == "sol" and not run:
        left_hold(key, P)
    elif key == "yantar" and not run:
        left_hold(key, P)
        P.ik[1] = (P.ik[1][0] + V((0, 0, 0.02 * s2)), P.ik[1][1])
        P.r("shoulder_L", 0, -2 * s2, 0).r("shoulder_R", 0, 2 * s2, 0)
    elif key == "moh":
        P.r("forearm_L", 8, 0, 0)          # cauldron arm straighter, heavy
    if key == "pepel" and run:
        left_hold(key, P)
    return P


def clip_talk(key, S, u):
    P = clip_idle(key, S, u)
    P.ik.pop(-1, None)
    P.rot.pop("hand_R", None)
    pole = POLE_R
    if key == "pepel":          # short sharp jabs between glances
        tgt = keys(u, [(0.0, V((-0.18, -0.24, 1.12))), (0.08, V((-0.12, -0.38, 1.18))),
                       (0.16, V((-0.18, -0.24, 1.12))), (0.30, V((-0.18, -0.24, 1.12))),
                       (0.36, V((-0.10, -0.38, 1.22))), (0.44, V((-0.18, -0.24, 1.12))),
                       (0.62, V((-0.18, -0.24, 1.12))), (0.68, V((-0.14, -0.40, 1.15))),
                       (0.76, V((-0.18, -0.24, 1.12))), (1.0, V((-0.18, -0.24, 1.12)))])
        P.r("hand_R", -20, 0, 0)
    elif key == "moh":          # slow open-palm sweeps
        tgt = V((-0.20 + 0.10 * wave(u, 1), -0.32 + 0.03 * wave(u, 1, 0.25),
                 1.08 + 0.04 * wave(u, 2)))
        P.twist["hand_R"] = 50
        P.r("hand_R", -25, 0, 0)
    elif key == "yantar":       # quick counting gestures, rubbing fingers
        tgt = V((-0.12 + 0.02 * wave(u, 9), -0.32, 1.10 + 0.04 * wave(u, 3)))
        P.twist["hand_R"] = 25 * wave(u, 9)
        P.r("hand_R", -30, 0, 0)
    elif key == "iney":         # lecturing: hand raised, tapping the point home
        tgt = keys(u, [(0.0, V((-0.20, -0.24, 1.30))), (0.25, V((-0.20, -0.26, 1.40))),
                       (0.35, V((-0.20, -0.26, 1.33))), (0.45, V((-0.20, -0.26, 1.40))),
                       (0.70, V((-0.24, -0.30, 1.20))), (1.0, V((-0.20, -0.24, 1.30)))])
        P.r("hand_R", -60, 0, 0)
    elif key == "sol":          # flowing circles, leaning in
        tgt = V((-0.18 + 0.07 * math.cos(TAU * u * 2), -0.32, 1.12 + 0.06 * math.sin(TAU * u * 2)))
        P.twist["hand_R"] = 40
        P.r("chest", 4, 0, -6).r("head", 0, 8, 6)
    else:                       # iris / suit: firm chops
        tgt = keys(u, [(0.0, V((-0.20, -0.30, 1.12))), (0.12, V((-0.18, -0.36, 1.20))),
                       (0.20, V((-0.18, -0.34, 1.04))), (0.36, V((-0.18, -0.36, 1.20))),
                       (0.44, V((-0.18, -0.34, 1.04))), (0.62, V((-0.24, -0.30, 1.10))),
                       (0.80, V((-0.12, -0.34, 1.16))), (1.0, V((-0.20, -0.30, 1.12)))])
        P.twist["hand_R"] = 70
        P.r("hand_R", -15, 0, 0)
    P.ik[-1] = (tgt, pole)
    # head nods with the beats, chest turns toward the listener
    P.r("head", 4 * max(0.0, wave(u, 4)), 0, 0).r("chest", 0, 0, -5 * wave(u, 1))
    if key not in ("iney", "pepel", "moh", "sol", "yantar") and key != "iris":
        pass
    return P


def clip_think(key, S, u):
    P = base_pose(key, S)
    breathe(P, u, S, 1)
    weight_shift(P, 0.25, S, 1.3)                     # weight on the left leg, held
    left_hold(key, P, u)
    chin = V((-0.03, -0.15, 1.40))
    tap = 0.012 * max(0.0, wave(u, 4)) if key == "yantar" else 0.006 * max(0.0, wave(u, 2))
    P.ik[-1] = (chin + V((0, 0, tap)), V((-0.6, 0.3, -1.0)))
    P.r("hand_R", -55, 0, 0)
    P.twist["hand_R"] = 30
    if key == "iney":           # looks up, pondering
        P.r("head", -14, 6, 8 * wave(u, 1))
    elif key == "sol":          # finger to the lips, sly tilt and side look
        P.ik[-1] = (V((-0.02, -0.16, 1.44)), V((-0.6, 0.3, -1.0)))
        P.r("head", 4, 10, 18 * keys(u, [(0, 0.3), (0.4, 1), (0.6, 1), (1, 0.3)]))
    elif key == "pepel":        # thinking but on edge
        yaw = glance(u, [(0, 0), (0.30, 0), (0.35, 30), (0.5, 30), (0.55, 0), (0.8, 0),
                         (0.84, -28), (0.94, -28), (1.0, 0)])
        P.r("head", 6, 0, yaw)
    elif key == "moh":
        P.r("head", 4, 9 + 2 * wave(u, 1), 0)
    elif key == "yantar":       # calculating
        P.r("head", 8, -6, 6 * wave(u, 2))
    else:
        P.r("head", 6, 8, -4 * wave(u, 1))
    return P


def clip_offer(key, S, u):
    P = clip_idle(key, S, 0.0)           # starts and ends on idle frame 0
    P.ik.pop(-1, None)
    P.rot.pop("hand_R", None)
    reach_t = {"pepel": (0.0, 0.18, 0.60, 0.78), "moh": (0.0, 0.40, 0.70, 1.0),
               "yantar": (0.0, 0.30, 0.75, 1.0)}.get(key, (0.0, 0.32, 0.72, 1.0))
    a = env(u, *reach_t)
    if key == "yantar":                   # greedy: pulls back once before giving
        a *= 1.0 - 0.45 * env(u, 0.32, 0.40, 0.46, 0.56)
    start = REST_WRIST_R if key not in ("iney", "yantar", "pepel") else P.ik.get(-1, (REST_WRIST_R,))[0]
    rest_ik = clip_idle(key, S, 0.0).ik.get(-1)
    start = rest_ik[0] if rest_ik else REST_WRIST_R
    out = V((-0.10, -0.46, 1.12))
    if rest_ik:
        P.ik[-1] = (start.lerp(out, a), rest_ik[1].lerp(POLE_R, a))
    else:
        P.ik[-1] = (start.lerp(out, a), POLE_R)
        P.ik[-1] = (P.ik[-1][0], POLE_R)
    P.twist["hand_R"] = 90 * a
    P.r("hand_R", -10 * a, 0, 0)
    P.r("chest", 6 * a, 0, -4 * a).r("head", 6 * a, (8 if key == "sol" else 0) * a, 0)
    if key == "pepel":
        P.r("head", 0, 0, 25 * env(u, 0.25, 0.32, 0.45, 0.52))
    return P


def clip_celebrate(key, S, u):
    P = base_pose(key, S)
    bounce = abs(math.sin(TAU * u * 2))
    P.hips.z -= 0.035 * bounce
    P.r("head", -10, 0, 0)
    pump = 0.5 - 0.5 * math.cos(TAU * u * 2)          # 0 at u=0, two pumps per loop
    up = 0.75 + 0.25 * pump
    if key == "iney":           # raises the staff overhead
        P.ik[1] = (V((0.24, -0.08, 1.55 + 0.20 * up)), V((1.0, 0.3, -0.4)))
        P.prop[1] = {"mode": "upright", "ground": "above"}
        right_rest(key, P)
        P.r("head", -8, 0, 0)
    elif key == "moh":          # arms open, head back, gentle
        P.ik[1] = (V((0.42, -0.18, 1.30 + 0.06 * pump)), V((1.0, 0.2, -0.8)))
        P.ik[-1] = (V((-0.42, -0.18, 1.30 + 0.06 * pump)), V((-1.0, 0.2, -0.8)))
        P.twist["hand_R"] = 60
        P.r("head", -8, 0, 0).r("chest", -4, 0, 0)
        P.hips.z += 0.02 * bounce
    elif key == "yantar":       # glee: rubbing hands, shoulder shimmy, little hops
        P.ik[-1] = (V((-0.03 + 0.03 * wave(u, 8), -0.28, 1.12)), POLE_R)
        P.ik[1] = (V((0.08, -0.28, 1.12 + 0.01 * wave(u, 8))), POLE_L)
        P.r("chest", 0, 0, 8 * wave(u, 4)).r("head", 0, 6 * wave(u, 4), 0)
    elif key == "sol":          # smug flourish
        P.ik[-1] = (keys(u, [(0, V((-0.20, -0.30, 1.15))), (0.3, V((-0.40, -0.25, 1.30))),
                             (0.6, V((-0.30, -0.40, 1.05))), (1.0, V((-0.20, -0.30, 1.15)))]),
                    POLE_R)
        P.twist["hand_R"] = 70
        left_hold(key, P)
        P.r("head", 0, 10, 0).r("chest", 3, 0, -6)
        P.hips.z += 0.025 * bounce
    elif key == "pepel":        # one quick fist, then back on guard, glance
        P.ik[-1] = (V((-0.24, -0.12, 1.30 + 0.35 * pump)), V((-1.0, 0.2, -0.6)))
        left_hold(key, P)
        P.r("head", 0, 0, 20 * wave(u, 1))
        P.r("hand_R", -30, 0, 0)
    else:                       # iris / suit: triumphant fist pumps
        P.ik[-1] = (V((-0.22, -0.08, 1.45 + 0.38 * pump)), V((-1.0, 0.2, -0.5)))
        P.r("hand_R", -30, 0, 0)
        left_hold(key, P)
        P.r("upperarm_L", -10 * pump, 0, 0)
    return P


def clip_defeat(key, S, u):
    P = base_pose(key, S)
    a = sm(u / 0.55)
    late = sm((u - 0.45) / 0.45)
    P.r("spine", 12 * a).r("chest", 10 * a).r("neck", 14 * a).r("head", 20 * a)
    P.r("shoulder_L", 0, 8 * a, -8 * a).r("shoulder_R", 0, -8 * a, 8 * a)
    P.hips.z -= 0.06 * a
    left_hold(key, P)
    right_rest(key, P)
    if key in ("pepel", "iris"):       # drops to one knee (right)
        k = sm((u - 0.15) / 0.55)
        P.hips += V((0, 0.06, -0.33)) * k
        P.feet[-1]["ankle"] = P.feet[-1]["ankle"].lerp(V((-0.13, 0.40, 0.11)), k)
        P.feet[-1]["pitch"] = -55 * k
        P.feet[-1]["toe"] = 50 * k
        P.feet[1]["ankle"] = P.feet[1]["ankle"].lerp(V((0.15, -0.16, ANKLE_Z)), k)
        P.r("spine", -6 * k)
        if key == "iris":              # fist on the knee, head lifts at the end
            P.ik[-1] = (V((-0.18, -0.34, 0.80)).lerp(V((-0.16, -0.30, 0.86)), late),
                        V((-1.0, 0.3, -0.2)))
            P.r("head", -14 * late).r("neck", -6 * late)
        else:
            P.ik[-1] = (V((-0.16, -0.30, 0.78)), V((-1.0, 0.3, -0.2)))
    elif key == "moh":                 # heavy sigh, sinks, head shakes slowly
        P.hips.z -= 0.05 * a
        P.r("head", 0, 0, 10 * math.sin(TAU * 1.5 * u) * late)
    elif key == "yantar":              # clutches the keys to the chest, head in hand
        P.ik[1] = (V((0.08, -0.20, 1.20)), POLE_L)
        P.ik[-1] = (V((-0.05, -0.17, 1.46)), V((-0.6, 0.3, -1.0)))
        P.r("hand_R", -60 * a, 0, 0)
        P.r("head", 0, 0, 8 * math.sin(TAU * 2 * u) * late)
    elif key == "iney":                # leans on the staff, head bowed
        P.ik[1] = (V((0.24, -0.24, 1.15)), POLE_L)
        P.r("chest", 0, -4 * a, 6 * a)
    elif key == "sol":                 # shrug and turn away
        sh = env(u, 0.1, 0.3, 0.4, 0.6)
        P.r("shoulder_L", 0, -14 * sh, 0).r("shoulder_R", 0, 14 * sh, 0)
        P.r("chest", 0, 0, 22 * late).r("head", 0, 0, 25 * late)
    return P


CLIP_FN = {
    "idle": clip_idle,
    "walk": lambda k, S, u: clip_locomotion(k, S, u, run=False),
    "run": lambda k, S, u: clip_locomotion(k, S, u, run=True),
    "talk": clip_talk,
    "think": clip_think,
    "gesture_offer": clip_offer,
    "celebrate": clip_celebrate,
    "defeat": clip_defeat,
}


# ===================================================================== springs

# chain: stiffness (1/s^2) at the root joint, damping (1/s), air drag (1/s),
# per-joint stiffness falloff, max deviation (deg), collides with legs
CHAIN_PARAMS = {
    "cloak": (70.0, 7.0, 3.2, 0.62, 55.0, True),
    "cloak_L": (80.0, 7.5, 2.6, 0.65, 45.0, True),
    "cloak_R": (80.0, 7.5, 2.6, 0.65, 45.0, True),
    "scarf": (45.0, 4.5, 4.0, 0.60, 70.0, True),
    "hood": (140.0, 9.0, 1.2, 0.75, 30.0, False),
    "skirt_F": (110.0, 9.0, 1.6, 0.70, 40.0, True),
    "skirt_B": (100.0, 8.5, 2.0, 0.70, 45.0, True),
}
HANG = {"sol": (0.22, 50.0, 3.5), "moh": (0.28, 40.0, 3.0), "yantar": (0.12, 70.0, 2.5)}


def _capsule_push(p, a, b, r):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    c = a + ab * t
    d = p - c
    L = d.length
    if L < r:
        if L < 1e-6:
            d = V((0, 1, 0))
            L = 1.0
        return c + d * (r / L)
    return p


def simulate(solver, poses, loop, air, cloth_scale=1.0, hang=None, sub=4):
    """Spring-simulate every chain over the per-frame body poses.
    Returns {chain: [[joint positions] per frame]}, and hang pendulum dirs per frame."""
    n = len(poses)
    dt = 1.0 / (FPS * sub)
    chains = []
    for name, pts, parent in CHAINS_REST:
        k0, c, cd, fall, maxdeg, legs = CHAIN_PARAMS[name]
        rest_pts = [V(p) for p in pts]
        L = [(rest_pts[i + 1] - rest_pts[i]).length for i in range(len(rest_pts) - 1)]
        chains.append(dict(name=name, parent=parent, rest=rest_pts, L=L,
                           k=[k0 * fall ** i for i in range(len(L))], c=c, cd=cd * cloth_scale,
                           maxc=math.cos(R(maxdeg)), legs=legs))
    airv = V((0, air, 0))       # body moves to -Y: relative air flows to +Y

    def targets(pose, ch):
        M = pose[ch["parent"]] @ solver.rest[ch["parent"]].inverted()
        return [M @ p for p in ch["rest"]]

    def colliders(pose):
        caps = []
        for sfx in ("L", "R"):
            for b, r in ((f"thigh_{sfx}", 0.11), (f"shin_{sfx}", 0.085)):
                m = pose[b]
                caps.append((m.translation.copy(), (m @ V((0, solver.len[b], 0))), r))
        m0, m1 = pose["pelvis"], pose["chest"]
        caps.append((m0.translation + V((0, 0.0, 0.0)), m1 @ V((0, solver.len["chest"], 0)), 0.15))
        return caps

    # state
    state = []
    for ch in chains:
        T = targets(poses[0], ch)
        state.append({"x": [p.copy() for p in T[1:]], "v": [V() for _ in T[1:]]})
    hang_state = None
    if hang:
        Lh, kh, ch_ = hang
        anc = poses[0]["prop_L"].translation
        hang_state = {"x": anc + V((0, 0, -Lh)), "v": V()}

    order = list(range(n))
    if loop:
        seq = order * 3
        record_from = 2 * n
    else:
        seq = [0] * 45 + order
        record_from = 45
    rec = {ch["name"]: [] for ch in chains}
    rec_hang = []
    prev_T = [targets(poses[seq[0]], ch) for ch in chains]
    prev_anchor = poses[seq[0]]["prop_L"].translation.copy() if hang else None
    for step, f in enumerate(seq):
        pose = poses[f]
        caps = colliders(pose)
        for ci, ch in enumerate(chains):
            T = targets(pose, ch)
            vt = [(T[j] - prev_T[ci][j]) * FPS for j in range(len(T))]
            st = state[ci]
            for s in range(sub):
                a_ = (s + 1) / sub
                Ts = [prev_T[ci][j].lerp(T[j], a_) for j in range(len(T))]
                prev = Ts[0]
                for j in range(len(st["x"])):
                    x, v = st["x"][j], st["v"][j]
                    acc = (Ts[j + 1] - x) * ch["k"][j] + (vt[j + 1] - v) * ch["c"] \
                        + (airv - v) * ch["cd"] * (0.6 + 0.4 * j)
                    v = v + acc * dt
                    xn = x + v * dt
                    # inextensible segment, limited deviation from the rest direction
                    d = xn - prev
                    dr = (Ts[j + 1] - Ts[j]).normalized()
                    dn = d.normalized() if d.length > 1e-6 else dr
                    if dn.dot(dr) < ch["maxc"]:
                        perp = (dn - dr * dn.dot(dr))
                        perp = perp.normalized() if perp.length > 1e-6 else V((0, 1, 0))
                        sa = math.sqrt(max(0.0, 1 - ch["maxc"] ** 2))
                        dn = dr * ch["maxc"] + perp * sa
                    xn = prev + dn * ch["L"][j]
                    if ch["legs"]:
                        for (a0, b0, r) in caps:
                            xn = _capsule_push(xn, a0, b0, r)
                        xn = prev + (xn - prev).normalized() * ch["L"][j]
                    if xn.z < 0.03:
                        xn.z = 0.03
                    st["v"][j] = (xn - x) / dt
                    st["x"][j] = xn
                    prev = xn
            prev_T[ci] = T
            if step >= record_from:
                rec[ch["name"]].append([T[0]] + [p.copy() for p in st["x"]])
        if hang:
            Lh, kh, chd = hang
            anc = pose["prop_L"].translation.copy()
            va = (anc - prev_anchor) * FPS
            hs = hang_state
            for s in range(sub):
                a_ = (s + 1) / sub
                A = prev_anchor.lerp(anc, a_)
                tgt = A + V((0, 0, -Lh))
                acc = (tgt - hs["x"]) * kh + (va - hs["v"]) * chd + (airv - hs["v"]) * 0.8
                hs["v"] = hs["v"] + acc * dt
                xn = hs["x"] + hs["v"] * dt
                xn = A + (xn - A).normalized() * Lh
                hs["v"] = (xn - hs["x"]) / dt
                hs["x"] = xn
            prev_anchor = anc
            if step >= record_from:
                rec_hang.append((hs["x"] - anc).normalized())
    if loop:
        # close the loop: spread the residual seam error linearly over the cycle
        for ci, ch in enumerate(chains):
            frames = rec[ch["name"]]
            first = frames[0]
            T = targets(poses[0], ch)
            # state that would follow the last frame ~ first frame of the next cycle
            nxt = [T[0]] + [p.copy() for p in state[ci]["x"]]
            err = [nxt[j] - first[j] for j in range(len(first))]
            for fi in range(n):
                w = fi / n
                frames[fi] = [frames[fi][j] - err[j] * w for j in range(len(first))]
    return rec, rec_hang


# ===================================================================== baking

def evaluate_clip(solver, key, clip):
    frames, loop, air = CLIPS[clip]
    S = STYLE[key]
    fn = CLIP_FN[clip]
    n = frames if loop else frames + 1
    specs = [fn(key, S, f / frames) for f in range(n)]
    solved = [solver.solve(P) for P in specs]
    poses = [s[0] for s in solved]
    hang = HANG.get(key) if PROP_L.get(key) == "hang" else None
    rec, rec_hang = simulate(solver, poses, loop, air, S["cloth"], hang)
    out = []
    clamps = []
    for f in range(n):
        P = specs[f]
        over = None
        if hang and rec_hang:
            d = rec_hang[f]
            sw = V((0, 0, -1)).rotation_difference(d)
            over = {"prop_L": sw @ solver.rest_q["prop_L"]}
        pose, basis, clamp = solver.solve(P, over)
        clamps.append(clamp)
        for name, pts, parent in CHAINS_REST:
            J = rec[name][f]
            for i in range(len(pts) - 1):
                solver.aim(pose, basis, f"{name}_{i}", J[i + 1])
        out.append((pose, basis))
    if loop:
        out.append(out[0])
    return out, {"frames": frames, "loop": loop, "max_hip_clamp_m": round(max(clamps), 4)}


def bake_clips(arm_obj, key, clips=None, log=print):
    """Create one action per clip on arm_obj (fake user, linear keys)."""
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start = 0
    solver = Solver(arm_obj)
    ad = arm_obj.animation_data_create()
    info = {}
    actions = {}
    for clip in (clips or CLIPS):
        frames_out, meta = evaluate_clip(solver, key, clip)
        act = bpy.data.actions.new(clip)
        act.use_fake_user = True
        ad.action = act
        prevq = {}
        for f, (pose, basis) in enumerate(frames_out):
            for b in solver.order:
                if b == "root":
                    continue
                pb = arm_obj.pose.bones[b]
                loc, q = basis[b]
                q = q.normalized()
                if b in prevq and prevq[b].dot(q) < 0:
                    q = -q
                prevq[b] = q
                pb.rotation_quaternion = q
                pb.keyframe_insert("rotation_quaternion", frame=f, group=b)
                if b in ("pelvis", "prop_L", "prop_R"):
                    pb.location = loc
                    pb.keyframe_insert("location", frame=f, group=b)
        for fc in _fcurves(act):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        meta["seconds"] = round(meta["frames"] / FPS, 4)
        info[clip] = meta
        actions[clip] = act
        log(key, "clip", clip, meta)
    for pb in arm_obj.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = V()
    ad.action = actions.get("idle")
    return info, actions


def _fcurves(act):
    if hasattr(act, "layers") and len(act.layers):
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    out.extend(cb.fcurves)
        return out
    return list(act.fcurves)


def foot_slip(solver, key):
    """Walk QA: drift of each planted foot's contact point in ground space (m)."""
    frames_out, _ = evaluate_clip(solver, key, "walk")
    T = WALK_FRAMES / FPS
    res = {}
    for sfx, side in (("L", 1), ("R", -1)):
        pts = []
        for f, (pose, _) in enumerate(frames_out[:-1]):
            m = pose[f"foot_{sfx}"]
            heel = m.translation + (m.to_quaternion() @ (solver.rest_q[f"foot_{sfx}"].inverted() @ HEEL))
            ball = m.translation + (m.to_quaternion() @ (solver.rest_q[f"foot_{sfx}"].inverted() @ BALL))
            low = min(heel.z, ball.z)
            # body moves forward (-Y) at speed: ground position = body pos + travel
            travel = -WALK_SPEED * f / FPS
            pts.append((f, heel, ball, low, travel))
        flat = [(f, (h.y + b.y) / 2 + tr) for f, h, b, low, tr in pts
                if abs(h.z) < 0.004 and abs(b.z) < 0.004]
        ys = [y for _, y in flat]
        res[sfx] = {"flat_frames": len(flat),
                    "planted_drift_m": round(max(ys) - min(ys), 4) if ys else None,
                    "min_contact_z_m": round(min(p[3] for p in pts), 4)}
    res["stride_m"] = round(WALK_SPEED * T, 4)
    return res

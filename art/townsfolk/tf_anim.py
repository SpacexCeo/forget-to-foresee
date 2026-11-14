"""Townsfolk clips (Blender 4.5): procedural clips on the shared agent solver (art/agents/agent_anim.py,
imported, not changed), baked per person so feet stay planted on every body.

Bodies are animated at the rig's eye line (1.64 m) and scaled on export, so a clip's ground speed is given
in real metres per second and divided by the export scale here.   Clip names are the game contract
(game/src/play/townsfolk.js); `CLIP_SPEED` in build.json tells the client how fast each loop walks.
"""
import math

import agent_anim as A

V = A.V


def install_style(key, entry):
    st = dict(entry["style"])
    A.STYLE[key] = st
    return st


def clip_wayfarer_idle(key, S, u):
    """The Wayfarer looks around: up at the roofs on one side, then along the street on the other."""
    P = A.clip_idle(key, S, u)
    yaw = A.keys(u, [(0.0, 0), (0.10, 0), (0.22, 34), (0.40, 34), (0.52, -6), (0.62, -38), (0.80, -38), (0.92, 0), (1.0, 0)])
    up = A.env(u, 0.16, 0.26, 0.40, 0.50)
    P.r("head", -10 * up, 0, yaw * 0.62).r("neck", -3 * up, 0, yaw * 0.25).r("chest", 0, 0, yaw * 0.14)
    return alive(P, S, u)


def alive(P, S, u, shift=1.4):
    """Life on top of a standing clip (review W4): the weight drifts from foot to foot (hips 2-3 cm across, a 1 cm dip),
    the chest breathes about 1.5 degrees, the head follows a little."""
    A.weight_shift(P, u, S, shift)
    P.hips.z -= 0.005 * (1 - math.cos(A.TAU * u * 2))
    b = A.wave(u, 2); P.r("chest", -1.5 * b).r("spine", -0.5 * b).r("head", 1.2 * A.wave(u, 1, 0.3), 0, 2.5 * A.wave(u, 1, 0.6))
    return P


def clip_wayfarer_walk(key, S, u):
    """The shared walk with a softer toe-off: the Wayfarer's thick boot soles would dip into the ground at the shared
    36-degree peel-off and the heel cap at the 14-degree strike (review W3): the foot rolls 18 degrees up and strikes at 6."""
    orig = A.gait_foot
    def soft(ph, side, speed, T, stance, lift, sp, op, width, **kw):
        f = orig(ph, side, speed, T, stance, lift, sp * 0.45, op * 0.5, width, **kw)
        f['toe'] = f['toe'] * 1.6 + 5.0      # the body's toes curl up inside the boot instead of poking through its sole
        return f
    A.gait_foot = soft
    try: return A.clip_locomotion(key, S, u, run=False)
    finally: A.gait_foot = orig


def clip_wayfarer_talk(key, S, u): return alive(A.clip_talk(key, S, u), S, u, 1.0)


def clip_wayfarer_think(key, S, u): return alive(A.clip_think(key, S, u), S, u, 1.2)


def clip_take_photo(key, S, u):
    """3 s one-shot: both hands bring the crystal camera up to the eye, a small press and recoil (the flash), down again."""
    P = A.clip_idle(key, S, 0.0)                     # starts and ends on idle frame 0
    P.ik.pop(-1, None); P.ik.pop(1, None); P.rot.pop("hand_R", None)
    a = A.env(u, 0.0, 0.26, 0.74, 1.0); click = A.env(u, 0.46, 0.50, 0.53, 0.62)
    dz = V((0, 0.012 * click, -0.014 * click))
    P.ik[-1] = (A.REST_WRIST_R.lerp(V((-0.085, -0.25, 1.56)), a) + dz, A.POLE_R)
    P.ik[1] = (A.REST_WRIST_L.lerp(V((0.075, -0.26, 1.53)), a) + dz, A.POLE_L)
    P.twist["hand_R"] = 70 * a
    P.r("head", 6 * a - 3 * click, 0, -4 * a).r("chest", 5 * a - 2 * click, 0, 0).r("spine", 3 * a)
    P.hips.z -= 0.018 * a
    return P


def clip_haggle(key, S, u):
    """3.5 s one-shot: the free hand comes up palm-up and weighs the price, a head shake, then a small nod."""
    P = A.clip_idle(key, S, 0.0)
    P.ik.pop(1, None)
    a = A.env(u, 0.0, 0.18, 0.82, 1.0); beat = A.wave(u, 5) * a
    P.ik[1] = (A.REST_WRIST_L.lerp(V((0.22, -0.30, 1.12)), a) + V((0.02 * beat, 0, 0.035 * beat)), A.POLE_L)
    P.twist["hand_L"] = -80 * a
    shake = A.env(u, 0.22, 0.28, 0.46, 0.52); nod = A.env(u, 0.60, 0.66, 0.76, 0.84)
    P.r("head", 7 * nod * abs(A.wave(u, 8)), 3 * a, 15 * shake * A.wave(u, 9))
    P.r("shoulder_L", 0, -5 * a, 0).r("chest", 0, 0, -5 * a).r("spine", 2 * a)
    return P


# per person: clip name -> ((frames, loop, air speed) or None to keep the shared spec, pose function)
EXTRA = {"wayfarer": {"idle": (None, clip_wayfarer_idle), "walk": (None, clip_wayfarer_walk), "talk": (None, clip_wayfarer_talk), "think": (None, clip_wayfarer_think), "take_photo": ((90, False, 0.0), clip_take_photo),
                      "haggle": ((105, False, 0.0), clip_haggle)}}


def bake(rig, key, entry, scale, log=print):
    st = install_style(key, entry)
    real = st.get("walk", 1.25)
    frames = int(st.get("cycle", 30))
    saved = (A.WALK_SPEED, A.WALK_FRAMES, dict(A.CLIPS), A.RUN_SPEED, dict(A.CLIP_FN))
    ank = rig.data.bones["shin_L"].tail_local
    A.set_ankle(abs(ank.x), ank.z)
    try:
        A.WALK_SPEED = real / scale
        A.WALK_FRAMES = frames
        A.CLIPS["walk"] = (frames, True, A.WALK_SPEED)
        clips = ["idle", "walk", "talk", "think", "gesture_offer", "understand"]
        if entry.get("agent"):                        # clan agents: the full agent contract (game/src/play/agents.js)
            clips = ["idle", "walk", "run", "talk", "think", "gesture_offer", "celebrate", "defeat", "understand"]
            A.RUN_SPEED = 3.0 / scale
            A.CLIPS["run"] = (A.RUN_FRAMES, True, A.RUN_SPEED)
        if entry["height"] < 1.45:                    # children run
            clips.append("run")
            A.RUN_SPEED = 2.6 / scale
            A.CLIPS["run"] = (A.RUN_FRAMES, True, A.RUN_SPEED)
        for name, (spec, fn) in EXTRA.get(key, {}).items():
            A.CLIP_FN[name] = fn
            if spec:
                A.CLIPS[name] = spec
            if name not in clips:
                clips.append(name)
        info, actions = A.bake_clips(rig, key, clips=clips, log=log)
        slip = A.foot_slip(A.Solver(rig), key)
        info["walk"]["speed_mps"] = real
        info["walk"]["foot_slip"] = slip
        if "run" in info:
            info["run"]["speed_mps"] = 2.6
    finally:
        A.WALK_SPEED, A.WALK_FRAMES, A.RUN_SPEED = saved[0], saved[1], saved[3]
        A.CLIPS.clear()
        A.CLIPS.update(saved[2])
        A.CLIP_FN.clear()
        A.CLIP_FN.update(saved[4])
        for name, (spec, fn) in EXTRA.get(key, {}).items():      # the face bake and the export still ask for their length
            if spec:
                A.CLIPS[name] = spec
    return info, actions

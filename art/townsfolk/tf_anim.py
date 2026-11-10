"""Townsfolk clips (Blender 4.5): procedural clips on the shared agent solver (art/agents/agent_anim.py,
imported, not changed), baked per person so feet stay planted on every body.

Bodies are animated at the rig's eye line (1.64 m) and scaled on export, so a clip's ground speed is given
in real metres per second and divided by the export scale here.   Clip names are the game contract
(game/src/play/townsfolk.js); `CLIP_SPEED` in build.json tells the client how fast each loop walks.
"""
import agent_anim as A

V = A.V


def install_style(key, entry):
    st = dict(entry["style"])
    A.STYLE[key] = st
    return st


def bake(rig, key, entry, scale, log=print):
    st = install_style(key, entry)
    real = st.get("walk", 1.25)
    frames = int(st.get("cycle", 30))
    saved = (A.WALK_SPEED, A.WALK_FRAMES, dict(A.CLIPS))
    ank = rig.data.bones["shin_L"].tail_local
    A.set_ankle(abs(ank.x), ank.z)
    try:
        A.WALK_SPEED = real / scale
        A.WALK_FRAMES = frames
        A.CLIPS["walk"] = (frames, True, A.WALK_SPEED)
        clips = ["idle", "walk", "talk"]
        info, actions = A.bake_clips(rig, key, clips=clips, log=log)
        slip = A.foot_slip(A.Solver(rig), key)
        info["walk"]["speed_mps"] = real
        info["walk"]["foot_slip"] = slip
    finally:
        A.WALK_SPEED, A.WALK_FRAMES = saved[0], saved[1]
        A.CLIPS.clear()
        A.CLIPS.update(saved[2])
    return info, actions

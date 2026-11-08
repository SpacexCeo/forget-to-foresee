"""Shared armature, skinning and baked cloth springs for the clan agents.

Imported by build_agents.py (Blender 4.5). Blender is Z-up with the front facing
-Y; the agent's left is +X. The glTF exporter converts to Y-up, front +Z.

Pipeline (called from build_agents.build_one / stage_anim):
    cap = capture(ag)              before the parts are joined: body proxy + part names
    arm = build_armature(col)      the shared 40-bone humanoid ("rig")
    skin(rt, cap, arm, key)        bone-heat weights on the body proxy, transferred to
                                   the costume with per-part rules, smoothed, 4 influences
    agent_anim.bake_clips(arm, key)   procedural clips + spring-simulated cloth chains

Bone names, clip names and timings are the gameplay contract
(docs/art/animation-contract.md). Never rename a bone without updating it.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree

from agent_geometry import BODY, FACE, arm, leg, link, select_only

RIG_NAME = "rig"


# ================================================================ armature

def bone_layout(body=BODY):
    """(name, head, tail, parent, deform) in Blender rest coordinates."""
    B = []

    def add(name, h, t, parent, deform=True):
        B.append((name, Vector(h), Vector(t), parent, deform))

    add("root", (0, 0, 0), (0, 0.25, 0), None, False)
    add("pelvis", (0, 0, 0.955), (0, 0, 1.075), "root")
    add("spine", (0, 0, 1.075), (0, 0, 1.235), "pelvis")
    add("chest", (0, 0, 1.235), (0, 0, 1.445), "spine")
    add("neck", (0, 0, 1.445), (0, -0.005, 1.56), "chest")
    add("head", (0, -0.005, 1.56), (0, -0.005, 1.75), "neck")
    for side, sfx in ((1, "L"), (-1, "R")):
        A = arm(side, body)
        add(f"shoulder_{sfx}", (0.035 * side, -0.005, 1.40), A["S"], "chest")
        add(f"upperarm_{sfx}", A["S"], A["E"], f"shoulder_{sfx}")
        add(f"forearm_{sfx}", A["E"], A["W"], f"upperarm_{sfx}")
        add(f"hand_{sfx}", A["W"], A["tip"], f"forearm_{sfx}")
        add(f"prop_{sfx}", A["grip"], A["grip"] + A["dir"] * 0.10, f"hand_{sfx}")
    for side, sfx in ((1, "L"), (-1, "R")):
        L = leg(side, body)
        (bx, by, bz), _ = body["ball"]
        (tx, ty, tz), _ = body["toe"]
        add(f"thigh_{sfx}", L["H"], L["K"], "pelvis")
        add(f"shin_{sfx}", L["K"], L["A"], f"thigh_{sfx}")
        add(f"foot_{sfx}", L["A"], (side * bx, by, bz), f"shin_{sfx}")
        add(f"toe_{sfx}", (side * bx, by, bz), (side * tx, ty - 0.03, tz), f"foot_{sfx}")
    # Face bones (rigid face parts, see agent_geometry.build_face).
    jh, jt = FACE["jaw"]
    add("jaw", jh, jt, "head")
    (ex, ey, ez), _ = FACE["eye"]
    bx, by, bz = FACE["brow"]
    for side, sfx in ((1, "L"), (-1, "R")):
        add(f"lid_up_{sfx}", (side * ex, ey, ez), (side * ex, ey - 0.02, ez), "head")
        add(f"lid_lo_{sfx}", (side * ex, ey + 0.001, ez), (side * ex, ey - 0.019, ez), "head")
        add(f"brow_{sfx}", (side * bx, by + 0.030, bz), (side * bx, by, bz), "head")
    # Finger bones: thumb, index, grouped rest (mitten hand of the body mesh).
    for side, sfx in ((1, "L"), (-1, "R")):
        A = arm(side, body)
        for fname, h, t in finger_layout(A):
            add(f"{fname}_{sfx}", h, t, f"hand_{sfx}")
    # Cloth chains (secondary motion, spring-simulated and baked).
    for name, pts, parent in CHAINS_REST:
        prev = parent
        for i in range(len(pts) - 1):
            add(f"{name}_{i}", pts[i], pts[i + 1], prev)
            prev = f"{name}_{i}"
    return B


def finger_layout(A):
    """(name, head, tail) of the finger bones of one hand (arm key points A)."""
    d, inward = A["dir"], A["inward"]
    fwd = Vector((0, -1, 0))
    th = A["W"] + d * 0.05 + fwd * 0.035 + inward * 0.01
    return (("thumb", A["W"] + d * 0.025 + fwd * 0.012, th + fwd * 0.006),
            ("index", A["palm"] + fwd * 0.011, A["tip"] + fwd * 0.011),
            ("fingers", A["palm"] + fwd * -0.006, A["tip"] + fwd * -0.006))


FACE_BONES = ("jaw", "lid_up_L", "lid_lo_L", "brow_L", "lid_up_R", "lid_lo_R", "brow_R")
FINGER_BONES = tuple(f"{f}_{s}" for s in ("L", "R") for f in ("thumb", "index", "fingers"))
EXTRA_BONES = FACE_BONES + FINGER_BONES


# chain name, joint points (head of bone 0 .. tail of the last bone), parent
CHAINS_REST = (
    ("cloak", ((0, 0.13, 1.40), (0, 0.17, 1.05), (0, 0.20, 0.70), (0, 0.22, 0.35)), "chest"),
    ("cloak_L", ((0.19, 0.03, 1.33), (0.24, 0.05, 0.86), (0.27, 0.07, 0.40)), "chest"),
    ("cloak_R", ((-0.19, 0.03, 1.33), (-0.24, 0.05, 0.86), (-0.27, 0.07, 0.40)), "chest"),
    ("scarf", ((0.06, 0.13, 1.42), (0.06, 0.17, 1.12), (0.05, 0.19, 0.82), (0.04, 0.20, 0.50)),
     "chest"),
    ("hood", ((0, 0.03, 1.72), (0, 0.10, 1.86), (0, 0.17, 2.00)), "head"),
    ("skirt_F", ((0, -0.15, 0.92), (0, -0.20, 0.52), (0, -0.24, 0.10)), "pelvis"),
    ("skirt_B", ((0, 0.15, 0.92), (0, 0.20, 0.52), (0, 0.24, 0.10)), "pelvis"),
)

CORE_DEFORM = ("pelvis", "spine", "chest", "neck", "head",
               "shoulder_L", "upperarm_L", "forearm_L", "hand_L",
               "shoulder_R", "upperarm_R", "forearm_R", "hand_R",
               "thigh_L", "shin_L", "foot_L", "toe_L", "thigh_R", "shin_R", "foot_R", "toe_R")


def _roll_axis(d):
    """Z axis for align_roll so the bone's local X follows armature +X where possible."""
    z = Vector((1, 0, 0)).cross(d)
    if z.length < 0.3:                      # bone along X (clavicle): local X -> -Y
        z = Vector((0, 0, 1)) if d.x > 0 else Vector((0, 0, -1))
    return z.normalized()


def build_armature(col, name=RIG_NAME):
    data = bpy.data.armatures.new(name)
    obj = link(bpy.data.objects.new(name, data), col)
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = data.edit_bones
    for bname, h, t, parent, deform in bone_layout():
        b = eb.new(bname)
        b.head, b.tail = h, t
        b.align_roll(_roll_axis((t - h).normalized()))
        b.use_connect = False
        b.use_deform = deform
        if parent:
            b.parent = eb[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    data.display_type = "STICK"
    return obj


# ================================================================ capture

def capture(ag):
    """Before the parts are joined: copy the body as the bone-heat proxy, remember
    part names (vertex attribute 'part' = index + 1 into these names)."""
    names = [o.name[len(ag.key) + 1:] for o in ag.parts]
    body = next(o for o in ag.parts if o.name == f"{ag.key}_body")
    head = next(o for o in ag.parts if o.name == f"{ag.key}_head")
    proxy = body.copy()
    proxy.data = body.data.copy()
    proxy.name = f"{ag.key}_heatproxy"
    proxy.modifiers.clear()
    link(proxy, ag.col)
    proxy.hide_render = True              # never seen by the bakes
    hco = np.array([v.co[:] for v in head.data.vertices])
    return {"names": names, "proxy": proxy, "head_co": hco}


# ================================================================ skinning

# Rules per part name (first match by prefix). See skin() for their meaning.
RULES_COMMON = (
    ("face_eye", "head"), ("face_lidup_L", "rigid:lid_up_L"), ("face_lidup_R", "rigid:lid_up_R"),
    ("face_lidlo_L", "rigid:lid_lo_L"), ("face_lidlo_R", "rigid:lid_lo_R"),
    ("face_brow_L", "rigid:brow_L"), ("face_brow_R", "rigid:brow_R"), ("face_jaw", "rigid:jaw"),
    ("face_mouth", "mouth"), ("face", "head"),
    ("body", "body"), ("head", "head"), ("hair", "hair"), ("hat", "head"), ("helmet", "head"),
    ("visor", "head"), ("veil", "head"), ("lens_frame", "head"),
    ("sleeve", "fit"), ("boot_toe", "fit"), ("boot", "fit"), ("bracer", "fit"), ("belt", "fit"),
    ("wraps", "fit"), ("cuff", "fit"), ("collar", "fit"), ("strap", "fit"), ("scarf_front", "fit"),
    ("scarf_tail", "chain:scarf"), ("scarf", "fit"), ("hood_down", "fit"), ("pin", "fit"),
    ("hood", "hood"), ("tunic", "skirt"), ("robe", "skirt"), ("tier", "skirt"), ("coat", "skirt"),
    ("cloak", "cloak"), ("cape", "cloak"), ("capelet", "cloak"), ("mantle", "cloak"),
    ("satchel_strap", "fit"), ("satchel", "comp"), ("clasp", "comp"), ("pouch", "comp"),
    ("shoulder_plates", "fit"), ("crystals", "comp"), ("balance", "rigid:prop_L"),
    ("pans", "rigid:prop_L"), ("cords", "rigid:prop_L"),
    ("palisade", "comp"), ("binding", "fit"), ("shield", "rigid:forearm_L"),
    ("moss", "follow"), ("leaves", "follow"), ("mushroom", "follow_comp"),
    ("cauldron", "rigid:prop_L"), ("bail", "rigid:prop_L"), ("ladle", "comp"),
    ("chest_bands", "rigid:chest"), ("chest", "rigid:chest"), ("padlocks", "follow_comp"),
    ("shackles", "follow_comp"), ("keys", "rigid:prop_L"), ("gems", "follow_comp"),
    ("staff", "rigid:prop_L"), ("armillary", "rigid:prop_L"), ("glass", "pick:head,prop_L"),
    ("tablet_cord", "follow_comp"), ("tablet", "follow_comp"), ("signs", "follow_comp"),
    ("vial", "follow_comp"),
    # suit
    ("chest_plate", "comp"), ("back_plate", "comp"), ("abdomen", "fit"), ("upper_arm", "comp"),
    ("forearm", "comp"), ("elbow", "fit"), ("glove", "fit"), ("pauldron", "fit"),
    ("thigh", "comp"), ("shin", "comp"), ("knee", "fit"), ("neck_ring", "fit"),
    ("backpack", "rigid:chest"), ("light_strip", "rigid:chest"),
)
# per agent overrides (exact part name -> rule)
RULES_AGENT = {
    "iris": {"cape": "cloak:0.35", "tunic": "skirt"},
    "pepel": {"coat": "skirt", "scarf": "fit"},
    "moh": {"capelet": "cloak:0.35"},
    "iney": {"mantle": "cloak:0.45"},
    "suit": {"boot_-1": "fit", "boot_1": "fit"},
}

CHAIN_BONES = {name: [f"{name}_{i}" for i in range(len(pts) - 1)] for name, pts, _ in CHAINS_REST}
CHAIN_PTS = {name: [Vector(p) for p in pts] for name, pts, _ in CHAINS_REST}


def rule_for(key, part):
    r = RULES_AGENT.get(key, {}).get(part)
    if r:
        return r
    for prefix, rule in RULES_COMMON:
        if part.startswith(prefix):
            return rule
    return "fit"


def smoothstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def chain_weights(chain, p, by="z"):
    """Weights over a chain's bones for point p: linear between bone centres."""
    pts = CHAIN_PTS[chain]
    bones = CHAIN_BONES[chain]
    n = len(bones)
    if by == "z":
        zs = [q.z for q in pts]
        s = 0.0
        for i in range(n):
            z0, z1 = zs[i], zs[i + 1]
            if p.z <= z0 and (p.z >= z1 or i == n - 1):
                s = i + (z0 - p.z) / (z0 - z1)
                break
            if p.z > z0 and i == 0:
                s = 0.0
                break
    else:                                   # closest point on the polyline
        best = (1e9, 0.0)
        for i in range(n):
            a, b = pts[i], pts[i + 1]
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
            d = (a + ab * t - p).length
            if d < best[0]:
                best = (d, i + t)
        s = best[1]
    u = s - 0.5
    i0 = math.floor(u)
    f = u - i0
    w = {}
    for i, ww in ((i0, 1 - f), (i0 + 1, f)):
        i = max(0, min(n - 1, i))
        w[bones[i]] = w.get(bones[i], 0.0) + ww
    return w


def _blend(a, b, t):
    """(1-t)*a + t*b for weight dicts."""
    out = {}
    for k, v in a.items():
        out[k] = out.get(k, 0.0) + v * (1 - t)
    for k, v in b.items():
        out[k] = out.get(k, 0.0) + v * t
    return out


def _norm(w, limit=4):
    items = sorted(((k, v) for k, v in w.items() if v > 1e-4), key=lambda kv: -kv[1])[:limit]
    s = sum(v for _, v in items) or 1.0
    return {k: v / s for k, v in items}


def heat_weights(proxy, arm_obj):
    """Blender bone-heat weights on the (manifold) body proxy, core bones only."""
    data = arm_obj.data
    saved = {b.name: b.use_deform for b in data.bones}
    for b in data.bones:
        b.use_deform = b.name in CORE_DEFORM
    select_only([proxy, arm_obj], arm_obj)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    for b in data.bones:
        b.use_deform = saved[b.name]
    names = {g.index: g.name for g in proxy.vertex_groups}
    co = np.array([v.co[:] for v in proxy.data.vertices])
    W = []
    empty = 0
    for v in proxy.data.vertices:
        w = {names[g.group]: g.weight for g in v.groups if g.weight > 1e-4}
        if not w:
            empty += 1
        W.append(w)
    return co, W, empty


def _nearest_bone(p, rest):
    best, bn = 1e9, None
    for name in CORE_DEFORM:
        h, t = rest[name]
        ab = t - h
        tt = max(0.0, min(1.0, (p - h).dot(ab) / ab.length_squared))
        d = (h + ab * tt - p).length
        if d < best:
            best, bn = d, name
    return bn


def skin(rt, cap, arm_obj, key, log=print):
    """Weights for the joined runtime mesh rt. Returns stats."""
    me = rt.data
    n = len(me.vertices)
    co = np.zeros(n * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
    part = np.zeros(n, dtype=np.int32)
    me.attributes["part"].data.foreach_get("value", part)
    names = cap["names"]
    rest = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm_obj.data.bones}

    pco, PW, empty = heat_weights(cap["proxy"], arm_obj)
    for i, w in enumerate(PW):                       # heat failures: nearest bone
        if not w:
            PW[i] = {_nearest_bone(Vector(pco[i]), rest): 1.0}
    # The head is a separate closed mesh: head bone, neck at the base.
    hco = cap["head_co"]
    allco = np.vstack([pco, hco])
    allW = PW + [{"head": 1.0} for _ in range(len(hco))]
    kd = KDTree(len(allco))
    for i, p in enumerate(allco):
        kd.insert(p, i)
    kd.balance()

    def fit(p, k=8, exclude=()):
        hits = kd.find_n(p, k)
        acc = {}
        d0 = hits[0][2]
        for _, idx, d in hits:
            wgt = 1.0 / (1e-4 + (d - d0) + 0.01) ** 2
            for b, v in allW[idx].items():
                if b in exclude:
                    continue
                acc[b] = acc.get(b, 0.0) + v * wgt
        return _norm(acc, 6)

    # mesh adjacency
    edges = np.zeros(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", edges)
    edges = edges.reshape(-1, 2)
    nbr = [[] for _ in range(n)]
    for a, b in edges:
        nbr[a].append(b)
        nbr[b].append(a)

    W = [None] * n
    rule_of_part = {}
    for pi in np.unique(part):
        pname = names[pi - 1]
        rule_of_part[pi] = rule_for(key, pname)
    stats = {"heat_empty_vertices": empty, "rules": {names[p - 1]: r for p, r in rule_of_part.items()}}

    head_c = Vector(BODY["head_c"])
    deferred = []
    smooth_parts = set()
    for pi, rule in rule_of_part.items():
        idx = np.nonzero(part == pi)[0]
        kind, _, arg = rule.partition(":")
        if kind == "body":
            for i in idx:
                W[i] = fit(Vector(co[i]), k=1)
        elif kind == "head":
            for i in idx:
                W[i] = {"head": 1.0}
            if names[pi - 1] == "head":          # lower front of the head follows the jaw
                for i in idx:
                    p = Vector(co[i])
                    f = smoothstep((FACE["mouth_z"] + 0.002 - p.z) / 0.010) * \
                        smoothstep((head_c.y - p.y) / 0.05)
                    if f > 0.01:
                        W[i] = {"head": 1.0 - f, "jaw": f}
        elif kind == "mouth":                    # mouth bag: top on the head, bottom on the jaw
            for i in idx:
                f = smoothstep((FACE["mouth_z"] + 0.0015 - co[i][2]) / 0.004)
                W[i] = {"head": 1.0 - f, "jaw": f} if 0.0 < f < 1.0 else \
                    ({"jaw": 1.0} if f >= 1.0 else {"head": 1.0})
        elif kind == "hair":
            for i in idx:
                p = Vector(co[i])
                t = smoothstep((1.56 - p.z) / 0.10)
                W[i] = _norm(_blend({"head": 1.0}, {"neck": 0.6, "chest": 0.4}, 0.7 * t))
            smooth_parts.add(pi)
        elif kind == "rigid":
            for i in idx:
                W[i] = {arg: 1.0}
        elif kind == "fit":
            for i in idx:
                W[i] = fit(Vector(co[i]))
            smooth_parts.add(pi)
        elif kind == "skirt":
            for i in idx:
                p = Vector(co[i])
                base = fit(p)
                f = smoothstep((0.93 - p.z) / 0.30)
                if f <= 0:
                    W[i] = base
                    continue
                legs = {b: v for b, v in base.items() if b.startswith(("thigh", "shin", "foot", "toe"))}
                rest_w = {b: v for b, v in base.items() if b not in legs}
                # thighs keep part of their pull (the robe follows the stride), the rest
                # goes to the front/back skirt chain; the centre line follows less
                side = min(1.0, abs(p.x) / 0.16)
                keep = 0.25 + 0.35 * side
                ch_f = chain_weights("skirt_F", p)
                ch_b = chain_weights("skirt_B", p)
                yb = smoothstep(0.5 + p.y / 0.30)
                ch = _blend(ch_f, ch_b, yb)
                lw = sum(legs.values())
                moved = lw * (1 - keep)
                w = {b: v * keep for b, v in legs.items()}
                for b, v in rest_w.items():
                    w[b] = w.get(b, 0.0) + v
                for b, v in ch.items():
                    w[b] = w.get(b, 0.0) + v * moved
                W[i] = _norm(_blend(base, w, f))
            smooth_parts.add(pi)
        elif kind == "cloak":
            amount = float(arg) if arg else 1.0
            for i in idx:
                p = Vector(co[i])
                base = fit(p, exclude=("forearm_L", "forearm_R", "hand_L", "hand_R",
                                       "thigh_L", "thigh_R", "shin_L", "shin_R",
                                       "foot_L", "foot_R", "toe_L", "toe_R"))
                for b in ("upperarm_L", "upperarm_R"):
                    if b in base:
                        base[b] *= 0.45
                base = _norm(base)
                f = amount * smoothstep((1.38 - p.z) / 0.35)
                if f <= 0:
                    W[i] = base
                    continue
                phi = math.degrees(math.atan2(p.x, p.y))      # 0 back, +90 left
                wb = max(0.0, 1 - abs(phi) / 75)
                wl = min(1.0, max(0.0, (phi - 15) / 75))
                wr = min(1.0, max(0.0, (-phi - 15) / 75))
                s = wb + wl + wr or 1.0
                ch = {}
                for chain, ww in (("cloak", wb / s), ("cloak_L", wl / s), ("cloak_R", wr / s)):
                    if ww > 0:
                        for b, v in chain_weights(chain, p).items():
                            ch[b] = ch.get(b, 0.0) + v * ww
                W[i] = _norm(_blend(base, ch, f))
            smooth_parts.add(pi)
        elif kind == "chain":
            for i in idx:
                p = Vector(co[i])
                base = fit(p)
                f = smoothstep((1.44 - p.z) / 0.12)
                W[i] = _norm(_blend(base, chain_weights(arg, p), f))
            smooth_parts.add(pi)
        elif kind == "hood":
            for i in idx:
                p = Vector(co[i])
                base = fit(p, exclude=("upperarm_L", "upperarm_R", "forearm_L", "forearm_R"))
                # hood shell around the head follows the head
                dh = (p - head_c).length
                if p.z > 1.50 and dh < 0.24:
                    base = _norm(_blend(base, {"head": 1.0}, smoothstep((p.z - 1.50) / 0.10)))
                f = smoothstep((p.z - 1.74) / 0.10) * smoothstep((p.y + 0.02) / 0.06)
                W[i] = _norm(_blend(base, chain_weights("hood", p, by="line"), f)) if f > 0 else base
            smooth_parts.add(pi)
        elif kind in ("comp", "follow", "follow_comp", "pick"):
            deferred.append((pi, kind, arg, idx))
        else:
            raise ValueError(rule)

    # Laplacian smoothing of cloth weights inside each part (no tearing between legs).
    for pi in smooth_parts:
        idx = np.nonzero(part == pi)[0]
        iset = set(idx.tolist())
        for _ in range(6):
            new = {}
            for i in idx:
                acc = dict(W[i])
                cnt = 1.0
                for j in nbr[i]:
                    if j in iset:
                        for b, v in W[j].items():
                            acc[b] = acc.get(b, 0.0) + v
                        cnt += 1
                new[i] = {b: v / cnt for b, v in acc.items()}
            for i in idx:
                W[i] = _blend(W[i], new[i], 0.6)

    done_idx = np.array([i for i in range(n) if W[i] is not None])
    kd2 = KDTree(len(done_idx))
    for j, i in enumerate(done_idx):
        kd2.insert(co[i], j)
    kd2.balance()
    cloth = set(int(i) for p, r in rule_of_part.items() if p in smooth_parts
                for i in np.nonzero(part == p)[0])

    def nearest_done(p, cloth_only=True):
        for _, j, _ in kd2.find_n(p, 24):
            i = done_idx[j]
            if not cloth_only or i in cloth:
                return W[i]
        return W[done_idx[kd2.find(p)[1]]]

    for pi, kind, arg, idx in deferred:
        comps = _components(idx, nbr)
        for comp in comps:
            cen = Vector(co[comp].mean(axis=0))
            if kind == "comp":                    # rigid to the dominant bone at the centroid
                w = fit(cen)
                b = max(w.items(), key=lambda kv: kv[1])[0]
                for i in comp:
                    W[i] = {b: 1.0}
            elif kind == "follow_comp":           # rigid, with the cloth weights under it
                # sample at the component's point closest to the body
                pts = co[comp]
                rr = np.hypot(pts[:, 0], pts[:, 1])
                anchor = Vector(pts[int(np.argmin(rr))])
                w = _norm(nearest_done(anchor))
                for i in comp:
                    W[i] = dict(w)
            elif kind == "follow":
                for i in comp:
                    W[i] = _norm(nearest_done(Vector(co[i])))
            elif kind == "pick":
                cands = arg.split(",")
                best = None
                for b in cands:
                    h, t = rest[b]
                    ab = t - h
                    tt = max(0.0, min(1.0, (cen - h).dot(ab) / ab.length_squared))
                    d = (h + ab * tt - cen).length
                    if best is None or d < best[0]:
                        best = (d, b)
                for i in comp:
                    W[i] = {best[1]: 1.0}

    # fingers: hand-dominant vertices beyond the palm go to the finger bones
    fing = 0
    for side, sfx in ((1, "L"), (-1, "R")):
        A = arm(side, BODY)
        lay = {nm: (h, t) for nm, h, t in finger_layout(A)}
        hb = f"hand_{sfx}"
        for i in range(n):
            w = W[i]
            if not w or w.get(hb, 0.0) < 0.5 or rule_of_part.get(int(part[i]), "").startswith("rigid"):
                continue
            p = Vector(co[i])
            s_along = (p - A["W"]).dot(A["dir"])
            th_h, th_t = lay["thumb"]
            ab = th_t - th_h
            tt = max(0.0, min(1.0, (p - th_h).dot(ab) / ab.length_squared))
            dth = (th_h + ab * tt - p).length
            hw = w[hb]
            if dth < 0.016 and p.y < A["W"].y - 0.015 and tt > 0.25:
                bone, f = f"thumb_{sfx}", smoothstep((tt - 0.25) / 0.35)
            else:
                f = smoothstep((s_along - 0.060) / 0.030)
                if f <= 0:
                    continue
                bone = f"index_{sfx}" if p.y < A["palm"].y - 0.002 else f"fingers_{sfx}"
            w = dict(w)
            w[hb] = hw * (1 - f)
            w[bone] = w.get(bone, 0.0) + hw * f
            W[i] = w
            fing += 1
    stats["finger_vertices"] = fing

    # write vertex groups
    W = [_norm(w) for w in W]
    groups = {}
    for b in arm_obj.data.bones:
        groups[b.name] = rt.vertex_groups.new(name=b.name)
    by_bone = {}
    for i, w in enumerate(W):
        for b, v in w.items():
            by_bone.setdefault((b, round(v, 4)), []).append(i)
    for (b, v), ids in by_bone.items():
        groups[b].add(ids, v, "REPLACE")
    mod = rt.modifiers.new("rig", "ARMATURE")
    mod.object = arm_obj
    rt.parent = arm_obj
    used = sorted({b for w in W for b in w})
    stats["bones_used"] = used
    stats["max_influences"] = max(len(w) for w in W)
    bpy.data.objects.remove(cap["proxy"])
    log(key, "skin: heat-empty", empty, "bones used", len(used))
    return stats


def _components(idx, nbr):
    iset = set(int(i) for i in idx)
    seen = set()
    comps = []
    for s in iset:
        if s in seen:
            continue
        stack, comp = [s], []
        seen.add(s)
        while stack:
            v = stack.pop()
            comp.append(v)
            for u in nbr[v]:
                if u in iset and u not in seen:
                    seen.add(u)
                    stack.append(u)
        comps.append(np.array(comp))
    return comps


def parent_sockets(socks, arm_obj):
    """Sockets follow their bones: head -> head, hand_r -> prop_R, backpack -> chest."""
    target = {"socket_head": "head", "socket_hand_r": "prop_R", "socket_backpack_light": "chest"}
    for e in socks:
        b = target.get(e.name)
        if not b:
            continue
        mw = e.matrix_world.copy()
        e.parent = arm_obj
        e.parent_type = "BONE"
        e.parent_bone = b
        e.matrix_world = mw

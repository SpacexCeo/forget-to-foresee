"""Procedural source for the monsters outside the castle walls (MOB-001 references on the board).

Run headless with Blender 4.5 LTS (from the repository root):

    blender -b -P art/mobs/build_mobs.py -- build  [name ...]   # model, rig, clips, textures, raw .glb (+ _m)
    blender -b -P art/mobs/build_mobs.py -- sheet  [name ...]   # contact sheet of the raw .glb poses

Names (role): skitter (swarm), hulker (brute), veilbell (caster), crownrift (elite); default all.
`build` writes art/mobs/out/mob_<name>_raw.glb and mob_<name>_m_raw.glb and art/mobs/out/mobs.json (sizes,
clips, speeds). art/mobs/run_all.sh compresses them into game/public/assets/models/mob_<name>[_m].glb.

Design (MOB-001_01..04, GPT reference sheets): weathered stone creatures with nacre seams and a sparse teal or amber
glow, broad readable silhouettes from the third-person camera, no gore. Built from faceted plates (bipyramid
"gems"), swept tubes and ribbons; every part is rigid on one bone (stone does not bend), the ribbons of the
Veilbell bend along three-bone chains. Clips (30 fps, in place, loops repeat their first pose on the last frame):
idle, walk, run (loops), attack, hit, death (one-shots; death ends lying on the ground, the pose a dissolve starts
from). Blender is Z-up with the front -Y; the glTF exporter turns this into Y-up with the front +Z.
"""

import json
import math
import os
import sys
import time

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
sys.path.insert(0, os.path.join(HERE, "..", "fauna"))
import ftf  # noqa: E402
import build_fauna as BF  # noqa: E402
from build_fauna import MB, Q, QI, make_armature, bake_clip, stash_clips, fbm, uv_grid, save_png, smooth  # noqa: E402

OUT = os.path.join(HERE, "out")
BF.OUT = OUT
FPS = 30
TAU = math.tau
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
TEX = 512


def log(*a):
    print("[mobs]", *a, flush=True)


# =================================================================== textures

def stone_maps(seed, base, crack=0.6, lichen=0.0, pores=0.0, streak=0.0):
    """Weathered stone: broad tone variation, chipped cracks, optional lichen, pores (the Veilbell's bell) and
    fibre streaks (dry root). Returns rgb, orm, normal arrays."""
    np = BF._np()
    u, v = uv_grid(TEX)
    big = fbm(TEX, 3, 4, seed)
    fine = fbm(TEX, 28, 3, seed + 1)
    edge, _ = ftf.periodic_voronoi(TEX, 9, seed + 2)
    cr = (1 - ftf.smoothstep(0.0, 0.05, edge)) * crack
    height = 0.5 * big + 0.35 * fine - 0.5 * cr
    if pores:
        pe, _ = ftf.periodic_voronoi(TEX, 14, seed + 5)
        hole = ftf.smoothstep(0.55, 0.85, pe) * ftf.smoothstep(0.45, 0.6, fbm(TEX, 5, 2, seed + 6)) * pores
        height -= 0.7 * hole
    else:
        hole = 0 * big
    if streak:
        fib = 0.5 + 0.5 * np.sin(TAU * (u * 38 + 2.0 * fbm(TEX, 4, 2, seed + 7)))
        height += streak * 0.4 * fib
    ao = ftf.cavity_ao(height, 5, 2.2)
    col = np.array(base, np.float32)[None, None, :] * (0.78 + 0.4 * big[..., None]) * (0.9 + 0.2 * fine[..., None])
    col *= (1 - 0.55 * cr[..., None]) * (1 - 0.6 * hole[..., None]) * (0.62 + 0.38 * ao[..., None])
    if lichen:
        li = ftf.smoothstep(0.6, 0.7, fbm(TEX, 8, 4, seed + 9)) * lichen
        col = col * (1 - li[..., None]) + np.array((0.40, 0.44, 0.30), np.float32) * li[..., None]
    rough = np.clip(0.82 + 0.12 * fine - 0.1 * big, 0, 1)
    orm = np.stack([ao, rough, 0 * rough], -1)
    nrm = ftf.normal_from_height(height, 5.0)
    return np.clip(col, 0, 1), orm, nrm


def mat_stone(asset, part, seed, base, **kw):
    return BF.tex_material(asset, part, stone_maps(seed, base, **kw), size=TEX)


def mat_nacre(asset, part, seed, base=(0.85, 0.84, 0.78)):
    return BF.tex_material(asset, part, BF.nacre_maps(TEX, seed, base=base, bands=10, lichen=0.12, gold=0.15, grime=0.45), size=TEX)


def mat_glow(asset, color, strength=4.0):
    return BF.glow_material(asset, "Glow", color=color, strength=strength, base=color)


# =================================================================== geometry helpers

def plate(mb, center, normal, along, length, width, thick, tag, mat=0, sides=6, offset=0.0):
    """A stone slab: a `sides`-gon outline stretched along `along` (pointed towards +along by `offset`), a domed top
    face and a flat underside, `thick` along `normal`. Reads as a layered shale tile, not a spike."""
    import random
    a = Vector(along).normalized()
    n = Vector(normal)
    n = (n - a * n.dot(a)).normalized()
    b = n.cross(a)
    c = Vector(center)
    rnd = random.Random(int(abs(c.x * 997 + c.y * 991 + c.z * 983) * 1000) % 100003)
    ring = []
    for k in range(sides):
        ang = TAU * (k + 0.5) / sides
        ca, sa = math.cos(ang), math.sin(ang)
        r = 0.5 * rnd.uniform(0.85, 1.0)
        stretch = length * (1 + offset * ca) if ca > 0 else length * (1 - 0.3 * offset)
        ring.append(c + a * (ca * r * stretch) + b * (sa * r * width))
    top = [mb.vert(p + n * thick * 0.5, tag) for p in ring]
    bot = [mb.vert(p - n * thick * 0.5, tag) for p in ring]
    peak = mb.vert(c + n * thick * 1.1 + a * length * 0.06, tag)
    for k in range(sides):
        l = (k + 1) % sides
        u0, u1 = k / sides, (k + 1) / sides
        mb.face([top[k], top[l], peak], [(u0, 0.4), (u1, 0.4), ((u0 + u1) / 2, 0.55)], mat)
        mb.face([bot[l], bot[k], top[k], top[l]], [(u1, 0.0), (u0, 0.0), (u0, 0.3), (u1, 0.3)], mat)
    under = mb.vert(c - n * thick * 0.5, tag)
    for k in range(sides):
        l = (k + 1) % sides
        mb.face([bot[l], bot[k], under], [(0.5 + 0.4 * math.cos(TAU * l / sides), 0.5 + 0.4 * math.sin(TAU * l / sides)), (0.5 + 0.4 * math.cos(TAU * k / sides), 0.5 + 0.4 * math.sin(TAU * k / sides)), (0.5, 0.5)], mat)


def shell(mb, a, b, radius, count, rings, tag, mat=0, size=1.0, jitter=0.25, seed=1, arc=(0, 360), lift=1.0):
    """Plates around the segment a-b (an armour sleeve): `rings` rings of `count` plates, outward normals."""
    import random
    rnd = random.Random(seed)
    a, b = Vector(a), Vector(b)
    ax = (b - a).normalized()
    ref = Z if abs(ax.z) < 0.9 else X
    u = ax.cross(ref).normalized()
    v = ax.cross(u)
    L = (b - a).length
    for i in range(rings):
        s = (i + 0.5) / rings
        r = radius(s) if callable(radius) else radius
        for k in range(count):
            ang = math.radians(arc[0] + (arc[1] - arc[0]) * (k + 0.5 + rnd.uniform(-jitter, jitter)) / count)
            n = math.cos(ang) * u + math.sin(ang) * v
            c = a + ax * L * (s + rnd.uniform(-0.06, 0.06)) + n * r * lift
            pl = L / rings * 1.55 * size * rnd.uniform(0.85, 1.2)
            pw = 2 * math.pi * r / count * 0.75 * size * rnd.uniform(0.85, 1.15)
            plate(mb, c, n, ax + n * 0.12, pl * 1.1, pw * 1.25, max(0.014, pw * 0.16), tag, mat, sides=rnd.choice((5, 6, 6, 7)), offset=rnd.uniform(0.1, 0.35))


def ribbon(mb, pts, width, tag_of, mat=0, normal=None):
    """A flat strip along pts (bends with the bones its vertices are tagged to): tag_of(i) per row."""
    pts = [Vector(p) for p in pts]
    n = Vector(normal) if normal else X
    for i in range(len(pts) - 1):
        t = (pts[i + 1] - pts[i]).normalized()
        s = t.cross(n).normalized()
        w0, w1 = width(i / (len(pts) - 1)), width((i + 1) / (len(pts) - 1))
        q = [pts[i] - s * w0, pts[i] + s * w0, pts[i + 1] + s * w1, pts[i + 1] - s * w1]
        vs = [mb.vert(q[0], tag_of(i)), mb.vert(q[1], tag_of(i)), mb.vert(q[2], tag_of(i + 1)), mb.vert(q[3], tag_of(i + 1))]
        v0, v1 = i / (len(pts) - 1), (i + 1) / (len(pts) - 1)
        mb.face(vs, [(0, v0), (1, v0), (1, v1), (0, v1)], mat)


def finish(mb, name, mats, col, arm, tags):
    """Rigid binding: a vertex tagged with a bone name belongs to that bone alone."""
    return mb.finish(name, mats, col, arm=arm, bone_tags={t: [t] for t in tags}, power=8.0, max_infl=1)


def stride(t, duty=0.6):
    """A keyed leg cycle instead of a sine: t in [0, 1). Stance (0..duty): the planted foot travels evenly from front
    (+1) to back (-1) under the moving body; swing (duty..1): it is picked up, carried forward fast with an eased
    start and a soft set-down (anticipation and settle), lifted highest early in the swing. Returns (sw, up)."""
    t %= 1.0
    if t < duty:
        return 1.0 - 2.0 * t / duty, 0.0
    s = (t - duty) / (1.0 - duty)
    e = s * s * (3 - 2 * s)
    return -1.0 + 2.0 * e, math.sin(math.pi * min(1.0, s * 1.15)) ** 0.8


def bob(u, steps, lag=0.08):
    """Body height through a cycle: lowest just after each foot takes the weight (`lag` of a step later), up again
    over the passing pose. 0..1."""
    return 0.5 - 0.5 * math.cos(TAU * (u * steps - lag))


def lift_axis(d):
    """Rotation axis that raises a horizontal limb pointing along d (positive angle = tip up)."""
    d = Vector((d[0], d[1], 0)).normalized()
    return d.cross(Z)


# =================================================================== creatures

def build_skitter(col):
    """MOB-001_01 Scree skitter (swarm): 0.42 m high, 0.65 m long, a basalt wedge carapace with nacre seams, six
    paired clawed legs, two narrow teal slits."""
    A = "mob_skitter"
    mats = [mat_stone(A, "Basalt", 11, (0.31, 0.34, 0.31), crack=0.7), mat_nacre(A, "Nacre", 12), mat_glow(A, (0.46, 0.72, 0.66), 5.0),
            mat_stone(A, "Leg", 13, (0.22, 0.23, 0.22), crack=0.3)]
    H = 0.25
    legs = []
    bones = [("root", (0, 0, 0), (0, 0.1, 0), None), ("body", (0, 0.05, H), (0, -0.2, H), "root")]
    for side, sx in (("L", 1), ("R", -1)):
        for i, y in enumerate((-0.16, 0.0, 0.16)):
            hip = (sx * 0.13, y, H - 0.04)
            knee = (sx * 0.27, y + 0.03 * (i - 1), H + 0.04)
            foot = (sx * 0.33, y + 0.07 * (i - 1), 0.0)
            bones += [(f"leg{side}{i}_a", hip, knee, "body"), (f"leg{side}{i}_b", knee, foot, f"leg{side}{i}_a")]
            legs.append((side, i, hip, knee, foot))
    arm = make_armature(A + "_rig", bones, col)
    mb = MB()
    tags = ["body"]
    # carapace: a ridge of wedges along the back, side plates in rows, a pointed front wedge
    for j, y in enumerate([-0.27, -0.18, -0.08, 0.02, 0.12, 0.22, 0.29]):
        s = 1 - abs(y) / 0.34
        for k, ang in enumerate((-78, -52, -26, 0, 26, 52, 78)):
            a = math.radians(ang)
            n = Vector((math.sin(a), -0.1, math.cos(a))).normalized()
            r = 0.16 * (0.75 + 0.3 * s)
            c = Vector((math.sin(a) * r * 1.45, y, H + math.cos(a) * r * 0.85))
            nacre = (j + k) % 3 == 0 and abs(ang) < 60
            plate(mb, c, n, Vector((0, -1, -0.18 * math.cos(a))), 0.17 * (0.8 + 0.3 * s), 0.13 * (0.7 + 0.3 * s), 0.03, "body", 1 if nacre else 0, sides=6, offset=0.35)
    plate(mb, (0, -0.30, H + 0.06), (0, -0.7, 0.7), (0, -1, -0.25), 0.2, 0.15, 0.04, "body", 0, sides=5)
    mb.gem((0, 0.0, H - 0.02), Y, 0.56, 0.11, sides=8, mat=3, tag="body")            # underbody
    for sx in (1, -1):
        mb.gem((sx * 0.2, 0.0, H - 0.005), Y, 0.46, 0.008, sides=4, mat=2, tag="body")     # teal seam along the rim (weak point)
    for sx in (1, -1):
        mb.gem((sx * 0.05, -0.335, H + 0.03), Vector((sx * 0.6, -0.2, 0.1)), 0.06, 0.008, sides=4, mat=2, tag="body")   # teal slits
    for side, i, hip, knee, foot in legs:
        ta, tb = f"leg{side}{i}_a", f"leg{side}{i}_b"
        tags += [ta, tb]
        mb.tube([hip, knee], lambda s: 0.034 - 0.006 * s, 6, mat=3, tag=ta)
        mb.tube([knee, Vector(foot) + Vector((0, 0, 0.05))], lambda s: 0.03 - 0.014 * s, 6, mat=3, tag=tb)
        plate(mb, Vector(hip).lerp(Vector(knee), 0.55) + Vector((0, 0, 0.03)), Vector((0, 0, 1)) + (Vector(knee) - Vector(hip)).normalized() * -0.3, Vector(knee) - Vector(hip), 0.15, 0.075, 0.025, ta, 0, offset=0.3)
        plate(mb, Vector(knee).lerp(Vector(foot), 0.35), (Vector(knee) - Vector(hip)).normalized() + Vector((0, 0, 0.3)), Vector(foot) - Vector(knee), 0.14, 0.055, 0.02, tb, 0, offset=0.3)
        mb.gem(Vector(foot) + Vector((0, 0, 0.04)), Vector((0, 0, -1)), 0.09, 0.022, sides=5, mat=1, tag=tb)          # claw
    body = finish(mb, A, mats, col, arm, tags)

    LEGS = [(s, i) for s, i, *_ in legs]
    group = {("L", 0): 0, ("R", 1): 0, ("L", 2): 0, ("R", 0): 1, ("L", 1): 1, ("R", 2): 1}     # tripods
    dirs = {(s, i): Vector(f) - Vector(h) for s, i, h, k, f in legs}

    def gait(u, amp, lift, bob_h):
        P = {}
        for key in LEGS:
            sw, up = stride(u + (0.5 if group[key] else 0.0) + 0.03 * key[1], 0.55)   # each tripod in turn, a ripple along the body
            q = Q(Z, amp * sw * (1 if key[0] == "R" else -1)) @ Q(lift_axis(dirs[key]), lift * up)
            P[f"leg{key[0]}{key[1]}_a"] = (q, None, None)
            P[f"leg{key[0]}{key[1]}_b"] = (Q(lift_axis(dirs[key]), -0.6 * lift * up), None, None)
        P["body"] = (Q(Y, 2.0 * math.sin(2 * TAU * u - 0.5)), (0, 0, bob_h * (1 - globals()["bob"](u, 2))), None)
        return P

    def idle(u, t):
        P = {f"leg{s}{i}_a": (Q(lift_axis(dirs[(s, i)]), 2.0 * math.sin(TAU * u + i)), None, None) for s, i in LEGS}
        P["body"] = (Q(X, 1.5 * math.sin(TAU * u)), (0, 0, 0.006 * math.sin(TAU * u)), None)
        return P

    def attack(u, t):
        crouch = smooth(u / 0.35) * (1 - smooth((u - 0.35) / 0.12))
        lunge = smooth((u - 0.38) / 0.12) * (1 - smooth((u - 0.6) / 0.35))
        P = {}
        for s, i in LEGS:
            front = i == 0
            P[f"leg{s}{i}_a"] = (Q(lift_axis(dirs[(s, i)]), (40 if front else 6) * lunge - 8 * crouch), None, None)
            P[f"leg{s}{i}_b"] = (Q(lift_axis(dirs[(s, i)]), (-50 if front else 0) * lunge + 12 * crouch), None, None)
        P["body"] = (Q(X, 12 * crouch - 18 * lunge), (0, 0.06 * crouch - 0.2 * lunge, -0.05 * crouch + 0.05 * lunge), None)
        return P

    def hit(u, t):
        k = math.sin(math.pi * min(1, u / 0.9)) * (1 - u * 0.3)
        return {"body": (Q(X, 14 * k) @ Q(Y, 8 * k), (0, 0.06 * k, 0.02 * k), None)}

    def death(u, t):
        f = smooth(u / 0.6)
        P = {}
        for s, i in LEGS:
            P[f"leg{s}{i}_a"] = (Q(lift_axis(dirs[(s, i)]), 35 * f), None, None)
            P[f"leg{s}{i}_b"] = (Q(lift_axis(dirs[(s, i)]), -95 * f), None, None)
        P["body"] = (Q(Y, 18 * f) @ Q(X, -6 * f), (0, 0, -0.16 * f), None)
        return P

    clips = {"idle": (60, idle), "walk": (16, lambda u, t: gait(u, 24, 30, 0.012)), "run": (10, lambda u, t: gait(u, 30, 38, 0.02)),
             "attack": (24, attack), "hit": (12, hit), "death": (36, death)}
    reach = (Vector(legs[0][4]) - Vector(legs[0][2])).length
    speeds = {"walk": 2 * reach * math.sin(math.radians(24)) / (16 / FPS * 0.55), "run": 2 * reach * math.sin(math.radians(30)) / (10 / FPS * 0.55)}
    return dict(objs=[arm, body], arm=arm, clips=clips, speeds=speeds, role="swarm", height=0.42, length=0.65, glow="teal")


def build_hulker(col):
    """MOB-001_02 Thornback hulker (brute): 2.25 m, knuckle stance, shale plates over dry root, three asymmetric
    root ribs over the shoulders, a recessed amber seam on the chest."""
    A = "mob_hulker"
    mats = [mat_stone(A, "Shale", 21, (0.38, 0.38, 0.33), crack=0.6, lichen=0.35), mat_stone(A, "Root", 22, (0.42, 0.34, 0.27), crack=0.1, streak=1.0),
            mat_glow(A, (0.95, 0.62, 0.25), 6.0)]
    B = {
        "root": ((0, 0, 0), (0, 0.2, 0), None), "pelvis": ((0, 0.3, 0.95), (0, 0.1, 1.2), "root"),
        "chest": ((0, 0.1, 1.2), (0, -0.25, 1.75), "pelvis"), "head": ((0, -0.3, 1.62), (0, -0.62, 1.58), "chest"),
    }
    for s, sx in (("L", 1), ("R", -1)):
        B[f"arm{s}_a"] = ((sx * 0.62, -0.2, 1.72), (sx * 0.86, -0.35, 1.02), "chest")
        B[f"arm{s}_b"] = ((sx * 0.86, -0.35, 1.02), (sx * 0.84, -0.48, 0.32), f"arm{s}_a")
        B[f"arm{s}_c"] = ((sx * 0.84, -0.48, 0.32), (sx * 0.84, -0.55, 0.02), f"arm{s}_b")
        B[f"leg{s}_a"] = ((sx * 0.34, 0.32, 0.92), (sx * 0.42, 0.2, 0.48), "pelvis")
        B[f"leg{s}_b"] = ((sx * 0.42, 0.2, 0.48), (sx * 0.42, 0.3, 0.04), f"leg{s}_a")
    arm = make_armature(A + "_rig", [(n, h, t, p) for n, (h, t, p) in B.items()], col)
    mb = MB()
    seg = lambda n: (Vector(B[n][0]), Vector(B[n][1]))
    # core of root and plates around every segment
    a, b = seg("pelvis"); mb.tube([a, b], 0.3, 7, mat=1, tag="pelvis"); shell(mb, a, b, 0.32, 8, 2, "pelvis", seed=1)
    a, b = seg("chest"); mb.tube([a, b], lambda s: 0.36 + 0.14 * s, 8, mat=1, tag="chest"); shell(mb, a, b, lambda s: 0.4 + 0.16 * s, 10, 4, "chest", seed=2, size=1.1)
    plate(mb, (0, -0.55, 1.5), (0, -1, 0.1), (0, 0.15, 1), 0.7, 0.42, 0.08, "chest", 0)                   # breastplate
    mb.gem((0, -0.6, 1.5), Vector((0, 0.1, 1)), 0.42, 0.025, sides=4, mat=2, tag="chest")                 # amber seam
    for (x, y, z, ax) in ((0.28, -0.42, 1.62, (0.4, 0, 1)), (-0.3, -0.38, 1.35, (-0.3, 0, 1)), (0.2, 0.25, 1.05, (0.6, 0.2, 1))):
        mb.gem((x, y, z), Vector(ax), 0.26, 0.018, sides=4, mat=2, tag="chest" if z > 1.2 else "pelvis")      # glowing cracks
    a, b = seg("head"); plate(mb, (0, -0.55, 1.66), (0, -0.6, 0.8), (0, -1, 0.2), 0.42, 0.3, 0.1, "head", 0, sides=5)
    mb.gem((0, -0.62, 1.60), Vector((0, 0, 1)), 0.16, 0.012, sides=4, mat=2, tag="head")
    tags = ["pelvis", "chest", "head"]
    for s, sx in (("L", 1), ("R", -1)):
        for n, r, cnt, rings, sz in ((f"arm{s}_a", 0.2, 7, 3, 1.0), (f"arm{s}_b", lambda q: 0.2 + 0.07 * q, 7, 3, 1.15), (f"leg{s}_a", 0.2, 6, 2, 1.0), (f"leg{s}_b", 0.19, 6, 2, 1.0)):
            a, b = seg(n); mb.tube([a, b], (r(0.5) if callable(r) else r) * 0.85, 6, mat=1, tag=n); shell(mb, a, b, r, cnt, rings, n, seed=hash(n) % 97, size=sz); tags.append(n)
        n = f"arm{s}_c"; a, b = seg(n); tags.append(n)
        for k in range(4):                                     # knuckle stones
            mb.gem(a + Vector((sx * (k - 1.5) * 0.08, -0.06, -0.12)), Vector((0, -0.2, -1)), 0.32, 0.075, sides=6, mat=0, tag=n)
        mb.gem(seg(f"leg{s}_b")[1] + Vector((0, -0.06, 0.07)), Vector((0, -1, -0.15)), 0.42, 0.16, sides=6, mat=0, tag=f"leg{s}_b")    # foot
    # three asymmetric root ribs over the shoulders (more on her left)
    for k, (x0, curl, ln) in enumerate(((0.32, 1.0, 1.0), (0.1, 0.85, 0.9), (-0.22, 0.7, 0.75))):
        pts = [Vector((x0, 0.0, 1.85)) + Vector((0.12 * x0 * s * 3, 0.45 * s * ln, 0.6 * math.sin(math.pi * 0.6 * s) * curl * ln - 0.15 * s * s)) for s in (0, 0.25, 0.5, 0.75, 1.0)]
        mb.tube(pts, lambda s: 0.07 * (1 - 0.85 * s), 6, mat=1, tag="chest")
    body = finish(mb, A, mats, col, arm, tags)

    def gait(u, amp, lift, bob):
        P = {}
        for s, sx in (("L", 1), ("R", -1)):
            sw, up = stride(u + (0 if s == "L" else 0.5), 0.62)
            P[f"arm{s}_a"] = (Q(X, -amp * sw) @ Q(Y, 4 * sx * up), None, None)
            P[f"arm{s}_b"] = (Q(X, lift * up), None, None)
            sw2, up2 = stride(u + (0.5 if s == "L" else 0.0) + 0.06, 0.62)   # the leg of the other side follows this arm a beat later
            P[f"leg{s}_a"] = (Q(X, -0.8 * amp * sw2 - 0.6 * lift * up2), None, None)
            P[f"leg{s}_b"] = (Q(X, 1.0 * lift * up2), None, None)
        P["pelvis"] = (Q(Y, 3 * math.sin(TAU * u)), (0, 0, -bob * globals()["bob"](u, 2, 0.1)), None)       # the weight drops onto each knuckle
        P["chest"] = (Q(Z, 5 * math.sin(TAU * u - 0.6)) @ Q(X, 3 * globals()["bob"](u, 2, 0.18)), None, None)  # the shoulders roll a little after the hips
        P["head"] = (Q(X, -2.5 * globals()["bob"](u, 2, 0.26)), None, None)
        return P

    def idle(u, t):
        br = math.sin(TAU * u)
        return {"chest": (Q(X, -2.5 * br), None, None), "pelvis": (QI, (0, 0, 0.012 * br), None), "head": (Q(Z, 6 * math.sin(TAU * u + 1)), None, None),
                "armL_a": (Q(X, 1.5 * br), None, None), "armR_a": (Q(X, 1.5 * br), None, None)}

    def attack(u, t):
        up = smooth(u / 0.45) * (1 - smooth((u - 0.5) / 0.1))
        slam = smooth((u - 0.5) / 0.1) * (1 - smooth((u - 0.72) / 0.28))
        return {"armR_a": (Q(X, -165 * up - 55 * slam) @ Q(Y, -20 * up), None, None), "armR_b": (Q(X, -25 * up + 10 * slam), None, None),
                "chest": (Q(X, -14 * up + 24 * slam) @ Q(Z, -10 * up), None, None), "pelvis": (QI, (0, 0.05 * up, -0.12 * slam), None),
                "armL_a": (Q(X, 8 * slam), None, None)}

    def hit(u, t):
        k = math.sin(math.pi * min(1, u / 0.9)) * (1 - 0.3 * u)
        return {"chest": (Q(X, -16 * k) @ Q(Z, 6 * k), None, None), "head": (Q(X, -12 * k), None, None), "pelvis": (QI, (0, 0.08 * k, 0), None)}

    def death(u, t):
        knees = smooth(u / 0.45)
        fall = smooth((u - 0.3) / 0.55)
        P = {"legL_a": (Q(X, -60 * knees), None, None), "legR_a": (Q(X, -55 * knees), None, None),
             "legL_b": (Q(X, 110 * knees), None, None), "legR_b": (Q(X, 105 * knees), None, None),
             "pelvis": (Q(X, 38 * fall), (0, -0.25 * fall, -0.55 * knees - 0.12 * fall), None), "chest": (Q(X, 22 * fall), None, None),
             "head": (Q(Z, 18 * fall), None, None)}
        for s, sx in (("L", 1), ("R", -1)):
            P[f"arm{s}_a"] = (Q(X, -70 * fall) @ Q(Y, 25 * sx * fall), None, None)
            P[f"arm{s}_b"] = (Q(X, -20 * fall), None, None)
        return P

    clips = {"idle": (90, idle), "walk": (36, lambda u, t: gait(u, 22, 35, 0.04)), "run": (24, lambda u, t: gait(u, 32, 50, 0.07)),
             "attack": (42, attack), "hit": (14, hit), "death": (60, death)}
    reach = 1.0
    speeds = {"walk": 2 * reach * math.sin(math.radians(22)) / (36 / FPS * 0.62), "run": 2 * reach * math.sin(math.radians(32)) / (24 / FPS * 0.62)}
    return dict(objs=[arm, body], arm=arm, clips=clips, speeds=speeds, role="brute", height=2.25, length=1.7, glow="amber")


def build_veilbell(col):
    """MOB-001_03 Veilbell (caster): 1.65 m, a porous stone bell over hollow ribs, two planted root legs, four veil
    ribbons, a small teal light; the attack holds one charged seed (bone `seed`) before it launches."""
    A = "mob_veilbell"
    mats = [BF.tex_material(A, "Bell", stone_maps(31, (0.72, 0.69, 0.60), crack=0.35, lichen=0.3, pores=1.0), double_sided=True, size=TEX), mat_stone(A, "Root", 32, (0.43, 0.39, 0.31), crack=0.1, streak=1.0),
            mat_glow(A, (0.42, 0.85, 0.80), 6.0), BF.tex_material(A, "Veil", stone_maps(33, (0.84, 0.82, 0.74), crack=0.0, streak=0.4), double_sided=True, size=TEX),
            mat_stone(A, "Rib", 34, (0.74, 0.70, 0.60), crack=0.1)]
    B = {"root": ((0, 0, 0), (0, 0.2, 0), None), "body": ((0, 0, 0.72), (0, 0, 1.12), "root"), "bell": ((0, 0, 1.1), (0, 0, 1.65), "body"),
         "seed": ((0, -0.42, 1.0), (0, -0.42, 1.1), "body")}
    for s, sx in (("L", 1), ("R", -1)):
        B[f"leg{s}_a"] = ((sx * 0.1, 0, 0.74), (sx * 0.17, -0.06, 0.4), "body")
        B[f"leg{s}_b"] = ((sx * 0.17, -0.06, 0.4), (sx * 0.2, 0.0, 0.06), f"leg{s}_a")
    TEN = []
    for k, ang in enumerate((35, 145, -145, -35)):
        a = math.radians(ang)
        d = Vector((math.sin(a), -math.cos(a), 0))
        top = Vector((0, 0, 1.12)) + d * 0.36
        pts = [top + d * 0.05 * j + Vector((0, 0, -0.2 * j)) for j in range(4)]
        for j in range(3):
            B[f"ten{k}_{j}"] = (tuple(pts[j]), tuple(pts[j + 1]), "bell" if j == 0 else f"ten{k}_{j - 1}")
        TEN.append((k, d, pts))
    arm = make_armature(A + "_rig", [(n, h, t, p) for n, (h, t, p) in B.items()], col)
    mb = MB()
    tags = ["body", "bell", "seed"]
    # the bell: a faceted, slightly tilted hood with a pointed crown
    prof = [(0.05, 0.56), (0.13, 0.52), (0.2, 0.44), (0.25, 0.32), (0.3, 0.2), (0.37, 0.08), (0.44, -0.02), (0.46, -0.08), (0.43, -0.1)]
    NA = 18
    rows = []
    for i in range(len(prof) - 1):                      # two rows per profile step
        for q in (0.0, 0.5):
            rows.append(tuple(prof[i][k] + (prof[i + 1][k] - prof[i][k]) * q for k in (0, 1)))
    rows.append(prof[-1])
    G = [[mb.vert(Vector((r * math.sin(TAU * j / NA) * (1.0 + 0.07 * math.sin(3 * TAU * j / NA)), -r * math.cos(TAU * j / NA), 1.1 + h)), "bell") for j in range(NA)] for r, h in rows]
    import random
    rnd = random.Random(7)
    for i in range(len(G) - 1):
        for j in range(NA):
            l = (j + 1) % NA
            hole = 2 <= i <= len(G) - 4 and rnd.random() < 0.3 and (i + j) % 2 == 0      # the porous bell: open cells, no holes at the crown or rim
            if not hole:
                mb.face([G[i][j], G[i][l], G[i + 1][l], G[i + 1][j]], [(j / NA, 1 - i / len(G)), ((j + 1) / NA, 1 - i / len(G)), ((j + 1) / NA, 1 - (i + 1) / len(G)), (j / NA, 1 - (i + 1) / len(G))], 0)
    top = mb.vert((0, 0, 1.72), "bell")
    for j in range(NA):
        mb.face([G[0][(j + 1) % NA], G[0][j], top], [(0, 0.95), (1, 0.95), (0.5, 1)], 0)
    mb.gem((0, 0.02, 0.94), Z, 0.12, 0.06, sides=8, mat=2, tag="body")                    # the teal core inside the ribs (a weak point)
    mb.gem((0, -0.14, 1.1), Vector((0, -1, 0)), 0.08, 0.035, sides=6, mat=2, tag="bell")          # the teal light
    # hollow ribs around a spine
    mb.tube([(0, 0.02, 0.72), (0, 0.04, 1.12)], 0.035, 6, mat=4, tag="body")
    for i, z in enumerate((0.8, 0.88, 0.96, 1.04)):
        r = 0.13 + 0.04 * math.sin(math.pi * i / 3)
        ring = [Vector((r * math.sin(a), -r * math.cos(a) * 0.9, z + 0.02 * math.cos(a))) for a in [math.radians(x) for x in range(-150, 151, 30)]]
        mb.tube(ring, 0.014, 5, mat=4, tag="body", cap0=True, cap1=True)
    # root legs with splayed toes
    for s, sx in (("L", 1), ("R", -1)):
        a0, a1 = Vector(B[f"leg{s}_a"][0]), Vector(B[f"leg{s}_a"][1]); b1 = Vector(B[f"leg{s}_b"][1])
        mb.tube([a0, a1], lambda q: 0.05 - 0.01 * q, 6, mat=1, tag=f"leg{s}_a")
        mb.tube([a1, b1], lambda q: 0.042 - 0.008 * q, 6, mat=1, tag=f"leg{s}_b")
        for k, ang in enumerate((-60, -20, 25, 70, 160)):
            a = math.radians(ang + (0 if sx > 0 else 180))
            d = Vector((math.cos(a) * sx, math.sin(a), 0))
            mb.tube([b1, b1 + d * 0.12 + Vector((0, 0, -0.04)), b1 + d * 0.2 + Vector((0, 0, -0.06))], lambda q: 0.025 * (1 - 0.8 * q), 5, mat=1, tag=f"leg{s}_b")
        tags += [f"leg{s}_a", f"leg{s}_b"]
    # veil ribbons (bend with their chains)
    for k, d, pts in TEN:
        fine = []
        for j in range(3):
            for q in (0.0, 0.5):
                fine.append(pts[j].lerp(pts[j + 1], q))
        fine.append(pts[3] + Vector((0, 0, -0.1)))
        row = lambda i: f"ten{k}_{min(2, i // 2)}"
        ribbon(mb, fine, lambda q: 0.055 * (1 - 0.6 * q) + 0.01, row, mat=3, normal=d)
        tags += [f"ten{k}_{j}" for j in range(3)]
    mb.gem((0, -0.42, 1.05), Z, 0.16, 0.08, sides=8, mat=2, tag="seed")
    body = finish(mb, A, mats, col, arm, tags)
    SEED0 = (0.001, 0.001, 0.001)

    def tendrils(u, amp, spread=0.0):
        P = {}
        for k, d, pts in TEN:
            ax = d.cross(Z)
            for j in range(3):
                P[f"ten{k}_{j}"] = (Q(ax, amp * math.sin(TAU * u - 0.9 * j + k) + spread * (1 if j == 0 else 0.4)), None, None)
        return P

    def idle(u, t):
        P = tendrils(u, 7)
        P["bell"] = (Q(X, 4 * math.sin(TAU * u)) @ Q(Y, 3 * math.sin(TAU * u + 1)), None, None)
        P["body"] = (QI, (0, 0, 0.01 * math.sin(TAU * u)), None)
        P["seed"] = (QI, None, SEED0)
        return P

    def gait(u, amp, lift, bob):
        P = tendrils(u * 2, 10, -8)
        for s in ("L", "R"):
            sw, up = stride(u + (0 if s == "L" else 0.5), 0.6)
            P[f"leg{s}_a"] = (Q(X, -amp * sw - lift * up), None, None)
            P[f"leg{s}_b"] = (Q(X, 1.4 * lift * up), None, None)
        P["body"] = (Q(Y, 4 * math.sin(TAU * u)), (0, 0, -bob * globals()["bob"](u, 2, 0.08)), None)
        P["bell"] = (Q(X, 5 + 3 * globals()["bob"](u, 2, 0.22)) @ Q(Y, -3 * math.sin(TAU * u - 0.7)), None, None)   # the heavy bell nods after each step
        P["seed"] = (QI, None, SEED0)
        return P

    def attack(u, t):
        gather = smooth(u / 0.4)
        hold = 1 - smooth((u - 0.72) / 0.08)
        launch = smooth((u - 0.72) / 0.12)
        P = {}
        for k, d, pts in TEN:
            ax = d.cross(Z)
            front = d.y < 0
            for j in range(3):
                P[f"ten{k}_{j}"] = (Q(ax, (-55 if front else -25) * gather * (1 if j == 0 else 0.5) * (1 - 0.5 * launch)), None, None)
        P["bell"] = (Q(X, -14 * gather * hold + 10 * launch), None, None)
        g = 0.001 + gather * hold
        P["seed"] = (QI, (0, -0.9 * launch, 0.15 * launch), (g, g, g))
        return P

    def hit(u, t):
        k = math.sin(math.pi * min(1, u / 0.9)) * (1 - 0.3 * u)
        P = tendrils(u, 20 * k)
        P["bell"] = (Q(X, -18 * k), None, None)
        P["body"] = (QI, (0, 0.06 * k, 0), None)
        P["seed"] = (QI, None, SEED0)
        return P

    def death(u, t):
        f = smooth(u / 0.7)
        P = {f"ten{k}_{j}": (Q(d.cross(Z), 40 * f), None, None) for k, d, pts in TEN for j in range(3)}
        P["legL_a"] = (Q(X, -70 * f), None, None); P["legR_a"] = (Q(X, -60 * f), None, None)
        P["legL_b"] = (Q(X, 120 * f), None, None); P["legR_b"] = (Q(X, 110 * f), None, None)
        P["body"] = (Q(Y, 30 * f) @ Q(X, 20 * f), (0, 0, -0.5 * f), None)
        P["bell"] = (Q(Y, 25 * f), None, None)
        P["seed"] = (QI, None, SEED0)
        return P

    clips = {"idle": (75, idle), "walk": (32, lambda u, t: gait(u, 22, 22, 0.03)), "run": (22, lambda u, t: gait(u, 30, 30, 0.05)),
             "attack": (45, attack), "hit": (14, hit), "death": (54, death)}
    reach = 0.72
    speeds = {"walk": 2 * reach * math.sin(math.radians(22)) / (32 / FPS * 0.6), "run": 2 * reach * math.sin(math.radians(30)) / (22 / FPS * 0.6)}
    return dict(objs=[arm, body], arm=arm, clips=clips, speeds=speeds, role="caster", height=1.65, length=0.95, glow="teal",
                note="bone `seed` carries the charged seed: hidden (scale 0) except in attack, where it grows, holds and launches forward at 0.75 of the clip")


def build_crownrift(col):
    """MOB-001_04 Crownrift (elite): 2.8 m, four stilt legs and two folded blade forelimbs, a split slate crown with
    an amber hollow core, nacre flank plates, one dorsal rib."""
    A = "mob_crownrift"
    mats = [mat_nacre(A, "Nacre", 41, base=(0.86, 0.84, 0.78)), mat_stone(A, "Joint", 42, (0.24, 0.21, 0.18), crack=0.15, streak=0.5),
            mat_stone(A, "Slate", 43, (0.24, 0.26, 0.27), crack=0.5), mat_glow(A, (1.0, 0.68, 0.25), 7.0)]
    BZ = 1.55
    B = {"root": ((0, 0, 0), (0, 0.2, 0), None), "body": ((0, 0.9, BZ), (0, -0.5, BZ + 0.05), "root"),
         "neck": ((0, -0.5, BZ + 0.05), (0, -0.85, BZ + 0.55), "body"), "crown": ((0, -0.85, BZ + 0.55), (0, -1.0, BZ + 1.2), "neck")}
    LEG = []
    for s, sx in (("L", 1), ("R", -1)):
        for i, y in ((0, -0.25), (1, 0.75)):
            hip, knee, ankle, foot = (sx * 0.28, y, BZ - 0.05), (sx * 0.8, y - 0.15 + 0.3 * i, BZ + 0.62), (sx * 1.1, y - 0.1 + 0.4 * i, 0.62), (sx * 1.12, y + 0.3 * i, 0.0)
            B[f"leg{s}{i}_a"] = (hip, knee, "body"); B[f"leg{s}{i}_b"] = (knee, ankle, f"leg{s}{i}_a"); B[f"leg{s}{i}_c"] = (ankle, foot, f"leg{s}{i}_b")
            LEG.append((s, i, sx))
        B[f"blade{s}_a"] = ((sx * 0.25, -0.55, BZ - 0.05), (sx * 0.5, -0.85, BZ - 0.55), "body")
        B[f"blade{s}_b"] = ((sx * 0.5, -0.85, BZ - 0.55), (sx * 0.45, -0.35, BZ - 0.25), f"blade{s}_a")
    arm = make_armature(A + "_rig", [(n, h, t, p) for n, (h, t, p) in B.items()], col)
    mb = MB()
    seg = lambda n: (Vector(B[n][0]), Vector(B[n][1]))
    tags = ["body", "neck", "crown"]
    a, b = seg("body")
    mb.tube([a, a.lerp(b, 0.5), b], lambda s: 0.22 + 0.06 * math.sin(math.pi * s), 7, mat=1, tag="body")
    shell(mb, a, b, lambda s: 0.3 + 0.08 * math.sin(math.pi * s), 9, 5, "body", mat=0, seed=5, size=1.25, arc=(-100, 280))
    # dorsal rib, curving up and back
    pts = [Vector((0, 0.5, BZ + 0.3)) + Vector((0, 0.9 * s, 0.85 * math.sin(math.pi * 0.55 * s) - 0.1 * s)) for s in (0, 0.2, 0.4, 0.6, 0.8, 1.0)]
    mb.tube(pts, lambda s: 0.07 * (1 - 0.85 * s), 6, mat=0, tag="body")
    a, b = seg("neck"); mb.tube([a, b], 0.13, 6, mat=1, tag="neck"); shell(mb, a, b, 0.17, 6, 2, "neck", seed=6)
    # the crown: split slate blades around an amber core
    c = Vector(B["crown"][0])
    mb.gem(c + Vector((0, -0.08, 0.32)), Vector((0, -0.2, 1)), 0.5, 0.11, sides=7, mat=3, tag="crown")
    for k, (ox, h, w, lean) in enumerate(((0.2, 1.15, 0.13, 0.35), (0.11, 0.95, 0.1, 0.2), (0.05, 0.75, 0.08, 0.1))):
        for sx in (1, -1):
            plate(mb, c + Vector((sx * ox, -0.05, 0.35 + 0.25 * (2 - k))), Vector((sx, -0.3, 0)), Vector((sx * lean, -0.15, 1)), h * 0.75, w * 1.6, 0.05, "crown", 2, sides=5, offset=-0.2)
    plate(mb, c + Vector((0, -0.12, 0.05)), Vector((0, -1, 0.3)), Vector((0, -0.2, 1)), 0.45, 0.22, 0.06, "crown", 2, sides=5)
    for s, i, sx in LEG:
        for part, r in (("a", 0.075), ("b", 0.06), ("c", 0.045)):
            n = f"leg{s}{i}_{part}"; a, b = seg(n)
            mb.tube([a, b], lambda q, r=r: r * (1 - 0.35 * q), 6, mat=1, tag=n)
            if part == "a":
                shell(mb, a, b, 0.11, 4, 2, n, seed=hash(n) % 31, size=1.2)
                mb.gem(b, Vector((sx, 0, 0.3)), 0.2, 0.09, sides=7, mat=1, tag=n)                                # knee joint
                mb.gem(b + Vector((sx * 0.07, 0, 0.0)), Vector((sx, 0, 0)), 0.06, 0.05, sides=6, mat=3, tag=n)    # amber weak point
            if part == "b":
                shell(mb, a, b, 0.07, 2, 2, n, seed=hash(n) % 37, size=0.8, jitter=0.1, arc=(-30, 90))
                mb.gem(b, Vector((sx, 0, 0.2)), 0.13, 0.065, sides=6, mat=1, tag=n)                               # ankle joint
            tags.append(n)
        mb.gem(Vector(B[f"leg{s}{i}_c"][1]) + Vector((0, 0, 0.06)), Vector((0, 0, -1)), 0.16, 0.035, sides=5, mat=2, tag=f"leg{s}{i}_c")
    for s, sx in (("L", 1), ("R", -1)):
        a, b = seg(f"blade{s}_a"); mb.tube([a, b], 0.07, 6, mat=1, tag=f"blade{s}_a"); shell(mb, a, b, 0.1, 4, 2, f"blade{s}_a", seed=9)
        a, b = seg(f"blade{s}_b")
        plate(mb, a.lerp(b, 0.55) + Vector((0, 0, 0.05)), Vector((sx, 0, 0.2)), b - a + Vector((0, 0, 0.15)), 1.1, 0.2, 0.05, f"blade{s}_b", 0, sides=5, offset=0.25)
        tags += [f"blade{s}_a", f"blade{s}_b"]
    body = finish(mb, A, mats, col, arm, tags)

    def legs(u, amp, lift):
        P = {}
        for s, i, sx in LEG:
            diag = (s == "L") == (i == 0)
            sw, up = stride(u + (0 if diag else 0.5) + (0.04 if i else 0.0), 0.66)
            P[f"leg{s}{i}_a"] = (Q(X, -amp * sw) @ Q(Y, sx * 10 * up), None, None)
            P[f"leg{s}{i}_b"] = (Q(Y, -sx * lift * up), None, None)
        return P

    def idle(u, t):
        br = math.sin(TAU * u)
        P = {f"leg{s}{i}_a": (Q(X, 1.5 * br * (1 if i else -1)), None, None) for s, i, sx in LEG}
        P["body"] = (Q(X, -3 + 1.5 * br), (0, 0.04, -0.03 + 0.015 * br), None)
        P["crown"] = (Q(Z, 6 * math.sin(TAU * u + 0.8)), None, None)
        P["neck"] = (Q(X, 2 * br), None, None)
        return P

    def gait(u, amp, lift, bob):
        P = legs(u, amp, lift)
        P["body"] = (Q(Y, 2.5 * math.sin(TAU * u)), (0, 0, -bob * globals()["bob"](u, 2, 0.1)), None)
        P["neck"] = (Q(X, 3 * globals()["bob"](u, 2, 0.22)), None, None)
        P["crown"] = (Q(X, -2 * globals()["bob"](u, 2, 0.3)), None, None)
        for s, sx in (("L", 1), ("R", -1)):
            P[f"blade{s}_a"] = (Q(X, 6 * math.sin(TAU * u + (0 if s == "L" else math.pi))), None, None)
        return P

    def attack(u, t):
        load = smooth(u / 0.4) * (1 - smooth((u - 0.45) / 0.1))
        strike = smooth((u - 0.45) / 0.1) * (1 - smooth((u - 0.7) / 0.3))
        P = {"body": (Q(X, 10 * load - 8 * strike), (0, 0.15 * load - 0.25 * strike, 0.05 * load), None),
             "neck": (Q(X, 10 * load - 20 * strike), None, None), "crown": (Q(X, -15 * strike), None, None)}
        for s, sx in (("L", 1), ("R", -1)):
            P[f"blade{s}_a"] = (Q(Y, sx * 75 * load + sx * 20 * strike) @ Q(X, -40 * load - 60 * strike), None, None)
            P[f"blade{s}_b"] = (Q(X, -70 * load + 40 * strike), None, None)
        for s, i, sx in LEG:
            P[f"leg{s}{i}_a"] = (Q(X, (8 if i else -4) * load), None, None)
        return P

    def hit(u, t):
        k = math.sin(math.pi * min(1, u / 0.9)) * (1 - 0.3 * u)
        return {"body": (Q(X, 8 * k) @ Q(Y, 5 * k), (0, 0.1 * k, 0), None), "neck": (Q(X, 14 * k), None, None), "crown": (Q(Z, 10 * k), None, None)}

    def death(u, t):
        f = smooth(u / 0.75)
        P = {"body": (Q(Y, 8 * f), (0, 0, -1.05 * f), None), "neck": (Q(X, 30 * f), None, None), "crown": (Q(X, 25 * f) @ Q(Z, 15 * f), None, None)}
        for s, i, sx in LEG:
            P[f"leg{s}{i}_a"] = (Q(Y, sx * 35 * f), None, None)
            P[f"leg{s}{i}_b"] = (Q(Y, -sx * 70 * f), None, None)
        for s, sx in (("L", 1), ("R", -1)):
            P[f"blade{s}_a"] = (Q(Y, sx * 35 * f), None, None)
            P[f"blade{s}_b"] = (Q(X, -30 * f), None, None)
        return P

    clips = {"idle": (90, idle), "walk": (40, lambda u, t: gait(u, 20, 28, 0.04)), "run": (24, lambda u, t: gait(u, 28, 40, 0.07)),
             "attack": (48, attack), "hit": (14, hit), "death": (66, death)}
    reach = 1.55
    speeds = {"walk": 2 * reach * math.sin(math.radians(20)) / (40 / FPS * 0.66), "run": 2 * reach * math.sin(math.radians(28)) / (24 / FPS * 0.66)}
    return dict(objs=[arm, body], arm=arm, clips=clips, speeds=speeds, role="elite", height=2.8, length=2.6, glow="amber")


BUILDERS = {"skitter": build_skitter, "hulker": build_hulker, "veilbell": build_veilbell, "crownrift": build_crownrift}


# =================================================================== export

def export(name, info, suffix=""):
    path = os.path.join(OUT, f"mob_{name}{suffix}_raw.glb")
    ftf.select_only(info["objs"], info["objs"][0])
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True, export_tangents=True,
              export_extras=True, export_image_format="AUTO", export_cameras=False, export_lights=False, export_skins=True,
              export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True, export_frame_step=1,
              export_anim_single_armature=True, export_def_bones=False, export_all_influences=False)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as exc:
        log("export kw fallback:", exc)
        kw.pop("export_anim_single_armature", None)
        bpy.ops.export_scene.gltf(**kw)
    js = ftf.inspect_glb(path)
    log(name + suffix, "raw glb", js["bytes"], "bytes, tris", js["triangles_render"])
    return js


def stage_build(names):
    os.makedirs(OUT, exist_ok=True)
    jpath = os.path.join(OUT, "mobs.json")
    summary = json.load(open(jpath)) if os.path.exists(jpath) else {}
    for nm in names:
        sc = ftf.reset_scene()
        sc.render.fps = FPS
        col = ftf.new_collection(nm)
        t0 = time.time()
        info = BUILDERS[nm](col)
        acts = [bake_clip(info["arm"], c, fr, fn) for c, (fr, fn) in info["clips"].items()]
        stash_clips(info["arm"], acts)
        js = export(nm, info)
        mesh = info["objs"][1]
        md = mesh.modifiers.new("lod", "DECIMATE"); md.ratio = 0.55; md.use_collapse_triangulate = True
        ftf.select_only([mesh], mesh)
        while mesh.modifiers[0].name != "lod":
            bpy.ops.object.modifier_move_up(modifier="lod")
        bpy.ops.object.modifier_apply(modifier="lod")
        jm = export(nm, info, "_m")
        summary[nm] = {"file": f"mob_{nm}.glb", "phone": f"mob_{nm}_m.glb", "role": info["role"], "height_m": info["height"], "length_m": info["length"],
                       "glow": info["glow"], "tris": js["triangles_render"], "tris_m": jm["triangles_render"],
                       "clips": {c: {"frames": fr, "seconds": round(fr / FPS, 3), "loop": c in ("idle", "walk", "run")} for c, (fr, _) in info["clips"].items()},
                       "speed_m_s": {k: round(v, 2) for k, v in info["speeds"].items()}, "note": info.get("note", "")}
        log(nm, "built in %.1fs" % (time.time() - t0), summary[nm]["tris"], summary[nm]["tris_m"])
    json.dump(summary, open(jpath, "w"), indent=1)


# =================================================================== contact sheet

def stage_sheet(names):
    """Per creature: front, side, three-quarter (rest of idle) and the attack and death key poses, a 1.68 m bar
    (Iris) for scale. Workbench, textured, orthographic."""
    from PIL import Image, ImageDraw
    rows = []
    for nm in names:
        sc = ftf.reset_scene()
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, f"mob_{nm}_raw.glb"))
        arm = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"][0]
        meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        sc.render.engine = "BLENDER_WORKBENCH"; sh = sc.display.shading; sh.light = "STUDIO"; sh.color_type = "TEXTURE"
        sh.show_cavity = True; sc.display.render_aa = "8"; sc.view_settings.view_transform = "Standard"
        w = bpy.data.worlds.new("w"); sc.world = w; w.color = (0.78, 0.77, 0.74)
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam; cam.data.type = "ORTHO"
        bar = ftf.link(bpy.data.objects.new("iris_bar", bpy.data.meshes.new("bar")))
        import bmesh
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(bar.data); bm.free()
        bar.scale = (0.08, 0.08, 1.68); bar.location = (0, 0, 0.84)
        H = json.load(open(os.path.join(OUT, "mobs.json")))[nm]["height_m"]
        size = max(H, 1.68) * 1.25
        acts = {a.name.split("|")[-1]: a for a in bpy.data.actions}
        shots = []
        for label, act, frac, az in (("front", "idle", 0, 0), ("side", "idle", 0, 90), ("3/4", "idle", 0, 35), ("walk", "walk", 0.25, 60), ("attack", "attack", 0.55, 60), ("death (last)", "death", 1.0, 60)):
            a = next((v for k, v in acts.items() if k.startswith(act)), None)
            arm.animation_data_create(); arm.animation_data.action = a
            f0, f1 = a.frame_range
            sc.frame_set(int(round(f0 + (f1 - f0) * frac)))
            azr = math.radians(az)
            bar.location = (math.cos(azr) * size * 0.42, math.sin(azr) * size * 0.42, 0.84)     # beside her, on the camera's right
            cam.data.ortho_scale = size
            cam.location = (math.sin(azr) * 10, -math.cos(azr) * 10, size * 0.42)
            cam.rotation_euler = (math.pi / 2, 0, azr)
            sc.render.resolution_x = sc.render.resolution_y = 420
            p = os.path.join(OUT, f"_shot_{nm}_{len(shots)}.png"); sc.render.filepath = p
            bpy.ops.render.render(write_still=True); shots.append((label, p))
        rows.append((nm, shots))
    W = 420
    img = Image.new("RGB", (W * 6, (W + 24) * len(rows)), (240, 238, 232)); d = ImageDraw.Draw(img)
    for r, (nm, shots) in enumerate(rows):
        for c, (label, p) in enumerate(shots):
            img.paste(Image.open(p).convert("RGB"), (c * W, r * (W + 24) + 24))
            d.text((c * W + 6, r * (W + 24) + 6), f"mob_{nm}  {label}  (bar = Iris 1.68 m)" if c == 0 else label, fill=(40, 40, 40))
    out = os.path.join(OUT, "mobs_sheet.jpg"); img.save(out, quality=88); log("sheet", out)


if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["build"]
    stage, names = a[0], (a[1:] or list(BUILDERS))
    {"build": stage_build, "sheet": stage_sheet}[stage](names)

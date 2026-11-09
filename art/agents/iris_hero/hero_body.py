"""Iris athletic body silhouette pass (owner brief 09.11: "the body one to one with the reference").

Adapted from the owner's shape-key script `owner_body_shape_target.py` for the MPFB body in the
agent rest stance. Differences from that script:
- heights are fractions of the body height H measured on MakeHuman anatomy (the owner's bbox
  bands sat about 6 % of H too low for this mesh: its "glute" band was the upper thigh);
- front/back and inner/outer are measured per height slice and per region (torso, left leg,
  right leg), not on the whole bounding box, so the toes, the bust and the hanging arms never
  skew the masks;
- only torso and leg vertices move (by their dominant bone), so the arms 14 deg off the body are
  never pushed out with the hips;
- in this mesh the back is +Y (the owner's script assumed -Y);
- shoulder width comes from MakeHuman targets instead (moves the arm with the shoulder).

Pure Python on (x, y, z) tuples so it can be tested without Blender; the build applies the
returned offsets to the body before the rig is bound (weights are per vertex, so the rig is kept).
"""

import os

# Offsets in metres for a 1.70 m body (scaled with H); peak values at the centre of each band.
FEM = {
    "waist_in": 0.020,        # each side, at the sides of the waist
    "underbust_in": 0.008,
    "ribcage_in": 0.004,
    "pelvis_out": 0.008,      # each side, the lateral hip line above the trochanter
    "hip_out": 0.012,         # each side, at the widest point of the seat
    "glute_back": 0.024,      # projection of the seat, upper and central volume
    "glute_up": 0.006,        # lift
    "lower_back_in": 0.010,   # the S-curve from the lower back into the seat
    "outer_thigh_out": 0.006,
    "inner_thigh_in": 0.004,  # cleaner inner thigh, no forced gap
    "thigh_front": 0.004,     # a soft front of the upper thigh
    "calf_out": 0.003,        # slim calves, not weak
    "chest_front": 0.005,
}

# Band centres and half widths as fractions of H (MakeHuman female, feet on the ground).
BANDS = {
    "ribcage": (0.700, 0.050), "underbust": (0.685, 0.035), "chest": (0.725, 0.045),
    "waist": (0.625, 0.050), "lower_back": (0.600, 0.045),
    "pelvis": (0.545, 0.045), "hip": (0.505, 0.060), "glute": (0.505, 0.065),
    "upper_thigh": (0.430, 0.065), "calf": (0.205, 0.070),
}

TORSO = ("pelvis", "spine", "chest")


def strength():
    return float(os.environ.get("IRIS_FEM", "1.0"))


def clamp01(x):
    return 0.0 if x < 0.0 else 1.0 if x > 1.0 else x


def smoothstep(e0, e1, x):
    t = clamp01((x - e0) / (e1 - e0))
    return t * t * (3.0 - 2.0 * t)


def band(name, zn):
    c, h = BANDS[name]
    d = abs(zn - c)
    if d >= h:
        return 0.0
    t = 1.0 - d / h
    return t * t * (3.0 - 2.0 * t)


def region(dom):
    if dom in TORSO:
        return "torso"
    if dom in ("thigh_L", "shin_L"):
        return "leg_L"
    if dom in ("thigh_R", "shin_R"):
        return "leg_R"
    return None


def slice_stats(cos, doms, H, step=0.02):
    """Per (region, height bin): centre x/y and half width/depth of the cross-section."""
    acc = {}
    for (x, y, z), d in zip(cos, doms):
        r = region(d)
        if r is None:
            continue
        k = (r, int(z / H / step))
        a = acc.setdefault(k, [1e9, -1e9, 1e9, -1e9])
        a[0], a[1] = min(a[0], x), max(a[1], x)
        a[2], a[3] = min(a[2], y), max(a[3], y)
    out = {}
    for k, (x0, x1, y0, y1) in acc.items():
        out[k] = ((x0 + x1) / 2, (y0 + y1) / 2, max((x1 - x0) / 2, 1e-4), max((y1 - y0) / 2, 1e-4))
    return out


def offsets(cos, doms, s=None, step=0.02):
    """Offset (dx, dy, dz) per vertex. cos: (x, y, z) in metres, feet at z = 0; doms: agent bone names."""
    s = strength() if s is None else s
    H = max(c[2] for c in cos)
    k = H / 1.70 * s
    F = {n: v * k for n, v in FEM.items()}
    st = slice_stats(cos, doms, H, step)
    res = []
    for (x, y, z), d in zip(cos, doms):
        r = region(d)
        if r is None:
            res.append((0.0, 0.0, 0.0))
            continue
        zn = z / H
        cx, cy, hx, hy = st[(r, int(zn / step))]
        side = 1.0 if x >= 0.0 else -1.0
        back = smoothstep(-0.15, 0.65, (y - cy) / hy)            # 1 on the back half, 0 at the front
        front = smoothstep(-0.15, 0.65, (cy - y) / hy)
        dx = dy = dz = 0.0
        if r == "torso":
            u = abs(x - cx) / hx                                   # 0 centre, 1 at the side
            sides = smoothstep(0.25, 0.95, u)
            centre = 1.0 - smoothstep(0.20, 0.60, u)
            seat = smoothstep(0.05, 0.30, u) * (1.0 - smoothstep(0.85, 1.05, u))   # each cheek, not the midline
            dx -= side * (F["waist_in"] * band("waist", zn) + F["underbust_in"] * band("underbust", zn)
                          + F["ribcage_in"] * band("ribcage", zn)) * sides * u
            dx += side * (F["pelvis_out"] * band("pelvis", zn) + F["hip_out"] * band("hip", zn)) * sides
            g = band("glute", zn) * back
            dy += F["glute_back"] * g * (0.45 + 0.55 * seat)
            dz += F["glute_up"] * g * seat
            dy -= F["lower_back_in"] * band("lower_back", zn) * back * centre
            dy -= F["chest_front"] * band("chest", zn) * front * (1.0 - smoothstep(0.55, 0.95, u))
        else:
            # u > 0 on the outer side of the leg, < 0 on the inner side
            u = (abs(x) - abs(cx)) / hx
            outer = smoothstep(0.2, 0.9, u)
            inner = smoothstep(0.2, 0.9, -u)
            ut = band("upper_thigh", zn)
            dx += side * (F["outer_thigh_out"] * ut * outer - F["inner_thigh_in"] * ut * inner)
            dy -= F["thigh_front"] * ut * front
            g = band("glute", zn) * back                           # the seat continues over the top of the thigh
            dy += F["glute_back"] * g * 0.75 * (1.0 - inner)
            dz += F["glute_up"] * g * (1.0 - inner)
            dx += side * F["hip_out"] * band("hip", zn) * outer
            c = band("calf", zn)
            dx += side * F["calf_out"] * c * outer
            dy += F["calf_out"] * c * back
        res.append((dx, dy, dz))
    return res


def smooth_field(off, edges, iters=8, factor=0.5):
    """Laplacian smoothing of the offset field over mesh edges: the torso and leg formulas meet at the
    seat fold and the height bins are 2 cm, so the raw field has small steps; smoothing the offsets
    (not the mesh) removes them without blurring the body's own detail."""
    n = len(off)
    nb = [[] for _ in range(n)]
    for a, b in edges:
        nb[a].append(b)
        nb[b].append(a)
    cur = [list(o) for o in off]
    for _ in range(iters):
        nxt = []
        for i in range(n):
            if not nb[i]:
                nxt.append(cur[i])
                continue
            m = [sum(cur[j][c] for j in nb[i]) / len(nb[i]) for c in range(3)]
            nxt.append([cur[i][c] + factor * (m[c] - cur[i][c]) for c in range(3)])
        cur = nxt
    return [tuple(o) for o in cur]

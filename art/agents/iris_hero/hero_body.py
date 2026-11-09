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
    "pelvis_out": 0.004,      # each side, the lateral hip line above the trochanter
    "hip_out": 0.000,         # each side, at the widest point of the seat (the reference: hips about as wide as the shoulders)
    "glute_back": 0.016,      # projection of the seat, upper and central volume
    "glute_up": 0.006,        # lift
    "lower_back_in": 0.006,   # the S-curve from the lower back into the seat
    "outer_thigh_out": 0.006,
    "inner_thigh_in": 0.000,  # (owner script: a cleaner inner thigh; replaced by inner_touch below)
    "inner_touch": 0.000,     # owner 09.11: the inner thighs meet from the crotch down to about 0.41 H
    "thigh_front": 0.004,     # a soft front of the upper thigh
    "calf_out": 0.003,        # slim calves, not weak
    "chest_front": 0.005,
}

# Band centres and half widths as fractions of H (MakeHuman female, feet on the ground).
BANDS = {
    "ribcage": (0.700, 0.050), "underbust": (0.685, 0.035), "chest": (0.725, 0.045),
    "waist": (0.625, 0.050), "lower_back": (0.640, 0.040),   # the curve sits at the waist, above the seat
    "pelvis": (0.545, 0.045), "hip": (0.505, 0.060), "glute": (0.525, 0.080),
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


def round_band(name, zn, p=4):
    """A flat-topped band (super-Gaussian): the seat keeps its volume over most of its height, so the side
    profile is one round arc instead of a cone (owner 09.11: "keep the roundness")."""
    c, h = BANDS[name]
    return 2.718281828 ** (-((abs(zn - c) / (0.62 * h)) ** p))


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
            g = round_band("glute", zn) * back
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
            g = round_band("glute", zn) * back                     # the seat continues over the top of the thigh
            dy += F["glute_back"] * g * 0.40 * (1.0 - inner)
            dz += F["glute_up"] * g * (1.0 - inner)
            dx += side * F["hip_out"] * band("hip", zn) * outer
            c = band("calf", zn)
            dx += side * F["calf_out"] * c * outer
            dy += F["calf_out"] * c * back
        res.append((dx, dy, dz))
    return res


def inner_fill(cos, doms, s=None, step=0.02, z_full=0.43, z_none=0.30):
    """Owner 09.11 (marked on a render): the inner thighs meet from the crotch down to about 0.41 H, as in
    the reference. The inner half of each thigh slice is widened toward the midline so its inner edge
    stops a half gap (inner_touch) short of it: full above z_full, fading out by z_none (in the reference a narrow gap opens below 0.41 H and widens to the knees). Kept apart from
    offsets() because the strong smoothing there would eat most of it (the field is smooth along the
    leg already; the build smooths it lightly)."""
    s = strength() if s is None else s
    H = max(c[2] for c in cos)
    half = FEM["inner_touch"] * H / 1.70
    st = slice_stats(cos, doms, H, step)
    edge = {}                                                      # the true inner edge (min |x|) per slice
    for (x, y, z), d in zip(cos, doms):
        r = region(d)
        if r in ("leg_L", "leg_R"):
            k = (r, int(z / H / step))
            edge[k] = min(edge.get(k, 1e9), abs(x))
    res = []
    for (x, y, z), d in zip(cos, doms):
        r = region(d)
        zn = z / H
        if r not in ("leg_L", "leg_R") or zn < z_none:
            res.append((0.0, 0.0, 0.0))
            continue
        k = (r, int(zn / step))
        cx = st[k][0]
        gap = edge[k] - half
        u = (abs(x) - abs(cx)) / max(abs(cx) - edge[k], 1e-4)      # -1 at the inner edge
        u = max(u, -1.0)
        if gap <= 0.0 or u >= 0.0:
            res.append((0.0, 0.0, 0.0))
            continue
        side = 1.0 if x >= 0.0 else -1.0
        t = smoothstep(z_none, z_full, zn) * s
        res.append((-side * gap * t * (-u) ** 1.5, 0.0, 0.0))     # the inner edge moves the full gap, the centre not at all
    return res


# The reference's side view, measured on its back line relative to the back of the thigh at 0.36 H
# (fractions of H): lower back -0.005 at 0.63, seat peak +0.029 at 0.51, fold +0.013 at 0.455.
SEAT = {
    "z_anchor": 0.360, "z_fold": 0.455, "z_peak": 0.510, "z_lumbar": 0.630,
    "fold": 0.010, "peak": 0.052, "lumbar": -0.006,   # owner 09.11: "as in the reference" (its close-ups read fuller than the full-body view)
    "round": 0.62,       # arc exponent: 0.5 = an ellipse, higher = fuller shoulders on the arc
    "fade": 0.05,        # above the lumbar point and below the fold the change fades out over this height
    # each cheek is its own convex dome (owner 09.11: "no squareness, firm and convex"): the push is the
    # full profile change at the cheek centre and falls off as an ellipse toward the cleft and the side
    "cheek_x": 0.062,    # cheek centre from the midline, metres at 1.70 m
    "cheek_rx": 0.080,   # the dome's half width
    "fold_lift": 0.030,  # the fold rises toward the outside (a curved fold, a rounded lower-outer corner), H
}


def seat_profile(cos, doms, s=None, step=0.01):
    """Owner 09.11, "keep the roundness": the side profile of the back from the fold under the seat to the
    lower back is fitted to the reference's: one round arc (two quarter ellipses) through the seat's peak,
    anchored on the back of the thigh. Measured on the current back line (the furthest-back vertex of each
    1 cm slice within the two cheeks); back-side vertices move by the difference, the most at the cheek
    centres, nothing at the sides or the front."""
    s = strength() if s is None else s
    H = max(c[2] for c in cos)
    k = H / 1.70
    xr = 0.11 * k                                                  # the cheeks' half span
    yb = {}
    for (x, y, z), d in zip(cos, doms):
        if region(d) is None or abs(x) > xr:
            continue
        b = int(z / H / step)
        yb[b] = max(yb.get(b, -1e9), y)

    def back_at(zn):
        b = int(zn / step)
        return yb.get(b, yb.get(b + 1, yb.get(b - 1, 0.0)))

    P = SEAT
    y_t = back_at(P["z_anchor"])
    zf, zp, zl, e, fd = P["z_fold"], P["z_peak"], P["z_lumbar"], P["round"], P["fade"]
    y_f, y_p, y_l = (y_t + P[n] * H for n in ("fold", "peak", "lumbar"))

    def target(zn):
        if zp <= zn <= zl:
            t = (zn - zp) / (zl - zp)
            return y_l + (y_p - y_l) * max(0.0, 1.0 - t * t) ** e
        t = (zp - zn) / (zp - zf)
        return y_f + (y_p - y_f) * max(0.0, 1.0 - t * t) ** e

    def delta(zn):
        if zf <= zn <= zl:
            return target(zn) - back_at(zn)
        if zl < zn < zl + fd:
            return (target(zl) - back_at(zl)) * (1.0 - smoothstep(zl, zl + fd, zn))
        if zf - fd < zn < zf:
            return (target(zf) - back_at(zf)) * smoothstep(zf - fd, zf, zn)
        return 0.0

    st = slice_stats(cos, doms, H, 0.02)
    res = []
    for (x, y, z), d in zip(cos, doms):
        r = region(d)
        zn = z / H
        ux = (abs(x) - P["cheek_x"] * k) / (P["cheek_rx"] * k)       # 0 at the cheek centre, +-1 at its edges
        if zn < zp:                                                # outer parts of the lower seat act as if lower:
            zn_eff = zn - P["fold_lift"] * max(0.0, ux) ** 2      # the fold curves up toward the hip
        else:
            zn_eff = zn
        dl = delta(zn_eff) if r is not None else 0.0
        if dl == 0.0:
            res.append((0.0, 0.0, 0.0))
            continue
        dl = max(-0.025 * k, min(0.050 * k, dl)) * s
        cx, cy, hx, hy = st[(r, int(zn / 0.02))]
        back = smoothstep(0.0, 0.85, (y - cy) / hy)               # only the back surface
        if dl > 0.0 and zn < zl:                                   # added volume: a dome per cheek (never a flat slab)
            wx = max(0.0, 1.0 - ux * ux) ** 0.5
        else:                                                      # the lower back and trimming: across the back
            wx = 1.0 - smoothstep(0.6 * xr, 1.25 * xr, abs(x))
        res.append((0.0, dl * back * wx, 0.0))
    return res


CHEEK = {
    "z": 0.522,          # dome centre height, fraction of H
    "x": 0.060,          # dome centre from the midline, metres at 1.70 m
    "rx": 0.080, "ry": 0.088, "rz": 0.096,   # dome radii (across, depth, height), metres at 1.70 m
    "inflate": 0.75,     # inside the dome: how far a vertex moves to the dome surface (1 = all the way)
    "trim": 0.55,        # just outside, below the centre: how far it is pulled in (rounds the lower-outer corner)
    "trim_r": 1.35,      # ... up to this dome radius
}


def cheek_domes(cos, doms, s=None):
    """Owner 09.11: "the seat has square corners; it must be firm and convex". Each cheek is fitted to an
    ellipsoid whose back-most point is the seat's current back line (so the profile and its projection stay):
    back-surface vertices inside it move out to its surface (a convex, round, firm surface instead of a
    flat slab), vertices just outside it below its centre are pulled toward it (a curved fold and a rounded
    lower-outer corner instead of a square one). Nothing moves near the cleft (the two domes meet there),
    at the front, or above the dome."""
    s = strength() if s is None else s
    C = CHEEK
    H = max(c[2] for c in cos)
    k = H / 1.70
    cz, cxo = C["z"] * H, C["x"] * k
    rx, ry, rz = C["rx"] * k, C["ry"] * k, C["rz"] * k
    yb = -1e9
    for (x, y, z), d in zip(cos, doms):                            # the seat's back line at the dome centre
        if region(d) is not None and abs(z - cz) < 0.01 * H and abs(abs(x) - cxo) < 0.02 * k:
            yb = max(yb, y)
    cy = yb - ry
    res = []
    for (x, y, z), d in zip(cos, doms):
        if region(d) is None or y <= cy or abs(x) < 1e-6:
            res.append((0.0, 0.0, 0.0))
            continue
        side = 1.0 if x > 0 else -1.0
        qx, qy, qz = (x - side * cxo) / rx, (y - cy) / ry, (z - cz) / rz
        r = (qx * qx + qy * qy + qz * qz) ** 0.5
        if r < 1e-6:
            res.append((0.0, 0.0, 0.0))
            continue
        if r < 1.0:
            g = C["inflate"] * smoothstep(0.35, 0.8, r)            # deep points (inside the body) barely move
        elif r < C["trim_r"] and z < cz:
            g = C["trim"] * (1.0 - smoothstep(1.0, C["trim_r"], r)) * smoothstep(0.0, 0.6, (cz - z) / rz)
        else:
            res.append((0.0, 0.0, 0.0))
            continue
        g *= smoothstep(0.004 * k, 0.030 * k, abs(x)) * s          # nothing at the cleft
        m = (r + (1.0 - r) * g) / r - 1.0                          # along the ray from the centre: r -> r + (1 - r) g
        res.append(((x - side * cxo) * m, (y - cy) * m, (z - cz) * m))
    return res


SIDE = {"z": 0.490, "h": 0.050, "amount": 0.009}   # fractions of H / metres at 1.70 m


def side_fill(cos, doms, s=None):
    """Owner 09.11 (arrow on a render): a hollow where the lower seat turns into the side of the hip. The
    posterolateral surface (outer and back at once) at the height of the lower seat is pushed out and back,
    so the cheek runs into the hip as one convex surface."""
    s = strength() if s is None else s
    H = max(c[2] for c in cos)
    k = H / 1.70
    st = slice_stats(cos, doms, H, 0.02)
    res = []
    for (x, y, z), d in zip(cos, doms):
        r = region(d)
        zn = z / H
        if r is None or abs(zn - SIDE["z"]) > 2.5 * SIDE["h"]:
            res.append((0.0, 0.0, 0.0))
            continue
        cx, cy, hx, hy = st[(r, int(zn / 0.02))]
        side = 1.0 if x >= 0.0 else -1.0
        u = (abs(x) - abs(cx)) / hx if r != "torso" else abs(x - cx) / hx   # outward across the slice
        b = (y - cy) / hy                                                      # backward
        w = smoothstep(0.15, 0.75, u) * smoothstep(-0.35, 0.35, b) * (1.0 - smoothstep(0.6, 1.0, b))
        w *= 2.718281828 ** (-((zn - SIDE["z"]) / SIDE["h"]) ** 2)
        a = SIDE["amount"] * k * w * s
        res.append((side * a * 0.75, a * 0.66, 0.0))
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

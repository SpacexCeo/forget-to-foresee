"""Iris athletic body: anatomical volume pass (owner brief 09.11, "critical body anatomy correction").

Replaces the earlier height-band bumps (seat profile, cheek domes, side fill): volume is added along the
surface normal per muscle region, the way an inflate brush works, so a region gains volume posteriorly and
laterally at once and stays round. Regions are placed from anatomical landmarks (the hip joint = femoral
head, the knee, the sacrum) and gated by the MPFB bone weights, never by bounding-box height percentages:

- gluteus maximus: centred behind and just below the femoral head, the full rounded mass of the seat; it
  falls off quickly into the fold under it and slowly up to the sacrum;
- gluteus medius: above the greater trochanter on the side of the pelvis, the lateral hip curve that joins
  the pelvis to the upper outer thigh;
- quadriceps, hamstrings, adductors: along the femur from the hip joint toward the knee, each on the side
  of the thigh its normal faces (front, back, inner), so the upper thigh balances the seat and tapers to
  the knee;
- flank (external oblique, above the iliac crest): taken in, so the waist stays narrow low and the hips
  flare below it (the reference's waist-to-hip transition);
- knee: vastus medialis and lateralis just above the knee (a natural taper, not a thin knee);
- lumbar: a little depth taken out of the small of the back between the iliac crest and the lower ribs
  (no pelvis rotation, no posture change).

Pure Python on tuples so it can be tested without Blender. Joints and the vertex groups stay where they
are (the femoral heads and the leg bones are not moved); only the skin surface changes.
"""

import json
import math
import os

# Peak displacement along the normal, metres at a 1.70 m body; IRIS_ANAT='{"gmax": 0.02}' overrides any of them.
AMOUNT = {
    "gmax": 0.075,
    "gmed": 0.003,        # subtle: the reference's pelvis is narrow above the trochanter
    "quad": 0.008,
    "ham": 0.008,
    "add": 0.006,
    "lumbar": -0.020,     # negative = filled: the reference's lower back is 2.5 cm shallower (no exaggerated S)
    "flank": 0.050,       # taken out: the reference stays narrow down to about 0.58 H, then flares
    "knee": 0.010,        # vastus medialis and lateralis above the knee
}

# Region shapes in landmark coordinates (metres at 1.70 m): lat = lateral offset from the hip joint's
# x (negative = toward the midline), dz = height above the hip joint, t = 0 at the hip joint, 1 at the knee.
SHAPE = {
    "gmax": {"lat": -0.025, "dz": -0.060, "r_lat": 0.070, "r_up": 0.075, "r_down": 0.050},
    "gmed": {"lat": 0.030, "dz": 0.050, "r_lat": 0.045, "r_z": 0.045},
    "quad": {"t": 0.55, "r_t": 0.35},
    "ham": {"t": 0.40, "r_t": 0.28, "t_min": 0.12},
    "add": {"t": 0.22, "r_t": 0.20},
    "lumbar": {"dz": 0.150, "r_z": 0.070, "r_x": 0.045},   # the spine groove only: the waist keeps its curve at 45 degrees
    "flank": {"dz": 0.085, "r_z": 0.070},
    "knee": {"t": 0.85, "r_t": 0.15},
}

GATE = {
    "gmax": ("pelvis", "upperleg01", "spine05"),
    "gmed": ("pelvis", "upperleg01", "spine05", "spine04"),
    "quad": ("upperleg01", "upperleg02"),
    "ham": ("upperleg01", "upperleg02"),
    "add": ("upperleg01", "upperleg02", "pelvis"),
    "lumbar": ("spine05", "spine04", "spine03"),
    "flank": ("spine05", "spine04", "spine03", "pelvis"),
    "knee": ("upperleg02", "lowerleg01"),
}


def amounts():
    a = dict(AMOUNT)
    a.update(json.loads(os.environ.get("IRIS_ANAT", "{}")))
    return a


def smoothstep(e0, e1, x):
    t = (x - e0) / (e1 - e0)
    t = 0.0 if t < 0.0 else 1.0 if t > 1.0 else t
    return t * t * (3.0 - 2.0 * t)


def gauss(d):
    return math.exp(-d * d)


def gate(weights, names):
    """Sum of the vertex's MPFB weights over the bones of a region (both sides), clamped to 1."""
    s = 0.0
    for g, w in weights.items():
        base = g[:-2] if g.endswith((".L", ".R")) else g
        if base in names:
            s += w
    return min(1.0, s)


def landmarks(joints):
    """Hip joints, knees and the sacrum from the MPFB joint positions (head, tail per bone)."""
    J = {n: (tuple(h), tuple(t)) for n, (h, t) in joints.items()}
    L = {}
    for s in ("L", "R"):
        L["hip_" + s] = J["upperleg01." + s][0]
        L["knee_" + s] = J["lowerleg01." + s][0]
    L["sacrum"] = J["spine05"][1]
    return L


def offsets(cos, normals, weights, joints, H, a=None):
    """Displacement per vertex: the sum of each region's push along the vertex normal.
    cos, normals: (x, y, z) per vertex (the body faces -Y, Z up); weights: {group: weight} per vertex."""
    a = amounts() if a is None else a
    L = landmarks(joints)
    k = H / 1.70
    res = []
    for (x, y, z), (nx, ny, nz), w in zip(cos, normals, weights):
        s = "L" if x >= 0 else "R"
        side = 1.0 if x >= 0 else -1.0
        hx, hy, hz = L["hip_" + s]
        kz = L["knee_" + s][2]
        lat = abs(x) - abs(hx)                    # + outward from the hip joint
        dz = z - hz
        n_back = ny                               # + facing back
        n_out = side * nx                         # + facing outward
        d = 0.0
        # gluteus maximus: behind the joint, posterior and posterolateral normals
        g = SHAPE["gmax"]
        rz = g["r_up"] if dz > g["dz"] else g["r_down"]
        m = gauss((lat - g["lat"] * k) / (g["r_lat"] * k)) * gauss((dz - g["dz"] * k) / (rz * k))
        m *= smoothstep(-0.15, 0.55, n_back) * smoothstep(-0.02, 0.03, y - hy)
        d += a["gmax"] * m * gate(w, GATE["gmax"])
        # gluteus medius: above the trochanter, lateral normals
        g = SHAPE["gmed"]
        m = gauss((lat - g["lat"] * k) / (g["r_lat"] * k)) * gauss((dz - g["dz"] * k) / (g["r_z"] * k))
        m *= smoothstep(0.1, 0.7, n_out) * smoothstep(-0.5, 0.0, n_back)
        d += a["gmed"] * m * gate(w, GATE["gmed"])
        # thigh: along the femur, by the side the normal faces
        t = (hz - z) / max(hz - kz, 1e-6)
        if -0.1 < t < 1.1:
            g = SHAPE["quad"]
            m = gauss((t - g["t"]) / g["r_t"]) * smoothstep(0.0, 0.6, -n_back + 0.3 * n_out)
            m *= smoothstep(0.03, 0.18, t)                         # below the groin: never the lower belly
            d += a["quad"] * m * gate(w, GATE["quad"])
            g = SHAPE["ham"]
            m = gauss((t - g["t"]) / g["r_t"]) * smoothstep(0.1, 0.6, n_back) * smoothstep(g["t_min"] - 0.06, g["t_min"] + 0.06, t)
            d += a["ham"] * m * gate(w, GATE["ham"])
            g = SHAPE["add"]
            m = gauss((t - g["t"]) / g["r_t"]) * smoothstep(0.2, 0.7, -n_out)
            d += a["add"] * m * gate(w, GATE["add"])
            g = SHAPE["knee"]
            m = gauss((t - g["t"]) / g["r_t"]) * smoothstep(-0.2, 0.3, -n_back + abs(nx))   # sides and front
            d += a["knee"] * m * gate(w, GATE["knee"])
        # lumbar: a little depth out of the small of the back (a negative push along back-facing normals)
        g = SHAPE["lumbar"]
        m = gauss((dz - g["dz"] * k) / (g["r_z"] * k)) * gauss(x / (g["r_x"] * k)) * smoothstep(0.3, 0.8, n_back)
        d -= a["lumbar"] * m * gate(w, GATE["lumbar"])
        # flank: the side of the waist above the iliac crest (external oblique), lateral normals, taken in
        g = SHAPE["flank"]
        m = gauss((dz - g["dz"] * k) / (g["r_z"] * k)) * smoothstep(0.3, 0.85, n_out + 0.4 * max(0.0, n_back))
        d -= a["flank"] * m * gate(w, GATE["flank"])                # side and back-side (seen at 45 degrees)
        d *= k
        res.append((nx * d, ny * d, nz * d))
    return res


def smooth_field(off, edges, iters=6, factor=0.5):
    """Laplacian smoothing of the displacement field over mesh edges (the mesh's own detail is kept)."""
    n = len(off)
    nb = [[] for _ in range(n)]
    for i, j in edges:
        nb[i].append(j)
        nb[j].append(i)
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

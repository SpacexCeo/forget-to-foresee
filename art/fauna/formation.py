"""Glyph-mote formation and orbit maths (pure Python, no Blender).

Shared by art/fauna/build_fauna.py (the baked "orbit" / "assemble" demo clips of
fauna_glyphmote.glb) and by `python3 art/fauna/formation.py`, which writes
game/public/assets/vfx/glyphmote_formation.json for the GPU-instanced runtime.

The logogram geometry follows the reference glyph of prototype-2d/index.html
(FORM_PATH / glyph()): a ring of radius 34 SVG units, four stroke forms (arc,
spike, loop, drop) drawn outside the ring at slot p rotated p * 90 degrees
clockwise from the top, reading-start dots in a row across the core, and an
optional dashed key ring at radius 40. Here one formation unit = the ring radius.

Formation frame: x right, y up, the sign faces +z (towards the viewer). The
runtime scales it by `scale_m` and places it in front of a Shell.
"""

import json
import math
import os
import random

SVG_R = 34.0
POOL = 96
RING_N = 40
STROKE_N = 9
DOTS_MAX = 3
KEY_N = 16
FORMS = ["arc", "spike", "loop", "drop"]

# Indices into the 96-mote pool (stable: the runtime keeps one InstancedMesh per Shell).
ROLE_RANGES = {
    "ring": (0, RING_N),
    "slot0": (40, 49), "slot1": (49, 58), "slot2": (58, 67), "slot3": (67, 76),
    "dots": (76, 79),
    "key": (79, 95),
    "spare": (95, 96),
}

# Orbit around a Shell (metres, relative to the Shell centre = Shell pivot + 9 m up).
ORBIT = {
    "period_s": 24.0,
    "bands": [
        {"radius_m": 11.0, "incline_deg": 12.0, "node_deg": 0.0, "laps": 1, "count": 32},
        {"radius_m": 12.6, "incline_deg": -17.0, "node_deg": 70.0, "laps": -1, "count": 32},
        {"radius_m": 14.2, "incline_deg": 24.0, "node_deg": 140.0, "laps": 2, "count": 32},
    ],
    "radial_jitter_m": 0.9,
    "bob_m": 0.45,
    "bob_harmonic": 3,
}
FORMATION_CENTER_M = (0.0, 0.0, 13.0)   # in front of the Shell (Shell local +Z faces the plaza)
FORMATION_SCALE_M = 3.0                 # ring radius in metres
ASSEMBLE = {
    "duration_s": 4.0,
    "flight_s": 1.6,
    "ease": "easeInOutCubic",
    "arc_lift": 0.35,       # of the flight distance, along +y
    "approach_m": 2.0,      # last control point sits this far in front (+z) of the target
    "settle_overshoot": 0.06,
}


def _bez2(p0, c, p1, t):
    u = 1 - t
    return (u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1])


def _bez3(p0, c0, c1, p1, t):
    u = 1 - t
    return tuple(u ** 3 * p0[i] + 3 * u * u * t * c0[i] + 3 * u * t * t * c1[i] + t ** 3 * p1[i] for i in range(2))


def _svg(p):
    """SVG units (y down) -> formation units (y up, ring radius 1)."""
    return (p[0] / SVG_R, -p[1] / SVG_R)


def _with_tangent(pts, closed=False):
    out = []
    n = len(pts)
    for i, p in enumerate(pts):
        a = pts[(i - 1) % n] if closed or i > 0 else p
        b = pts[(i + 1) % n] if closed or i < n - 1 else p
        out.append([round(p[0], 4), round(p[1], 4), round(math.atan2(b[1] - a[1], b[0] - a[0]), 4)])
    return out


def stroke_templates():
    """Nine motes per stroke form for slot 0 (top). [x, y, angle] in formation units;
    angle = direction of the mote's long axis in the plane, radians from +x."""
    t = {}
    arc = [_svg(_bez2((-15, -33), (0, -60), (15, -33), i / 8)) for i in range(9)]
    t["arc"] = _with_tangent(arc)
    left = [_svg((-8 + 8 * i / 4, -33 - 24 * i / 4)) for i in range(4)]
    right = [_svg((8 * i / 4, -57 + 24 * i / 4)) for i in range(5)]
    t["spike"] = _with_tangent(left + right)
    loop = [_svg((0, -37.5))] + [_svg((8 * math.sin(2 * math.pi * k / 8), -48 + 8 * math.cos(2 * math.pi * k / 8)))
                                 for k in range(8)]
    lp = _with_tangent(loop[1:], closed=True)
    t["loop"] = [[round(loop[0][0], 4), round(loop[0][1], 4), round(math.pi / 2, 4)]] + lp
    a = [_svg(_bez3((0, -34), (-9, -29), (-8, -19), (0, -16), i / 4)) for i in range(4)]
    b = [_svg(_bez3((0, -16), (8, -19), (9, -29), (0, -34), i / 4)) for i in range(4)]
    d = _with_tangent(a + b, closed=True)
    t["drop"] = d + [[0.0, round(-(-25) / SVG_R, 4), round(math.pi / 2, 4)]]
    return t


def rot2(x, y, a):
    c, s = math.cos(a), math.sin(a)
    return (x * c - y * s, x * s + y * c)


def ring_points():
    pts = []
    for i in range(RING_N):
        th = math.pi / 2 - 2 * math.pi * i / RING_N   # from the top, clockwise
        pts.append([round(math.cos(th), 4), round(math.sin(th), 4), round(th - math.pi / 2, 4)])
    return pts


def key_points():
    r = 40.0 / SVG_R
    pts = []
    for i in range(KEY_N):
        th = math.pi / 2 - 2 * math.pi * (i + 0.5) / KEY_N
        pts.append([round(r * math.cos(th), 4), round(r * math.sin(th), 4), round(th - math.pi / 2, 4)])
    return pts


def dot_points(n):
    return [[round((k - (n - 1) / 2) * 9 / SVG_R, 4), 0.0, 0.0] for k in range(n)]


def reserve_points():
    """Loose halo behind the sign for motes the current sign does not use."""
    rng = random.Random(9061)
    out = []
    for i in range(POOL):
        th = 2 * math.pi * ((i * 37) % POOL) / POOL + rng.uniform(-0.03, 0.03)
        r = rng.uniform(1.42, 1.72)
        out.append([round(r * math.cos(th), 4), round(r * math.sin(th), 4), round(rng.uniform(-0.25, -0.1), 4),
                    round(th - math.pi / 2 + rng.uniform(-0.5, 0.5), 4)])
    return out


def formation(forms, dots, key):
    """Target of every pool mote: list of 96 [x, y, z, angle, used] in formation units."""
    tpl = stroke_templates()
    res = reserve_points()
    out = [None] * POOL
    for i, p in enumerate(ring_points()):
        out[i] = [p[0], p[1], 0.0, p[2], 1]
    for slot in range(4):
        a = -slot * math.pi / 2
        lo = ROLE_RANGES[f"slot{slot}"][0]
        for j, (x, y, ang) in enumerate(tpl[FORMS[forms[slot]]]):
            rx, ry = rot2(x, y, a)
            out[lo + j] = [round(rx, 4), round(ry, 4), 0.0, round(ang + a, 4), 1]
    dp = dot_points(dots)
    for j in range(DOTS_MAX):
        i = ROLE_RANGES["dots"][0] + j
        out[i] = [dp[j][0], dp[j][1], 0.0, 0.0, 1] if j < dots else res[i][:4] + [0]
    for j, p in enumerate(key_points()):
        i = ROLE_RANGES["key"][0] + j
        out[i] = [p[0], p[1], 0.0, p[2], 1] if key else res[i][:4] + [0]
    for i in range(*ROLE_RANGES["spare"]):
        out[i] = res[i][:4] + [0]
    return out


def assemble_delay(i):
    """Start delay (s) of pool mote i in the assemble: ring sweeps clockwise from the top,
    then the strokes in reading order, then the dots, then the key ring."""
    if i < RING_N:
        return 0.8 * i / RING_N
    for s in range(4):
        lo, hi = ROLE_RANGES[f"slot{s}"]
        if lo <= i < hi:
            return 0.7 + 0.22 * s + 0.03 * (i - lo)
    lo, hi = ROLE_RANGES["dots"]
    if lo <= i < hi:
        return 1.8 + 0.12 * (i - lo)
    lo, hi = ROLE_RANGES["key"]
    if lo <= i < hi:
        return 1.95 + 0.02 * (i - lo)
    return 2.2


def orbit_params(i):
    """Band, phase and radius of pool mote i on its orbit (deterministic)."""
    rng = random.Random(1000 + i)
    band_i = i % 3
    b = ORBIT["bands"][band_i]
    k = i // 3
    phase = 2 * math.pi * k / b["count"] + rng.uniform(-0.06, 0.06)
    return {
        "band": band_i,
        "phase": round(phase, 4),
        "radius_m": round(b["radius_m"] + rng.uniform(-1, 1) * ORBIT["radial_jitter_m"], 4),
        "bob_phase": round(rng.uniform(0, 2 * math.pi), 4),
        "spin_laps": rng.choice([1, 2, 3]),
    }


def orbit_position(i, t):
    """Mote i at time t (s) on its orbit, metres around the Shell centre; y up.
    Exactly periodic with ORBIT['period_s']. Returns (pos, tangent)."""
    o = orbit_params(i)
    b = ORBIT["bands"][o["band"]]
    w = 2 * math.pi * b["laps"] / ORBIT["period_s"]
    th = o["phase"] + w * t
    r = o["radius_m"]
    p = [r * math.cos(th), 0.0, r * math.sin(th)]
    v = [-math.sin(th) * w, 0.0, math.cos(th) * w]
    inc, node = math.radians(b["incline_deg"]), math.radians(b["node_deg"])

    def tilt(q):
        # incline around x, then turn the node around y
        x, y, z = q
        y, z = y * math.cos(inc) - z * math.sin(inc), y * math.sin(inc) + z * math.cos(inc)
        x, z = x * math.cos(node) + z * math.sin(node), -x * math.sin(node) + z * math.cos(node)
        return [x, y, z]

    p, v = tilt(p), tilt(v)
    p[1] += ORBIT["bob_m"] * math.sin(2 * math.pi * ORBIT["bob_harmonic"] * t / ORBIT["period_s"] + o["bob_phase"])
    return p, v


def build_json():
    tpl = stroke_templates()
    return {
        "version": 1,
        "asset": "fauna_glyphmote.glb",
        "notes": "See docs/art/fauna.md. Formation units: ring radius = 1; frame x right, y up, the sign faces +z. "
                 "angle = in-plane direction of the mote's long axis (its local +X in glTF), radians from +x. "
                 "Slot p templates are given for slot 0 (top); rotate by -p*90 deg (clockwise) for slot p.",
        "pool": POOL,
        "roles": {k: list(v) for k, v in ROLE_RANGES.items()},
        "scale_m": FORMATION_SCALE_M,
        "center_m": list(FORMATION_CENTER_M),
        "ring": ring_points(),
        "key_ring": key_points(),
        "forms": FORMS,
        "stroke_templates_slot0": tpl,
        "dot_spacing": round(9 / SVG_R, 4),
        "dots_max": DOTS_MAX,
        "reserve": reserve_points(),
        "assemble": dict(ASSEMBLE, delays_s=[round(assemble_delay(i), 3) for i in range(POOL)]),
        "orbit": dict(ORBIT, motes=[orbit_params(i) for i in range(POOL)]),
        "example": {"forms": [0, 1, 2, 3], "dots": 1, "key": False,
                    "targets": formation([0, 1, 2, 3], 1, False)},
    }


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "..", "game", "public", "assets", "vfx", "glyphmote_formation.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as fh:
        json.dump(build_json(), fh, separators=(",", ":"))
    print("wrote", os.path.abspath(out), os.path.getsize(out), "bytes")

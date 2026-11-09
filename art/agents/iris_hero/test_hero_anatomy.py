"""Checks for hero_anatomy.py without Blender: python3 art/agents/iris_hero/test_hero_anatomy.py"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hero_anatomy as A  # noqa: E402

JOINTS = {
    "upperleg01.L": [[0.094, -0.016, 0.908], [0.093, -0.016, 0.822]],
    "upperleg01.R": [[-0.094, -0.016, 0.908], [-0.093, -0.016, 0.822]],
    "lowerleg01.L": [[0.089, -0.016, 0.474], [0.087, -0.016, 0.259]],
    "lowerleg01.R": [[-0.089, -0.016, 0.474], [-0.087, -0.016, 0.259]],
    "spine05": [[0.0, -0.019, 0.923], [0.0, 0.026, 0.991]],
}
H = 1.756
N = 24


def ring(cx, z, r, groups):
    """A ring of vertices around (cx, -0.016) at height z with outward normals."""
    out = []
    for i in range(N):
        a = 2 * math.pi * i / N
        n = (math.cos(a), math.sin(a), 0.0)
        out.append(((cx + r * n[0], -0.016 + r * n[1], z), n, groups))
    return out


def main():
    verts = []
    for s, sfx in ((1, "L"), (-1, "R")):
        verts += ring(s * 0.08, 0.86, 0.09, {"pelvis." + sfx: 0.5, "upperleg01." + sfx: 0.5})   # the seat
        verts += ring(s * 0.09, 0.70, 0.07, {"upperleg02." + sfx: 1.0})                          # mid thigh
        verts += ring(s * 0.25, 0.86, 0.03, {"lowerarm01." + sfx: 1.0})                          # a hanging arm
    cos, nrm, wts = zip(*verts)
    off = A.offsets(cos, nrm, wts, JOINTS, H)
    mag = [math.sqrt(sum(c * c for c in o)) for o in off]
    # arms (no leg or pelvis weights) never move
    assert all(m == 0.0 for m, w in zip(mag, wts) if any(k.startswith("lowerarm") for k in w))
    # the seat gains volume at the back, more than at the front
    back = max(o[1] for o, c, w in zip(off, cos, wts) if "pelvis.L" in w and c[1] > 0)
    front = max(-o[1] for o, c, w in zip(off, cos, wts) if "pelvis.L" in w and c[1] < -0.05)
    assert back > 0.01 and back > 2 * max(front, 0.0), (back, front)
    # every push is along the normal
    for o, n in zip(off, nrm):
        cross = (o[1] * n[2] - o[2] * n[1], o[2] * n[0] - o[0] * n[2], o[0] * n[1] - o[1] * n[0])
        assert max(abs(c) for c in cross) < 1e-9
    # left/right mirror: the left vertex at angle a matches the right one at pi - a
    for ringi in range(3):
        for i in range(N):
            l, r = off[ringi * N + i], off[3 * N + ringi * N + (N // 2 - i) % N]
            assert abs(l[1] - r[1]) < 1e-9 and abs(l[0] + r[0]) < 1e-9 and abs(l[2] - r[2]) < 1e-9
    print("hero_anatomy ok; seat back", round(back * 1000, 1), "mm, front", round(max(front, 0) * 1000, 1), "mm")


main()

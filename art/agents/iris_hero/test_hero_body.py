"""Checks for hero_body.py on a synthetic ring body (no Blender): python3 art/agents/iris_hero/test_hero_body.py"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hero_body as B  # noqa: E402

H, N = 1.70, 32


def body():
    cos, doms, edges = [], [], []

    def rings(name, cx, z0, z1, rx, ry, dom_of):
        rows = 40
        start = len(cos)
        for j in range(rows + 1):
            z = z0 + (z1 - z0) * j / rows
            for i in range(N):
                a = 2 * math.pi * i / N
                cos.append((cx + rx(z) * math.cos(a), ry(z) * math.sin(a), z))
                doms.append(dom_of(z))
                k = start + j * N + i
                edges.append((k, start + j * N + (i + 1) % N))
                if j:
                    edges.append((k, k - N))

    rings("torso", 0.0, 0.80, 1.30, lambda z: 0.15, lambda z: 0.10,
          lambda z: "pelvis" if z < 0.95 else "spine" if z < 1.12 else "chest")
    for s, suf in ((1, "L"), (-1, "R")):
        rings("leg", s * 0.085, 0.05, 0.86, lambda z: 0.065, lambda z: 0.065,
              lambda z, suf=suf: ("thigh_" if z > 0.48 else "shin_") + suf)
        rings("arm", s * 0.26, 0.80, 1.35, lambda z: 0.035, lambda z: 0.035, lambda z, suf=suf: "forearm_" + suf)
    cos.append((0.0, 0.0, H))                       # head top sets H
    doms.append("head")
    return cos, doms, edges


def main():
    cos, doms, edges = body()
    off = B.smooth_field(B.offsets(cos, doms, s=1.0), edges)
    get = lambda pred: [(c, o) for c, o, d in zip(cos, off, doms) if pred(c, d)]
    # arms and head never move
    assert all(o == (0.0, 0.0, 0.0) for _, o in get(lambda c, d: d.startswith(("forearm", "head"))))
    # the seat moves back (+Y), the most at the back centre line of each cheek
    seat = get(lambda c, d: d == "pelvis" and abs(c[2] - 0.505 * H) < 0.02 and c[1] > 0.09)
    assert seat and max(o[1] for _, o in seat) > 0.006, max(o[1] for _, o in seat)
    # the front of the pelvis barely moves back
    front = get(lambda c, d: d == "pelvis" and abs(c[2] - 0.505 * H) < 0.02 and c[1] < -0.09)
    assert max(o[1] for _, o in front) < 0.004
    # the waist sides move in, the lower back moves forward
    waist = get(lambda c, d: d == "spine" and abs(c[2] - 0.625 * H) < 0.015 and abs(c[0]) > 0.14)
    assert all(o[0] * c[0] < 0 for c, o in waist)
    lb = get(lambda c, d: abs(c[2] - 0.645 * H) < 0.012 and c[1] > 0.09 and abs(c[0]) < 0.03)
    assert all(o[1] < 0 for _, o in lb)
    # left/right symmetric
    for (c, o) in get(lambda c, d: d == "pelvis")[:400]:
        m = min(range(len(cos)), key=lambda i: (cos[i][0] + c[0]) ** 2 + (cos[i][1] - c[1]) ** 2 + (cos[i][2] - c[2]) ** 2)
        assert abs(off[m][0] + o[0]) < 1e-3 and abs(off[m][1] - o[1]) < 1e-3
    # nothing moves more than 3 cm (natural, not inflated)
    assert max(math.sqrt(sum(x * x for x in o)) for o in off) < 0.03
    print("hero_body ok; seat", round(max(o[1] for _, o in seat) * 1000, 1), "mm back; waist",
          round(min(-o[0] * math.copysign(1, c[0]) for c, o in waist) * 1000, 1), "mm in")


main()


def test_fill():
    cos, doms, edges = body()
    fill = B.inner_fill(cos, doms, s=1.0)
    # at 0.45 H the inner edge of the left leg (x > 0) reaches the midline minus the half gap
    inner = [(c, o) for c, o, d in zip(cos, fill, doms) if d == "thigh_L" and abs(c[2] - 0.45 * H) < 0.012]
    edge = min(c[0] + o[0] for c, o in inner)
    assert abs(edge - B.FEM["inner_touch"]) < 0.004, edge
    # the outer side never moves; below 0.36 H nothing moves
    assert all(o[0] == 0.0 for c, o in inner if c[0] > 0.085)
    assert all(o == (0.0, 0.0, 0.0) for c, o in zip(cos, fill) if c[2] < 0.30 * H)
    print("inner_fill ok; inner edge at", round(edge * 1000, 1), "mm from the midline")


test_fill()

"""Town plan for Forget to Foresee (T-001): pure data and helpers, no Blender imports.

Game space: metres, Y up, +Z toward the default camera (south), +X east. The Blender build
(build_town.py) converts with (x, y, z)_game -> (x, -z, y)_blender; the glTF exporter converts back.

The town is our own plan: four terraces climbing north from the lower gate to the temple.

    T3  y 9.5   z -56..-30   temple terrace (temple, two houses, trees); cliff behind
    T2  y 4.5   z -30..-2    the square with the Tournament altar, houses east and west
    T1  y 2.5   z -2..12     a narrow terrace: a lane along the parapet, houses against the wall
    T0  y 0     z 12..34     the gate court and the lower lane; the gate in the south wall

Main street: spawn at the gate court -> stair A -> T1 -> stair B -> the square and the altar.
Side ramps along the retaining walls (R1 west, R2 east, R3 west) make loops for exploring.

Run `python3 art/town/town_plan.py` to regenerate game/src/scenes/town-data.js.
"""

import json
import math
import os

X_IN = 52.0            # inner face of the east / west town wall
WALL_T = 1.6           # town wall thickness
WALL_H = 6.5           # town wall height above its terrace
Z_SOUTH = 34.0         # inner face of the south wall
Z_NORTH = -56.0        # foot of the cliff behind the temple

# name, ground height, north edge z, south edge z
TERRACES = [
    ("t0", 0.0, 12.0, 34.0),
    ("t1", 2.5, -2.0, 12.0),
    ("t2", 4.5, -30.0, -2.0),
    ("t3", 9.5, -56.0, -30.0),
]
TERRACE_Y = {n: y for n, y, _a, _b in TERRACES}

# Stairs up the main axis: x range, z at the bottom (south), z at the top (north), y bottom, y top.
STAIRS = [
    {"id": "stair_a", "x0": -3.0, "x1": 3.0, "z_bot": 18.0, "z_top": 12.0, "y_bot": 0.0, "y_top": 2.5},
    {"id": "stair_b", "x0": -3.0, "x1": 3.0, "z_bot": 2.6, "z_top": -2.0, "y_bot": 2.5, "y_top": 4.5},
    {"id": "stair_c", "x0": -5.0, "x1": 5.0, "z_bot": -21.5, "z_top": -30.0, "y_bot": 4.5, "y_top": 9.5},
]

# Side ramps along a retaining wall: they rise along X from x_bot to x_top inside the z band, then a
# flat landing (from x_top to x_land) joins the upper terrace.
RAMPS = [
    {"id": "ramp_1", "z0": 12.0, "z1": 15.0, "x_bot": -42.0, "x_top": -32.0, "x_land": -29.0, "y_bot": 0.0, "y_top": 2.5},
    {"id": "ramp_2", "z0": -2.0, "z1": 1.0, "x_bot": 42.0, "x_top": 34.0, "x_land": 31.0, "y_bot": 2.5, "y_top": 4.5},
    {"id": "ramp_3", "z0": -30.0, "z1": -27.0, "x_bot": -44.0, "x_top": -30.0, "x_land": -27.0, "y_bot": 4.5, "y_top": 9.5},
]

ALTAR = {"x": 0.0, "z": -11.0, "y": TERRACE_Y["t2"], "dais_r": (4.2, 3.6, 3.0), "step_h": 0.18}
SPAWN = {"x": 0.0, "z": 30.0, "y": 0.0, "heading": math.pi}   # heading 0 faces +Z; she looks north
TEMPLE = {"x": 0.0, "z": -44.5, "y": TERRACE_Y["t3"], "w": 16.0, "d": 13.0}

FACING = {"S": 0.0, "E": 90.0, "N": 180.0, "W": -90.0}   # rotation about +Y: local +Z (the front) turns to that side

# Houses: id, block, terrace, centre x/z, width (local X), depth (local Z), facing, style seed.
# `kind` picks the variant recipe in town_houses.py (8 recipes, A..H), tints vary per house.
HOUSES = [
    # T0, gate court and lower lane
    ("h01", "gate", "t0", -13.6, 26.6, 10.0, 8.0, "E", "A"),
    ("h02", "gate", "t0", 13.6, 26.4, 9.0, 8.0, "W", "B"),
    ("h03", "gate", "t0", -26.0, 27.6, 9.0, 9.0, "N", "C"),
    ("h04", "gate", "t0", -41.5, 27.2, 10.0, 10.0, "N", "D"),
    ("h05", "gate", "t0", 26.0, 27.6, 9.0, 9.0, "N", "E"),
    ("h06", "gate", "t0", 41.2, 27.2, 10.0, 10.0, "N", "F"),
    # T1, against the wall of the square, doors on the lane
    ("h07", "mid", "t1", -9.6, 3.3, 11.0, 8.0, "S", "G"),
    ("h08", "mid", "t1", -22.0, 3.3, 9.0, 8.0, "S", "H"),
    ("h09", "mid", "t1", -43.0, 3.6, 10.0, 8.6, "S", "B"),
    ("h10", "mid", "t1", 9.6, 3.3, 11.0, 8.0, "S", "C"),
    ("h11", "mid", "t1", 22.0, 3.3, 9.0, 8.0, "S", "A"),
    ("h12", "mid", "t1", 47.4, 5.0, 8.0, 8.0, "W", "E"),
    # T2, around the square
    ("h13", "square", "t2", -18.6, -9.0, 10.0, 9.0, "E", "D"),
    ("h14", "square", "t2", -18.6, -21.0, 9.0, 9.0, "E", "F"),
    ("h15", "square", "t2", 18.6, -9.4, 10.0, 9.0, "W", "H"),
    ("h16", "square", "t2", 18.6, -21.4, 9.0, 9.0, "W", "G"),
    ("h17", "square", "t2", -34.0, -10.0, 10.0, 10.0, "E", "C"),
    ("h18", "square", "t2", 36.0, -13.0, 10.0, 10.0, "W", "A"),
    # T3, beside the temple
    ("h19", "temple", "t3", -31.0, -44.0, 9.0, 8.0, "E", "E"),
    ("h20", "temple", "t3", 30.0, -43.0, 9.0, 8.0, "W", "B"),
]

# Pieces exported as separate .glb files: name -> pivot (game space).
BLOCKS = {
    "gate": {"name": "town_block_gate", "pivot": (0.0, 0.0, 24.0)},
    "mid": {"name": "town_block_mid", "pivot": (0.0, 2.5, 4.0)},
    "square": {"name": "town_block_square", "pivot": (0.0, 4.5, -14.0)},
    "temple": {"name": "town_temple", "pivot": (0.0, 9.5, -43.0)},
}

# The archipelago seen far up in the sky to the north (an impostor at reduced scale, visual only).
SKY = {"x": 150.0, "y": 200.0, "z": -300.0, "scale": 1.0}

# Paved rectangles (x0, x1, z0, z1) per terrace; everything else is grass and packed earth.
PAVED = {
    "t0": [(-9.6, 9.6, 12.0, 34.0), (-48.0, 48.0, 12.0, 22.0)],
    "t1": [(-4.4, 4.4, -2.0, 12.0), (-50.0, 50.0, 7.4, 12.0), (30.0, 43.0, -2.0, 7.4)],
    "t2": [(-14.0, 14.0, -30.0, -2.0), (-28.4, -23.2, -30.0, -2.0), (23.2, 28.4, -30.0, -2.0),
           (-46.0, -28.4, -30.0, -26.0), (28.4, 36.0, -8.0, -2.0), (-23.2, -14.0, -16.4, -13.8),
           (14.0, 23.2, -16.6, -14.2)],
    "t3": [(-9.0, 9.0, -38.0, -30.0), (-32.0, 32.0, -37.0, -30.0)],
}


def terrace_at(z):
    for name, y, z0, z1 in TERRACES:
        if z0 <= z <= z1:
            return name, y
    return ("t3", TERRACE_Y["t3"]) if z < Z_NORTH else ("t0", 0.0)


def ground_y(x, z):
    """Walkable height at a ground point (terraces, stairs, ramps, the altar dais)."""
    _n, y = terrace_at(z)
    for s in STAIRS:
        if s["x0"] <= x <= s["x1"] and s["z_top"] <= z <= s["z_bot"]:
            t = (s["z_bot"] - z) / (s["z_bot"] - s["z_top"])
            y = max(y, s["y_bot"] + (s["y_top"] - s["y_bot"]) * t)
    for r in RAMPS:
        if r["z0"] <= z <= r["z1"]:
            lo, hi = sorted((r["x_bot"], r["x_top"]))
            if lo <= x <= hi:
                t = (x - r["x_bot"]) / (r["x_top"] - r["x_bot"])
                y = max(y, r["y_bot"] + (r["y_top"] - r["y_bot"]) * t)
            lo, hi = sorted((r["x_top"], r["x_land"]))
            if lo <= x <= hi:
                y = max(y, r["y_top"])
    d = math.hypot(x - ALTAR["x"], z - ALTAR["z"])
    for i, rr in enumerate(ALTAR["dais_r"]):
        if d <= rr:
            y = max(y, ALTAR["y"] + ALTAR["step_h"] * (i + 1))
    return y


def house_rect(h):
    """World footprint (x0, x1, z0, z1) of a house."""
    _id, _b, _t, cx, cz, w, d, face, _k = h
    if face in ("E", "W"):
        w, d = d, w
    return (cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2)


def altar_points():
    a = ALTAR
    top = a["y"] + a["step_h"] * 3
    return {
        "position": [a["x"], a["y"], a["z"]],
        "stand": [a["x"], round(top, 3), a["z"] + 2.05],
        "focus": [a["x"], round(top + 2.0, 3), a["z"]],
        "radius": 5.6,
    }


def route():
    ap = altar_points()
    sa, sb = STAIRS[0], STAIRS[1]
    return [
        [SPAWN["x"], SPAWN["y"], SPAWN["z"]],
        [0.0, sa["y_bot"], sa["z_bot"]], [0.0, sa["y_top"], sa["z_top"]],
        [0.0, sb["y_bot"], sb["z_bot"]], [0.0, sb["y_top"], sb["z_top"]],
        [0.0, ALTAR["y"], ALTAR["z"] + ALTAR["dais_r"][0]],
        ap["stand"],
    ]


def route_length(pts):
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


def town_data(pieces):
    """The client contract (game/src/scenes/town-data.js). `pieces`: name -> dict(kind, position, center, radius)."""
    return {
        "version": 1,
        "size": [120, 120],
        "killY": -12,
        "spawn": {"position": [SPAWN["x"], SPAWN["y"], SPAWN["z"]], "heading": round(SPAWN["heading"], 6)},
        "altar": altar_points(),
        "route": route(),
        "routeLength": round(route_length(route()), 2),
        "pieces": pieces,
    }


def default_pieces():
    ap = altar_points()
    sky = SKY
    out = [
        {"name": "town_terrain", "kind": "town_terrain", "position": [0, 0, 0], "center": [0, 6, -10], "radius": 100},
    ]
    for key in ("gate", "mid", "square", "temple"):
        b = BLOCKS[key]
        px, py, pz = b["pivot"]
        rad = {"gate": 58, "mid": 56, "square": 50, "temple": 46}[key]
        hgt = {"gate": 5, "mid": 5, "square": 5, "temple": 9}[key]
        out.append({"name": b["name"], "kind": "town_block", "position": [px, py, pz], "center": [px, py + hgt, pz], "radius": rad})
    out.append({"name": "town_altar", "kind": "town_hero", "position": ap["position"], "center": [ap["position"][0], ap["position"][1] + 1.6, ap["position"][2]], "radius": 4.6})
    out.append({"name": "town_sky", "kind": "town_sky", "position": [sky["x"], sky["y"], sky["z"]], "center": [sky["x"], sky["y"], sky["z"]], "radius": 75})
    return out


def write_town_data(path, pieces=None):
    data = town_data(pieces or default_pieces())
    body = json.dumps(data, indent=2)
    text = ("// Generated by art/town/town_plan.py (python3 art/town/town_plan.py). Do not edit by hand:\n"
            "// change the plan and regenerate. Town layout in town-local metres (Y up, +Z toward the default\n"
            "// camera, heading 0 faces +Z). The client adds TOWN_ORIGIN (scenes/town-layout.js). Every piece is\n"
            "// one .glb in public/assets/models/town/ with its pivot at `position`.\n"
            "export const TOWN_DATA = Object.freeze(" + body + ");\n")
    with open(path, "w") as fh:
        fh.write(text)
    return data


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "..", "game", "src", "scenes", "town-data.js")
    d = write_town_data(os.path.abspath(out))
    print("route length", d["routeLength"], "m; walk", round(d["routeLength"] / 1.7, 1), "s; run", round(d["routeLength"] / 3.3, 1), "s")
    # overlap check between house footprints
    rects = [(h[0], house_rect(h)) for h in HOUSES]
    for i, (a, ra) in enumerate(rects):
        for b, rb in rects[i + 1:]:
            if ra[0] < rb[1] and rb[0] < ra[1] and ra[2] < rb[3] and rb[2] < ra[3]:
                print("OVERLAP", a, b)

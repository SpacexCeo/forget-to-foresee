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

ALTAR = {"x": 0.0, "z": -11.0, "y": TERRACE_Y["t2"], "dais_r": (3.3, 2.94, 2.58), "step_h": 0.16}
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

# Small offsets and turns that break the parade-ground rows (GPT review 10.11): id -> (dx, dz, degrees).
HOUSE_TWEAK = {"h03": (0.6, -0.5, 7.0), "h05": (-0.4, 0.6, -6.0), "h09": (0.0, 0.5, 6.0), "h12": (0.0, 0.0, 0.0),
               "h17": (-0.8, 0.6, -8.0), "h18": (0.9, -0.6, 9.0), "h19": (0.0, 0.8, -7.0), "h20": (0.5, 0.0, 8.0),
               "h04": (0.0, -0.4, -4.0), "h06": (0.0, -0.3, 5.0)}

# Pieces exported as separate .glb files: name -> pivot (game space).
BLOCKS = {
    "gate": {"name": "town_block_gate", "pivot": (0.0, 0.0, 24.0)},
    "mid": {"name": "town_block_mid", "pivot": (0.0, 2.5, 4.0)},
    "square": {"name": "town_block_square", "pivot": (0.0, 4.5, -14.0)},
    "temple": {"name": "town_temple", "pivot": (0.0, 9.5, -43.0)},
}

# The archipelago seen far up in the sky to the north (an impostor at reduced scale, visual only).
SKY = {"x": 165.0, "y": 225.0, "z": -320.0, "scale": 1.0}

# Paved rectangles (x0, x1, z0, z1) per terrace; everything else is grass and packed earth.
PAVED = {
    "t0": [(-9.6, 9.6, 12.0, 34.0), (-48.0, 48.0, 12.0, 22.0)],
    "t1": [(-4.4, 4.4, -2.0, 12.0), (-50.0, 50.0, 7.4, 12.0), (30.0, 43.0, -2.0, 7.4)],
    "t2": [(-14.0, 14.0, -30.0, -2.0), (-28.4, -23.2, -30.0, -2.0), (23.2, 28.4, -30.0, -2.0),
           (-46.0, -28.4, -30.0, -26.0), (28.4, 36.0, -8.0, -2.0), (-23.2, -14.0, -16.4, -13.8),
           (14.0, 23.2, -16.6, -14.2)],
    "t3": [(-9.0, 9.0, -38.0, -30.0), (-32.0, 32.0, -37.0, -30.0)],
}


# Benches: x, z, facing (degrees about +Y, the sitter looks along local +Z), terrace.
BENCHES = [(-9.6, -12.0, 90.0, "t2"), (-32.4, 7.2, 0.0, "t1"), (-22.5, -33.2, 0.0, "t3"), (9.4, 19.6, 180.0, "t0")]

# Shops (S-001..S-003): an existing house carries the sign and the door; the interior is its own piece,
# streamed when Iris enters. `interior` sizes are metres (width x depth), the door is in the south wall.
SHOPS = [
    {"id": "exchange", "task": "S-001", "house": "h15", "piece": "town_shop_exchange", "interior": (9.0, 11.0), "icon": "shard"},
    {"id": "scribe", "task": "S-002", "house": "h13", "piece": "town_shop_scribe", "interior": (9.0, 11.0), "icon": "ring"},
    {"id": "inn", "task": "S-003", "house": "h07", "piece": "town_shop_inn", "interior": (10.0, 13.0), "icon": "cup"},
]

# Townsfolk points and routes (N-001), ground points x, z; heights and headings are filled in by npc_data().
# heading in degrees about +Y: 0 looks +Z (south), 90 looks +X (east), 180 looks north.
NPC_POINTS = [
    ("npc_gate_guard", 3.9, 31.0, 180.0, "post beside the lower gate, watching the court"),
    ("npc_market_seller_gate", 19.5, 14.6, 0.0, "between the first two stalls of the lower lane"),
    ("npc_market_customer_gate", 23.9, 15.8, 180.0, "facing the lower-lane stalls"),
    ("npc_market_seller_square", 13.1, -4.6, -90.0, "behind the north-east stall of the square"),
    ("npc_market_seller_square_2", 13.1, -15.4, -90.0, "behind the south-east stall of the square"),
    ("npc_market_customer_square", 9.6, -15.4, 90.0, "facing the south-east stall"),
    ("npc_well", -8.5, -24.5, -135.0, "drawing water at the well"),
    ("npc_shrine_keeper", 3.4, -7.4, 0.0, "beside the altar approach, greeting who comes up the street"),
    ("npc_musician", 6.4, -19.2, -40.0, "playing toward the square, below the shrine stairs"),
    ("npc_courier_rest", -5.4, 17.2, 90.0, "catching breath at the foot of the first stairs"),
    ("npc_chat_a", -6.0, -18.6, 90.0, "pair talking on the square (with npc_chat_b)"),
    ("npc_chat_b", -4.6, -18.6, -90.0, "pair talking on the square (with npc_chat_a)"),
    ("npc_chat_c", 20.0, 9.8, -90.0, "pair talking on the lane (with npc_chat_d)"),
    ("npc_chat_d", 18.6, 9.8, 90.0, "pair talking on the lane (with npc_chat_c)"),
]
NPC_AREAS = [
    ("npc_children_play", -30.0, 18.6, 3.4, "two children play tag here (lower lane, west)"),
    ("npc_children_play_2", 34.0, -22.0, 3.0, "second play spot (east yard of the square terrace)"),
]
# Routes are polylines of ground points that are free of obstacles (stairs taken on their centre line).
NPC_ROUTES = [
    ("npc_route_sweeper", True, [(-30.0, 9.6), (-6.0, 9.6), (6.0, 9.6), (30.0, 9.6), (30.0, 8.6), (-30.0, 8.6)], "sweeping the middle lane, loop"),
    ("npc_route_lamplighter", True, [(-6.6, -5.6), (6.6, -5.6), (6.6, -16.6), (-6.6, -16.6), (-6.6, -5.6), (0.0, -3.4), (0.0, 3.4), (-13.0, 10.2), (-34.8, 10.2), (-13.0, 10.2), (13.0, 10.2), (35.8, 10.2), (13.0, 10.2), (0.0, 3.4), (0.0, -3.4)], "lamp to lamp: the square, then the lane"),
    ("npc_route_courier", False, [(0.0, 29.0), (0.0, 18.4), (0.0, 11.6), (0.0, 3.0), (0.0, -2.6), (-5.6, -6.0), (-5.6, -19.0), (0.0, -22.0), (0.0, -30.6), (0.0, -33.6)], "gate to the shrine steps and back"),
    ("npc_route_stroll_lower", True, [(-8.0, 20.0), (-44.0, 20.0), (-44.0, 16.4), (8.0, 16.4), (44.0, 16.4), (44.0, 20.0), (8.0, 20.0)], "a stroll along the lower lane"),
    ("npc_route_square_round", True, [(-11.0, -6.0), (11.0, -6.0), (11.0, -19.5), (-11.0, -19.5)], "a slow round of the square, outside the dais"),
    ("npc_route_west_loop", True, [(-30.5, 10.0), (-30.5, 13.4), (-33.0, 13.4), (-41.0, 13.4), (-44.0, 16.4), (-20.0, 17.6), (-6.0, 17.6), (-1.5, 18.4), (-1.5, 11.6), (-6.0, 10.0)], "terrace loop over the west ramp and the first stairs"),
]


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
        "stand": [a["x"], round(top, 3), a["z"] + a["dais_r"][-1] - 0.62],
        "focus": [a["x"], round(top + 2.0, 3), a["z"]],
        "radius": 5.0,
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


def town_data(pieces, interiors=None):
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
        "interiors": interiors or [],
        "npc": npc_data(),
        "shops": shop_data(),
    }


def _r(v):
    return round(v, 3)


def bench_seats():
    """Seat points of the benches: position on the ground in front of the seat, heading in degrees."""
    return [(f"npc_bench_{i}", x, z, rot) for i, (x, z, rot, _t) in enumerate(BENCHES)]


def npc_data():
    pts = {}
    for name, x, z, hd, note in NPC_POINTS:
        pts[name] = {"position": [x, _r(ground_y(x, z)), z], "heading": _r(math.radians(hd)), "note": note}
    for name, x, z, rot in bench_seats():
        pts[name] = {"position": [x, _r(ground_y(x, z)), z], "heading": _r(math.radians(rot)), "sit": True, "seatHeight": 0.46, "note": "bench seat (sit clip)"}
    areas = {name: {"center": [x, _r(ground_y(x, z)), z], "radius": r, "note": note} for name, x, z, r, note in NPC_AREAS}
    routes = {name: {"loop": loop, "points": [[x, _r(ground_y(x, z)), z] for x, z in pts_], "note": note} for name, loop, pts_, note in NPC_ROUTES}
    return {"points": pts, "areas": areas, "routes": routes}


def shop_door(shop):
    """Town-side door point of a shop: just outside the house door, and the heading that looks at the door."""
    h = next(h for h in HOUSES if h[0] == shop["house"])
    _id, _b, tname, cx, cz, w, d, face, _k = h
    a = math.radians(FACING[face])
    fx, fz = math.sin(a), math.cos(a)          # the direction the facade looks
    dist = d / 2 + 1.3
    return [_r(cx + fx * dist), TERRACE_Y[tname], _r(cz + fz * dist)], _r(math.atan2(-fx, -fz))


def shop_data():
    out = []
    for sp in SHOPS:
        w, d = sp["interior"]
        pos, heading = shop_door(sp)
        out.append({
            "id": sp["id"], "task": sp["task"], "house": sp["house"], "piece": sp["piece"],
            "door": {"position": pos, "heading": heading, "radius": 1.6},
            # interior-local metres: the room is centred on the origin, the door is in the +Z wall
            "interior": {"size": [w, 3.6, d], "spawn": {"position": [0, 0, _r(d / 2 - 1.2)], "heading": _r(math.pi)},
                         "exit": {"position": [0, 0, _r(d / 2 - 0.5)], "radius": 1.1},
                         "shopkeeper_stand": {"position": [0, 0, _r(-d / 2 + 1.5)], "heading": 0.0},
                         "counter": {"position": [0, 0, _r(-d / 2 + 3.5)], "radius": 1.8}},
        })
    return out


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


def write_town_data(path, pieces=None, interiors=None):
    data = town_data(pieces or default_pieces(), interiors)
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

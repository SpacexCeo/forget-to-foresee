"""Move the warm-light sockets of the built town pieces in place (glTF JSON only; geometry, bake and compression stay).

The client hangs a point light (intensity 11, inverse-square) on the nearest `socket_lamp_*` empties. Sockets that sat
0.55 m (house lanterns) or 0.9 m (shop signs) in front of the plaster burnt a white disc into the wall at dusk and
night, and the altar's corner lanterns at 0.55 m above the cobbles burnt the paving. The build sources now place them
as below (town_houses.py `_lantern`, `shop_sign`; town_altar.py); this script applies the same offsets to the shipped
files so the baked pieces need no rebuild. A shop whose house has a door lantern keeps only that light: its sign
socket is renamed `socket_unlit_shop_*` (the client lights `socket_lamp_*` only), as `shop_sign(light=False)` builds it. Idempotent: it records `extras.lamp_patch` on every node it moves.

Usage: python3 art/town/patch_lamp_sockets.py [game/public/assets/models/town]
"""
import json, math, os, struct, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import town_plan as P  # noqa: E402

LANTERN_OUT, LANTERN_DOWN = 0.8, 0.15   # 0.55 -> 1.35 m from the wall, a little lower
SIGN_OUT = 0.6                          # 0.9 -> 1.5 m
ALTAR_UP = 0.7                          # 0.55 -> 1.25 m above the paving


def outward(hid):
    h = next(x for x in P.HOUSES if x[0] == hid)
    a = math.radians(P.FACING[h[7]] + P.HOUSE_TWEAK.get(hid, (0, 0, 0))[2])
    return math.sin(a), math.cos(a)


def offsets():
    icon_house = {s["icon"]: s["house"] for s in P.SHOPS}
    out = {}
    for h in P.HOUSES:
        sx, sz = outward(h[0])
        out[f"socket_lamp_{h[0]}"] = (sx * LANTERN_OUT, -LANTERN_DOWN, sz * LANTERN_OUT)
    for icon, hid in icon_house.items():
        sx, sz = outward(hid)
        out[f"socket_lamp_shop_{icon}"] = (sx * SIGN_OUT, 0.0, sz * SIGN_OUT)
    for k in range(4):
        out[f"socket_lamp_altar_{k}"] = (0.0, ALTAR_UP, 0.0)
    return out


def unlit(names):
    """Sign sockets of shops whose house also carries a door lantern socket."""
    icon_house = {s["icon"]: s["house"] for s in P.SHOPS}
    return {f"socket_lamp_shop_{i}" for i, h in icon_house.items() if f"socket_lamp_{h}" in names}


def patch(path, table):
    b = bytearray(open(path, "rb").read())
    jlen = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jlen])
    moved = 0
    for name in unlit({n.get("name") for n in j["nodes"]}):
        for n in j["nodes"]:
            if n.get("name") == name:
                n["name"] = name.replace("socket_lamp_", "socket_unlit_")
                n.setdefault("extras", {})["socket"] = n["name"][len("socket_"):]
                moved += 1
    for n in j["nodes"]:
        d = table.get(n.get("name"))
        if not d or n.get("extras", {}).get("lamp_patch"):
            continue
        t = n.get("translation", [0, 0, 0])
        n["translation"] = [t[0] + d[0], t[1] + d[1], t[2] + d[2]]
        n.setdefault("extras", {})["lamp_patch"] = 1
        moved += 1
    if not moved:
        return 0
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    rest = bytes(b[20 + jlen:])
    out = b[:12] + struct.pack("<I", len(js)) + b"JSON" + js + rest
    out[8:12] = struct.pack("<I", len(out))
    open(path, "wb").write(out)
    return moved


if __name__ == "__main__":
    d = sys.argv[1] if len(sys.argv) > 1 else "game/public/assets/models/town"
    table = offsets()
    for f in sorted(os.listdir(d)):
        if f.endswith(".glb"):
            m = patch(os.path.join(d, f), table)
            if m:
                print(f, m)

"""Compare the skeleton rest pose of two glb files (no Blender needed):

    python3 art/agents/iris_hero/qa_restpose.py <old.glb> <new.glb> [tolerance_m]

Prints every joint whose name is missing on one side, or whose local translation / rotation differs by more
than the tolerance (default 0.5 mm; rotations compared as quaternion components). The mocap side-car clips
(game/public/assets/anim/iris.glb) bind by bone name and were built against the shipped rest pose, so a
difference here means the side-car must be rebuilt.
"""
import json
import struct
import sys


def joints(path):
    with open(path, "rb") as f:
        magic, _, _ = struct.unpack("<III", f.read(12))
        assert magic == 0x46546C67, path
        n, kind = struct.unpack("<II", f.read(8))
        doc = json.loads(f.read(n))
    out = {}
    for skin in doc.get("skins", []):
        for j in skin["joints"]:
            node = doc["nodes"][j]
            out[node.get("name", str(j))] = (node.get("translation", [0, 0, 0]), node.get("rotation", [0, 0, 0, 1]))
    return out


def main():
    a, b = joints(sys.argv[1]), joints(sys.argv[2])
    tol = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0005
    bad = 0
    for name in sorted(set(a) | set(b)):
        if name not in a or name not in b:
            print(f"{name}: only in {'new' if name in b else 'old'}")
            bad += 1
            continue
        dt = max(abs(x - y) for x, y in zip(a[name][0], b[name][0]))
        dr = min(max(abs(x - y) for x, y in zip(a[name][1], b[name][1])),
                 max(abs(x + y) for x, y in zip(a[name][1], b[name][1])))
        if dt > tol or dr > 0.002:
            print(f"{name}: translation differs by {dt * 1000:.2f} mm, rotation by {dr:.4f}")
            bad += 1
    print(f"{len(a)} joints old, {len(b)} joints new, {bad} differ")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

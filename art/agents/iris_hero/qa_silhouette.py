"""Compare the body silhouette of two raw (uncompressed) Iris glb files in the bind pose, no Blender needed:

    python3 art/agents/iris_hero/qa_silhouette.py <old raw.glb> <new raw.glb>

Per 5 cm of height: the torso and legs' half width seen from the front, and the front and back depth seen
from the side (arms and hands are left out by a lateral limit per level). Prints the differences in mm and
the largest one; anything above about 2 mm is a change of shape, not of mesh sampling.
"""
import json
import struct
import sys

import numpy as np


def positions(path):
    with open(path, "rb") as f:
        f.read(12)
        n, _ = struct.unpack("<II", f.read(8))
        doc = json.loads(f.read(n))
        m, _ = struct.unpack("<II", f.read(8))
        blob = f.read(m)
    out = []
    for node in doc["nodes"]:
        if "mesh" not in node or "skin" not in node or node.get("name", "").endswith("_col"):
            continue
        for prim in doc["meshes"][node["mesh"]]["primitives"]:
            acc = doc["accessors"][prim["attributes"]["POSITION"]]
            bv = doc["bufferViews"][acc["bufferView"]]
            off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
            stride = bv.get("byteStride", 12)
            a = np.frombuffer(blob, dtype=np.uint8, count=stride * (acc["count"] - 1) + 12, offset=off)
            idx = (np.arange(acc["count"])[:, None] * stride + np.arange(12)[None, :]).ravel()
            out.append(np.frombuffer(a[idx].tobytes(), dtype="<f4").reshape(-1, 3))
    return np.concatenate(out)


def outline(p):
    """glTF axes: x lateral, y up, z toward the viewer (her front)."""
    rows = {}
    for h in np.arange(0.10, 1.75, 0.05):
        band = p[(p[:, 1] >= h - 0.012) & (p[:, 1] < h + 0.012)]
        lim = 0.21 if 0.80 < h < 1.02 else (0.19 if 1.02 <= h < 1.20 else (0.165 if 1.20 <= h < 1.42 else 0.30))
        core = band[np.abs(band[:, 0]) < lim]
        mid = band[np.abs(band[:, 0]) < 0.13]
        if len(core) < 8 or len(mid) < 8:
            continue
        rows[round(float(h), 2)] = (float(np.abs(core[:, 0]).max()), float(mid[:, 2].max()), float(mid[:, 2].min()))
    return rows


def main():
    a, b = outline(positions(sys.argv[1])), outline(positions(sys.argv[2]))
    worst = 0.0
    print("height   half width old/new (d mm)    front old/new (d mm)    back old/new (d mm)")
    for h in sorted(set(a) & set(b)):
        d = [(y - x) * 1000 for x, y in zip(a[h], b[h])]
        worst = max(worst, max(abs(x) for x in d))
        print(f"{h:5.2f}   " + "   ".join(f"{x:6.3f}/{y:6.3f} ({dd:+5.1f})" for x, y, dd in zip(a[h], b[h], d)))
    print(f"largest difference {worst:.1f} mm")


if __name__ == "__main__":
    main()

"""The hillside outside the lower gate as its own export, and the before / after sheet renders.

    blender -b -P art/town/build_outside.py -- export   # art/town/out/town_outside.glb (flat materials)
    blender -b -P art/town/build_outside.py -- render   # art/town/out/outside_{before,after}_{b,g}.jpg

`export` builds only town_outside.py (ground, road, plants, rocks, colliders) with the blockout materials.
art/town/merge_outside.mjs then swaps it into the shipped town_terrain.glb, where the materials are
replaced by the textured ones of the same name: the town inside the walls is not rebuilt.
`render` builds the whole terrain piece twice (the old bare slope, the new hillside) for the QA sheet.
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "common")]

import ftf  # noqa: E402
import build_town as B  # noqa: E402
import town_outside  # noqa: E402
import town_terrain  # noqa: E402
from town_geo import TownBuilder, bl  # noqa: E402

OUT = os.path.join(HERE, "out")


def stage_export():
    ftf.reset_scene()
    tb = TownBuilder()
    tb.piece = "town_terrain"
    info = town_outside.build(tb)
    mats, _ = B.make_materials()
    grp = B.build_objects(tb, mats)["town_terrain"]
    tris = {}
    for o in grp["meshes"]:
        key = o.name.replace("town_terrain_", "")
        o.name = o.data.name = f"town_terrain_{key}_outside"
        tris[key] = ftf.mesh_tris(o)
    for o in grp["cols"]:
        o.name = o.data.name = "town_terrain_outside_col"
        tris["col"] = ftf.mesh_tris(o)
    ftf.export_glb(os.path.join(OUT, "town_outside.glb"), grp["meshes"] + grp["cols"])
    info["triangles"] = tris
    info["triangles_render"] = sum(v for k, v in tris.items() if k != "col")
    with open(os.path.join(OUT, "town_outside.json"), "w") as fh:
        json.dump(info, fh, indent=1)
    print("OUTSIDE", json.dumps(info))


def stage_render():
    # the two angles of board/renders/fx001_b (out of the gate, over the hill) and fx001_g (the gate from outside)
    cams = {"b": ((0.0, 3.4, 37.2), (0.0, -5.0, 72.0), 62), "g": ((0.0, 33.0, 66.0), (0.0, 0.0, 47.0), 52)}
    for label, legacy in (("before", True), ("after", False)):
        ftf.reset_scene()
        tb = TownBuilder()
        town_terrain.build(tb, legacy_front=legacy)
        mats, _ = B.make_materials()
        grp = B.build_objects(tb, mats)["town_terrain"]
        for o in grp["cols"]:
            o.hide_render = True
        sc = bpy.context.scene
        col = ftf.new_collection("QA")
        sc.world = ftf.sky_world(zenith=(0.30, 0.42, 0.55), horizon=(0.80, 0.84, 0.86), ground=(0.82, 0.86, 0.88), strength=1.1)
        ftf.add_sun(col, energy=3.4, elev=38, azim=-150)
        ftf.use_gpu(sc, "outside")
        ftf.setup_cycles(sc, 1280, 720, 96)
        for name, (loc, tgt, fov) in cams.items():
            cam = ftf.add_camera(f"cam_{name}", bl(loc), bl(tgt), fov_v_deg=fov, col=col, clip_end=600)
            t = ftf.render_to(sc, cam, os.path.join(OUT, f"outside_{label}_{name}.jpg"))
            print("render", label, name, t, "s")


if __name__ == "__main__":
    stage = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "export"
    os.makedirs(OUT, exist_ok=True)
    if stage == "export":
        stage_export()
    else:
        stage_render()

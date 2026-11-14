"""Step 6: QA stills of the exported game file (what the client loads), small JPEGs.

    blender -b -t 10 --python s06_qa.py [-- --glb path.glb --tag name]

Writes $LB_WORK/qa/<tag>_{full,hilt,braid,hand,back}.jpg. With --high it renders the high mesh in the same views.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import lb_common as L  # noqa: E402

NAME = os.environ.get("LB_NAME", "loomblade")


def look(cam, loc, target, lens):
    cam.location = loc
    cam.data.lens = lens
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def main():
    high = "--high" in L.argv()
    if high:
        bpy.ops.wm.open_mainfile(filepath=os.path.join(L.WORK, "high.blend"))
        tag = L.opt("--tag", "high")
    else:
        L.reset()
        glb = L.opt("--glb", os.path.join(L.WORK, "out", NAME + ".glb"))
        bpy.ops.import_scene.gltf(filepath=glb)
        tag = L.opt("--tag", os.path.splitext(os.path.basename(glb))[0])
        # the importer brings the sword back Z-up: tip at +Z
    sc = bpy.context.scene
    L.use_gpu(sc)
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 86
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA" if "NISHITA" in [i.identifier for i in sky.bl_rna.properties["sky_type"].enum_items] else sky.sky_type
    try:
        sky.sun_elevation = math.radians(14)
        sky.sun_rotation = math.radians(140)
        sky.sun_intensity = 0.25
    except AttributeError:
        pass
    bg = nt.nodes["Background"]
    bg.inputs["Strength"].default_value = 0.22
    nt.links.new(sky.outputs[0], bg.inputs["Color"])
    for loc, energy, size, col in (((0.9, -1.4, 1.3), 60, 1.2, (1.0, 0.93, 0.82)), ((-1.2, -0.6, 0.2), 25, 1.5, (0.75, 0.85, 1.0)), ((0.2, 1.2, 0.9), 40, 0.8, (1.0, 0.8, 0.6))):
        ld = bpy.data.lights.new("l", "AREA")
        ld.energy, ld.size, ld.color = energy, size, col
        lo = bpy.data.objects.new("l", ld)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0.4)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        sc.collection.objects.link(lo)
    # a dark slate floor far below so the metal has something to reflect
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -0.6))
    fm = bpy.data.materials.new("floor")
    fm.use_nodes = True
    fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.06, 0.07, 1)
    fm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.6
    bpy.context.object.data.materials.append(fm)
    cd = bpy.data.cameras.new("cam")
    cd.clip_start = 0.005
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    qa = os.path.join(L.WORK, "qa")
    os.makedirs(qa, exist_ok=True)
    # lay the sword on its side for the full view by rotating the camera roll instead of the model
    views = {
        "full": ((0.35, -1.75, 0.55), (0, 0, 0.40), 50),
        "hilt": ((0.16, -0.36, 0.13), (0, 0, 0.07), 60),
        "braid": ((0.07, -0.20, 0.50), (0, 0, 0.42), 70),
        "hand": ((0.25, -0.55, -0.25), (0, 0, 0.25), 35),
        "back": ((-0.20, 0.42, 0.22), (0, 0, 0.10), 55),
        "tip": ((0.05, -0.22, 0.95), (0, 0, 0.86), 70),
        # the whole sword, pommel to tip, beside a 1 m bar (3D review point 15), and at about the game camera's distance
        "whole_front": ((0.0, -3.3, 0.40), (0.06, 0, 0.40), 50),
        "whole_side": ((3.3, 0.0, 0.40), (0, 0.06, 0.40), 50),
        "game": ((0.6, -7.0, 0.9), (0, 0, 0.40), 35),
    }
    # the 1 m bar: white, 1 cm square, standing beside the sword from the pommel's level
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.22, 0.0, -0.156 + 0.5))
    bar = bpy.context.object
    bar.scale = (0.01, 0.01, 1.0)
    bm_ = bpy.data.materials.new("bar")
    bm_.use_nodes = True
    bm_.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1)
    bar.data.materials.append(bm_)
    only = L.opt("--views")
    for name, (loc, tgt, lens) in views.items():
        if only and name not in only.split(","):
            continue
        look(cam, loc, tgt, lens)
        sc.render.filepath = os.path.join(qa, f"{tag}_{name}.jpg")
        bpy.ops.render.render(write_still=True)
        L.log("render", sc.render.filepath)


main()

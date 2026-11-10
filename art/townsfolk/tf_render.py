"""Studio renders for the townsfolk QA sheets (Blender 4.5, Cycles; GPU when there is one)."""

import math
import os

import bpy
from mathutils import Vector

V = Vector


def setup(samples=48, res=(900, 1600), film_transparent=False, bg=(0.50, 0.49, 0.47)):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    try:
        if os.environ.get("TF_CPU"):
            raise RuntimeError("TF_CPU set")
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = "GPU"
    except Exception as e:           # CPU fallback
        sc.cycles.device = "CPU"
        print("[render] cpu:", e)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = film_transparent
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    w = bpy.data.worlds.new("studio")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*bg, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.55
    sc.world = w
    return sc


def light(name, loc, energy, size, color=(1, 1, 1), target=(0, 0, 1.0)):
    d = bpy.data.lights.new(name, "AREA")
    d.energy, d.size, d.color = energy, size, color
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (V(target) - V(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


def three_point(scale=1.0, target=(0, 0, 1.0)):
    """Key from the front-left, a cool fill, a warm rim from behind (the body faces -Y)."""
    return [light("key", (1.8 * scale, -3.2 * scale, 2.6 * scale), 520 * scale * scale, 2.2 * scale, (1.0, 0.96, 0.90), target),
            light("fill", (-2.6 * scale, -2.0 * scale, 1.4 * scale), 170 * scale * scale, 3.0 * scale, (0.86, 0.92, 1.0), target),
            light("rim", (-1.2 * scale, 3.0 * scale, 2.4 * scale), 380 * scale * scale, 1.6 * scale, (1.0, 0.86, 0.70), target)]


def floor(z=0.0, size=40.0, color=(0.42, 0.41, 0.39)):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    o = bpy.context.active_object
    m = bpy.data.materials.new("floor")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    o.data.materials.append(m)
    return o


def camera(loc, target, lens=85, ortho=None):
    cd = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (V(target) - V(loc)).to_track_quat("-Z", "Y").to_euler()
    if ortho:
        cd.type = "ORTHO"
        cd.ortho_scale = ortho
    else:
        cd.lens = lens
    bpy.context.scene.camera = cam
    return cam


def shot(path, loc, target, lens=85, ortho=None, res=None):
    sc = bpy.context.scene
    if res:
        sc.render.resolution_x, sc.render.resolution_y = res
    cam = camera(loc, target, lens, ortho)
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG" if path.endswith(".png") else "JPEG"
    sc.render.image_settings.quality = 92
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    return path


def clay(name, rgb, rough=0.75):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m

"""Iris for the loading screen: a dark standing silhouette with a teal rim light and a small amber glint.

  node art/ui/loading/decode_glb.mjs game/public/assets/models/agent_iris.glb /tmp/iris_plain.glb
  blender -b -P art/ui/loading/render_iris.py -- /tmp/iris_plain.glb game/public/assets/ui/loading_iris.webp

(Blender 4.5 LTS, Cycles; a few seconds on a GPU. decode_glb.mjs needs @gltf-transform/core, /extensions,
/functions and meshoptimizer: the shipped model is meshopt-compressed with KTX2 textures, which Blender cannot read.)

The figure is the game model in its `idle` pose, every material replaced by one near-black satin, so only the
light draws her: two rim lights in the loading screen's teal from behind, a breath of teal fill so the form reads,
and amber (our mark of a human choice) as a bead in her right hand and on the hair tie. The film is transparent;
the WebP is re-encoded at falling quality until it fits MAX_BYTES (the page shows it before any script runs).
"""
import bpy, math, os, sys
import numpy as np
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = ARGS[0] if ARGS else '/tmp/iris_plain.glb'
OUT = os.path.abspath(ARGS[1] if len(ARGS) > 1 else 'loading_iris.webp')
SIZE = (640, 1280)
MAX_BYTES = 150 * 1024
PAD = 10
TEAL, AMBER = '#3fe6cf', '#f0a63a'
POSE = ('idle', 24)


def lin(hexc):
    c = [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]


def satin(name, base, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = rough
    return m


def glow(name, hexc, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = (*lin(hexc), 1); e.inputs[1].default_value = strength
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs[0])
    return m


def area(name, hexc, watts, loc, target, size):
    d = bpy.data.lights.new(name, 'AREA'); d.color = lin(hexc); d.energy = watts; d.size = size
    o = bpy.data.objects.new(name, d); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.collection.objects.link(o)
    return o


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    sc = bpy.context.scene
    for o in list(bpy.data.objects):   # the collision proxy and the importer's bone shape are not part of her
        if o.type == 'MESH' and not o.data.materials: bpy.data.objects.remove(o)
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    rig.animation_data_create(); rig.animation_data.action = bpy.data.actions[POSE[0]]
    sc.frame_set(POSE[1])

    body, hair, amber = satin('silhouette', (0.010, 0.016, 0.018), 0.5), satin('silhouette_hair', (0.008, 0.012, 0.014), 0.62), glow('amber', AMBER, 14)
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        mat = amber if o.name == 'hair_tie' else hair if o.name.startswith('hair') else body
        o.data.materials.clear(); o.data.materials.append(mat)

    # The amber bead in her right hand, and the little light it throws on her fingers and hip.
    bpy.context.view_layer.update()
    hand = bpy.data.objects.get('socket_hand_r')
    hp = hand.matrix_world.translation.copy() if hand else Vector((-0.3, 0, 0.85))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.009, location=hp + Vector((-0.02, -0.07, -0.02)), segments=16, ring_count=8)
    bead = bpy.context.object; bead.data.materials.append(glow('amber_bead', AMBER, 60))
    pl = bpy.data.lights.new('amber_light', 'POINT'); pl.color = lin(AMBER); pl.energy = 0.22; pl.shadow_soft_size = 0.02
    po = bpy.data.objects.new('amber_light', pl); po.location = hp + Vector((-0.02, -0.07, -0.02)); sc.collection.objects.link(po)

    # She faces -Y. The camera stands in front and a little to her right, so on the page she looks into the screen.
    mid = Vector((0, 0, 0.885))
    area('rim_right', TEAL, 520, (1.25, 3.1, 2.2), mid + Vector((0, 0, 0.35)), 1.0)
    area('rim_left', TEAL, 230, (-1.15, 3.3, 1.4), mid, 0.9)
    area('rim_low', TEAL, 120, (0.9, 2.6, 0.2), mid - Vector((0, 0, 0.55)), 0.8)
    area('fill', '#2a8f86', 1.6, (-1.2, -3.0, 1.6), mid, 3.0)

    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 110; cam.data.sensor_fit = 'VERTICAL'; cam.data.sensor_height = 36
    az = math.radians(-24); dist = 6.6
    cam.location = mid + Vector((math.sin(az) * dist, -math.cos(az) * dist, 0.08))
    cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()

    sc.render.engine = 'CYCLES'; sc.cycles.samples = 256; sc.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind; prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices: d.use = d.type == kind
                    sc.cycles.device = 'GPU'; break
            except Exception: pass
    except Exception: pass
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0
    sc.render.resolution_x, sc.render.resolution_y = SIZE; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    png = os.path.splitext(OUT)[0] + '.png'
    sc.render.filepath = png; bpy.ops.render.render(write_still=True)

    # Crop to the figure (plus a margin for the glow), so no byte and no layout box is spent on empty film.
    src = bpy.data.images.load(png); w, h = src.size
    px = np.array(src.pixels[:], dtype=np.float32).reshape(h, w, 4)
    ys, xs = np.where(px[..., 3] > 0.01)
    x0, x1, y0, y1 = max(0, xs.min() - PAD), min(w, xs.max() + 1 + PAD), max(0, ys.min() - PAD), min(h, ys.max() + 1 + PAD)
    crop = px[y0:y1, x0:x1]
    img = bpy.data.images.new('iris', x1 - x0, y1 - y0, alpha=True); img.alpha_mode = 'STRAIGHT'; img.pixels = crop.ravel()
    sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.color_mode = 'RGBA'
    for q in (92, 88, 84, 80, 75, 70, 62, 54):
        sc.render.image_settings.quality = q; img.save_render(OUT, scene=sc)
        if os.path.getsize(OUT) <= MAX_BYTES: break
    print('iris', OUT, tuple(img.size), os.path.getsize(OUT), 'bytes', 'quality', q)


main()

"""Image-to-3D trial: put a TRELLIS mesh on the shared rig of the same person's procedural build.

    blender -b <build>/<key>/townsfolk_<key>.blend -P to_game.py -- <trellis.ply> <out_dir> [--tris 15500] [--size 2048]

The procedural .blend supplies the rig (same bone names as every agent), the clips and the skin weights; the
TRELLIS mesh is turned to face the same way, scaled to the same height, reduced, unwrapped, and gets a base
colour and a normal map baked from the full-resolution mesh (vertex colours). Weights come from the nearest
surface of the procedural meshes. The face is a plain surface: no morphs, no blink (the trial's known cost).
Output: <out_dir>/townsfolk_<key>.glb (uncompressed; art/tools/compress-glb.sh makes the game file).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:]
ply, out_dir = argv[0], argv[1]
opt = lambda n, d: int(argv[argv.index(n) + 1]) if n in argv else d
TRIS, SIZE = opt("--tris", 15500), opt("--size", 2048)
name = os.path.splitext(os.path.basename(bpy.data.filepath))[0]
os.makedirs(out_dir, exist_ok=True)

rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
proc = [o for o in bpy.data.objects if o.type == "MESH"]
dg = bpy.context.evaluated_depsgraph_get()


def world_bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))


# ---- the procedural person as one static reference mesh in world space (rest pose)
for o in proc:
    for m in o.modifiers:
        if m.type == "ARMATURE":
            m.show_viewport = False
bpy.context.view_layer.update()
ref_co, ref_poly = [], []
for o in proc:
    base = len(ref_co)
    ref_co.extend(o.matrix_world @ v.co for v in o.data.vertices)
    ref_poly.extend([base + i for i in p.vertices] for p in o.data.polygons)
ref_tree = BVHTree.FromPolygons(ref_co, ref_poly)
lo, hi = world_bounds(proc)
height = hi.z - lo.z
print("[trial] procedural bounds", lo, hi)

# ---- the TRELLIS mesh
bpy.ops.wm.ply_import(filepath=ply)
high = bpy.context.selected_objects[0]
high.name = "trellis_high"
co = [v.co.copy() for v in high.data.vertices]
ext = [max(c[i] for c in co) - min(c[i] for c in co) for i in range(3)]
up = max(range(3), key=lambda i: ext[i])                 # a standing figure: the long axis is up
print("[trial] trellis extents", ext, "up axis", up)
if up == 1:
    high.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
elif up == 0:
    high.data.transform(Matrix.Rotation(math.pi / 2, 4, "Y"))
best = None
sample = None
for flip in (False, True):                              # head up or down
    for k in range(4):                                  # facing
        M = Matrix.Rotation(k * math.pi / 2, 4, "Z") @ (Matrix.Rotation(math.pi, 4, "X") if flip else Matrix.Identity(4))
        pts = [M @ v.co for v in high.data.vertices[::max(1, len(high.data.vertices) // 6000)]]
        zs = [p.z for p in pts]
        s = height / (max(zs) - min(zs))
        cx = (max(p.x for p in pts) + min(p.x for p in pts)) / 2
        cy = (max(p.y for p in pts) + min(p.y for p in pts)) / 2
        T = Matrix.Translation(Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))) @ Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-cx, -cy, -min(zs)))) @ M
        err = 0.0
        for v in high.data.vertices[::max(1, len(high.data.vertices) // 6000)]:
            p = T @ v.co
            err += (ref_tree.find_nearest(p)[3] or 0.0)
        if best is None or err < best[0]:
            best = (err, T, flip, k)
print("[trial] orientation: flip", best[2], "quarter turns", best[3], "mean distance to the procedural body", best[0] / 6000)
high.data.transform(best[1])
high.data.update()

# ---- low mesh: reduce, unwrap
low = high.copy()
low.data = high.data.copy()
low.name = name + "_body"
bpy.context.scene.collection.objects.link(low)
bpy.context.view_layer.objects.active = low
n0 = sum(len(p.vertices) - 2 for p in low.data.polygons)
bm = bmesh.new()
bm.from_mesh(low.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(low.data)
bm.free()
m = low.modifiers.new("d", "DECIMATE")
m.ratio = TRIS / max(1, n0)
bpy.ops.object.modifier_apply(modifier=m.name)
print("[trial] reduced", n0, "->", sum(len(p.vertices) - 2 for p in low.data.polygons))
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
bpy.ops.object.mode_set(mode="OBJECT")
for p in low.data.polygons:
    p.use_smooth = True

# ---- bake base colour and normals from the full mesh
sc = bpy.context.scene
sc.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = "GPU"
except Exception as ex:
    print("[trial] bake on cpu", ex)
sc.cycles.samples = 4
hm = bpy.data.materials.new("high")
hm.use_nodes = True
nt = hm.node_tree
attr = nt.nodes.new("ShaderNodeVertexColor")
attr.layer_name = high.data.color_attributes[0].name if high.data.color_attributes else "Col"
nt.links.new(attr.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
high.data.materials.clear()
high.data.materials.append(hm)
for p in high.data.polygons:
    p.use_smooth = True
lm = bpy.data.materials.new(name)
lm.use_nodes = True
nt = lm.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Roughness"].default_value = 0.82
low.data.materials.clear()
low.data.materials.append(lm)
images = {}
for kind, cs in (("basecolor", "sRGB"), ("normal", "Non-Color")):
    img = bpy.data.images.new(f"{name}_{kind}", SIZE, SIZE, alpha=False)
    img.colorspace_settings.name = cs
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = img
    nt.nodes.active = node
    images[kind] = (img, node)
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    if kind == "basecolor":
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_selected_to_active=True, cage_extrusion=0.012, max_ray_distance=0.03, margin=8)
    else:
        bpy.ops.object.bake(type="NORMAL", use_selected_to_active=True, cage_extrusion=0.012, max_ray_distance=0.03, margin=8)
    img.filepath_raw = os.path.join(out_dir, f"{name}_{kind}.png")
    img.file_format = "PNG"
    img.save()
nt.links.new(images["basecolor"][1].outputs["Color"], bsdf.inputs["Base Color"])
nm = nt.nodes.new("ShaderNodeNormalMap")
nt.links.new(images["normal"][1].outputs["Color"], nm.inputs["Color"])
nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
bpy.data.objects.remove(high)

# ---- weights from the procedural meshes (nearest surface), bind to the rig
bpy.ops.object.select_all(action="DESELECT")
src = []
for o in proc:
    c = o.copy()
    c.data = o.data.copy()
    bpy.context.scene.collection.objects.link(c)
    if c.data.shape_keys:
        c.shape_key_clear()
    for md in list(c.modifiers):
        c.modifiers.remove(md)
    src.append(c)
    c.select_set(True)
bpy.context.view_layer.objects.active = src[0]
bpy.ops.object.join()
src = bpy.context.view_layer.objects.active
src.parent = None
src.matrix_world = proc[0].matrix_world.copy()
low.parent = rig
low.matrix_parent_inverse = rig.matrix_world.inverted()
bpy.context.view_layer.update()
dt = low.modifiers.new("w", "DATA_TRANSFER")
dt.object = src
dt.use_vert_data = True
dt.data_types_verts = {"VGROUP_WEIGHTS"}
dt.vert_mapping = "POLYINTERP_NEAREST"
dt.layers_vgroup_select_src = "ALL"
dt.layers_vgroup_select_dst = "NAME"
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.object.datalayout_transfer(modifier="w")
bpy.ops.object.modifier_apply(modifier="w")
for g in list(low.vertex_groups):
    if g.name not in rig.data.bones:
        low.vertex_groups.remove(g)
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
am = low.modifiers.new("rig", "ARMATURE")
am.object = rig
bpy.data.objects.remove(src)
for o in proc:
    bpy.data.objects.remove(o)
print("[trial] bound", len(low.vertex_groups), "groups")

path = os.path.join(out_dir, name + ".glb")
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
low.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, name + "_trial.blend"))
bpy.ops.export_scene.gltf(
    filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True, export_tangents=True,
    export_extras=False, export_image_format="AUTO", export_cameras=False, export_lights=False, export_skins=True,
    export_all_influences=False, export_def_bones=False, export_animations=True, export_animation_mode="NLA_TRACKS",
    export_force_sampling=True, export_frame_step=1, export_morph=False, export_reset_pose_bones=True,
    export_optimize_animation_size=False, export_rest_position_armature=True)
print("[trial] exported", path, os.path.getsize(path))

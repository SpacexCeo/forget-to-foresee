"""Image-to-3D hybrid: a TRELLIS costume on the shared rig, with the procedural head of the same person.

    blender -b <build>/<key>/townsfolk_<key>.blend -P to_game.py -- <trellis.ply> <out_dir> [--tris 16000] [--size 2048]

The procedural .blend (build_townsfolk.py) supplies the rig (same bone names as every agent), the clips, the face
with its morphs, the eyes, the hair, hat and beard. The TRELLIS mesh (vertex colours, from the FRONT view of the
cast sheet) supplies everything below the neck: it is turned to face the same way, scaled to the same height,
cut at the neck, made watertight (voxel remesh), reduced, unwrapped and gets a base colour and a normal map
baked from the full-resolution mesh. Its weights are Blender's automatic (bone heat) weights on the shared rig.
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
TRIS, SIZE = opt("--tris", 16000), opt("--size", 2048)
name = os.path.splitext(os.path.basename(bpy.data.filepath))[0]
os.makedirs(out_dir, exist_ok=True)
log = lambda *a: print("[hybrid]", *a, flush=True)

rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
face = bpy.data.objects[name + "_face"]
body = bpy.data.objects[name + "_body"]
tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)


def active(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


# ---- the procedural person as a static reference (rest pose, world space)
ref_co, ref_poly = [], []
for o in (face, body):
    base = len(ref_co)
    ref_co.extend(o.matrix_world @ v.co for v in o.data.vertices)
    ref_poly.extend([base + i for i in p.vertices] for p in o.data.polygons)
ref_tree = BVHTree.FromPolygons(ref_co, ref_poly)
lo = Vector((min(p.x for p in ref_co), min(p.y for p in ref_co), min(p.z for p in ref_co)))
hi = Vector((max(p.x for p in ref_co), max(p.y for p in ref_co), max(p.z for p in ref_co)))
height = hi.z - lo.z
bone_z = lambda n: (rig.matrix_world @ rig.data.bones[n].head_local).z
z_head, z_neck = bone_z("head"), bone_z("neck")
z_cut = z_neck + 0.55 * (z_head - z_neck)                # the costume ends in the collar; the head is ours
log("procedural bounds", lo, hi, "neck cut at", round(z_cut, 3))

# ---- the TRELLIS mesh: orient, scale, place
bpy.ops.wm.ply_import(filepath=ply)
high = bpy.context.selected_objects[0]
high.name = "trellis_high"
co = [v.co.copy() for v in high.data.vertices]
ext = [max(c[i] for c in co) - min(c[i] for c in co) for i in range(3)]
up = max(range(3), key=lambda i: ext[i])
if up == 1:
    high.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
elif up == 0:
    high.data.transform(Matrix.Rotation(math.pi / 2, 4, "Y"))
sample = [v.co.copy() for v in high.data.vertices][::max(1, len(high.data.vertices) // 6000)]
best = None
for flip in (False, True):
    for k in range(4):
        M = Matrix.Rotation(k * math.pi / 2, 4, "Z") @ (Matrix.Rotation(math.pi, 4, "X") if flip else Matrix.Identity(4))
        pts = [M @ c for c in sample]
        zs = [p.z for p in pts]
        s = height / (max(zs) - min(zs))
        # centre on the torso (hands and props spread the bounds unevenly): the upper part of the figure
        mid = [p for p in pts if (p.z - min(zs)) / (max(zs) - min(zs)) > 0.72]
        cx = (max(p.x for p in mid) + min(p.x for p in mid)) / 2
        cy = (max(p.y for p in mid) + min(p.y for p in mid)) / 2
        T = Matrix.Translation(Vector((0.0, (lo.y + hi.y) / 2, lo.z))) @ Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-cx, -cy, -min(zs)))) @ M
        err = sum((ref_tree.find_nearest(T @ c)[3] or 0.0) for c in sample)
        if best is None or err < best[0]:
            best = (err, T, flip, k)
log("orientation: flip", best[2], "quarter turns", best[3], "mean distance to the procedural body", round(best[0] / len(sample), 4))
high.data.transform(best[1])
high.data.update()

# ---- drop the generated head and floor scraps; close the neck
bm = bmesh.new()
bm.from_mesh(high.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.co.z > z_cut for v in f.verts)], context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
seen, scraps = set(), []
for v in bm.verts:                                       # connected parts: anything small or lying on the floor goes
    if v in seen:
        continue
    stack, part = [v], []
    seen.add(v)
    while stack:
        a = stack.pop()
        part.append(a)
        for e in a.link_edges:
            b = e.other_vert(a)
            if b not in seen:
                seen.add(b)
                stack.append(b)
    if max(p.co.z for p in part) < 0.035 * height or len(part) < 40:
        scraps.extend(part)
bmesh.ops.delete(bm, geom=scraps, context="VERTS")
bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary and min(v.co.z for v in e.verts) > z_cut - 0.05], sides=0)
bm.to_mesh(high.data)
bm.free()
high.data.update()
log("high mesh", tris(high), "tris after the neck cut; scrap vertices removed", len(scraps))

# ---- our head: the face (morphs), and from the joined body the eyes, hair, hat and beard
HEADSET = ("head", "jaw", "eye", "hair", "lid", "brow")
gi = {g.index: g.name for g in body.vertex_groups}
wz = [(body.matrix_world @ v.co).z for v in body.data.vertices]
keep = set()
for v in body.data.vertices:
    if v.groups and wz[v.index] > z_cut - 0.30 * height:  # braids and ponytails may hang; nothing lower is a head part
        g = max(v.groups, key=lambda x: x.weight)
        if gi[g.group].startswith(HEADSET):
            keep.add(v.index)
bm = bmesh.new()
bm.from_mesh(body.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
bm.to_mesh(body.data)
bm.free()
body.name = name + "_head"
fz = [(face.matrix_world @ v.co).z for v in face.data.vertices]
bm = bmesh.new()
bm.from_mesh(face.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if fz[v.index] < z_neck - 0.02], context="VERTS")
bm.to_mesh(face.data)
bm.free()
head_tris = tris(body) + tris(face)
log("head piece", tris(body), "+ face", tris(face))
for img in bpy.data.images:                              # the head's share of the old atlas does not need 2048
    if img.size[0] > 1024 and img.name.startswith(name):
        img.scale(1024, 1024)
        if img.packed_file:
            img.pack()

# ---- low mesh: watertight, reduced, unwrapped
low = high.copy()
low.data = high.data.copy()
low.name = name + "_body"
bpy.context.scene.collection.objects.link(low)
active(low)
m = low.modifiers.new("r", "REMESH")
m.mode = "VOXEL"
m.voxel_size = 0.0045 * height / 1.75
m.adaptivity = 0.0
bpy.ops.object.modifier_apply(modifier=m.name)
m = low.modifiers.new("d", "DECIMATE")
m.ratio = max(4000, TRIS - head_tris) / max(1, tris(low))
bpy.ops.object.modifier_apply(modifier=m.name)
log("costume reduced to", tris(low), "total", tris(low) + head_tris)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
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
    log("bake on cpu", ex)
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
lm = bpy.data.materials.new(name + "_costume")
lm.use_nodes = True
nt = lm.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Roughness"].default_value = 0.85
low.data.materials.clear()
low.data.materials.append(lm)
images = {}
reach = 0.02 * height / 1.75
for kind, cs in (("basecolor_t", "sRGB"), ("normal_t", "Non-Color")):
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
    if kind.startswith("basecolor"):
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_selected_to_active=True, cage_extrusion=reach, max_ray_distance=reach * 2.5, margin=12)
    else:
        bpy.ops.object.bake(type="NORMAL", use_selected_to_active=True, cage_extrusion=reach, max_ray_distance=reach * 2.5, margin=12)
    img.filepath_raw = os.path.join(out_dir, f"{name}_{kind}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
nt.links.new(images["basecolor_t"][1].outputs["Color"], bsdf.inputs["Base Color"])
nm = nt.nodes.new("ShaderNodeNormalMap")
nt.links.new(images["normal_t"][1].outputs["Color"], nm.inputs["Color"])
nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
bpy.data.objects.remove(high)

# ---- weights: bone heat on the shared rig (body bones only)
FACE_BONES = ("jaw", "lid", "brow", "eye", "prop", "hair")
saved = {b.name: b.use_deform for b in rig.data.bones}
for b in rig.data.bones:
    if b.name.startswith(FACE_BONES):
        b.use_deform = False
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
try:
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
except Exception as ex:
    log("bone heat failed", ex)
for b in rig.data.bones:
    b.use_deform = saved[b.name]
weighted = sum(1 for v in low.data.vertices if any(g.weight > 1e-4 for g in v.groups))
log("bone heat weighted", weighted, "of", len(low.data.vertices))
active(low)
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

path = os.path.join(out_dir, name + ".glb")
bpy.ops.object.select_all(action="DESELECT")
for o in (rig, face, body, low):
    o.select_set(True)
bpy.context.view_layer.objects.active = rig
try:
    bpy.ops.file.pack_all()
except Exception as ex:
    log("pack", ex)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, name + "_hybrid.blend"))
bpy.ops.export_scene.gltf(
    filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True, export_tangents=True,
    export_extras=False, export_image_format="AUTO", export_cameras=False, export_lights=False, export_skins=True,
    export_all_influences=False, export_def_bones=False, export_animations=True, export_animation_mode="NLA_TRACKS",
    export_force_sampling=True, export_frame_step=1, export_morph=True, export_morph_normal=True,
    export_morph_animation=True, export_reset_pose_bones=True, export_optimize_animation_size=False,
    export_rest_position_armature=True)
log("exported", path, os.path.getsize(path), "triangles", tris(low) + tris(body) + tris(face))

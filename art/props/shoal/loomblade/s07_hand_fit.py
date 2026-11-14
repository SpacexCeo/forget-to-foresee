"""Step 7: the hand-fit test (3D review 19). Puts the sword's `socket_grip` in Iris's right palm, closes her hand
on the grip as far as the rig allows without touching it, and renders front / side / top close-ups plus a view at
about the game camera's distance. Writes the numbers and the sword's matrix in the space of her `prop_R` bone,
which is what the client needs to hold the sword (scenes: parent the sword to `prop_R` with this matrix).

    blender -b -t 10 --python s07_hand_fit.py -- --iris iris_plain.glb --sword sword_plain.glb --out <dir>

Both files must be importable by Blender: no meshopt, no KTX2 (gltf-transform dequantize, then drop the textures).
Iris's rig has one bone per finger group (`thumb_R`, `index_R`, `fingers_R`), so "closed" is a knuckle curl, not
three phalanges wrapping the grip; the gap reported is from the closed fingers to the grip.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opt = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
IRIS, SWORD, OUT = opt("--iris"), opt("--sword"), opt("--out", ".")
os.makedirs(OUT, exist_ok=True)
GRIP_R = 0.0125          # the grip's half-width (parts.json radius_x)
PALM = 0.012             # from the hand bone's axis to the palm's skin

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IRIS)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
arm.animation_data_clear()        # the imported clips would put the rest pose back at render time
body = []
for o in bpy.context.scene.objects:
    if o.type != "MESH":
        continue
    if "_col" in o.name or "_col" in o.data.name or o.parent is None:   # the collision prism and the importer's bone shape are not her body
        o.hide_render = True
        o.hide_set(True)
    else:
        body.append(o)
before = set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=SWORD)
sword_objs = [o for o in bpy.context.scene.objects if o not in before]
root = bpy.data.objects.new("sword_root", None)
bpy.context.scene.collection.objects.link(root)
for o in sword_objs:
    if o.parent is None:
        o.parent = root
bpy.context.view_layer.update()
sword_mesh = [o for o in sword_objs if o.type == "MESH"]
tip0 = next(o for o in sword_objs if o.name.startswith("socket_tip")).matrix_world.translation.copy()
grip0 = next(o for o in sword_objs if o.name.startswith("socket_grip")).matrix_world.translation.copy()
axis0 = (tip0 - grip0).normalized()      # the sword's long axis as imported

pb = arm.pose.bones
W = arm.matrix_world


def head(name):
    return W @ pb[name].head


def tail(name):
    return W @ pb[name].tail


def frame():
    hand, fingers, index, thumb, fore = head("hand_R"), head("fingers_R"), head("index_R"), head("thumb_R"), head("forearm_R")
    F = ((fingers + index) / 2 - hand).normalized()             # wrist -> knuckles
    T = thumb - hand
    G = (T - F * T.dot(F)).normalized()                         # across the palm, toward the thumb side: the blade leaves there
    return hand, fore, F, G, F.cross(G).normalized()


# the palm looks at the body in the rest pose (arms down): that fixes which way the palm normal points for this hand
hand, fore, F, G, N = frame()
PALM_SIGN = 1.0 if N.dot(Vector((-hand.x, 0, 0))) > 0 else -1.0


def pose_bone(name, axis_world, deg):
    b = pb[name]
    b.rotation_mode = "QUATERNION"
    m = W @ b.matrix
    piv = m.translation.copy()
    b.matrix = W.inverted() @ (Matrix.Translation(piv) @ Matrix.Rotation(math.radians(deg), 4, axis_world) @ Matrix.Translation(-piv)) @ m
    bpy.context.view_layer.update()


# the ready pose: the upper arm a little forward, the elbow bent, so the hand and the sword are clear of the hip
pose_bone("upperarm_R", Vector((1, 0, 0)), -28)
pose_bone("forearm_R", Vector((1, 0, 0)), -62)
hand, fore, F, G, N = frame()
N = N * PALM_SIGN
index, fingers = head("index_R"), head("fingers_R")
P = hand + F * 0.068 + N * (GRIP_R + PALM)                      # the grip's centre in the palm
# sword frame: long axis -> G, blade width (its edge) -> F
Z = G
X = (F - Z * F.dot(Z)).normalized()
Y = Z.cross(X)
target = Matrix((X, Y, Z)).transposed().to_4x4()
# the imported sword's own frame: long axis axis0, width = local X of the mesh after import
src_z = axis0
src_x = Vector((1, 0, 0)) if abs(axis0.x) < 0.9 else Vector((0, 1, 0))
src_x = (src_x - src_z * src_x.dot(src_z)).normalized()
src = Matrix((src_x, src_z.cross(src_x), src_z)).transposed().to_4x4()


def place(p):
    root.matrix_world = Matrix.Translation(p) @ target @ src.inverted() @ Matrix.Translation(-grip0)
    bpy.context.view_layer.update()


place(P)


def bvh_of(objs, near=None, radius=None):
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    for o in objs:
        me = o.evaluated_get(dg).to_mesh()
        tmp = bmesh.new()
        tmp.from_mesh(me)
        tmp.transform(o.matrix_world)
        if near is not None:
            bmesh.ops.delete(tmp, geom=[v for v in tmp.verts if (v.co - near).length > radius], context="VERTS")
        tm = bpy.data.meshes.new("t")
        tmp.to_mesh(tm)
        bm.from_mesh(tm)
        bpy.data.meshes.remove(tm)
        tmp.free()
        o.evaluated_get(dg).to_mesh_clear()
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    tree = BVHTree.FromBMesh(bm)
    pts = [v.co.copy() for v in bm.verts]
    bm.free()
    return tree, pts


sword_tree, sword_pts = bvh_of(sword_mesh)


def hand_state():
    bpy.context.view_layer.update()
    tree, pts = bvh_of(body, near=P, radius=0.16)
    hit = len(tree.overlap(sword_tree))
    gap = min((sword_tree.find_nearest(p)[3] for p in pts), default=9.0)
    return hit, gap


def curl(name, axis_world, deg):
    """Rotates a pose bone about a world axis through its head."""
    b = pb[name]
    b.rotation_mode = "QUATERNION"
    m = W @ b.matrix
    piv = m.translation.copy()
    rot = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(deg), 4, axis_world) @ Matrix.Translation(-piv)
    b.matrix = W.inverted() @ rot @ m
    bpy.context.view_layer.update()


def reset(name, m):
    pb[name].matrix = m
    bpy.context.view_layer.update()


def curl_sign(name, axis_world):
    """+1 when a positive turn about the axis brings the finger toward the palm side (+N)."""
    rest = pb[name].matrix.copy()
    t0 = tail(name).copy()
    curl(name, axis_world, 20)
    sign = 1 if (tail(name) - t0).dot(N) > 0 else -1
    reset(name, rest)
    return sign


def close(name, axis_world, start, limit):
    """Curls a finger group toward the grip in 3-degree steps from `start` (opened), stops one step before it touches."""
    sign = curl_sign(name, axis_world)
    rest = pb[name].matrix.copy()
    best = start
    for a in range(start, limit + 1, 3):
        reset(name, rest)
        curl(name, axis_world, sign * a)
        if hand_state()[0]:
            break
        best = a
    reset(name, rest)
    curl(name, axis_world, sign * best)
    return best


# open the hand first (the rest pose has the fingers a little curled), then seat the grip on the palm: out along
# the palm normal, 1 mm at a time, until the open hand no longer cuts it
RESTS = {n: pb[n].matrix.copy() for n in ("fingers_R", "index_R", "thumb_R")}
OPEN = {"fingers_R": -36, "index_R": -36, "thumb_R": -30}
AXES = {"fingers_R": G, "index_R": G, "thumb_R": F}
for n in RESTS:
    curl(n, AXES[n], curl_sign(n, AXES[n]) * OPEN[n])
seat = 0.0
for step in range(0, 41):
    seat = step * 0.001
    place(P + N * seat)
    sword_tree, sword_pts = bvh_of(sword_mesh)
    if not hand_state()[0]:
        break
P = P + N * seat
report = {"open_hand": dict(zip(("overlaps", "gap_m"), hand_state())), "palm_seat_mm": round((GRIP_R + PALM + seat) * 1000, 1)}
angles = {}
for n in ("fingers_R", "index_R", "thumb_R"):
    reset(n, RESTS[n])
    angles[n] = close(n, AXES[n], OPEN[n], 99 if n != "thumb_R" else 72)
hit, gap = hand_state()
guard = next(o for o in sword_objs if o.name.startswith("socket_guard")).matrix_world.translation
fore_axis = (hand - fore).normalized()
blade = (root.matrix_world.to_3x3() @ axis0).normalized()
report.update({
    "closed_hand": {"overlaps": hit, "gap_mm": round(gap * 1000, 2), "curl_deg": angles},
    "guard_to_index_knuckle_mm": round((guard - head("index_R")).length * 1000, 1),
    "blade_to_forearm_deg": round(math.degrees(math.acos(max(-1, min(1, blade.dot(fore_axis))))), 1),
    "grip_centre_from_wrist_mm": round((P - hand).length * 1000, 1),
    "sword_in_prop_R": [list(r) for r in ((W @ pb["prop_R"].matrix).inverted() @ root.matrix_world)],
    "sword_in_hand_R": [list(r) for r in ((W @ pb["hand_R"].matrix).inverted() @ root.matrix_world)],
    "note": "one bone per finger group: the hand closes at the knuckles only; gap = closed fingers to the grip surface",
})
json.dump(report, open(os.path.join(OUT, "hand_fit.json"), "w"), indent=1)
print("[handfit]", json.dumps({k: report[k] for k in ("open_hand", "closed_hand", "guard_to_index_knuckle_mm", "blade_to_forearm_deg")}))

# ---- renders: clay figure, the sword in brass and steel
sc = bpy.context.scene
sc.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == kind
            sc.cycles.device = "GPU"
            break
except Exception as exc:
    print("[handfit] cpu render:", exc)
sc.cycles.samples = 128
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1280, 900
sc.render.image_settings.file_format = "JPEG"
sc.render.image_settings.quality = 88
clay = bpy.data.materials.new("clay")
clay.use_nodes = True
clay.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.62, 0.52, 0.46, 1)
clay.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.7
for o in body:
    o.data.materials.clear()
    o.data.materials.append(clay)
steel = bpy.data.materials.new("steel")
steel.use_nodes = True
sb = steel.node_tree.nodes["Principled BSDF"]
sb.inputs["Base Color"].default_value = (0.78, 0.66, 0.42, 1)
sb.inputs["Metallic"].default_value = 0.8
sb.inputs["Roughness"].default_value = 0.35
for o in sword_mesh:
    o.data.materials.clear()
    o.data.materials.append(steel)
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.6, 0.66, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(35))
sc.collection.objects.link(sun)
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
cd = bpy.data.cameras.new("cam")
cd.clip_start = 0.01
cam = bpy.data.objects.new("cam", cd)
sc.collection.objects.link(cam)
sc.camera = cam


def shot(name, loc, tgt, lens):
    cam.location = loc
    cd.lens = lens
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(OUT, f"handfit_{name}.jpg")
    bpy.ops.render.render(write_still=True)
    print("[handfit] render", sc.render.filepath)


shot("front", P + Vector((0.0, -0.5, 0.06)), P, 60)        # from in front of her
shot("side", P + Vector((-0.5, -0.06, 0.06)), P, 60)        # from her right: the back of the hand
shot("palm", P + Vector((0.2, -0.3, 0.1)), P, 45)           # from her left front: the palm side and the fingers
shot("top", P + Vector((-0.04, -0.1, 0.5)), P, 60)          # from above, down the blade
ctr = Vector((0, 0, 1.0))
shot("body_front", ctr + Vector((-0.9, -3.4, 0.35)), ctr, 50)
shot("game", ctr + Vector((1.2, 6.5, 1.6)), ctr, 35)        # behind and above, about the game camera

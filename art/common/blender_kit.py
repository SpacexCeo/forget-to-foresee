"""Shared helpers for the procedural Blender asset sources in art/.

Imported by art/<asset>/build_<asset>.py (Blender 4.5 LTS, run headless with
`blender -b -P art/<asset>/build_<asset>.py -- <stage>`). Pipeline conventions
follow art/anchor/build_anchor.py on branch art/anchor-first: procedural bmesh,
GPU Cycles bakes, glTF export with `_col` collision meshes and `socket_*` empties,
re-import of the exported .glb for QA renders.

Blender is Z-up; the glTF exporter converts to Y-up (Blender -Y becomes glTF +Z).
All dimensions are metres.
"""

import json
import math
import os
import struct
import time

import bpy
import bmesh
from mathutils import Matrix, Vector

TAG = "[ftf]"


def set_tag(tag):
    global TAG
    TAG = f"[{tag}]"


def log(*a):
    print(TAG, *a, flush=True)


# ---------------------------------------------------------------- scene utils

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    return sc


def link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def new_collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def mat_simple(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color[:3], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit[:3], 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        set_blended(m)
    return m


def set_blended(m):
    for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
        try:
            setattr(m, attr, val)
        except (AttributeError, TypeError):
            pass


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def select_only(objs, active):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def join(objs, name):
    select_only(objs, objs[0])
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def duplicate(obj, name, col):
    o = obj.copy()
    o.data = obj.data.copy()
    o.name = name
    o.data.name = name
    o.modifiers.clear()
    link(o, col)
    return o


def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True,
                                         depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    bpy.data.meshes.remove(old)


def finish_shading(obj, angle=32, flat=False):
    if flat:
        obj.data.shade_flat()
    else:
        obj.data.shade_smooth()
        obj.data.set_sharp_from_angle(angle=math.radians(angle))


def bm_object(name, bm, mats, col):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
        me.materials.append(m)
    return link(bpy.data.objects.new(name, me), col)


def triangulate_ngons(obj):
    """MikkTSpace tangents (bake and glTF export) need tris/quads only."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons, quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(obj.data)
    bm.free()
    return len(ngons)


def mesh_tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def smart_uv(obj, margin=0.003, layer=None, angle=52):
    if layer:
        if layer not in obj.data.uv_layers:
            obj.data.uv_layers.new(name=layer)
        obj.data.uv_layers.active = obj.data.uv_layers[layer]
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin,
                             area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def pack_uvs_multi(objs, margin=0.003):
    """Pack the active UV layer of several objects into one shared 0..1 space."""
    select_only(objs, objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, scale=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def box_bm(bm, center, size, rot=None):
    m = Matrix.Translation(center)
    if rot is not None:
        m = m @ rot.to_4x4()
    m = m @ Matrix.Diagonal((*size, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def convex_object(name, points, col):
    """Convex hull object from points (used for `_col` shapes)."""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in points]
    bmesh.ops.convex_hull(bm, input=vs)
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me), col)


def box_col(name, center, size, col, rot=None):
    hx, hy, hz = (s / 2 for s in size)
    pts = [Vector((sx * hx, sy * hy, sz * hz)) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    if rot is not None:
        pts = [rot @ p for p in pts]
    return convex_object(name, [Vector(center) + p for p in pts], col)


def socket(name, loc, col, **extras):
    e = link(bpy.data.objects.new(name, None), col)
    e.empty_display_type = "ARROWS"
    e.empty_display_size = 0.5
    e.location = loc
    e["socket"] = name
    for k, v in extras.items():
        e[k] = v
    return e


def blender_to_gltf(v):
    """Blender Z-up (x, y, z) -> glTF Y-up (x, z, -y)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


# ------------------------------------------------------------- GPU + timing

def use_gpu(sc):
    """Prefer OptiX, then CUDA; fall back to CPU. Returns the device type used."""
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        sc.cycles.device = "CPU"
        return "CPU"
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            devs = [d for d in prefs.devices if d.type == kind]
            if devs:
                for d in prefs.devices:
                    d.use = d.type == kind
                sc.cycles.device = "GPU"
                log("cycles device", kind, [d.name for d in devs])
                return kind
        except Exception as exc:  # device type unsupported in this build
            log("cycles device", kind, "unavailable:", exc)
    sc.cycles.device = "CPU"
    log("cycles device CPU")
    return "CPU"


class StageClock:
    """Wall-clock time per pipeline stage, written into build-stats.json."""

    def __init__(self):
        self.stages = []
        self._name = None
        self._t = None

    def start(self, name):
        self.stop()
        self._name, self._t = name, time.time()
        log(f"== stage {name}")

    def stop(self):
        if self._name:
            dt = time.time() - self._t
            self.stages.append({"stage": self._name, "seconds": round(dt, 2)})
            log(f"== stage {self._name} done in {dt:.1f}s")
            self._name = None


# ------------------------------------------------------------- shader nodes

def _sock(node, ident, out=False):
    for s in (node.outputs if out else node.inputs):
        if s.identifier == ident:
            return s
    raise KeyError(ident)


class NodeKit:
    """Tiny helper for building Cycles node trees in code."""

    def __init__(self, mat):
        self.nt = mat.node_tree
        self.n = self.nt.nodes
        self.l = self.nt.links

    def new(self, kind, **props):
        node = self.n.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def link(self, a, b):
        self.l.new(a, b)

    def _in(self, sock, v):
        if isinstance(v, (int, float)):
            sock.default_value = v
        elif isinstance(v, tuple):
            sock.default_value = (*v[:3], 1.0) if len(sock.default_value) == 4 else v
        else:
            self.link(v, sock)

    def coord(self, kind="Object"):
        return self.new("ShaderNodeTexCoord").outputs[kind]

    def attr(self, name):
        a = self.new("ShaderNodeAttribute", attribute_name=name)
        return a

    def vmath(self, op, a, b):
        m = self.new("ShaderNodeVectorMath", operation=op)
        self.link(a, m.inputs[0])
        if isinstance(b, (int, float)):
            m.inputs[1].default_value = (b, b, b)
        else:
            self.link(b, m.inputs[1])
        return m.outputs[0]

    def vscale(self, vec, s):
        m = self.new("ShaderNodeVectorMath", operation="SCALE")
        self.link(vec, m.inputs[0])
        m.inputs["Scale"].default_value = s
        return m.outputs[0]

    def noise(self, vec, scale, detail=4.0, rough=0.55, dims="3D", w=None, color=False):
        t = self.new("ShaderNodeTexNoise", noise_dimensions=dims)
        self.link(vec, t.inputs["Vector"])
        t.inputs["Scale"].default_value = scale
        t.inputs["Detail"].default_value = detail
        t.inputs["Roughness"].default_value = rough
        if w is not None:
            self._in(t.inputs["W"], w)
        return t.outputs["Color" if color else "Fac"]

    def voronoi(self, vec, scale, feature="F1", out="Distance", rand=1.0, dims="3D"):
        t = self.new("ShaderNodeTexVoronoi", feature=feature, voronoi_dimensions=dims)
        self.link(vec, t.inputs["Vector"])
        t.inputs["Scale"].default_value = scale
        t.inputs["Randomness"].default_value = rand
        return t.outputs[out]

    def maprange(self, val, a, b, c=0.0, d=1.0):
        m = self.new("ShaderNodeMapRange", clamp=True)
        self.link(val, m.inputs[0])
        for i, v in enumerate((a, b, c, d), start=1):
            m.inputs[i].default_value = v
        return m.outputs[0]

    def math(self, op, a, b=None, clamp=False):
        m = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            self._in(m.inputs[i], v)
        return m.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        m = self.new("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_factor=True)
        for ident, v in (("Factor_Float", fac), ("A_Color", a), ("B_Color", b)):
            s = _sock(m, ident)
            if isinstance(v, (int, float)):
                s.default_value = v if ident == "Factor_Float" else (v, v, v, 1.0)
            elif isinstance(v, tuple):
                s.default_value = (*v[:3], 1.0)
            else:
                self.link(v, s)
        return _sock(m, "Result_Color", out=True)

    def ramp(self, fac, stops):
        r = self.new("ShaderNodeValToRGB")
        self.link(fac, r.inputs["Fac"])
        el = r.color_ramp.elements
        el[0].position, el[0].color = stops[0][0], (*stops[0][1], 1)
        el[1].position, el[1].color = stops[-1][0], (*stops[-1][1], 1)
        for pos, c in stops[1:-1]:
            e = el.new(pos)
            e.color = (*c, 1)
        return r.outputs["Color"]

    def sepxyz(self, vec):
        s = self.new("ShaderNodeSeparateXYZ")
        self.link(vec, s.inputs[0])
        return s.outputs

    def ao(self, dist, samples=16):
        a = self.new("ShaderNodeAmbientOcclusion", samples=samples, only_local=True)
        a.inputs["Distance"].default_value = dist
        return a.outputs["AO"]

    def geometry(self):
        return self.new("ShaderNodeNewGeometry")


class BakeMaterial:
    """A Cycles authoring material whose output can be switched between the full
    BSDF (normal bakes) and an Emission of one channel (colour/rough/metal/emit
    bakes). Every one carries an inactive image node `BakeTarget`."""

    def __init__(self, name):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.k = NodeKit(self.mat)
        self.k.n.remove(self.k.n["Principled BSDF"])
        self.out = self.k.n["Material Output"]
        self.bsdf = self.k.new("ShaderNodeBsdfPrincipled")
        self.emit = self.k.new("ShaderNodeEmission")
        self.emit.inputs["Strength"].default_value = 1.0
        self.target = self.k.new("ShaderNodeTexImage")
        self.target.name = "BakeTarget"
        self.uvmap = self.k.new("ShaderNodeUVMap")
        self.k.link(self.uvmap.outputs["UV"], self.target.inputs["Vector"])
        self.channels = {}

    def set(self, color, rough, metal=0.0, normal=None, emission=(0.0, 0.0, 0.0), alpha=None):
        k, b = self.k, self.bsdf
        k._in(b.inputs["Base Color"], color)
        k._in(b.inputs["Roughness"], rough)
        k._in(b.inputs["Metallic"], metal)
        if normal is not None:
            k.link(normal, b.inputs["Normal"])
        self.channels = {"color": color, "rough": rough, "metal": metal, "emission": emission}
        if alpha is not None:
            self.channels["alpha"] = alpha
        self.route("bsdf")

    def route(self, channel):
        k = self.k
        for lk in list(self.out.inputs["Surface"].links):
            k.l.remove(lk)
        for lk in list(self.emit.inputs["Color"].links):
            k.l.remove(lk)
        if channel == "bsdf":
            k.link(self.bsdf.outputs["BSDF"], self.out.inputs["Surface"])
            return
        v = self.channels.get(channel, 0.0)
        if isinstance(v, (int, float)):
            self.emit.inputs["Color"].default_value = (v, v, v, 1)
        elif isinstance(v, tuple):
            self.emit.inputs["Color"].default_value = (*v[:3], 1)
        else:
            k.link(v, self.emit.inputs["Color"])
        k.link(self.emit.outputs["Emission"], self.out.inputs["Surface"])

    def aim(self, image, uv_layer=""):
        self.target.image = image
        self.uvmap.uv_map = uv_layer
        self.k.n.active = self.target


def bump_normal(k, height, strength, distance):
    bump = k.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance
    k.link(height, bump.inputs["Height"])
    return bump.outputs["Normal"]


# ---------------------------------------------------------------- baking

def new_float_image(name, w, h=None, data=True):
    img = bpy.data.images.new(name, w, h or w, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color" if data else "Linear Rec.709"
    return img


def bake(sc, kind, objs, active, samples, selected_to_active=False, margin=16, **kw):
    select_only(objs, active)
    sc.cycles.samples = samples
    t = time.time()
    args = dict(type=kind, margin=margin, margin_type="EXTEND", target="IMAGE_TEXTURES",
                use_selected_to_active=selected_to_active)
    args.update(kw)
    bpy.ops.object.bake(**args)
    dt = time.time() - t
    log(f"bake {kind:8s} ({samples} spp, {len(objs)} objs) {dt:.1f}s")
    return round(dt, 2)


def pixels(img):
    import numpy as np
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def downsample(a, f):
    if f == 1:
        return a
    h, w, c = a.shape
    return a.reshape(h // f, f, w // f, f, c).mean(axis=(1, 3))


def to_srgb(c):
    import numpy as np
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def save_img(arr01, path, quality=92, mode=None):
    """Save a bottom-up float array (Blender pixel order) with Pillow.
    arr01: HxW (grey), HxWx3 or HxWx4 in 0..1."""
    import numpy as np
    from PIL import Image
    a = np.clip(arr01, 0, 1)[::-1]
    u8 = (a * 255.0 + 0.5).astype(np.uint8)
    if u8.ndim == 2:
        im = Image.fromarray(u8, "L")
    elif u8.shape[2] == 4:
        im = Image.fromarray(u8, "RGBA")
    else:
        im = Image.fromarray(u8, "RGB")
    if mode:
        im = im.convert(mode)
    if path.endswith(".jpg"):
        im.save(path, quality=quality, subsampling=0, optimize=True)
    else:
        im.save(path, optimize=True)
    return path


def normal_to_rgb(n):
    import numpy as np
    n = n * 2.0 - 1.0
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    return n * 0.5 + 0.5


# ---------------------------------------------------------- final materials

def gltf_output_group():
    name = "glTF Material Output"
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    g = bpy.data.node_groups.new(name, "ShaderNodeTree")
    g.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.nodes.new("NodeGroupInput")
    return g


def pbr_material(name, base=None, orm=None, normal=None, ao=None, ao_uv=None, emissive=None,
                 emissive_strength=1.0, base_alpha=False, rough=0.5, metal=0.0, color=None,
                 normal_strength=1.0, uv=None):
    """glTF-ready Principled material from texture images.
    orm: R unused/AO, G roughness, B metallic. ao: separate occlusion image, may use
    another UV layer (ao_uv) so a tiling material can carry a unique baked AO."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    L = nt.links

    def tex(img):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        if uv:
            u = nt.nodes.new("ShaderNodeUVMap")
            u.uv_map = uv
            L.new(u.outputs["UV"], t.inputs["Vector"])
        return t

    if base is not None:
        tb = tex(base)
        L.new(tb.outputs["Color"], b.inputs["Base Color"])
        if base_alpha:
            L.new(tb.outputs["Alpha"], b.inputs["Alpha"])
    elif color is not None:
        b.inputs["Base Color"].default_value = (*color[:3], 1)
    if orm is not None:
        to = tex(orm)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        L.new(to.outputs["Color"], sep.inputs["Color"])
        L.new(sep.outputs["Green"], b.inputs["Roughness"])
        L.new(sep.outputs["Blue"], b.inputs["Metallic"])
        if ao is None:
            grp = nt.nodes.new("ShaderNodeGroup")
            grp.node_tree = gltf_output_group()
            L.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    else:
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
    if ao is not None:
        ta = nt.nodes.new("ShaderNodeTexImage")
        ta.image = ao
        if ao_uv:
            u = nt.nodes.new("ShaderNodeUVMap")
            u.uv_map = ao_uv
            L.new(u.outputs["UV"], ta.inputs["Vector"])
        sep2 = nt.nodes.new("ShaderNodeSeparateColor")
        L.new(ta.outputs["Color"], sep2.inputs["Color"])
        grp = nt.nodes.new("ShaderNodeGroup")
        grp.node_tree = gltf_output_group()
        L.new(sep2.outputs["Red"], grp.inputs["Occlusion"])
    if normal is not None:
        tn = tex(normal)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        if uv:
            nm.uv_map = uv
        L.new(tn.outputs["Color"], nm.inputs["Color"])
        L.new(nm.outputs["Normal"], b.inputs["Normal"])
    if emissive is not None:
        te = tex(emissive)
        L.new(te.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = emissive_strength
    return m


def load_image(path, data=False):
    img = bpy.data.images.load(path)
    if data:
        img.colorspace_settings.name = "Non-Color"
    return img


# ------------------------------------------------------------- glTF patching

def read_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, ver, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a GLB"
    off = 12
    js, binc = None, b""
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            binc = chunk
        off += 8 + clen
    return js, binc


def write_glb(path, js, binc):
    jb = json.dumps(js, separators=(",", ":")).encode("utf-8")
    jb += b" " * ((4 - len(jb) % 4) % 4)
    bb = binc + b"\0" * ((4 - len(binc) % 4) % 4)
    total = 12 + 8 + len(jb) + (8 + len(bb) if bb else 0)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, total))
        fh.write(struct.pack("<II", len(jb), 0x4E4F534A))
        fh.write(jb)
        if bb:
            fh.write(struct.pack("<II", len(bb), 0x004E4942))
            fh.write(bb)


def patch_materials(path, patches):
    """patches: {material_name: {extension_name: {...}} or {"_set": {key: value}}}.
    Adds glTF material extensions the Blender exporter does not write (e.g.
    KHR_materials_iridescence). Returns a summary of what was patched."""
    js, binc = read_glb(path)
    used = set(js.get("extensionsUsed", []))
    done = {}
    for m in js.get("materials", []):
        p = patches.get(m.get("name"))
        if not p:
            continue
        for ext, val in p.items():
            if ext == "_set":
                for k, v in val.items():
                    m[k] = v
                continue
            m.setdefault("extensions", {})
            if ext not in m["extensions"]:
                m["extensions"][ext] = val
                used.add(ext)
                done.setdefault(m["name"], []).append(ext)
    js["extensionsUsed"] = sorted(used)
    write_glb(path, js, binc)
    return done


def glb_summary(path):
    """Measured facts from the shipped file: triangles per mesh, materials,
    images, node names, extensions, texCoord use."""
    js, binc = read_glb(path)
    acc = js.get("accessors", [])
    meshes = {}
    total = 0
    for me in js.get("meshes", []):
        n = 0
        for p in me["primitives"]:
            if "indices" in p:
                n += acc[p["indices"]]["count"] // 3
            else:
                n += acc[p["attributes"]["POSITION"]]["count"] // 3
        meshes[me.get("name", "?")] = n
    for nd in js.get("nodes", []):
        pass
    images = []
    for im in js.get("images", []):
        bv = js["bufferViews"][im["bufferView"]] if "bufferView" in im else None
        images.append({"name": im.get("name"), "mime": im.get("mimeType"),
                       "bytes": bv["byteLength"] if bv else None})
    mats = []
    for m in js.get("materials", []):
        info = {"name": m.get("name"), "alphaMode": m.get("alphaMode", "OPAQUE"),
                "doubleSided": m.get("doubleSided", False),
                "extensions": sorted(m.get("extensions", {}).keys())}
        tc = {}
        pbr = m.get("pbrMetallicRoughness", {})
        for key, t in (("baseColor", pbr.get("baseColorTexture")),
                       ("metallicRoughness", pbr.get("metallicRoughnessTexture")),
                       ("normal", m.get("normalTexture")), ("occlusion", m.get("occlusionTexture")),
                       ("emissive", m.get("emissiveTexture"))):
            if t is not None:
                tc[key] = t.get("texCoord", 0)
        info["texCoord"] = tc
        mats.append(info)
    node_names = [nd.get("name") for nd in js.get("nodes", [])]
    for me_name in meshes:
        pass
    return {"meshes": meshes, "materials": mats, "images": images, "nodes": node_names,
            "extensionsUsed": js.get("extensionsUsed", []), "glb_bytes": os.path.getsize(path),
            "has_tangents": all("TANGENT" in p["attributes"] for me in js.get("meshes", [])
                                for p in me["primitives"]
                                if "normalTexture" in js["materials"][p.get("material", 0)]
                                ) if js.get("materials") else None,
            "animations": len(js.get("animations", []))}


# ------------------------------------------------------------- QA rendering

def setup_render(sc, w=1920, h=1080, samples=256, exposure=0.0):
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 90
    sc.cycles.max_bounces = 8
    sc.cycles.volume_bounces = 1
    sc.cycles.transmission_bounces = 8
    sc.cycles.transparent_max_bounces = 16


def set_world(sc, color=(0.34, 0.38, 0.37), strength=0.55):
    world = bpy.data.worlds.new("ReviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*color, 1.0)
    bg.inputs["Strength"].default_value = strength
    sc.world = world
    return world


def add_camera(name, loc, target, lens=35, ortho=None, clip_start=0.05, clip_end=500):
    cam = bpy.data.cameras.new(name)
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    else:
        cam.lens = lens
    cam.clip_start = clip_start
    cam.clip_end = clip_end
    obj = link(bpy.data.objects.new(name, cam))
    obj.location = loc
    d = Vector(target) - Vector(loc)
    if d.length > 1e-6:
        up = "Y" if abs(d.normalized().z) < 0.999 else "Y"
        obj.rotation_euler = d.to_track_quat("-Z", up).to_euler()
    return obj


def render_to(sc, cam, path, w=None, h=None):
    sc.camera = cam
    if w:
        sc.render.resolution_x = w
    if h:
        sc.render.resolution_y = h
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    dt = round(time.time() - t, 2)
    log(f"rendered {os.path.basename(path)} in {dt}s")
    return dt


def human_proxy(col, loc, mat=None, height=1.75):
    """Simple 1.75 m human proxy (capsule body + head) for scale."""
    mat = mat or mat_simple("HumanProxy", (0.42, 0.40, 0.38), 0.8)
    x, y, z = loc
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.17, depth=height - 0.25,
                                        location=(x, y, z + (height - 0.25) / 2))
    body = bpy.context.object
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.115,
                                         location=(x, y, z + height - 0.115))
    head = bpy.context.object
    for o in (body, head):
        o.data.materials.append(mat)
        for c in o.users_collection:
            c.objects.unlink(o)
        col.objects.link(o)
    return body, head


def fibonacci_dirs(n):
    out = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(max(0.0, 1 - z * z))
        out.append(Vector((r * math.cos(ga * i), r * math.sin(ga * i), z)))
    return out


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(data, fh, indent=2)

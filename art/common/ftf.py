"""Shared Blender helpers for the procedural art of Forget to Foresee.

Used by art/island/build_island.py and art/camps/build_camps.py (Blender 4.5 LTS,
run headless: `blender -b -P <script> -- <stage>`). The pipeline follows
art/anchor/build_anchor.py: procedural geometry -> UVs -> GPU Cycles bakes ->
glTF export with `_col` collision meshes and `socket_*` empties -> re-import QA
renders. Blender is Z-up with the front facing -Y; the glTF exporter converts to
Y-up with the front facing +Z. All dimensions are metres.
"""

import json
import math
import os
import struct
import time

import bpy
import bmesh
from mathutils import Matrix, Vector

TAU = 2.0 * math.pi


def log(tag, *a):
    print(f"[{tag}]", *a, flush=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    return sc


def new_collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def select_only(objs, active=None):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def join(objs, name):
    objs = [o for o in objs if o is not None]
    select_only(objs, objs[0])
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True,
                                         depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    bpy.data.meshes.remove(old)


def triangulate_ngons(obj):
    """MikkTSpace tangents (bakes and glTF export) need tris/quads only."""
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


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def add_empty(name, loc, col, rot_z=0.0, props=None, size=0.5):
    e = link(bpy.data.objects.new(name, None), col)
    e.empty_display_type = "ARROWS"
    e.empty_display_size = size
    e.location = loc
    e.rotation_euler = (0, 0, rot_z)
    for k, v in (props or {}).items():
        e[k] = v
    return e


def finish_shading(obj, angle=35, flat=False):
    if flat:
        obj.data.shade_flat()
    else:
        obj.data.shade_smooth()
        obj.data.set_sharp_from_angle(angle=math.radians(angle))


class StageClock:
    """Wall-clock time per pipeline stage, written into build-stats.json."""

    def __init__(self, tag):
        self.tag = tag
        self.stages = []
        self._name = None
        self._t = None

    def start(self, name):
        self.stop()
        self._name, self._t = name, time.time()
        log(self.tag, f"== stage {name}")

    def stop(self):
        if self._name:
            dt = time.time() - self._t
            self.stages.append({"stage": self._name, "seconds": round(dt, 2)})
            log(self.tag, f"== stage {self._name} done in {dt:.1f}s")
            self._name = None


def use_gpu(sc, tag="ftf"):
    """Prefer OptiX, then CUDA; fall back to CPU. Returns the device type used."""
    sc.render.engine = "CYCLES"
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
                log(tag, "cycles device", kind, [d.name for d in devs])
                return kind
        except Exception as exc:  # device type unsupported in this build
            log(tag, "cycles device", kind, "unavailable:", exc)
    sc.cycles.device = "CPU"
    return "CPU"


# ------------------------------------------------------- polygon soup builder

class Geo:
    """Polygon soup for one material: positions, faces, per-corner UV (metres)
    and per-corner linear vertex colour. Converted to a mesh object at the end."""

    def __init__(self):
        self.v = []
        self.f = []
        self.uv = []
        self.col = []

    def vert(self, p):
        self.v.append((float(p[0]), float(p[1]), float(p[2])))
        return len(self.v) - 1

    def face(self, idx, uvs, cols=None):
        self.f.append(tuple(idx))
        self.uv.append(tuple((float(u), float(v)) for u, v in uvs))
        if cols is None:
            cols = [(1.0, 1.0, 1.0)] * len(idx)
        elif len(cols) == 3 and isinstance(cols[0], (int, float)):
            cols = [cols] * len(idx)
        self.col.append(tuple(tuple(c[:3]) for c in cols))

    def poly(self, pts, uvs, cols=None):
        """Adds a polygon from positions (new vertices)."""
        self.face([self.vert(p) for p in pts], uvs, cols)

    def tri_count(self):
        return sum(len(f) - 2 for f in self.f)

    def to_object(self, name, mat, col, uv_tile=1.0, color_fn=None):
        """Creates the mesh. UVs are divided by uv_tile (metres per texture repeat).
        color_fn(pos, normal, rgb) -> rgb post-processes the vertex colours."""
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        # Create every layer first and look them up by name afterwards: on Blender 4.5
        # adding an attribute can reallocate the layers and leave older Python
        # references pointing at stale data (the UVs silently stay at their defaults).
        me.uv_layers.new(name="UVMap")
        me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        flat_uv = [c for face in self.uv for c in face]
        flat_col = [c for face in self.col for c in face]
        if len(flat_uv) != len(me.loops):
            raise RuntimeError(f"{name}: loop count mismatch ({len(flat_uv)} vs {len(me.loops)})")
        inv = 1.0 / uv_tile
        me.uv_layers["UVMap"].data.foreach_set("uv", [x * inv for uv in flat_uv for x in uv])
        me.update()
        if flat_uv:
            got = tuple(me.uv_layers["UVMap"].data[len(flat_uv) - 1].uv)
            want = (flat_uv[-1][0] * inv, flat_uv[-1][1] * inv)
            if abs(got[0] - want[0]) > 1e-3 or abs(got[1] - want[1]) > 1e-3:
                raise RuntimeError(f"{name}: UV write did not stick ({got} vs {want})")
        ca = me.color_attributes["Col"]
        if color_fn:
            out = []
            k = 0
            for poly in me.polygons:
                nrm = poly.normal.copy()
                for li in poly.loop_indices:
                    vpos = me.vertices[me.loops[li].vertex_index].co
                    out.append(color_fn(vpos, nrm, flat_col[k]))
                    k += 1
            flat_col = out
        ca.data.foreach_set("color", [x for c in flat_col for x in (c[0], c[1], c[2], 1.0)])
        me.color_attributes.active_color = ca
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except AttributeError:
            pass
        if mat is not None:
            me.materials.append(mat)
        return link(bpy.data.objects.new(name, me), col)


def loft(geo, sections, closed_section=True, cols=None, flip=False):
    """Skins sections (lists of 3D points, same count). UV: u = distance along the
    loft (metres), v = perimeter distance along the first section."""
    n = len(sections[0])
    m = len(sections)
    cents = [sum((Vector(p) for p in s), Vector()) / n for s in sections]
    along = [0.0]
    for a, b in zip(cents, cents[1:]):
        along.append(along[-1] + (b - a).length)
    s0 = [Vector(p) for p in sections[0]]
    per = [0.0]
    for k in range(1, n + 1):
        per.append(per[-1] + (s0[k % n] - s0[k - 1]).length)
    idx = [[geo.vert(p) for p in s] for s in sections]
    rng = range(n) if closed_section else range(n - 1)
    for i in range(m - 1):
        for k in rng:
            k2 = (k + 1) % n
            q = [idx[i][k], idx[i + 1][k], idx[i + 1][k2], idx[i][k2]]
            uv = [(along[i], per[k]), (along[i + 1], per[k]), (along[i + 1], per[k + 1]),
                  (along[i], per[k + 1])]
            c = None
            if cols:
                c = [cols[i][k], cols[i + 1][k], cols[i + 1][k2], cols[i][k2]]
            if flip:
                q.reverse(); uv.reverse()
                if c:
                    c.reverse()
            geo.face(q, uv, c)


# ---------------------------------------------------------- bmesh primitives

def bm_object(name, bm, mat, col):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    if mat is not None:
        me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), col)


def revolve(bm, profile, n, rfunc=None, phase=0.0, cap_bottom=False, cap_top=False,
            center=(0, 0, 0)):
    """Surface of revolution. Profile (r, z) runs bottom to top along the outside."""
    cx, cy, cz = center
    rings = []
    for r, z in profile:
        ring = []
        for i in range(n):
            th = phase + TAU * i / n
            rr = rfunc(th, z, r) if rfunc else r
            rr = max(rr, 1e-4)
            ring.append(bm.verts.new((cx + rr * math.cos(th), cy + rr * math.sin(th), cz + z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    return rings


def tube(bm, pts, radius, sides, closed=False, cap=True):
    """Swept circle along a polyline with parallel-transport frames."""
    pts = [Vector(p) for p in pts]
    m = len(pts)
    rings, u, prev_t = [], None, None
    for i, p in enumerate(pts):
        if closed:
            t = (pts[(i + 1) % m] - pts[(i - 1) % m]).normalized()
        else:
            t = (pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized()
        if u is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(ref).normalized()
        else:
            u = prev_t.rotation_difference(t) @ u
            u = (u - t * u.dot(t)).normalized()
        v = t.cross(u)
        r = radius(i / (m - 1)) if callable(radius) else radius
        rings.append([bm.verts.new(p + r * (math.cos(a) * u + math.sin(a) * v))
                      for a in (TAU * k / sides for k in range(sides))])
        prev_t = t
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        for k in range(sides):
            l_ = (k + 1) % sides
            bm.faces.new((a[k], a[l_], b[l_], b[k]))
    if cap and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return rings


def _rot4(rot):
    if rot is None:
        return Matrix.Identity(4)
    if isinstance(rot, (int, float)):
        return Matrix.Rotation(rot, 4, "Z")
    if hasattr(rot, "to_matrix"):
        return rot.to_matrix().to_4x4()
    return rot.to_4x4() if len(rot) == 3 else rot


def box(bm, center, size, rot=None):
    """Box of `size` at `center`, rotated by `rot` (Matrix, Euler or z angle)."""
    m = Matrix.Translation(center) @ _rot4(rot) @ Matrix.Diagonal((*size, 1))
    return bmesh.ops.create_cube(bm, size=1.0, matrix=m)["verts"]


def frame_from_x(a, b, up=(0, 0, 1)):
    a, b = Vector(a), Vector(b)
    x = (b - a).normalized()
    upv = Vector(up)
    if abs(x.dot(upv)) > 0.99:
        upv = Vector((0, 1, 0))
    y = upv.cross(x).normalized()
    z = x.cross(y).normalized()
    return Matrix((x, y, z)).transposed()


def beam(bm, a, b, w, h, up=(0, 0, 1)):
    """Box whose centre line runs from a to b (cross-section w x h)."""
    a, b = Vector(a), Vector(b)
    R = frame_from_x(a, b, up)
    return box(bm, (a + b) / 2, ((b - a).length, w, h), R)


def prism_ngon(bm, n, r0, r1, z0, z1, center=(0, 0), phase=None):
    """Closed n-gon frustum (convex), for collision and simple shapes."""
    ph = math.pi / n if phase is None else phase
    return revolve(bm, [(r0, z0), (r1, z1)], n, phase=ph, cap_bottom=True, cap_top=True,
                   center=(center[0], center[1], 0))


# ------------------------------------------------------- image utilities

def pixels(img):
    import numpy as np
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def downsample(a, f):
    h, w = a.shape[:2]
    if a.ndim == 2:
        return a.reshape(h // f, f, w // f, f).mean(axis=(1, 3))
    return a.reshape(h // f, f, w // f, f, a.shape[2]).mean(axis=(1, 3))


def to_srgb(c):
    import numpy as np
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def save_rgb(arr01, path, quality=None):
    """Saves a bottom-up float RGB array (Blender pixel order) with Pillow."""
    import numpy as np
    from PIL import Image
    os.makedirs(os.path.dirname(path), exist_ok=True)
    u8 = (np.clip(arr01, 0, 1)[::-1] * 255.0 + 0.5).astype(np.uint8)
    im = Image.fromarray(u8, "RGB")
    if path.endswith(".jpg"):
        im.save(path, quality=quality or 92, subsampling=0, optimize=True)
    else:
        im.save(path, optimize=True)
    return path


def blur_wrap(a, radius):
    """Separable box blur (3 passes ~ gaussian) with wrap-around (tiling)."""
    import numpy as np
    out = a.astype(np.float32)
    r = max(1, int(radius))
    for _ in range(3):
        for axis in (0, 1):
            n = out.shape[axis]
            pad = np.concatenate([out.take(range(n - r - 1, n), axis=axis), out,
                                  out.take(range(0, r), axis=axis)], axis=axis)
            c = np.cumsum(pad, axis=axis, dtype=np.float64)
            hi = c.take(range(2 * r + 1, 2 * r + 1 + n), axis=axis)
            lo = c.take(range(0, n), axis=axis)
            out = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return out


def normal_from_height(h, strength):
    """Tangent-space (OpenGL, +Y = +V) normal map from a tiling height field
    (bottom-up rows)."""
    import numpy as np
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    n = np.stack([-dx * strength, -dy * strength, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def cavity_ao(h, radius, strength):
    """Cheap tiling AO from height: darker where the surface sits below its
    blurred neighbourhood."""
    import numpy as np
    d = h - blur_wrap(h, radius)
    return np.clip(1.0 + d * strength, 0.25, 1.0)


def periodic_voronoi(size, grid, seed, jitter=0.9, chunk=64):
    """Tiling Voronoi on a size x size image with grid x grid jittered cells.
    Returns (distance to the nearest edge in cell units, cell id), bottom-up rows."""
    import numpy as np
    rng = np.random.default_rng(seed)
    gi, gj = np.meshgrid(np.arange(grid), np.arange(grid), indexing="ij")
    pts = np.stack([(gi.ravel() + 0.5 + jitter * (rng.random(grid * grid) - 0.5)) / grid,
                    (gj.ravel() + 0.5 + jitter * (rng.random(grid * grid) - 0.5)) / grid], -1)
    ids = np.arange(grid * grid)
    P, I = [], []
    for ox in (-1, 0, 1):
        for oy in (-1, 0, 1):
            P.append(pts + np.array([ox, oy]))
            I.append(ids)
    P = np.concatenate(P).astype(np.float32)
    I = np.concatenate(I)
    xs = ((np.arange(size) + 0.5) / size).astype(np.float32)
    edge = np.empty((size, size), np.float32)
    cid = np.empty((size, size), np.int32)
    for r0 in range(0, size, chunk):
        yy = xs[r0:r0 + chunk]
        d = (xs[None, :, None] - P[None, None, :, 0]) ** 2 + (yy[:, None, None] - P[None, None, :, 1]) ** 2
        two = np.argpartition(d, 1, axis=-1)[..., :2]
        dd = np.take_along_axis(d, two, -1)
        sw = dd[..., 0] > dd[..., 1]
        f1 = np.where(sw, dd[..., 1], dd[..., 0])
        f2 = np.where(sw, dd[..., 0], dd[..., 1])
        i1 = np.where(sw, two[..., 1], two[..., 0])
        edge[r0:r0 + chunk] = (np.sqrt(f2) - np.sqrt(f1)) * 0.5 * grid
        cid[r0:r0 + chunk] = I[i1]
    return edge, cid


def smoothstep(a, b, x):
    import numpy as np
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------- node helpers

def _sock(node, ident, out=False):
    for s in (node.outputs if out else node.inputs):
        if s.identifier == ident:
            return s
    raise KeyError(ident)


class NodeKit:
    """Terse node-graph construction for procedural Cycles materials."""

    def __init__(self, mat):
        self.mat = mat
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
            if hasattr(sock.default_value, "__len__"):
                sock.default_value = [v] * len(sock.default_value)
            else:
                sock.default_value = v
        elif isinstance(v, tuple):
            n = len(sock.default_value)
            sock.default_value = v[:n] if len(v) >= n else (*v, 1.0)
        else:
            self.link(v, sock)

    def coord(self, kind="Object"):
        return self.new("ShaderNodeTexCoord").outputs[kind]

    def noise(self, vec, scale, detail=4.0, rough=0.55, w=None, distortion=0.0, out="Fac"):
        t = self.new("ShaderNodeTexNoise")
        if w is not None:
            t.noise_dimensions = "4D"
            self._in(t.inputs["W"], w)
        self._in(t.inputs["Vector"], vec)
        self._in(t.inputs["Scale"], scale)
        t.inputs["Detail"].default_value = detail
        t.inputs["Roughness"].default_value = rough
        t.inputs["Distortion"].default_value = distortion
        return t.outputs[out]

    def voronoi(self, vec, scale, feature="F1", w=None, rand=1.0, out="Distance"):
        t = self.new("ShaderNodeTexVoronoi")
        t.feature = feature
        if w is not None:
            t.voronoi_dimensions = "4D"
            self._in(t.inputs["W"], w)
        self._in(t.inputs["Vector"], vec)
        self._in(t.inputs["Scale"], scale)
        t.inputs["Randomness"].default_value = rand
        return t.outputs[out]

    def wave(self, vec, scale, distortion=2.0, detail=2.0, direction="Z", kind="BANDS",
             profile="SIN"):
        t = self.new("ShaderNodeTexWave", wave_type=kind)
        if kind == "BANDS":
            t.bands_direction = direction
        else:
            t.rings_direction = direction
        t.wave_profile = profile
        self._in(t.inputs["Vector"], vec)
        t.inputs["Scale"].default_value = scale
        t.inputs["Distortion"].default_value = distortion
        t.inputs["Detail"].default_value = detail
        return t.outputs["Fac"]

    def maprange(self, val, a, b, c=0.0, d=1.0, clamp=True):
        m = self.new("ShaderNodeMapRange", clamp=clamp)
        self._in(m.inputs[0], val)
        for i, v in enumerate((a, b, c, d), start=1):
            self._in(m.inputs[i], v)
        return m.outputs[0]

    def math(self, op, a, b=None, c=None, clamp=False):
        m = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            self._in(m.inputs[i], v)
        return m.outputs[0]

    def vmath(self, op, a, b=None, scale=None):
        m = self.new("ShaderNodeVectorMath", operation=op)
        self._in(m.inputs[0], a)
        if b is not None:
            self._in(m.inputs[1], b)
        if scale is not None:
            self._in(m.inputs["Scale"], scale)
        if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE"):
            return m.outputs["Value"]
        return m.outputs["Vector"]

    def combine(self, x, y, z):
        c = self.new("ShaderNodeCombineXYZ")
        for i, v in enumerate((x, y, z)):
            self._in(c.inputs[i], v)
        return c.outputs[0]

    def separate(self, vec):
        s = self.new("ShaderNodeSeparateXYZ")
        self._in(s.inputs[0], vec)
        return s.outputs

    def mix(self, fac, a, b, blend="MIX"):
        m = self.new("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_factor=True)
        for ident, v in (("Factor_Float", fac), ("A_Color", a), ("B_Color", b)):
            s = _sock(m, ident)
            if isinstance(v, (int, float)):
                s.default_value = (v, v, v, 1.0) if ident != "Factor_Float" else v
            elif isinstance(v, tuple):
                s.default_value = (*v[:3], 1.0)
            else:
                self.link(v, s)
        return _sock(m, "Result_Color", out=True)

    def ramp(self, fac, stops):
        r = self.new("ShaderNodeValToRGB")
        self._in(r.inputs["Fac"], fac)
        el = r.color_ramp.elements
        el[0].position, el[0].color = stops[0][0], (*stops[0][1], 1)
        el[1].position, el[1].color = stops[-1][0], (*stops[-1][1], 1)
        for pos, c in stops[1:-1]:
            e = el.new(pos)
            e.color = (*c, 1)
        return r.outputs["Color"]

    def attr(self, name, out="Vector"):
        a = self.new("ShaderNodeAttribute", attribute_name=name, attribute_type="GEOMETRY")
        return a.outputs[out]

    def ao(self, dist, samples=16):
        a = self.new("ShaderNodeAmbientOcclusion", samples=samples, only_local=True)
        a.inputs["Distance"].default_value = dist
        return a.outputs["AO"]

    def geometry(self):
        return self.new("ShaderNodeNewGeometry")

    def bw(self, color):
        n = self.new("ShaderNodeRGBToBW")
        self._in(n.inputs[0], color)
        return n.outputs[0]


def torus_coords(k, su=1.0, sv=1.0):
    """Seamless 4D domain for a 0..1 UV tile: (cos u, sin u, cos v) and W = sin v.
    A flat torus, so it is undistorted; with these radii a noise Scale of N gives
    about N features per tile (su/sv stretch u and v independently)."""
    uv = k.separate(k.coord("UV"))
    au = k.math("MULTIPLY", uv[0], TAU)
    av = k.math("MULTIPLY", uv[1], TAU)
    ru, rv = su / TAU, sv / TAU
    vec = k.combine(k.math("MULTIPLY", k.math("COSINE", au), ru),
                    k.math("MULTIPLY", k.math("SINE", au), ru),
                    k.math("MULTIPLY", k.math("COSINE", av), rv))
    w = k.math("MULTIPLY", k.math("SINE", av), rv)
    return vec, w


# ---------------------------------------------------------- baking helpers

def new_float_image(name, size, data=True):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color" if data else "Linear Rec.709"
    return img


def bake_tiling_texture(sc, name, size, build, samples=16, tag="tex"):
    """Bakes a seamless procedural texture set onto a unit quad. `build(k)` gets a
    NodeKit and returns {channel: socket}; 'color' is baked as linear colour, the
    rest as scalar data. Returns numpy arrays (bottom-up rows) per channel."""
    me = bpy.data.meshes.new(f"tile_{name}")
    me.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], [], [(0, 1, 2, 3)])
    uvl = me.uv_layers.new(name="UVMap")
    uvl.data.foreach_set("uv", [0, 0, 1, 0, 1, 1, 0, 1])
    obj = link(bpy.data.objects.new(f"tile_{name}", me))
    mat = bpy.data.materials.new(f"tilemat_{name}")
    mat.use_nodes = True
    k = NodeKit(mat)
    k.n.remove(k.n["Principled BSDF"])
    out = k.n["Material Output"]
    chans = build(k)
    emit = k.new("ShaderNodeEmission")
    k.link(emit.outputs[0], out.inputs["Surface"])
    target = k.new("ShaderNodeTexImage")
    me.materials.append(mat)
    select_only([obj], obj)
    sc.cycles.samples = samples
    sc.render.bake.use_clear = True
    res = {}
    for ch, sock in chans.items():
        img = new_float_image(f"{name}_{ch}", size, data=(ch != "color"))
        target.image = img
        k.n.active = target
        for lk in list(emit.inputs["Color"].links):
            k.l.remove(lk)
        if isinstance(sock, (int, float)):
            emit.inputs["Color"].default_value = (sock, sock, sock, 1)
        else:
            k.link(sock, emit.inputs["Color"])
        t = time.time()
        bpy.ops.object.bake(type="EMIT", margin=0, target="IMAGE_TEXTURES")
        arr = pixels(img)[..., :3].copy()
        res[ch] = arr if ch == "color" else arr[..., 0]
        log(tag, f"bake {name}.{ch} {size}px {time.time() - t:.1f}s")
        bpy.data.images.remove(img)
    bpy.data.objects.remove(obj)
    return res


# ---------------------------------------------------------- export materials

def gltf_output_group():
    name = "glTF Material Output"
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    g = bpy.data.node_groups.new(name, "ShaderNodeTree")
    g.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.nodes.new("NodeGroupInput")
    return g


def pbr_material(name, base_img, orm_img, nrm_img, vertex_color=False, double_sided=False,
                 normal_strength=1.0):
    """Export material: baseColor (x vertex colour) + ORM + normal, glTF-friendly."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = not double_sided
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tb = nt.nodes.new("ShaderNodeTexImage"); tb.image = base_img
    to = nt.nodes.new("ShaderNodeTexImage"); to.image = orm_img
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = nrm_img
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = normal_strength
    grp = nt.nodes.new("ShaderNodeGroup"); grp.node_tree = gltf_output_group()
    if vertex_color:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(tb.outputs["Color"], _sock(mix, "A_Color"))
        nt.links.new(vc.outputs["Color"], _sock(mix, "B_Color"))
        nt.links.new(_sock(mix, "Result_Color", out=True), b.inputs["Base Color"])
    else:
        nt.links.new(tb.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(to.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


def simple_material(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0,
                    alpha=1.0, double_sided=False, transmission=0.0, ior=1.45):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = not double_sided
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["IOR"].default_value = ior
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except AttributeError:
            m.blend_method = "BLEND"
    return m


def export_glb(path, objs):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_only(objs, objs[0])
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
              export_yup=True, export_tangents=True, export_extras=True,
              export_image_format="AUTO", export_animations=False, export_cameras=False,
              export_lights=False)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="ACTIVE", **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    return os.path.getsize(path)


def inspect_glb(path):
    """Reads the exported .glb back (without Blender) and measures what ships:
    triangles per node, materials, embedded image sizes, sockets."""
    with open(path, "rb") as fh:
        data = fh.read()
    _magic, _ver, length = struct.unpack_from("<III", data, 0)
    clen, _ctype = struct.unpack_from("<II", data, 12)
    js = json.loads(data[20:20 + clen])
    bin_off = 20 + clen + 8
    acc = js.get("accessors", [])
    meshes = js.get("meshes", [])
    nodes = js.get("nodes", [])
    per_node = {}
    for nd in nodes:
        if "mesh" not in nd:
            continue
        tris = 0
        attrs, mats = set(), set()
        for p in meshes[nd["mesh"]]["primitives"]:
            attrs.update(p["attributes"].keys())
            if "material" in p:
                mats.add(js["materials"][p["material"]]["name"])
            if "indices" in p:
                tris += acc[p["indices"]]["count"] // 3
            else:
                tris += acc[p["attributes"]["POSITION"]]["count"] // 3
        per_node[nd.get("name", "?")] = {"triangles": tris, "materials": sorted(mats),
                                         "attributes": sorted(attrs)}
    images = []
    bvs = js.get("bufferViews", [])
    for im in js.get("images", []):
        bv = bvs[im["bufferView"]]
        o = bin_off + bv.get("byteOffset", 0)
        blob = data[o:o + bv["byteLength"]]
        w = h = None
        if blob[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", blob[16:24])
        elif blob[:2] == b"\xff\xd8":
            i = 2
            while i + 9 < len(blob):
                if blob[i] != 0xFF:
                    i += 1
                    continue
                mk = blob[i + 1]
                if mk in (0xC0, 0xC1, 0xC2):
                    h, w = struct.unpack(">HH", blob[i + 5:i + 9])
                    break
                seg = struct.unpack(">H", blob[i + 2:i + 4])[0]
                i += 2 + seg
        images.append({"name": im.get("name"), "mime": im.get("mimeType"),
                       "bytes": bv["byteLength"], "size": [w, h]})
    mats = [{"name": m["name"], "doubleSided": m.get("doubleSided", False),
             "alphaMode": m.get("alphaMode", "OPAQUE")} for m in js.get("materials", [])]
    sockets = {}
    for nd in nodes:
        nm = nd.get("name", "")
        if nm.startswith("socket_"):
            sockets[nm] = {"translation_gltf": [round(v, 3) for v in nd.get("translation", [0, 0, 0])],
                           "rotation_gltf": [round(v, 4) for v in nd.get("rotation", [0, 0, 0, 1])],
                           "extras": nd.get("extras", {})}
    render = {k: v for k, v in per_node.items() if not k.endswith("_col")}
    return {"bytes": length, "nodes": per_node, "materials": mats, "images": images,
            "sockets": sockets,
            "triangles_render": sum(v["triangles"] for v in render.values()),
            "triangles_collision": sum(v["triangles"] for k, v in per_node.items()
                                       if k.endswith("_col")),
            "max_materials_per_node": max([len(v["materials"]) for v in render.values()] or [0])}


# ---------------------------------------------------------- render helpers

def add_camera(name, loc, target, lens=50, ortho=None, fov_v_deg=None, col=None, clip_end=4000):
    cam = bpy.data.cameras.new(name)
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    elif fov_v_deg:
        cam.sensor_fit = "VERTICAL"
        cam.angle_y = math.radians(fov_v_deg)
    else:
        cam.lens = lens
    cam.clip_start = 0.05
    cam.clip_end = clip_end
    obj = link(bpy.data.objects.new(name, cam), col)
    obj.location = loc
    d = Vector(target) - Vector(loc)
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return obj


def sky_world(name="Sky", zenith=(0.16, 0.22, 0.27), horizon=(0.60, 0.66, 0.68),
              ground=(0.50, 0.56, 0.58), strength=1.0):
    """Overcast sky gradient (cool zenith, pale horizon)."""
    world = bpy.data.worlds.new(name)
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs[1].default_value = -1.0
    mr.inputs[2].default_value = 1.0
    nt.links.new(sep.outputs["Z"], mr.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(mr.outputs[0], ramp.inputs["Fac"])
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.30, (*ground, 1)
    el[1].position, el[1].color = 0.92, (*zenith, 1)
    e = el.new(0.51)
    e.color = (*horizon, 1)
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    return world


def add_sun(col, name="Sun", energy=3.0, color=(1.0, 0.93, 0.84), elev=35, azim=-40, angle=3):
    s = bpy.data.lights.new(name, "SUN")
    s.energy = energy
    s.color = color
    s.angle = math.radians(angle)
    o = link(bpy.data.objects.new(name, s), col)
    # sun points along its local -Z; tilt from zenith by (90 - elev), then turn
    o.rotation_euler = (math.radians(90 - elev), 0, math.radians(azim))
    return o


def setup_cycles(sc, res_x, res_y, samples, jpeg=True, look="AgX - Medium High Contrast"):
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.render.resolution_x = res_x
    sc.render.resolution_y = res_y
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = look
    if jpeg:
        sc.render.image_settings.file_format = "JPEG"
        sc.render.image_settings.quality = 90
    sc.cycles.max_bounces = 8
    sc.cycles.transparent_max_bounces = 32


def render_to(sc, cam, path):
    sc.camera = cam
    sc.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    t = time.time()
    bpy.ops.render.render(write_still=True)
    return round(time.time() - t, 2)


def collision_overlay_material():
    return simple_material("ColOverlay", (0.95, 0.08, 0.06), 0.5, emit=(0.9, 0.05, 0.03),
                           emit_strength=0.4, alpha=0.38, double_sided=True)

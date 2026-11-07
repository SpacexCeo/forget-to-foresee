"""Shared Blender helpers for the Forget to Foresee hero-asset build scripts.

Extracted from the proven anchor pipeline (art/anchor/build_anchor.py):
procedural bmesh parts -> smart UV -> dense displaced master -> GPU Cycles
selected-to-active bakes, supersampled and box-downsampled -> glTF export ->
re-import QA renders.

Changes against the anchor version:
  * `densify()` splits long edges until every master edge is shorter than a target
    length, so displacement works on near-square cells (no streaks from long thin
    quads, the known anchor defect).
  * Ground / ruler / human proxy are parametric so small and large assets share
    the same review environment.

Blender convention: Z up, front faces -Y; the glTF exporter converts to Y up.
All dimensions are metres.
"""

import json
import math
import os
import time

import bpy
import bmesh
from mathutils import Matrix, Vector

# Palette (linear RGB). Cold grey-green stone, charcoal, aged bronze, amber.
COL_STONE = (0.105, 0.125, 0.118)
COL_STONE_LIGHT = (0.215, 0.245, 0.228)
COL_CHARCOAL = (0.032, 0.036, 0.038)
COL_BRONZE = (0.30, 0.205, 0.105)
COL_PATINA = (0.105, 0.175, 0.150)
COL_AMBER = (1.0, 0.42, 0.07)

TAG = "ftf"


def set_tag(tag):
    global TAG
    TAG = tag


def log(*a):
    print(f"[{TAG}]", *a, flush=True)


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


def mat_simple(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    return m


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


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


# ------------------------------------------------------------ mesh primitives

def bm_object(name, bm, mat, col):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    if mat is not None:
        me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), col)


def revolve(bm, profile, n, rfunc=None, phase=0.0, cap_bottom=False, cap_top=False):
    """Surface of revolution. Profile (r, z) runs bottom to top along the outside."""
    rings = []
    for r, z in profile:
        ring = []
        for i in range(n):
            th = phase + 2 * math.pi * i / n
            rr = rfunc(th, z, r) if rfunc else r
            ring.append(bm.verts.new((rr * math.cos(th), rr * math.sin(th), z)))
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


def tube(bm, pts, radius, sides, closed=False, cap=True, twist=0.0):
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
                      for a in (twist + 2 * math.pi * k / sides for k in range(sides))])
        prev_t = t
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    faces = []
    for a, b in pairs:
        for k in range(sides):
            l = (k + 1) % sides
            faces.append(bm.faces.new((a[k], a[l], b[l], b[k])))
    if cap and not closed:
        faces.append(bm.faces.new(list(reversed(rings[0]))))
        faces.append(bm.faces.new(rings[-1]))
    return faces


def prism(bm, outline_xz, half_thick, angle):
    """Extrude an (x=radial, z) outline by +-half_thick(z) and rotate about Z."""
    rot = Matrix.Rotation(angle, 3, "Z")
    front, back = [], []
    for x, z in outline_xz:
        h = half_thick(z) if callable(half_thick) else half_thick
        front.append(bm.verts.new(rot @ Vector((x, -h, z))))
        back.append(bm.verts.new(rot @ Vector((x, h, z))))
    n = len(outline_xz)
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def box(bm, center, size, rot_z=0.0):
    m = Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Diagonal((*size, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def add_bevel(obj, width, segments, angle=30):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    return mod


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


def smart_uv(obj, margin=0.004, angle=52):
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin,
                             area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def seam_unwrap(obj, seam_fn=None, sharp_deg=45.0, margin=0.0015, scale_faces=None):
    """Angle-based unwrap with explicit seams (sharp edges, open borders and the
    edges selected by seam_fn(edge)), equalised island scale, concave packing.
    Smart Project keeps flat rings and bands as single annular islands, which
    wastes most of the atlas; cutting them into arcs roughly doubles the fill.
    scale_faces: optional (predicate(face), factor) to shrink some islands
    (e.g. hidden interiors) before packing."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    lim = math.radians(sharp_deg)
    n = 0
    for e in bm.edges:
        cut = (not e.is_manifold) or e.calc_face_angle(0.0) > lim or (seam_fn is not None and seam_fn(e))
        e.seam = cut
        n += cut
    bm.to_mesh(obj.data)
    bm.free()
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.0)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    if scale_faces:
        pred, factor = scale_faces
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        uvl = bm.loops.layers.uv.active
        for f in bm.faces:
            if pred(f):
                for lp in f.loops:
                    lp[uvl].uv *= factor
        bm.to_mesh(obj.data)
        bm.free()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=margin,
                            shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    return n


def uv_fill(obj):
    """Share of the 0..1 UV square covered by triangles (atlas efficiency)."""
    me = obj.data
    me.calc_loop_triangles()
    uv = me.uv_layers.active.data
    a = 0.0
    for t in me.loop_triangles:
        p = [uv[i].uv for i in t.loops]
        a += abs((p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (p[1].y - p[0].y)) / 2
    return round(a, 4)


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


def evaluated_tris(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    em = obj.evaluated_get(dg).to_mesh()
    em.calc_loop_triangles()
    n = len(em.loop_triangles)
    obj.evaluated_get(dg).to_mesh_clear()
    return n


def crease_edges(obj, hard=60, soft=33, soft_value=0.55):
    """Edge creases for the Catmull-Clark smoothing of master / _inspect meshes."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    layer = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
    for e in bm.edges:
        if not e.is_manifold:
            e[layer] = 1.0
            continue
        a = math.degrees(e.calc_face_angle(0.0))
        e[layer] = 1.0 if a > hard else soft_value if a > soft else 0.0
    bm.to_mesh(obj.data)
    bm.free()


def clean_bmesh(bm, dist=1e-6):
    """Drop degenerate and duplicate faces (they create non-manifold edges)."""
    bmesh.ops.dissolve_degenerate(bm, dist=dist, edges=bm.edges[:])
    seen, dup = set(), []
    for f in bm.faces:
        key = tuple(sorted(v.index for v in f.verts))
        if key in seen:
            dup.append(f)
        else:
            seen.add(key)
    if dup:
        bmesh.ops.delete(bm, geom=dup, context="FACES_ONLY")
    return len(dup)


def nonmanifold_edges(obj):
    """Edges shared by more than two faces (duplicate / overlapping geometry)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    n = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    bm.free()
    return n


def densify(obj, max_edge, max_passes=24):
    """Split every edge longer than max_edge (bisection on a triangulated mesh)
    so displacement acts on near-isotropic cells. Face material indices are
    kept. Returns (passes, triangles)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    clean_bmesh(bm)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    done = 0
    maxima = []
    for p in range(1, max_passes + 1):
        # Non-manifold edges (>2 faces) are left alone: splitting them multiplies faces.
        long_edges = [e for e in bm.edges if len(e.link_faces) <= 2 and e.calc_length() > max_edge]
        if not long_edges:
            break
        mx = max(e.calc_length() for e in long_edges)
        maxima.append(mx)
        if len(maxima) >= 3 and mx >= 0.99 * maxima[-3]:
            worst = [e for e in long_edges if e.calc_length() > 0.9 * mx]
            faces_hist = {}
            for e in worst:
                faces_hist[len(e.link_faces)] = faces_hist.get(len(e.link_faces), 0) + 1
            sample = [(tuple(round(c, 4) for c in e.verts[0].co), tuple(round(c, 4) for c in e.verts[1].co),
                       [len(f.verts) for f in e.link_faces]) for e in worst[:6]]
            log(f"densify stalled at pass {p}: {len(long_edges)} long edges, max {mx:.4f}, "
                f"{len(worst)} worst, faces/edge {faces_hist}, sample {sample}")
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
        quads = [f for f in bm.faces if len(f.verts) > 3]
        if quads:
            bmesh.ops.triangulate(bm, faces=quads, quad_method="BEAUTY", ngon_method="BEAUTY")
        done = p
        log(f"densify pass {p}: split {len(long_edges)} edges -> {len(bm.faces)} tris")
    n = len(bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    return done, n


def groups_from_materials(obj):
    """Vertex group per material slot (used to scope Displace modifiers)."""
    by_slot = {}
    for poly in obj.data.polygons:
        by_slot.setdefault(poly.material_index, set()).update(poly.vertices)
    for idx, verts in by_slot.items():
        name = obj.material_slots[idx].material.name
        vg = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
        vg.add(sorted(verts), 1.0, "REPLACE")


def add_displace(obj, name, ttype, scale, strength, group, coords="LOCAL", **tex_props):
    tex = bpy.data.textures.new(name, ttype)
    tex.noise_scale = scale
    for k, v in tex_props.items():
        setattr(tex, k, v)
    d = obj.modifiers.new(name, "DISPLACE")
    d.texture, d.texture_coords, d.strength, d.mid_level = tex, coords, strength, 0.5
    if group:
        d.vertex_group = group
    return d


# ---------------------------------------------------- procedural master shading

def _sock(node, ident, out=False):
    for s in (node.outputs if out else node.inputs):
        if s.identifier == ident:
            return s
    raise KeyError(ident)


class NodeKit:
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

    def coord(self):
        return self.new("ShaderNodeTexCoord").outputs["Object"]

    def noise(self, vec, scale, detail=4.0, rough=0.55):
        t = self.new("ShaderNodeTexNoise")
        self.link(vec, t.inputs["Vector"])
        t.inputs["Scale"].default_value = scale
        t.inputs["Detail"].default_value = detail
        t.inputs["Roughness"].default_value = rough
        return t.outputs["Fac"]

    def voronoi(self, vec, scale, feature="F1", out="Distance"):
        t = self.new("ShaderNodeTexVoronoi", feature=feature)
        self.link(vec, t.inputs["Vector"])
        t.inputs["Scale"].default_value = scale
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
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                self.link(v, m.inputs[i])
        return m.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        m = self.new("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_factor=True)
        for ident, v in (("Factor_Float", fac), ("A_Color", a), ("B_Color", b)):
            s = _sock(m, ident)
            if isinstance(v, (int, float)):
                s.default_value = v
            elif isinstance(v, tuple):
                s.default_value = (*v[:3], 1.0)
            else:
                self.link(v, s)
        return _sock(m, "Result_Color", out=True)

    def ao(self, dist):
        a = self.new("ShaderNodeAmbientOcclusion", samples=16, only_local=True)
        a.inputs["Distance"].default_value = dist
        return a.outputs["AO"]

    def geometry(self):
        return self.new("ShaderNodeNewGeometry")

    def sep(self, vec):
        s = self.new("ShaderNodeSeparateXYZ")
        self.link(vec, s.inputs[0])
        return s


def finish_procedural(k, out, c, rough, metal, bump_h, bump_strength, bump_dist=0.002):
    bsdf = k.new("ShaderNodeBsdfPrincipled")
    if isinstance(c, tuple):
        bsdf.inputs["Base Color"].default_value = (*c[:3], 1.0)
    else:
        k.link(c, bsdf.inputs["Base Color"])
    for sock, v in (("Roughness", rough), ("Metallic", metal)):
        if isinstance(v, float):
            bsdf.inputs[sock].default_value = v
        else:
            k.link(v, bsdf.inputs[sock])
    bump = k.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = bump_dist
    k.link(bump_h, bump.inputs["Height"])
    k.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    emit = k.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    channels = {"color": c, "rough": rough, "metal": metal}
    return (k, out, bsdf, emit, channels)


def new_procedural(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    k = NodeKit(m)
    k.n.remove(k.n["Principled BSDF"])
    return m, k, k.n["Material Output"]


def stone_material(name, lichen_top=0.30, scale=1.0, dark=0.0, strata=0.30, pale=0.0, lichen=1.0,
                   cracks=0.0, dirt_strength=0.75):
    """Weathered grey-green stone (anchor recipe). `scale` multiplies feature sizes,
    `pale` lifts the stone toward a light grey-green (owner concept: pale table)."""
    m, k, out = new_procedural(name)
    co = k.coord()
    geo = k.geometry()
    s = 1.0 / scale
    n1 = k.noise(co, 7.0 * s, 8.0, 0.62)
    speck = k.noise(co, 55.0 * s, 3.0, 0.5)
    wave = k.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Z")
    k.link(co, wave.inputs["Vector"])
    wave.inputs["Scale"].default_value = 6.0 * s
    wave.inputs["Distortion"].default_value = 5.0
    wave.inputs["Detail"].default_value = 4.0
    ramp = k.new("ShaderNodeValToRGB")
    k.link(n1, ramp.inputs["Fac"])
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.32, (*COL_CHARCOAL, 1)
    el[1].position, el[1].color = 0.78, (*COL_STONE_LIGHT, 1)
    mid = el.new(0.55)
    mid.color = (*COL_STONE, 1)
    st = k.maprange(wave.outputs["Fac"], 0.62, 0.92, 0.0, strata)
    c = k.mix(st, ramp.outputs["Color"], (0.26, 0.29, 0.27))
    if pale:
        # Brighten while keeping the mottling (multiply, not a flat blend).
        c = k.mix(pale, c, (2.9, 3.0, 2.9), blend="MULTIPLY")
    crack = None
    if cracks:
        cr = k.new("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
        k.link(co, cr.inputs["Vector"])
        cr.inputs["Scale"].default_value = 3.2 * s
        cr.inputs["Randomness"].default_value = 0.9
        warp = k.noise(co, 9.0 * s, 3.0, 0.55)
        crack = k.math("MULTIPLY", k.maprange(cr.outputs["Distance"], 0.0, 0.018, 1.0, 0.0),
                       k.maprange(warp, 0.38, 0.6, 0.0, cracks))
        c = k.mix(crack, c, tuple(x * 0.9 for x in COL_CHARCOAL))
    wear_mask = k.noise(co, 22.0 * s, 2.0, 0.5)
    wear = k.math("MULTIPLY", k.maprange(geo.outputs["Pointiness"], 0.515, 0.56),
                  k.maprange(wear_mask, 0.42, 0.62))
    c = k.mix(wear, c, (0.33, 0.36, 0.33))
    dirt = k.maprange(k.ao(0.05), 0.40, 0.95, dirt_strength, 0.0)
    c = k.mix(dirt, c, (0.055, 0.064, 0.060))
    z = k.sep(co).outputs["Z"]
    low = k.maprange(z, 0.04, lichen_top, 1.0, 0.0)
    lichen = k.math("MULTIPLY", low, k.maprange(k.noise(co, 12.0 * s, 5.0, 0.6), 0.50, 0.60,
                                                0.0, lichen))
    c = k.mix(lichen, c, (0.072, 0.105, 0.048))
    c = k.mix(0.35, c, k.maprange(speck, 0.3, 0.7, 0.75, 1.15), blend="MULTIPLY")
    if dark:
        c = k.mix(dark, c, COL_CHARCOAL)
    rough = k.math("SUBTRACT", k.maprange(speck, 0.3, 0.7, 0.74, 0.92),
                   k.math("MULTIPLY", wear, 0.28), clamp=True)
    rough = k.math("ADD", rough, k.math("MULTIPLY", lichen, 0.08), clamp=True)
    bump_h = k.math("ADD", k.noise(co, 260.0 * s, 4.0, 0.6), k.math("MULTIPLY", speck, 0.5))
    if crack is not None:
        bump_h = k.math("SUBTRACT", bump_h, k.math("MULTIPLY", crack, 1.5))
        rough = k.math("ADD", rough, k.math("MULTIPLY", crack, 0.1), clamp=True)
    return m, finish_procedural(k, out, c, rough, 0.0, bump_h, 0.22)


def bronze_material(name, patina=1.0):
    """Aged bronze; patina < 1 gives polished inlay bronze (warmer, more metallic)."""
    m, k, out = new_procedural(name)
    patina_amount = patina
    co = k.coord()
    geo = k.geometry()
    n = k.noise(co, 18.0, 6.0, 0.55)
    up = k.sep(geo.outputs["Normal"])
    patina = k.math("ADD", k.maprange(k.ao(0.03), 0.55, 0.95, 1.0, 0.0),
                    k.maprange(up.outputs["Z"], 0.3, 0.95, 0.0, 0.55))
    patina = k.math("MULTIPLY", patina, k.maprange(k.noise(co, 9.0, 4.0, 0.6), 0.36, 0.62,
                                                   0.0, patina_amount), clamp=True)
    polish = k.maprange(geo.outputs["Pointiness"], 0.51, 0.56)
    c = k.mix(polish, COL_BRONZE, (0.56, 0.39, 0.21))
    c = k.mix(k.maprange(n, 0.3, 0.7, 0.0, 0.25), c, (0.18, 0.12, 0.06))
    pat_col = k.mix(k.maprange(n, 0.3, 0.7), COL_PATINA, (0.16, 0.24, 0.20))
    c = k.mix(patina, c, pat_col)
    metal = k.math("SUBTRACT", 1.0, k.math("MULTIPLY", patina, 0.95), clamp=True)
    rough = k.math("ADD", 0.30, k.math("MULTIPLY", patina, 0.45))
    rough = k.math("SUBTRACT", rough, k.math("MULTIPLY", polish, 0.12), clamp=True)
    rough = k.math("ADD", rough, k.math("MULTIPLY", n, 0.06), clamp=True)
    bump_h = k.noise(co, 150.0, 3.0, 0.5)
    return m, finish_procedural(k, out, c, rough, metal, bump_h, 0.12)


def set_master_output(kits, channel):
    """Route each master material's output to the BSDF (normal/AO bake) or to an
    Emission of one channel (colour/roughness/metallic bakes)."""
    for k, out, bsdf, emit, ch in kits:
        for lk in list(out.inputs["Surface"].links):
            k.l.remove(lk)
        for lk in list(emit.inputs["Color"].links):
            k.l.remove(lk)
        if channel == "bsdf":
            k.link(bsdf.outputs["BSDF"], out.inputs["Surface"])
            continue
        v = ch[channel]
        if isinstance(v, float):
            emit.inputs["Color"].default_value = (v, v, v, 1)
        elif isinstance(v, tuple):
            emit.inputs["Color"].default_value = (*v[:3], 1)
        else:
            k.link(v, emit.inputs["Color"])
        k.link(emit.outputs["Emission"], out.inputs["Surface"])


# ---------------------------------------------------------------------- bake

def bake_target_material(name, image=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    node = m.node_tree.nodes.new("ShaderNodeTexImage")
    node.name = "BakeTarget"
    node.image = image
    m.node_tree.nodes.active = node
    return m


def new_float_image(name, size, data=True):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color" if data else "Linear Rec.709"
    return img


def bake(sc, kind, target, sources, image, samples, cage=0.010, ray=0.030, margin=16, **kw):
    for slot in target.material_slots:
        node = slot.material.node_tree.nodes["BakeTarget"]
        node.image = image
        slot.material.node_tree.nodes.active = node
    select_only(sources + [target], target)
    sc.cycles.samples = samples
    t = time.time()
    bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=cage,
                        max_ray_distance=ray, margin=margin, margin_type="EXTEND",
                        target="IMAGE_TEXTURES", **kw)
    log(f"bake {kind:8s} -> {image.name} ({image.size[0]}px, {samples} spp) {time.time() - t:.1f}s")


def run_bakes(sc, master, kits, jobs, size, cage=0.010, ray=0.030):
    """jobs: (key, kind, target, spp, channel). Each target carries bake-target
    materials (an image node named 'BakeTarget'). Returns (images, timings)."""
    sc.render.bake.use_clear = True
    sc.cycles.use_denoising = False
    imgs, times = {}, {}
    for key, kind, target, spp, channel in jobs:
        imgs[key] = new_float_image(f"bake_{key}", size, data=(key != "color"))
        set_master_output(kits, channel)
        t = time.time()
        bake(sc, kind, target, [master], imgs[key], spp, cage=cage, ray=ray,
             margin=max(8, size // 512),
             **({"normal_space": "TANGENT"} if kind == "NORMAL" else {}))
        times[key] = {"seconds": round(time.time() - t, 2), "samples": spp, "size": size}
    return imgs, times


def pixels(img):
    import numpy as np
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def downsample(a, f):
    h, w, c = a.shape
    return a.reshape(h // f, f, w // f, f, c).mean(axis=(1, 3))


def to_srgb(c):
    import numpy as np
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def save_rgb(arr01, path, quality=None):
    """Save a bottom-up float RGB array (Blender pixel order) with Pillow."""
    import numpy as np
    from PIL import Image
    u8 = (np.clip(arr01, 0, 1)[::-1] * 255.0 + 0.5).astype(np.uint8)
    im = Image.fromarray(u8, "RGB")
    if path.endswith(".jpg"):
        im.save(path, quality=quality or 92, subsampling=0, optimize=True)
    else:
        im.save(path, optimize=True)
    return path


def write_textures(imgs, bake_size, tex_size, tex_dir, prefix, repo):
    """Downsample the float bakes and write basecolor/ORM JPEG + normal PNG(s)."""
    import numpy as np
    os.makedirs(tex_dir, exist_ok=True)
    f = bake_size // tex_size
    P = {k: downsample(pixels(v), f)[..., :3] for k, v in imgs.items()}
    paths = {}
    if "color" in P:
        paths["base"] = save_rgb(to_srgb(P["color"]),
                                 os.path.join(tex_dir, f"{prefix}_basecolor.jpg"), 92)
    if "rough" in P:
        ao = P["ao"][..., 0] if "ao" in P else np.ones_like(P["rough"][..., 0])
        metal = P["metal"][..., 0] if "metal" in P else np.zeros_like(ao)
        paths["orm"] = save_rgb(np.stack([ao, P["rough"][..., 0], metal], -1),
                                os.path.join(tex_dir, f"{prefix}_orm.jpg"), 92)
    for key in [k for k in P if k.startswith("normal")]:
        n = P[key] * 2.0 - 1.0
        n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
        tag = key[len("normal"):].strip("_")
        fname = f"{prefix}_{tag}_normal.png" if tag else f"{prefix}_normal.png"
        paths[key] = save_rgb(n * 0.5 + 0.5, os.path.join(tex_dir, fname))
    files = {k: {"file": os.path.relpath(v, repo).replace("\\", "/"), "bytes": os.path.getsize(v)}
             for k, v in paths.items()}
    return paths, files


# ----------------------------------------------------------- final materials

def gltf_output_group():
    """Custom group recognised by the Blender glTF exporter (occlusion, thickness)."""
    name = "glTF Material Output"
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    g = bpy.data.node_groups.new(name, "ShaderNodeTree")
    g.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.interface.new_socket(name="Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
    g.nodes.new("NodeGroupInput")
    return g


def textured_material(name, base_img, orm_img, nrm_img, use_ao=True):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tb = nt.nodes.new("ShaderNodeTexImage"); tb.image = base_img
    to = nt.nodes.new("ShaderNodeTexImage"); to.image = orm_img
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = nrm_img
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tb.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(to.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    if use_ao:
        grp = nt.nodes.new("ShaderNodeGroup"); grp.node_tree = gltf_output_group()
        nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


def load_textures(paths):
    loaded = {k: bpy.data.images.load(v) for k, v in paths.items()}
    for k, img in loaded.items():
        if k != "base":
            img.colorspace_settings.name = "Non-Color"
    return loaded


# ------------------------------------------------------------------ metrics

def uv_metrics(obj, tex_size, material_indices=None):
    """Texel density (px/m) and per-triangle UV anisotropy for one mesh."""
    import numpy as np
    me = obj.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    dens, aniso = [], []
    for tri in me.loop_triangles:
        if material_indices is not None and tri.material_index not in material_indices:
            continue
        p = [Vector(me.vertices[i].co) for i in tri.vertices]
        q = [Vector(uvl[li].uv) for li in tri.loops]
        e1, e2 = p[1] - p[0], p[2] - p[0]
        if e1.cross(e2).length / 2 < 1e-9:
            continue
        x = e1.normalized()
        y = e1.cross(e2).cross(e1).normalized()
        P = np.array([[e1.dot(x), e2.dot(x)], [e1.dot(y), e2.dot(y)]])
        U = np.array([[q[1].x - q[0].x, q[2].x - q[0].x], [q[1].y - q[0].y, q[2].y - q[0].y]])
        try:
            J = U @ np.linalg.inv(P)
        except np.linalg.LinAlgError:
            continue
        s = np.linalg.svd(J, compute_uv=False)
        if s[1] < 1e-9:
            aniso.append(99.0)
            continue
        dens.append(math.sqrt(s[0] * s[1]) * tex_size)
        aniso.append(s[0] / s[1])
    d, an = np.array(dens), np.array(aniso)
    return {
        "texture_size": tex_size,
        "texel_density_px_per_m": {"median": round(float(np.median(d)), 1),
                                   "p10": round(float(np.percentile(d, 10)), 1),
                                   "p90": round(float(np.percentile(d, 90)), 1),
                                   "coefficient_of_variation": round(float(d.std() / d.mean()), 3)},
        "uv_anisotropy": {"median": round(float(np.median(an)), 3),
                          "p95": round(float(np.percentile(an, 95)), 3),
                          "share_over_1_5": round(float((an > 1.5).mean()), 4)},
        "triangles_measured": int(len(d)),
        "uv_fill": uv_fill(obj),
    }


def export_glb(path, objs, active):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_only(objs, active)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_tangents=True,
                              export_extras=True, export_image_format="AUTO",
                              export_animations=False, export_cameras=False, export_lights=False)
    return os.path.getsize(path)


def glb_summary(path):
    """Read the exported GLB's JSON chunk: nodes, materials, extensions, images."""
    import struct
    with open(path, "rb") as fh:
        data = fh.read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    js = json.loads(data[20:20 + jlen])
    out = {"extensionsUsed": js.get("extensionsUsed", []),
           "nodes": [n.get("name") for n in js.get("nodes", [])],
           "materials": [], "images": []}
    for m in js.get("materials", []):
        out["materials"].append({"name": m.get("name"),
                                 "extensions": m.get("extensions", {})})
    for im in js.get("images", []):
        bv = js["bufferViews"][im["bufferView"]]
        out["images"].append({"name": im.get("name"), "mime": im.get("mimeType"),
                              "bytes": bv["byteLength"]})
    return out


# ------------------------------------------------------- review environment

def setup_render(sc, res=1100, samples=48):
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    world = bpy.data.worlds.new("ReviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.34, 0.38, 0.37, 1.0)
    bg.inputs["Strength"].default_value = 0.55
    sc.world = world


def add_lights(col, key_energy=3.2, rim_energy=1.4):
    key = bpy.data.lights.new("Key", "SUN")
    key.energy = key_energy
    key.angle = math.radians(4)
    key.color = (1.0, 0.95, 0.88)
    o = link(bpy.data.objects.new("Key", key), col)
    o.rotation_euler = (math.radians(52), 0, math.radians(-38))
    rim = bpy.data.lights.new("Rim", "SUN")
    rim.energy = rim_energy
    rim.color = (0.75, 0.88, 1.0)
    o = link(bpy.data.objects.new("Rim", rim), col)
    o.rotation_euler = (math.radians(68), 0, math.radians(150))


def add_ground_and_scale(col, ground_r=3.0, ruler_h=2.0, ruler_seg=0.1, ruler_x=-0.75,
                         ruler_y=0.0, ruler_w=0.02,
                         marks=((1.0, "1.0 m"), (1.6, "1.6 m"), (2.0, "2.0 m")),
                         human_at=(0.95, 0.25), label_size=0.07, grid=(0.1, 1.0)):
    """Ground disc with a grid, a ruler of alternating segments and an optional
    1.75 m human proxy (human_at=None to omit)."""
    gmat = bpy.data.materials.new("Ground")
    gmat.use_nodes = True
    nt = gmat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])

    def grid_line(axis, period, width):
        m1 = nt.nodes.new("ShaderNodeMath"); m1.operation = "PINGPONG"
        m1.inputs[1].default_value = period / 2
        nt.links.new(sep.outputs[axis], m1.inputs[0])
        m2 = nt.nodes.new("ShaderNodeMath"); m2.operation = "LESS_THAN"
        m2.inputs[1].default_value = width
        nt.links.new(m1.outputs[0], m2.inputs[0])
        return m2

    fine, coarse = grid
    lines = []
    for axis in ("X", "Y"):
        lines.append((grid_line(axis, fine, fine * 0.025), 0.35))
        lines.append((grid_line(axis, coarse, coarse * 0.006), 1.0))
    acc = None
    for node, weight in lines:
        mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = weight
        nt.links.new(node.outputs[0], mul.inputs[0])
        if acc is None:
            acc = mul
        else:
            mx = nt.nodes.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
            nt.links.new(acc.outputs[0], mx.inputs[0])
            nt.links.new(mul.outputs[0], mx.inputs[1])
            acc = mx
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (0.20, 0.23, 0.22, 1)
    mix.inputs["B"].default_value = (0.05, 0.06, 0.06, 1)
    nt.links.new(acc.outputs[0], mix.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])

    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=128, radius=ground_r)
    g = bm_object("Ground", bm, gmat, col)

    ra = mat_simple("RulerA", (0.85, 0.85, 0.82), 0.5)
    rb = mat_simple("RulerB", (0.02, 0.02, 0.02), 0.5)
    nseg = int(round(ruler_h / ruler_seg))
    for i in range(nseg):
        bm = bmesh.new()
        box(bm, Vector((ruler_x, ruler_y, ruler_seg * (i + 0.5))), (ruler_w, ruler_w, ruler_seg * 0.5))
        bm_object(f"Ruler_{i:02d}", bm, ra if i % 2 == 0 else rb, col)
    for h, label in marks:
        bm = bmesh.new()
        box(bm, Vector((ruler_x + ruler_w * 3, ruler_y, h)), (ruler_w * 4, ruler_w * 0.2, ruler_w * 0.2))
        bm_object(f"Tick {label}", bm, rb, col)
        cu = bpy.data.curves.new(f"Label{label}", "FONT")
        cu.body = label
        cu.size = label_size
        t = link(bpy.data.objects.new(f"Label {label}", cu), col)
        t.location = (ruler_x - label_size * 3.4, ruler_y - 0.02, h - label_size * 0.35)
        t.rotation_euler = (math.radians(90), 0, 0)
        t.data.materials.append(rb)

    if human_at:
        hm = mat_simple("HumanProxy", (0.42, 0.40, 0.38), 0.8)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.17, radius2=0.17,
                              depth=1.5, matrix=Matrix.Translation((human_at[0], human_at[1], 0.75)))
        bm_object("HumanBody", bm, hm, col).data.shade_smooth()
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.115,
                                  matrix=Matrix.Translation((human_at[0], human_at[1], 1.75 - 0.115)))
        bm_object("HumanHead", bm, hm, col).data.shade_smooth()
    return g


def add_camera(name, loc, target, ortho=None, lens=70):
    cam = bpy.data.cameras.new(name)
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    else:
        cam.lens = lens
    cam.clip_start = 0.005
    cam.clip_end = 500
    obj = link(bpy.data.objects.new(name, cam))
    obj.location = loc
    d = Vector(target) - Vector(loc)
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return obj


def shoot(sc, views, prefix, out_dir, timings, repo):
    """views: name -> (location, target, ortho_scale or None, lens or None)."""
    os.makedirs(out_dir, exist_ok=True)
    for name, (loc, tgt, ortho, lens) in views.items():
        cam = add_camera(f"Cam_{prefix}_{name}", loc, tgt, ortho, lens or 70)
        if name == "top":
            cam.rotation_euler = (0, 0, 0)
        sc.camera = cam
        path = os.path.join(out_dir, f"{prefix}_{name}.jpg")
        sc.render.filepath = path
        t = time.time()
        bpy.ops.render.render(write_still=True)
        timings[f"{prefix}_{name}"] = round(time.time() - t, 2)
        log(f"rendered {os.path.relpath(path, repo)} {timings[f'{prefix}_{name}']}s")


def socket_empty(name, col, loc, rot_z=0.0, **props):
    """glTF node (empty) for game code. Blender -Y (glTF +Z) is the empty's forward."""
    e = link(bpy.data.objects.new(name, None), col)
    e.empty_display_type = "ARROWS"
    e.empty_display_size = 0.1
    e.location = loc
    e.rotation_euler = (0, 0, rot_z)
    for k, v in props.items():
        e[k] = v
    return e

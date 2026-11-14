"""Shared helpers for the Glass Shoal creature pipeline (shoal_dragon, dragon_saddle, hollow_tide).
Blender 4.5, headless. Conventions: metres, Z up, the creature faces -Y (glTF +Z after export), its left is +X,
feet on z = 0. Every step script reads work/<prev>.blend and writes work/<this>.blend + report/<step>.json."""
import bpy, bmesh, json, math, os, sys
import numpy as np
from mathutils import Vector, Matrix


def args():
    """--key value pairs after `--` as a dict."""
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return {a[i].lstrip('-'): a[i + 1] for i in range(0, len(a) - 1, 2)}


def ensure(*dirs):
    for d in dirs: os.makedirs(d, exist_ok=True)


def _js(x):
    return x.tolist() if hasattr(x, 'tolist') else str(x)


def report(path, data):
    ensure(os.path.dirname(path))
    with open(path, 'w') as f: json.dump(data, f, indent=1, default=_js)
    print('REPORT', json.dumps({k: v for k, v in data.items() if len(json.dumps(v, default=_js)) < 400}, default=_js)[:3000])


def coords(o):
    n = len(o.data.vertices); a = np.empty(n * 3, np.float32); o.data.vertices.foreach_get('co', a); return a.reshape(n, 3).astype(np.float64)


def set_coords(o, co):
    o.data.vertices.foreach_set('co', np.asarray(co, np.float32).ravel()); o.data.update()


def tris(o):
    o.data.calc_loop_triangles(); return len(o.data.loop_triangles)


def active(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o


def mesh_stats(o):
    """Loose parts, non-manifold edges, zero-area faces, boundary edges (numbers for the clean step)."""
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    seen = set(); parts = 0
    for v in bm.verts:
        if v.index in seen: continue
        parts += 1; stack = [v]; seen.add(v.index)
        while stack:
            x = stack.pop()
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen: seen.add(y.index); stack.append(y)
    r = dict(verts=len(bm.verts), faces=len(bm.faces), parts=parts,
             non_manifold=sum(1 for e in bm.edges if not e.is_manifold), boundary=sum(1 for e in bm.edges if e.is_boundary),
             zero_faces=sum(1 for f in bm.faces if f.calc_area() < 1e-12))
    bm.free(); return r


def smooth(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def slices(co, axis=1, step=0.25):
    """Width/height table along an axis: the numbers joints and regions are read from."""
    out = []
    lo, hi = co[:, axis].min(), co[:, axis].max()
    for c in np.arange(lo + step / 2, hi, step):
        p = co[np.abs(co[:, axis] - c) < step / 2]
        if len(p) < 4: continue
        out.append(dict(at=round(float(c), 3), n=len(p), x=[round(float(p[:, 0].min()), 3), round(float(p[:, 0].max()), 3)],
                        y=[round(float(p[:, 1].min()), 3), round(float(p[:, 1].max()), 3)], z=[round(float(p[:, 2].min()), 3), round(float(p[:, 2].max()), 3)]))
    return out


def workbench(res=768, texture=True):
    s = bpy.context.scene; s.render.engine = 'BLENDER_WORKBENCH'; s.render.resolution_x = s.render.resolution_y = res
    s.display.shading.light = 'STUDIO'; s.display.shading.color_type = 'TEXTURE' if texture else 'MATERIAL'
    s.display.shading.show_cavity = True; s.render.image_settings.file_format = 'JPEG'; s.render.image_settings.quality = 88
    s.render.film_transparent = False
    if not s.world: s.world = bpy.data.worlds.new('w')
    s.world.color = (0.72, 0.73, 0.75)


VIEW_DIRS = dict(front=(0, -1, 0), back=(0, 1, 0), side=(1, 0, 0), top=(0, 0, 1), q34=(0.62, -0.62, 0.42), below=(0.35, 0.55, -0.75), behind=(0.25, 0.8, 0.5))


def ortho_views(prefix, objs, views=('front', 'side', 'back', 'top'), res=768, texture=True, pad=1.08, engine=None, box=None):
    """Orthographic check renders. front = looking at the face (camera at -Y)."""
    if engine is None: workbench(res, texture)
    bpy.context.view_layer.update()
    pts = np.concatenate([np.array([(o.matrix_world @ Vector(c))[:] for c in o.bound_box]) for o in objs])
    if box is not None: pts = np.array(box, float)   # a fixed frame [min, max] for posed meshes
    c = (pts.min(0) + pts.max(0)) / 2; size = pts.max(0) - pts.min(0); R = float(np.linalg.norm(size))
    cam = bpy.data.objects.new('qa_cam', bpy.data.cameras.new('qa_cam')); bpy.context.scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.clip_end = R * 10; bpy.context.scene.camera = cam
    ext = dict(front=(size[0], size[2]), back=(size[0], size[2]), side=(size[1], size[2]), top=(size[0], size[1]))
    out = []
    for v in views:
        d = Vector(VIEW_DIRS[v]).normalized(); cam.location = Vector(c) + d * R * 3
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); cam.data.ortho_scale = max(ext.get(v, (R * 0.85, R * 0.85))) * pad
        bpy.context.scene.render.filepath = f'{prefix}_{v}.jpg'; bpy.ops.render.render(write_still=True); out.append(bpy.context.scene.render.filepath)
    bpy.data.objects.remove(cam); return out


def save(path):
    ensure(os.path.dirname(path)); bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)


def grid_views(prefix, objs, views=('side', 'top', 'front'), res=1536, texture=True, pad=1.1):
    """Orthographic renders plus a <prefix>_<view>.json with the pixel mapping, so grid.py (plain Python + Pillow)
    can draw a labelled metric grid and joint dots on top. side: camera at +X (image right = -Y... see `h`)."""
    workbench(res, texture); bpy.context.view_layer.update()
    pts = np.concatenate([np.array([(o.matrix_world @ Vector(c))[:] for c in o.bound_box]) for o in objs])
    lo, hi = pts.min(0), pts.max(0); c = (lo + hi) / 2; size = hi - lo; R = float(np.linalg.norm(size))
    cam = bpy.data.objects.new('qa_cam', bpy.data.cameras.new('qa_cam')); bpy.context.scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.clip_end = R * 10; bpy.context.scene.camera = cam
    # view -> (camera direction from centre, image-right world axis vector, image-up world axis vector)
    V = dict(side=((1, 0, 0), (0, 1, 0), (0, 0, 1)), front=((0, -1, 0), (1, 0, 0), (0, 0, 1)), back=((0, 1, 0), (-1, 0, 0), (0, 0, 1)),
             top=((0, 0, 1), (1, 0, 0), (0, 1, 0)))
    out = {}
    for v in views:
        d, right, up = (np.array(a, float) for a in V[v])
        scale = max(abs(size @ right), abs(size @ up)) * pad
        cam.location = Vector(c + d * R * 3)
        m = Matrix((Vector(right), Vector(up), Vector(d))).transposed()  # columns: camera x, y, z in world
        cam.rotation_euler = m.to_euler(); cam.data.ortho_scale = scale
        bpy.context.scene.render.filepath = f'{prefix}_{v}.jpg'; bpy.ops.render.render(write_still=True)
        meta = dict(img=f'{prefix}_{v}.jpg', res=res, scale=float(scale), centre=c.tolist(), right=right.tolist(), up=up.tolist())
        json.dump(meta, open(f'{prefix}_{v}.json', 'w')); out[v] = meta
    bpy.data.objects.remove(cam); return out


def cycles_gpu(samples=16):
    """Cycles on the GPU (OPTIX on the RTX box, CUDA as a fallback, CPU if there is no device)."""
    s = bpy.context.scene; s.render.engine = 'CYCLES'; s.cycles.samples = samples; s.cycles.use_denoising = False
    try:
        pr = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                pr.compute_device_type = kind; pr.get_devices()
                devs = [d for d in pr.devices if d.type == kind]
                if devs:
                    for d in pr.devices: d.use = d.type == kind
                    s.cycles.device = 'GPU'; print('cycles device', kind, [d.name for d in devs]); return kind
            except Exception as e: print('no', kind, e)
    except Exception as e: print('cycles prefs', e)
    s.cycles.device = 'CPU'; return 'CPU'


def pbr_material(name, bc, nrm, orm, double_sided=False, emissive=None, emissive_strength=1.0):
    """glTF-ready material: base colour, tangent normal map, ORM (R = AO through the glTF settings node, G = roughness,
    B = metallic), optional emissive image."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    def tex(img, x, y):
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img; n.location = (x, y); return n
    t = tex(bc, -700, 300); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if nrm is not None:
        t = tex(nrm, -700, -300); nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if orm is not None:
        t = tex(orm, -700, 0); sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(t.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
        g = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        if 'Occlusion' not in [i.name for i in g.interface.items_tree]: g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        gn = nt.nodes.new('ShaderNodeGroup'); gn.node_tree = g; nt.links.new(sep.outputs['Red'], gn.inputs['Occlusion'])
    if emissive is not None:
        t = tex(emissive, -700, -600); nt.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = emissive_strength
    m.use_backface_culling = not double_sided
    return m


def beauty(prefix, objs, views=('q34', 'behind', 'below'), res=1100, samples=48, persp=True, pad=1.0, frame=None, focus=None):
    """Lit check renders (Cycles GPU, warm low sun + sky): what the owner looks at."""
    s = bpy.context.scene; cycles_gpu(samples); s.cycles.use_denoising = True
    s.render.resolution_x = s.render.resolution_y = res; s.render.image_settings.file_format = 'JPEG'; s.render.image_settings.quality = 90
    w = s.world or bpy.data.worlds.new('w'); s.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
    bg = nt.nodes.new('ShaderNodeBackground'); out = nt.nodes.new('ShaderNodeOutputWorld')
    bg.inputs['Color'].default_value = (0.50, 0.62, 0.80, 1); bg.inputs['Strength'].default_value = 0.9; nt.links.new(bg.outputs[0], out.inputs['Surface'])
    if frame is not None: s.frame_set(frame)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); pts = []
    for o in objs:
        e = o.evaluated_get(dg); me = e.to_mesh(); n = len(me.vertices); a = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', a)
        a = a.reshape(n, 3); M = np.array(o.matrix_world); pts.append(a @ M[:3, :3].T + M[:3, 3]); e.to_mesh_clear()
    pts = np.concatenate(pts); lo, hi = pts.min(0), pts.max(0); c = (lo + hi) / 2; R = float(np.linalg.norm(hi - lo)) / 2
    if focus is not None: c = np.array(focus[0], float); R = float(focus[1])
    cam = bpy.data.objects.new('qa_cam', bpy.data.cameras.new('qa_cam')); s.collection.objects.link(cam); s.camera = cam
    cam.data.lens = 50; cam.data.clip_end = R * 40
    sun = bpy.data.objects.new('qa_sun', bpy.data.lights.new('qa_sun', 'SUN')); s.collection.objects.link(sun)
    sun.data.energy = 2.2; sun.data.color = (1.0, 0.9, 0.78); sun.data.angle = math.radians(3); sun.rotation_euler = (math.radians(58), 0, math.radians(-35))
    out_files = []
    for v in views:
        d = Vector(VIEW_DIRS[v]).normalized(); cam.location = Vector(c) + d * R * 2.9 * pad
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        s.render.filepath = f'{prefix}_{v}.jpg'; bpy.ops.render.render(write_still=True); out_files.append(s.render.filepath)
    bpy.data.objects.remove(cam); bpy.data.objects.remove(sun); return out_files


def proc_material(name, col_a, col_b=None, scale=6.0, rough=0.6, metal=0.0, bump=0.3, bump_scale=40.0, emission=None, emission_strength=0.0, detail='noise'):
    """A procedural source material for self_bake: two colours mixed by noise, a noise or voronoi bump. The numbers
    are kept on the material (custom properties) so the roughness/metallic/emissive bakes can read them."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = scale; n1.inputs['Detail'].default_value = 6
    nt.links.new(tc.outputs['Object'], n1.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['A'].default_value = (*col_a, 1); mix.inputs['B'].default_value = (*(col_b or col_a), 1)
    ramp = nt.nodes.new('ShaderNodeMapRange'); ramp.inputs['From Min'].default_value = 0.35; ramp.inputs['From Max'].default_value = 0.65
    nt.links.new(n1.outputs['Fac'], ramp.inputs['Value']); nt.links.new(ramp.outputs['Result'], mix.inputs['Factor']); nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    if bump > 0:
        if detail == 'voronoi':
            n2 = nt.nodes.new('ShaderNodeTexVoronoi'); n2.inputs['Scale'].default_value = bump_scale; n2.feature = 'DISTANCE_TO_EDGE'; h = n2.outputs['Distance']
        else:
            n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = bump_scale; n2.inputs['Detail'].default_value = 8; h = n2.outputs['Fac']
        nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = 0.02
        nt.links.new(h, bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = 0.0   # metallic stays 0 for the colour bake
    m['rough'] = rough; m['metal'] = metal; m['emit'] = list(emission) if emission else [0, 0, 0]; m['emit_strength'] = emission_strength
    return m


def self_bake(obj, N, margin=6, ao_samples=64, normal_from=None):
    """Bake an object's procedural materials into its own UVs: base colour, tangent normals (material bumps, or the
    surface of `normal_from` = a high poly object, selected to active), roughness, metallic, emissive, AO.
    Returns float arrays (rows run up): bc, nrm (N, N, 3), rough, metal, ao (N, N), emit (N, N, 3)."""
    cycles_gpu(samples=8); active(obj)
    img = bpy.data.images.new('selfbake', N, N, alpha=False, float_buffer=True)
    nodes = []
    for m in obj.data.materials:
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img; m.node_tree.nodes.active = n; nodes.append((m, n))
    bk = bpy.context.scene.render.bake; bk.use_selected_to_active = False; bk.margin = margin; bk.use_clear = True
    bk.use_pass_direct = bk.use_pass_indirect = False; bk.use_pass_color = True
    def grab():
        a = np.empty(N * N * 4, np.float32); img.pixels.foreach_get(a); return a.reshape(N, N, 4)[:, :, :3].copy()
    out = {}
    img.colorspace_settings.name = 'Non-Color'
    bpy.ops.object.bake(type='DIFFUSE'); lin = grab(); out['bc'] = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.maximum(lin, 1e-9) ** (1 / 2.4) - 0.055)
    if normal_from is not None:
        bpy.ops.object.select_all(action='DESELECT'); normal_from.select_set(True); obj.select_set(True); bpy.context.view_layer.objects.active = obj
        bk.use_selected_to_active = True; bk.cage_extrusion = float(obj.get('cage', 0.08)); bk.max_ray_distance = float(obj.get('ray', 0.3))
    bk.normal_space = 'TANGENT'; bpy.ops.object.bake(type='NORMAL'); out['nrm'] = grab()
    bk.use_selected_to_active = False; active(obj)
    # roughness / metallic / emissive: constants per material through an emission bake
    saved = []
    for m, n in nodes:
        nt = m.node_tree; outn = next(x for x in nt.nodes if x.type == 'OUTPUT_MATERIAL' and x.is_active_output); old = outn.inputs['Surface'].links[0].from_socket
        em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(em.outputs[0], outn.inputs['Surface']); saved.append((nt, outn, old, em))
    for nt_, outn, old, em in saved:
        mat = next(m for m, n in nodes if m.node_tree == nt_); em.inputs['Color'].default_value = (0, mat['rough'], mat['metal'], 1)
    bpy.ops.object.bake(type='EMIT'); rm = grab(); out['rough'] = rm[:, :, 1]; out['metal'] = rm[:, :, 2]
    for nt_, outn, old, em in saved:
        mat = next(m for m, n in nodes if m.node_tree == nt_); e = mat['emit']; k = mat['emit_strength']; em.inputs['Color'].default_value = (e[0] * k, e[1] * k, e[2] * k, 1)
    bpy.ops.object.bake(type='EMIT'); out['emit'] = np.clip(grab(), 0, 1)
    for nt_, outn, old, em in saved: nt_.links.new(old, outn.inputs['Surface']); nt_.nodes.remove(em)
    bpy.context.scene.cycles.samples = ao_samples; bpy.ops.object.bake(type='AO'); out['ao'] = grab()[:, :, 0]
    for m, n in nodes: m.node_tree.nodes.remove(n)
    bpy.data.images.remove(img); return out


def write_png(path, rgb, colorspace):
    N = rgb.shape[0]; name = os.path.splitext(os.path.basename(path))[0]
    img = bpy.data.images.new(name, N, N, alpha=False); img.colorspace_settings.name = colorspace
    a = np.concatenate([np.clip(rgb, 0, 1).astype(np.float32), np.ones((N, N, 1), np.float32)], -1); img.pixels.foreach_set(a.ravel())
    ensure(os.path.dirname(path)); img.filepath_raw = path; img.file_format = 'PNG'; img.save(); return img


def uv_unwrap(obj, angle=66, margin=0.006):
    active(obj)
    if not obj.data.uv_layers: obj.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT'); bpy.ops.uv.pack_islands(margin=margin, rotate=True); bpy.ops.object.mode_set(mode='OBJECT')


def finish_textures(root, name, baked, emissive=False, emissive_strength=1.0, double_sided=True):
    """Write <name>_{basecolor,normal,orm[,emissive]}.png from self_bake arrays and return the final glTF material."""
    bad = baked['nrm'][:, :, 2] < 0.5; baked['nrm'][bad] = (0.5, 0.5, 1.0)
    ibc = write_png(f'{root}/out/tex/{name}_basecolor.png', baked['bc'], 'sRGB')
    inr = write_png(f'{root}/out/tex/{name}_normal.png', baked['nrm'], 'Non-Color')
    iorm = write_png(f'{root}/out/tex/{name}_orm.png', np.stack([np.clip(0.35 + 0.65 * baked['ao'], 0, 1), baked['rough'], baked['metal']], -1), 'Non-Color')
    iem = write_png(f'{root}/out/tex/{name}_emissive.png', baked['emit'], 'sRGB') if emissive else None
    return pbr_material(name, ibc, inr, iorm, double_sided=double_sided, emissive=iem, emissive_strength=emissive_strength)

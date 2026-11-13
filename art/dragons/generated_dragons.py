"""Companion dragons from the owner's generated models (two sculpts: an amber one and a pearl one, wingless, standing
on four legs; they come with a humanoid auto-rig that is of no use here). Each is welded (it arrives as a triangle
soup), decimated, given UVs of its own with the colour baked from the source, weighted BY RULE to the companions' skeleton (root, spine_0..2, neck,
head, tail_0..4, leg_<FL|FR|BL|BR> and leg_.._1; no wing bones: these dragons have none) and given the same clips as
the procedural build (build_dragons.py: idle, follow, fly, glide, perch, flip, cheer, land), so scenes/companion.js
flies them unchanged. Kinds: cinder = the amber sculpt, nacre = the pearl sculpt, rill = the pearl sculpt with its
texture turned teal.
    blender -b --factory-startup -P art/dragons/generated_dragons.py -- <amber.glb> <pearl.glb> <out dir> [--lite]
"""
import math, os, sys
import bmesh, bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dragons as BD

# joints in the model's own unit box (snout y = -0.5, tail tip y = +0.5, z up, the body's centre line at x = cx)
KINDS = {
    'cinder': dict(src=0, length=0.50, cx=-0.087, tint=None,
                   axis=[('head', (-0.50, 0.54), (-0.36, 0.58)), ('neck', (-0.36, 0.58), (-0.27, 0.45)), ('spine_1', (-0.27, 0.45), (-0.20, 0.36)), ('spine_0', (-0.20, 0.36), (0.00, 0.32)),
                         ('spine_2', (0.00, 0.32), (0.11, 0.30)), ('tail_0', (0.11, 0.30), (0.19, 0.27)), ('tail_1', (0.19, 0.27), (0.27, 0.26)), ('tail_2', (0.27, 0.26), (0.34, 0.28)),
                         ('tail_3', (0.34, 0.28), (0.41, 0.36)), ('tail_4', (0.41, 0.36), (0.49, 0.48))],
                   legs={'F': (0.13, -0.28, 0.27), 'B': (0.17, 0.04, 0.27)}),
    'nacre': dict(src=1, length=0.58, cx=0.0, tint=None,
                  axis=[('head', (-0.50, 0.50), (-0.37, 0.58)), ('neck', (-0.37, 0.58), (-0.30, 0.42)), ('spine_1', (-0.30, 0.42), (-0.25, 0.33)), ('spine_0', (-0.25, 0.33), (-0.12, 0.30)),
                        ('spine_2', (-0.12, 0.30), (0.01, 0.30)), ('tail_0', (0.01, 0.30), (0.10, 0.25)), ('tail_1', (0.10, 0.25), (0.20, 0.12)), ('tail_2', (0.20, 0.12), (0.30, 0.05)),
                        ('tail_3', (0.30, 0.05), (0.40, 0.07)), ('tail_4', (0.40, 0.07), (0.50, 0.10))],
                  legs={'F': (0.09, -0.34, 0.27), 'B': (0.11, -0.04, 0.26)}),
}
KINDS['rill'] = dict(KINDS['nacre'], length=0.64, tint=(0.16, 0.50, 0.52))
ss = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))


def build(kind, srcs, tris):
    K = KINDS[kind]; bpy.ops.wm.read_factory_settings(use_empty=True); bpy.context.scene.render.fps = BD.FPS
    bpy.ops.import_scene.gltf(filepath=srcs[K['src']])
    el = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices)); me = el.data
    co = np.array([(el.matrix_world @ v.co)[:] for v in me.vertices]); co[:, 0] -= K['cx']; img = next((i for i in bpy.data.images if i.size[0] > 0), None)
    for o in [o for o in bpy.data.objects if o is not el]: bpy.data.objects.remove(o)
    el.parent = None; el.matrix_world.identity()
    for md in list(el.modifiers): el.modifiers.remove(md)
    for vg in list(el.vertex_groups): el.vertex_groups.remove(vg)
    me.vertices.foreach_set('co', co.ravel()); me.update()
    # The source is a triangle soup with thousands of tiny UV islands: it is welded by position and decimated, the low
    # mesh gets UVs of its own and its colour is baked from the untouched source (one layer of skin: nothing behind it)
    hi = el.copy(); hi.data = el.data.copy(); hi.name = 'source'; bpy.context.scene.collection.objects.link(hi)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5); bm.to_mesh(me); bm.free(); me.update()
    if el.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(el)
    bpy.ops.object.select_all(action='DESELECT'); el.select_set(True); bpy.context.view_layer.objects.active = el
    now = len(me.polygons)
    if tris < now:
        d = el.modifiers.new('dec', 'DECIMATE'); d.ratio = tris / now; bpy.ops.object.modifier_apply(modifier='dec')
    me = el.data
    for l in list(me.uv_layers): me.uv_layers.remove(l)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004); bpy.ops.object.mode_set(mode='OBJECT')
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 4
    try:
        pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'OPTIX'; pr.get_devices()
        for d_ in pr.devices: d_.use = d_.type != 'CPU'
        sc.cycles.device = 'GPU'
    except Exception as e_: print('GPU bake not available:', e_)
    for m_ in hi.data.materials:
        nt = m_.node_tree; out = next(q for q in nt.nodes if q.type == 'OUTPUT_MATERIAL'); bsdf = next((q for q in nt.nodes if q.type == 'BSDF_PRINCIPLED'), None)
        if bsdf and bsdf.inputs['Base Color'].links:
            em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(bsdf.inputs['Base Color'].links[0].from_socket, em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface'])
    baked = bpy.data.images.new('dragon_%s_base' % kind, 1024, 1024, alpha=False)
    bm_ = bpy.data.materials.new('bake'); bm_.use_nodes = True; tb = bm_.node_tree.nodes.new('ShaderNodeTexImage'); tb.image = baked; bm_.node_tree.nodes.active = tb
    me.materials.clear(); me.materials.append(bm_)
    bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); el.select_set(True); bpy.context.view_layer.objects.active = el
    bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=0.012, max_ray_distance=0.0, margin=6)
    baked.pack(); bpy.data.objects.remove(hi); img = baked
    me = el.data; el.name = me.name = 'dragon_' + kind
    for p in me.polygons: p.use_smooth = True
    n = len(me.vertices); co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3); x, y, z = co.T
    vn = np.array([v.normal[:] for v in me.vertices]); _, inv = np.unique(np.round(co, 5), axis=0, return_inverse=True); inv = inv.ravel(); acc = np.zeros((inv.max() + 1, 3)); np.add.at(acc, inv, vn)
    sn = acc[inv]; sn /= np.maximum(np.linalg.norm(sn, axis=1, keepdims=True), 1e-9); me.normals_split_custom_set_from_vertices([tuple(v) for v in sn])
    # ---- weights by rule: the two nearest neighbouring bones of the body's axis; the legs by height
    A = K['axis']; P0 = np.array([(0, a[0], a[1]) for _, a, b in A]); P1 = np.array([(0, b[0], b[1]) for _, a, b in A]); D = np.zeros((len(A), n))
    for k in range(len(A)):
        ab = P1[k] - P0[k]; t = np.clip(((co - P0[k]) @ ab) / (ab @ ab), 0, 1); D[k] = np.linalg.norm(co - P0[k] - t[:, None] * ab, axis=1)
    k0 = D.argmin(0); idx = np.arange(n); W = {nm: np.zeros(n) for nm, _, _ in A}
    left = np.clip(k0 - 1, 0, len(A) - 1); right = np.clip(k0 + 1, 0, len(A) - 1); k1 = np.where(D[left, idx] < D[right, idx], left, right); k1 = np.where(k1 == k0, right, k1)
    w0 = 1 / (D[k0, idx] + 0.012) ** 4; w1 = np.where(k1 == k0, 0, 1 / (D[k1, idx] + 0.012) ** 4)
    for k, (nm, _, _) in enumerate(A): W[nm] += np.where(k0 == k, w0 / (w0 + w1), 0) + np.where(k1 == k, w1 / (w0 + w1), 0)
    legs = {}
    for fb, (lx, ly, lz) in K['legs'].items():
        for sd, sg in (('L', -1), ('R', 1)):
            name = f'leg_{fb}{sd}'; hip = np.array([sg * lx, ly, lz]); knee = np.array([sg * lx, ly, lz * 0.5]); foot = np.array([sg * lx, ly - 0.01, 0.02]); legs[name] = (hip, knee, foot)
            m = (np.abs(y - ly) < 0.10) & (x * sg > 0.02) & (z < lz + 0.04)
            wl = ss(lz + 0.04, lz - 0.06, z) * ss(0.02, 0.05, x * sg) * m; lo = ss(lz * 0.5 + 0.03, lz * 0.5 - 0.03, z)
            for nm in W: W[nm] = W[nm] * (1 - wl)
            W[name] = wl * (1 - lo); W[name + '_1'] = wl * lo
    tot = sum(W.values())
    for nm, w in W.items():
        g = el.vertex_groups.new(name=nm); w = w / tot
        for i in np.nonzero(w > 0.004)[0]: g.add([int(i)], float(w[i]), 'REPLACE')
    # ---- the rig: the same bone conventions as the procedural build, so its clips apply
    arm = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('rig', arm); bpy.context.scene.collection.objects.link(rig); bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT'); eb = arm.edit_bones
    J = {nm: (Vector((0, a[0], a[1])), Vector((0, b[0], b[1]))) for nm, a, b in A}
    def bone(name, h, t, parent=None, up=(0, 0, 1)):
        b = eb.new(name); b.head, b.tail = Vector(h), Vector(t); b.align_roll(Vector(up))
        if parent: b.parent = eb[parent]; b.use_connect = False
    c = J['spine_0'][1]; bone('root', c, c + Vector((0, 0.06, 0)))
    bone('spine_0', J['spine_0'][1], J['spine_0'][0], 'root'); bone('spine_1', J['spine_1'][1], J['spine_1'][0], 'spine_0'); bone('neck', J['neck'][1], J['neck'][0], 'spine_1'); bone('head', J['head'][1], J['head'][0], 'neck')
    bone('spine_2', J['spine_2'][0], J['spine_2'][1], 'root'); prev = 'spine_2'
    for k in range(5): bone(f'tail_{k}', J[f'tail_{k}'][0], J[f'tail_{k}'][1], prev); prev = f'tail_{k}'
    for name, (hip, knee, foot) in legs.items():
        bone(name, hip, knee, 'spine_1' if name[4] == 'F' else 'spine_2', up=(0, -1, 0)); bone(name + '_1', knee, foot, name, up=(0, -1, 0))
    bpy.ops.object.mode_set(mode='OBJECT'); el.parent = rig; md = el.modifiers.new('rig', 'ARMATURE'); md.object = rig
    # ---- material: its own texture (tinted for the teal kind)
    mat = bpy.data.materials.new('M_Dragon_Body'); mat.use_nodes = True; bs = mat.node_tree.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = 0.5
    if img:
        if K['tint']:
            W_, H_ = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4); lum = px[:, :3].mean(1, keepdims=True); sat = (px[:, :3].max(1, keepdims=True) - px[:, :3].min(1, keepdims=True))
            t = np.array(K['tint'], np.float32); out = np.clip(t * (0.35 + 1.25 * lum ** 1.6), 0, 1); keep = np.clip(sat * 4 - 0.6, 0, 1); px[:, :3] = out * (1 - keep) + px[:, :3] * keep      # the eyes and other saturated details stay
            img.pixels.foreach_set(px.ravel()); img.pack()
        tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img; mat.node_tree.links.new(tn.outputs['Color'], bs.inputs['Base Color'])
    me.materials.clear(); me.materials.append(mat)
    BD.animate(rig, None); rig.scale = (K['length'],) * 3; bpy.context.view_layer.update()
    return len(me.polygons), n


def main():
    a = sys.argv[sys.argv.index('--') + 1:]; srcs, out = a[:2], a[2]; lite = '--lite' in a; os.makedirs(out, exist_ok=True)
    for kind in ('nacre', 'rill', 'cinder'):
        for m, tris in (('', 7000), ('_m', 3000))[:2 if lite else 1]:
            t, v = build(kind, srcs, tris); BD.export(os.path.join(out, f'dragon_{kind}{m}.glb')); print('DRAGON', kind + m, 'tris', t, 'verts', v, flush=True)


if __name__ == '__main__':
    main()

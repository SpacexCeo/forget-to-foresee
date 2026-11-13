"""Companion dragons from the owner's generated models (two sculpts: an amber one and a pearl one, wingless, standing
on four legs; they come with a humanoid auto-rig that is of no use here). Each is welded (it arrives as a triangle
soup), decimated, given UVs of its own with the colour baked from the source, weighted BY RULE to the companions' skeleton (root, spine_0..2, neck,
head, tail_0..4, leg_<FL|FR|BL|BR> and leg_.._1, wing_<L|R>_0..2) and given the same clip names as the procedural build
(build_dragons.py: idle, follow, fly, glide, perch, flip, cheer, land), so scenes/companion.js flies them unchanged.
The sculpts are wingless: the wing bones carry a pair of small "spirit wings" (a separate mesh `spirit_wings`, material
M_Spirit_Wing, about 50 triangles a wing; the game draws it as tinted light). The flight clips are livelier than the
procedural ones (pose() below): the legs paddle and tuck, front and back out of phase, and dangle in the hover; an
S-wave runs down the tail; the wings beat softly. There are no frill or fin bones on these sculpts: nothing to flutter. Kinds: cinder = the amber sculpt, nacre = the pearl sculpt, rill = the pearl sculpt with its
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

WING_TINT = {'nacre': (1.0, 0.93, 0.82), 'rill': (0.35, 0.92, 0.86), 'cinder': (1.0, 0.68, 0.25)}
BASE_POSE = BD.pose
#          legs: (beats, swing, L/R offset)   tail yaw, tail pitch wave   wings: (beats, mean, amp)
ALIVE = {'idle': dict(leg=(1, 0.16, 0.9), yaw=0.24, wave=0.07, wing=(2, 0.16, 0.34)),
         'follow': dict(leg=(2, 0.30, math.pi), yaw=0.30, wave=0.09, wing=(2, 0.14, 0.44)),
         'fly': dict(leg=(2, 0.36, math.pi), yaw=0.26, wave=0.10, wing=(2, 0.10, 0.56)),
         'glide': dict(leg=(1, 0.10, 0.6), yaw=0.16, wave=0.05, wing=(1, 0.26, 0.10))}


def pose(name, u, S):
    """The procedural build's pose with the flight made livelier (every term loops: whole beats per clip)."""
    R = BASE_POSE(name, u, S); A = ALIVE.get(name)
    if not A: return R
    ph = math.tau * u
    n, sw, lr = A['leg']
    for leg in ('leg_FL', 'leg_FR', 'leg_BL', 'leg_BR'):
        a, b = R[leg][0], R[leg + '_1'][0]
        th = ph * n + (math.pi if leg[4] == 'B' else 0.0) + (lr if leg[5] == 'R' else 0.0)      # front and back out of phase; left and right alternate
        tuck = 0.5 + 0.5 * math.sin(th - 1.2)                                                     # the shin folds as the thigh comes forward
        R[leg] = (a + sw * math.sin(th), 0, 0.05 * math.sin(th + 0.6) * (-1 if leg[5] == 'L' else 1))
        R[leg + '_1'] = (b - sw * 0.5 + sw * 1.3 * tuck, 0, 0)
    for k in range(5):                                                                            # an S-wave down the tail: a full wave from root to tip
        g = 0.45 + 0.2 * k
        R[f'tail_{k}'] = (R[f'tail_{k}'][0] + A['wave'] * g * math.sin(ph * 2 - k * 1.1), 0, A['yaw'] * g * math.sin(ph - k * 1.25))
    R['spine_2'] = (0, 0, 0.07 * math.sin(ph + 1.0)); R['spine_1'] = (0.02 * math.sin(ph * 2), 0, -0.03 * math.sin(ph + 2.0))
    beats, mean, amp = A['wing']; beat = ph * beats; st = math.sin(beat + 0.3 * math.sin(beat))
    for side, sgn in (('L', -1), ('R', 1)):
        R[f'wing_{side}_0'] = (mean + amp * st, 0, sgn * 0.12 * amp * math.cos(beat))
        R[f'wing_{side}_1'] = (0.45 * amp * math.sin(beat - 0.8) - 0.06, 0, sgn * 0.2 * amp * max(0.0, math.cos(beat)))
        R[f'wing_{side}_2'] = (0.5 * amp * math.sin(beat - 1.5) + 0.04 * math.sin(ph * 3 + sgn), 0, 0)
    return R


BD.pose = pose


def spirit_wings(kind, K, J, rig):
    """Two small light wings on the wing bones: a strip of quads from the leading edge to a scalloped trailing edge."""
    y0, z0 = K['legs']['F'][1] + 0.02, None
    a, b = J['spine_1']; t = min(1.0, max(0.0, (y0 - a.y) / ((b.y - a.y) or 1e-6))); z0 = a.z + (b.z - a.z) * t + 0.035
    half = 0.36; NS, NC = 9, 3; verts, faces, uvs, wts, bones = [], [], [], [], {}
    for side, sgn in (('L', -1), ('R', 1)):
        sh = Vector((sgn * 0.035, y0, z0)); X = lambda fx, dy, dz: Vector((sgn * half * fx, sh.y + dy * 0.6, sh.z + dz))
        el, wr, tip = X(0.34, -0.07, 0.05), X(0.68, -0.10, 0.06), X(0.98, 0.03, 0.03)
        lead = [sh, el, wr, tip, X(1.0, 0.11, 0.02)]
        trail = [Vector((sgn * 0.03, sh.y + 0.13, sh.z - 0.03)), X(0.26, 0.30, 0.0), X(0.52, 0.33, 0.0), X(0.76, 0.27, 0.0), X(0.93, 0.17, 0.01), X(1.0, 0.11, 0.02)]
        Ls = BD.resample(BD.smooth_poly(lead), NS - 1); Ts = BD.resample(BD.smooth_poly(trail), NS - 1)
        bones[side] = (sh, el, wr, tip); segs = [(sh, el), (el, wr), (wr, tip)]; base = len(verts)
        for i in range(NS):
            for j in range(NC):
                c = j / (NC - 1); scal = 1.0 - 0.10 * abs(math.sin(i * math.pi * 3 / (NS - 1))) * c          # the trailing edge scallops
                p = Vector(Ls[i]).lerp(Vector(Ts[i]), c * scal); verts.append(p); uvs.append((i / (NS - 1), c))
                d = []
                for (q0, q1) in segs:
                    ab = q1 - q0; tt = min(1.0, max(0.0, (p - q0).dot(ab) / ab.dot(ab))); d.append(abs(p.x - (q0 + ab * tt).x) + 0.004)
                w = [1 / x ** 2 for x in d]; tw = sum(w); wts.append({f'wing_{side}_{k}': w[k] / tw for k in range(3)})
        for i in range(NS - 1):
            for j in range(NC - 1):
                q = [base + i * NC + j, base + (i + 1) * NC + j, base + (i + 1) * NC + j + 1, base + i * NC + j + 1]; faces.append(q if sgn > 0 else q[::-1])
    me = bpy.data.meshes.new('spirit_wings'); me.from_pydata([v[:] for v in verts], [], faces); me.update()
    uv = me.uv_layers.new(name='UVMap')
    for l in me.loops: uv.data[l.index].uv = uvs[l.vertex_index]
    ob = bpy.data.objects.new('spirit_wings', me); bpy.context.scene.collection.objects.link(ob)
    for i, w in enumerate(wts):
        for nm, x in w.items():
            g = ob.vertex_groups.get(nm) or ob.vertex_groups.new(name=nm)
            if x > 0.01: g.add([i], x, 'REPLACE')
    m = bpy.data.materials.new('M_Spirit_Wing'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']; c = WING_TINT[kind]
    bs.inputs['Base Color'].default_value = (*c, 1); bs.inputs['Emission Color'].default_value = (*c, 1); bs.inputs['Emission Strength'].default_value = 1.2; bs.inputs['Alpha'].default_value = 0.45
    m.blend_method = 'BLEND'; m.use_backface_culling = False; me.materials.append(m)
    ob.parent = rig; md = ob.modifiers.new('rig', 'ARMATURE'); md.object = rig
    return bones, len(faces) * 2


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
    for sd, sg in (('L', -1), ('R', 1)):                                                   # the spirit wings' bones: the same layout and signs as the procedural wings
        y0 = K['legs']['F'][1] + 0.02; a_, b_ = J['spine_1']; t_ = min(1.0, max(0.0, (y0 - a_.y) / ((b_.y - a_.y) or 1e-6))); z0 = a_.z + (b_.z - a_.z) * t_ + 0.035
        sh = Vector((sg * 0.035, y0, z0)); X = lambda fx, dy, dz: Vector((sg * 0.36 * fx, sh.y + dy * 0.6, sh.z + dz))
        el_, wr, tip = X(0.34, -0.07, 0.05), X(0.68, -0.10, 0.06), X(0.98, 0.03, 0.03)
        bone(f'wing_{sd}_0', sh, el_, 'spine_1'); bone(f'wing_{sd}_1', el_, wr, f'wing_{sd}_0'); bone(f'wing_{sd}_2', wr, tip, f'wing_{sd}_1')
    bpy.ops.object.mode_set(mode='OBJECT'); el.parent = rig; md = el.modifiers.new('rig', 'ARMATURE'); md.object = rig
    spirit_wings(kind, K, J, rig)
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

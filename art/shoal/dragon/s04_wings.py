"""Step 04 (shoal_dragon): build the wings in code (numbers in dragon.json: `wing`).
  blender -b --python s04_wings.py -- --root <work root>
Tripo and the other generators lose thin membranes, so (TZ: "build these parts in code") the wings are made here:
arm and finger bones as tapered tubes, membranes as parametric panels between the fingers with a scalloped trailing
edge and a little camber. Every vertex gets its UV in a fixed atlas cell (painted in s06) and analytic skin weights
for the wing bones made in s07. Output: work/04_wings.blend (objects body_hi, wing), renders/s04_*.jpg, report/s04.json."""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

A = args(); ROOT = A['root']
CFG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dragon.json')))
C = CFG['wing']; AB = CFG['budget']['atlas_body']
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/02_reshape.blend')
body = bpy.data.objects['body_hi']
from wingdef import wing_curves
S, E, W, B, TH, TIPS, bez, finger, arm = wing_curves(C)
NU, NV = C['nu'], C['nv']

verts = []; faces = []; uvs = []; wts = []; mats = []   # per vertex: uv, weights; per face: material index


def cell_uv(cell, a, b):
    """Atlas cells (painted in s06): finger panels 0..2 stacked in the right strip (a runs up), the arm panel (3),
    the front membrane (4) and the bones (5) in the top strip (a runs right)."""
    m = 0.004
    if cell < 3:
        u0, u1 = AB + m, 1 - m; v0, v1 = cell / 3 + m, (cell + 1) / 3 - m
        return (u0 + b * (u1 - u0), v0 + a * (v1 - v0))
    u0, u1 = ((0 + m, 0.5 - m) if cell == 3 else (0.5 + m, 0.62 - m) if cell == 4 else (0.62 + m, AB - m)); v0, v1 = AB + m, 1 - m
    return (u0 + a * (u1 - u0), v0 + b * (v1 - v0))


def ab_w(name, t, lo=0.38, hi=0.62):
    s = float(smooth(lo, hi, t)); return {name + 'a': 1 - s, name + 'b': s}


def arm_w(u):
    s = float(smooth(0.42, 0.58, u)); return {'wing_arm': 1 - s, 'wing_fore': s}


def mix(*pairs):
    out = {}
    for w, d in pairs:
        for k, x in d.items(): out[k] = out.get(k, 0) + w * x
    return {k: x for k, x in out.items() if x > 1e-4}


def grid(P, UVf, Wf, nu, nv, mat=0):
    base = len(verts)
    for i in range(nu + 1):
        for j in range(nv + 1):
            u, v = i / nu, j / nv; verts.append(P(u, v)); uvs.append(UVf(u, v)); wts.append(Wf(u, v))
    for i in range(nu):
        for j in range(nv):
            a = base + i * (nv + 1) + j; faces.append((a, a + nv + 1, a + nv + 2, a + 1)); mats.append(mat)


# finger panels: between finger i and finger i+1
for i in range(3):
    def P(u, v, i=i):
        p = finger(i, u) * (1 - v) + finger(i + 1, u) * v
        p = W + (p - W) * (1 - C['scallop'] * np.sin(np.pi * v) * u * u)
        p[2] += C['camber'] * np.sin(np.pi * v) * u * (1 - 0.35 * u); return p
    grid(P, lambda u, v, i=i: cell_uv(i, u, v),
         lambda u, v, i=i: mix((1 - v, ab_w(f'wing_f{i + 1}', u)), (v, ab_w(f'wing_f{i + 2}', u))), NU, NV)
# arm panel: between the arm and the trailing edge B -> tip 4; its outer edge is finger 4
tctl = (B + TIPS[3]) / 2 + np.array([0.25, -0.95, 0.05])


def P(u, v):
    p = arm(u) * (1 - v) + bez(B, tctl, TIPS[3], u) * v
    p = p + u ** 4 * (finger(3, v) - (W * (1 - v) + TIPS[3] * v))
    p[2] += C['camber'] * 1.3 * np.sin(np.pi * v) * np.sin(np.pi * min(1, u * 1.15)); return p


grid(P, lambda u, v: cell_uv(3, u, v),
     lambda u, v: mix(((1 - v), arm_w(u)), (v * (1 - u) ** 1.3, {'spine1': 1}), (v * (1 - (1 - u) ** 1.3), ab_w('wing_f4', v))), NU, NV)
# the front membrane between the shoulder and the wrist
fctl = (S + W) / 2 + (E - (S + W) / 2) * 0.45
grid(lambda u, v: arm(u) * (1 - v) + bez(S, fctl, W, u) * v, lambda u, v: cell_uv(4, u, v), lambda u, v: mix((1, arm_w(u))), NU, 3)


def tube(pts, radii, wf, sides=8):
    """A tapered tube along a polyline; wf(k, t) -> weights at ring k (t = 0..1 along)."""
    pts = np.asarray(pts, float); n = len(pts); base = len(verts)
    tang = np.gradient(pts, axis=0); tang /= np.linalg.norm(tang, axis=1)[:, None]
    up = np.array([0, 0, 1.0])
    for k in range(n):
        t = tang[k]; a = np.cross(t, up); a /= np.linalg.norm(a); b = np.cross(a, t)
        for s in range(sides):
            ang = 2 * np.pi * s / sides
            verts.append(pts[k] + radii[k] * (np.cos(ang) * a + np.sin(ang) * b * 0.85))
            uvs.append(cell_uv(5, s / sides, k / (n - 1))); wts.append(wf(k, k / (n - 1)))
    for k in range(n - 1):
        for s in range(sides):
            a0 = base + k * sides + s; a1 = base + k * sides + (s + 1) % sides
            faces.append((a0, a1, a1 + sides, a0 + sides)); mats.append(1)
    for end, flipc in ((0, True), (n - 1, False)):
        c = len(verts); verts.append(pts[end]); uvs.append(cell_uv(5, 0.5, end / max(1, n - 1))); wts.append(wf(end, end / (n - 1)))
        for s in range(sides):
            a0 = base + end * sides + s; a1 = base + end * sides + (s + 1) % sides
            faces.append((c, a1, a0) if flipc else (c, a0, a1)); mats.append(1)


ts = np.linspace(0, 1, 11)
knob = lambda t, r0, r1: r0 + (r1 - r0) * t + 0.035 * (np.exp(-(t / 0.08) ** 2) + np.exp(-((1 - t) / 0.08) ** 2))
tube(S + (E - S) * ts[:, None], knob(ts, 0.21, 0.14), lambda k, t: {'wing_arm': 1}, sides=10)
tube(E + (W - E) * ts[:, None], knob(ts, 0.14, 0.10), lambda k, t: {'wing_fore': 1} if k else {'wing_arm': 0.5, 'wing_fore': 0.5}, sides=10)
for i in range(4):
    tt = np.linspace(0, 1, 13)
    tube(finger(i, tt), 0.085 * (1 - tt) ** 0.8 + 0.012 + 0.02 * np.exp(-((tt - 0.5) / 0.05) ** 2),
         lambda k, t, i=i: ab_w(f'wing_f{i + 1}', t, 0.44, 0.56))
tt = np.linspace(0, 1, 7)
tube(bez(W, (W + TH) / 2 + np.array([0.12, 0, 0.1]), TH, tt), 0.085 * (1 - tt) + 0.004, lambda k, t: {'wing_fore': 1})

me = bpy.data.meshes.new('wing'); me.from_pydata([tuple(float(x) for x in v) for v in verts], [], faces); me.update()
ob = bpy.data.objects.new('wing', me); bpy.context.scene.collection.objects.link(ob)
for name in ('pearl_wing', 'pearl_bone'): me.materials.append(bpy.data.materials.new(name))
me.polygons.foreach_set('material_index', mats)
uvl = me.uv_layers.new(name='UVMap')
for l in me.loops: uvl.data[l.index].uv = uvs[l.vertex_index]
groups = {}
for vi, d in enumerate(wts):
    for k, x in d.items():
        g = groups.get(k)
        if g is None: g = groups[k] = ob.vertex_groups.new(name=k if k == 'spine1' else k + '.L')
        g.add([vi], x, 'REPLACE')
# weld the panel borders (same points by construction), then mirror to the right side
active(ob); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=2e-4)
bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
up_share = float(np.mean([p.normal.z > 0 for p in me.polygons if p.material_index == 0]))
for g in list(ob.vertex_groups):
    if g.name.endswith('.L'): ob.vertex_groups.new(name=g.name[:-2] + '.R')
m = ob.modifiers.new('mirror', 'MIRROR'); m.use_axis = (True, False, False); m.use_mirror_merge = False; m.use_mirror_vertex_groups = True
bpy.ops.object.modifier_apply(modifier='mirror')
for p in me.polygons: p.use_smooth = True
co = coords(ob)
r = dict(step='s04_wings', tris=tris(ob), verts=len(me.vertices), span=round(float(np.ptp(co[:, 0])), 3), membrane_up_share=round(up_share, 3),
         bbox=[co.min(0).round(3), co.max(0).round(3)], groups=[g.name for g in ob.vertex_groups], stats=mesh_stats(ob), status='PASS')
save(f'{ROOT}/work/04_wings.blend')
grid_views(f'{ROOT}/renders/s04', [body, ob], views=('top', 'front', 'side'), res=1280, texture=False)
report(f'{ROOT}/report/s04.json', r)

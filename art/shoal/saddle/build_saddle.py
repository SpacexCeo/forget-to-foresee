"""dragon_saddle: the saddle and harness of the pearl dragon, built in code to the dragon's own back.
  blender -b --python build_saddle.py -- --root <saddle work root> --dragon <dragon work root>
Reads the dragon's game mesh (work/06_bake.blend) and its saddle socket (dragon.json), builds the parts around it
(blanket with a raised pad over the spine plates, seat with pommel and cantle, side flaps, two girths that close under
the belly, stirrups on leathers, brass buckles and handles, a bedroll),
lays the soft parts on the body's own cross-sections (ray casts), unwraps, bakes its procedural materials into one atlas and exports
out/dragon_saddle_raw.glb with the origin at the socket (the game parents it to the dragon's `saddle` bone).
A replacement dragon mesh only needs this script run again. Report: report/saddle.json, renders/saddle_*.jpg."""
import bpy, bmesh, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from lib import *

A = args(); ROOT = A['root']; DR = A['dragon']; N = int(A.get('size', 1024))
CFG = json.load(open(os.path.join(os.path.dirname(HERE), 'dragon', 'dragon.json')))
SOCKET = np.array(CFG['saddle']['pos'], float)
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(f'{DR}/work/06_bake.blend') as (src, dst): dst.objects = ['dragon']
dragon = dst.objects[0]; bpy.context.scene.collection.objects.link(dragon)
# the wrap target: the body without the wings and without the dorsal plates' tips (a smooth voxel shell)
target = dragon.copy(); target.data = dragon.data.copy(); target.name = 'wrap_target'; bpy.context.scene.collection.objects.link(target)
bm = bmesh.new(); bm.from_mesh(target.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != 0 or abs(f.calc_center_median().x) > 1.5], context='FACES'); bm.to_mesh(target.data); bm.free()
active(target); target.data.remesh_voxel_size = 0.05; bpy.ops.object.voxel_remesh()
m = target.modifiers.new('s', 'SMOOTH'); m.iterations = 12; m.factor = 0.6; bpy.ops.object.modifier_apply(modifier='s')

MATS = {
    'leather': proc_material('leather', (0.16, 0.085, 0.05), (0.10, 0.05, 0.03), scale=9, rough=0.55, bump=0.5, bump_scale=160, detail='voronoi'),
    'leather_dark': proc_material('leather_dark', (0.075, 0.045, 0.035), (0.05, 0.03, 0.025), scale=7, rough=0.6, bump=0.4, bump_scale=140, detail='voronoi'),
    'cloth': proc_material('cloth', (0.86, 0.84, 0.88), (0.78, 0.76, 0.84), scale=3, rough=0.85, bump=0.35, bump_scale=420),
    'trim': proc_material('trim', (0.80, 0.58, 0.22), (0.62, 0.42, 0.14), scale=20, rough=0.35, metal=1.0, bump=0.15, bump_scale=90),
    'brass': proc_material('brass', (0.83, 0.62, 0.25), (0.70, 0.50, 0.18), scale=14, rough=0.3, metal=1.0, bump=0.1, bump_scale=60),
    'roll': proc_material('roll', (0.16, 0.42, 0.45), (0.12, 0.33, 0.38), scale=4, rough=0.8, bump=0.35, bump_scale=380),
}
parts = []


def mesh_obj(name, verts, faces, mat, smooth_shade=True):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in verts], [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(MATS[mat])
    for p in me.polygons: p.use_smooth = smooth_shade
    parts.append(o); return o


def grid(name, P, nu, nv, mat, close_u=False):
    verts = [P(i / nu, j / nv) for i in range(nu + (0 if close_u else 1)) for j in range(nv + 1)]
    cols = nu + (0 if close_u else 1); faces = []
    for i in range(nu):
        for j in range(nv):
            a = i * (nv + 1) + j; b = ((i + 1) % cols) * (nv + 1) + j; faces.append((a, b, b + 1, a + 1))
    return mesh_obj(name, verts, faces, mat)


def solid(o, thick):
    active(o); m = o.modifiers.new('t', 'SOLIDIFY'); m.thickness = thick; m.offset = 1; bpy.ops.object.modifier_apply(modifier='t')


Y0 = SOCKET[1]; ZT = SOCKET[2]; CZ = 2.33      # the body's axis height under the saddle (s03 torso table)
K = 1.25                                        # the seat's size against the first version: the back is 2.5 m up, a small seat read as a toy
bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()


def onbody(ang, y, off):
    """The point of the body's cross-section at `y` in direction `ang` from the top (radians, + = left), pushed out by `off`."""
    d = Vector((math.sin(ang), 0, math.cos(ang))); o = Vector((0, y, CZ)) + d * 3.0
    hit, loc, nor, idx = target.ray_cast(o, -d, distance=3.0, depsgraph=dg)
    p = (loc if hit else Vector((0, y, CZ)) + d * 0.9) + d * off; return np.array(p)


BACK = float(onbody(0.0, Y0, 0.0)[2])            # the back's own height under the seat
ZT = BACK + 0.17; SOCKET[2] = ZT                 # the seat sits on the back; dragon.json's socket z must be this (the report prints it)
ridge = lambda ang: 0.03 + 0.07 * math.exp(-(ang / 0.22) ** 2)   # the pad stands off the spine so the dorsal plates stay under it


# 1. blanket: over the back, a scalloped hem with a gold border
hem = lambda u: 1.0 + 0.07 * math.cos(u * math.pi * 10)
grid('blanket', lambda u, v: onbody((v * 2 - 1) * hem(u), Y0 - 0.72 + 1.48 * u, ridge((v * 2 - 1) * hem(u))), 22, 20, 'cloth')
for sgn in (1, -1):
    grid(f'blanket_trim{sgn}', lambda u, v, sgn=sgn: onbody(sgn * (hem(u) * (0.93 + 0.08 * v)), Y0 - 0.72 + 1.48 * u, 0.04), 22, 1, 'trim')
# 2. side flaps under the seat
for sgn in (1, -1):
    grid(f'flap{sgn}', lambda u, v, sgn=sgn: onbody(sgn * (0.16 + 0.70 * v * (0.8 + 0.2 * math.sin(u * math.pi))), Y0 - 0.46 + 0.92 * u, 0.055 + 0.07 * math.exp(-((0.16 + 0.70 * v) / 0.3) ** 2)), 8, 6, 'leather_dark')
# 3. two girths: closed loops on the body's own cross-section, with brass buckles on both sides
GIRTHS = (Y0 - 0.40, Y0 - 0.06)        # both on the barrel, in front of the thighs
for k, gy in enumerate(GIRTHS):
    o = grid(f'girth{k}', lambda u, v, gy=gy: onbody(u * 2 * math.pi, gy + (v - 0.5) * 0.11, 0.012 + 0.10 * math.exp(-(min(u, 1 - u) * 2 * math.pi / 0.3) ** 2)), 48, 1, 'leather', close_u=True); solid(o, 0.02)   # on the skin all the way round, over the pad on top
# 4. the seat: a saddle surface with a pommel and a raised cantle, closed underneath
def seat_top(u, v):
    s = u * 2 - 1; a = v * 2 - 1; y = Y0 + 0.50 * K * s
    h = 0.20 * max(0.0, -s) ** 2.4 * 1.2 + 0.30 * max(0.0, s) ** 2.0     # pommel in front (-y), cantle behind
    half = 0.36 * K * (1 - 0.30 * s * s) * (1 + 0.10 * s)
    return np.array([half * a * (1 + 0.25 * h), y + 0.06 * s * h, ZT + h * (1 - 0.35 * a * a) - 0.30 * abs(a) ** 2.2 + 0.015])
top = grid('seat', seat_top, 12, 10, 'leather'); solid(top, -0.07)
# seat rim piping
def piping(u, v):
    t = u * 2 * math.pi; s = math.copysign(abs(math.cos(t)) ** 0.3, math.cos(t)); a = math.copysign(abs(math.sin(t)) ** 0.3, math.sin(t)); c = seat_top((s + 1) / 2, (a + 1) / 2); r = 0.018
    return c + np.array([r * math.cos(v * 2 * math.pi) * a, r * math.cos(v * 2 * math.pi) * s * 0.5, r * math.sin(v * 2 * math.pi)])
grid('piping', piping, 32, 4, 'trim', close_u=True)
# 5. brass: buckles on the girths, two handles in front of the pommel, rings on the breast strap
def torus(name, centre, R, r, axis, arc=1.0, nseg=14, mat='brass'):
    ax = np.array(axis, float); ax /= np.linalg.norm(ax); e1 = np.cross(ax, [0, 0, 1.0]); e1 = e1 / np.linalg.norm(e1) if np.linalg.norm(e1) > 1e-6 else np.array([1.0, 0, 0]); e2 = np.cross(ax, e1)
    def P(u, v):
        t = (u * arc) * 2 * math.pi; d = math.cos(t) * e1 + math.sin(t) * e2; w = v * 2 * math.pi
        return np.array(centre) + d * (R + r * math.cos(w)) + ax * r * math.sin(w)
    return grid(name, P, int(nseg * max(arc, 0.5)), 5, mat, close_u=arc >= 0.999)
for sgn in (1, -1):
    for k, gy in enumerate(GIRTHS):
        torus(f'buckle{sgn}{k}', onbody(sgn * 1.0, gy, 0.095), 0.065, 0.014, (sgn * 0.8, 0, 0.6), nseg=10)
    base = seat_top(0.06, 0.5 + sgn * 0.18)
    torus(f'handle{sgn}', (sgn * 0.13, base[1] - 0.02, base[2] - 0.02), 0.085, 0.016, (1, 0, 0), arc=0.5)
# 6. stirrups: a leather from under each flap down the flank, a brass D-ring the rider's foot stands in
# (the seat is at the socket; a 1.7 m rider's sole is about 0.8 m below it with the knee bent)
STIRRUP = dict(y=Y0 - 0.12, drop=0.80, ang0=0.55)
for sgn in (1, -1):
    lo = None
    for a_ in np.linspace(STIRRUP['ang0'], 1.9, 40):          # down the flank until the foot's height
        q_ = onbody(sgn * a_, STIRRUP['y'], 0.05)
        if q_[2] <= ZT - STIRRUP['drop'] + 0.16: lo = a_; break
    lo = lo or 1.5
    grid(f'leather{sgn}', lambda u, v, sgn=sgn, lo=lo: onbody(sgn * (STIRRUP['ang0'] + (lo - STIRRUP['ang0']) * u), STIRRUP['y'] + (v - 0.5) * 0.05, 0.05), 10, 1, 'leather_dark')
    eye = onbody(sgn * lo, STIRRUP['y'], 0.11)
    torus(f'stirrup{sgn}', (eye[0] + sgn * 0.02, eye[1], eye[2] - 0.085), 0.085, 0.013, (0, 1, 0), nseg=12)
    grid(f'tread{sgn}', lambda u, v, sgn=sgn, eye=eye: np.array([eye[0] + sgn * 0.02 + (u - 0.5) * 0.15, eye[1] + (v - 0.5) * 0.07, eye[2] - 0.168]), 2, 1, 'brass')
# 7. a bedroll behind the cantle with two leather ties
cz = seat_top(1.0, 0.5)[2] - 0.13; cy = Y0 + 0.50 * K + 0.16
def roll(u, v):
    x = -0.34 + 0.68 * v; t = u * 2 * math.pi; r = 0.105 * (1 - 0.25 * abs(v * 2 - 1) ** 6) * (1 + 0.03 * math.sin(t * 5))
    return np.array([x, cy + r * math.cos(t), cz + r * math.sin(t)])
grid('bedroll', roll, 12, 6, 'roll', close_u=True)
for sx in (-0.2, 0.2):
    grid(f'tie{sx}', lambda u, v, sx=sx: np.array([sx - 0.02 + 0.04 * v, cy + 0.113 * math.cos(u * 2 * math.pi), cz + 0.113 * math.sin(u * 2 * math.pi)]), 14, 1, 'leather_dark', close_u=True)

# ---- one object, origin at the socket, UVs, bake, final material
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); sad = bpy.context.view_layer.objects.active; sad.name = 'dragon_saddle'; sad.data.name = 'dragon_saddle'
active(sad); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.dissolve_degenerate(threshold=1e-5); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
co = coords(sad); co -= SOCKET; set_coords(sad, co)
dragon.location = -Vector(SOCKET); target.hide_render = True; dragon.hide_render = True
uv_unwrap(sad, angle=66, margin=0.008)
baked = self_bake(sad, N)
mat = finish_textures(ROOT, 'dragon_saddle', baked)
sad.data.materials.clear(); sad.data.materials.append(mat)
for p in sad.data.polygons: p.material_index = 0
bpy.ops.file.pack_all()
st = mesh_stats(sad)
r = dict(step='build_saddle', back_z=round(BACK, 3), socket=SOCKET.round(3), socket_in_json=CFG['saddle']['pos'], tris=tris(sad), verts=len(sad.data.vertices), bbox=[co.min(0).round(3), co.max(0).round(3)], parts=st['parts'], zero_faces=st['zero_faces'], size=N,
         status='PASS' if tris(sad) <= 6000 and st['zero_faces'] == 0 else 'CHECK')
bpy.data.objects.remove(target)
save(f'{ROOT}/work/saddle.blend'); ensure(f'{ROOT}/renders')
beauty(f'{ROOT}/renders/saddle', [sad], views=('q34', 'behind', 'side'), res=900, samples=48)
dragon.hide_render = False
beauty(f'{ROOT}/renders/saddle_on', [sad], views=('q34', 'behind', 'side'), res=900, samples=48, focus=((0, 0, -0.5), 2.6))
report(f'{ROOT}/report/saddle.json', r)

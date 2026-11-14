"""shoal_tideling: the Hollow Tide's spawn (the "adds" of the boss fight), built in code in the boss's own materials.
  blender -b --python build_tideling.py -- --root <tideling work root> [--size 1024]
A shard crawler about 0.9 m long and 1.8 m across the legs: a glowing cyan core under three chipped stone plates,
a stone head with two glass mandibles and slit eyes, glass crystals along the back, four jointed stone legs that end
in glass points. Faces -Y, Z up, feet on z = 0, origin under the body.
Rig: root, body, jaw, four legs (upper, lower, tip). Rigid weights (stone does not bend).
Clips (30 fps): idle (2 s loop), walk (0.5 s loop, in place, 3.6 m/s = the adds' speed in the rules, diagonal pairs, feet held by IK), bite (0.5 s),
spawn (0.7 s, up through the mirror), death (0.9 s, the legs give way and it sinks).
Output: work/tideling.blend (model, rig, one NLA track per clip), out/tex/*, report/tideling.json, renders/tideling_*.jpg."""
import bpy, bmesh, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from lib import *
from animkit import *

A = args(); ROOT = A['root']; N = int(A.get('size', 1024))
bpy.ops.wm.read_factory_settings(use_empty=True)
rng = np.random.default_rng(23)
sin, cos, pi = math.sin, math.cos, math.pi
MATS = {
    'stone': proc_material('stone', (0.045, 0.055, 0.07), (0.11, 0.125, 0.15), scale=2.4, rough=0.32, bump=1.0, bump_scale=7, detail='voronoi'),
    'stone_lo': proc_material('stone_lo', (0.07, 0.085, 0.10), (0.15, 0.17, 0.19), scale=4, rough=0.4, bump=0.8, bump_scale=10, detail='voronoi'),
    'core': proc_material('core', (0.05, 0.3, 0.36), (0.1, 0.5, 0.6), scale=4, rough=0.3, bump=0.0, emission=(0.10, 0.72, 0.95), emission_strength=1.0),
    'glass': proc_material('glass', (0.70, 0.86, 0.90), (0.50, 0.74, 0.82), scale=4, rough=0.12, bump=0.25, bump_scale=16, emission=(0.25, 0.6, 0.7), emission_strength=0.35),
    'eye': proc_material('eye', (0.1, 0.5, 0.6), None, rough=0.2, bump=0.0, emission=(0.45, 0.95, 1.0), emission_strength=1.0),
}
parts = []     # (object, bone)


def mesh_obj(name, verts, faces, mat, bone, smooth_shade=False):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in verts], [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(MATS[mat])
    for p in me.polygons: p.use_smooth = smooth_shade
    parts.append((o, bone)); return o


def prism(name, a, b, r0, r1, mat, bone, sides=6, tip=0.0, squash=1.0):
    """A tapered prism from a to b (radius r0 -> r1), closed, with a point `tip` (fraction of its length) past b."""
    a = np.array(a, float); b = np.array(b, float); ax = b - a; L = np.linalg.norm(ax); ax /= L
    e1 = np.cross(ax, [0.31, 0.2, 0.93]); e1 /= np.linalg.norm(e1); e2 = np.cross(ax, e1) * squash
    ring = lambda c, r, tw: [c + r * (cos(2 * pi * k / sides + tw) * e1 + sin(2 * pi * k / sides + tw) * e2) for k in range(sides)]
    V = ring(a, r0, 0.0) + ring(a + ax * L * 0.55, (r0 + r1) / 2 * 1.12, 0.12) + ring(b, r1, 0.24); F = []
    for layer in range(2):
        for k in range(sides):
            p, q_ = layer * sides + k, layer * sides + (k + 1) % sides; F.append((p, q_, q_ + sides, p + sides))
    V.append(a - ax * r0 * 0.3); c0 = len(V) - 1; V.append(b + ax * max(tip * L, r1 * 0.3)); c1 = len(V) - 1
    for k in range(sides): F.append((c0, (k + 1) % sides, k)); F.append((c1, 2 * sides + k, 2 * sides + (k + 1) % sides))
    return mesh_obj(name, V, F, mat, bone)


C0 = np.array([0.0, 0.0, 0.56]); RAD = np.array([0.34, 0.47, 0.30])          # the body: an ellipsoid


def plate(name, u0, u1, half, lift, bone='body'):
    """A stone plate: a patch of the body's ellipsoid from u0 to u1 along it (-1 front .. 1 back), `half` radians down
    each side from the top, standing `lift` off the core, with a chipped rim."""
    nu, nv = 6, 10; V = []; F = []
    for i in range(nu + 1):
        for j in range(nv + 1):
            u = u0 + (u1 - u0) * i / nu; ph = -half + 2 * half * j / nv; k = math.sqrt(max(0.0, 1 - u * u))
            edge = (i in (0, nu)) or (j in (0, nv)); s = 1 + lift + (rng.normal(0, 0.035) if edge else rng.normal(0, 0.012))
            V.append(C0 + np.array([RAD[0] * sin(ph) * k, RAD[1] * u, RAD[2] * cos(ph) * k * (1.0 + 0.25 * (1 - abs(ph) / half))]) * s)
    for i in range(nu):
        for j in range(nv):
            a = i * (nv + 1) + j; F.append((a, a + nv + 1, a + nv + 2, a + 1))
    o = mesh_obj(name, V, F, 'stone', bone)
    active(o); m = o.modifiers.new('t', 'SOLIDIFY'); m.thickness = 0.045; m.offset = 1; bpy.ops.object.modifier_apply(modifier='t'); return o


# ---- the body: core, three plates with the glow between them, crystals along the back
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1.0, location=tuple(C0)); core = bpy.context.active_object
core.scale = tuple(RAD * 0.93); bpy.ops.object.transform_apply(scale=True); core.data.materials.append(MATS['core'])
for p in core.data.polygons: p.use_smooth = True
parts.append((core, 'body'))
plate('plate_front', -0.92, -0.36, 1.75, 0.10); plate('plate_mid', -0.26, 0.30, 1.9, 0.16); plate('plate_rear', 0.40, 0.94, 1.7, 0.09)
for i, (u, x, h) in enumerate(((-0.31, 0.0, 0.34), (-0.31, 0.13, 0.22), (-0.31, -0.14, 0.2), (0.35, 0.05, 0.42), (0.35, -0.12, 0.26), (0.35, 0.17, 0.2))):
    base = C0 + np.array([x, RAD[1] * u, RAD[2] * 0.9]); prism(f'crystal{i}', base, base + np.array([x * 0.8, 0.06 * (1 if u > 0 else -0.4), h]), 0.05, 0.022, 'glass', 'body', sides=5, tip=0.5)
prism('tail', C0 + np.array([0, RAD[1] * 0.9, 0.02]), C0 + np.array([0, RAD[1] + 0.34, 0.16]), 0.07, 0.02, 'glass', 'body', sides=5, tip=0.5)
# ---- the head: a stone wedge, slit eyes, two glass mandibles on the jaw bone
HEAD = C0 + np.array([0, -RAD[1] * 0.86, -0.04])
prism('head', HEAD + np.array([0, 0.06, 0.02]), HEAD + np.array([0, -0.30, -0.05]), 0.20, 0.10, 'stone_lo', 'body', sides=7, tip=0.25, squash=0.72)
for sgn in (1, -1):
    prism(f'eye{sgn}', HEAD + np.array([sgn * 0.085, -0.14, 0.085]), HEAD + np.array([sgn * 0.12, -0.26, 0.05]), 0.028, 0.012, 'eye', 'body', sides=4, tip=0.4, squash=0.5)
    prism(f'mandible{sgn}', HEAD + np.array([sgn * 0.09, -0.22, -0.09]), HEAD + np.array([sgn * 0.04, -0.52, -0.16]), 0.045, 0.014, 'glass', 'jaw', sides=5, tip=0.6)
    prism(f'brow{sgn}', HEAD + np.array([sgn * 0.11, -0.02, 0.12]), HEAD + np.array([sgn * 0.20, 0.10, 0.27]), 0.04, 0.012, 'stone', 'body', sides=5, tip=0.5)
# ---- four legs: hip on the flank, the knee above the back, the glass point on the ground
LEGS = {}
for n, sx, sy in (('fl', 1, -1), ('fr', -1, -1), ('rl', 1, 1), ('rr', -1, 1)):
    hip = np.array([sx * 0.27, sy * 0.25, 0.54]); knee = np.array([sx * 0.70, sy * 0.40, 0.90]); foot = np.array([sx * 0.86, sy * 0.52, 0.0])
    LEGS[n] = (hip, knee, foot)
    prism(f'leg_{n}_upper', hip, knee, 0.075, 0.055, 'stone', f'leg_{n}_upper', sides=6)
    prism(f'knee_{n}', knee + np.array([0, 0, -0.02]), knee + np.array([sx * 0.05, sy * 0.03, 0.14]), 0.05, 0.015, 'glass', f'leg_{n}_upper', sides=5, tip=0.5)
    mid = knee + (foot - knee) * 0.62
    prism(f'leg_{n}_lower', knee, mid, 0.06, 0.04, 'stone_lo', f'leg_{n}_lower', sides=6)
    prism(f'leg_{n}_point', mid, foot + np.array([0, 0, 0.02]), 0.04, 0.008, 'glass', f'leg_{n}_lower', sides=5, tip=0.02)

# ---- one object with rigid vertex groups, UVs, bake, final material
for o, bone in parts:
    g = o.vertex_groups.new(name=bone); g.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
bpy.ops.object.select_all(action='DESELECT')
for o, _ in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0][0]; bpy.ops.object.join(); tide = bpy.context.view_layer.objects.active; tide.name = 'shoal_tideling'; tide.data.name = 'shoal_tideling'
active(tide); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
for p in tide.data.polygons: p.use_smooth = False
uv_unwrap(tide, angle=60, margin=0.006)
baked = self_bake(tide, N, ao_samples=96)
mat = finish_textures(ROOT, 'shoal_tideling', baked, emissive=True, emissive_strength=2.5, double_sided=True)
tide.data.materials.clear(); tide.data.materials.append(mat)
for p in tide.data.polygons: p.material_index = 0
bpy.ops.file.pack_all()

# ---- rig
BONES = [('root', (0, 0, 0), (0, 0, 0.3), None, False), ('body', (0, 0.25, 0.56), (0, -0.35, 0.56), 'root', True), ('jaw', tuple(HEAD + np.array([0, -0.2, -0.08])), tuple(HEAD + np.array([0, -0.5, -0.15])), 'body', True)]
for n, (hip, knee, foot) in LEGS.items():
    BONES += [(f'leg_{n}_upper', tuple(hip), tuple(knee), 'body', True), (f'leg_{n}_lower', tuple(knee), tuple(foot), f'leg_{n}_upper', True),
              (f'leg_{n}_tip', tuple(foot), tuple(foot + np.array([0, 0, 0.08])), f'leg_{n}_lower', False)]
ad = bpy.data.armatures.new('tideling_rig'); rig = bpy.data.objects.new('tideling_rig', ad); bpy.context.scene.collection.objects.link(rig)
active(rig); bpy.ops.object.mode_set(mode='EDIT')
for name, h, t, par, deform in BONES:
    b = ad.edit_bones.new(name); b.head = [float(v) for v in h]; b.tail = [float(v) for v in t]; b.roll = 0; b.use_deform = deform
    if par: b.parent = ad.edit_bones[par]; b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
tide.parent = rig; md = tide.modifiers.new('rig', 'ARMATURE'); md.object = rig

# ---- clips
K = Baker(rig, tide, skip=()); sk = Skel(rig)
sm = lambda a, b, x: float(smooth(a, b, x))
HOME = {n: sk.head[f'leg_{n}_tip'].copy() for n in LEGS}
PHASE = {'fl': 0.0, 'rr': 0.0, 'fr': 0.5, 'rl': 0.5}
STRIDE, LIFT, DUTY, T_WALK = 0.9, 0.20, 0.5, 0.5      # 3.6 m/s: the speed the rules move an add at (game/shoal-rules.js BOSS.add.speed)


def stand(p, feet=None, k=1.0):
    """IK: every foot on its spot (or on feet[name]); k < 1 blends from the legs already in p."""
    for n in LEGS: sk.plant(p, f'leg_{n}_upper', f'leg_{n}_lower', f'leg_{n}_tip', (feet or HOME).get(n, HOME[n]), k=k)
    return p


def idle(t):
    ph = 2 * pi * t; p = Pose(); p['body'] = q(x=1.5 * sin(ph), y=1.2 * sin(ph + 1)); p['jaw'] = q(x=4 + 4 * sin(2 * ph)); p.loc = (0, 0, 0.012 * sin(ph)); return stand(p)


def walk(t):
    p = Pose(); ph = 2 * pi * t
    p['body'] = q(x=2.0 * sin(2 * ph + 0.6), y=3.5 * sin(ph), z=2.5 * sin(ph + 0.5)); p['jaw'] = q(x=6 + 5 * sin(2 * ph)); p.loc = (0, 0, 0.025 * sin(2 * ph))
    feet = {}
    for n in LEGS:
        f = (t + PHASE[n]) % 1.0
        if f < DUTY: dy, dz = STRIDE * (-0.5 + f / DUTY), 0.0                    # on the ground: it runs back under the body
        else: s = (f - DUTY) / (1 - DUTY); dy, dz = STRIDE * (0.5 - s), LIFT * sin(pi * s)   # swing forward (-Y)
        feet[n] = HOME[n] + np.array([0, dy, dz])
    return stand(p, feet)


def bite(t):
    """0.5 s: it rears a little, snaps forward with the mandibles wide, shuts them, settles."""
    back = sm(0.0, 0.22, t) * (1 - sm(0.22, 0.4, t)); snap = sm(0.26, 0.42, t) * (1 - sm(0.6, 1.0, t))
    p = Pose(); p['body'] = q(x=-9 * back + 13 * snap); p['jaw'] = q(x=4 + 46 * sm(0.05, 0.3, t) * (1 - sm(0.42, 0.52, t)))
    p.loc = (0, 0.08 * back - 0.26 * snap, 0.03 * back - 0.05 * snap); return blend(stand(p), idle(0), sm(0.85, 1.0, t))


def tucked(p):
    for n, (hip, knee, foot) in LEGS.items():
        sx = 1 if n.endswith('l') else -1
        p[f'leg_{n}_upper'] = q(y=sx * 38); p[f'leg_{n}_lower'] = q(y=-sx * 62)
    return p


def spawn(t):
    """0.7 s: up through the mirror with the legs folded, they open and take the weight."""
    up = 1 - (1 - sm(0.0, 0.75, t)) ** 2; p = tucked(Pose()); p['body'] = q(x=-14 * (1 - up)); p['jaw'] = q(x=4 + 30 * (1 - up))
    p.loc = (0, 0, -1.15 * (1 - up)); stand(p, k=sm(0.45, 0.85, t)); return blend(p, idle(0), sm(0.9, 1.0, t))


def death(t):
    """0.9 s: a jolt, the legs give way, it rolls onto its side and sinks into the mirror."""
    jolt = sm(0.0, 0.12, t) * (1 - sm(0.12, 0.3, t)); fall = sm(0.15, 0.55, t) ** 2; sink = sm(0.55, 1.0, t)
    p = stand(Pose())
    limp = tucked(Pose())
    for n in LEGS:
        sx = 1 if n.endswith('l') else -1
        limp[f'leg_{n}_upper'] = q(y=-sx * 30, x=14); limp[f'leg_{n}_lower'] = q(y=sx * 24)
    p = blend(p, limp, fall)
    p['body'] = q(x=-10 * jolt + 6 * fall, y=26 * fall); p['jaw'] = q(x=4 + 38 * jolt + 20 * fall)
    p.loc = (0, 0.05 * jolt, 0.05 * jolt - 0.30 * fall - 0.9 * sink); return p


CLIPS = [('idle', idle, 2.0, True, None), ('walk', walk, T_WALK, True, None), ('bite', bite, 0.5, False, idle(0)), ('spawn', spawn, 0.7, False, idle(0)), ('death', death, 0.9, False, None)]
for name, fn, sec, loop, ends in CLIPS: K.bake(name, fn, sec, loop, ends_like=ends)
# the feet under a walking body: how far a planted point drifts against the ground running at the clip's speed
speed = STRIDE / (DUTY * T_WALK); drift = 0.0
for n in LEGS:
    for i in range(48):
        t = i / 48; f = (t + PHASE[n]) % 1.0
        if f >= DUTY: continue
        F = sk.fk(walk(t)); tip = sk.at(F, f'leg_{n}_tip'); want = HOME[n] + np.array([0, STRIDE * (-0.5 + f / DUTY), 0]); drift = max(drift, float(np.linalg.norm(tip - want)))
rig.animation_data.use_nla = False; K.apply(idle(0))
co = K.deformed()
r = dict(step='build_tideling', tris=tris(tide), verts=len(tide.data.vertices), bones=len(ad.bones), size_m=[round(float(v), 3) for v in np.ptp(co, axis=0)], lowest_z=round(float(co[:, 2].min()), 3),
         walk_speed_mps=round(speed, 3), walk_planted_drift_m=round(drift, 5), clips=K.checks, texture=N,
         status='PASS' if tris(tide) <= 4000 and drift < 0.005 and all(c.get('loop_closure_m', 0) < 1e-3 and c.get('end_gap_m', 0) < 2e-3 for c in K.checks.values()) else 'CHECK')
ensure(f'{ROOT}/renders')
VIEW_DIRS['hero'] = (0.7, -1, 0.45)
beauty(f'{ROOT}/renders/tideling', [tide], views=('hero', 'side', 'front_lo', 'top'), res=900, samples=48)
K.apply(walk(0.2)); beauty(f'{ROOT}/renders/tideling_walk', [tide], views=('hero',), res=900, samples=48)
K.apply(bite(0.42)); beauty(f'{ROOT}/renders/tideling_bite', [tide], views=('hero',), res=900, samples=48)
K.apply(Pose()); rig.animation_data.use_nla = True
save(f'{ROOT}/work/tideling.blend')
report(f'{ROOT}/report/tideling.json', r)

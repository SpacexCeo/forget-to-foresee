"""Step 01 (hollow_tide): the Hollow Tide, built in code: mesh, materials, bake, rig and weights.
  blender -b --python b01_build.py -- --root <boss work root> [--src <replacement.glb>] [--size 2048]
A colossal serpent of stacked dark wet stone plates and pale glass crystal that rises out of the mirror: seams that
glow cyan on the chest, a slot in the chest where the hollow core shows, a wide jaw with crystal teeth, a crown of
tall crystals, fins along the spine. Numbers in boss.json (metres, Z up, facing -Y, the base at the origin).
Weights are analytic: every vertex follows the spine bones by its place along the spine curve; the head, the jaw,
each fin and each crystal are rigid. With --src a replacement mesh (an ultra generation, risen pose, facing -Y) is
fitted to the same height and skinned by the same rule; it keeps its own UVs and textures (no bake).
Output: work/01_build.blend (hollow_tide + boss_rig), out/tex/*.png, report/b01.json, renders/b01_*.jpg."""
import bpy, bmesh, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from lib import *

A = args(); ROOT = A['root']; N = int(A.get('size', 2048))
C = json.load(open(os.path.join(HERE, 'boss.json')))
bpy.ops.wm.read_factory_settings(use_empty=True)
rng = np.random.default_rng(C['seed'])
NS = 600; SS = np.linspace(0, 1, NS); SH = C['head_from']; NB = C['spine_bones']


def curve_raw(u):
    u = np.asarray(u, float); c = C['curve']
    y = c['back'] * np.sin(np.pi * u) - c['hook'] * u ** 3
    z = c['z0'] + c['rise'] * u - c['droop'] * u ** 4
    return np.stack([np.zeros_like(u), y, z], -1)


_raw = curve_raw(np.linspace(0, 1, 4000)); _cum = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(_raw, axis=0), axis=1))]); _cum /= _cum[-1]
PTS = np.stack([np.interp(SS, _cum, _raw[:, k]) for k in range(3)], -1)        # s = the share of the spine's length
curve = lambda s: np.stack([np.interp(np.asarray(s, float), SS, PTS[:, k]) for k in range(3)], -1)
TAN = np.gradient(PTS, axis=0); TAN /= np.linalg.norm(TAN, axis=1)[:, None]
XAX = np.array([1.0, 0, 0]); NRM = np.cross(XAX, TAN)           # NRM: the front of the body (-Y where the spine stands upright)
LEN = float(np.linalg.norm(np.diff(PTS, axis=0), axis=1).sum())
frame = lambda s: (np.array([np.interp(s, SS, PTS[:, k]) for k in range(3)]), np.array([np.interp(s, SS, TAN[:, k]) for k in range(3)]), np.array([np.interp(s, SS, NRM[:, k]) for k in range(3)]))


def radius(s):
    r = np.interp(s, [0, 0.3, 0.7, SH, 1], C['radius'])
    return r


def chest(s): return math.exp(-((s - C['chest'][0]) / C['chest'][1]) ** 2)


MATS = {
    'stone': proc_material('stone', (0.045, 0.055, 0.07), (0.11, 0.125, 0.15), scale=0.9, rough=0.32, bump=1.0, bump_scale=2.2, detail='voronoi'),
    'stone_lo': proc_material('stone_lo', (0.07, 0.085, 0.10), (0.15, 0.17, 0.19), scale=1.6, rough=0.4, bump=0.8, bump_scale=3.0, detail='voronoi'),
    'seam': proc_material('seam', (0.012, 0.016, 0.02), (0.03, 0.04, 0.05), scale=2, rough=0.6, bump=0.3, bump_scale=8),
    'glow': proc_material('glow', (0.02, 0.10, 0.12), (0.04, 0.2, 0.24), scale=2.5, rough=0.4, bump=0.0, emission=(0.04, 0.55, 0.85), emission_strength=1.0),
    'core': proc_material('core', (0.05, 0.3, 0.36), (0.1, 0.5, 0.6), scale=1.5, rough=0.3, bump=0.0, emission=(0.10, 0.72, 0.95), emission_strength=1.0),
    'glass': proc_material('glass', (0.70, 0.86, 0.90), (0.50, 0.74, 0.82), scale=1.2, rough=0.12, bump=0.25, bump_scale=5, emission=(0.25, 0.6, 0.7), emission_strength=0.35),
    'eye': proc_material('eye', (0.1, 0.5, 0.6), None, rough=0.2, bump=0.0, emission=(0.45, 0.95, 1.0), emission_strength=1.0),
}
parts = []   # (object, mode): 'curve' | ('rigid', s) | 'head' | 'jaw'


def mesh_obj(name, verts, faces, mats, mode, smooth_shade=False):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in verts], [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    names = sorted(set(mats)) if isinstance(mats, list) else [mats]
    for n in names: me.materials.append(MATS[n])
    if isinstance(mats, list): me.polygons.foreach_set('material_index', [names.index(n) for n in mats])
    for p in me.polygons: p.use_smooth = smooth_shade
    parts.append((o, mode)); return o


def prism(name, base, axis, r, length, mat, mode, sides=6, tip=0.25, taper=0.85):
    """A crystal: a prism with a pointed tip. Returns the object."""
    ax = np.array(axis, float); ax /= np.linalg.norm(ax); e1 = np.cross(ax, [0.3, 0.2, 0.93]); e1 /= np.linalg.norm(e1); e2 = np.cross(ax, e1)
    ring = lambda h, rr: [np.array(base) + ax * h + rr * (math.cos(2 * math.pi * k / sides + 0.4) * e1 + math.sin(2 * math.pi * k / sides + 0.4) * e2) for k in range(sides)]
    v = ring(0, r) + ring(length * (1 - tip), r * taper) + [np.array(base) + ax * length]; f = []
    for k in range(sides):
        k2 = (k + 1) % sides; f.append((k, k2, sides + k2, sides + k)); f.append((sides + k, sides + k2, 2 * sides))
    return mesh_obj(name, v, f, mat, mode)


SIDES = C['sides']; NP = C['plates']
if 'src' in A:
    bpy.ops.import_scene.gltf(filepath=A['src'])
    ms = [o for o in bpy.data.objects if o.type == 'MESH']; bpy.ops.object.select_all(action='DESELECT')
    for o in ms: o.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]; bpy.ops.object.join(); boss = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    co = coords(boss); k = (PTS[:, 2].max() + 1.0) / np.ptp(co[:, 2]); co *= k; co[:, 2] -= co[:, 2].min() - C['curve']['z0']; co[:, 0] -= co[:, 0].mean(); set_coords(boss, co)
    parts.append((boss, 'curve'))
else:
    # ---- body: stacked plates. Rings per plate: the groove (seam), the lip, the middle, the top edge
    hs = rng.uniform(0.7, 1.45, NP); edges_s = np.concatenate([[0], np.cumsum(hs)]) / hs.sum() * SH; verts = []; faces = []; fm = []
    ang = np.linspace(0, 2 * np.pi, SIDES, endpoint=False)      # 0 = the front (NRM), pi = the back
    SLOT = C['slot']
    for p in range(NP):
        s0, s1 = edges_s[p], edges_s[p + 1]; ph = rng.uniform(0, 6.28); bulge = 1 + rng.uniform(-0.04, 0.07); tilt = rng.normal(0, 0.05, 2)
        for t, rf in ((0.0, 0.78), (0.08, 1.10), (0.5, 1.03), (1.0, 0.90)):
            s = s0 + (s1 - s0) * t; P, T, Nn = frame(s); R = radius(s) * rf * bulge
            wide = 1 + C['chest'][2] * chest(s)
            for a in ang:
                facet = 1 + 0.05 * math.cos(5 * a + ph) + 0.03 * math.cos(9 * a + 2 * ph) + 0.02 * math.cos(17 * a + 3 * ph)
                keel = 1 + 0.10 * math.exp(-((abs(a - math.pi)) / 0.35) ** 2)          # a ridge down the back
                belly = 1 - 0.06 * math.exp(-(min(a, 2 * math.pi - a) / 0.6) ** 2)      # a flatter front
                rr = R * facet * keel * belly if rf > 0.85 else R
                verts.append(P + rr * (math.cos(a) * Nn + wide * math.sin(a) * XAX) + (T * rr * (tilt[0] * math.cos(a) + tilt[1] * math.sin(a)) if rf > 0.85 else 0))
        base = p * 4 * SIDES
        for ring_i in range(3):
            for k in range(SIDES):
                k2 = (k + 1) % SIDES; a0 = base + ring_i * SIDES; a1 = a0 + SIDES
                s_mid = s0 + (s1 - s0) * (0.05, 0.33, 0.78)[ring_i]; a_mid = ang[k] + math.pi / SIDES; front = min(a_mid, 2 * math.pi - a_mid)
                if ring_i > 0 and SLOT[0] < s_mid < SLOT[1] and front < SLOT[2] * (1 + 0.5 * math.sin(p * 2.1)): continue     # the slot: the hollow chest
                faces.append((a0 + k, a0 + k2, a1 + k2, a1 + k))
                lit = chest(s_mid) > 0.25 and front < 2.0
                fm.append(('glow' if lit else 'seam') if ring_i == 0 else ('stone_lo' if front < 0.9 else 'stone'))
        if p < NP - 1:      # the step down from this plate's top edge to the next groove
            for k in range(SIDES):
                k2 = (k + 1) % SIDES; a0 = base + 3 * SIDES; a1 = base + 4 * SIDES
                faces.append((a0 + k, a0 + k2, a1 + k2, a1 + k)); s_mid = s1; front = min(ang[k], 2 * math.pi - ang[k])
                fm.append('glow' if chest(s_mid) > 0.25 and front < 2.0 else 'seam')
    cap = len(verts); verts.append(curve(0.0)); faces += [(cap, (k + 1) % SIDES, k) for k in range(SIDES)]; fm += ['seam'] * SIDES
    mesh_obj('body', verts, faces, fm, 'curve')
    # the hollow core seen through the slot and the seams
    verts = []; faces = []; cs = np.linspace(C['slot'][0] - 0.08, C['slot'][1] + 0.08, 14)
    for s in cs:
        P, T, Nn = frame(s); R = radius(s) * 0.62 * (1 + 0.08 * math.sin(s * 60))
        verts += [P + R * (math.cos(a) * Nn + math.sin(a) * XAX) for a in np.linspace(0, 2 * np.pi, 10, endpoint=False)]
    for i in range(len(cs) - 1):
        for k in range(10): faces.append((i * 10 + k, i * 10 + (k + 1) % 10, (i + 1) * 10 + (k + 1) % 10, (i + 1) * 10 + k))
    mesh_obj('core', verts, faces, 'core', 'curve', smooth_shade=True)
    # fins down the back, one per plate; crystals growing from some plates
    for p in range(2, NP - 1):
        s = (edges_s[p] + edges_s[p + 1]) / 2; P, T, Nn = frame(s); R = radius(s); h = R * rng.uniform(0.45, 0.8); w = (edges_s[p + 1] - edges_s[p]) * LEN * 0.85
        b0 = P - Nn * R * 1.02 - T * w / 2; b1 = P - Nn * R * 1.02 + T * w / 2; tip = P - Nn * (R + h) + T * w * 0.75; th = 0.09 * R
        v = [b0 + XAX * th, b0 - XAX * th, b1 + XAX * th, b1 - XAX * th, tip]
        mesh_obj(f'fin{p}', v, [(0, 2, 4), (3, 1, 4), (2, 3, 4), (1, 0, 4), (0, 1, 3, 2)], 'glass', ('rigid', s))
    for i in range(C['side_crystals']):
        s = rng.uniform(0.12, 0.88); a = rng.choice([-1, 1]) * rng.uniform(1.2, 2.5); P, T, Nn = frame(s); R = radius(s)
        d = math.cos(a) * Nn + math.sin(a) * XAX; base = P + d * R * 0.9
        for j in range(rng.integers(2, 4)):
            ax = d + T * rng.uniform(0.1, 0.9) + rng.normal(0, 0.25, 3)
            prism(f'cr{i}_{j}', base + rng.normal(0, 0.12, 3) * R, ax, R * rng.uniform(0.07, 0.13), R * rng.uniform(0.5, 1.1), 'glass', ('rigid', s))
    # ---- head: local (u forward, x across, n up) on the frame at the neck's end
    H0, HT, HN = frame(SH); HT = HT / np.linalg.norm(HT); HUP = -HN                      # HUP: the top of the head
    Hd = C['head']; L = Hd['length']
    to_world = lambda u, x, n: H0 + HT * u + XAX * x + HUP * n
    width = lambda u: np.interp(u / L, [0, 0.3, 0.7, 1], Hd['width']); top = lambda u: np.interp(u / L, [0, 0.25, 0.7, 1], Hd['top'])
    mouth = lambda u: -0.10 - 0.30 * (u / L)
    def loft(name, sec, us, mat, mode, closed_ends=True):
        v = []; f = []; n = len(sec(us[0]))
        for u in us: v += [to_world(u, x, nn) for x, nn in sec(u)]
        for i in range(len(us) - 1):
            for k in range(n): f.append((i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k))
        if closed_ends: f.append(tuple(range(n - 1, -1, -1))); f.append(tuple(range((len(us) - 1) * n, len(us) * n)))
        return mesh_obj(name, v, f, mat, mode)
    def upper(u):
        w = width(u); t = top(u); m = mouth(u); brow = 0.22 * math.exp(-((u / L - 0.3) / 0.12) ** 2)
        pts = [(w * math.cos(ph), m + (t - m) * math.sin(ph) ** 0.75 + brow * math.sin(ph) ** 6 * (1 if abs(math.cos(ph)) > 0.3 else 0.4)) for ph in np.linspace(0, math.pi, 11)]
        return pts + [(-w * 0.6, m + 0.12), (w * 0.6, m + 0.12)]
    loft('head_skull', upper, np.linspace(-0.5, L, 12), 'stone', 'head')
    for j, (u0, u1, g0, g1) in enumerate(((-0.7, 1.15, 1.16, 1.05), (0.75, 2.2, 1.13, 1.04), (1.9, 3.1, 1.10, 1.03))):   # overlapping armour plates
        def plate(u, u0=u0, u1=u1, g0=g0, g1=g1):
            g = g0 + (g1 - g0) * (u - u0) / (u1 - u0); pts = upper(u)[2:9]; m = mouth(u)
            return [(x * g, m + (nn - m) * g + 0.03) for x, nn in pts]
        us = np.linspace(u0, u1, 5); v = []; f = []
        for u in us: v += [to_world(u, x, nn) for x, nn in plate(u)]
        for i in range(4):
            for k in range(6): f.append((i * 7 + k, i * 7 + k + 1, (i + 1) * 7 + k + 1, (i + 1) * 7 + k))
        mesh_obj(f'head_plate{j}', v, f, 'stone_lo' if j == 1 else 'stone', 'head')
    JH = Hd['jaw_hinge'] * L
    def lower(u):
        w = width(u) * 0.93; m = mouth(u) - 0.06; d = np.interp(u / L, [0, 0.4, 1], Hd['jaw_depth'])
        pts = [(w * math.cos(ph), m - d * math.sin(ph) ** 0.8) for ph in np.linspace(0, math.pi, 9)]
        return pts + [(-w * 0.55, m - 0.1), (w * 0.55, m - 0.1)]
    loft('jaw_bone', lower, np.linspace(JH - 0.3, L * 0.97, 10), 'stone_lo', 'jaw')
    for sgn in (1, -1):
        for i, uf in enumerate(np.linspace(0.32, 0.97, 9)):       # upper teeth point down, lower teeth up
            u = uf * L; ln = 0.62 * (1 - 0.45 * uf) * (1.25 if i % 3 == 0 else 1)
            prism(f'head_tooth{sgn}{i}', to_world(u, sgn * width(u) * 0.86, mouth(u) + 0.1), -HUP + HT * 0.15 + XAX * sgn * 0.1, 0.11, ln, 'glass', 'head', sides=5, tip=0.7)
            if i % 2 == 0 and i < 8:
                u2 = u + 0.18; prism(f'jaw_tooth{sgn}{i}', to_world(u2, sgn * width(u2) * 0.80, mouth(u2) - 0.16), HUP + HT * 0.1 + XAX * sgn * 0.08, 0.10, ln * 0.85, 'glass', 'jaw', sides=5, tip=0.7)
        e = to_world(0.36 * L, sgn * width(0.36 * L) * 0.93, mouth(0.36 * L) + (top(0.36 * L) - mouth(0.36 * L)) * 0.42)
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.26); me = bpy.data.meshes.new('eye'); bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(f'head_eye{sgn}', me); bpy.context.scene.collection.objects.link(o); o.location = e; o.scale = (0.7, 1.7, 0.6); me.materials.append(MATS['eye']); parts.append((o, 'head'))
        for j in range(3):   # a fan of crystals behind the jaw hinge
            prism(f'head_cheek{sgn}{j}', to_world(0.12 * L, sgn * width(0.12 * L) * 0.95, mouth(0.12 * L) + 0.25 * j), XAX * sgn * (1.0 - 0.2 * j) - HT * 0.8 + HUP * (0.25 * j - 0.1), 0.17 - 0.03 * j, 1.5 - 0.3 * j, 'glass', 'head', sides=5, tip=0.5)
    # the crown: tall clear crystals in a fan over the back of the skull
    for i, a in enumerate(np.linspace(-1.05, 1.05, Hd['crown'])):
        u = (0.20 - 0.10 * abs(a)) * L; x = math.sin(a) * width(u) * 0.78; base = to_world(u, x, top(u) * (0.55 + 0.4 * math.cos(a)))
        ax = HUP * math.cos(a * 0.75) + XAX * math.sin(a * 0.75) - HT * (0.45 + 0.15 * abs(a))
        prism(f'head_crown{i}', base, ax, 0.38 - 0.09 * abs(a), Hd['crown_height'] * (1 - 0.38 * abs(a)) * (0.9 + 0.2 * rng.random()), 'glass', 'head', sides=6, tip=0.3, taper=0.7)
        prism(f'head_crownb{i}', base + HT * 0.25, ax + HT * 0.5 + XAX * math.sin(a) * 0.3, 0.16, Hd['crown_height'] * 0.4 * (1 - 0.3 * abs(a)), 'glass', 'head', sides=5, tip=0.4)

# ---- join (keeping each part's rule), sharp edges, UVs, bake
bpy.context.view_layer.update(); rules = []
for o, mode in parts:
    active(o); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); rules += [mode] * len(o.data.vertices)
bpy.ops.object.select_all(action='DESELECT')
for o, _ in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0][0]; bpy.ops.object.join(); boss = bpy.context.view_layer.objects.active; boss.name = 'hollow_tide'; boss.data.name = 'hollow_tide'
assert len(boss.data.vertices) == len(rules)
co = coords(boss)
if 'src' not in A:
    active(boss); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.mesh.select_mode(type='EDGE'); bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(38)); bpy.ops.mesh.mark_sharp()
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in boss.data.polygons: p.use_smooth = True
    uv_unwrap(boss, angle=60, margin=0.004)
    baked = self_bake(boss, N, ao_samples=96)
    baked['emit'] = np.clip(baked['emit'] * (0.75 + 0.5 * baked['ao'][..., None]), 0, 1)
    mat = finish_textures(ROOT, 'hollow_tide', baked, emissive=True, emissive_strength=C['emissive_strength'], double_sided=True)
    boss.data.materials.clear(); boss.data.materials.append(mat)
    for p in boss.data.polygons: p.material_index = 0
    bpy.ops.file.pack_all()

# ---- rig: root, a spine chain on the curve, head, jaw
BONES = [('root', (0, 0, 0), (0, 0, 1.0), None)]
js = np.linspace(0, SH, NB + 1); prev = 'root'
for i in range(NB): BONES.append((f'spine{i:02d}', tuple(curve(js[i])), tuple(curve(js[i + 1])), prev)); prev = f'spine{i:02d}'
H0, HT, HN = frame(SH); HT = HT / np.linalg.norm(HT); L = C['head']['length']
BONES.append(('head', tuple(H0), tuple(H0 + HT * L), prev))
jh = H0 + HT * C['head']['jaw_hinge'] * L + HN * 0.2; BONES.append(('jaw', tuple(jh), tuple(jh + HT * L * 0.75 + HN * 0.3), 'head'))
ad = bpy.data.armatures.new('boss_rig'); rig = bpy.data.objects.new('boss_rig', ad); bpy.context.scene.collection.objects.link(rig)
active(rig); bpy.ops.object.mode_set(mode='EDIT')
for name, h, t, par in BONES:
    b = ad.edit_bones.new(name); b.head = h; b.tail = t; b.roll = 0; b.use_deform = name != 'root'
    if par: b.parent = ad.edit_bones[par]; b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
groups = {n: boss.vertex_groups.new(name=n) for n, *_ in BONES if n != 'root'}
d2 = ((co[:, None, 1] - PTS[None, ::4, 1]) ** 2 + (co[:, None, 2] - PTS[None, ::4, 2]) ** 2); s_of = SS[::4][np.argmin(d2, axis=1)]
def spine_w(s):
    b = min(max(s / SH, 0), 0.9999) * NB; i = int(b); f = b - i      # inside bone i; blend to the neighbour around the joints
    if f < 0.3 and i > 0: k = 0.5 + f / 0.6; return {f'spine{i - 1:02d}': 1 - k, f'spine{i:02d}': k}
    if f > 0.7 and i < NB - 1: k = (f - 0.7) / 0.6; return {f'spine{i:02d}': 1 - k, f'spine{i + 1:02d}': k}
    if f > 0.7 and i == NB - 1: k = (f - 0.7) / 0.6; return {f'spine{i:02d}': 1 - k, 'head': k}
    return {f'spine{i:02d}': 1.0}
for vi, mode in enumerate(rules):
    w = {'head': 1.0} if mode == 'head' else {'jaw': 1.0} if mode == 'jaw' else spine_w(mode[1]) if isinstance(mode, tuple) else ({'head': 1.0} if s_of[vi] >= SH and 'src' in A else spine_w(s_of[vi]))
    for k, x in w.items(): groups[k].add([vi], x, 'REPLACE')
boss.parent = rig; md = boss.modifiers.new('rig', 'ARMATURE'); md.object = rig
st = mesh_stats(boss)
r = dict(step='b01_build', tris=tris(boss), verts=len(boss.data.vertices), bones=len(ad.bones), length_m=round(LEN, 2), bbox=[co.min(0).round(2), co.max(0).round(2)],
         zero_faces=st['zero_faces'], parts=st['parts'], status='PASS' if tris(boss) <= 50000 else 'CHECK')
save(f'{ROOT}/work/01_build.blend'); ensure(f'{ROOT}/renders')
beauty(f'{ROOT}/renders/b01', [boss], views=('q34', 'front_lo', 'side', 'behind'), res=1000, samples=48)
beauty(f'{ROOT}/renders/b01h', [boss], views=('q34', 'front_lo'), res=1000, samples=48, focus=(tuple(H0 + HT * 2.0), 5.5))
report(f'{ROOT}/report/b01.json', r)

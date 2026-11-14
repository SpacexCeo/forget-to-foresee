"""Step 01, the owner's model (14.11): the Glass Shoal boss from the Tripo ice serpent `dragon_ice.glb`, on the Hollow
Tide's own skeleton, so b02_clips.py, export_glb.py and the arena (scenes/shoal-arena.js) work on it unchanged.
  blender -b --python b01_tripo.py -- --root <boss work root> --src <dragon_ice.glb> [--height 18.5] [--tex 2048]
The Tripo rig (10 joints: one chain from the crystal base to the head) is kept only as the body's centre line. The model
is scaled to the Hollow Tide's height, faces -Y, and its crystal base sits half under the mirror. On that centre line:
root, spine00..11 (equal lengths), head (from the end of the neck to the snout) and jaw. Weights: every vertex takes the
spine blend at its nearest point of the centre line (spikes and mane ride with the body under them); the head (above
the end of the neck) is rigid on `head`, the lower jaw on `jaw`, the crystal base on `root`. Output: work/01_build.blend
(hollow_tide + boss_rig, the names b02_clips.py opens), report/b01.json, renders/b01t_*.jpg."""
import bpy, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from lib import *

A = args(); ROOT = A['root']; HT = float(A.get('height', 18.5)); TEX = int(A.get('tex', 2048))
C = json.load(open(os.path.join(HERE, 'boss.json'))); NB = C['spine_bones']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=A['src'])
arm0 = max((o for o in bpy.data.objects if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
chain = [arm0.matrix_world @ b.head_local for b in arm0.data.bones]
chain.append(arm0.matrix_world @ arm0.data.bones[-1].tail_local)
# the mesh as the skin shows it (Tripo keeps a turn in the bind matrices): apply the armature at rest before the rig goes
boss = max((o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Icosphere')), key=lambda o: len(o.data.vertices))
active(boss)
for md in list(boss.modifiers):
    if md.type == 'ARMATURE': bpy.ops.object.modifier_apply(modifier=md.name)
_mw = boss.matrix_world.copy(); boss.parent = None; boss.matrix_world = _mw
for o in list(bpy.data.objects):
    if o is not boss: bpy.data.objects.remove(o, do_unlink=True); boss.name = 'hollow_tide'; boss.data.name = 'hollow_tide'
active(boss); _mw = boss.matrix_world.copy(); boss.parent = None; boss.matrix_world = _mw   # keep where the importer put it
for md in list(boss.modifiers): boss.modifiers.remove(md)
boss.vertex_groups.clear(); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
co = coords(boss); line = np.array([tuple(v) for v in chain], float)
# the Tripo export already faces -Y (the arena's front: its 'front' render shows the face); --turn <deg> about Z
# for a model that does not
ang = math.radians(float(A.get('turn', 0))); Rz = np.array([[math.cos(ang), -math.sin(ang), 0], [math.sin(ang), math.cos(ang), 0], [0, 0, 1]])
co = co @ Rz.T; line = line @ Rz.T
k = HT / float(np.ptp(co[:, 2])); zb = float(co[:, 2].min())
co = (co - [line[0][0], line[0][1], zb]) * k; line = (line - [line[0][0], line[0][1], zb]) * k
base_h = float(A.get('base', 0.11)) * HT                    # the crystal base: its lowest part goes under the mirror
co[:, 2] -= base_h * 0.5; line[:, 2] -= base_h * 0.5
set_coords(boss, co)
for img in bpy.data.images:
    if img.size[0] > TEX: img.scale(TEX, TEX)
# the glow: the arena pulses the boss's emissive map (scenes/shoal-arena.js bossGlow). Tripo ships none, so it is made
# from the base colour: the bright cyan of the seams, the eyes and the chest emblem glows, the rest stays dark
mat = boss.data.materials[0]; nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
bc_link = bsdf.inputs['Base Color'].links[0].from_node if bsdf.inputs['Base Color'].links else None
if bc_link is not None and getattr(bc_link, 'image', None) is not None:
    src = bc_link.image; w, h = src.size; px = np.empty(w * h * 4, np.float32); src.pixels.foreach_get(px); px = px.reshape(h, w, 4)[:, :, :3]
    cyan = np.clip((px[:, :, 2] - px[:, :, 0] - 0.33) * 5, 0, 1) * np.clip((px.max(2) - 0.35) * 3, 0, 1)
    em = np.concatenate([px * cyan[..., None], np.ones((h, w, 1), np.float32)], 2)
    eimg = bpy.data.images.new('ice_boss_emissive', w, h, alpha=False); eimg.pixels.foreach_set(em.ravel()); eimg.pack()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = eimg
    uv = bc_link.inputs['Vector'].links[0].from_socket if bc_link.inputs['Vector'].links else None
    if uv is not None: nt.links.new(uv, tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = float(A.get('glow', 2.0))
    GLOW_PX = float(cyan.mean())
else: GLOW_PX = 0.0
# ---- the centre line resampled by length; the neck ends where the head starts
seg = np.linalg.norm(np.diff(line, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)]); L = cum[-1]
at = lambda s: np.array([np.interp(s * L, cum, line[:, i]) for i in range(3)])
neck_z = float(np.percentile(co[:, 2], 100 - float(A.get('head_pct', 9))))     # the head: the top of the model
s_head = float(np.interp(neck_z, line[:, 2], cum / L)) if line[-1][2] > neck_z else 0.9
js = np.linspace(0, s_head, NB + 1)
hv = co[co[:, 2] >= neck_z]; snout = hv[np.argmin(hv[:, 1])]; H0 = at(s_head)
BONES = [('root', (0, 0, 0), (0, 0, 1.0), None)]
prev = 'root'
for i in range(NB): BONES.append((f'spine{i:02d}', tuple(at(js[i])), tuple(at(js[i + 1])), prev)); prev = f'spine{i:02d}'
BONES.append(('head', tuple(H0), tuple(snout), prev))
HT_ = (snout - H0) / np.linalg.norm(snout - H0)
jh = H0 + (snout - H0) * 0.25 - np.array([0, 0, 0.25]) * np.linalg.norm(snout - H0)
BONES.append(('jaw', tuple(jh), tuple(snout - np.array([0, 0, 0.3]) * np.linalg.norm(snout - H0)), 'head'))
ad = bpy.data.armatures.new('boss_rig'); rig = bpy.data.objects.new('boss_rig', ad); bpy.context.scene.collection.objects.link(rig)
active(rig); bpy.ops.object.mode_set(mode='EDIT')
for name, h, t, par in BONES:
    b = ad.edit_bones.new(name); b.head = [float(v) for v in h]; b.tail = [float(v) for v in t]; b.roll = 0; b.use_deform = name != 'root'
    if par: b.parent = ad.edit_bones[par]; b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
# ---- weights
dense = np.array([at(s) for s in np.linspace(0, 1, 800)]); sd = np.linspace(0, 1, 800)
nearest = np.empty(len(co), np.int64)
for i0 in range(0, len(co), 4000):
    d = np.linalg.norm(co[i0:i0 + 4000, None, :] - dense[None, :, :], axis=2); nearest[i0:i0 + 4000] = d.argmin(1)
s_of = sd[nearest]
def spine_w(s):
    b = min(max(s / s_head, 0), 0.9999) * NB; i = int(b); f = b - i
    if f < 0.3 and i > 0: kk = 0.5 + f / 0.6; return {f'spine{i - 1:02d}': 1 - kk, f'spine{i:02d}': kk}
    if f > 0.7 and i < NB - 1: kk = (f - 0.7) / 0.6; return {f'spine{i:02d}': 1 - kk, f'spine{i + 1:02d}': kk}
    if f > 0.7 and i == NB - 1: kk = (f - 0.7) / 0.6; return {f'spine{i:02d}': 1 - kk, 'head': kk}
    return {f'spine{i:02d}': 1.0}
groups = {n: boss.vertex_groups.new(name=n) for n, *_ in BONES if n != 'root'}; groups['root'] = boss.vertex_groups.new(name='root')
rel = co - H0; along = rel @ HT_
Lh = float(np.linalg.norm(snout - H0)); tt = np.clip(along / Lh, 0, 1); axis_z = H0[2] + (snout[2] - H0[2]) * tt
jaw_v = (co[:, 2] >= neck_z - 0.1 * Lh) & (along > Lh * 0.15) & (co[:, 2] < axis_z - 0.06 * Lh) & (np.abs(co[:, 0] - H0[0]) < 0.6 * Lh)   # below the head's axis, in front
for vi in range(len(co)):
    if co[vi, 2] < base_h * 0.55 and s_of[vi] < 0.08: w = {'root': 1.0}                 # the crystal base stays put
    elif jaw_v[vi]: w = {'jaw': 1.0}
    elif co[vi, 2] >= neck_z or s_of[vi] >= s_head: w = {'head': 1.0}
    else: w = spine_w(s_of[vi])
    for kk, x in w.items(): groups[kk].add([vi], x, 'REPLACE')
boss.parent = rig; md = boss.modifiers.new('rig', 'ARMATURE'); md.object = rig
bpy.ops.file.pack_all()
r = dict(step='b01_tripo', src=A['src'], tris=tris(boss), verts=len(co), bones=len(ad.bones), height_m=round(float(np.ptp(co[:, 2])), 2),
         bbox=[co.min(0).round(2), co.max(0).round(2)], s_head=round(s_head, 3), head_len_m=round(float(np.linalg.norm(snout - H0)), 2),
         jaw_verts=int(jaw_v.sum()), glow_share=round(GLOW_PX, 4), status='PASS')
save(f'{ROOT}/work/01_build.blend'); ensure(f'{ROOT}/renders')
beauty(f'{ROOT}/renders/b01t', [boss], views=('q34', 'front_lo', 'side'), res=900, samples=32)
report(f'{ROOT}/report/b01.json', r)

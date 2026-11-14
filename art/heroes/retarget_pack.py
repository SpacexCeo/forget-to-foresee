"""One animation pack onto every wearable heroine: retarget, rename, index (the owner's Tripo heroes, 14.11).
  blender -b --python art/heroes/retarget_pack.py -- --pack <rigged model with the clips .glb> \
      --targets iris=<model.glb>,elise=<model.glb>,sheriffchenko=<model.glb> --out <dir> [--names art/heroes/clip_names.json] [--fps 30]
For every target it writes <out>/<id>_clips.glb (a side-car: the target's own skeleton, no mesh, every clip of the pack),
and once for all <out>/hero_clips.json: the index every hero shares (clip name, the pack's name, seconds, loop or
one-shot, the root motion taken out of the clip, the walking speed of a loop).
How (no Blender constraints, no add-on; works for any two skeletons of a human shape):
 - bones are matched by name: identical names first, then a canonical name (hips, spine, chest, neck, head, shoulder,
   upper arm, forearm, hand, thigh, shin, foot, toe; Mixamo/Tripo-style "LeftUpLeg", "mixamorig:Spine1", our
   "thigh_L"...). Bones without a match keep their rest pose (hair, skirt and ribbon chains are the game's own cloth);
 - a target bone takes the source bone's rotation since its rest pose in WORLD space, after the two rest directions
   are aligned (an A-pose pack plays right on a T-pose model and the other way round);
 - the hips move by the source's hips motion scaled by the ratio of the two hips heights; the horizontal part of it
   is taken out (the game moves the character) and written to the index (`root_motion_m`; a loop's `speed_mps`);
 - names: --names maps the pack's clip names to the game's (`idle`, `walk`, `run`, ...; play/anim-library.js and
   render/asset-catalog.js); clips not in the map keep a clean snake_case form of their own name.
Report: <out>/retarget_report.json (matched bones per target, clips, loop seam per clip)."""
import bpy, json, math, os, re, sys
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:]; A = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv), 2)}
FPS = int(A.get('fps', 30)); OUT = A['out']; os.makedirs(OUT, exist_ok=True)
NAMES = json.load(open(A['names'])) if A.get('names') else {}

# ---- canonical bone names
SIDE = {'left': 'L', 'l': 'L', 'right': 'R', 'r': 'R'}
CANON = [  # (canonical, regex on a normalised name without side)
    ('hips', r'^(hips?|pelvis|root_?hips?|bip\d*_?pelvis)$'), ('spine', r'^(spine|spine0?1?|abdomen|spine_?01)$'),
    ('chest', r'^(chest|spine0?2|spine_?02|upper_?chest|spine2)$'), ('chest2', r'^(spine0?3|spine_?03|spine3)$'),
    ('neck', r'^(neck|neck0?1)$'), ('head', r'^head$'),
    ('shoulder', r'^(shoulder|clavicle|collar)$'), ('upperarm', r'^(upper_?arm|arm|uparm)$'), ('forearm', r'^(fore_?arm|lower_?arm|elbow)$'),
    ('hand', r'^(hand|wrist)$'), ('thigh', r'^(thigh|up_?leg|upper_?leg)$'), ('shin', r'^(shin|leg|calf|lower_?leg|knee)$'),
    ('foot', r'^(foot|ankle)$'), ('toe', r'^(toe|toe_?base|toes|ball)$'),
]


def canon(name):
    n = name.split(':')[-1].split('|')[-1]
    n = re.sub(r'([a-z])([A-Z])', r'\1_\2', n).lower().replace('.', '_').replace(' ', '_')
    side = None
    m = re.match(r'^(left|right|l|r)_(.+)$', n) or re.match(r'^(left|right)(.+)$', n)
    if m: side, n = SIDE[m.group(1)], m.group(2).strip('_')
    else:
        m = re.match(r'^(.+?)_(l|r|left|right)$', n)
        if m: side, n = SIDE[m.group(2)], m.group(1)
    for c, rx in CANON:
        if re.match(rx, n): return c + ('_' + side if side else '')
    return None


def load(path):
    before = set(bpy.data.objects); acts = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = max((o for o in new if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
    for a in arm.animation_data.nla_tracks if arm.animation_data else []: a.mute = True
    # world space == armature space from here on (the importer's axis/scale fix is baked in)
    bpy.ops.object.select_all(action='DESELECT')
    for o in new: o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    try: bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    except Exception as e: print('transform_apply', e)
    return arm, new, [a for a in bpy.data.actions if a not in acts]


def match(src, tgt):
    s_names = {b.name for b in src.data.bones}; out = {}
    s_canon = {}
    for b in src.data.bones:
        c = canon(b.name)
        if c and c not in s_canon: s_canon[c] = b.name
    for b in tgt.data.bones:
        if b.name in s_names: out[b.name] = b.name
        else:
            c = canon(b.name)
            if c and c in s_canon: out[b.name] = s_canon[c]
    return out


def rest_dir(bone):
    return (bone.tail_local - bone.head_local).normalized()


def hips_of(arm):
    for b in arm.data.bones:
        if canon(b.name) == 'hips': return b.name
    return arm.data.bones[0].name


def clean(n):
    n = n.split('|')[-1]; n = re.sub(r'([a-z])([A-Z])', r'\1_\2', n).lower()
    return re.sub(r'[^a-z0-9]+', '_', n).strip('_') or 'clip'


def retarget(src, src_act, tgt, bmap, name):
    """Bake src_act onto tgt as a new action `name`. Returns (action, seconds, root_motion_m, seam_deg)."""
    sc = bpy.context.scene; src.animation_data_create(); src.animation_data.action = src_act
    try: src.animation_data.action_slot = src_act.slots[0]
    except Exception: pass
    f0, f1 = src_act.frame_range; src_fps = sc.render.fps / sc.render.fps_base
    secs = (f1 - f0) / src_fps; n = max(1, int(round(secs * FPS)))
    order = [b.name for b in tgt.data.bones if b.parent is None]
    i = 0
    while i < len(order): order += [c.name for c in tgt.data.bones[order[i]].children]; i += 1
    sh, th = hips_of(src), hips_of(tgt)
    k = tgt.data.bones[th].head_local.z / max(1e-6, src.data.bones[sh].head_local.z)      # hips height ratio
    C = {}                                                     # rest alignment: target rest dir -> source rest dir
    for t, s in bmap.items():
        C[t] = rest_dir(tgt.data.bones[t]).rotation_difference(rest_dir(src.data.bones[s])).to_matrix()
    act = bpy.data.actions.new(name); tgt.animation_data_create(); tgt.animation_data.action = act
    rest = {b.name: b.matrix_local.copy() for b in tgt.data.bones}
    for pb in tgt.pose.bones: pb.rotation_mode = 'QUATERNION'
    hip0 = None; hips_xy = []; first = last = None
    for f in range(n + 1):
        t = f / n * secs; fr = f0 + t * src_fps; sc.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
        M = {}
        for bn in order:
            b = tgt.data.bones[bn]; L = rest[bn]; par = b.parent.name if b.parent else None
            Mp = M[par] if par else Matrix.Identity(4); Lrel = (rest[par].inverted() @ L) if par else L
            if bn in bmap:
                sb = src.pose.bones[bmap[bn]]; Ws = sb.matrix.to_3x3().normalized(); Rs = sb.bone.matrix_local.to_3x3().normalized()
                Wt = Ws @ Rs.inverted() @ C[bn] @ L.to_3x3().normalized()
            else:
                Wt = (Mp @ Lrel).to_3x3().normalized()
            pos = (Mp @ Lrel).translation
            if bn == th:
                hp = src.pose.bones[sh].matrix.translation * k
                if hip0 is None: hip0 = hp.copy()
                hips_xy.append((hp.x, hp.y)); pos = Vector((L.translation.x + (hp.x - hip0.x) * 0, L.translation.y + (hp.y - hip0.y) * 0, hp.z))  # horizontal root motion out
            Mc = Matrix.Translation(pos) @ Wt.to_4x4(); M[bn] = Mc
            B = Lrel.inverted() @ Mp.inverted() @ Mc
            pb = tgt.pose.bones[bn]; pb.rotation_quaternion = B.to_quaternion()
            if bn == th: pb.location = B.translation
            pb.keyframe_insert('rotation_quaternion', frame=f + 1)
            if bn == th: pb.keyframe_insert('location', frame=f + 1)
        snap = {bn: tgt.pose.bones[bn].rotation_quaternion.copy() for bn in bmap}
        if f == 0: first = snap
        last = snap
    seam = max(math.degrees(first[b].rotation_difference(last[b]).angle) for b in first) if first else 0.0
    dx = hips_xy[-1][0] - hips_xy[0][0]; dy = hips_xy[-1][1] - hips_xy[0][1]
    tgt.animation_data.action = None
    tr = tgt.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, act); st.name = name
    return act, round(secs, 3), round(math.hypot(dx, dy), 3), round(seam, 2)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS
src, src_objs, src_acts = load(A['pack'])
if not src_acts and src.animation_data: src_acts = [s.action for t in src.animation_data.nla_tracks for s in t.strips if s.action]
print('PACK', len(src_acts), 'clips,', len(src.data.bones), 'bones')
index = {}; report = dict(step='retarget_pack', pack=A['pack'], clips=len(src_acts), targets={})
targets = dict(t.split('=', 1) for t in A['targets'].split(','))
for tid, path in targets.items():
    tgt, objs, own = load(path)
    for a in own: a.use_fake_user = False
    if tgt.animation_data:
        for tr in list(tgt.animation_data.nla_tracks): tgt.animation_data.nla_tracks.remove(tr)
    bmap = match(src, tgt)
    scale = round(tgt.data.bones[hips_of(tgt)].head_local.z / max(1e-6, src.data.bones[hips_of(src)].head_local.z), 4)
    report['targets'][tid] = dict(bones=len(tgt.data.bones), matched=len(bmap), hips_scale=scale, unmatched=[b.name for b in tgt.data.bones if b.name not in bmap][:60])
    used = set()
    for sa in src_acts:
        base = NAMES.get(sa.name.split('|')[-1]) or clean(sa.name); name = base; j = 2
        while name in used: name = f'{base}_{j}'; j += 1
        used.add(name)
        act, secs, rm, seam = retarget(src, sa, tgt, bmap, name)
        loop = seam < 3.0
        e = index.setdefault(name, dict(name=name, pack_name=sa.name.split('|')[-1], seconds=secs, loop=loop, root_motion_m=rm,
                                        speed_mps=round(rm / secs, 3) if loop and secs > 0 and rm > 0.2 else 0.0, seam_deg={}))
        e['seam_deg'][tid] = seam
    # the side-car: the skeleton and the clips, no mesh
    for o in objs:
        if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT'); tgt.select_set(True); bpy.context.view_layer.objects.active = tgt
    for pb in tgt.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    out = os.path.join(OUT, f'{tid}_clips.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS',
              export_force_sampling=True, export_anim_slide_to_zero=True, export_frame_range=False, export_def_bones=False, export_skins=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
    report['targets'][tid]['file'] = out; report['targets'][tid]['bytes'] = os.path.getsize(out)
    for o in [o for o in bpy.data.objects if o in objs or o is tgt]:
        try: bpy.data.objects.remove(o, do_unlink=True)
        except ReferenceError: pass
    print('TARGET', tid, json.dumps(report['targets'][tid])[:400])
json.dump(dict(fps=FPS, hips_scale={k: v['hips_scale'] for k, v in report['targets'].items()},
               _='speed_mps and root_motion_m are the pack's; a hero moves them times her hips_scale (her stride is that much longer)',
               clips=sorted(index.values(), key=lambda e: e['name'])), open(os.path.join(OUT, 'hero_clips.json'), 'w'), indent=1)
json.dump(report, open(os.path.join(OUT, 'retarget_report.json'), 'w'), indent=1)
print('REPORT', json.dumps(dict(clips=len(index), targets={k: (v['matched'], v['bones']) for k, v in report['targets'].items()})))

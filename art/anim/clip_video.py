"""A 5-second review video of one clip on one character (the owner's workflow: one clip, one good angle).
  blender -b --python art/anim/clip_video.py -- --model <model_with_clips.glb> --clip walk --out <file.mp4>
      [--speed 1.7] [--seconds 5] [--view 0.75,-1,0.32] [--dist 4.6] [--fps 30] [--samples 32]
--clip may be a sequence, e.g. spawn,walk,walk,bite,idle,death: the clips play one after another (the last pose
holds) and the character travels at --speed only during the ones named walk or run.
The model is one plain .glb with its clips as actions: art/tools/glb_with_clips.mjs makes it from a shipped model
and its side-car clip file (bound by bone name, as the game does). A locomotion
clip is in place, so the character is carried forward at `--speed` (default: the clip's own `speed` extra) over a
1 m checker floor: a foot that slides shows against the squares. The camera travels with the character.
Prints REPORT with the planted-foot drift measured on the same frames (a planted foot = the lower toe bone, when it
is within 3 cm of its lowest height). EEVEE, 1280x720, H.264."""
import bpy, json, math, os, sys
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]; A = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv), 2)}
FPS = int(A.get('fps', 30)); SEC = float(A.get('seconds', 5)); N = int(round(FPS * SEC))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=A['model'])
rig = max((o for o in bpy.data.objects if o.type == 'ARMATURE'), key=lambda o: len(o.data.bones))
for o in bpy.data.objects:                             # helpers that ship in the file but are never drawn in the game
    if o.type == 'MESH' and (o.name.endswith('_col') or o.name.startswith('Icosphere') or o.find_armature() is not rig and o.parent is not rig): o.hide_render = True
acts = {a.name.split('|')[-1]: a for a in bpy.data.actions}
SEQ = A['clip'].split(',')
sc = bpy.context.scene; SRC_FPS = sc.render.fps / sc.render.fps_base      # the importer keyed the clips at this rate
sc.render.fps = FPS; sc.frame_start = 1; sc.frame_end = N
sc.render.frame_map_old = int(round(SRC_FPS)); sc.render.frame_map_new = FPS   # same seconds at the video's frame rate
K = SRC_FPS / FPS                                                          # a video frame in source frames
rig.animation_data_create()
for pb in rig.pose.bones:                              # bones a clip does not key rest (the importer leaves the last clip's pose)
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
for tr in rig.animation_data.nla_tracks: tr.mute = True
speed = float(A['speed']) if 'speed' in A else float(acts[SEQ[0]].get('speed', 0.0) or 0.0)
fwd = Vector((0, -1, 0))                               # the way the character faces (glTF +Z = Blender -Y)
mover = bpy.data.objects.new('mover', None); sc.collection.objects.link(mover); rig.parent = mover
LIFT = Vector((0, 0, float(A.get('lift', 0))))          # a flyer is shown this high over the floor (the game lifts it too)
if len(SEQ) == 1:                                      # one clip, looped over the whole video
    act = acts[SEQ[0]]; rig.animation_data.use_nla = False; rig.animation_data.action = act
    if hasattr(rig.animation_data, 'action_slot') and getattr(act, 'slots', None): rig.animation_data.action_slot = act.slots[0]
    LEN = max(1.0, act.frame_range[1] - act.frame_range[0])
    try: curves = list(act.fcurves) or [fc for layer in act.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
    except Exception: curves = [fc for layer in act.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
    for fc in curves: m = fc.modifiers.new('CYCLES'); m.mode_before = m.mode_after = 'REPEAT'
    mover.location = LIFT; mover.keyframe_insert('location', frame=1 * K)
    mover.location = LIFT + fwd * speed * (N - 1) / FPS; mover.keyframe_insert('location', frame=N * K)
    travel = speed * SEC
else:                                                  # a sequence on one NLA track; travel only while walking or running
    rig.animation_data.action = None; rig.animation_data.use_nla = True
    at = 1.0 * K; pos = LIFT.copy(); LEN = 0.0    # one track per clip: exact (fractional) starts never collide
    mover.location = pos; mover.keyframe_insert('location', frame=at)
    for _i, name in enumerate(SEQ):
        _last = _i == len(SEQ) - 1; act = acts[name]; ln = act.frame_range[1] - act.frame_range[0]
        tr = rig.animation_data.nla_tracks.new(); tr.name = f'review_{len(rig.animation_data.nla_tracks)}'
        st = tr.strips.new(name, int(math.floor(at)), act); st.frame_start = at; st.frame_end = at + ln; st.blend_in = 0; st.blend_out = 0
        st.extrapolation = 'HOLD_FORWARD' if _last else 'NOTHING'      # the last pose holds to the end of the video
        at += ln; LEN += ln
        if name in ('walk', 'run'): pos = pos + fwd * speed * (ln / SRC_FPS)
        mover.location = pos; mover.keyframe_insert('location', frame=at)
    travel = (pos - LIFT).length
for fc in mover.animation_data.action.fcurves if hasattr(mover.animation_data.action, 'fcurves') else []:
    for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'

# ---- the stage: a 1 m checker floor, sun, soft sky
bpy.ops.mesh.primitive_plane_add(size=120, location=(0, -travel / 2, 0)); floor = bpy.context.active_object
m = bpy.data.materials.new('floor'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
ch = nt.nodes.new('ShaderNodeTexChecker'); ch.inputs['Scale'].default_value = 120; ch.inputs['Color1'].default_value = (0.36, 0.38, 0.40, 1); ch.inputs['Color2'].default_value = (0.26, 0.28, 0.30, 1)
nt.links.new(ch.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.85; floor.data.materials.append(m)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun); sun.data.energy = 3.2; sun.data.angle = 0.2; sun.rotation_euler = (math.radians(52), 0, math.radians(-38))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.62, 0.70, 0.80, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
# ---- the camera rides with the character
bpy.context.view_layer.update()
pts = []
for o in bpy.data.objects:
    if o.type == 'MESH' and not o.hide_render and o is not floor: pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
top = max(p.z for p in pts); mid = top * 0.52
vd = Vector([float(x) for x in A.get('view', '0.75,-1,0.32').split(',')]).normalized(); dist = float(A.get('dist', top * 2.7))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.parent = mover
cam.location = Vector((0, 0, mid)) + vd * dist; cam.rotation_euler = (-vd).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 50
# ---- render settings
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1280, 720; sc.render.resolution_percentage = 100
try: sc.eevee.taa_render_samples = int(A.get('samples', 32)); sc.eevee.use_shadows = True
except Exception as e: print('eevee', e)
sc.view_settings.view_transform = 'Filmic' if 'Filmic' in [v.name for v in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items] else sc.view_settings.view_transform
sc.render.image_settings.file_format = 'FFMPEG'; sc.render.ffmpeg.format = 'MPEG4'; sc.render.ffmpeg.codec = 'H264'; sc.render.ffmpeg.constant_rate_factor = 'HIGH'; sc.render.ffmpeg.gopsize = FPS
sc.render.filepath = A['out']

# ---- numbers: how far a planted foot drifts over the floor. The BALL of the foot (the toe bone's head) is the point
# that stays put from foot-flat to toe-off; the heel pivots at the strike and the toe tip rolls, so neither is used.
toes = [bn for bn in ('toe_L', 'toe_R') if bn in rig.pose.bones] or [b.name for b in rig.pose.bones if 'toe' in b.name.lower()][:2]
track = {t: [] for t in toes}; hips = []
for f in range(1, N + 1):
    sc.frame_set(f)
    for t in toes: track[t].append(np.array(rig.matrix_world @ rig.pose.bones[t].head))
    hb = rig.pose.bones.get('pelvis') or rig.pose.bones[0]; hips.append(float((rig.matrix_world @ hb.head).z))
rep = dict(step='clip_video', clip=A['clip'], frames=N, clip_frames=round(LEN, 1), speed_mps=round(speed, 3), hips_bob_m=round(float(np.ptp(hips)), 4), feet={})
for t in toes:
    P = np.array(track[t]); low = P[:, 2].min(); on = P[:, 2] < low + 0.012; worst = 0.0; runs = 0; i = 0; longest = 0
    while i < N:
        if on[i]:
            j = i
            while j + 1 < N and on[j + 1]: j += 1
            if j - i >= 3: worst = max(worst, float(np.linalg.norm(P[i:j + 1, :2] - P[i, :2], axis=1).max())); runs += 1; longest = max(longest, j - i + 1)
            i = j + 1
        else: i += 1
    rep['feet'][t] = dict(ball_lowest_m=round(float(low), 4), planted_runs=runs, longest_run_frames=longest, worst_drift_m=round(worst, 4))
print('REPORT', json.dumps(rep))
if str(A.get('render', '1')) == '0': sys.exit(0)
bpy.ops.render.render(animation=True)
print('REPORT', json.dumps(dict(step='clip_video', out=A['out'], status='PASS')))

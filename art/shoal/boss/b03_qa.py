"""Step 03 (hollow_tide): lit QA stills of the clips for the owner's review (Cycles on the GPU).
  blender -b --python b03_qa.py -- --root <boss work root>
Output: renders/qa_*.jpg (idle from the player's side, the head, the slam on the mirror, lunge, sweep, death)."""
import bpy, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from lib import *

A = args(); ROOT = A['root']
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/02_clips.blend')
rig = bpy.data.objects['boss_rig']; mesh = bpy.data.objects['hollow_tide']
# the mirror: a dark wet plane, so the base reads as rising out of it
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0)); floor = bpy.context.active_object
m = bpy.data.materials.new('mirror'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.03, 0.05, 0.07, 1); b.inputs['Roughness'].default_value = 0.08; b.inputs['Metallic'].default_value = 0.6; floor.data.materials.append(m)
VIEW_DIRS['player'] = (0.35, -0.9, 0.16); VIEW_DIRS['player_r'] = (-0.5, -0.85, 0.2); VIEW_DIRS['high'] = (0.5, -0.6, 0.6)
SHOTS = [('idle', 20, 'player', ((0, -1, 7), 12)), ('idle', 60, 'front_lo', ((0, -5.5, 11.5), 4.6)), ('rise', 50, 'player_r', ((0, -1, 7), 12)),
         ('slam', 39, 'player_r', ((0, -4, 5), 12)), ('lunge', 38, 'high', ((0, -12, 4), 16)), ('sweep', 40, 'high', ((0, 0, 4), 15)),
         ('death', 60, 'player', ((0, -4, 4), 12)), ('idle', 90, 'behind', ((0, 0, 7), 12))]
for i, (clip, frame, view, focus) in enumerate(SHOTS):
    rig.animation_data.nla_tracks[clip].is_solo = True   # solo one track (setting False on the others would end solo mode)
    bpy.context.scene.frame_set(frame); beauty(f'{ROOT}/renders/qa_{i}_{clip}', [mesh], views=(view,), res=1000, samples=48, focus=focus)
print('REPORT', json.dumps(dict(step='b03_qa', shots=len(SHOTS), status='PASS')))

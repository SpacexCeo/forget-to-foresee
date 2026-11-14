"""Step 10 (shoal_dragon): lit QA stills of the clips for the owner's review (Cycles on the GPU).
  blender -b --python s10_qa.py -- --root <work root>
Output: renders/qa_*.jpg (glide from behind and above = the ride camera, flap from below, bank, perched idle, face)."""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import *

A = args(); ROOT = A['root']
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/08_clips.blend')
rig = bpy.data.objects['dragon_rig']; mesh = bpy.data.objects['dragon']
def pose(clip, frame):
    for t in rig.animation_data.nla_tracks: t.is_solo = t.name == clip
    bpy.context.scene.frame_set(frame)
SHOTS = [('glide', 20, 'behind', None), ('flap', 8, 'below', None), ('flap', 26, 'q34', None), ('bank_l', 30, 'front_hi', None), ('idle', 10, 'q34', None),
         ('idle', 10, 'q34', ((0, -3.2, 4.3), 1.7)), ('land', 30, 'side', None), ('glide', 40, 'top', None)]
VIEW_DIRS['front_hi'] = (0.25, -0.85, 0.35)
for i, (clip, frame, view, focus) in enumerate(SHOTS):
    pose(clip, frame); beauty(f'{ROOT}/renders/qa_{i}_{clip}', [mesh], views=(view,), res=1000, samples=40, focus=focus)
print('REPORT', json.dumps(dict(step='s10_qa', shots=len(SHOTS), status='PASS')))

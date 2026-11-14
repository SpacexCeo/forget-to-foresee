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
    rig.animation_data.nla_tracks[clip].is_solo = True   # solo one track (setting False on the others would end solo mode)
    bpy.context.scene.frame_set(frame)
SHOTS = [('glide', 20, 'behind', None), ('flap', 8, 'below', None), ('flap', 26, 'q34', None), ('bank_l', 30, 'front_hi', None), ('idle', 10, 'q34', None),
         ('idle', 10, 'q34', ((0, -3.2, 4.3), 1.7)), ('land', 30, 'side', None), ('glide', 40, 'top', None)]
VIEW_DIRS['front_hi'] = (0.25, -0.85, 0.35)
for i, (clip, frame, view, focus) in enumerate(SHOTS):
    pose(clip, frame); beauty(f'{ROOT}/renders/qa_{i}_{clip}', [mesh], views=(view,), res=1000, samples=40, focus=focus)
# turntable stills for the QA pack: spread wings (glide) from four sides, above and below; perched (idle) from four sides
VIEW_DIRS.update(tt_front=(0, -1, 0.12), tt_left=(1, 0, 0.12), tt_back=(0, 1, 0.12), tt_right=(-1, 0, 0.12), tt_top=(0, -0.05, 1), tt_below=(0, 0.05, -1))
pose('glide', 1); beauty(f'{ROOT}/renders/tt_glide', [mesh], views=('tt_front', 'tt_left', 'tt_back', 'tt_right', 'tt_top', 'tt_below'), res=800, samples=32)
pose('idle', 1); beauty(f'{ROOT}/renders/tt_idle', [mesh], views=('tt_front', 'tt_left', 'tt_back', 'tt_right'), res=800, samples=32)
print('REPORT', json.dumps(dict(step='s10_qa', shots=len(SHOTS), status='PASS')))

"""Step 03 (shoal_dragon): the numbers joints and wing roots are read from (TZ step 10: joints on a grid).
  blender -b --python s03_measure.py -- --root <work root>
Prints/saves midline, neck and leg profiles of body_hi and renders side/top/front views with a 0.5 m grid."""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import *

A = args(); ROOT = A['root']
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/02_reshape.blend')
body = bpy.data.objects['body_hi']; co = coords(body)
def prof(mask, axis, step, lo=None, hi=None):
    p = co[mask]; out = []
    lo = p[:, axis].min() if lo is None else lo; hi = p[:, axis].max() if hi is None else hi
    for c in np.arange(lo + step / 2, hi, step):
        q = p[np.abs(p[:, axis] - c) < step / 2]
        if len(q) < 3: continue
        out.append([round(float(c), 2), len(q)] + [round(float(v), 2) for v in (q[:, 0].min(), q[:, 0].max(), q[:, 1].min(), q[:, 1].max(), q[:, 2].min(), q[:, 2].max())])
    return out
r = dict(step='s03_measure', cols='at n xmin xmax ymin ymax zmin zmax',
         midline_y=prof(np.abs(co[:, 0]) < 0.12, 1, 0.2),
         neck_z=prof((co[:, 1] < -2.0) & (co[:, 2] > 2.6), 2, 0.2),
         foreleg_z=prof((co[:, 1] < -2.3) & (co[:, 0] > 0.1) & (co[:, 2] < 2.6), 2, 0.2),
         hindleg_z=prof((co[:, 1] > -1.3) & (co[:, 1] < 0.6) & (co[:, 0] > 0.1) & (co[:, 2] < 2.6), 2, 0.2),
         torso_y=prof((co[:, 1] > -3.0) & (co[:, 1] < 0.4) & (co[:, 2] > 1.3), 1, 0.2), status='PASS')
for k in ('midline_y', 'neck_z', 'foreleg_z', 'hindleg_z', 'torso_y'):
    print('##', k)
    for row in r[k]: print(' ', row)
metas = grid_views(f'{ROOT}/renders/s03', [body], views=('side', 'top', 'front'), res=1536)
r['views'] = metas
report(f'{ROOT}/report/s03.json', r)

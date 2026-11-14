"""Step 02 (shoal_dragon): reproportion the cleaned body into the great mount (numbers in dragon.json: `reshape`).
  blender -b --python s02_reshape.py -- --root <work root>
Smooth, continuous deformations only (no cuts): the torso between the leg pairs and the tail get longer (room for
the wing roots, the saddle and a rider), the neck gets longer, the head smaller (a grown animal, not a pet).
A replacement source with good proportions sets every factor to 1 in dragon.json and this step becomes a copy."""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import *

A = args(); ROOT = A['root']
C = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dragon.json')))['reshape']
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/01_clean.blend')
body = bpy.data.objects['body_src']; co = coords(body); src = co.copy()

# 1. stretch along Y: y' = integral of a smooth factor, the hind feet (y = 0) stay where they are
ys = np.linspace(src[:, 1].min() - 0.5, src[:, 1].max() + 0.5, 4000)
t0, t1, tf, edge = C['torso'][0], C['torso'][1], C['torso_factor'], C['edge']
fac = 1 + (tf - 1) * smooth(t0 - edge, t0 + edge, ys) * (1 - smooth(t1 - edge, t1 + edge, ys))
fac += (C['tail_factor'] - 1) * smooth(C['tail_from'] - edge, C['tail_from'] + edge, ys)
ymap = np.concatenate([[0], np.cumsum((fac[1:] + fac[:-1]) / 2 * np.diff(ys))]); ymap -= np.interp(0.0, ys, ymap)
co[:, 1] = np.interp(src[:, 1], ys, ymap)

# 2. neck longer: lift everything above the neck base, only in front of the shoulders
n0, n1 = C['neck_z']; ny0, ny1 = C['neck_front_of']
wy = 1 - smooth(ny0, ny1, src[:, 1])
lift = (C['neck_factor'] - 1) * (n1 - n0) * smooth(n0, n1, src[:, 2]) * wy
co[:, 2] += lift

# 3. head smaller: a scale about the top of the neck that fades in over the neck top
h0, h1 = C['head_z']; P = np.array(C['head_pivot'], float); P[1] = np.interp(P[1], ys, ymap); P[2] += (C['neck_factor'] - 1) * (n1 - n0)
w = (smooth(h0, h1, src[:, 2]) * wy)[:, None]
co = co * (1 - w) + (P + (co - P) * C['head_scale']) * w

co[:, 2] -= co[:, 2].min()
set_coords(body, co); body.name = 'body_hi'; body.data.name = 'body_hi'
r = dict(step='s02_reshape', config=C, bbox=[co.min(0).round(3), co.max(0).round(3)], length=round(float(np.ptp(co[:, 1])), 3),
         height=round(float(co[:, 2].max()), 3), slices_y=slices(co, 1, 0.25),
         max_edge_stretch=None, status='PASS')
# the worst edge stretch against the source: a number for "no tearing"
ed = np.empty(len(body.data.edges) * 2, np.int32); body.data.edges.foreach_get('vertices', ed); ed = ed.reshape(-1, 2)
l0 = np.linalg.norm(src[ed[:, 0]] - src[ed[:, 1]], axis=1); l1 = np.linalg.norm(co[ed[:, 0]] - co[ed[:, 1]], axis=1)
ratio = l1[l0 > 1e-6] / l0[l0 > 1e-6]; r['max_edge_stretch'] = round(float(ratio.max()), 3); r['min_edge_stretch'] = round(float(ratio.min()), 3)
save(f'{ROOT}/work/02_reshape.blend')
ortho_views(f'{ROOT}/renders/s02', [body])
report(f'{ROOT}/report/s02.json', r)

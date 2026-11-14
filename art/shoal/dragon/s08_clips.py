"""Step 08 (shoal_dragon): the clips, written in code on the rest pose of 07_rig.blend (TZ steps 13-14).
  blender -b --python s08_clips.py -- --root <work root>
Clips (30 fps, first frame 1): glide, flap, bank_l, bank_r (loops), land (flare, touch down at 1.3 s, fold), idle
(perched loop), takeoff (unfold and the first strokes). No root translation along the path: the game moves the
dragon; clips only pose it. Angles are written about the armature axes (X left, -Y forward, Z up) of the rest pose
and mirrored for the right side, so bone rolls do not matter.
Output: work/08_clips.blend (one NLA track per clip), report/s08.json (loop closure, lowest vertex, edge stretch per
clip), renders/s08_<clip>.jpg frame sheets."""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import *
from mathutils import Quaternion

A = args(); ROOT = A['root']; FPS = 30
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/07_rig.blend')
rig = bpy.data.objects['dragon_rig']; mesh = bpy.data.objects['dragon']
bpy.context.scene.render.fps = FPS
sin, cos, pi = math.sin, math.cos, math.pi
sm = lambda a, b, x: float(smooth(a, b, x))


def q(x=0, y=0, z=0):
    return Quaternion((0, 0, 1), math.radians(z)) @ Quaternion((0, 1, 0), math.radians(y)) @ Quaternion((1, 0, 0), math.radians(x))


def mirror(Q): return Quaternion((Q.w, Q.x, -Q.y, -Q.z))


class Pose(dict):
    """bone -> rotation about the armature axes. `both` writes the left bone and the mirrored right one."""
    def both(self, name, Q): self[name + '.L'] = Q; self[name + '.R'] = mirror(Q); return self
    def left(self, name, Q): self[name + '.L'] = Q; return self
    def right(self, name, Q): self[name + '.R'] = mirror(Q); return self   # Q given as for the left side


def blend(a, b, k):
    out = Pose()
    for n in set(a) | set(b): out[n] = a.get(n, Quaternion()).slerp(b.get(n, Quaternion()), k)
    return out


FINGERS = ('wing_f1', 'wing_f2', 'wing_f3', 'wing_f4')
TAIL_FLY = (30, 4, -2, -7, -13, -8, -12)


def wings_folded(p, k=1.0):
    p.both('wing_arm', q(y=-18 * k, z=64 * k)); p.both('wing_fore', q(z=-112 * k))
    for f, a in zip(FINGERS, (104, 88, 70, 52)): p.both(f + 'a', q(z=a * k)); p.both(f + 'b', q(z=8 * k))
    return p


def legs_tucked(p, k=1.0):
    p.both('leg_h_upper', q(x=75 * k)); p.both('leg_h_lower', q(x=-30 * k)); p.both('leg_h_foot', q(x=55 * k)); p.both('leg_h_paw', q(x=20 * k))
    p.both('leg_f_upper', q(x=50 * k)); p.both('leg_f_lower', q(x=-125 * k)); p.both('leg_f_paw', q(x=70 * k)); return p


def fly_body(p, k=1.0):
    for n, a in (('neck1', 22), ('neck2', 16), ('neck3', 8), ('head', -40)): p[n] = q(x=a * k)
    for i, a in enumerate(TAIL_FLY): p[f'tail{i + 1}'] = q(x=a * k)
    return legs_tucked(p, k)


def add(p, name, Q): p[name] = Q @ p.get(name, Quaternion()); return p


def tail_wave(p, ph, ax=3.0, az=3.0):
    for i in range(7):
        k = 0.5 + 0.12 * i; add(p, f'tail{i + 1}', q(x=ax * k * sin(ph - 0.6 * i), z=az * k * sin(ph - 0.7 * i + 1.0)))
    return p


def wing_stroke(p, ph, amp=1.0, base=4.0, side=None):
    """One wing beat: the arm leads, the forearm and the fingers follow (the tip whips)."""
    put = p.both if side is None else (p.left if side == 'L' else p.right)
    put('wing_arm', q(y=-(base + 30 * amp * sin(ph)), z=6 * amp * cos(ph))); put('wing_fore', q(y=-20 * amp * sin(ph - 0.7), z=-9 * amp * max(0.0, cos(ph - 0.3))))
    for j, f in enumerate(FINGERS): put(f + 'a', q(y=-10 * amp * sin(ph - 1.1 - 0.1 * j))); put(f + 'b', q(y=-14 * amp * sin(ph - 1.5 - 0.1 * j)))
    return p


def glide(t, lean=0.0):
    ph = 2 * pi * t; p = fly_body(Pose())
    p.both('wing_arm', q(y=-(7 + 3 * sin(ph)))); p.both('wing_fore', q(y=-2.5 * sin(ph - 0.8)))
    for f in FINGERS: p.both(f + 'b', q(y=-3 * sin(ph - 1.5)))
    add(p, 'neck1', q(z=1.5 * sin(ph))); add(p, 'chest', q(x=0.8 * sin(ph)))
    p.loc = (0, 0, 0.05 * sin(ph)); return tail_wave(p, ph, 1.5, 3.0)


def flap(t):
    ph = 2 * pi * t; p = wing_stroke(fly_body(Pose()), ph)
    add(p, 'chest', q(x=2.0 * sin(ph - 0.3))); add(p, 'neck1', q(x=-2.5 * sin(ph - 0.3))); add(p, 'head', q(x=1.5 * sin(ph - 0.9)))
    for s_ in ('.L', '.R'): add(p, 'leg_h_upper' + s_, q(x=3 * sin(ph - 1.0)))
    p.loc = (0, 0, -0.14 * sin(ph - 0.6)); return tail_wave(p, ph, 5.0, 1.5)


def bank(t, d):
    """d = +1: a left turn (the left wing is the inner one), -1: right. The game rolls the whole dragon; the clip adds
    the look into the turn, the dipped inner wing and the tail as a rudder."""
    ph = 2 * pi * t; p = fly_body(Pose()); w = 1 + 0.12 * sin(ph)
    inner, outer = (p.left, p.right) if d > 0 else (p.right, p.left)
    inner('wing_arm', q(y=9 * w, z=10)); inner('wing_fore', q(y=5 * w, z=-8)); outer('wing_arm', q(y=-15 * w, z=-3)); outer('wing_fore', q(y=-6 * w))
    for f in FINGERS: inner(f + 'b', q(y=4 * w)); outer(f + 'b', q(y=-5 * w))
    for n, a in (('neck1', 5), ('neck2', 6), ('neck3', 6), ('head', 9)): add(p, n, q(z=a * d * w))
    add(p, 'head', q(y=-8 * d)); add(p, 'chest', q(z=2 * d))
    for i in range(5): add(p, f'tail{i + 1}', q(z=-5 * d * w))
    p.loc = (0, 0, 0.04 * sin(ph)); return tail_wave(p, ph, 1.5, 1.5)


def idle(t):
    ph = 2 * pi * t; p = wings_folded(Pose())
    p['chest_top'] = q(x=1.2 * sin(ph)); p['neck1'] = q(x=-1.2 * sin(ph)); p['neck3'] = q(z=6 * sin(ph)); p['head'] = q(x=2.5 * sin(2 * ph), z=5 * sin(ph - 0.4))
    add(p, 'wing_arm.L', q(y=1.5 * sin(ph))); add(p, 'wing_arm.R', mirror(q(y=1.5 * sin(ph))))
    for i in range(7): p[f'tail{i + 1}'] = q(z=(2 + 0.9 * i) * sin(ph - 0.5 * i))
    p.loc = (0, 0, 0); return p


def land(t):
    """2.4 s: braking strokes with the body pitched up and the legs reaching (touch down at 1.3 s = 0.54), then settle and fold."""
    T = t * 2.4; down = sm(0.9, 1.3, T); fold = sm(1.35, 2.3, T); legs = sm(0.2, 1.15, T)
    air = fly_body(Pose(), 1 - legs); ph = 2 * pi * T / 0.65
    wing_stroke(air, ph, amp=1.15 * (1 - sm(1.2, 1.6, T)), base=14)
    for s_ in ('.L', '.R'): add(air, 'wing_arm' + s_, (q(z=-14 * (1 - down)) if s_ == '.L' else mirror(q(z=-14 * (1 - down)))))
    pitch = -24 * sm(0.0, 0.5, T) * (1 - sm(1.0, 1.7, T))
    add(air, 'hips', q(x=pitch)); add(air, 'neck1', q(x=-pitch * 0.5)); add(air, 'head', q(x=-pitch * 0.3))
    for s_ in ('.L', '.R'): add(air, 'leg_h_upper' + s_, q(x=-pitch * 0.9 * (1 - down))); add(air, 'leg_f_upper' + s_, q(x=-25 * legs * (1 - down)))
    p = blend(air, idle(0), fold); p.loc = (0, 0, 0); return p


def takeoff(t):
    """1.3 s: the wings open, the body pitches up, two strong strokes, the legs tuck; ends in flap(0)."""
    T = t * 1.3; opening = sm(0.0, 0.45, T); tuck = sm(0.3, 1.2, T); k = sm(1.05, 1.3, T)
    p = fly_body(Pose(), tuck)
    stroke = wing_stroke(Pose(), 2 * pi * (T - 1.3) / 0.65, amp=1.2 - 0.2 * k, base=10 - 6 * sm(0.9, 1.3, T))
    p.update(blend(wings_folded(Pose()), stroke, opening))
    add(p, 'hips', q(x=-16 * sm(0.1, 0.5, T) * (1 - sm(0.8, 1.3, T))))
    end = flap(0); p = blend(p, end, k); p.loc = tuple(v * k for v in end.loc); return p


CLIPS = [('glide', glide, 3.0, True), ('flap', flap, 1.2, True), ('bank_l', lambda t: bank(t, 1), 2.4, True), ('bank_r', lambda t: bank(t, -1), 2.4, True),
         ('land', land, 2.4, False), ('idle', idle, 4.0, True), ('takeoff', takeoff, 1.3, False)]

REST = {pb.name: pb.bone.matrix_local.to_3x3().to_quaternion() for pb in rig.pose.bones}
ANIMATED = [pb.name for pb in rig.pose.bones if pb.name != 'saddle']
for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'
rig.animation_data_create()


def apply(p):
    for n in ANIMATED:
        pb = rig.pose.bones[n]; Q = p.get(n)
        pb.rotation_quaternion = (REST[n].inverted() @ Q @ REST[n]) if Q is not None else Quaternion()
    rig.pose.bones['root'].location = rig.pose.bones['root'].bone.matrix_local.to_3x3().inverted() @ Vector(getattr(p, 'loc', (0, 0, 0)))


def deformed():
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); ev = mesh.evaluated_get(dg); me = ev.to_mesh()
    a = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', a); ev.to_mesh_clear(); return a.reshape(-1, 3).astype(np.float64)


co0 = coords(mesh); ed = np.empty(len(mesh.data.edges) * 2, np.int32); mesh.data.edges.foreach_get('vertices', ed); ed = ed.reshape(-1, 2)
rest_len = np.linalg.norm(co0[ed[:, 0]] - co0[ed[:, 1]], axis=1); long_edges = rest_len > 0.01
checks = {}; ensure(f'{ROOT}/renders')
for name, fn, dur, loop in CLIPS:
    n = int(round(dur * FPS)); act = bpy.data.actions.new(name); rig.animation_data.action = act
    last = {}; lows = []; worst = 0.0; first = None; shots = []
    for f in range(n + 1):
        t = (f / n) % 1.0 if loop else f / n
        p = fn(t if (loop or f < n) else 1.0); apply(p)
        for bn in ANIMATED:
            pb = rig.pose.bones[bn]; Q = pb.rotation_quaternion.copy()
            if bn in last and last[bn].dot(Q) < 0: Q.negate(); pb.rotation_quaternion = Q
            last[bn] = Q; pb.keyframe_insert('rotation_quaternion', frame=f + 1)
        rig.pose.bones['root'].keyframe_insert('location', frame=f + 1)
        if f % 3 == 0 or f == n:
            d = deformed(); lows.append(float(d[:, 2].min()))
            ratio = np.linalg.norm(d[ed[:, 0]] - d[ed[:, 1]], axis=1)[long_edges] / rest_len[long_edges]; worst = max(worst, float(np.quantile(ratio, 0.999)))
            if f == 0: first = d
            if f == n: closure = float(np.abs(d - first).max())
    for fc in (act.fcurves if hasattr(act, 'fcurves') else []):
        for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    checks[name] = dict(frames=n, seconds=dur, loop=loop, loop_closure_m=round(closure, 5) if loop else None, lowest_z=round(min(lows), 3), end_lowest_z=round(lows[-1], 3),
                        stretch_p999=round(worst, 2))
    tr = rig.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, act); st.name = name
    rig.animation_data.action = None
# frame sheets
workbench(520, True); rig.animation_data.use_nla = False
BOX = [[-7.6, -5.2, -1.5], [7.6, 5.0, 6.5]]
for name, fn, dur, loop in CLIPS:
    files = []
    for k in range(6):
        apply(fn(k / 6 if loop else k / 5)); bpy.context.view_layer.update()
        files += ortho_views(f'{ROOT}/renders/s08_{name}_{k}', [mesh], views=('q34',) if k % 2 == 0 else ('side',), res=520, box=BOX, pad=0.62)
    checks[name]['sheet'] = files
apply(Pose()); rig.animation_data.use_nla = True
bad = [n for n, c in checks.items() if (c['loop'] and c['loop_closure_m'] > 1e-3) or (n in ('idle',) and c['lowest_z'] < -0.03) or (n == 'land' and c['end_lowest_z'] < -0.03)]
r = dict(step='s08_clips', fps=FPS, clips={k: {a: b for a, b in v.items() if a != 'sheet'} for k, v in checks.items()}, failed=bad, status='PASS' if not bad else 'CHECK',
         tracks=[t.name for t in rig.animation_data.nla_tracks])
save(f'{ROOT}/work/08_clips.blend')
report(f'{ROOT}/report/s08.json', r); print('REPORT2', json.dumps(r['clips']))

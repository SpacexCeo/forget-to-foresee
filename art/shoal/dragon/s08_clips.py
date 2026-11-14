"""Step 08 (shoal_dragon): the clips, written in code on the rest pose of 07_rig.blend (TZ steps 13-14).
  blender -b --python s08_clips.py -- --root <work root> [--sheets 0]
Clips (30 fps, first frame 1): glide, flap, bank_l, bank_r, idle (loops), land and takeoff (one-shots). Angles are
written about the armature axes (X left, -Y forward, Z up) of the rest pose and mirrored for the right side.
What makes them read as an animal (and what the numbers in report/s08.json check):
 - flap: the downstroke takes 58 % of the beat; on the upstroke the wrist flexes and the fingers sweep back until the
   membrane's top-view area is ~0.56 of the downstroke's; the body is highest just after the bottom of the stroke;
   the neck counters the bob so the head travels a quarter of what the chest does;
 - feet: on the ground every paw is held by two-bone IK (animkit.Skel.plant) solved here and baked into plain
   rotation keys, so idle, land and takeoff have no foot slide; land touches hind feet first, then the front ones,
   compresses and recovers with the neck and tail following late; takeoff crouches, pushes, and the hind feet leave last;
 - bank_r is the exact mirror of bank_l.
No root translation along the path: the game moves the dragon. `land` carries its own last 0.75 m of descent and
`takeoff` its crouch and push in the root's height; the game lifts the model from the push-off (DRAGON_ANIM.push).
Output: work/08_clips.blend (one NLA track per clip), report/s08.json, renders/s08_<clip>_{side,front}.jpg (12 frames)."""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import *
from animkit import *

A = args(); ROOT = A['root']; FPS = 30
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/07_rig.blend')
rig = bpy.data.objects['dragon_rig']; mesh = bpy.data.objects['dragon']
B = Baker(rig, mesh, FPS); sk = Skel(rig)
sin, cos, pi = math.sin, math.cos, math.pi
sm = lambda a, b, x: float(smooth(a, b, x))
LR = ('.L', '.R')


def both(p, name, Q): p[name + '.L'] = Q; p[name + '.R'] = mirror(Q); return p


FINGERS = ('wing_f1', 'wing_f2', 'wing_f3', 'wing_f4')
TAIL_FLY = (30, 4, -2, -7, -13, -8, -12)
STAND_Z = -0.04      # the standing body sits a little under the rest height: slack for the (straight) front legs
LAND, TAKE = 2.4, 1.3
FLY_Z = 0.14        # the flight clips sit this much above the root plane: the trailing paws stay over it (review A pass 5)


# ---- the folded wing (lowered 14.11 so the back stays clear for the saddle): the arm back along the flank, the forearm forward again, the fingers back in a fan that
# hangs along the flank (finger 1 on top, finger 4 lowest), so the membranes between them stand as pleats
def _folded():
    F = [[float(v) for v in d.split(',')] for d in str(A.get('fold', '0.40,0.89,-0.2;0.02,-0.99,-0.13;0,1,0.055;0,1,0.012;0,1,-0.02;0,1,-0.042')).split(';')]
    p = Pose(); sk.aim(p, 'wing_arm.L', F[0]); sk.aim(p, 'wing_fore.L', F[1])
    for i, d in enumerate(F[2:]):
        a, b = f'wing_f{i + 1}a.L', f'wing_f{i + 1}b.L'; sk.aim(p, a, d, vec=sk.tail[b] - sk.head[a])
    # the closed fan still has slack membrane between the fingers: roll the whole wing about the body's long axis
    # so that slack hangs down the flank like a cloak instead of standing out sideways
    p['wing_arm.L'] = q(y=float(A.get('drape', 35))) @ p['wing_arm.L']; return p


FOLD = _folded()


def wings_folded(p, k=1.0):
    for n, Q in FOLD.items(): p[n] = Quaternion().slerp(Q, k); p[n[:-2] + '.R'] = mirror(p[n])
    return p


def legs_tucked(p, k=1.0):
    """The flight pose: hind legs trailing back along the tail, forelegs folded under the chest. Moderate angles on
    purpose: a hard tuck tears the generated skin at the leg roots (s07 pose test `legs_tucked` is this pose)."""
    both(p, 'leg_h_upper', q(x=-28 * k)); both(p, 'leg_h_lower', q(x=18 * k)); both(p, 'leg_h_foot', q(x=38 * k)); both(p, 'leg_h_paw', q(x=15 * k))
    both(p, 'leg_f_upper', q(x=30 * k)); both(p, 'leg_f_lower', q(x=-58 * k)); both(p, 'leg_f_paw', q(x=36 * k)); return p   # the elbow folds 58 deg: more tears the armpit


def fly_body(p, k=1.0):
    for n, a in (('neck1', 17), ('neck2', 12), ('neck3', 7), ('head', -32)): p[n] = q(x=a * k)
    for i, a in enumerate(TAIL_FLY): p[f'tail{i + 1}'] = q(x=a * k)
    return legs_tucked(p, k)


def tail_wave(p, ph, ax=3.0, az=3.0):
    for i in range(7):
        k = 0.5 + 0.12 * i; p.add(f'tail{i + 1}', q(x=ax * k * sin(ph - 0.6 * i), z=az * k * sin(ph - 0.7 * i + 1.0)))
    return p


WARP = 0.2594   # 0.2594: the arm's downstroke (phase pi/2 .. 3pi/2) takes 58 % of the beat; fitted below on the wing tip


def warp(t):
    """Beat time 0..1 -> stroke phase, slow through the downstroke and quick through the upstroke."""
    u = 2 * pi * (t % 1.0) - pi; return pi + u - WARP * sin(u)


FOLDK = 1.0   # how far the wing folds on the upstroke; fitted below to the membrane area


def wing_stroke(p, beat, amp=1.0, base=4.0, fold=None, even=False):
    """One wing beat at beat time `beat` (in beats): the arm leads, the forearm and the fingers follow a little later
    in TIME (the tip whips), so the whole wing keeps the long downstroke. The arm is highest at phase pi/2 and lowest
    at 3pi/2; around phase 0 (the middle of the upstroke) the elbow and the wrist flex and the fingers sweep back.
    even=True: equal down- and upstroke (the braking and take-off strokes)."""
    ph = lambda lag: (2 * pi * (beat - lag / (2 * pi))) if even else warp(beat - lag / (2 * pi))
    F = (FOLDK if fold is None else fold) * (0.5 + 0.5 * cos(ph(0.2))) ** 1.5
    both(p, 'wing_arm', q(y=-(base + 30 * amp * sin(ph(0))), z=6 * amp * cos(ph(0)) + 25 * F)); both(p, 'wing_fore', q(y=-20 * amp * sin(ph(0.7)), z=-60 * F))
    for j, f in enumerate(FINGERS):
        both(p, f + 'a', q(y=-10 * amp * sin(ph(1.1 + 0.1 * j)), z=(95, 78, 58, 38)[j] * F)); both(p, f + 'b', q(y=-14 * amp * sin(ph(1.5 + 0.1 * j)), z=6 * F))
    return p


def steady_head(p, z):
    """Pitch the neck (and level the head back) until the head's height is z: the head stays still while the body bobs."""
    def tried(d):
        pp = Pose(p); pp.loc = p.loc
        for n, w in (('neck1', 0.4), ('neck2', 0.35), ('neck3', 0.25)): pp.add(n, q(x=d * w))
        pp.add('head', q(x=-d)); return pp, sk.at(sk.fk(pp, 'head'), 'head')[2] - z
    d0, d1 = 0.0, 2.0; e0, e1 = tried(d0)[1], tried(d1)[1]
    for _ in range(6):
        if abs(e1 - e0) < 1e-9: break
        d0, d1, e0 = d1, d1 - e1 * (d1 - d0) / (e1 - e0), e1; e1 = tried(d1)[1]
    return tried(d1)[0]


HEAD_Z = float(sk.at(sk.fk(fly_body(Pose()), 'head'), 'head')[2])


def glide(t):
    ph = 2 * pi * t; p = fly_body(Pose())
    both(p, 'wing_arm', q(y=-(7 + 3 * sin(ph)))); both(p, 'wing_fore', q(y=-2.5 * sin(ph - 0.8)))
    for f in FINGERS: both(p, f + 'b', q(y=-3 * sin(ph - 1.5)))
    p.add('neck1', q(z=1.5 * sin(ph))); p.add('chest', q(x=0.8 * sin(ph)))
    p.loc = (0, 0, FLY_Z + 0.05 * sin(ph)); return steady_head(tail_wave(p, ph, 1.5, 3.0), HEAD_Z + FLY_Z + 0.25 * (p.loc[2] - FLY_Z))


def flap(t):
    ph = warp(t); p = wing_stroke(fly_body(Pose()), t)
    p.add('chest', q(x=2.0 * sin(ph - 0.3)))
    for s_ in LR: p.add('leg_h_upper' + s_, q(x=3 * sin(ph - 1.0)))
    p.loc = (0, 0, FLY_Z - 0.065 * sin(ph - pi / 4))      # lift lags the stroke: highest an eighth of a beat after the bottom
    return steady_head(tail_wave(p, ph, 5.0, 1.5), HEAD_Z + FLY_Z + 0.25 * (p.loc[2] - FLY_Z))


def bank_l(t):
    """A left turn (the left wing is the inner one). The game rolls the whole dragon; the clip adds the look into the
    turn, the dipped inner wing, the lifted outer one and the tail as a rudder. bank_r is this pose mirrored."""
    ph = 2 * pi * t; p = fly_body(Pose()); w = 1 + 0.12 * sin(ph)
    p['wing_arm.L'] = q(y=9 * w, z=10); p['wing_fore.L'] = q(y=5 * w, z=-8); p['wing_arm.R'] = mirror(q(y=-15 * w, z=-3)); p['wing_fore.R'] = mirror(q(y=-6 * w))
    for f in FINGERS: p[f + 'b.L'] = q(y=4 * w); p[f + 'b.R'] = mirror(q(y=-5 * w))
    for n, a in (('neck1', 5), ('neck2', 6), ('neck3', 6), ('head', 9)): p.add(n, q(z=a * w))
    p.add('head', q(y=-8)); p.add('chest', q(z=2))
    for i in range(5): p.add(f'tail{i + 1}', q(z=-5 * w))
    p.loc = (0, 0, FLY_Z + 0.04 * sin(ph)); return tail_wave(p, ph, 1.5, 1.5)


# ---- feet on the ground
FEET = {'hind_l': ('leg_h_upper.L', 'leg_h_lower.L', 'leg_h_foot.L'), 'hind_r': ('leg_h_upper.R', 'leg_h_lower.R', 'leg_h_foot.R'),
        'front_l': ('leg_f_upper.L', 'leg_f_lower.L', 'leg_f_paw.L'), 'front_r': ('leg_f_upper.R', 'leg_f_lower.R', 'leg_f_paw.R')}
HOME = {f: sk.head[c[2]].copy() for f, c in FEET.items()}      # where the ankle / wrist stands in the rest pose
PAW = {'hind_l': 'leg_h_paw.L', 'hind_r': 'leg_h_paw.R', 'front_l': 'leg_f_paw.L', 'front_r': 'leg_f_paw.R'}


def plant(p, k=None):
    """IK for the four legs; k: foot -> IK weight (1 = held on its spot, 0 = the pose's own leg). Sets p.contact."""
    p.contact = {}
    for f, (u, l, e) in FEET.items():
        kk = 1.0 if k is None else k.get(f, 1.0)
        if kk <= 0: p.contact[f] = False; continue
        pole = (0.1 if f.endswith('_l') else -0.1, 1.0, 0.0) if f.startswith('front') else None   # elbows point back
        p.contact[f] = bool(sk.plant(p, u, l, e, HOME[f], k=kk, pole=pole) and kk >= 1)
    return p


def idle(t):
    """4 s perched loop: breathing in the chest, the weight drifting from side to side over planted feet, the folded
    wings settling a little after the chest, the head looking around."""
    ph = 2 * pi * t; p = wings_folded(Pose())
    p['chest_top'] = q(x=1.3 * sin(ph)); p['chest'] = q(y=-0.9 * sin(ph)); p['spine2'] = q(x=0.5 * sin(ph))
    p['neck1'] = q(x=-1.2 * sin(ph)); p['neck3'] = q(z=6 * sin(ph)); p['head'] = q(x=2.5 * sin(2 * ph), z=5 * sin(ph - 0.4))
    for f in FINGERS:
        for s_ in LR: p.add(f + 'a' + s_, q(x=2.0 * sin(ph - 0.47)))
    for s_ in LR: p.add('wing_arm' + s_, q(x=1.0 * sin(ph - 0.47)))
    for i in range(7): p[f'tail{i + 1}'] = q(z=(2 + 0.9 * i) * sin(ph - 0.5 * i))
    p.loc = (0.015 * sin(ph), 0, STAND_Z + 0.006 * sin(ph - 0.5)); return plant(p)


def land(t):
    """2.4 s: braking strokes with the body pitched up and the legs reaching; the hind feet touch first (about 0.86 s),
    the front ones a few frames later; the body sinks into the legs and recovers, the neck and tail follow late; the
    wings fold last."""
    T = t * LAND; appr = sm(0.0, 0.45, T); settle = sm(0.7, 1.1, T); fold = sm(1.4, 2.3, T)
    air = fly_body(Pose(), 1 - sm(0.3, 0.9, T))
    # near the ground the strokes get short and the wings stay high, so the tips never reach the ground
    wing_stroke(air, T / 0.6, amp=(1.15 - 0.6 * sm(0.4, 0.8, T)) * (1 - sm(1.0, 1.45, T)), base=14 + 22 * sm(0.4, 0.8, T), fold=0.4 * FOLDK, even=True)
    fwd = -14 * appr * (1 - sm(0.8, 1.2, T))                       # the wings reach forward and cup the air
    air.add('wing_arm.L', q(z=fwd)); air.add('wing_arm.R', mirror(q(z=fwd)))
    pitch = -20 * appr * (1 - sm(0.78, 1.05, T)); roll = 2.0 * appr * (1 - sm(0.85, 1.2, T))
    air.add('hips', q(x=pitch, y=roll)); air.add('neck1', q(x=-pitch * 0.5)); air.add('head', q(x=-pitch * 0.3))
    tk = 1 - sm(1.0, 1.6, T)
    for i, a in enumerate(TAIL_FLY): air[f'tail{i + 1}'] = q(x=a * tk)
    air.add('tail1', q(x=-pitch))                                  # the tail stays level while the body is pitched up
    rest = idle(0); p = blend(air, rest, fold)
    dip = lambda x: -0.17 * sm(1.0, 1.22, x) * (1 - sm(1.22, 1.65, x)) + 0.018 * sm(1.55, 1.75, x) * (1 - sm(1.75, 2.0, x))
    for n, w in (('neck1', 22), ('neck2', 14)): p.add(n, q(x=-w * dip(T - 0.10)))         # follow-through: the neck nods late
    for i in range(7): p.add(f'tail{i + 1}', q(x=(9 if i < 3 else -6) * dip(T - 0.08 - 0.03 * i)))
    z = 0.75 * appr * (1 - settle) + STAND_Z * settle + dip(T)
    p.loc = tuple(a + (b - a) * fold for a, b in zip((0, 0, z), rest.loc))
    kh, kf = sm(0.45, 0.8, T), sm(0.6, 0.95, T)
    return plant(p, dict(hind_l=kh, hind_r=kh, front_l=kf, front_r=kf))


def takeoff(t):
    """1.3 s: crouch with the wings rising (0-0.25 s), the legs push with the first downstroke (the front feet leave
    first, the hind feet last, about 0.48 s), the legs trail and tuck by the second stroke; ends in flap(0)."""
    T = t * TAKE; crouch = sm(0.0, 0.25, T) * (1 - sm(0.25, 0.42, T))
    p = fly_body(Pose(), sm(0.42, 0.95, T)); trail = sm(0.4, 0.6, T) * (1 - sm(0.7, 1.1, T))
    # the first stroke is short and high (the tips must clear the ground), the second one is full
    stroke = wing_stroke(Pose(), (T - TAKE) / 0.6, amp=0.55 + 0.45 * sm(0.55, 0.9, T), base=24 - 14 * sm(0.5, 0.9, T) - 6 * sm(0.9, 1.3, T), fold=FOLDK * sm(0.5, 0.9, T), even=True)
    p.update(blend(wings_folded(Pose()), stroke, sm(0.0, 0.27, T)))
    tk = max(sm(0.1, 0.4, T), sm(0.5, 1.15, T))
    for i, a in enumerate(TAIL_FLY): p[f'tail{i + 1}'] = q(x=a * tk)
    p.add('tail1', q(x=16 * sm(0.2, 0.5, T) * (1 - sm(0.8, 1.3, T))))   # the tail stays level while the body pitches up
    p.add('hips', q(x=-16 * sm(0.2, 0.5, T) * (1 - sm(0.8, 1.3, T)))); p.add('neck1', q(x=12 * crouch)); p.add('neck2', q(x=8 * crouch))
    p.loc = (0, 0, STAND_Z * (1 - sm(0.3, 0.45, T)) - 0.25 * crouch + 0.36 * sm(0.3, 0.5, T) * (1 - sm(1.0, 1.3, T)))
    kf, kh = 1 - sm(0.36, 0.6, T), 1 - sm(0.48, 0.72, T)
    plant(p, dict(hind_l=kh, hind_r=kh, front_l=kf, front_r=kf)); c = p.contact
    p = blend(p, flap(0), sm(1.05, 1.3, T)); p.contact = c; return p


if 'probe' in A:   # a quick look at the perched pose (the folded wing) and stop
    B.apply(idle(0)); rig.animation_data.use_nla = False if rig.animation_data else None
    d = B.deformed(); w = d[[v for vs in [list(pl.vertices) for pl in mesh.data.polygons if 'wing' in mesh.data.materials[pl.material_index].name] for v in vs]]
    print('REPORT', json.dumps(dict(step='probe', wing_min=[round(float(v), 2) for v in w.min(0)], wing_max=[round(float(v), 2) for v in w.max(0)])))
    ortho_views(f'{ROOT}/renders/probe', [mesh], views=('front', 'side', 'top', 'q34'), res=700, box=[[-3, -4.5, 0], [3, 5, 5]], pad=0.75); sys.exit(0)


# ---- fit the upstroke fold to the membrane's top-view area (review: <= 0.6 of the downstroke's)
wing_slot = [i for i, m in enumerate(mesh.data.materials) if 'wing' in m.name][0]
co0 = coords(mesh)
MEMBRANE = [list(pl.vertices) for pl in mesh.data.polygons if pl.material_index == wing_slot and co0[list(pl.vertices), 0].mean() > 0.3]


def top_area(p):
    B.apply(p); d = B.deformed(); s = 0.0
    for vs in MEMBRANE:
        x, y = d[vs, 0], d[vs, 1]; s += 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))
    return s


def fold_ratio(k):
    return top_area(wing_stroke(fly_body(Pose()), 0.2 / (2 * pi), fold=k, even=True)) / top_area(wing_stroke(fly_body(Pose()), 0.5 + 0.2 / (2 * pi), fold=k, even=True))


lo, hi = 0.1, 1.4
for _ in range(7):
    FOLDK = (lo + hi) / 2
    if fold_ratio(FOLDK) > 0.56: lo = FOLDK
    else: hi = FOLDK
AREA_RATIO = fold_ratio(FOLDK)


def tip_share(n=144):
    """Share of the beat the wing TIP spends going down (top -> bottom of its height)."""
    tz = []
    for f in range(n):
        F = sk.fk(flap(f / n), 'wing_f1b.L'); tz.append(float((F['wing_f1b.L'][0] @ sk.tail['wing_f1b.L'] + F['wing_f1b.L'][1])[2]))
    return ((int(np.argmin(tz)) - int(np.argmax(tz))) % n) / n


lo, hi = 0.0, 0.9
for _ in range(7):
    WARP = (lo + hi) / 2
    if tip_share() < 0.585: lo = WARP
    else: hi = WARP

CLIPS = [('glide', glide, 3.0, True), ('flap', flap, 1.2, True), ('bank_l', bank_l, 2.4, True), ('bank_r', lambda t: mirror_pose(bank_l(t)), 2.4, True),
         ('land', land, LAND, False), ('idle', idle, 4.0, True), ('takeoff', takeoff, TAKE, False)]

# ---- bake, then measure every clip from the pose functions
paws = {}
for f, bone in PAW.items():
    gi = mesh.vertex_groups[bone].index
    paws[f] = [v.index for v in mesh.data.vertices if any(g.group == gi and g.weight > 0.95 for g in v.groups)]
numbers = {}
for name, fn, dur, loop in CLIPS:
    c = B.bake(name, fn, dur, loop, ends_like=idle(0) if name == 'land' else flap(0) if name == 'takeoff' else None)
    n = c['frames']; rows = []
    for f in range(n + 1):
        p = fn((f / n) % 1.0 if loop else f / n); B.apply(p); d = B.deformed(); F = sk.fk(p)
        rows.append(dict(contact=dict(getattr(p, 'contact', {})), paw={k: d[v].mean(0) for k, v in paws.items()}, low=float(d[:, 2].min()),
                         head=sk.at(F, 'head'), chest=sk.at(F, 'chest'), tip=F['wing_f1b.L'][0] @ sk.tail['wing_f1b.L'] + F['wing_f1b.L'][1]))
    feet = {}
    for k in paws:
        on = [i for i, r in enumerate(rows) if r['contact'].get(k)]
        if not on: continue
        ref = rows[on[0]]['paw'][k]
        feet[k] = dict(first_frame=on[0], last_frame=on[-1], frames=len(on), slide_m=round(max(float(np.linalg.norm(rows[i]['paw'][k] - ref)) for i in on), 5))
    grounded = [r['low'] for r in rows if any(r['contact'].values())]
    c.update(feet=feet, lowest_z_on_ground=round(min(grounded), 3) if grounded else None,
             head_z_range_m=round(float(np.ptp([r['head'][2] for r in rows])), 4), chest_z_range_m=round(float(np.ptp([r['chest'][2] for r in rows])), 4))
    if name == 'flap':
        tz = [r['tip'][2] for r in rows[:n]]; top, bot = int(np.argmax(tz)), int(np.argmin(tz)); down = (bot - top) % n
        hz = [r['chest'][2] for r in rows[:n]]
        c.update(downstroke_frames=down, upstroke_frames=n - down, downstroke_share=round(down / n, 3), tip_travel_m=round(float(np.ptp(tz)), 2),
                 body_highest_frame=int(np.argmax(hz)), wing_lowest_frame=bot, upstroke_area_ratio=round(AREA_RATIO, 3), fold_k=round(FOLDK, 3), warp=round(WARP, 3))
    numbers[name] = c
# the two banks are mirrors: the largest angle between bank_r and the mirrored bank_l over the loop
worst = 0.0
for f in range(72):
    a, b = mirror_pose(bank_l(f / 72)), CLIPS[3][1](f / 72)
    worst = max(worst, max(math.degrees(a[n].rotation_difference(b[n]).angle) for n in a))
numbers['bank_r']['mirror_of_bank_l_deg'] = round(worst, 4)

ensure(f'{ROOT}/renders')
if str(A.get('sheets', '1')) != '0':
    # 12 frames per clip, side and front, over a 1 m ground grid
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=24, y_subdivisions=24, size=24, location=(0, 0, 0)); ground = bpy.context.active_object
    wm = ground.modifiers.new('wire', 'WIREFRAME'); wm.thickness = 0.03; gm = bpy.data.materials.new('grid'); gm.diffuse_color = (0.12, 0.14, 0.2, 1); ground.data.materials.append(gm)
    VIEW_DIRS['side_g'] = (1, 0, 0.16); VIEW_DIRS['front_g'] = (0, -1, 0.16)
    rig.animation_data.use_nla = False; BOX = [[-7.6, -5.2, -1.0], [7.6, 5.0, 6.0]]
    for name, fn, dur, loop in CLIPS:
        for k in range(12):
            B.apply(fn(k / 12 if loop else k / 11)); bpy.context.view_layer.update()
            ortho_views(f'{ROOT}/renders/s08_{name}_{k:02d}', [mesh], views=('side_g',), res=520, box=BOX, pad=0.60)
            ortho_views(f'{ROOT}/renders/s08_{name}_{k:02d}', [mesh], views=('front_g',), res=520, box=BOX, pad=0.92)
    bpy.data.objects.remove(ground); B.apply(Pose()); rig.animation_data.use_nla = True
B.apply(Pose())
bad = [n for n, c in numbers.items() if (c['loop'] and c['loop_closure_m'] > 1e-3) or any(v['slide_m'] > 0.02 for v in c['feet'].values())
       or (c['lowest_z_on_ground'] is not None and c['lowest_z_on_ground'] < -0.03) or c.get('end_gap_m', 0) > 1e-3]
fl = numbers['flap']
if fl['downstroke_frames'] < 1.3 * fl['upstroke_frames'] or fl['upstroke_area_ratio'] > 0.6 or fl['head_z_range_m'] > fl['chest_z_range_m'] / 3: bad.append('flap_motion')
r = dict(step='s08_clips', fps=FPS, clips=numbers, failed=bad, status='PASS' if not bad else 'CHECK', tracks=[t.name for t in rig.animation_data.nla_tracks])
save(f'{ROOT}/work/08_clips.blend')
report(f'{ROOT}/report/s08.json', r); print('REPORT2', json.dumps(numbers))

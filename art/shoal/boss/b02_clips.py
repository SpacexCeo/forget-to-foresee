"""Step 02 (hollow_tide): the clips, written in code on the rest pose of 01_build.blend.
  blender -b --python b02_clips.py -- --root <boss work root>
idle (4 s loop); rise (2.4 s, out of the mirror, a roar); slam, lunge, sweep: each starts with exactly WIND = 1 s
of wind-up (the game stretches it over the telegraph of the phase), then the strike, a hold and a recovery that ends
in idle's first frame; hit (0.7 s recoil); death (3.4 s: it thrashes, falls on the mirror and sinks).
The strike poses are fitted by bisection so the head really meets the mirror (slam, death) or skims it (sweep).
Output: work/02_clips.blend (one NLA track per clip), report/b02.json, renders/b02_*.jpg frame sheets."""
import bpy, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from lib import *
from animkit import *

A = args(); ROOT = A['root']
C = json.load(open(os.path.join(HERE, 'boss.json'))); NB = C['spine_bones']
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/01_build.blend')
rig = bpy.data.objects['boss_rig']; mesh = bpy.data.objects['hollow_tide']
K = Baker(rig, mesh)
sin, cos, pi = math.sin, math.cos, math.pi
sm = lambda a, b, x: float(smooth(a, b, x))
bump = lambda x, c, w: math.exp(-((x - c) / w) ** 2)
SP = [f'spine{i:02d}' for i in range(NB)]
WIND = 1.0


def spine(p, fx=None, fy=None, fz=None):
    for i, n in enumerate(SP): p.add(n, q(x=fx(i) if fx else 0, y=fy(i) if fy else 0, z=fz(i) if fz else 0))
    return p


def idle(t):
    ph = 2 * pi * t; p = Pose()
    spine(p, fx=lambda i: 1.0 * sin(ph - 0.4 * i + 1.2), fy=lambda i: 2.2 * sin(ph - 0.45 * i))
    p['head'] = q(x=1.5 * sin(ph - 4.5), y=-3 * sin(ph - 5.0)); p['jaw'] = q(x=4 + 3 * sin(ph)); return p


IDLE0 = idle(0)
PROFILE = [0.6, 1.0, 1.3, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.6, 0.4]


def fit(make, target_z, lo, hi, bone='head'):
    """The scale k for which the head's tip is at target_z in pose make(k) (monotonic: more bend = lower)."""
    for _ in range(22):
        mid = (lo + hi) / 2
        if K.bone_tip(make(mid), bone)[2] > target_z: lo = mid
        else: hi = mid
    return (lo + hi) / 2


down = lambda k: spine(Pose(), fx=lambda i: k * PROFILE[i])
K_SLAM = fit(down, 0.9, 4, 30)
side = lambda k: spine(Pose(), fx=lambda i: 2.0, fy=lambda i: k * PROFILE[i])
K_SWEEP = fit(side, 2.2, 4, 30)
LUNGE = [34, 30, 22, 10, 0, -4, -4, -4, 0, 0, 0, 0]
dart = lambda k: spine(Pose(), fx=lambda i: k * LUNGE[i])
K_LUNGE = fit(dart, 2.4, 0.3, 2.0)


def rise(t):
    ko = 1 - (1 - t) ** 3; p = Pose()
    spine(p, fx=lambda i: 13 * (1 - ko) * (i / NB) - 5 * bump(t, 0.72, 0.14) * (i / NB), fy=lambda i: 4 * sin(13 * t - 0.5 * i) * (1 - t))
    p['jaw'] = q(x=6 + 38 * bump(t, 0.72, 0.13)); p['head'] = q(x=-10 * bump(t, 0.72, 0.14)); p.loc = (0, 0, -17.0 * (1 - ko))
    return blend(p, IDLE0, sm(0.85, 1.0, t))


def attack(strike_pose, wind_pose, strike=0.3, hold=0.25, recover=0.95, loc_strike=(0, 0, 0)):
    total = WIND + strike + hold + recover
    def fn(t):
        T = t * total; w = sm(0, WIND, T)
        p = blend(IDLE0, wind_pose(w), w)
        if T > WIND:
            k = min(1.0, (T - WIND) / strike) ** 2
            hit = strike_pose(1.0 + 0.04 * sin(min(1.0, (T - WIND - strike) / hold) * pi) if T > WIND + strike else 1.0)
            p = blend(p, hit, k); p.loc = tuple(v * k for v in loc_strike)
        if T > WIND + strike + hold: p = blend(p, IDLE0, sm(WIND + strike + hold, total, T))
        return p
    return fn, total


def slam_wind(w):
    p = spine(Pose(), fx=lambda i: -5.5 * w * min(1, i / 3)); p['jaw'] = q(x=28 * w); p['head'] = q(x=-8 * w); return p


def slam_hit(k):
    p = down(K_SLAM * k); p['jaw'] = q(x=10); p['head'] = q(x=8); return p


def lunge_wind(w):
    S = [-14, -12, -8, 0, 10, 16, 14, 8, 0, -6, -10, -8]
    p = spine(Pose(), fx=lambda i: S[i] * w); p['jaw'] = q(x=16 * w); return p


def lunge_hit(k):
    p = dart(K_LUNGE * k); p['jaw'] = q(x=42); p['head'] = q(x=-6); return p


def sweep_fn():
    strike, hold, recover = 0.5, 0.1, 0.95; total = WIND + strike + hold + recover
    def fn(t):
        T = t * total; w = sm(0, WIND, T)
        low = side(K_SWEEP); low['jaw'] = q(x=20); low['head'] = q(y=-10)
        p = blend(IDLE0, low, w); yaw = -40 * w
        if T > WIND: yaw = -40 + 360 * sm(WIND, WIND + strike + hold, T)
        if T > WIND + strike + hold: k = sm(WIND + strike + hold, total, T); p = blend(low, IDLE0, k); yaw = 320 + 40 * k
        p['root'] = q(z=yaw); return p
    return fn, total


def hit(t):
    p = spine(Pose(), fx=lambda i: -6.5 * bump(t, 0.25, 0.14) * (i / NB), fy=lambda i: 5 * sin(40 * t + i) * (1 - t) * bump(t, 0.3, 0.3))
    p['jaw'] = q(x=6 + 30 * bump(t, 0.25, 0.15)); p['head'] = q(x=-10 * bump(t, 0.25, 0.14))
    return blend(blend(IDLE0, p, sm(0, 0.12, t)), IDLE0, sm(0.75, 1.0, t))


def death(t):
    T = t * 3.4; w = sm(0, 0.8, T); fall = sm(0.8, 1.6, T) ** 2
    up = spine(Pose(), fx=lambda i: -7 * w * min(1, i / 3), fy=lambda i: 8 * sin(18 * T + 0.7 * i) * w * (1 - fall)); up['jaw'] = q(x=40 * w); up['head'] = q(x=-12 * w)
    lie = spine(Pose(), fx=lambda i: K_SLAM * 1.04 * PROFILE[i], fy=lambda i: 3.0); lie['jaw'] = q(x=24); lie['head'] = q(x=10, y=18)
    p = blend(blend(IDLE0, up, w), lie, fall); p.loc = (0, 0, -5.0 * sm(1.9, 3.4, T)); return p


slam, T_SLAM = attack(slam_hit, slam_wind)
lunge, T_LUNGE = attack(lunge_hit, lunge_wind, strike=0.25, hold=0.2, recover=0.95, loc_strike=(0, -9.0, 0))
sweep, T_SWEEP = sweep_fn()
CLIPS = [('idle', idle, 4.0, True, None), ('rise', rise, 2.4, False, IDLE0), ('slam', slam, T_SLAM, False, IDLE0), ('lunge', lunge, T_LUNGE, False, IDLE0),
         ('sweep', sweep, T_SWEEP, False, IDLE0), ('hit', hit, 0.7, False, IDLE0), ('death', death, 3.4, False, None)]
for name, fn, sec, loop, ends in CLIPS: K.bake(name, fn, sec, loop, ends_like=ends)
rig.animation_data.use_nla = False   # the NLA would override the poses set by hand
head_at = {n: [round(float(v), 2) for v in K.bone_tip(f(tt), 'head')] for n, f, tt in (('slam', slam, (WIND + 0.3) / T_SLAM), ('lunge', lunge, (WIND + 0.25) / T_LUNGE), ('sweep', sweep, (WIND + 0.25) / T_SWEEP), ('death', death, 0.6))}
ensure(f'{ROOT}/renders')
K.sheet(f'{ROOT}/renders/b02', [(n, f, l) for n, f, s, l, e in CLIPS], box=[[-13, -17, -3], [13, 9, 17]])
bad = [n for n, c in K.checks.items() if c.get('loop_closure_m', 0) > 1e-3 or c.get('end_gap_m', 0) > 2e-3]
r = dict(step='b02_clips', fps=30, wind=WIND, fitted=dict(slam=round(K_SLAM, 2), sweep=round(K_SWEEP, 2), lunge=round(K_LUNGE, 3)), head_at_strike=head_at,
         durations={n: round(s, 3) for n, f, s, l, e in CLIPS}, failed=bad, status='PASS' if not bad else 'CHECK')
save(f'{ROOT}/work/02_clips.blend')
report(f'{ROOT}/report/b02.json', dict(r, clips=K.checks)); print('REPORT2', json.dumps(K.checks))

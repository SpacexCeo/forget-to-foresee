"""Elise fix pass: shared numbers of the rebuilt zones (gown loft, side slit, lacing, stocking, face patches).
Pure numpy; imported by b_build.py (Blender), c_bake.py and d_final.py. Angles: 0 = front (-Y), +90 = her left (+X)."""
import numpy as np
ZJ, ZT, KZ = 0.80, 0.815, 0.49      # the body shell ends at ZJ; the lofted gown starts at ZT; knee height
ang = lambda x, y: np.degrees(np.arctan2(x, -y))
def sstep(t):
    t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)
def slit(z):
    """Edges of the side slit (and of the laced opening above it) at height z, degrees."""
    z = np.asarray(z, float)
    hw = np.interp(z, [0.62, 0.80, 0.955], [30.5, 13.0, 2.5]); c = np.interp(z, [0.62, 0.80, 0.955], [57.5, 54.0, 50.0])
    return c - hw, c + hw
def skirt_weights(x, y, z):
    """Cloth below the waist: pelvis to thigh by height, thigh to shin exactly as the leg under it, one leg per side
    with a narrow blend just right of the centre (numbers: skirt_check.py)."""
    x, y, z = (np.asarray(v, float) for v in (x, y, z))
    wth = sstep((0.93 - z) / 0.25); sL = np.clip((x + 0.045) / 0.03, 0, 1)
    tk = sstep((z - (KZ - 0.06)) / 0.12); fr = np.clip((-y + 0.04) / 0.08, 0, 1); hem = np.clip((0.28 - z) / 0.28, 0, 1) * 0.6
    W = {}
    for sd, s in (('L', sL), ('R', 1 - sL)):
        W['thigh_' + sd] = wth * s * tk; W['shin_' + sd] = wth * s * (1 - tk) * (1 - hem)
        W[f'skirt_F{sd}_0'] = wth * s * (1 - tk) * hem * fr; W[f'skirt_B{sd}_0'] = wth * s * (1 - tk) * hem * (1 - fr)
    W['pelvis'] = 1 - sum(W.values()); return W
def leg_axis(P, sd, z):
    """Centre x, y and radius of a leg at height z (parts.json); above the generated leg the top values continue."""
    a = np.array(P['leg'][sd]['axis']); zc = np.clip(np.asarray(z, float), a[0, 0], a[-1, 0])
    return [np.interp(zc, a[:, 0], a[:, i]) for i in (1, 2, 3)]
# ---- outer envelope of the gown from the dense source points
NT, DZ, NZ = 96, 0.01, 90
def _bins(p, fn):
    r = np.hypot(p[:, 0], p[:, 1]); zi = np.clip((p[:, 2] / DZ).astype(int), 0, NZ - 1); ti = ((ang(p[:, 0], p[:, 1]) + 180) / 360 * NT).astype(int) % NT
    M = np.full((NZ, NT), np.nan); fn.at(M, (zi, ti), r); return M
def envelope(hp, leg=None, shell=None):
    """hp: dense source points. leg: vertices of the visible leg, kept at least 1 cm inside. shell: vertices of the
    body shell near its lower cut; the top of the gown is scaled to meet them."""
    r = np.hypot(hp[:, 0], hp[:, 1]); m = (hp[:, 2] < NZ * DZ) & (r < np.where(hp[:, 2] > 0.6, 0.2, 0.235)) & (r > 0.03)      # no hands, no ribbons
    th = ang(hp[m, 0], hp[m, 1]); zi = np.minimum((hp[m, 2] / DZ).astype(int), NZ - 1); ti = ((th + 180) / 360 * NT).astype(int) % NT
    key = zi * NT + ti; o = np.argsort(key); key = key[o]; rr = r[m][o]
    st = np.searchsorted(key, np.arange(NZ * NT)); en = np.searchsorted(key, np.arange(NZ * NT), 'right'); E = np.full(NZ * NT, np.nan)
    for k in range(NZ * NT):
        if en[k] - st[k] >= 3: E[k] = np.percentile(rr[st[k]:en[k]], 96)
    E = E.reshape(NZ, NT); tc = (np.arange(NT) + 0.5) / NT * 360 - 180
    for j in range(NZ):
        t1, t2 = slit((j + 0.5) * DZ); E[j, (tc > t1 - 3) & (tc < t2 + 3)] = np.nan; ok = ~np.isnan(E[j])
        E[j] = np.interp(tc, np.r_[tc[ok] - 360, tc[ok], tc[ok] + 360], np.tile(E[j, ok], 3)) if ok.sum() >= 12 else np.nan
    good = ~np.isnan(E).any(1); idx = np.arange(NZ)
    for t in range(NT): E[:, t] = np.interp(idx, idx[good], E[good, t])
    E[:6] = E[6] + 0.25 * (0.06 - (np.arange(6)[:, None] + 0.5) * DZ)
    out = np.array([(tc < slit((j + 0.5) * DZ)[0] - 8) | (tc > slit((j + 0.5) * DZ)[1] + 8) for j in range(NZ)]); Lm = None
    if leg is not None:
        Lm = _bins(leg, np.fmax); Q = np.stack([np.roll(np.roll(Lm, a_, 0), b_, 1) for a_ in (-1, 0, 1) for b_ in (-1, 0, 1)]); edge_ = np.array([(tc < slit((j + 0.5) * DZ)[0] + 4) | (tc > slit((j + 0.5) * DZ)[1] - 4) for j in range(NZ)]); Lm = np.where(edge_, np.nanmax(np.where(np.isnan(Q), 0, Q), 0), 0)   # up to the slit edges: the turned-in lip must clear the leg too
        E = np.maximum(E, Lm + 0.016)
    k = np.array([1, 4, 6, 4, 1]) / 16
    for _ in range(2):
        Q = np.concatenate([E[:, -2:], E, E[:, :2]], 1); E = sum(k[i] * Q[:, i:i + NT] for i in range(5))
        Q = np.concatenate([E[:1], E[:1], E, E[-1:], E[-1:]], 0); E = sum(k[i] * Q[i:i + NZ] for i in range(5))
    if Lm is not None: E = np.maximum(E, Lm + 0.011)
    if shell is not None:
        j0 = int(ZJ / DZ); S = _bins(shell, np.fmax)[j0:j0 + 2]; S = np.where(np.isnan(S).all(0), np.nan, np.nanmax(np.where(np.isnan(S), 0, S), 0)); ok = ~np.isnan(S) & out[j0]
        f = np.interp(tc, np.r_[tc[ok] - 360, tc[ok], tc[ok] + 360], np.tile(S[ok] / E[j0, ok], 3)); Q = np.r_[f[-2:], f, f[:2]]; f = sum(k[i] * Q[i:i + NT] for i in range(5))
        E = E * (1 + (f[None, :] - 1) * np.clip(((np.arange(NZ)[:, None] + 0.5) * DZ - 0.58) / 0.2, 0, 1))
        if Lm is not None: E = np.maximum(E, Lm + 0.008)
    return E
def env_at(E, th, z):
    th = np.asarray(th, float); z = np.asarray(z, float)
    ft = ((th + 180) / 360 * NT - 0.5) % NT; t0 = np.floor(ft).astype(int); a = ft - t0; t1 = (t0 + 1) % NT; t0 = t0 % NT
    fz = np.clip(z / DZ - 0.5, 0, NZ - 1.001); z0 = np.floor(fz).astype(int); b = fz - z0
    return (E[z0, t0] * (1 - a) + E[z0, t1] * a) * (1 - b) + (E[z0 + 1, t0] * (1 - a) + E[z0 + 1, t1] * a) * b
# ---- face patches: thin sheets hidden behind the face skin; a morph target brings each one to the surface
EYE = {'L': (0.038, 1.587), 'R': (-0.045, 1.586)}; MOUTH = (0.001, 1.522); MOUTH_AB = (0.017, 0.011)
PATCHES = ['blink_L', 'blink_R', 'sad_L', 'sad_R', 'angry_L', 'angry_R', 'm_smile', 'm_M', 'm_A', 'm_O', 'm_sad', 'm_angry']
PART0 = 7                            # the part id of PATCHES[0]
HIDE = 0.006                         # metres behind the shown position at rest
def patch_geo(name):
    """cx, cz, half width, z lo, z hi, cells x, cells z, height above the skin when shown."""
    if name.startswith('m_'): return (MOUTH[0], MOUTH[1], 0.024, -0.016, 0.016, 8, 6, 0.0016)
    cx, cz = EYE[name[-1]]
    if name.startswith('blink'): return (cx, cz, 0.031, -0.020, 0.020, 8, 6, 0.0022)
    return (cx, cz, 0.031, -0.020, 0.034, 8, 8, 0.0016)
# morph target -> the patches it shows ('surprise' also widens the painted eyes, see d_final.py)
MORPHS = [('blink', ['blink_L', 'blink_R']), ('blink_L', ['blink_L']), ('blink_R', ['blink_R']), ('smile', ['m_smile']),
          ('surprise', ['m_O']), ('sad', ['sad_L', 'sad_R', 'm_sad']), ('angry', ['angry_L', 'angry_R', 'm_angry']),
          ('talk_A', ['m_A']), ('talk_O', ['m_O']), ('talk_M', ['m_M'])]
# ---- gown rework (pass 3): the gown is a free cloth on its own bone grid; the left leg stands outside it through the slit
NU, NV = 60, 30                              # grid cells around (rear slit edge -> back -> right -> front slit edge) and down
CH_COLS = list(range(0, NU + 1, 5))          # 13 bone chains: 0 on the rear slit edge, 12 on the front slit edge
CH_ROWS = [0, 8, 15, 22, 30]                 # bone heads on the first four rows, the last bone ends on the hem
def gown_slit(z):
    """Edges of the gown's open slit at height z, degrees: the laced opening above 0.80, then wide enough for the
    whole left leg to stand in it (sheet 01)."""
    z = np.asarray(z, float); zs = [0.0, 0.30, 0.62, 0.80, 0.955]
    return np.interp(z, zs, [6.0, 10.0, 22.0, 41.0, 47.5]), np.interp(z, zs, [114.0, 112.0, 102.0, 67.0, 52.5])
def gown_ease(th, z):
    """Slack added to the fitted envelope: 3 cm around the legs, then a flare to the hem (more at the back)."""
    z = np.asarray(z, float); back = np.maximum(0.0, -np.cos(np.radians(th)))
    return 0.030 * sstep((0.815 - z) / 0.13) + (0.075 + 0.04 * back) * np.clip((0.50 - z) / 0.50, 0, 1) ** 1.6
def bone_name(c, k): return 'skirt_%02d_%d' % (c, k)
def grid_weights():
    """{bone name: [NV + 1, NU + 1] weight}: every gown vertex is held by at most two chains and two bones of each."""
    j = np.arange(NV + 1)[:, None] * np.ones((1, NU + 1)); i = np.ones((NV + 1, 1)) * np.arange(NU + 1)[None, :]
    b = [np.ones_like(j)] + [sstep((j - (r - 2.5)) / 5.0) for r in CH_ROWS[1:-1]] + [np.zeros_like(j)]
    W = {}
    for c, col in enumerate(CH_COLS):
        hat = np.clip(1 - abs(i - col) / (CH_COLS[1] - CH_COLS[0]), 0, 1)
        for k in range(len(CH_ROWS) - 1): W[bone_name(c, k)] = hat * (b[k] - b[k + 1])
    return W

"""Elise stage A3: cut the two generated shells into game parts (metres, Z up, front -Y).
head: bust removed below the collar, neck tapered into the body's collar, decimated with the face weighted.
body: coarse head removed, hands and ribbon tails removed at the wrist wraps, the slit opened over the left leg,
the hem opened from below. Writes head_dec.ply, body_hi.ply, body_mid.ply, body_dec.ply and parts.json."""
import numpy as np, trimesh, json, pymeshlab
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.optimize import least_squares
def comps(nv, F):
    g = coo_matrix((np.ones(len(F) * 3), (F.ravel(), F[:, [1, 2, 0]].ravel())), shape=(nv, nv))
    return connected_components(g, directed=False)[1]
def sub(V, F, C, fm):
    F2 = F[fm]; used = np.unique(F2); idx = -np.ones(len(V), int); idx[used] = np.arange(len(used)); return V[used], idx[F2], C[used]
def largest(V, F, C, minv=None):
    lab = comps(len(V), F); cnt = np.bincount(lab)
    keep = cnt >= minv if minv else cnt == cnt.max()
    print('components', len(cnt), 'kept', int(keep.sum()), 'sizes', sorted(cnt.tolist())[-8:])
    return sub(V, F, C, keep[lab][F].all(1))
def dec(V, F, n, q=None, boundary=True):
    ms = pymeshlab.MeshSet(); ms.add_mesh(pymeshlab.Mesh(V, F, v_scalar_array=q) if q is not None else pymeshlab.Mesh(V, F))
    ms.meshing_decimation_quadric_edge_collapse(targetfacenum=n, qualitythr=0.4, preserveboundary=boundary, boundaryweight=2.0, preservenormal=True, qualityweight=q is not None, autoclean=True)
    m = ms.current_mesh(); return m.vertex_matrix(), m.face_matrix()
P = {}
# ---------------- head
a2 = json.load(open('a2.json')); s = a2['s']; t = np.array(a2['t']) + [-0.007, -0.012, 0]
m = trimesh.load('elise_head.glb', force='mesh', process=False); v = np.asarray(m.vertices)
V = s * np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1) + t; F = np.asarray(m.faces); C = np.load('vc_head.npy')
P['head'] = {'s': s, 't': t.tolist()}
below = V[:, 2] < 1.465
lab = comps(len(V), F[below[F].all(1)]); cnt = np.bincount(lab[below]); bust = below & (lab == cnt.argmax())
V, F, C = sub(V, F, C, ~bust[F].any(1))
V, F, C = largest(V, F, C, 1500)
low = V[:, 2] < 1.492; lab = comps(len(V), F[low[F].all(1)])
ring = low & (V[:, 2] < 1.47) & (np.hypot(V[:, 0] - 0.0, V[:, 1] - 0.003) < 0.06)
neck = low & (lab == np.bincount(lab[ring]).argmax())
k = np.clip((1.492 - V[neck, 2]) / 0.027, 0, 1) * 0.24
V[neck, 0] = V[neck, 0] * (1 - k); V[neck, 1] = 0.002 + (V[neck, 1] - 0.002) * (1 - k)
print('head neck verts', int(neck.sum()), 'bbox', V.min(0).round(3), V.max(0).round(3))
q = np.ones(len(V))
q[(V[:, 1] < 0.0) & (V[:, 2] >= 1.60)] = 2.0
q[(V[:, 2] < 1.57) & (abs(V[:, 0]) > 0.05) & (V[:, 1] < 0.03)] = 2.5
q[(V[:, 1] < -0.02) & (V[:, 2] > 1.52) & (V[:, 2] < 1.68) & (abs(V[:, 0]) < 0.085)] = 4.0
hv, hf = dec(V, F, 12500, q, boundary=False)
trimesh.Trimesh(hv, hf, process=False).export('head_dec.ply'); print('head dec', len(hv), len(hf))
np.save('head_hi_pts.npy', V.astype(np.float32))
# ---------------- body
B = trimesh.load('a1_body.ply', process=False); V = np.asarray(B.vertices); F = np.asarray(B.faces); C = np.load('vc_body.npy'); N = np.asarray(B.vertex_normals)
seen = ~((C[:, 0] > 0.98) & (C[:, 1] < 0.02) & (C[:, 2] > 0.98))
kill = V[:, 2] > 1.495
gz = [0.5, 0.858, 0.963, 1.068, 1.208, 1.25]; gx = [0.2, 0.2, 0.206, 0.162, 0.11, 0.108]
P['arm'] = {}
for sg, nm in ((1, 'L'), (-1, 'R')):
    side = sg * V[:, 0]; arm = (side > np.interp(V[:, 2], gz, gx)) & (V[:, 2] < 1.25)
    sl = []
    for z in np.arange(0.98, 1.2, 0.02):
        mm = arm & (abs(V[:, 2] - z) < 0.01); sl.append([(V[mm, 0].max() + V[mm, 0].min()) / 2, (V[mm, 1].max() + V[mm, 1].min()) / 2, z])
    sl = np.array(sl); p0 = sl.mean(0); d = np.linalg.svd(sl - p0)[2][0]; d = d if d[2] < 0 else -d
    tt = (V - p0) @ d; dist = np.linalg.norm(V - p0 - np.outer(tt, d), axis=1)
    bur = arm & seen & (C[:, 0] > 0.3) & (C[:, 0] > 1.7 * C[:, 1]) & (C[:, 0] > 1.7 * C[:, 2]) & (dist < 0.045)
    t0, t1 = np.percentile(tt[bur], [4, 96]); t1 = min(t1, t0 + 0.065); tc = t1 - 0.004
    rad = float(np.median(dist[arm & (abs(tt - tc) < 0.006) & (dist < 0.05)]))
    kill |= arm & ((tt > tc) | ((dist > rad + 0.012) & (tt > t0 - 0.01)))
    S = np.array([sg * 0.108, p0[1] + d[1] * (1.40 - p0[2]) / d[2], 1.40]); W = p0 + d * tc; Wm = p0 + d * (t0 + t1) / 2; E = S + 0.52 * (Wm - S)
    mm = arm & (abs(V[:, 2] - E[2]) < 0.012); E = np.array([(V[mm, 0].max() + V[mm, 0].min()) / 2, (V[mm, 1].max() + V[mm, 1].min()) / 2, E[2]])
    P['arm'][nm] = {'shoulder': S.tolist(), 'elbow': E.tolist(), 'wrist': W.tolist(), 'wrap_mid': Wm.tolist(), 'dir': d.tolist(), 'radius': rad, 'wrap': [float(t0), float(t1)]}
    print('arm', nm, 'S', S.round(3), 'E', E.round(3), 'W', W.round(3), 'rad %.3f wrap len %.3f' % (rad, t1 - t0), 'dir', d.round(3))
V, F, C0 = sub(V, F, np.c_[C, N, seen[:, None]], ~kill[F].any(1)); V, F, C0 = largest(V, F, C0)
C, N, seen = C0[:, :3], C0[:, 3:6], C0[:, 6] > 0.5
part = np.zeros(len(V), int); P['leg'] = {}
def taubin(p):
    m = p.mean(0); q = p - m; A = np.c_[q, np.ones(len(q))]
    a_, b_, c_ = np.linalg.lstsq(A, (q ** 2).sum(1), rcond=None)[0]; c0 = np.array([a_, b_]) / 2
    return c0 + m, np.sqrt(max(c_ + c0 @ c0, 1e-8))
cen = (abs(V[:, 0]) < 0.2)
for sg, nm, pid in ((1, 'L', 2), (-1, 'R', 3)):
    ax = {}
    for zs in (np.arange(0.30, 0.701, 0.02), np.arange(0.28, 0.115, -0.02)):
        c, r = np.array([sg * 0.062, 0.005]), 0.048
        if len(ax): c, r = np.array(ax[0.30][:2]), ax[0.30][2]
        for z in zs:
            sl = cen & (abs(V[:, 2] - z) < 0.006); p = V[sl][:, :2]
            p = p[np.linalg.norm(p - c, axis=1) < 1.3 * r + 0.006]
            for it in range(4):
                c2, r2 = taubin(p); res = abs(np.linalg.norm(p - c2, axis=1) - r2); p = p[res < max(0.004, np.percentile(res, 70))]
            if np.linalg.norm(c2 - c) < 0.02 and 0.6 * r < r2 < 1.4 * r: c, r = c2, r2
            ax[round(float(z), 2)] = [c[0], c[1], r]
    zz = np.array(sorted(ax)); A = np.array([ax[k] for k in zz])
    z = V[:, 2]; cx = np.interp(z, zz, A[:, 0]); cy = np.interp(z, zz, A[:, 1]); rr = np.interp(z, zz, A[:, 2])
    leg = cen & (z < 0.70) & (z >= 0.12) & (np.hypot(V[:, 0] - cx, V[:, 1] - cy) < rr + 0.006)
    shoe = cen & (z < 0.12) & (abs(V[:, 0] - A[0, 0]) < 0.052) & (V[:, 1] > A[0, 1] - 0.11) & (V[:, 1] < A[0, 1] + 0.08)
    part[leg | shoe] = pid; sh = V[shoe]
    P['leg'][nm] = {'axis': np.round(np.c_[zz, A], 4).tolist(), 'shoe_lo': sh.min(0).tolist(), 'shoe_hi': sh.max(0).tolist()}
    print('leg', nm, int(leg.sum()), int(shoe.sum()), np.round(np.c_[zz, A], 3)[::4].tolist(), 'shoe', sh.min(0).round(3), sh.max(0).round(3))
sk = (part == 0) & cen & (V[:, 2] < 0.70)
part[sk] = 1
# the skirt is a thin double-walled shell: keep only what can be seen from outside (the inner wall intersects the
# outer one as soon as the cloth deforms); the base material is double-sided instead
from scipy import ndimage
cnt = np.zeros(len(V), int); res = 0.003
for az in np.arange(0, 360, 15):
    for el in (0, 25, 50):
        a_, e_ = np.radians(az), np.radians(el); dd = np.array([np.sin(a_) * np.cos(e_), -np.cos(a_) * np.cos(e_), np.sin(e_)])
        r_ = np.cross([0, 0, 1.0], dd); r_ /= np.linalg.norm(r_); u_ = np.cross(dd, r_)
        px = np.round((V @ r_) / res).astype(int); py = np.round((V @ u_) / res).astype(int); px -= px.min(); py -= py.min(); dep = -(V @ dd)
        Z = np.full((py.max() + 1, px.max() + 1), np.inf); np.minimum.at(Z, (py, px), dep); Z = ndimage.minimum_filter(Z, 3)
        cnt += (dep <= Z[py, px] + 0.006) & (N @ dd > 0.15)
inner = sk & (cnt < 4)
print('skirt verts', int(sk.sum()), 'inner wall removed', int(inner.sum()))
V, F, C0 = sub(V, F, np.c_[C, part[:, None]], ~inner[F].any(1)); V, F, C0 = largest(V, F, C0, 3000); C, part = C0[:, :3], C0[:, 3].astype(int)
trimesh.Trimesh(V, F, vertex_colors=(np.clip(C, 0, 1) * 255).astype(np.uint8), process=False).export('body_hi.ply')
np.save('body_hi_pts.npy', np.asarray(B.vertices).astype(np.float32))
q = np.ones(len(V)); q[part == 2] = 2.0; q[part == 3] = 0.6
for sg, nm in ((1, 'L'), (-1, 'R')):
    A = P['arm'][nm]
    for j in ('shoulder', 'elbow'): q[np.linalg.norm(V - A[j], axis=1) < 0.07] = 2.2
    q[np.linalg.norm(V - A['wrist'], axis=1) < 0.06] = 2.0
for L in P['leg'].values():
    axs = np.array(L['axis']); k = axs[np.argmin(abs(axs[:, 0] - 0.49))]; q[(part >= 2) & (abs(V[:, 2] - 0.49) < 0.07)] *= 1.6
q[(V[:, 2] > 1.2) & (V[:, 2] < 1.36) & (V[:, 1] < 0)] = 1.6
dv, df = dec(V, F, 10200, q)
from scipy.spatial import cKDTree
dl = part[cKDTree(V).query(dv)[1]]
np.savez('body_dec.npz', V=dv, F=df, part=dl); trimesh.Trimesh(dv, df, process=False).export('body_dec.ply'); print('body', len(V), len(dv), len(df), np.bincount(dl))
json.dump(P, open('parts.json', 'w'), indent=1)

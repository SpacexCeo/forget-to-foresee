"""Elise v2, stage A1 prep (system python): the fit targets in one file.
    python3 a1_prep.py <pass-3 work dir> <src.npz> <out tgt.npz>
body: the full-resolution generated body shell with its projected vertex colours; legs: the generated legs;
head: the pass-3 head with one colour per triangle from its texture."""
import sys, numpy as np, trimesh
W, SRC, OUT = sys.argv[1:4]
B = trimesh.load(W + '/body_hi.ply', process=False); bv = np.asarray(B.vertices); bf = np.asarray(B.faces); bc = np.asarray(B.visual.vertex_colors)[:, :3] / 255.0
d = np.load(W + '/body_dec.npz'); dv, df, dp = d['V'], d['F'], d['part']; fp = dp[df].max(1)
S = np.load(SRC); V, F, UV, part, tex = S['V'], S['F'], S['UV'], S['part'], S['tex']; H, Wt = tex.shape[:2]
def tri_col(m):
    uv = UV[m].mean(1); return tex[np.clip((uv[:, 1] * H).astype(int), 0, H - 1), np.clip((uv[:, 0] * Wt).astype(int), 0, Wt - 1)] / 255.0
m = part == 1
np.savez_compressed(OUT, bv=bv, bf=bf, bc=bc, lv=dv, lfL=df[fp == 2], lfR=df[fp == 3], hv=V, hf=F[m], hc=tri_col(m))
print('body', len(bv), len(bf), 'legs', int((fp == 2).sum()), int((fp == 3).sum()), 'head tris', int(m.sum()), 'body z', bv[:, 2].min().round(3), bv[:, 2].max().round(3))

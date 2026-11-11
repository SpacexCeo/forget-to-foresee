"""Elise: orthographic projection of the owner's sheet views (01 body, 02 head) onto geometry.
Frames: 'body' = metres, Z up, front -Y (final frame); 'head' = the raw head mesh frame (Z up, front -Y, about [-1,1])."""
import numpy as np, json, os
from PIL import Image
from scipy import ndimage, signal
ROOT = '/root/w/elise'
SHEET = {'body': 'sheet01.webp', 'head': 'sheet02.webp'}
BOX = {'body': {'front': (452, 84, 762, 902), 'left': (768, 84, 930, 902), 'back': (932, 84, 1250, 902), 'right': (1252, 84, 1450, 902)},
       'head': {'front': (22, 86, 388, 488), 'left': (400, 86, 765, 488), 'right': (778, 86, 1133, 488), 'back': (22, 546, 388, 958)}}
VIEW = {'front': (0, 1, (0, -1, 0)), 'back': (0, -1, (0, 1, 0)), 'left': (1, 1, (1, 0, 0)), 'right': (1, -1, (-1, 0, 0))}
UP = 4
_cut = {}
def cutout(part, view):
    k = (part, view)
    if k not in _cut:
        f = f'{ROOT}/work/cut_{part}_{view}.png'
        if not os.path.exists(f):
            from rembg import remove
            c = Image.open(f'{ROOT}/{SHEET[part]}').convert('RGB').crop(BOX[part][view])
            c = c.resize((c.width * UP, c.height * UP), Image.LANCZOS)
            remove(c).save(f)
        _cut[k] = np.asarray(Image.open(f).convert('RGBA')).astype(np.float32) / 255
    return _cut[k]
def _ab(P, view):
    ax, sg, cam = VIEW[view]
    return sg * P[:, ax], P[:, 2], -(P @ np.array(cam, float))
def calibrate(part, P):
    """P: the dense point cloud of the generated mesh in the part frame. Fits scale and offset of every view by silhouette."""
    cal = {}
    for view in BOX[part]:
        im = cutout(part, view); al = im[..., 3] > 0.5
        f = 480 / al.shape[0]; A = ndimage.zoom(al.astype(np.float32), f, order=1) > 0.5
        ys, xs = np.nonzero(A); a, z, _ = _ab(P, view)
        k0 = (ys.max() - ys.min()) / (z.max() - z.min()); am, zm = (a.max() + a.min()) / 2, (z.max() + z.min()) / 2
        best = (-1,)
        for k in k0 * np.linspace(0.93, 1.07, 29):
            M = np.zeros(A.shape, np.float32)
            u = np.round(A.shape[1] / 2 + k * (a - am)).astype(int); v = np.round(A.shape[0] / 2 - k * (z - zm)).astype(int)
            ok = (u >= 0) & (u < A.shape[1]) & (v >= 0) & (v < A.shape[0]); M[v[ok], u[ok]] = 1
            M = ndimage.binary_closing(M, iterations=2).astype(np.float32)
            c = signal.fftconvolve(A.astype(np.float32), M[::-1, ::-1], mode='same')
            iy, ix = np.unravel_index(np.argmax(c), c.shape); inter = c[iy, ix]; iou = inter / (A.sum() + M.sum() - inter)
            if iou > best[0]: best = (iou, k, ix - (A.shape[1] - 1) // 2, iy - (A.shape[0] - 1) // 2)
        iou, k, dx, dy = best
        # full-resolution cut-out pixels: u = cu + K (a - am), v = cv - K (z - zm)
        cal[view] = {'K': k / f, 'cu': (A.shape[1] / 2 + dx) / f, 'cv': (A.shape[0] / 2 + dy) / f, 'am': float(am), 'zm': float(zm), 'iou': float(iou), 'k_rel': float(k / k0)}
        print('calib', part, view, 'iou %.3f k/k0 %.3f shift %d %d' % (iou, k / k0, dx, dy))
    json.dump(cal, open(f'{ROOT}/work/cal_{part}.json', 'w'))
    return cal
def uv(part, view, P, cal):
    c = cal[view]; a, z, d = _ab(P, view)
    return c['cu'] + c['K'] * (a - c['am']), c['cv'] - c['K'] * (z - c['zm']), d
def zbuffers(part, P, cal, res=1024):
    zb = {}
    for view in BOX[part]:
        im = cutout(part, view); f = res / im.shape[0]
        u, v, d = uv(part, view, P, cal); H, W = int(im.shape[0] * f) + 1, int(im.shape[1] * f) + 1
        iu = np.clip(np.round(u * f).astype(int), 0, W - 1); iv = np.clip(np.round(v * f).astype(int), 0, H - 1)
        Z = np.full((H, W), np.inf, np.float32); np.minimum.at(Z, (iv, iu), d.astype(np.float32))
        Z = ndimage.minimum_filter(Z, 3); zb[view] = (Z, f)
    return zb
def project(part, P, N, cal, zb, bias, power=2.0, erode=3 * UP // 2):
    """Colour of points P (normals N) blended from the views that see them. Returns rgb [n,3], weight [n]."""
    rgb = np.zeros((len(P), 3)); W = np.zeros(len(P)); per = {}
    for view in BOX[part]:
        im = cutout(part, view); al = ndimage.binary_erosion(im[..., 3] > 0.6, iterations=erode).astype(np.float32)
        u, v, d = uv(part, view, P, cal); Z, f = zb[view]
        iu = np.clip(np.round(u * f).astype(int), 0, Z.shape[1] - 1); iv = np.clip(np.round(v * f).astype(int), 0, Z.shape[0] - 1)
        vis = d <= Z[iv, iu] + bias
        co = np.stack([v, u]); a = ndimage.map_coordinates(al, co, order=1, mode='constant')
        w = np.clip(N @ np.array(VIEW[view][2], float), 0, 1) ** power * vis * (a > 0.99)
        c = np.stack([ndimage.map_coordinates(im[..., i], co, order=1, mode='nearest') for i in range(3)], 1)
        rgb += c * w[:, None]; W += w; per[view] = (c, w)
    return rgb / np.maximum(W, 1e-9)[:, None], W, per

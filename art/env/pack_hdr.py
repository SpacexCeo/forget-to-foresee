# Converts the EXR from bake_env.py into the shipped Radiance .hdr (RLE) + a JPEG preview.
#   blender -b -P art/env/pack_hdr.py -- in.exr out.hdr preview.jpg [width]
# Also reports where the brightest pixel (the sun, when rendered with --sun-disc) lands in three.js
# world space, which is how the equirect orientation was verified against render/sky.js.
import bpy, sys, math
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, prev = argv[0], argv[1], argv[2]
width = int(argv[3]) if len(argv) > 3 else 1024

img = bpy.data.images.load(src)
w, h = img.size
px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px)
px = px.reshape(h, w, 4)[::-1, :, :3].copy()  # top row first

def three_dir(x, y, W, H):
    # three.js equirect convention: u = atan(z, x)/(2pi) + 0.5, v(top=0) -> elevation
    u = (x + 0.5) / W; v = (y + 0.5) / H
    phi = (u - 0.5) * 2 * math.pi; el = (0.5 - v) * math.pi
    return (math.cos(el) * math.cos(phi), math.sin(el), math.cos(el) * math.sin(phi))

lum = px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
yy, xx = np.unravel_index(np.argmax(lum), lum.shape)
print('BRIGHTEST', float(lum[yy, xx]), 'three_dir', three_dir(xx, yy, w, h))

# Downsample by box filter to the shipped width.
f = w // width
if f > 1: px = px.reshape(h // f, f, w // f, f, 3).mean(axis=(1, 3))
H, W = px.shape[:2]
# Normalise: mean luminance of the upper hemisphere -> 1.0 (the game scales by environmentIntensity).
lum = px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
scale = 1.0 / max(1e-6, float(lum[: H // 2].mean()))
px = px * scale
print('SIZE', W, H, 'SCALE', scale, 'MAXLUM', float(lum.max() * scale), 'LOWER_MEAN', float(lum[H // 2:].mean() * scale))

def rgbe(a):
    m = a.max(axis=-1)
    e = np.zeros(m.shape, np.int32); mant = np.zeros(m.shape, np.float64)
    nz = m > 1e-32
    mant[nz], e[nz] = np.frexp(m[nz])
    out = np.zeros(a.shape[:-1] + (4,), np.uint8)
    sc = np.where(nz, mant * 256.0 / np.where(nz, m, 1), 0)
    out[..., :3] = np.clip(a * sc[..., None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(nz, e + 128, 0).astype(np.uint8)
    return out

def rle_channel(row):
    out = bytearray(); i = 0; n = len(row)
    while i < n:
        # run?
        j = i
        while j < n and j - i < 127 and row[j] == row[i]: j += 1
        if j - i >= 3:
            out += bytes([128 + (j - i), row[i]]); i = j; continue
        # literal until a run of 3 starts
        j = i
        while j < n and j - i < 128:
            if j + 2 < n and row[j] == row[j + 1] == row[j + 2]: break
            j += 1
        out += bytes([j - i]) + bytes(row[i:j]); i = j
    return out

data = rgbe(px.astype(np.float64))
with open(dst, 'wb') as fh:
    fh.write(b'#?RADIANCE\n# Forget to Foresee golden-hour IBL (art/env/bake_env.py)\nFORMAT=32-bit_rle_rgbe\n\n')
    fh.write(('-Y %d +X %d\n' % (H, W)).encode())
    for y in range(H):
        fh.write(bytes([2, 2, (W >> 8) & 255, W & 255]))
        for c in range(4): fh.write(rle_channel(data[y, :, c].tolist()))

# Preview: simple Reinhard + gamma.
from PIL import Image
t = px / (1 + px); t = np.clip(t, 0, 1) ** (1 / 2.2)
Image.fromarray((t * 255).astype(np.uint8)).save(prev, quality=85)
print('WROTE', dst, prev)

"""Tiling PBR texture sets for the town, composed in numpy (seamless by construction: FFT noise and
periodic patterns). Each set: base colour (light and fairly neutral, the meshes tint it with vertex
colour), ORM (cavity AO, roughness, metal 0) and a normal map from the height field.

    plaster   lime plaster with trowel streaks and soft stains
    timber    weathered wood, grain along U
    roof      rounded clay tiles in offset rows, rows along U, the slope rises with V
    stone     coursed ashlar masonry with recessed joints
    cobble    rounded paving stones
    ground    grass with worn earth
    rock      stratified cliff rock
    cloth     woven canvas
    foliage   leaf clumps

Run through build_town.py (`-- textures`) or directly with any Python that has numpy and Pillow.
"""

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))

SIZE = 1024
WORK = 2048


def fbm(size, beta=1.8, seed=0, ax=1.0, ay=1.0, lo=0.0, hi=1e9):
    """Seamless fractal noise in 0..1: random phases under a 1/f^beta spectrum (ax, ay stretch it)."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(size)[:, None] * size * ay
    fx = np.fft.rfftfreq(size)[None, :] * size * ax
    f = np.sqrt(fx * fx + fy * fy)
    amp = np.where(f > 0, 1.0 / np.maximum(f, 1e-6) ** beta, 0.0)
    amp = amp * (f >= lo) * (f <= hi)
    spec = amp * np.exp(1j * rng.uniform(0, 2 * np.pi, amp.shape))
    a = np.fft.irfft2(spec, s=(size, size))
    p0, p1 = np.percentile(a, [0.5, 99.5])
    return np.clip((a - p0) / (p1 - p0), 0, 1).astype(np.float32)


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def grid(size):
    v, u = np.meshgrid((np.arange(size) + 0.5) / size, (np.arange(size) + 0.5) / size, indexing="ij")
    return u.astype(np.float32), v.astype(np.float32)   # rows = v (bottom-up), columns = u


def lerp3(c0, c1, t):
    return np.asarray(c0, np.float32) * (1 - t[..., None]) + np.asarray(c1, np.float32) * t[..., None]


def cell_rand(ix, iy, seed):
    h = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF).astype(np.float32) / 65535.0


def plaster(s):
    big, mid, fine = fbm(s, 2.2, 1, hi=12), fbm(s, 1.6, 2, lo=6, hi=90), fbm(s, 0.8, 3, lo=60)
    trowel = fbm(s, 1.4, 4, ax=0.22, ay=1.0, lo=8, hi=160)
    stain = sstep(0.55, 0.85, fbm(s, 2.4, 5, ax=2.5, ay=0.6, hi=10))
    crack = fbm(s, 1.9, 6, lo=2, hi=40)
    crk = (1 - sstep(0.0, 0.012, np.abs(crack - 0.5))) * sstep(0.6, 0.8, fbm(s, 2.5, 7, hi=6))
    c = lerp3((0.74, 0.72, 0.66), (0.86, 0.84, 0.79), big * 0.6 + mid * 0.4)
    c *= (1 - 0.10 * stain)[..., None]
    c *= (0.94 + 0.12 * fine)[..., None]
    c *= (1 - 0.16 * crk)[..., None]
    h = trowel * 0.45 + mid * 0.3 + fine * 0.18 - crk * 0.15
    rough = 0.88 + 0.08 * fine - 0.05 * stain
    return c, rough, h, 9.0, (5, 2.0)


def timber(s):
    grain = fbm(s, 1.2, 11, ax=1.0, ay=0.035, lo=4, hi=400)
    grain2 = fbm(s, 1.0, 12, ax=1.0, ay=0.02, lo=40)
    tone = fbm(s, 2.2, 13, ax=1.0, ay=0.3, hi=10)
    crack = sstep(0.80, 0.90, fbm(s, 1.4, 14, ax=1.0, ay=0.03, lo=6, hi=60))
    lines = sstep(0.35, 0.75, grain)
    c = lerp3((0.40, 0.36, 0.31), (0.66, 0.62, 0.56), lines * 0.7 + tone * 0.3)
    c *= (0.9 + 0.2 * grain2)[..., None]
    c *= (1 - 0.6 * crack)[..., None]
    h = lines * 0.55 + grain2 * 0.2 - crack * 0.6
    rough = 0.72 + 0.16 * grain2 + 0.1 * crack
    return c, rough, h, 10.0, (4, 2.4)


def roof(s):
    u, v = grid(s)
    R, C = 8, 10
    rv = v * R
    row = np.floor(rv)
    fv = rv - row
    cu = u * C + 0.5 * (row % 2)
    col = np.floor(cu)
    fu = cu - col
    edge = 0.34 * (1 - np.sqrt(np.clip(1 - (2 * fu - 1) ** 2, 0, 1)))
    own = fv >= edge                      # this pixel shows this row's tile; else the row below peeks through
    row2 = np.where(own, row, row - 1)
    fv2 = np.where(own, fv - edge, fv + 1 - 0.0)
    cu2 = u * C + 0.5 * (row2 % 2)
    col2 = np.floor(cu2)
    fu2 = cu2 - col2
    rnd = cell_rand(col2 % C, row2 % R, 7)
    rnd2 = cell_rand(col2 % C, row2 % R, 8)
    n1, n2, fine = fbm(s, 2.0, 21, hi=14), fbm(s, 1.4, 22, lo=10, hi=120), fbm(s, 0.7, 23, lo=80)
    # height: a tile is thickest at its lower lip and tucks under the row above; slightly domed across
    t = np.clip(fv2 / 1.34, 0, 1)
    h = (1 - t) * 0.75 + 0.18 * np.sin(np.clip(fu2, 0, 1) * np.pi) + rnd * 0.12
    lip = sstep(0.0, 0.05, np.where(own, fv - edge, 1.0))
    h = h * (0.55 + 0.45 * lip)
    joint = sstep(0.0, 0.05, np.minimum(fu2, 1 - fu2))
    h = h * (0.6 + 0.4 * joint) + n2 * 0.06
    c = lerp3((0.56, 0.30, 0.20), (0.80, 0.50, 0.33), rnd)
    c = lerp3(c, np.asarray((0.86, 0.62, 0.40), np.float32), (rnd2 > 0.82).astype(np.float32) * 0.7)
    c *= (0.86 + 0.24 * n2)[..., None]
    moss = sstep(0.62, 0.8, n1) * sstep(0.5, 0.2, t)
    c = lerp3(c, np.asarray((0.36, 0.38, 0.22), np.float32), moss * 0.55)
    soot = sstep(0.6, 0.9, fbm(s, 2.3, 24, ax=3.0, ay=0.5, hi=8))
    c *= (1 - 0.22 * soot)[..., None]
    c *= (0.62 + 0.38 * lip)[..., None] * (0.7 + 0.3 * joint)[..., None]
    c *= (0.95 + 0.1 * fine)[..., None]
    rough = 0.78 + 0.12 * fine + 0.08 * moss
    return c, rough, h, 14.0, (6, 3.0)


def stone(s):
    u, v = grid(s)
    R = 6
    rv = v * R
    row = np.floor(rv)
    fv = rv - row
    C = 4
    cu = u * C + cell_rand(row, row * 0 + 3, 31) * 1.0
    col = np.floor(cu)
    # jitter the vertical joints: each block boundary shifts by a hashed offset
    off = (cell_rand(col % C, row, 32) - 0.5) * 0.5
    fu = cu - col
    left = fu - off
    prev = (cell_rand((col - 1) % C, row, 32) - 0.5) * 0.5
    nxt = (cell_rand((col + 1) % C, row, 32) - 0.5) * 0.5
    in_prev = fu < off
    bid = np.where(in_prev, col - 1, col) % C
    lo_edge = np.where(in_prev, prev - 1, off)
    hi_edge = np.where(in_prev, off, 1 + nxt)
    du = np.minimum(fu - lo_edge, hi_edge - fu) / C * 3.0     # in metres (tile 3 m)
    dv = np.minimum(fv, 1 - fv) / R * 3.0
    d = np.minimum(du, dv)
    warp = fbm(s, 1.6, 33, lo=4, hi=60)
    d = d + (warp - 0.5) * 0.012
    joint = sstep(0.006, 0.022, d)
    bevel = np.sqrt(np.clip(d / 0.06, 0, 1))
    rnd = cell_rand(bid, row, 34)
    n1, n2, fine = fbm(s, 2.0, 35, hi=16), fbm(s, 1.5, 36, lo=8, hi=120), fbm(s, 0.8, 37, lo=90)
    pit = sstep(0.72, 0.9, fbm(s, 1.2, 38, lo=30, hi=200))
    c = lerp3((0.50, 0.48, 0.44), (0.70, 0.68, 0.62), rnd * 0.65 + n1 * 0.35)
    c = lerp3(c, np.asarray((0.66, 0.58, 0.46), np.float32), (rnd > 0.78).astype(np.float32) * 0.5)
    c *= (0.86 + 0.24 * n2)[..., None]
    c *= (1 - 0.25 * pit)[..., None]
    lichen = sstep(0.66, 0.8, fbm(s, 2.2, 39, hi=20)) * 0.4
    c = lerp3(c, np.asarray((0.55, 0.57, 0.40), np.float32), lichen)
    mortar = np.asarray((0.34, 0.32, 0.28), np.float32)
    c = c * joint[..., None] + mortar * (1 - joint[..., None])
    c *= (0.95 + 0.1 * fine)[..., None]
    h = bevel * 0.7 + rnd * 0.1 + n2 * 0.14 + fine * 0.05 - pit * 0.1
    rough = 0.86 + 0.08 * fine - 0.1 * joint * (rnd > 0.8)
    return c, rough, h, 12.0, (6, 3.0)


def cobble(s):
    import ftf
    edge, cid = ftf.periodic_voronoi(s, 11, 4711, jitter=0.85)
    rnd = np.random.default_rng(9).random(int(cid.max()) + 1).astype(np.float32)[cid]
    warp = fbm(s, 1.6, 41, lo=4, hi=60)
    e = edge + (warp - 0.5) * 0.04
    joint = sstep(0.03, 0.10, e)
    dome = np.sqrt(np.clip(e / 0.32, 0, 1))
    n2, fine = fbm(s, 1.5, 42, lo=8, hi=120), fbm(s, 0.8, 43, lo=90)
    wear = sstep(0.5, 0.75, fbm(s, 2.2, 44, hi=10))
    c = lerp3((0.40, 0.38, 0.35), (0.62, 0.59, 0.54), rnd)
    c = lerp3(c, np.asarray((0.58, 0.50, 0.40), np.float32), (rnd > 0.8).astype(np.float32) * 0.6)
    c *= (0.84 + 0.26 * n2)[..., None]
    c = lerp3(c, np.asarray((0.66, 0.64, 0.60), np.float32), wear * dome * 0.3)
    dirt = np.asarray((0.20, 0.18, 0.14), np.float32)
    moss = sstep(0.6, 0.78, fbm(s, 2.0, 45, hi=14))
    dirt = lerp3(np.broadcast_to(dirt, c.shape), np.asarray((0.20, 0.26, 0.12), np.float32), moss * 0.8)
    c = c * joint[..., None] + dirt * (1 - joint[..., None])
    c *= (0.95 + 0.1 * fine)[..., None]
    h = dome * 0.8 + rnd * 0.12 + n2 * 0.1
    rough = 0.9 - 0.22 * wear * dome + 0.06 * fine
    return c, rough, h, 12.0, (6, 3.2)


def ground(s):
    clump, blades, fine = fbm(s, 1.9, 51, hi=30), fbm(s, 1.0, 52, ax=1.0, ay=0.25, lo=40), fbm(s, 0.7, 53, lo=100)
    earth = sstep(0.60, 0.78, fbm(s, 2.3, 54, hi=9))
    c = lerp3((0.10, 0.17, 0.05), (0.30, 0.40, 0.13), clump * 0.6 + blades * 0.4)
    flowers = (fbm(s, 0.4, 55, lo=120) > 0.985).astype(np.float32) * (1 - earth)
    c = lerp3(c, np.asarray((0.85, 0.80, 0.55), np.float32), flowers)
    e = lerp3((0.26, 0.20, 0.13), (0.42, 0.34, 0.24), fbm(s, 1.5, 56, lo=6, hi=100))
    c = c * (1 - earth[..., None]) + e * earth[..., None]
    c *= (0.92 + 0.16 * fine)[..., None]
    h = (clump * 0.5 + blades * 0.35 + fine * 0.15) * (1 - 0.6 * earth) + earth * 0.1
    rough = 0.9 + 0.06 * fine
    return c, rough, h, 10.0, (6, 2.0)


def rock(s):
    strata = fbm(s, 1.5, 61, ax=0.12, ay=1.0, lo=2, hi=80)
    big, mid, fine = fbm(s, 2.2, 62, hi=10), fbm(s, 1.5, 63, lo=6, hi=100), fbm(s, 0.8, 64, lo=90)
    crack = 1 - sstep(0.0, 0.02, np.abs(fbm(s, 1.8, 65, lo=2, hi=30) - 0.5))
    c = lerp3((0.26, 0.26, 0.25), (0.52, 0.50, 0.46), strata * 0.5 + big * 0.5)
    c *= (0.84 + 0.26 * mid)[..., None]
    lichen = sstep(0.66, 0.8, fbm(s, 2.2, 66, hi=20)) * 0.45
    c = lerp3(c, np.asarray((0.42, 0.46, 0.28), np.float32), lichen)
    c *= (1 - 0.25 * crack)[..., None]
    c *= (0.95 + 0.1 * fine)[..., None]
    h = strata * 0.5 + big * 0.3 + mid * 0.2 - crack * 0.2
    rough = 0.88 + 0.08 * fine
    return c, rough, h, 16.0, (8, 2.6)


def cloth(s):
    u, v = grid(s)
    n = 96
    warp = 0.5 + 0.5 * np.sin(u * n * 2 * np.pi)
    weft = 0.5 + 0.5 * np.sin(v * n * 2 * np.pi)
    over = ((np.floor(u * n) + np.floor(v * n)) % 2).astype(np.float32)
    h = np.where(over > 0.5, warp, weft) * 0.6 + fbm(s, 1.4, 71, lo=4, hi=60) * 0.4
    tone = fbm(s, 2.0, 72, hi=14)
    fold = fbm(s, 2.2, 73, ax=1.0, ay=0.2, hi=8)
    c = lerp3((0.74, 0.72, 0.68), (0.90, 0.88, 0.84), tone * 0.5 + h * 0.5)
    c *= (0.9 + 0.1 * fold)[..., None]
    rough = np.full_like(h, 0.92)
    return c, rough, h * 0.6 + fold * 0.4, 6.0, (4, 2.0)


def foliage(s):
    import ftf
    edge, cid = ftf.periodic_voronoi(s, 14, 815, jitter=0.95)
    rnd = np.random.default_rng(5).random(int(cid.max()) + 1).astype(np.float32)[cid]
    leaf = np.sqrt(np.clip(edge / 0.35, 0, 1))
    clump, fine = fbm(s, 2.0, 81, hi=10), fbm(s, 0.8, 82, lo=60)
    c = lerp3((0.20, 0.30, 0.10), (0.52, 0.64, 0.26), rnd * 0.6 + clump * 0.4)
    c = lerp3(c, np.asarray((0.70, 0.66, 0.26), np.float32), (rnd > 0.88).astype(np.float32) * 0.6)
    c *= (0.45 + 0.55 * leaf)[..., None]
    c *= (0.92 + 0.16 * fine)[..., None]
    h = leaf * 0.8 + rnd * 0.2
    rough = 0.78 + 0.1 * fine
    return c, rough, h, 12.0, (6, 3.0)


SETS = {"plaster": plaster, "timber": timber, "roof": roof, "stone": stone, "cobble": cobble,
        "ground": ground, "rock": rock, "cloth": cloth, "foliage": foliage}


def stage_textures(tex_dir, qa_dir=None, only=None):
    import ftf
    os.makedirs(tex_dir, exist_ok=True)
    out = {}
    for name, fn in SETS.items():
        if only and name not in only:
            continue
        c, rough, h, nstr, (aor, aos) = fn(WORK)
        f = WORK // SIZE
        c, rough, h = ftf.downsample(c, f), ftf.downsample(rough, f), ftf.downsample(h, f)
        nrm = ftf.normal_from_height(h, nstr)
        ao = ftf.cavity_ao(h, aor, aos)
        files = {
            "basecolor": ftf.save_rgb(ftf.to_srgb(c), os.path.join(tex_dir, f"town_{name}_basecolor.jpg"), 93),
            "orm": ftf.save_rgb(np.stack([ao, np.clip(rough, 0, 1), np.zeros_like(ao)], -1), os.path.join(tex_dir, f"town_{name}_orm.jpg"), 92),
            "normal": ftf.save_rgb(nrm, os.path.join(tex_dir, f"town_{name}_normal.jpg"), 95),
        }
        out[name] = {k: os.path.getsize(v) for k, v in files.items()}
        print("[town] texture", name, out[name], flush=True)
    if qa_dir:
        os.makedirs(qa_dir, exist_ok=True)
        with open(os.path.join(qa_dir, "texture-stats.json"), "w") as fh:
            json.dump({"size": SIZE, "files": out}, fh, indent=2)
        # contact sheet of the base colours
        try:
            from PIL import Image
            names = [n for n in SETS if os.path.exists(os.path.join(tex_dir, f"town_{n}_basecolor.jpg"))]
            sheet = Image.new("RGB", (384 * len(names), 384 * 2))
            for i, n in enumerate(names):
                sheet.paste(Image.open(os.path.join(tex_dir, f"town_{n}_basecolor.jpg")).resize((384, 384)), (384 * i, 0))
                sheet.paste(Image.open(os.path.join(tex_dir, f"town_{n}_normal.jpg")).resize((384, 384)), (384 * i, 384))
            sheet.save(os.path.join(qa_dir, "town_textures.jpg"), quality=88)
        except Exception as exc:  # the sheet is a convenience only
            print("[town] no contact sheet:", exc)
    return out


if __name__ == "__main__":
    stage_textures(os.path.join(HERE, "textures"), os.path.join(HERE, "..", "..", "docs", "art", "town", "qa"), sys.argv[1:] or None)

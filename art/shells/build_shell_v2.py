"""Procedural source of the Shell, version 2: one design for all four Shells (owner, 11.11).

A long, slender spiral seashell standing upright in the air (auger / spindle type, about 1 : 3.5),
tight whorls tapering to a sharp apex, crisp spiral sutures, fine growth ridges, a flared aperture lip
near the bottom, mother-of-pearl over a warm off-white base. The alien feature: round-sign glyphs
(arc, spike, loop, drop strokes) inlaid along the spiral suture, shipped as an emissive mask (the
client pulses it), and translucent-looking nacre bands that follow the spiral.

The surface is the analytic function in shell_v2_geo.py. The Shell is self-similar, so the textures
are one tileable strip (u along the whorl, v across it), generated with numpy: no high-poly master
and no bake. Faces buried inside the neighbouring whorls are culled.

Output (art/shells/out/): shell_v2.glb with the mesh `shell` (M_Shell_Exterior, M_Shell_Nacre,
M_Shell_Glow), three convex `shell_hull_*_col` meshes and the empty `socket_aperture`.
Pivot: bottom centre (the game lifts the Shell). Blender Z-up, glTF Y-up, metres, 18 m tall.

    blender -b --factory-startup -P build_shell_v2.py -- build

Nothing is taken from the film Arrival or from any game.
"""
import json
import math
import os
import struct
import sys

import bpy
import bmesh
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shell_v2_geo as G  # noqa: E402

OUT = os.environ.get("FTF_SHELL_OUT", os.path.join(HERE, "out"))
TEX = int(os.environ.get("FTF_SHELL_TEX", "2048"))
TAU = 2 * math.pi
SEG_BODY, SEG_APEX, SIDES = 54, 14, 20
TRI_BUDGET = 30000
WALL = 0.90                 # inner wall of the living chamber: the section scaled toward its centre
CHAMBER = 0.55              # whorls of open living chamber behind the aperture
GLOW = (1.0, 0.80, 0.52)
GLYPHS_PER_TILE = 6
GLYPH_R = 0.36              # glyph ring radius, metres at scale 1
SEED = 1111


# ---------------------------------------------------------------- geometry

def buried(theta, psi, pts):
    """True where a surface point lies inside the whorl before or after it (same azimuth)."""
    r = np.hypot(pts[..., 0], pts[..., 1])
    z = pts[..., 2]
    out = np.zeros(r.shape, bool)
    for k in (-1, 1):
        th2 = theta + k * TAU
        ok = (th2 <= G.THETA_END + 1e-9) & (th2 >= G.THETA_START - 1e-9)
        g2 = G.scale_of(th2)
        d = np.abs((r / g2 - G.RHO) / G.A) ** G.SUPER + np.abs((z / g2 + G.H) / G.B) ** G.SUPER
        out |= ok & (d < 0.93)
    # the side facing the axis only shows on the body whorl (around the canal)
    out |= (np.cos(psi) < -0.80) & (theta < G.THETA_END - 1.5 * TAU)
    return out


def visible_band():
    """(v_lo, v_hi) of the strip left visible between the two sutures on a spire whorl."""
    psi = np.linspace(-math.pi, math.pi, 4001)
    th = np.full_like(psi, G.THETA_END - 5 * TAU)
    vis = ~buried(th, psi, G.surface(th, psi, ribs=False)) & (np.cos(psi) > -0.5)
    v = G.psi_to_v(psi[vis])
    return float(v.min()), float(v.max())


def metres_per_u():
    """Metres per unit of u on the flank at scale 1."""
    th0, e = G.THETA_END - 2 * TAU, 1e-3
    a = G.surface(np.array([th0, th0 + e * TAU / G.UV_REPEAT]), np.array([0.3, 0.3]), ribs=False)
    return float(np.linalg.norm(a[1] - a[0]) / e / float(G.scale_of(th0)))


def arc_of_v(n=4096):
    """Arc length (metres at scale 1) along the section as a function of v in 0..1: (v, s) tables.
    The section is far from uniform in v, so everything that must stay round is drawn in (u metres, s)."""
    v = np.linspace(0.0, 1.0, n + 1)
    th0 = G.THETA_END - 2 * TAU
    p = G.surface(np.full_like(v, th0), G.v_to_psi(v), ribs=False) / float(G.scale_of(th0))
    s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
    return v, s


def build_mesh():
    g = G.grid(SEG_BODY, SEG_APEX, SIDES)
    P, uv, th, ps = g["P"], g["uv"], g["theta"], g["psi"]
    nr, ns = P.shape[0], P.shape[1]
    raw = G.surface(th[:, None], ps[None, :], ribs=False)
    bur = buried(th[:, None] + 0 * ps[None, :], ps[None, :] + 0 * th[:, None], raw)
    verts = [tuple(p) for p in P.reshape(-1, 3)]
    uvs = [tuple(t) for t in uv.reshape(-1, 2)]
    faces, mats = [], []

    def vid(i, j):
        return i * ns + j

    for i in range(nr - 1):
        for j in range(ns - 1):
            if bur[i, j] and bur[i, j + 1] and bur[i + 1, j] and bur[i + 1, j + 1]:
                continue
            faces.append((vid(i, j), vid(i, j + 1), vid(i + 1, j + 1), vid(i + 1, j)))
            mats.append(0)
    # the living chamber: an inner nacre wall, the lip rim and a glowing septum deep inside
    i0 = int(np.searchsorted(th, G.THETA_END - CHAMBER * TAU))
    cen = G.to_world(np.stack([G.scale_of(th) * G.RHO * np.cos(th), -G.scale_of(th) * G.RHO * np.sin(th),
                               -G.scale_of(th) * G.H], -1), g["scale"])
    base = len(verts)
    for i in range(i0, nr):
        for j in range(ns):
            verts.append(tuple(cen[i] + WALL * (P[i, j] - cen[i])))
            uvs.append((uv[i, j, 0] + 0.37, uv[i, j, 1]))

    def iid(i, j):
        return base + (i - i0) * ns + j

    for i in range(i0, nr - 1):
        for j in range(ns - 1):
            faces.append((iid(i, j), iid(i + 1, j), iid(i + 1, j + 1), iid(i, j + 1)))
            mats.append(1)
    for j in range(ns - 1):                                   # lip rim
        faces.append((vid(nr - 1, j), vid(nr - 1, j + 1), iid(nr - 1, j + 1), iid(nr - 1, j)))
        mats.append(1)
    c = len(verts)                                            # septum
    verts.append(tuple(cen[i0]))
    uvs.append((0.5, 0.5))
    for j in range(ns - 1):
        faces.append((c, iid(i0, j), iid(i0, j + 1)))
        mats.append(2)
    c2 = len(verts)                                           # apex cap
    verts.append(tuple(P[0].mean(0)))
    uvs.append(tuple(uv[0, 0]))
    for j in range(ns - 1):
        faces.append((c2, vid(0, j + 1), vid(0, j)))
        mats.append(0)

    me = bpy.data.meshes.new("shell")
    me.from_pydata(verts, [], faces)
    me.update()
    layer = me.uv_layers.new(name="UVMap")
    lu = np.array(uvs, np.float32)[np.array([l.vertex_index for l in me.loops])]
    layer.data.foreach_set("uv", lu.ravel())
    me.polygons.foreach_set("material_index", np.array(mats, np.int32))
    me.polygons.foreach_set("use_smooth", np.ones(len(faces), bool))
    bm = bmesh.new()
    bm.from_mesh(me)
    used = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=used, context="VERTS")
    # outward check on the body: flip everything if the flank faces look at the axis
    bm.faces.ensure_lookup_table()
    f = max((f for f in bm.faces if f.material_index == 0), key=lambda f: math.hypot(f.calc_center_median().x, f.calc_center_median().y))
    cm = f.calc_center_median()
    if f.normal.x * cm.x + f.normal.y * cm.y < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("shell", me)
    bpy.context.scene.collection.objects.link(ob)
    info = dict(aperture_centre=[float(x) for x in cen[-1]], aperture_radius=float(G.A * g["scale"]),
                triangles=sum(len(p.vertices) - 2 for p in me.polygons))
    return ob, info


# ---------------------------------------------------------------- textures

def _noise(rng, shape, octaves):
    """Tileable value noise: a sum of sines with integer frequencies, 0..1."""
    h, w = shape
    y, x = np.mgrid[0:h, 0:w]
    x, y = x / w * TAU, y / h * TAU
    out = np.zeros(shape, np.float32)
    for fx, fy, a in octaves:
        out += a * np.sin(fx * x + fy * y + rng.uniform(0, TAU)) + 0.6 * a * np.sin(fy * x - fx * y + rng.uniform(0, TAU))
    out -= out.min()
    return out / max(out.max(), 1e-6)


def _sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def glyph_mask(X, Y, lu, v_c_m, rng):
    """Round-sign glyphs: an open ring with arc / spike / loop / drop strokes. X, Y in metres (X wraps
    at lu). Returns coverage 0..1 (anti-aliased)."""
    R, wl = GLYPH_R, GLYPH_R * 0.105
    aa = lu / X.shape[1] * 1.2
    cov = np.zeros(X.shape, np.float32)

    def stroke(d, w):
        return 1.0 - _sstep(w - aa, w + aa, d)

    kinds = ["arc", "spike", "loop", "drop"]
    for i in range(GLYPHS_PER_TILE):
        cx = (i + 0.5) * lu / GLYPHS_PER_TILE
        dx = (X - cx + lu / 2) % lu - lu / 2
        dy = Y - v_c_m
        win = (np.abs(dx) < R * 1.9) & (np.abs(dy) < R * 1.9)
        if not win.any():
            continue
        px, py = dx[win], dy[win]
        rad, ang = np.hypot(px, py), np.arctan2(py, px)
        gap0, gapw = rng.uniform(0, TAU), rng.uniform(0.5, 1.1)
        dgap = np.abs((ang - gap0 + math.pi) % TAU - math.pi)
        m = stroke(np.abs(rad - R), wl) * _sstep(gapw / 2, gapw / 2 + 0.06, dgap)
        picks = [kinds[i % 4], kinds[(i + 1 + int(rng.integers(0, 3))) % 4]]
        if rng.random() < 0.5:
            picks.append(kinds[int(rng.integers(0, 4))])
        for k in picks:
            a0 = rng.uniform(0, TAU)
            ca, sa = math.cos(a0), math.sin(a0)
            if k == "arc":          # a heavier inner arc
                span = rng.uniform(1.6, 3.2)
                da = np.abs((ang - a0 + math.pi) % TAU - math.pi)
                m = np.maximum(m, stroke(np.abs(rad - R * 0.60), wl * 1.5) * (1 - _sstep(span / 2 - 0.05, span / 2, da)))
            elif k == "spike":      # a tapering ray out of the ring
                t = px * ca + py * sa
                n = np.abs(-px * sa + py * ca)
                tt = np.clip((t - R * 0.85) / (R * 0.75), 0, 1)
                m = np.maximum(m, stroke(n, wl * 1.5 * (1 - tt) + 0.004) * ((t > R * 0.85) & (t < R * 1.6)))
            elif k == "loop":       # a small ring sitting on the big one
                rl = R * 0.30
                m = np.maximum(m, stroke(np.abs(np.hypot(px - ca * (R + rl), py - sa * (R + rl)) - rl), wl * 0.9))
            else:                   # a filled drop hanging inside
                qx, qy = px - ca * R * 0.22, py - sa * R * 0.22
                t = np.clip((qx * ca + qy * sa) / (R * 0.5), 0, 1)
                d = np.hypot(qx - ca * t * R * 0.5, qy - sa * t * R * 0.5)
                m = np.maximum(m, stroke(d, R * 0.16 * (1 - 0.85 * t)))
        cov[win] = np.maximum(cov[win], m)
    return cov


def make_textures():
    rng = np.random.default_rng(SEED)
    n = TEX
    v_lo, v_hi = visible_band()
    lu = metres_per_u()
    tv, ts = arc_of_v()
    s_lo, s_hi = float(np.interp(v_lo, tv, ts)), float(np.interp(v_hi, tv, ts))
    u = (np.arange(n) + 0.5) / n
    v = (np.arange(n) + 0.5) / n
    U, V = np.meshgrid(u, v)                                  # row 0 = v 0 (Blender image origin)
    psi = G.v_to_psi(V)
    theta = G.THETA_START + U * TAU / G.UV_REPEAT
    sv = np.interp(v, tv, ts)                                 # arc length of every texture row
    X, Y = U * lu, np.broadcast_to(sv[:, None], U.shape)
    dsv = np.gradient(sv)[:, None]                            # metres per texel row
    w = (Y - s_lo) / (s_hi - s_lo)                            # 0 at the lower suture, 1 at the upper one
    flank = s_hi - s_lo

    # glyph band under the upper suture, between two thin inlay lines
    y_c = s_lo + 0.70 * flank
    glyph = glyph_mask(X, Y, lu, y_c, rng)
    aa = lu / n * 1.2
    line = np.zeros_like(glyph)
    for off, wd in ((GLYPH_R * 1.42, 0.014), (-GLYPH_R * 1.42, 0.020)):
        line = np.maximum(line, 1 - _sstep(wd - aa, wd + aa, np.abs(Y - (y_c + off))))
    inlay = np.maximum(glyph, line * (1 - _sstep(0.0, 0.06, glyph)))

    # nacre bands: a wide one on the middle of the flank, a narrow one above the lower suture
    def band(c, half, soft):
        return 1 - _sstep(half - soft, half + soft, np.abs(w - c))
    nac = np.maximum(band(0.26, 0.095, 0.012), band(0.07, 0.022, 0.010)) * (1 - inlay)
    cloud = _noise(rng, (n, n), [(2, 1, 1.0), (3, 2, 0.7), (5, 3, 0.5), (8, 5, 0.3), (13, 8, 0.2)])
    cloud2 = _noise(rng, (n, n), [(1, 2, 1.0), (4, 1, 0.6), (7, 4, 0.4), (11, 9, 0.25)])

    # relief: growth ridges (axial, leaning like the ribs) and fine spiral threads, metres at scale 1
    ph = theta / TAU * G.RIBS + 0.16 * np.sin(psi * 0.9)
    amp = 0.6 + 0.8 * cloud
    grow = (0.5 + 0.5 * np.cos(TAU * ph * 9 + 1.5 * cloud2)) ** 2 * 0.0040 * amp + (0.5 + 0.5 * np.cos(TAU * ph * 27 + 4 * cloud2)) * 0.0015
    lirae = (0.5 + 0.5 * np.cos(Y * TAU / 0.075 + 2.0 * cloud)) ** 3 * 0.0011 * (0.4 + 1.2 * cloud2)
    hgt = (grow + lirae) * (1 - 0.92 * nac) - 0.004 * nac - 0.009 * inlay
    edge = np.minimum(_sstep(-0.02, 0.07, w), _sstep(-0.02, 0.07, 1 - w))   # 0 in the sutures
    hgt = hgt - 0.010 * (1 - edge)
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) / (2 * lu / n)
    gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) / (2 * dsv)
    k = 1.6
    nx, ny, nz = -gx * k, -gy * k, np.ones_like(gx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5

    # base colour (sRGB values): warm off-white, stained toward the sutures, pearly bands, amber-gold inlay
    warm = np.array([0.925, 0.885, 0.800], np.float32)
    stain = np.array([0.70, 0.60, 0.47], np.float32)
    base = warm[None, None, :] * (0.94 + 0.06 * cloud2[..., None]) * (1 - 6.0 * (grow - 0.002))[..., None]
    base = base * (0.55 + 0.45 * edge)[..., None] + stain * (0.45 * (1 - edge))[..., None] * 0.6
    hue = cloud * 3.0 + U * TAU + w * 5.0
    pearl = np.stack([0.83 + 0.045 * np.sin(hue), 0.85 + 0.04 * np.sin(hue + 2.1), 0.88 + 0.04 * np.sin(hue + 4.2)], -1)
    depth = 0.80 + 0.20 * np.abs(2 * cloud2 - 1)              # darker "depth" inside the band
    base = base * (1 - nac[..., None]) + pearl * depth[..., None] * nac[..., None]
    gold = np.array([0.62, 0.47, 0.24], np.float32)
    base = base * (1 - inlay[..., None]) + gold * inlay[..., None]
    base = np.clip(base, 0, 1)

    ao = np.clip(0.55 + 0.45 * edge - 0.15 * inlay, 0, 1)
    rough = np.clip(0.46 + 0.10 * cloud2 - 0.33 * nac - 0.16 * inlay, 0.08, 1)
    metal = 0.55 * inlay
    orm = np.stack([ao, rough, metal], -1)
    # emissive mask: the inlay at full value, a faint light inside the nacre bands ("translucent")
    em = np.clip(inlay + 0.085 * nac * (0.4 + 0.6 * cloud), 0, 1)
    emis = np.stack([em, em, em], -1)

    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    imgs = {}
    for name, arr, srgb in (("shell_basecolor", base, True), ("shell_orm", orm, False),
                            ("shell_normal", normal, False), ("shell_emissive", emis, True)):
        img = bpy.data.images.new(name, n, n, alpha=False)
        img.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
        px = np.concatenate([arr.astype(np.float32), np.ones((n, n, 1), np.float32)], -1)
        if srgb:   # byte images are written through the colour space: give Blender linear values
            c = px[..., :3]
            px[..., :3] = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
        img.pixels.foreach_set(px.ravel())
        img.filepath_raw = os.path.join(OUT, "tex", name + ".png")
        img.file_format = "PNG"
        img.save()
        imgs[name] = img
    return imgs, dict(visible_v=[round(v_lo, 4), round(v_hi, 4)], metres_per_u=round(lu, 3), flank_m=round(flank, 3))


def make_materials(imgs):
    def tex(nt, img, x, y):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image, t.location = img, (x, y)
        return t

    mats = []
    for name in ("M_Shell_Exterior", "M_Shell_Nacre", "M_Shell_Glow"):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        m.use_backface_culling = True
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        if name == "M_Shell_Glow":
            b.inputs["Base Color"].default_value = (0.9, 0.62, 0.30, 1)
            b.inputs["Roughness"].default_value = 0.4
            b.inputs["Emission Color"].default_value = (*GLOW, 1)
            b.inputs["Emission Strength"].default_value = 1.8
            mats.append(m)
            continue
        nt.links.new(tex(nt, imgs["shell_basecolor"], -700, 300).outputs[0], b.inputs["Base Color"])
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        sep.location = (-400, 0)
        nt.links.new(tex(nt, imgs["shell_orm"], -700, 0).outputs[0], sep.inputs[0])
        nt.links.new(sep.outputs[1], b.inputs["Roughness"])
        nt.links.new(sep.outputs[2], b.inputs["Metallic"])
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.location = (-400, -300)
        nt.links.new(tex(nt, imgs["shell_normal"], -700, -300).outputs[0], nm.inputs["Color"])
        nt.links.new(nm.outputs[0], b.inputs["Normal"])
        b.inputs["Coat Weight"].default_value = 0.6
        b.inputs["Coat Roughness"].default_value = 0.15
        if name == "M_Shell_Exterior":
            nt.links.new(tex(nt, imgs["shell_emissive"], -700, -600).outputs[0], b.inputs["Emission Color"])
            b.inputs["Emission Strength"].default_value = 1.0
        mats.append(m)
    return mats


# ---------------------------------------------------------------- glb patch

def read_glb(path):
    d = open(path, "rb").read()
    jl = struct.unpack_from("<I", d, 12)[0]
    js = json.loads(d[20:20 + jl])
    return js, d[20 + jl + 8:]


def write_glb(path, js, binc):
    j = json.dumps(js, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    binc += b"\0" * (-len(binc) % 4)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(binc)))
        fh.write(struct.pack("<II", len(j), 0x4E4F534A) + j)
        fh.write(struct.pack("<II", len(binc), 0x004E4942) + binc)


def patch_glb(path):
    """The physical-material extensions the Blender exporter does not write, and the AO slot."""
    js, binc = read_glb(path)
    used = set(js.get("extensionsUsed", []))
    for mat in js.get("materials", []):
        name = mat.get("name")
        pbr = mat.get("pbrMetallicRoughness", {})
        orm = pbr.get("metallicRoughnessTexture")
        ext = mat.setdefault("extensions", {})
        if name in ("M_Shell_Exterior", "M_Shell_Nacre"):
            nac = name == "M_Shell_Nacre"
            if orm:
                mat["occlusionTexture"] = {"index": orm["index"]}
            ext["KHR_materials_iridescence"] = {"iridescenceFactor": 1.0, "iridescenceIor": 1.3,
                                                "iridescenceThicknessMinimum": 200.0 if nac else 150.0,
                                                "iridescenceThicknessMaximum": 460.0 if nac else 400.0}
            ext["KHR_materials_clearcoat"] = {"clearcoatFactor": 0.8 if nac else 0.6, "clearcoatRoughnessFactor": 0.08 if nac else 0.15}
            used.update(("KHR_materials_iridescence", "KHR_materials_clearcoat"))
            if name == "M_Shell_Exterior":
                mat["emissiveFactor"] = list(GLOW)
                ext["KHR_materials_emissive_strength"] = {"emissiveStrength": 2.0}
                used.add("KHR_materials_emissive_strength")
        elif name == "M_Shell_Glow":
            mat["emissiveFactor"] = list(GLOW)
            ext["KHR_materials_emissive_strength"] = {"emissiveStrength": 1.8}
            used.add("KHR_materials_emissive_strength")
        mat["doubleSided"] = False
    js["extensionsUsed"] = sorted(used)
    write_glb(path, js, bytes(binc))


# ---------------------------------------------------------------- build

def build_collision(shell):
    co = np.array([v.co[:] for v in shell.data.vertices])
    cuts = [0.0, 5.2, 10.5, G.TARGET_H + 0.1]
    objs = []
    for gi in range(3):
        pts = co[(co[:, 2] >= cuts[gi] - 0.3) & (co[:, 2] <= cuts[gi + 1] + 0.3)]
        pts = pts[:: max(1, len(pts) // 1500)]
        bm = bmesh.new()
        vs = [bm.verts.new(tuple(p)) for p in pts]
        bmesh.ops.convex_hull(bm, input=vs)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(18), verts=bm.verts[:], edges=bm.edges[:])
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        name = f"shell_hull_{'abc'[gi]}_col"
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        objs.append(ob)
    return objs


def stage_build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shell, info = build_mesh()
    imgs, tinfo = make_textures()
    for m in make_materials(imgs):
        shell.data.materials.append(m)
    cols = build_collision(shell)
    sock = bpy.data.objects.new("socket_aperture", None)
    bpy.context.scene.collection.objects.link(sock)
    sock.location = info["aperture_centre"]
    sock["socket"] = "aperture"
    sock["radius_m"] = round(info["aperture_radius"], 3)
    sock["note"] = "aperture centre; forward (glTF +Z of the node) looks out of the mouth"
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = shell
    path = os.path.join(OUT, "shell_v2.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_tangents=True, export_extras=True, export_image_format="AUTO",
                              export_animations=False, export_cameras=False, export_lights=False)
    patch_glb(path)
    co = np.array([v.co[:] for v in shell.data.vertices])
    stats = dict(info, **tinfo, bounds_min=co.min(0).round(3).tolist(), bounds_max=co.max(0).round(3).tolist(),
                 width_to_height=round(float((co.max(0) - co.min(0))[:2].max() / (co.max(0) - co.min(0))[2]), 3),
                 collision_triangles={o.name: len(o.data.polygons) for o in cols}, glb_raw_bytes=os.path.getsize(path),
                 budget_ok=info["triangles"] <= TRI_BUDGET)
    with open(os.path.join(OUT, "shell_v2_stats.json"), "w") as fh:
        json.dump(stats, fh, indent=2)
    print("SHELL_V2", json.dumps(stats))


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["build"]
    if argv[0] == "build":
        stage_build()

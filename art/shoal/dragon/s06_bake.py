"""Step 06 (shoal_dragon): bake the body from the source and paint the wing cells: one atlas for the whole dragon.
  blender -b --python s06_bake.py -- --root <work root> [--size 2048]
Cycles on the GPU (OPTIX). body_hi -> body_low: base colour and tangent normals (selected to active); AO of the low
mesh itself. The wing membranes and bones are painted with numpy straight into their atlas cells (s04 `cell_uv`).
Output: out/tex/shoal_dragon_{basecolor,normal,orm}.png, work/06_bake.blend (dragon = body_low + wing joined, final
material), renders/s06_*.jpg, report/s06.json."""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import *

A = args(); ROOT = A['root']; N = int(A.get('size', 2048))
CFG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dragon.json')))
AB = CFG['budget']['atlas_body']
bpy.ops.wm.open_mainfile(filepath=f'{ROOT}/work/05_low.blend')
hi, low, wing = (bpy.data.objects[k] for k in ('body_hi', 'body_low', 'wing'))
cycles_gpu(samples=8)


def bake_target(name, colorspace):
    img = bpy.data.images.new(name, N, N, alpha=False); img.colorspace_settings.name = colorspace
    mat = low.data.materials[0]; mat.use_nodes = True; nt = mat.node_tree
    node = nt.nodes.get('bake') or nt.nodes.new('ShaderNodeTexImage'); node.name = 'bake'; node.image = img; nt.nodes.active = node
    return img


def px(img):
    a = np.empty(N * N * 4, np.float32); img.pixels.foreach_get(a); return a.reshape(N, N, 4)[:, :, :3].copy()


wing.hide_render = True
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
bk = bpy.context.scene.render.bake; bk.use_selected_to_active = True; bk.cage_extrusion = 0.03; bk.max_ray_distance = 0.10; bk.margin = 6; bk.use_clear = True
bk.use_pass_direct = bk.use_pass_indirect = False; bk.use_pass_color = True
img = bake_target('bc', 'sRGB'); bpy.ops.object.bake(type='DIFFUSE'); BC = px(img)
bk.normal_space = 'TANGENT'
img = bake_target('nrm', 'Non-Color'); bpy.ops.object.bake(type='NORMAL'); NRM = px(img)
bk.use_selected_to_active = False; bpy.context.scene.cycles.samples = 96; hi.hide_render = True
bpy.ops.object.select_all(action='DESELECT'); low.select_set(True)
img = bake_target('ao', 'Non-Color'); bpy.ops.object.bake(type='AO'); AO = px(img)[:, :, 0]

# ---- repair: the source has unpainted (black) texels in crevices and on the rims of its holes; take the colour from
# the neighbours instead. The eyes keep their dark pupils (faces inside `protect` boxes are left alone).
def uv_mask(face_filter):
    m = np.zeros((N, N), bool); me = low.data; uvd = me.uv_layers[0].data
    for p in me.polygons:
        if not face_filter(p.center): continue
        t = np.array([uvd[l].uv[:] for l in p.loop_indices]) * N
        x0, y0 = np.floor(t.min(0)).astype(int) - 2; x1, y1 = np.ceil(t.max(0)).astype(int) + 2
        m[max(y0, 0):y1, max(x0, 0):x1] = True
    return m
boxes = CFG.get('protect', [])
protect = uv_mask(lambda c: any(b[0][0] <= abs(c[0]) <= b[1][0] and b[0][1] <= c[1] <= b[1][1] and b[0][2] <= c[2] <= b[1][2] for b in boxes)) if boxes else np.zeros((N, N), bool)
dark = (BC @ np.array([0.299, 0.587, 0.114], np.float32) < 0.10) & ~protect
valid = ~dark; repaired = int(dark.sum())
for _ in range(48):
    acc = np.zeros_like(BC); cnt = np.zeros((N, N), np.float32)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        v = np.roll(valid, (dy, dx), (0, 1)); acc += np.roll(BC, (dy, dx), (0, 1)) * v[..., None]; cnt += v
    fill = ~valid & (cnt > 0); BC[fill] = acc[fill] / cnt[fill][:, None]; valid = valid | fill
    if not fill.any(): break

# rays that hit the source from behind (the rims of the filled holes) give normals pointing into the surface: flatten them
bad = NRM[:, :, 2] < 0.62; NRM[bad] = (0.5, 0.5, 1.0); flattened = int(bad.sum())

# ---- body grade: a pearl lift (the source is a little grey) and roughness from the colour
lum = BC @ np.array([0.299, 0.587, 0.114], np.float32)
BC = np.clip(BC ** 0.92 * 1.02, 0, 1)
ROUGH = np.clip(0.50 - 0.22 * lum, 0.22, 0.6); METAL = np.zeros_like(ROUGH)
AOc = np.clip(0.35 + 0.65 * AO, 0, 1)

# ---- wing cells (pixel rows run up, as UV v)
PEARL = np.array([0.90, 0.87, 0.93]); PINK = np.array([0.93, 0.62, 0.76]); TEAL = np.array([0.30, 0.74, 0.78])
GOLD = np.array([0.88, 0.68, 0.33]); IVORY = np.array([0.94, 0.91, 0.87])
rng = np.random.default_rng(7)


def mottle(u, v, k=1.0):
    s = np.zeros_like(u)
    for i in range(5):
        a, b, c, d = rng.uniform(2, 9, 4) * k; s += np.sin(a * u * 6.28 + c) * np.sin(b * v * 6.28 + d)
    return s / 5


def membrane(u, v, edge, along_v=False):
    """u, v: panel parameters per pixel. edge: 0..1 closeness to the free edge. Veins run along u (or v)."""
    t = edge + 0.05 * mottle(u, v)
    col = PEARL + (PINK - PEARL) * smooth(0.18, 0.72, t)[..., None]
    col = col + (TEAL - col) * (0.85 * smooth(0.74, 1.0, t))[..., None]
    col = col * (1 + 0.035 * mottle(u, v, 2.5))[..., None]
    a, b = (v, u) if along_v else (u, v)      # a: along the veins, b: across
    vein = np.zeros_like(u)
    for k, bk_ in enumerate((0.2, 0.4, 0.6, 0.8)):
        d = np.abs(b - (bk_ + 0.022 * np.sin(7 * a + 2.1 * k) + 0.01 * np.sin(23 * a + k)))
        vein = np.maximum(vein, np.clip(1 - d / (0.011 * (1.15 - 0.75 * a)), 0, 1))
    vein = vein ** 0.7
    if along_v: spar = np.maximum(np.clip(1 - a / 0.04, 0, 1), np.clip(1 - (1 - b) / 0.03, 0, 1))   # the arm, finger 4
    else: spar = np.maximum(np.clip(1 - b / 0.035, 0, 1), np.clip(1 - (1 - b) / 0.035, 0, 1))          # the two fingers
    col = col + (GOLD - col) * (0.9 * vein)[..., None]
    col = col + (IVORY - col) * spar[..., None]
    folds = 0.5 + 0.5 * mottle(u, v, 1.6)                                    # soft uneven skin, no regular lines (review A.2)
    h = vein * 1.0 + spar * 1.6 + 0.05 * folds * (1 - spar)
    rough = 0.34 - 0.08 * vein + 0.03 * folds; metal = 0.75 * vein
    return np.clip(col, 0, 1), h, rough, metal


def paint(u0, u1, v0, v1, fn):
    x0, x1, y0, y1 = (int(round(k * N)) for k in (u0, u1, v0, v1)); w, h_ = x1 - x0, y1 - y0
    gx, gy = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h_) + 0.5) / h_)
    col, h, rough, metal = fn(gx, gy)
    dy, dx = np.gradient(h); s = 2.2 * N / 2048
    n = np.stack([-dx * s, -dy * s, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    BC[y0:y1, x0:x1] = col; NRM[y0:y1, x0:x1] = n * 0.5 + 0.5; ROUGH[y0:y1, x0:x1] = rough; METAL[y0:y1, x0:x1] = metal; AOc[y0:y1, x0:x1] = 1


for cell in range(3):   # finger panels: a (along the finger) runs up, b (across) runs right; the free edge is the tip side
    paint(AB, 1, cell / 3, (cell + 1) / 3, lambda gx, gy: membrane(gy, gx, gy ** 1.3))
paint(0, 0.5, AB, 1, lambda gx, gy: membrane(gx, gy, gy ** 1.2 * (0.55 + 0.45 * gx), along_v=True))      # arm panel: free edge at the top
paint(0.5, 0.62, AB, 1, lambda gx, gy: membrane(gx, gy, 0.35 * gy, along_v=True))                         # front membrane


def bones(gx, gy):
    col = IVORY * (1 + 0.04 * mottle(gx, gy, 3))[..., None]   # no ring banding (review A.5)
    h = 0.25 * mottle(gx, gy, 4)
    return np.clip(col + (PINK - IVORY) * 0.25 * smooth(0.5, 1, gy)[..., None], 0, 1), h, np.full_like(gx, 0.4), np.zeros_like(gx)


paint(0.62, AB, AB, 1, bones)

ensure(f'{ROOT}/out/tex')


def write(name, rgb, colorspace):
    img = bpy.data.images.new(name, N, N, alpha=False); img.colorspace_settings.name = colorspace
    a = np.concatenate([rgb.astype(np.float32), np.ones((N, N, 1), np.float32)], -1); img.pixels.foreach_set(a.ravel())
    img.filepath_raw = f'{ROOT}/out/tex/{name}.png'; img.file_format = 'PNG'; img.save(); return img


ibc = write('shoal_dragon_basecolor', BC, 'sRGB')
inr = write('shoal_dragon_normal', NRM, 'Non-Color')
iorm = write('shoal_dragon_orm', np.stack([AOc, ROUGH, METAL], -1), 'Non-Color')

# ---- one object, the final materials (body: culled back faces; membranes: double sided), same textures
for o in (hi,): bpy.data.objects.remove(o)
wing.hide_render = False
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
mats = {}
for name, double in (('shoal_dragon_body', False), ('shoal_dragon_wing', True)):
    # both double sided: the generated shell has a few inward-facing plates, culling would open holes
    mats[name] = pbr_material(name, ibc, inr, iorm, double_sided=True, emissive=ibc if double else None, emissive_strength=0.22)  # the membranes glow a little: light through skin
low.data.materials.clear(); low.data.materials.append(mats['shoal_dragon_body'])
wing.data.materials.clear(); wing.data.materials.append(mats['shoal_dragon_wing']); wing.data.materials.append(mats['shoal_dragon_body'])
bpy.ops.object.select_all(action='DESELECT'); low.select_set(True); wing.select_set(True); bpy.context.view_layer.objects.active = low
bpy.ops.object.join(); low.name = 'dragon'; low.data.name = 'dragon'
bpy.ops.file.pack_all()
r = dict(step='s06_bake', size=N, tris=tris(low), verts=len(low.data.vertices), materials=[m.name for m in low.data.materials],
         bc_mean=BC.reshape(-1, 3).mean(0).round(3), ao_mean=round(float(AO.mean()), 3),
         empty_body_px=round(float((px(bpy.data.images['bc']).sum(-1) == 0).mean()), 3), repaired_px=repaired, flattened_px=flattened, status='PASS')
save(f'{ROOT}/work/06_bake.blend')
beauty(f'{ROOT}/renders/s06', [low], views=('q34', 'behind', 'below', 'side'), res=1100)
beauty(f'{ROOT}/renders/s06n', [low], views=('q34', 'side'), res=1100, focus=((0, -3.1, 3.9), 2.3))
report(f'{ROOT}/report/s06.json', r)

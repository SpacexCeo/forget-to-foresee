"""Elise contact sheet: blender -b agent_elise.blend -P sheet.py -- <out.jpg> [expr]
Row 1 the five full views, row 2 face, bun, butterfly, lacing and hem, row 3 the face morph targets (one each at 1).
With `expr` only row 3 is rendered (a quick check)."""
import bpy, sys, math, os
a = sys.argv[sys.argv.index("--") + 1:]; OUT = a[0]; tmp = os.path.splitext(OUT)[0]
sc = bpy.context.scene; el = bpy.data.objects['elise']
blk = bpy.data.images.new('blk', 2, 2); blk.pixels = [0.01, 0.01, 0.012, 1] * 4
for m in bpy.data.materials:
    if 'outline' in m.name and m.use_nodes:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = blk; m.node_tree.nodes.active = t
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'FLAT'; sh.color_type = 'TEXTURE'; sh.show_cavity = False
sh.show_object_outline = False; sh.show_specular_highlight = False; sh.show_backface_culling = True; sc.display.render_aa = '8'; sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.color = (0.75, 0.75, 0.78)
cam = bpy.data.objects.new('shotcam', bpy.data.cameras.new('shotcam')); sc.collection.objects.link(cam); cam.data.type = 'ORTHO'; sc.camera = cam; cam.data.clip_start = 0.01; cam.data.clip_end = 100
def shot(name, v, wpx, hpx):
    cx, cy, cz, s, az, elv = v; az, elv = math.radians(az), math.radians(elv); sc.render.resolution_x = wpx; sc.render.resolution_y = hpx
    cam.location = (cx + 10 * math.sin(az) * math.cos(elv), cy - 10 * math.cos(az) * math.cos(elv), cz + 10 * math.sin(elv)); cam.rotation_euler = (math.pi / 2 - elv, 0, az); cam.data.ortho_scale = s
    sc.render.filepath = f'{tmp}_{name}.png'; bpy.ops.render.render(write_still=True); return (name, sc.render.filepath)
rows = []
if 'expr' not in a:
    rows.append([shot(n, v, 600, 1125) for n, v in (('front', [0, 0, 0.9, 1.85, 0, 0]), ('back', [0, 0, 0.9, 1.85, 180, 0]), ('left', [0, 0, 0.9, 1.85, 90, 0]), ('right', [0, 0, 0.9, 1.85, 270, 0]), ('three-quarter', [0, 0, 0.9, 1.85, 35, 5]))])
    rows.append([shot(n, v, 600, 600) for n, v in (('face', [0, 0.02, 1.61, 0.34, 0, 0]), ('bun (back)', [0, 0.05, 1.62, 0.38, 180, 10]), ('butterfly', [-0.05, 0.03, 1.66, 0.26, 290, 10]), ('lacing and stocking top', [0.12, -0.05, 0.80, 0.42, 40, 0]), ('hem and slit', [0.02, 0, 0.22, 0.56, 35, 8]))])
keys = el.data.shape_keys.key_blocks if el.data.shape_keys else []; r3 = [shot('neutral', [0, 0, 1.575, 0.19, 0, 0], 272, 272)]
for k in keys[1:]:
    k.value = 1.0; r3.append(shot(k.name, [0, 0, 1.575, 0.19, 0, 0], 272, 272)); k.value = 0.0
rows.append(r3)
from PIL import Image, ImageDraw
W = max(sum(Image.open(f).width for _, f in r) for r in rows); H = sum(Image.open(r[0][1]).height for r in rows); M = Image.new('RGB', (W, H), (191, 191, 199)); d = ImageDraw.Draw(M); y = 0
for r in rows:
    x = 0
    for n, f in r:
        im = Image.open(f).convert('RGB'); M.paste(im, (x, y)); d.text((x + 8, y + 6), n.upper(), fill=(40, 40, 48)); x += im.width; os.remove(f)
    y += im.height
M.save(OUT, quality=88); print('sheet', M.size)

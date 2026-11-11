"""Elise v2: small render helpers for the check images (Workbench, orthographic)."""
import bpy, math, os
def setup(tex=False, bg=(0.75, 0.75, 0.78)):
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading
    sh.light = 'FLAT' if tex else 'STUDIO'; sh.color_type = 'TEXTURE' if tex else 'OBJECT'; sh.show_cavity = not tex; sh.show_object_outline = False
    sh.show_specular_highlight = False; sh.show_backface_culling = False; sc.display.render_aa = '8'; sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); sc.world = w; w.color = bg
    cam = bpy.data.objects.new('shotcam', bpy.data.cameras.new('shotcam')); sc.collection.objects.link(cam); cam.data.type = 'ORTHO'; sc.camera = cam
    cam.data.clip_start = 0.01; cam.data.clip_end = 100; return cam
def shot(cam, path, v, wpx, hpx):
    """v: centre x, y, z, ortho scale, azimuth (0 front, 90 her left), elevation."""
    sc = bpy.context.scene; cx, cy, cz, s, az, elv = v; az, elv = math.radians(az), math.radians(elv); sc.render.resolution_x = wpx; sc.render.resolution_y = hpx
    sc.render.resolution_percentage = 100
    cam.location = (cx + 10 * math.sin(az) * math.cos(elv), cy - 10 * math.cos(az) * math.cos(elv), cz + 10 * math.sin(elv)); cam.rotation_euler = (math.pi / 2 - elv, 0, az); cam.data.ortho_scale = s
    sc.render.filepath = path; bpy.ops.render.render(write_still=True); return path
def montage(rows, out, label=True, quality=88, bg=(191, 191, 199)):
    """rows: lists of (name, png path); the pngs are removed."""
    from PIL import Image, ImageDraw
    W = max(sum(Image.open(f).width for _, f in r) for r in rows); H = sum(max(Image.open(f).height for _, f in r) for r in rows); M = Image.new('RGB', (W, H), bg); d = ImageDraw.Draw(M); y = 0
    for r in rows:
        x = 0; hh = 0
        for n, f in r:
            im = Image.open(f).convert('RGB'); M.paste(im, (x, y))
            if label: d.text((x + 8, y + 6), n.upper(), fill=(40, 40, 48))
            x += im.width; hh = max(hh, im.height); os.remove(f)
        y += hh
    M.save(out, quality=quality); print('montage', out, M.size)
def wire(o, on=True):
    o.show_wire = on; o.show_all_edges = on

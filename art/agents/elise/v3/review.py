"""Elise v3: review sheets. Flat colours with a soft form shade (the flat render times the brightness of a studio
render of the same view), Workbench, orthographic."""
import bpy, sys, os
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'v2')); import rend


def sheet(WD, VIEWS, name, shaded=True):
    """VIEWS: rows of (label, [cx, cy, cz, ortho scale, azimuth, elevation], width px, height px)."""
    rows = []
    for row in VIEWS:
        out = []
        for n, v, w, h in row:
            f = WD + '/r/_%s.png' % n
            for o in list(bpy.data.objects):
                if o.name.startswith('shotcam'): bpy.data.objects.remove(o)
            cam = rend.setup(True, bg=(0.86, 0.86, 0.88)); rend.shot(cam, f, v, w, h); flat = np.asarray(Image.open(f).convert('RGB'), float)
            if shaded:
                bpy.data.objects.remove(cam); cam = rend.setup(False, bg=(0.86, 0.86, 0.88)); bpy.context.scene.display.shading.show_cavity = False
                bpy.context.scene.display.shading.color_type = 'SINGLE'; bpy.context.scene.display.shading.single_color = (0.8, 0.8, 0.8)
                rend.shot(cam, f, v, w, h); g_ = np.asarray(Image.open(f).convert('L'), float) / 205.0
                flat = flat * (0.62 + 0.38 * np.clip(g_, 0, 1) ** 1.5)[:, :, None]
            Image.fromarray(flat.clip(0, 255).astype(np.uint8)).save(f); out.append((n, f))
        rows.append(out)
    rend.montage(rows, WD + '/r/' + name, bg=(219, 219, 224))

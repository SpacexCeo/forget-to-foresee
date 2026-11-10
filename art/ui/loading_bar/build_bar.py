"""Hand-drawn loading bar for the loading screen and the altar transition (docs/first-seconds.md).

  blender -b -P art/ui/loading_bar/build_bar.py            (Blender 4.5 LTS; about a minute on any machine)

Writes game/public/assets/ui/loading_bar.webp: an atlas of STEPS rows (progress 0..1) by BOIL columns (the same
drawing redrawn with another hand tremor: cycling the columns gives the line boil of pencil animation). Every stroke
is a curve with a round bevel, jittered by seeded smooth noise and tapered at its ends, lit by nothing (emission):
ink in the game's warm brown, the fill an amber scribble that is "sketched" further with each step.
The client picks the row from real load progress and cycles the column (game/src/ui/ink-bar.js reads the same
numbers from ATLAS below; keep them in step).
"""
import bpy, math, os, random
import numpy as np

ATLAS = dict(steps=25, boil=3, cell=(448, 64))
INK, AMBER, AMBER_DEEP = '#4a3214', '#e6a63c', '#c9822a'
W, H = 7.0, 1.0                  # scene units covered by one cell
X0, X1, Y0, Y1 = -3.2, 3.2, -0.25, 0.25   # the bar's box
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'game', 'public', 'assets', 'ui', 'loading_bar.webp'))
TMP = os.path.join(HERE, 'out')


def lin(hexc):
    c = [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c] + [1.0]


def material(name, hexc):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = lin(hexc)
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs[0])
    return m


class Hand:
    """A hand's tremor: smooth noise along a stroke, different for every seed."""
    def __init__(self, seed):
        self.r = random.Random(seed)

    def wobble(self, n, amp):
        ph = [(self.r.uniform(0, 6.283), self.r.uniform(0.6, 2.4), self.r.uniform(0.4, 1.0)) for _ in range(3)]
        return [amp * sum(a * math.sin(p + f * 6.283 * i / max(1, n - 1)) for p, f, a in ph) / 2 for i in range(n)]

    def stroke(self, pts, width, mat, z, amp=0.012, taper=0.45):
        """pts: [(x, y)] polyline; resampled, jittered across its direction, tapered at both ends."""
        dense = []
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            k = max(2, int(math.hypot(bx - ax, by - ay) / 0.06))
            dense += [(ax + (bx - ax) * i / k, ay + (by - ay) * i / k) for i in range(k)]
        dense.append(pts[-1])
        n = len(dense); wx, wy = self.wobble(n, amp), self.wobble(n, amp)
        cu = bpy.data.curves.new('stroke', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = width / 2; cu.bevel_resolution = 2; cu.use_fill_caps = True
        sp = cu.splines.new('POLY'); sp.points.add(n - 1)
        for i, (x, y) in enumerate(dense):
            sp.points[i].co = (x + wx[i], y + wy[i], z, 1)
            e = min(i, n - 1 - i) / max(1, n - 1)
            sp.points[i].radius = taper + (1 - taper) * min(1, e * 9) * (0.88 + 0.12 * math.sin(i * 0.9 + wx[0] * 90))
        ob = bpy.data.objects.new('stroke', cu); ob.data.materials.append(mat)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def rounded(x0, x1, y0, y1, r, start=0.0):
    """A rounded box as a closed polyline that overshoots its start a little (a pen does not close a shape exactly)."""
    pts = []
    for cx, cy, a0 in ((x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180), (x1 - r, y0 + r, 270)):
        pts += [(cx + r * math.cos(math.radians(a0 + a)), cy + r * math.sin(math.radians(a0 + a))) for a in range(0, 91, 15)]
    k = int(start * len(pts)); pts = pts[k:] + pts[:k]
    return pts + pts[:3]


def draw(progress, seed):
    for ob in list(bpy.context.scene.collection.objects):
        if ob.type == 'CURVE':
            cu = ob.data; bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    hand = Hand(seed)
    ink, amber, deep = bpy.data.materials['ink'], bpy.data.materials['amber'], bpy.data.materials['amber_deep']
    # The amber fill: a scribble of slanted hatch strokes, sketched from the left up to the progress mark.
    pad = 0.07; fx0, fx1 = X0 + pad, X0 + pad + (X1 - X0 - 2 * pad) * progress
    if progress > 0.004:
        step, slant = 0.15, 0.2
        zig = []; x = fx0; up = False
        while x < fx1 + step:
            xa = min(fx1, x); zig.append((min(fx1, xa + (slant if up else 0)), Y1 - pad - 0.02 if up else Y0 + pad + 0.02)); up = not up; x += step * 0.5
        if len(zig) > 1: hand.stroke(zig, 0.066, amber, 0.0, amp=0.016, taper=0.8)
        # a second, darker pass under the first: the pencil went over it twice
        zig2 = [(min(fx1, x + 0.03), y * 0.72 - 0.03) for x, y in zig[::2]]
        if len(zig2) > 1: hand.stroke(zig2, 0.05, deep, -0.01, amp=0.014, taper=0.8)
        # the wet leading edge
        hand.stroke([(fx1, Y0 + pad), (fx1 + 0.01, Y1 - pad)], 0.05, deep, 0.01, amp=0.008, taper=0.6)
    # The scale: ten tick marks under the box, the middle and the ends longer.
    for i in range(11):
        x = X0 + pad + (X1 - X0 - 2 * pad) * i / 10
        long = i in (0, 5, 10)
        hand.stroke([(x, Y0 - 0.06), (x + 0.01, Y0 - (0.2 if long else 0.13))], 0.03, ink, 0.02, amp=0.006, taper=0.5)
    # The box, inked twice with a slightly different hand: the doubled line of a quick sketch.
    hand.stroke(rounded(X0, X1, Y0, Y1, 0.2, 0.07), 0.05, ink, 0.03, amp=0.014)
    hand.stroke(rounded(X0 - 0.015, X1 + 0.02, Y0 - 0.012, Y1 + 0.015, 0.21, 0.55), 0.024, ink, 0.035, amp=0.022, taper=0.3)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    sc.render.film_transparent = True; sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.render.resolution_x, sc.render.resolution_y = ATLAS['cell']; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    try: sc.eevee.taa_render_samples = 16
    except Exception: pass
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; cam.data.ortho_scale = W
    cam.location = (0, -0.02, 5); sc.collection.objects.link(cam); sc.camera = cam
    material('ink', INK); material('amber', AMBER); material('amber_deep', AMBER_DEEP)
    os.makedirs(TMP, exist_ok=True)
    cw, ch = ATLAS['cell']; steps, boil = ATLAS['steps'], ATLAS['boil']
    atlas = np.zeros((steps * ch, boil * cw, 4), dtype=np.float32)
    for s in range(steps):
        for b in range(boil):
            draw(s / (steps - 1), 1000 + b * 131)   # the same three hands on every row: only the fill moves between rows
            path = os.path.join(TMP, f'p{s:02d}_b{b}.png')
            sc.render.filepath = path; bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path); px = np.array(img.pixels[:], dtype=np.float32).reshape(ch, cw, 4); bpy.data.images.remove(img)
            # image rows run bottom-up; row 0 of the atlas (top) is progress 0
            r0 = (steps - 1 - s) * ch
            atlas[r0:r0 + ch, b * cw:(b + 1) * cw] = px
    out = bpy.data.images.new('atlas', boil * cw, steps * ch, alpha=True); out.pixels = atlas.ravel(); out.alpha_mode = 'STRAIGHT'
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 86; sc.render.image_settings.color_mode = 'RGBA'
    out.save_render(OUT, scene=sc)
    sc.render.image_settings.file_format = 'PNG'; out.save_render(os.path.join(TMP, 'loading_bar_atlas.png'), scene=sc)
    print('atlas', OUT, os.path.getsize(OUT), 'bytes')


main()

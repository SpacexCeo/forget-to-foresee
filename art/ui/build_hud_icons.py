"""HUD icon set for the declutter pass (lead / owner, 12.11: too much text on screen, icons instead).

Original glyphs drawn as vector masks (PIL) at 512 px and shipped downscaled. Style after the UI-003 board icons,
kept gold-on-dark for the HUD: a rounded dark tile with a gold bevel frame, a gold glyph with a dark outline (it
holds at 24 px on any background) and a soft warm glow. Every icon also ships glyph-only (`<name>_glyph`) for
buttons that draw their own plate.

    python3 art/ui/build_hud_icons.py [repo_root]

Writes game/public/assets/ui/icons/hud/<name>_{24,32,48,96}.{webp,png} and <name>_glyph_{24,32,48,96}.{webp,png},
plus docs/art/ui/hud_icons_sheet.jpg. Needs Pillow only.
"""
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 512
SIZES = (24, 32, 48, 96)
W = 0.085            # stroke width in glyph units (0..1)


class G:
    """A glyph mask drawn in unit coordinates (0..1 inside the glyph box)."""

    def __init__(self, box):
        self.x0, self.y0, self.k = box[0] * S, box[1] * S, (box[2] - box[0]) * S
        self.m = Image.new("L", (S, S), 0)
        self.d = ImageDraw.Draw(self.m)

    def p(self, x, y):
        return (self.x0 + x * self.k, self.y0 + y * self.k)

    def r(self, v):
        return v * self.k

    def poly(self, pts, on=True):
        self.d.polygon([self.p(*q) for q in pts], fill=255 if on else 0)

    def circle(self, x, y, rad, on=True):
        cx, cy = self.p(x, y)
        rr = self.r(rad)
        self.d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=255 if on else 0)

    def ring(self, x, y, rad, w=W, on=True):
        cx, cy = self.p(x, y)
        rr = self.r(rad)
        self.d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=255 if on else 0, width=max(1, int(self.r(w))))

    def rrect(self, x0, y0, x1, y1, rad, on=True):
        a, b = self.p(x0, y0), self.p(x1, y1)
        self.d.rounded_rectangle((a[0], a[1], b[0], b[1]), radius=self.r(rad), fill=255 if on else 0)

    def rrect_line(self, x0, y0, x1, y1, rad, w=W, on=True):
        a, b = self.p(x0, y0), self.p(x1, y1)
        self.d.rounded_rectangle((a[0], a[1], b[0], b[1]), radius=self.r(rad), outline=255 if on else 0, width=max(1, int(self.r(w))))

    def line(self, pts, w=W, on=True, caps=True):
        q = [self.p(*t) for t in pts]
        self.d.line(q, fill=255 if on else 0, width=max(1, int(self.r(w))), joint="curve")
        if caps:
            for t in (pts[0], pts[-1]):
                self.circle(t[0], t[1], w / 2, on)

    def arc(self, x, y, rad, a0, a1, w=W, on=True, caps=True):
        """Arc in degrees, 0 = +x, counter-clockwise on screen (y up)."""
        n = max(8, int(abs(a1 - a0) / 4))
        pts = [(x + math.cos(math.radians(a0 + (a1 - a0) * i / n)) * rad, y - math.sin(math.radians(a0 + (a1 - a0) * i / n)) * rad) for i in range(n + 1)]
        self.line(pts, w, on, caps)
        return pts

    def star4(self, x, y, rad, on=True, thin=0.28):
        pts = []
        for i in range(8):
            a = math.pi / 2 * (i // 2) + (math.pi / 4 if i % 2 else 0) - math.pi / 2
            rr = rad if i % 2 == 0 else rad * thin
            pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
        self.poly(pts, on)

    def head_bust(self, x, y, s, on=True):
        """A person: round head over rounded shoulders, centred at x, head top near y."""
        self.circle(x, y + 0.17 * s, 0.15 * s, on)
        a, b = self.p(x - 0.3 * s, y + 0.38 * s), self.p(x + 0.3 * s, y + 0.86 * s)
        self.d.chord((a[0], a[1], b[0], b[1] + (b[1] - a[1])), 180, 360, fill=255 if on else 0)


# ------------------------------------------------------------------ glyphs

def g_quest(g):
    g.poly([(0.5, 0.02), (0.98, 0.5), (0.5, 0.98), (0.02, 0.5)])
    g.poly([(0.5, 0.13), (0.87, 0.5), (0.5, 0.87), (0.13, 0.5)], on=False)
    g.line([(0.5, 0.3), (0.5, 0.56)], w=0.11)
    g.circle(0.5, 0.71, 0.065)


def g_altar(g):
    g.ring(0.5, 0.42, 0.3, w=0.1)   # the altar ring (the four strokes of the sign blur at 24 px next to the badge)
    # the amber core: a drop
    g.poly([(0.5, 0.25)] + [(0.5 + math.cos(a) * 0.09, 0.47 + math.sin(a) * 0.09) for a in [math.radians(t) for t in range(-30, 211, 15)]])
    g.poly([(0.22, 0.8), (0.78, 0.8), (0.84, 0.9), (0.16, 0.9)])
    g.poly([(0.32, 0.72), (0.68, 0.72), (0.72, 0.79), (0.28, 0.79)])


def g_help(g):
    g.arc(0.5, 0.34, 0.2, 165, -60, w=0.11)
    g.line([(0.5 + math.cos(math.radians(-60)) * 0.2, 0.34 + math.sin(math.radians(60)) * 0.2), (0.5, 0.58), (0.5, 0.64)], w=0.11)
    g.circle(0.5, 0.83, 0.07)


def g_controls(g):
    g.rrect(0.1, 0.3, 0.9, 0.66, 0.16)
    g.circle(0.24, 0.66, 0.15)
    g.circle(0.76, 0.66, 0.15)
    g.rrect(0.2, 0.44, 0.38, 0.5, 0.01, on=False)
    g.rrect(0.26, 0.38, 0.32, 0.56, 0.01, on=False)
    g.circle(0.66, 0.42, 0.04, on=False)
    g.circle(0.74, 0.5, 0.04, on=False)
    g.circle(0.58, 0.5, 0.04, on=False)
    g.circle(0.66, 0.58, 0.04, on=False)


def g_chat(g):
    g.rrect(0.06, 0.14, 0.94, 0.7, 0.18)
    g.poly([(0.22, 0.64), (0.44, 0.66), (0.18, 0.9)])
    for x in (0.3, 0.5, 0.7):
        g.circle(x, 0.42, 0.06, on=False)


def g_players(g):
    g.head_bust(0.66, 0.08, 0.82)
    g.head_bust(0.36, 0.2, 0.92, on=False)  # a gap around the front figure
    g.head_bust(0.36, 0.24, 0.84)


def g_bag(g):
    g.arc(0.5, 0.3, 0.16, 180, 0, w=0.075)
    g.rrect(0.14, 0.3, 0.86, 0.92, 0.16)
    g.rrect(0.14, 0.3, 0.86, 0.5, 0.12)
    g.line([(0.16, 0.53), (0.84, 0.53)], w=0.04, on=False, caps=False)
    g.rrect(0.42, 0.46, 0.58, 0.62, 0.03, on=False)
    g.rrect(0.45, 0.49, 0.55, 0.59, 0.02)


def g_map(g):
    g.poly([(0.06, 0.22), (0.36, 0.12), (0.64, 0.22), (0.94, 0.12), (0.94, 0.8), (0.64, 0.9), (0.36, 0.8), (0.06, 0.9)])
    g.line([(0.36, 0.14), (0.36, 0.8)], w=0.035, on=False, caps=False)
    g.line([(0.64, 0.22), (0.64, 0.88)], w=0.035, on=False, caps=False)
    # the pin, cut free of the map
    g.circle(0.5, 0.4, 0.17, on=False)
    g.poly([(0.36, 0.48), (0.64, 0.48), (0.5, 0.78)], on=False)
    g.circle(0.5, 0.4, 0.13)
    g.poly([(0.39, 0.46), (0.61, 0.46), (0.5, 0.7)])
    g.circle(0.5, 0.4, 0.05, on=False)


def g_settings(g):
    n = 8
    pts = []
    for i in range(n * 4):
        a = math.tau * i / (n * 4)
        rr = 0.45 if (i % 4) in (1, 2) else 0.34
        pts.append((0.5 + math.cos(a + math.pi / n / 2) * rr, 0.5 + math.sin(a + math.pi / n / 2) * rr))
    g.poly(pts)
    g.circle(0.5, 0.5, 0.14, on=False)


def g_camera(g):
    g.rrect(0.06, 0.28, 0.94, 0.84, 0.1)
    g.poly([(0.32, 0.29), (0.38, 0.16), (0.62, 0.16), (0.68, 0.29)])
    g.circle(0.5, 0.56, 0.21, on=False)
    g.circle(0.5, 0.56, 0.14)
    g.circle(0.8, 0.4, 0.04, on=False)


def g_profile(g):
    g.ring(0.5, 0.5, 0.45, w=0.07)
    g.circle(0.5, 0.4, 0.15)
    g.d.chord((*g.p(0.24, 0.6), *g.p(0.76, 1.04)), 180, 360, fill=255)
    m2 = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m2).ellipse((*g.p(0.08, 0.08), *g.p(0.92, 0.92)), fill=255)
    g.m.paste(ImageChops.multiply(g.m, m2))


def g_achievements(g):
    g.poly([(0.24, 0.12), (0.76, 0.12)] + [(0.5 + math.cos(math.radians(a)) * 0.26, 0.3 + math.sin(math.radians(a)) * 0.26) for a in range(0, 181, 10)])
    g.arc(0.24, 0.3, 0.12, 90, 270, w=0.06)
    g.arc(0.76, 0.3, 0.12, 90, -90, w=0.06)
    g.poly([(0.45, 0.55), (0.55, 0.55), (0.57, 0.74), (0.43, 0.74)])
    g.rrect(0.28, 0.74, 0.72, 0.88, 0.03)
    g.star4(0.5, 0.3, 0.1, on=False)


def g_nfts(g):
    g.rrect(0.3, 0.06, 0.88, 0.8, 0.07)
    g.rrect(0.26, 0.04, 0.92, 0.84, 0.09, on=False)
    g.rrect(0.3, 0.06, 0.88, 0.8, 0.07)
    g.rrect(0.1, 0.2, 0.7, 0.96, 0.08, on=False)
    g.rrect(0.14, 0.24, 0.66, 0.92, 0.06)
    # the round sign, cut in
    g.ring(0.4, 0.58, 0.14, w=0.05, on=False)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        g.line([(0.4 + math.cos(a) * 0.1, 0.58 + math.sin(a) * 0.1), (0.4 + math.cos(a) * 0.19, 0.58 + math.sin(a) * 0.19)], w=0.045, on=False)


def g_agents(g):
    # a hooded figure (the clan agents) with a spark of the round sign at the brow
    g.poly([(0.5, 0.04), (0.78, 0.3), (0.84, 0.62), (0.98, 0.96), (0.02, 0.96), (0.16, 0.62), (0.22, 0.3)])
    g.d.ellipse((*g.p(0.32, 0.26), *g.p(0.68, 0.66)), fill=0)
    g.circle(0.5, 0.47, 0.13)
    g.d.chord((*g.p(0.3, 0.68), *g.p(0.7, 1.1)), 180, 360, fill=0)
    g.star4(0.5, 0.82, 0.1)


def g_log(g):
    g.rrect(0.14, 0.06, 0.86, 0.94, 0.08)
    for i, y in enumerate((0.3, 0.5, 0.7)):
        g.circle(0.3, y, 0.045, on=False)
        g.line([(0.42, y), (0.72 - 0.08 * (i == 2), y)], w=0.06, on=False)


def g_close(g):
    g.line([(0.2, 0.2), (0.8, 0.8)], w=0.13)
    g.line([(0.8, 0.2), (0.2, 0.8)], w=0.13)


def g_back(g):
    g.line([(0.52, 0.18), (0.2, 0.5), (0.52, 0.82)], w=0.12)
    g.line([(0.24, 0.5), (0.84, 0.5)], w=0.12)


def _speaker(g):
    g.rrect(0.06, 0.36, 0.28, 0.64, 0.03)
    g.poly([(0.22, 0.36), (0.5, 0.14), (0.5, 0.86), (0.22, 0.64)])


def g_sound_on(g):
    _speaker(g)
    g.arc(0.5, 0.5, 0.2, -50, 50, w=0.07)
    g.arc(0.5, 0.5, 0.36, -50, 50, w=0.07)


def g_sound_off(g):
    _speaker(g)
    g.line([(0.64, 0.36), (0.9, 0.64)], w=0.09)
    g.line([(0.9, 0.36), (0.64, 0.64)], w=0.09)


def _cloud(g, y=0.0):
    g.circle(0.36, 0.42 + y, 0.17)
    g.circle(0.6, 0.34 + y, 0.21)
    g.circle(0.78, 0.48 + y, 0.14)
    g.rrect(0.14, 0.42 + y, 0.9, 0.62 + y, 0.1)


def g_weather_rain(g):
    _cloud(g, -0.06)
    for x in (0.3, 0.52, 0.74):
        g.line([(x, 0.68), (x - 0.07, 0.88)], w=0.065)


def g_weather_fog(g):
    _cloud(g, -0.1)
    g.line([(0.12, 0.66), (0.76, 0.66)], w=0.065)
    g.line([(0.26, 0.8), (0.9, 0.8)], w=0.065)
    g.line([(0.16, 0.94), (0.56, 0.94)], w=0.065)


def g_weather_night(g):
    g.circle(0.44, 0.54, 0.36)
    g.circle(0.64, 0.4, 0.31, on=False)
    g.star4(0.76, 0.2, 0.13)
    g.star4(0.86, 0.56, 0.07)


def g_heroine_switch(g):
    pa = g.arc(0.5, 0.5, 0.34, 150, 20, w=0.085, caps=False)
    pb = g.arc(0.5, 0.5, 0.34, -30, -160, w=0.085, caps=False)
    for (x, y), (px, py) in ((pa[-1], pa[-2]), (pb[-1], pb[-2])):
        dx, dy = x - px, y - py
        ln = math.hypot(dx, dy)
        dx, dy = dx / ln, dy / ln
        nx, ny = -dy, dx
        g.poly([(x + dx * 0.13, y + dy * 0.13), (x + nx * 0.11, y + ny * 0.11), (x - nx * 0.11, y - ny * 0.11)])
    g.circle(pa[0][0], pa[0][1], 0.0425)
    g.circle(pb[0][0], pb[0][1], 0.0425)
    g.star4(0.5, 0.5, 0.13)


ICONS = [("quest", g_quest), ("altar", g_altar), ("help", g_help), ("controls", g_controls), ("chat", g_chat),
         ("players", g_players), ("bag", g_bag), ("map", g_map), ("settings", g_settings), ("camera", g_camera),
         ("profile", g_profile), ("achievements", g_achievements), ("nfts", g_nfts), ("agents", g_agents), ("log", g_log),
         ("close", g_close), ("back", g_back), ("sound_on", g_sound_on), ("sound_off", g_sound_off),
         ("weather_rain", g_weather_rain), ("weather_fog", g_weather_fog), ("weather_night", g_weather_night),
         ("heroine_switch", g_heroine_switch)]


# ------------------------------------------------------------------ look

def vgrad(top, bottom, y0=0, y1=S):
    im = Image.new("RGB", (S, S))
    px = im.load()
    for y in range(S):
        t = min(1.0, max(0.0, (y - y0) / max(1, y1 - y0)))
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(S):
            px[x, y] = c
    return im


GOLD = vgrad((255, 238, 176), (196, 128, 40), int(S * 0.15), int(S * 0.85))
FRAME_GOLD = vgrad((246, 214, 140), (150, 96, 34))
TILE = vgrad((34, 50, 64), (10, 15, 22))


def solid(c, mask):
    im = Image.new("RGBA", (S, S), c)
    im.putalpha(ImageChops.multiply(mask, Image.new("L", (S, S), c[3] if len(c) > 3 else 255)))
    return im


def glyph_layer(mask, outline=10, glow=16):
    """Gold glyph with a dark outline, a top highlight and a warm glow, on transparency."""
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    glow_m = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(glow))
    out.alpha_composite(solid((255, 176, 72, 120), glow_m))
    edge = mask.filter(ImageFilter.MaxFilter(outline * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2))
    out.alpha_composite(solid((22, 13, 5, 235), edge))
    g = GOLD.copy().convert("RGBA")
    g.putalpha(mask.filter(ImageFilter.GaussianBlur(0.8)))
    out.alpha_composite(g)
    shifted = ImageChops.offset(mask, 0, 7)
    hi = ImageChops.subtract(mask, shifted).filter(ImageFilter.GaussianBlur(1.5))
    out.alpha_composite(solid((255, 250, 225, 170), hi))
    low = ImageChops.subtract(mask, ImageChops.offset(mask, 0, -6)).filter(ImageFilter.GaussianBlur(1.5))
    out.alpha_composite(solid((120, 70, 20, 120), low))
    return out


def tile_layer():
    m = 10
    shape = Image.new("L", (S, S), 0)
    ImageDraw.Draw(shape).rounded_rectangle((m, m, S - m, S - m), radius=int(S * 0.2), fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    t = TILE.copy().convert("RGBA")
    t.putalpha(shape)
    out.alpha_composite(t)
    # a soft lift in the middle, behind the glyph
    lift = Image.new("L", (S, S), 0)
    ImageDraw.Draw(lift).ellipse((S * 0.18, S * 0.12, S * 0.82, S * 0.76), fill=90)
    lift = ImageChops.multiply(lift.filter(ImageFilter.GaussianBlur(S * 0.09)), shape)
    out.alpha_composite(solid((70, 104, 120, 255), lift))
    # the gold bevel frame and a dark inner line
    ring = Image.new("L", (S, S), 0)
    ImageDraw.Draw(ring).rounded_rectangle((m, m, S - m, S - m), radius=int(S * 0.2), outline=255, width=int(S * 0.04))
    f = FRAME_GOLD.copy().convert("RGBA")
    f.putalpha(ring.filter(ImageFilter.GaussianBlur(0.8)))
    out.alpha_composite(f)
    inner = Image.new("L", (S, S), 0)
    k = m + int(S * 0.04)
    ImageDraw.Draw(inner).rounded_rectangle((k, k, S - k, S - k), radius=int(S * 0.17), outline=255, width=3)
    out.alpha_composite(solid((8, 10, 14, 200), inner))
    top = Image.new("L", (S, S), 0)
    ImageDraw.Draw(top).rounded_rectangle((m + 4, m + 4, S - m - 4, S - m - 4), radius=int(S * 0.19), outline=255, width=3)
    top = ImageChops.multiply(top, vgrad((255, 255, 255), (0, 0, 0), m, S // 2).convert("L"))
    out.alpha_composite(solid((255, 246, 214, 150), top))
    return out


def altar_badge(im):
    """The empty timer badge slot on the altar icon: a dark disc with a gold rim at the top right."""
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    cx, cy, r = S * 0.79, S * 0.21, S * 0.15
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    im.alpha_composite(solid((20, 12, 6, 255), m.filter(ImageFilter.MaxFilter(9))))
    rim = Image.new("L", (S, S), 0)
    ImageDraw.Draw(rim).ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=int(S * 0.025))
    f = FRAME_GOLD.copy().convert("RGBA")
    f.putalpha(rim)
    im.alpha_composite(f)
    inner = Image.new("L", (S, S), 0)
    ImageDraw.Draw(inner).ellipse((cx - r * 0.82, cy - r * 0.82, cx + r * 0.82, cy + r * 0.82), fill=255)
    im.alpha_composite(solid((34, 50, 64, 255), inner))


def shrink(im, s):
    out = im.resize((s, s), Image.LANCZOS)
    if s <= 32:
        a = out.getchannel("A")
        rgb = out.convert("RGB").filter(ImageFilter.UnsharpMask(radius=0.6, percent=70, threshold=1))
        rgb.putalpha(a)
        out = rgb
    return out


def main(repo):
    dst = os.path.join(repo, "game/public/assets/ui/icons/hud")
    docs = os.path.join(repo, "docs/art/ui")
    os.makedirs(dst, exist_ok=True)
    os.makedirs(docs, exist_ok=True)
    tile = tile_layer()
    made = []
    for name, fn in ICONS:
        g = G((0.2, 0.2, 0.8, 0.8))
        fn(g)
        im = tile.copy()
        im.alpha_composite(glyph_layer(g.m, outline=9, glow=14))
        if name == "altar":
            altar_badge(im)
        bare = G((0.07, 0.07, 0.93, 0.93))
        fn(bare)
        gl = glyph_layer(bare.m, outline=13, glow=18)
        for s in SIZES:
            for suffix, src in (("", im), ("_glyph", gl)):
                sm = shrink(src, s)
                sm.save(os.path.join(dst, f"{name}{suffix}_{s}.png"), optimize=True)
                sm.save(os.path.join(dst, f"{name}{suffix}_{s}.webp"), quality=94, method=6)
        made.append((name, im, gl))
        print("icon", name)
    # the sheet: every icon at 96 (tile + glyph) with its name, then a strip at 32 and 24 on dark and light
    cols = 6
    cw, ch = 250, 170
    rows = math.ceil(len(made) / cols)
    sheet = Image.new("RGB", (cols * cw + 40, rows * ch + 260), (24, 27, 33))
    d = ImageDraw.Draw(sheet)
    for i, (name, im, gl) in enumerate(made):
        x, y = 20 + (i % cols) * cw, 20 + (i // cols) * ch
        a, b = shrink(im, 96), shrink(gl, 96)
        sheet.paste(a, (x, y), a)
        sheet.paste(b, (x + 110, y), b)
        d.text((x, y + 104), name, fill=(220, 210, 190))
    y = 40 + rows * ch
    for j, bg in enumerate([(24, 27, 33), (226, 220, 206), (70, 92, 70)]):
        d.rectangle((20, y + j * 70 - 6, cols * cw + 20, y + j * 70 + 54), fill=bg)
        for i, (name, im, gl) in enumerate(made):
            for k, s in enumerate((32, 24)):
                src = shrink(im if k == 0 else gl, s)
                sheet.paste(src, (30 + i * 62 + k * 34, y + j * 70 + (0 if s == 32 else 8)), src)
    d.text((20, y - 24), "at 32 px (tile) and 24 px (glyph only) on dark, light and a green field", fill=(220, 210, 190))
    sheet.save(os.path.join(docs, "hud_icons_sheet.jpg"), quality=90)
    print("sheet", os.path.join(docs, "hud_icons_sheet.jpg"), len(made), "icons")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

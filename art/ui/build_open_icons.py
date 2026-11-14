"""Open icon set (designer request 14.11, docs: F:/Hackaton-art-requests/icons-for-designer-14nov.md).

Silhouettes from game-icons.net (github.com/game-icons/icons, CC BY 3.0, authors credited in the README), recoloured
into the HUD family by build_hud_icons.py (gold glyph with a dark outline and a warm glow on a dark bevelled tile).
A few are composed from two silhouettes (a padlock on crossed swords, a cut through linked rings). The app icon and
splash are drawn from the game's own logo (game/public/favicon.svg).

    python art/ui/build_open_icons.py [repo_root] [--cache DIR]

Writes:
  docs/art/requests/in/icons/<name>.png            512x512 tile on transparency (+ app_icon 1024, app_splash 2048)
  game/public/assets/ui/icons/open/<name>_{48,96}.webp and <name>_glyph_{48,96}.webp
  game/public/icons/app-{180,192,512}.png          the installable game's icons (manifest.webmanifest)
  docs/art/ui/open_icons_sheet.jpg                 review sheet
Needs Pillow and numpy; downloads the SVGs once into the cache (default: the system temp dir).
"""
import math
import os
import re
import sys
import tempfile
import urllib.request

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_hud_icons as hud  # noqa: E402  (the HUD style: glyph_layer, tile_layer, shrink)

S = hud.S
RAW = "https://raw.githubusercontent.com/game-icons/icons/master/"

# name -> layers: (svg | "cut-circle" | "cut-band", box in glyph units (x0, y0, x1, y1), extra)
ICONS = [
    ("act_blade_series", [("lorc/crossed-slashes", (0, 0, 1, 1))]),
    ("act_heavy_strike", [("delapouite/sword-brandish", (0, 0, 1, 1))]),
    ("act_roll", [("felbrigg/dodge", (0, 0, 1, 1))]),
    ("act_ice_breath_warning", [("lorc/dragon-breath", (0, 0, 1, 1))]),
    ("status_frost", [("lorc/snowflake-2", (0, 0, 1, 1))]),
    ("status_stagger", [("delapouite/knocked-out-stars", (0, 0, 1, 1))]),
    ("status_shield", [("lorc/checked-shield", (0, 0, 1, 1))]),
    ("status_heal", [("delapouite/healing", (0, 0, 1, 1))]),
    ("status_haste", [("lorc/wingfoot", (0, 0, 1, 1))]),
    ("quest_available", [("badges/exclamation", (-0.25, -0.12, 1.25, 1.12))]),
    ("quest_turn_in", [("badges/question", (-0.25, -0.12, 1.25, 1.12))]),
    ("map_shop", [("delapouite/shop", (0, 0, 1, 1))]),
    ("map_inn", [("delapouite/tavern-sign", (0, 0, 1, 1))]),
    ("map_scribe", [("delapouite/scroll-quill", (0, 0, 1, 1))]),
    ("map_altar", [("delapouite/sword-altar", (0, 0, 1, 1))]),
    ("map_gate_loom", [("lorc/magic-gate", (0, 0, 1, 1))]),
    ("map_portal", [("lorc/portal", (0, 0, 1, 1))]),
    ("tournament_locked", [("lorc/crossed-swords", (0, 0, 0.86, 0.86)), ("cut-circle", (0.47, 0.47, 1.05, 1.05)),
                           ("lorc/padlock", (0.52, 0.52, 1.0, 1.0))]),
    ("spider_counter", [("carl-olsen/spider-face", (0, 0, 1, 1))]),
    ("player_other", [("delapouite/meeple", (0, 0, 1, 1))]),
    ("party_join", [("delapouite/meeple", (0, 0, 0.86, 0.86)), ("cut-circle", (0.5, 0.5, 1.06, 1.06)),
                    ("badges/plus", (0.42, 0.42, 1.14, 1.14))]),
    ("party_leave", [("delapouite/exit-door", (0, 0, 1, 1))]),
    ("account_email", [("lorc/envelope", (0, 0, 1, 1))]),
    ("account_wallet", [("delapouite/wallet", (0, 0, 1, 1))]),
    ("account_link", [("lorc/linked-rings", (0, 0, 1, 1))]),
    ("account_unlink", [("lorc/linked-rings", (0, 0, 1, 1)), ("cut-band", (0, 0, 1, 1))]),
]

# ---------------------------------------------------------------- SVG path -> mask (nonzero winding, Pillow + numpy)

NUM = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


class PathReader:
    def __init__(self, d):
        self.d, self.i = d, 0

    def skip(self):
        while self.i < len(self.d) and self.d[self.i] in " ,\t\r\n":
            self.i += 1

    def cmd(self):
        self.skip()
        if self.i < len(self.d) and self.d[self.i].isalpha():
            self.i += 1
            return self.d[self.i - 1]
        return None

    def more(self):
        self.skip()
        return self.i < len(self.d) and not self.d[self.i].isalpha()

    def num(self):
        self.skip()
        m = NUM.match(self.d, self.i)
        if not m:
            raise ValueError("bad path at %d: %r" % (self.i, self.d[self.i:self.i + 20]))
        self.i = m.end()
        return float(m.group())

    def flag(self):
        self.skip()
        c = self.d[self.i]
        self.i += 1
        return c == "1"


def _arc(p0, rx, ry, phi, large, sweep, p1):
    """SVG endpoint arc -> points (spec F.6.5)."""
    if rx == 0 or ry == 0:
        return [p1]
    rx, ry = abs(rx), abs(ry)
    cp, sp = math.cos(math.radians(phi)), math.sin(math.radians(phi))
    dx, dy = (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2
    x1, y1 = cp * dx + sp * dy, -sp * dx + cp * dy
    lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    co = math.sqrt(max(0.0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)))
    if large == sweep:
        co = -co
    cx1, cy1 = co * rx * y1 / ry, -co * ry * x1 / rx
    cx, cy = cp * cx1 - sp * cy1 + (p0[0] + p1[0]) / 2, sp * cx1 + cp * cy1 + (p0[1] + p1[1]) / 2
    ang = lambda ux, uy, vx, vy: math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    t0 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    elif sweep and dt < 0:
        dt += 2 * math.pi
    n = max(4, int(abs(dt) / (math.pi / 32)))
    out = []
    for k in range(1, n + 1):
        t = t0 + dt * k / n
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        out.append((cp * ex - sp * ey + cx, sp * ex + cp * ey + cy))
    return out


def _bez(pts, n=16):
    out = []
    for k in range(1, n + 1):
        t = k / n
        if len(pts) == 3:
            a, b, c = pts
            out.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]))
        else:
            a, b, c, d = pts
            u = 1 - t
            out.append((u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
                        u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1]))
    return out


def path_polys(d):
    """Flattens an SVG path into closed polygons (one per subpath)."""
    r, polys, cur, start, pos, last_c, last_q, c = PathReader(d), [], [], (0, 0), (0, 0), None, None, None
    while True:
        nc = r.cmd()
        if nc is None:
            if not r.more():
                break
        else:
            c = nc
        rel, C = c.islower(), c.upper()
        if C == "Z":
            if cur:
                polys.append(cur)
            cur, pos, last_c, last_q = [], start, None, None
            continue
        ox, oy = pos if rel else (0, 0)
        if C == "M":
            if cur:
                polys.append(cur)
            pos = (ox + r.num(), oy + r.num())
            start, cur = pos, [pos]
            c = "l" if rel else "L"  # further pairs are line-tos
            last_c = last_q = None
            continue
        if C == "L":
            pos = (ox + r.num(), oy + r.num()); cur.append(pos); last_c = last_q = None
        elif C == "H":
            pos = ((ox if rel else 0) + r.num(), pos[1]); cur.append(pos); last_c = last_q = None
        elif C == "V":
            pos = (pos[0], (oy if rel else 0) + r.num()); cur.append(pos); last_c = last_q = None
        elif C in "CS":
            if C == "C":
                c1 = (ox + r.num(), oy + r.num())
            else:
                c1 = (2 * pos[0] - last_c[0], 2 * pos[1] - last_c[1]) if last_c else pos
            c2 = (ox + r.num(), oy + r.num()); p = (ox + r.num(), oy + r.num())
            cur += _bez([pos, c1, c2, p]); pos, last_c, last_q = p, c2, None
        elif C in "QT":
            if C == "Q":
                q = (ox + r.num(), oy + r.num())
            else:
                q = (2 * pos[0] - last_q[0], 2 * pos[1] - last_q[1]) if last_q else pos
            p = (ox + r.num(), oy + r.num())
            cur += _bez([pos, q, p]); pos, last_q, last_c = p, q, None
        elif C == "A":
            rx, ry, phi, large, sweep = r.num(), r.num(), r.num(), r.flag(), r.flag()
            p = (ox + r.num(), oy + r.num())
            cur += _arc(pos, rx, ry, phi, large, sweep, p); pos, last_c, last_q = p, None, None
        else:
            raise ValueError("path command %r" % c)
        if not cur:
            cur = [pos]
    if cur:
        polys.append(cur)
    return [p for p in polys if len(p) >= 3]


def svg_mask(svg, size):
    """The white (#fff) paths of a game-icons SVG as an L mask of size x size, antialiased."""
    vb = re.search(r'viewBox="([^"]+)"', svg)
    vx, vy, vw, vh = [float(v) for v in vb.group(1).split()] if vb else (0, 0, 512, 512)
    big = size * 2
    k = big / max(vw, vh)
    acc = np.zeros((big, big), np.int16)
    for m in re.finditer(r"<path([^>]*)/>", svg):
        attrs = m.group(1)
        if 'fill="#fff"' not in attrs:
            continue  # the black background square
        d = re.search(r'\sd="([^"]+)"', attrs).group(1)
        for poly in path_polys(d):
            pts = [((x - vx) * k, (y - vy) * k) for x, y in poly]
            area = sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))
            im = Image.new("L", (big, big), 0)
            ImageDraw.Draw(im).polygon(pts, fill=255)
            acc += (np.asarray(im) > 127).astype(np.int16) * (1 if area > 0 else -1)
    out = Image.fromarray(((acc != 0) * 255).astype(np.uint8), "L")
    return out.resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------- composition

def fetch(src, cache):
    path = os.path.join(cache, src.replace("/", "__") + ".svg")
    if not os.path.exists(path):
        req = urllib.request.Request(RAW + src + ".svg", headers={"User-Agent": "icon-build"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        with open(path, "wb") as f:
            f.write(data)
    with open(path, encoding="utf-8") as f:
        return f.read()


def glyph_mask(layers, box, cache):
    """Composes the layers into one S x S mask, the glyph unit square mapped onto `box` (fractions of S)."""
    gx0, gy0, gk = box[0] * S, box[1] * S, (box[2] - box[0]) * S
    m = Image.new("L", (S, S), 0)
    for src, (x0, y0, x1, y1) in layers:
        a = (int(round(gx0 + x0 * gk)), int(round(gy0 + y0 * gk)))
        w = int(round((x1 - x0) * gk))
        if src == "cut-circle":
            hole = Image.new("L", (S, S), 0)
            ImageDraw.Draw(hole).ellipse((a[0], a[1], a[0] + w, a[1] + w), fill=255)
            m = ImageChops.subtract(m, hole)
        elif src == "cut-band":
            band = Image.new("L", (S, S), 0)
            ImageDraw.Draw(band).line((a[0] + w * 0.12, a[1] + w * 0.88, a[0] + w * 0.88, a[1] + w * 0.12), fill=255, width=int(w * 0.16))
            m = ImageChops.subtract(m, band)
            ImageDraw.Draw(m).line((a[0] + w * 0.16, a[1] + w * 0.84, a[0] + w * 0.84, a[1] + w * 0.16), fill=255, width=max(2, int(w * 0.05)))
        else:
            piece = svg_mask(fetch(src, cache), w)
            layer = Image.new("L", (S, S), 0)
            layer.paste(piece, a)
            m = ImageChops.lighter(m, layer)
    return m


# ---------------------------------------------------------------- the app icon and splash (the logo: favicon.svg)

LOGO_BG = (20, 26, 28)
LOGO_GOLD, LOGO_CORE = (228, 194, 114), (246, 223, 155)


def logo(size, scale, bg=True):
    """favicon.svg's drawing (64 units: a ring, a centre dot, the arc above, the chevron right) at `scale` of the canvas."""
    k = 4
    big = size * k
    im = Image.new("RGBA", (big, big), LOGO_BG + (255,) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = big * scale / 64
    o = big * (1 - scale) / 2
    P = lambda x, y: (o + x * u, o + y * u)
    sw = 4 * u
    cx, cy = P(32, 32)
    d.ellipse((cx - 19 * u - sw / 2, cy - 19 * u - sw / 2, cx + 19 * u + sw / 2, cy + 19 * u + sw / 2), outline=LOGO_GOLD, width=int(sw))
    d.ellipse((cx - 4 * u, cy - 4 * u, cx + 4 * u, cy + 4 * u), fill=LOGO_CORE)
    w2 = 3.5 * u
    arc = [P((1 - t) ** 2 * 26 + 2 * (1 - t) * t * 32 + t * t * 38, (1 - t) ** 2 * 9 + 2 * (1 - t) * t * 4 + t * t * 9) for t in [i / 24 for i in range(25)]]
    chev = [P(55, 26), P(59, 32), P(55, 38)]
    for line in (arc, chev):
        d.line(line, fill=LOGO_GOLD, width=int(w2), joint="curve")
        for x, y in (line[0], line[-1]):
            d.ellipse((x - w2 / 2, y - w2 / 2, x + w2 / 2, y + w2 / 2), fill=LOGO_GOLD)
    return im.resize((size, size), Image.LANCZOS)


def font(px):
    for f in ("C:/Windows/Fonts/georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "/Library/Fonts/Georgia.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, px)
    return ImageFont.load_default()


def splash(size):
    im = Image.new("RGBA", (size, size), LOGO_BG + (255,))
    glow = Image.new("L", (size, size), 0)
    ImageDraw.Draw(glow).ellipse((size * 0.25, size * 0.18, size * 0.75, size * 0.68), fill=70)
    tint = Image.new("RGBA", (size, size), (120, 96, 48, 255))
    tint.putalpha(glow.filter(ImageFilter.GaussianBlur(size * 0.08)))
    im.alpha_composite(tint)
    mark = logo(int(size * 0.42), 0.9, bg=False)
    im.alpha_composite(mark, (int(size * 0.29), int(size * 0.2)))
    d = ImageDraw.Draw(im)
    f = font(int(size * 0.062))
    t = "Forget to Foresee"
    w = d.textlength(t, font=f)
    d.text(((size - w) / 2, size * 0.68), t, font=f, fill=(238, 226, 196))
    return im


# ---------------------------------------------------------------- main

def main(repo, cache):
    req = os.path.join(repo, "docs/art/requests/in/icons")
    dst = os.path.join(repo, "game/public/assets/ui/icons/open")
    app = os.path.join(repo, "game/public/icons")
    docs = os.path.join(repo, "docs/art/ui")
    for p in (req, dst, app, docs, cache):
        os.makedirs(p, exist_ok=True)
    tile = hud.tile_layer()
    made = []
    for name, layers in ICONS:
        im = tile.copy()
        im.alpha_composite(hud.glyph_layer(glyph_mask(layers, (0.2, 0.2, 0.8, 0.8), cache), outline=9, glow=14))
        gl = hud.glyph_layer(glyph_mask(layers, (0.08, 0.08, 0.92, 0.92), cache), outline=13, glow=18)
        im.save(os.path.join(req, name + ".png"), optimize=True)
        for s in (48, 96):
            for suffix, src in (("", im), ("_glyph", gl)):
                hud.shrink(src, s).save(os.path.join(dst, f"{name}{suffix}_{s}.webp"), quality=92, method=6)
        made.append((name, im, gl))
        print("icon", name)
    icon = logo(1024, 0.8)
    icon.save(os.path.join(req, "app_icon.png"), optimize=True)
    for s in (180, 192, 512):
        icon.resize((s, s), Image.LANCZOS).save(os.path.join(app, f"app-{s}.png"), optimize=True)
    splash(2048).save(os.path.join(req, "app_splash.png"), optimize=True)
    print("app icon + splash")
    cols, cw, ch = 6, 250, 170
    rows = math.ceil(len(made) / cols)
    sheet = Image.new("RGB", (cols * cw + 40, rows * ch + 40), (24, 27, 33))
    d = ImageDraw.Draw(sheet)
    for i, (name, im, gl) in enumerate(made):
        x, y = 20 + (i % cols) * cw, 20 + (i // cols) * ch
        a, b = hud.shrink(im, 96), hud.shrink(gl, 96)
        sheet.paste(a, (x, y), a)
        sheet.paste(b, (x + 110, y), b)
        d.text((x, y + 104), name, fill=(220, 210, 190))
    sheet.save(os.path.join(docs, "open_icons_sheet.jpg"), quality=90)
    print("sheet", os.path.join(docs, "open_icons_sheet.jpg"))


if __name__ == "__main__":
    args = sys.argv[1:]
    cache = os.path.join(tempfile.gettempdir(), "ftf-game-icons")
    if "--cache" in args:
        i = args.index("--cache")
        cache = args[i + 1]
        del args[i:i + 2]
    main(args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."), cache)

"""The GPT tray icon family (owner, 14.11 night) shipped in the HUD raster style.

The masters (docs/art/requests/in/hud/<name>_1024.png: white outline strokes on transparency, spec in
docs/art/requests/gpt-icons-hud.md) become the same gold-on-dark set as build_hud_icons.py: a tile version and a
glyph-only version at 24/32/48/96 px. The stroke is read from the master's alpha (or its brightness when it has no
alpha), cropped to its ink, centred in the glyph box and thickened to the house stroke so it holds at 24 px.

    python3 art/ui/build_hud_icons_gpt.py [repo_root]

Writes game/public/assets/ui/icons/hud/<name>_{24,32,48,96}.{webp,png} and <name>_glyph_*, and
docs/art/ui/hud_icons_gpt_sheet.jpg. Needs Pillow only.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_hud_icons import S, SIZES, glyph_layer, shrink, tile_layer  # noqa: E402

NAMES = ("bag", "character", "map", "journal", "settings", "menu", "skills", "market")
TARGET_STROKE = 0.085 * 0.6 * S   # the house stroke (build_hud_icons W) in tile-glyph pixels


def ink(path):
    """The stroke mask of a master, cropped to its ink (L, 0..255)."""
    im = Image.open(path)
    if im.mode in ("RGBA", "LA") or "transparency" in im.info:
        m = im.convert("RGBA").getchannel("A")
    else:
        m = im.convert("L")
    m = m.point(lambda v: 255 if v > 110 else 0)
    box = m.getbbox()
    return m.crop(box) if box else m


def stroke_px(m):
    """A rough stroke width: ink area over the length of its skeleton is hard without numpy, so use erosion steps."""
    steps, cur = 0, m
    while cur.getbbox() and steps < 200:
        cur = cur.filter(ImageFilter.MinFilter(3))
        steps += 1
    return max(1, 2 * steps)


def place(m, box):
    """The ink fitted into box (unit coordinates of the S canvas), centred, keeping its aspect."""
    x0, y0, x1, y1 = (int(v * S) for v in box)
    w, h = x1 - x0, y1 - y0
    k = min(w / m.width, h / m.height)
    stroke = stroke_px(m) * k
    sm = m.resize((max(1, round(m.width * k)), max(1, round(m.height * k))), Image.LANCZOS)
    out = Image.new("L", (S, S), 0)
    out.paste(sm, (x0 + (w - sm.width) // 2, y0 + (h - sm.height) // 2))
    want = TARGET_STROKE * (x1 - x0) / (0.6 * S)
    grow = int(round((want - stroke) / 2))
    if grow > 0:
        out = out.filter(ImageFilter.MaxFilter(2 * grow + 1))
    return out.point(lambda v: 255 if v > 100 else 0).filter(ImageFilter.GaussianBlur(0.6)), stroke, want


def main(repo):
    src = os.path.join(repo, "docs/art/requests/in/hud")
    dst = os.path.join(repo, "game/public/assets/ui/icons/hud")
    docs = os.path.join(repo, "docs/art/ui")
    os.makedirs(dst, exist_ok=True)
    os.makedirs(docs, exist_ok=True)
    tile = tile_layer()
    made = []
    for name in NAMES:
        m = ink(os.path.join(src, name + "_1024.png"))
        tm, st, want = place(m, (0.2, 0.2, 0.8, 0.8))
        im = tile.copy()
        im.alpha_composite(glyph_layer(tm, outline=9, glow=14))
        gm, _, _ = place(m, (0.07, 0.07, 0.93, 0.93))
        gl = glyph_layer(gm, outline=13, glow=18)
        for s in SIZES:
            for suffix, layer in (("", im), ("_glyph", gl)):
                sm = shrink(layer, s)
                sm.save(os.path.join(dst, f"{name}{suffix}_{s}.png"), optimize=True)
                sm.save(os.path.join(dst, f"{name}{suffix}_{s}.webp"), quality=94, method=6)
        made.append((name, im, gl))
        print("icon", name, "stroke", round(st, 1), "->", round(want, 1))
    # the check sheet: 96 px tile and glyph, then 24 px on the scene's dark green-black and on the town's dusk
    cw = 230
    sheet = Image.new("RGB", (len(made) * cw + 40, 330), (16, 31, 26))
    d = ImageDraw.Draw(sheet)
    for i, (name, im, gl) in enumerate(made):
        x = 20 + i * cw
        a, b = shrink(im, 96), shrink(gl, 96)
        sheet.paste(a, (x, 20), a)
        sheet.paste(b, (x + 104, 20), b)
        d.text((x, 124), name, fill=(220, 210, 190))
        for j, bg in enumerate([(16, 31, 26), (62, 70, 84)]):
            d.rectangle((x, 160 + j * 70, x + 200, 210 + j * 70), fill=bg)
            for k, s in enumerate((24, 32)):
                c = shrink(gl, s)
                sheet.paste(c, (x + 10 + k * 50, 170 + j * 70), c)
    sheet.save(os.path.join(docs, "hud_icons_gpt_sheet.jpg"), quality=90)
    print("sheet", os.path.join(docs, "hud_icons_gpt_sheet.jpg"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

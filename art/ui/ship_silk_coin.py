"""Ship the silk coin renders (art/ui/build_silk_coin.py) for the client and the sheet.

    python3 art/ui/ship_silk_coin.py <render_dir> <repo_root>

Writes game/public/assets/ui/icons/silk_coin_{24,48,96,192}.{webp,png} (transparent; the small sizes get a light
unsharp pass so the rim and the sign hold at 24 px), silk_coin_spin.{webp,png} (8 frames of 96 px side by side,
a half turn that loops: frame i is at 22.5 * i degrees) and docs/art/ui/silk_coin_sheet.jpg.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

src, repo = sys.argv[1], sys.argv[2]
icons = os.path.join(repo, "game/public/assets/ui/icons")
docs = os.path.join(repo, "docs/art/ui")
os.makedirs(icons, exist_ok=True)
os.makedirs(docs, exist_ok=True)


def trim(im):
    """Square crop around the coin with a 2 % margin (the render frames it loosely)."""
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    half = max(box[2] - box[0], box[3] - box[1]) / 2 * 1.02
    return im.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))


def size(im, s):
    out = im.resize((s, s), Image.LANCZOS)
    if s <= 48:
        rgb = out.convert("RGB").filter(ImageFilter.UnsharpMask(radius=0.8, percent=60, threshold=1))
        rgb.putalpha(out.getchannel("A"))
        out = rgb
    return out


front = trim(Image.open(os.path.join(src, "coin_front.png")).convert("RGBA"))
for s in (24, 48, 96, 192):
    im = size(front, s)
    im.save(os.path.join(icons, f"silk_coin_{s}.png"), optimize=True)
    im.save(os.path.join(icons, f"silk_coin_{s}.webp"), quality=92, method=6)
# the spin: every frame cropped with the box of the front view so the coin does not jump
box_ref = Image.open(os.path.join(src, "coin_front.png")).getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
cx, cy = (box_ref[0] + box_ref[2]) / 2, (box_ref[1] + box_ref[3]) / 2
half = max(box_ref[2] - box_ref[0], box_ref[3] - box_ref[1]) / 2 * 1.02
frames = []
for f in range(8):
    im = Image.open(os.path.join(src, f"coin_spin_{f}.png")).convert("RGBA")
    frames.append(im.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half))).resize((96, 96), Image.LANCZOS))
strip = Image.new("RGBA", (96 * 8, 96), (0, 0, 0, 0))
for i, fr in enumerate(frames):
    strip.alpha_composite(fr, (96 * i, 0))
strip.save(os.path.join(icons, "silk_coin_spin.png"), optimize=True)
strip.save(os.path.join(icons, "silk_coin_spin.webp"), quality=92, method=6)

# the sheet: the coin large, the four sizes on dark and light, the spin strip, a HUD-like counter mock
W, H = 1600, 900
sheet = Image.new("RGB", (W, H), (30, 33, 40))
d = ImageDraw.Draw(sheet)
big = front.resize((560, 560), Image.LANCZOS)
sheet.paste(big, (40, 40), big)
x = 660
for s in (192, 96, 48, 24):
    for j, bg in enumerate([(30, 33, 40), (238, 232, 220)]):
        tile = Image.new("RGB", (s + 16, s + 16), bg)
        im = Image.open(os.path.join(icons, f"silk_coin_{s}.png"))
        tile.paste(im, (8, 8), im)
        sheet.paste(tile, (x, 40 + j * 230))
    x += s + 40
y = 520
for i, fr in enumerate(frames):
    tile = Image.new("RGB", (112, 112), (44, 48, 58))
    tile.paste(fr, (8, 8), fr)
    sheet.paste(tile, (660 + i * 116, y))
d.text((660, y - 22), "spin strip: 8 frames, a half turn that loops (silk_coin_spin.webp, 768 x 96)", fill=(210, 205, 195))
d.text((660, 20), "silk_coin_{192,96,48,24} on dark and light", fill=(210, 205, 195))
# a counter as the HUD might show it (24 px coin next to a number)
pill = Image.new("RGB", (220, 44), (18, 20, 26))
c24 = Image.open(os.path.join(icons, "silk_coin_24.png"))
pill.paste(c24, (12, 10), c24)
ImageDraw.Draw(pill).text((46, 15), "1 240  silk", fill=(240, 226, 196))
sheet.paste(pill, (660, 700))
d.text((660, 680), "at HUD size (24 px)", fill=(210, 205, 195))
d.text((40, 620), "Silk coin: woven ivory silk field, teal memory-thread in the groove,", fill=(210, 205, 195))
d.text((40, 640), "the round sign struck in gold on dark bronze enamel, milled gold rim.", fill=(210, 205, 195))
sheet.save(os.path.join(docs, "silk_coin_sheet.jpg"), quality=90)
print("shipped", sorted(os.listdir(icons)))

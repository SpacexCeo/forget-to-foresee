"""Compose the per-character turnaround sheets and the cast sheet from the qa_sheet.py renders (PIL).

    python3 qa_compose.py <renders_dir> <out_dir>
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cast import CAST, HAIR, ORDER, PALETTE, SKIN  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BG = (58, 56, 54)


def font(size, bold=False):
    return ImageFont.truetype(FB if bold else FR, size)


def srgb(c):
    return tuple(int(255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)) for x in c)


def colours(e):
    r = e["costume"]
    keys = []
    for v in r.values():
        if isinstance(v, tuple):
            keys += [k for k in v if k in PALETTE]
    seen = []
    for k in keys:
        if k not in seen:
            seen.append(k)
    return seen


def wrap(d, text, f, width):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]


def sheet(key):
    e = CAST[key]
    d0 = os.path.join(src, key)
    views = [Image.open(os.path.join(d0, n + ".jpg")) for n in ("front", "q", "side", "back")]
    face = Image.open(os.path.join(d0, "face.jpg"))
    facts = json.load(open(os.path.join(d0, "facts.json")))
    w, h = views[0].size
    W, H = w * 4 + face.width + 60, h + 40
    im = Image.new("RGB", (W, H), BG)
    for i, v in enumerate(views):
        im.paste(v, (20 + i * w, 20))
    x0 = 20 + 4 * w + 20
    im.paste(face, (x0, 20))
    d = ImageDraw.Draw(im)
    y = 20 + face.height + 14
    d.text((x0, y), e["name"], font=font(34, True), fill=(240, 232, 215))
    y += 44
    d.text((x0, y), e["role"], font=font(20), fill=(214, 160, 90))
    y += 32
    for ln in wrap(d, e["idea"], font(18), face.width):
        d.text((x0, y), ln, font=font(18), fill=(210, 205, 195))
        y += 24
    y += 8
    d.text((x0, y), f"height {e['height']:.2f} m   ·   key {key}", font=font(16), fill=(170, 166, 158))
    y += 30
    x = x0
    for k in ["skin:" + e["skin"], "hair:" + e["hair"][0]] + colours(e):
        if k.startswith("skin:"):
            c, lab = SKIN[k[5:]][0], "skin"
        elif k.startswith("hair:"):
            c, lab = HAIR[k[5:]], "hair"
        else:
            c, lab = PALETTE[k], k.replace("_", " ")
        if x + 96 > x0 + face.width:
            x, y = x0, y + 64
        d.rectangle((x, y, x + 88, y + 36), fill=srgb(c), outline=(20, 20, 20))
        d.text((x, y + 40), lab[:13], font=font(12), fill=(190, 186, 178))
        x += 98
    p = os.path.join(out, f"sheet_{key}.jpg")
    im.save(p, quality=90)
    return im, views[0], face


fronts, faces = [], []
for key in ORDER:
    _, f, fc = sheet(key)
    fronts.append(f)
    faces.append(fc)

# cast sheet: fronts at real relative heights, faces underneath
FACTS = {k: json.load(open(os.path.join(src, k, "facts.json"))) for k in ORDER}
tall = max(FACTS[k]["frame_m"] for k in ORDER)
cw, ch = 400, 760
fw = 400
W = cw * 6 + 40
H = 2 * (ch + fw + 86) + 90
im = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(im)
d.text((20, 16), "Forget to Foresee · townsfolk of the hill town · cast sheet v1 (N-001)", font=font(30, True), fill=(240, 232, 215))
for i, key in enumerate(ORDER):
    e = CAST[key]
    col, row = i % 6, i // 6
    x, y = 20 + col * cw, 70 + row * (ch + fw + 86)
    f = fronts[i]
    k = (ch * FACTS[key]["frame_m"] / tall) / f.height
    fr = f.resize((int(f.width * k), int(f.height * k)), Image.LANCZOS)
    im.paste(fr, (x + (cw - fr.width) // 2, y + ch - fr.height))
    fc = faces[i].resize((fw - 12, fw - 12), Image.LANCZOS)
    im.paste(fc, (x + 6, y + ch + 6))
    d.text((x + 8, y + ch + fw + 2), e["name"], font=font(22, True), fill=(240, 232, 215))
    d.text((x + 8, y + ch + fw + 30), e["role"][:38], font=font(15), fill=(214, 160, 90))
    d.text((x + 8, y + ch + fw + 52), f"{e['height']:.2f} m", font=font(14), fill=(170, 166, 158))
im.save(os.path.join(out, "cast_sheet.jpg"), quality=88)
print("ok", W, H)

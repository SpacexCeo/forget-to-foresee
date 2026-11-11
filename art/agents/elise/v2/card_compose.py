"""Elise v2: lays the model render (card.py) on a holographic card, like the NFT-001 cards.
    python3 card_compose.py <card.png> <out_named.webp> <out_token.webp>
Named card 600x900 with "Elise" (Day 1 flip, profile), token card 1200x1800 without a name. Background drawn here
(pastel iridescent bands), the frame a thin rounded line; the font is any sans available (DejaVu/Liberation)."""
import sys, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

src, out_named, out_token = sys.argv[1:4]
W, H = 1200, 1800
y, x = np.mgrid[0:H, 0:W].astype(float)
t = (x * 0.8 + y * 0.6) / 260.0 + 0.6 * np.sin(y / 410.0 + x / 900.0)
hue = np.stack([np.sin(t), np.sin(t + 2.1), np.sin(t + 4.2)], -1)
base = np.array([226, 222, 236], float)
bands = np.clip(np.sin((x * 0.55 + y * 0.9) / 95.0) * 0.5 + 0.5, 0, 1) ** 6
img = base + hue * 10 + bands[..., None] * (hue * 26 + 14)
bg = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)).convert('RGBA')
raw = Image.open(src).convert('RGBA').resize((W, H)); bb0 = raw.getbbox()
# she stands in the upper part, leaving the name band clear: her height scaled to 1450 px, feet at H - 250
k = 1450 / (bb0[3] - bb0[1]); cut = raw.crop(bb0); cut = cut.resize((int(cut.width * k), int(cut.height * k)), Image.LANCZOS)
fig = Image.new('RGBA', (W, H), (0, 0, 0, 0)); fig.paste(cut, ((W - cut.width) // 2, H - 250 - cut.height), cut)
# a soft shadow under her feet
sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(sh)
bb = fig.getbbox(); cx = (bb[0] + bb[2]) // 2
d.ellipse([cx - 230, bb[3] - 28, cx + 230, bb[3] + 22], fill=(40, 30, 60, 70)); sh = sh.filter(ImageFilter.GaussianBlur(14))
card = Image.alpha_composite(Image.alpha_composite(bg, sh), fig)
def frame(im, s):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=int(60 * s), fill=255)
    ImageDraw.Draw(im).rounded_rectangle([int(26 * s), int(26 * s), im.size[0] - int(26 * s), im.size[1] - int(26 * s)], radius=int(44 * s), outline=(150, 150, 165, 255), width=max(1, int(3 * s)))
    out = Image.new('RGBA', im.size, (0, 0, 0, 0)); out.paste(im, (0, 0), m); return out
token = frame(card.copy(), 1.0)
token.save(out_token, 'WEBP', quality=88, method=6)
named = card.copy()
fonts = sorted(glob.glob('/usr/share/fonts/truetype/dejavu/DejaVuSans-ExtraLight.ttf') + glob.glob('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf') + glob.glob('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
font = ImageFont.truetype(fonts[0], 96) if fonts else ImageFont.load_default()
dr = ImageDraw.Draw(named); tw = dr.textlength('Elise', font=font)
dr.text(((W - tw) / 2, H - 185), 'Elise', font=font, fill=(84, 82, 96, 255))
frame(named, 1.0).resize((600, 900), Image.LANCZOS).save(out_named, 'WEBP', quality=90, method=6)
print('card', out_named, out_token)

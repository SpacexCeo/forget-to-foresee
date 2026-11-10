"""Image-to-3D trial (docs/townsfolk.md): cut one figure out of a cast sheet for TRELLIS.

    python prep_image.py <sheet.png> <x0,y0,x1,y1> <out.png> [scale=4]

The sheets have a flat paper background: everything close to its colour becomes transparent (largest connected
figure kept, holes filled), then the crop is enlarged (Lanczos). TRELLIS takes the alpha as the mask, so its
background-removal network is not used.
"""
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd

sheet, box, out = sys.argv[1], [int(v) for v in sys.argv[2].split(",")], sys.argv[3]
scale = int(sys.argv[4]) if len(sys.argv) > 4 else 4
c = Image.open(sheet).convert("RGB").crop(box)
a = np.asarray(c).astype(float)
bg = np.median(np.concatenate([a[:6].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)]), axis=0)
fg = np.sqrt(((a - bg) ** 2).sum(-1)) > 26
fg = nd.binary_fill_holes(nd.binary_closing(fg, iterations=2))
lab, n = nd.label(fg)
fg = lab == (1 + int(np.argmax(nd.sum(fg, lab, range(1, n + 1)))))
ys, xs = np.where(fg)
print("figure box in the crop", xs.min(), ys.min(), xs.max(), ys.max(), "background", bg)
alpha = Image.fromarray((fg * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(0.6))
rgba = c.convert("RGBA")
rgba.putalpha(alpha)
rgba = rgba.crop((max(0, xs.min() - 4), max(0, ys.min() - 4), xs.max() + 5, ys.max() + 5))
rgba = rgba.resize((rgba.width * scale, rgba.height * scale), Image.LANCZOS)
rgba.save(out)
view = Image.new("RGB", rgba.size, (40, 90, 160))
view.paste(rgba, (0, 0), rgba)
view.save(out.replace(".png", "_view.jpg"), quality=85)

import os, math
import numpy as np
from PIL import Image
src = "/root/board/refs"; out = "/root/w/art/loot/2d"
os.makedirs(out + "/frames", exist_ok=True); os.makedirs(out + "/vfx", exist_ok=True)
for i, r in enumerate(("common", "rare", "epic", "legendary", "mythic"), start=1):
    im = Image.open(f"{src}/NFT-002_0{i}.png").convert("RGBA")
    # the frames were cut from one generated atlas: on common, rare and epic the top of the card below shows under
    # the frame's own bottom border (rows from about 96 % of the height down); clear those rows
    if r in ("common", "rare", "epic"):
        arr = np.asarray(im).copy()
        arr[int(im.height * 0.958):, :, 3] = 0
        im = Image.fromarray(arr, "RGBA")

    im.resize((600, 900), Image.LANCZOS).save(f"{out}/frames/frame_{r}_600.png", optimize=True)
    im.save(f"{out}/frames/frame_{r}.webp", quality=90, method=6)
# VFX sprites (VFX-001 palette: pearl #DDDCCB, muted teal #78A9A1, amber #DCA54E), white-ish cores, straight alpha
def save(a, rgb, name, size):
    h, w = a.shape
    img = np.zeros((h, w, 4), np.uint8)
    img[..., 0], img[..., 1], img[..., 2] = rgb
    img[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(f"{out}/vfx/{name}.png", optimize=True)
N = 256
y, x = np.mgrid[-1:1:N * 1j, -1:1:N * 1j]
r = np.hypot(x, y)
save(np.exp(-(r / 0.42) ** 2), (255, 250, 240), "loot_glow", N)                                   # soft radial glow
save(np.clip(1 - np.abs(r - 0.78) / 0.07, 0, 1) ** 1.5 * (r < 0.95), (255, 248, 236), "loot_ring", N)  # ground ring
a = np.exp(-(np.abs(x) / 0.16) ** 2) * np.clip(1 - (y + 1) / 2, 0, 1) ** 0.6                      # drop beam (fades up)
save(a, (240, 248, 246), "loot_beam", N)
ang = np.arctan2(y, x)
star = np.exp(-(r / 0.10) ** 2) + 0.9 * np.exp(-(np.abs(np.sin(ang * 2)) * r / 0.03) ** 2) * np.exp(-(r / 0.55) ** 2)
save(np.clip(star, 0, 1), (255, 246, 230), "loot_sparkle", N)                                     # four-point glint
chip = ((np.abs(x) * 0.8 + np.abs(y) * 1.3) < 0.6).astype(float) * (0.7 + 0.3 * (y < 0))
save(chip, (222, 220, 204), "loot_chip", N)                                                        # nacre chip flake
for n, c in (("pearl", (221, 220, 203)), ("teal", (120, 169, 161)), ("amber", (220, 165, 78))):
    save(np.exp(-(r / 0.42) ** 2), c, f"loot_glow_{n}", N)
print(sorted(os.listdir(out + "/frames")), sorted(os.listdir(out + "/vfx")))

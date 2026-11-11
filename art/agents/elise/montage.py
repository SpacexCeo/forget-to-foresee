import sys, glob
from PIL import Image
out, pre, cols = sys.argv[1], sys.argv[2], int(sys.argv[3])
ims = [Image.open(f).convert('RGB') for f in sorted(glob.glob(pre + '_*.png'))]
h = max(i.height for i in ims); rows = [ims[k:k + cols] for k in range(0, len(ims), cols)]
W = max(sum(i.width for i in r) for r in rows); M = Image.new('RGB', (W, h * len(rows)), (40, 40, 40))
for y, r in enumerate(rows):
    x = 0
    for i in r: M.paste(i, (x, y * h)); x += i.width
M.save(out, quality=int(sys.argv[4]) if len(sys.argv) > 4 else 88)

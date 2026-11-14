"""Contact sheet from check renders: python3 sheet.py <out.jpg> <cell px> <cols> <img...> (plain Python + Pillow)."""
import sys
from PIL import Image
out, cell, cols, files = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4:]
rows = (len(files) + cols - 1) // cols
im0 = Image.open(files[0]); ar = im0.height / im0.width; ch = int(cell * ar)
sheet = Image.new('RGB', (cols * cell, rows * ch), (40, 40, 44))
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((cell, ch), Image.LANCZOS)
    sheet.paste(im, ((i % cols) * cell, (i // cols) * ch))
sheet.save(out, quality=86)
print('sheet', out, sheet.size)

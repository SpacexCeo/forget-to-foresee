"""Elise: multi-view image-to-shape with Hunyuan3D-2mv from the owner's storyboard sheets (docs/art/elise/refs/).

    cd Hunyuan3D-2 && PYTHONPATH=. python3 <repo>/art/agents/elise/gen_shape.py <sheet> <out dir> <part> [seed]

<part> picks the crop boxes: "body" (01 master turnaround) or "head" (02 head and face).
Writes <out>/in_{front,left,back}.png (the cut-out views, one scale) and <out>/elise_<part>.glb.
"""
import sys, os
import numpy as np
import torch
from PIL import Image
from hy3dgen.rembg import BackgroundRemover
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

sheet, out = sys.argv[1], sys.argv[2]
part = sys.argv[3]
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 12345
os.makedirs(out, exist_ok=True)
im = Image.open(sheet).convert("RGB")
# view -> (x0, y0, x1, y1) on the 1536 x 1024 sheet
BOXES = {
    "body": {"front": (452, 84, 762, 902), "left": (768, 84, 930, 902), "back": (932, 84, 1250, 902)},
    "head": {"front": (22, 86, 388, 488), "left": (400, 86, 765, 488), "back": (22, 546, 388, 958)},
}[part]
rembg = BackgroundRemover()
views = {}
S = 1024
cut = {k: rembg(im.crop(bx)) for k, bx in BOXES.items()}
sc = (S * 0.90) / max(c.height for c in cut.values())
for k, c in cut.items():
    a = np.asarray(c)[..., 3]
    xs = np.nonzero(a.max(axis=0) > 40)[0]
    c = c.resize((round(c.width * sc), round(c.height * sc)), Image.LANCZOS)
    cx = (xs[0] + xs[-1]) / 2 * sc
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    canvas.paste(c, (round(S / 2 - cx), round(S * 0.05)), c)
    canvas.save(os.path.join(out, f"in_{k}.png")); views[k] = canvas
pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained("tencent/Hunyuan3D-2mv", subfolder="hunyuan3d-dit-v2-mv", variant="fp16")
mesh = pipe(image={k: views[k] for k in ("front", "left", "back")}, num_inference_steps=50, octree_resolution=512, num_chunks=20000,
            generator=torch.manual_seed(seed), output_type="trimesh")[0]
print("ELISE mesh", len(mesh.vertices), len(mesh.faces), mesh.bounds.tolist())
mesh.export(os.path.join(out, f"elise_{part}.glb"))

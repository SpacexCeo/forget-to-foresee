"""Image-to-3D trial: one figure -> TRELLIS (microsoft/TRELLIS-image-large) -> a mesh with vertex colours.

    ATTN_BACKEND=xformers SPARSE_BACKEND=spconv python run_trellis.py <figure_rgba.png> <out.ply> [seed=1]

Only the mesh decoder is used (formats=['mesh']); its vertex colours are baked to a texture later in Blender. The
textured-GLB path of TRELLIS is NOT used: it needs nvdiffrast and the Inria gaussian rasterizer, whose licences
are not for commercial use. kaolin is only imported by the FlexiCubes copy for an argument check, stubbed here.
Run from a checkout of github.com/microsoft/TRELLIS (MIT) on PYTHONPATH.
"""
import os
import sys
import types

os.environ.setdefault("ATTN_BACKEND", "xformers")
os.environ.setdefault("SPARSE_BACKEND", "spconv")
os.environ.setdefault("SPCONV_ALGO", "native")

# stubs for optional modules of the paths this trial does not use
kaolin = types.ModuleType("kaolin")
kaolin.utils = types.ModuleType("kaolin.utils")
kaolin.utils.testing = types.ModuleType("kaolin.utils.testing")
kaolin.utils.testing.check_tensor = lambda *a, **k: True
sys.modules.update({"kaolin": kaolin, "kaolin.utils": kaolin.utils, "kaolin.utils.testing": kaolin.utils.testing})

import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402

from trellis.pipelines import TrellisImageTo3DPipeline  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1
pipe = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
pipe.cuda()
img = Image.open(src)
res = pipe.run(img, seed=seed, formats=["mesh"],
               sparse_structure_sampler_params={"steps": 25, "cfg_strength": 7.5},
               slat_sampler_params={"steps": 25, "cfg_strength": 3.0})
m = res["mesh"][0]
v = m.vertices.detach().cpu().numpy()
f = m.faces.detach().cpu().numpy()
attrs = m.vertex_attrs.detach().cpu().numpy() if getattr(m, "vertex_attrs", None) is not None else None
col = np.clip(attrs[:, :3], 0, 1) if attrs is not None else np.full_like(v, 0.5)
print("mesh", v.shape, f.shape, "bounds", v.min(0), v.max(0), "colour mean", col.mean(0))
with open(out, "wb") as fh:
    fh.write((f"ply\nformat binary_little_endian 1.0\nelement vertex {len(v)}\nproperty float x\nproperty float y\nproperty float z\n"
              f"property uchar red\nproperty uchar green\nproperty uchar blue\nelement face {len(f)}\n"
              "property list uchar int vertex_indices\nend_header\n").encode())
    rec = np.zeros(len(v), dtype=[("p", "<f4", 3), ("c", "u1", 3)])
    rec["p"], rec["c"] = v, (col * 255).astype("u1")
    fh.write(rec.tobytes())
    fr = np.zeros(len(f), dtype=[("n", "u1"), ("i", "<i4", 3)])
    fr["n"], fr["i"] = 3, f
    fh.write(fr.tobytes())
print("wrote", out)

"""Image-to-3D trial: one figure -> TRELLIS (microsoft/TRELLIS-image-large) -> a mesh with vertex colours.

    ATTN_BACKEND=xformers SPARSE_BACKEND=spconv python run_trellis.py <figure_rgba.png> <out.ply> [seed=1]

Only the mesh decoder is used (formats=['mesh']); its vertex colours are baked to a texture later in Blender. The
textured-GLB path of TRELLIS is NOT used: it needs nvdiffrast and the Inria gaussian rasterizer, whose licences
are not for commercial use. kaolin is only imported by the FlexiCubes copy for an argument check, stubbed here.
Run from a checkout of github.com/microsoft/TRELLIS (MIT) on PYTHONPATH.
"""
import os
import sys

os.environ.setdefault("ATTN_BACKEND", "sdpa")       # dense attention: PyTorch's own
os.environ.setdefault("SPARSE_BACKEND", "spconv")
os.environ.setdefault("SPARSE_ATTN_BACKEND", "xformers")   # the default, flash_attn, is not installed
os.environ.setdefault("SPCONV_ALGO", "native")

# Optional modules of the paths this trial does not use (background removal, textured-GLB baking, gaussian and
# radiance-field rendering) are replaced by inert stubs when they are not installed.
import importlib.util  # noqa: E402
from unittest import mock  # noqa: E402

for _name in ("rembg", "kaolin", "kaolin.utils", "kaolin.utils.testing", "nvdiffrast", "nvdiffrast.torch", "diff_gaussian_rasterization",
              "diffoctreerast", "open3d", "xatlas", "pyvista", "pymeshfix", "igraph", "plyfile", "utils3d", "utils3d.torch"):
    try:
        found = importlib.util.find_spec(_name) is not None
    except (ImportError, ValueError):
        found = False
    if not found:
        sys.modules[_name] = mock.MagicMock(name=_name)
        print("stubbed", _name)

import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402

import xformers.ops as xops  # noqa: E402

# xformers 0.0.31 picks its bundled flash-attention kernel first, which fails on the RTX 5090 ("invalid argument");
# the sparse blocks go through the cutlass kernel instead
_mea = xops.memory_efficient_attention
xops.memory_efficient_attention = lambda q, k, v, attn_bias=None, p=0.0, scale=None, **kw: _mea(
    q, k, v, attn_bias, p, scale, op=xops.MemoryEfficientAttentionCutlassOp)

from trellis.pipelines import TrellisImageTo3DPipeline  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1
from huggingface_hub import snapshot_download  # noqa: E402
import trellis.models as tmodels  # noqa: E402

# only the mesh decoder is wanted: the gaussian and radiance-field decoders are not built (their renderers are stubs)
_from_pretrained = tmodels.from_pretrained


def _load(path, **kw):
    if "slat_dec_gs" in path or "slat_dec_rf" in path:
        return torch.nn.Identity()
    try:
        return _from_pretrained(path, **kw)
    except Exception:
        import traceback
        traceback.print_exc()                       # the pipeline swallows this and retries the name as a hub repository
        raise


tmodels.from_pretrained = _load

pipe = TrellisImageTo3DPipeline.from_pretrained(snapshot_download("microsoft/TRELLIS-image-large"))  # local files
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

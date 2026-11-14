"""Step 3: bake the high mesh onto the game mesh (Cycles, OPTIX when there is a GPU): tangent normal, ambient
occlusion, base colour, roughness, metallic and emission. Bakes at bake.size and box-filters down to bake.out.

    blender -b -t 10 --python s03_bake.py

Reads $LB_WORK/low.blend, writes $LB_WORK/tex/loomblade_{basecolor,orm,normal,emissive}.png (+ `_m` at bake.out_m).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402

import lb_common as L  # noqa: E402

B = L.SPEC["bake"]
NAME = os.environ.get("LB_NAME", "loomblade")


def px(img):
    a = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def down(a, f):
    h, w, c = a.shape
    return a.reshape(h // f, f, w // f, f, c).mean(axis=(1, 3))


def srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def save(arr, path):
    h, w, _ = arr.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(arr[..., :3], 0, 1)
    img = bpy.data.images.new("out", w, h, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def main():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(L.WORK, "low.blend"))
    sc = bpy.context.scene
    L.use_gpu(sc)
    high, low = bpy.data.objects["HIGH"], bpy.data.objects["LOW"]
    size = int(L.opt("--size", B["size"]))
    mat = bpy.data.materials.new("lb_bake_target")
    mat.use_nodes = True
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    mat.node_tree.nodes.active = node
    low.data.materials.clear()
    low.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bk = sc.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = B["cage"]
    bk.max_ray_distance = 0.0
    bk.margin = 24
    bk.margin_type = "EXTEND"
    bk.use_clear = True
    out = {}
    for ch, kind, samples in (("normal", "NORMAL", 16), ("ao", "AO", B["samples_ao"]), ("base", "EMIT", 4), ("rough", "EMIT", 4), ("metal", "EMIT", 4), ("emit", "EMIT", 4)):
        img = bpy.data.images.new("bake_" + ch, size, size, alpha=False, float_buffer=True, is_data=True)
        node.image = img
        for m in high.data.materials:
            L.set_channel(m, ch if kind == "EMIT" else "shaded")
        sc.cycles.samples = samples
        sc.cycles.use_denoising = False
        bpy.ops.object.bake(type=kind)
        out[ch] = down(px(img), size // B["out"])[..., :3]
        bpy.data.images.remove(img)
        L.log("baked", ch, float(out[ch].mean()))
    for m in high.data.materials:
        L.set_channel(m, "shaded")
    tex = os.path.join(L.WORK, "tex")
    os.makedirs(tex, exist_ok=True)
    ao = out["ao"][..., :1]
    cavity = 0.72 + 0.28 * ao  # a little painted depth in the colour; metals keep their own tint
    maps = {
        "basecolor": srgb(out["base"] * cavity),
        "orm": np.concatenate([ao, out["rough"][..., :1], out["metal"][..., :1]], axis=2),
        "normal": out["normal"],
        "emissive": srgb(out["emit"]),
    }
    for k, a in maps.items():
        save(a, os.path.join(tex, f"{NAME}_{k}.png"))
        save(down(a, B["out"] // B["out_m"]), os.path.join(tex, f"{NAME}_m_{k}.png"))
    L.log("textures in", tex)


main()

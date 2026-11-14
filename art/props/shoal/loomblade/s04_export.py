"""Step 4: the game files. Puts the baked textures on the game mesh, adds the sockets and exports
$LB_WORK/out/<name>.glb and <name>_m.glb (uncompressed; s05_ship.sh makes the KTX2 + meshopt files).

    blender -b --python s04_export.py

glTF axes: +Y towards the tip, X across the blade, Z through the flat; the origin is the grip centre.
Nodes: `<name>` (mesh), `socket_grip` (hand), `socket_guard`, `socket_tip` (trail / hit line end).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import lb_common as L  # noqa: E402

NAME = os.environ.get("LB_NAME", "loomblade")


def gltf_ao_group():
    g = bpy.data.node_groups.get("glTF Material Output") or bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    if not g.interface.items_tree:
        g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        g.nodes.new("NodeGroupInput")
    return g


def material(name, tex_prefix):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    t = m.node_tree
    b = t.nodes["Principled BSDF"]

    def img(kind, data):
        n = t.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(os.path.join(L.WORK, "tex", f"{tex_prefix}_{kind}.png"))
        n.image.name = f"{tex_prefix}_{kind}"
        n.image.colorspace_settings.name = "Non-Color" if data else "sRGB"
        return n
    t.links.new(img("basecolor", False).outputs[0], b.inputs["Base Color"])
    orm = img("orm", True)
    sep = t.nodes.new("ShaderNodeSeparateColor")
    t.links.new(orm.outputs[0], sep.inputs[0])
    t.links.new(sep.outputs[1], b.inputs["Roughness"])
    t.links.new(sep.outputs[2], b.inputs["Metallic"])
    ao = t.nodes.new("ShaderNodeGroup")
    ao.node_tree = gltf_ao_group()
    t.links.new(sep.outputs[0], ao.inputs[0])
    nm = t.nodes.new("ShaderNodeNormalMap")
    t.links.new(img("normal", True).outputs[0], nm.inputs["Color"])
    t.links.new(nm.outputs[0], b.inputs["Normal"])
    t.links.new(img("emissive", False).outputs[0], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = L.SPEC["bake"]["emissive_strength"]
    return m


def main():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(L.WORK, "low.blend"))
    low = bpy.data.objects["LOW"]
    bpy.data.objects.remove(bpy.data.objects["HIGH"])
    socks = []
    for name, loc in L.SPEC["sockets"].items():
        e = bpy.data.objects.new(name, None)
        e.location = loc
        bpy.context.scene.collection.objects.link(e)
        e.parent = low
        socks.append(e)
    out = os.path.join(L.WORK, "out")
    os.makedirs(out, exist_ok=True)
    for variant in (NAME, NAME + "_m"):
        low.name = low.data.name = NAME
        low.data.materials.clear()
        low.data.materials.append(material(variant, variant))
        bpy.ops.object.select_all(action="DESELECT")
        for o in [low] + socks:
            o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(out, variant + ".glb"), export_format="GLB", use_selection=True, export_yup=True,
                                  export_apply=True, export_tangents=True, export_animations=False, export_image_format="AUTO")
        L.log("exported", variant, os.path.getsize(os.path.join(out, variant + ".glb")))


main()

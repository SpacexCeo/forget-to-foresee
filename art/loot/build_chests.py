"""Loot chests in three rarities (GPT LOOT-001_01..04): common (weathered grey-green timber, dark iron), rare (dark
teal wood, bronze, a broken-ring latch, pearl studs), legendary (charcoal wood, bronze, nacre panels, an amber latch
gem). One shared body: 0.60 m long, 0.38 m deep, 0.36 m tall with the domed lid; the lid hinges at the back.

    blender -b --factory-startup -P art/loot/build_chests.py -- <out_dir> [common rare legendary]

Per chest: chest_<tier>.glb with nodes `chest_<tier>` (the body), `lid` (pivot on the rear hinge axis), `glow` (an
emissive card in the cavity, scaled to zero when closed: the client may drive it), `socket_reward` (where the reward
card rises from), and one clip `open` (36 frames at 30 fps): one anticipatory shake, the lid bursts to 105 degrees
with a small overshoot, the glow swells. The rarity light and particles stay client effects (VFX-001: one restrained
pulse, no full-white flash). Pivot: the centre of the base; the latch faces -Y (glTF +Z). Original designs.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

L, W, HB = 0.60, 0.38, 0.22          # length, depth, body height (the domed lid adds 0.14)
HL = 0.14
FPS = 30


def srgb(h):
    h = h.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


TIERS = {
    "common": dict(wood="#666D5E", metal="#424940", metal_rough=0.55, metal_metal=0.7, trim="#7A6A4A", gem=None, glow="#DDDCCB", panel=None, studs=False),
    "rare": dict(wood="#254B49", metal="#A87C3E", metal_rough=0.32, metal_metal=1.0, trim="#DEDCCB", gem=None, glow="#78A9A1", panel=None, studs=True),
    "legendary": dict(wood="#343B35", metal="#A87C3E", metal_rough=0.28, metal_metal=1.0, trim="#DEDCCB", gem="#DDA64F", glow="#DCA54E", panel="#E6E2DA", studs=True),
}


def mat(name, col, rough=0.6, metal=0.0, emit=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*col, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = False
    return m


def box(name, c, s, m, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=s, verts=bm.verts)
    bmesh.ops.translate(bm, vec=c, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    if bevel:
        b = o.modifiers.new("b", "BEVEL")
        b.width = bevel
        b.segments = 2
    return o


def dome(name, m, r_scale=1.0, seg=14, x0=-L / 2, x1=L / 2, thick=0.0, y_off=0.0, z_off=0.0, half_w=W / 2):
    """A barrel-vault lid shell between x0 and x1, rising HL above the hinge line; local origin on the rear hinge."""
    bm = bmesh.new()
    rings = []
    for x in (x0, x1):
        ring = []
        for k in range(seg + 1):
            a = math.pi * k / seg                       # from the front edge (a=0) over the top to the back
            y = -math.cos(a) * half_w * r_scale
            z = math.sin(a) * HL * r_scale
            ring.append(bm.verts.new((x, y + W / 2 + y_off, z + z_off)))
        rings.append(ring)
    for k in range(seg):
        bm.faces.new((rings[0][k], rings[1][k], rings[1][k + 1], rings[0][k + 1]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[1])
    bm.faces.new((rings[0][0], rings[0][seg], rings[1][seg], rings[1][0]))   # the underside: a closed solid
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    return o


def apply_mods(o):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    o.data = me


def join(objs, name):
    for o in objs:
        if o.modifiers:
            apply_mods(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    for p in objs[0].data.polygons:
        p.use_smooth = False
    return objs[0]


def build(tier):
    T = TIERS[tier]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.name = "open"
    sc.render.fps = FPS
    wood = mat("M_Chest_Wood", srgb(T["wood"]), 0.75)
    wood_dark = mat("M_Chest_WoodDark", tuple(c * 0.55 for c in srgb(T["wood"])), 0.85)
    metal = mat("M_Chest_Metal", srgb(T["metal"]), T["metal_rough"], T["metal_metal"])
    trim = mat("M_Chest_Trim", srgb(T["trim"]), 0.3, 0.0)
    inside = mat("M_Chest_Inside", tuple(c * 0.35 for c in srgb(T["wood"])), 0.9)
    glowm = mat("M_Chest_Glow", srgb(T["glow"]), 0.4, emit=srgb(T["glow"]), strength=4.0, alpha=0.42)
    body = []
    # walls with a hollow cavity (wall 0.03 m), plank seams as thin dark insets, a base plinth
    t = 0.03
    body.append(box("floor", (0, 0, 0.02), (L - 0.02, W - 0.02, 0.04), wood_dark))
    for sy in (-1, 1):
        body.append(box("wall_fb", (0, sy * (W / 2 - t / 2), HB / 2), (L, t, HB), wood))
    for sx in (-1, 1):
        body.append(box("wall_lr", (sx * (L / 2 - t / 2), 0, HB / 2), (t, W - 2 * t, HB), wood))
    body.append(box("cavity", (0, 0, 0.045), (L - 2 * t, W - 2 * t, 0.005), inside))
    for z in (0.075, 0.15):          # plank seams on front and back
        for sy in (-1, 1):
            body.append(box("seam", (0, sy * (W / 2 + 0.001), z), (L - 0.02, 0.004, 0.006), wood_dark))
    # metal: corner caps, two vertical straps, a top rim band, feet
    for sx in (-1, 1):
        for sy in (-1, 1):
            body.append(box("corner", (sx * (L / 2 - 0.025), sy * (W / 2 - 0.025), HB / 2), (0.06, 0.06, HB + 0.01), metal, 0.006))
            body.append(box("foot", (sx * (L / 2 - 0.05), sy * (W / 2 - 0.05), 0.0), (0.08, 0.08, 0.02), metal, 0.004))
        for sy in (-1, 1):   # straps on the front and back faces only (no dividers inside the cavity)
            body.append(box("strap", (sx * L * 0.22, sy * (W / 2 + 0.002), HB / 2), (0.045, 0.016, HB + 0.006), metal, 0.004))
    for sy in (-1, 1):   # the top rim as a frame round the open cavity
        body.append(box("rim", (0, sy * (W / 2 - 0.012), HB - 0.01), (L + 0.012, 0.036, 0.025), metal, 0.004))
    for sx in (-1, 1):
        body.append(box("rim", (sx * (L / 2 - 0.012), 0, HB - 0.01), (0.036, W - 0.05, 0.025), metal, 0.004))
    # latch plate on the front: common a plain hasp, rare the broken ring, legendary the amber gem in a bronze mount
    lp = box("latch", (0, -W / 2 - 0.012, HB - 0.045), (0.09, 0.02, 0.09), metal, 0.006)
    body.append(lp)
    if tier == "rare":
        bm = bmesh.new()
        n = 18
        for k in range(n):
            if k in (4, 5):
                continue            # the gap of the broken ring
            a0, a1 = math.tau * k / n, math.tau * (k + 1) / n
            vs = [bm.verts.new((math.cos(a) * r, -W / 2 - 0.024, HB - 0.045 + math.sin(a) * r)) for a, r in ((a0, 0.032), (a1, 0.032), (a1, 0.022), (a0, 0.022))]
            bm.faces.new(vs)
        me = bpy.data.meshes.new("ring")
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new("ring", me)
        sc.collection.objects.link(o)
        me.materials.append(trim)
        body.append(o)
    if T["gem"]:
        gem = mat("M_Chest_Gem", srgb(T["gem"]), 0.15, emit=srgb(T["gem"]), strength=2.5)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.026)
        bmesh.ops.scale(bm, vec=(0.8, 0.5, 1.15), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(0, -W / 2 - 0.03, HB - 0.045), verts=bm.verts)
        me = bpy.data.meshes.new("gem")
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new("gem", me)
        sc.collection.objects.link(o)
        me.materials.append(gem)
        body.append(o)
    if T["panel"]:   # nacre panels on the front and sides
        pm = mat("M_Chest_Nacre", tuple(c * 0.8 for c in srgb(T["panel"])), 0.18, 0.0)
        for sx in (-1, 1):
            body.append(box("panel", (sx * L * 0.36, -W / 2 - 0.003, HB * 0.5), (0.1, 0.006, HB * 0.55), pm))
    if T["studs"]:
        for sx in (-1, 1):
            for z in (0.05, HB - 0.06):
                bm = bmesh.new()
                bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=0.009)
                bmesh.ops.translate(bm, vec=(sx * L * 0.22, -W / 2 - 0.012, z), verts=bm.verts)
                me = bpy.data.meshes.new("stud")
                bm.to_mesh(me)
                bm.free()
                o = bpy.data.objects.new("stud", me)
                sc.collection.objects.link(o)
                me.materials.append(trim)
                body.append(o)
    chest = join(body, f"chest_{tier}")

    # the lid: pivot on the rear hinge axis (y = +W/2, z = HB); built so that closed = rotation 0
    hinge = Vector((0, W / 2, HB))
    lid_parts = [dome("lid_shell", wood, x0=-L / 2, x1=L / 2, y_off=-W, z_off=0.0)]
    for x in (-L * 0.22, L * 0.22):
        lid_parts.append(dome("lid_strap", metal, r_scale=1.04, x0=x - 0.022, x1=x + 0.022, y_off=-W, half_w=W / 2))
    for sx in (-1, 1):
        x_in, x_out = sx * (L / 2 - 0.03), sx * (L / 2 + 0.006)          # end bands stand proud of the shell's end caps
        lid_parts.append(dome("lid_end", metal, r_scale=1.03, x0=min(x_in, x_out), x1=max(x_in, x_out), y_off=-W, half_w=W / 2))
    lid_parts.append(box("lid_hasp", (0, -W - 0.012 + W / 2 - W / 2, 0.03), (0.07, 0.02, 0.06), metal, 0.005))
    lid = join(lid_parts, "lid")
    # the dome spans local y from -W (front) to 0 (rear edge on the hinge): the lid origin is the hinge
    lid.location = hinge
    lid.parent = chest

    # glow card in the cavity and the reward socket
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((-L * 0.3, 0, 0.05), (L * 0.3, 0, 0.05), (L * 0.22, 0, 0.30), (-L * 0.22, 0, 0.30))]
    bm.faces.new(vs)
    vs2 = [bm.verts.new(p) for p in ((0, -W * 0.3, 0.05), (0, W * 0.3, 0.05), (0, W * 0.22, 0.30), (0, -W * 0.22, 0.30))]
    bm.faces.new(vs2)
    me = bpy.data.meshes.new("glow")
    bm.to_mesh(me)
    bm.free()
    glow = bpy.data.objects.new("glow", me)
    sc.collection.objects.link(glow)
    me.materials.append(glowm)
    glow.parent = chest
    sock = bpy.data.objects.new("socket_reward", None)
    sc.collection.objects.link(sock)
    sock.location = (0, 0, 0.42)
    sock.parent = chest

    # the clip: frames 0-36. 0-12 one anticipatory shake, 12-20 the lid bursts open with overshoot, 20-36 settle; glow
    def key(o, f, **kw):
        for k, v in kw.items():
            setattr(o, k, v)
            o.keyframe_insert(k, frame=f)
    for f in range(0, 37):
        shake = math.sin(f / 12 * math.tau * 3) * 0.05 * (1 - f / 12) if f <= 12 else 0.0
        key(chest, f, rotation_euler=(0, 0, shake), location=(0, 0, 0.012 * abs(math.sin(f / 12 * math.pi * 3)) if f <= 12 else 0.0))
        if f <= 12:
            ang = 0.0
        elif f <= 18:
            u = (f - 12) / 6
            ang = math.radians(118) * (1 - (1 - u) ** 3)
        else:
            u = (f - 18) / 18
            ang = math.radians(105 + 13 * math.exp(-4 * u) * math.cos(u * 9))
        key(lid, f, rotation_euler=(-ang, 0, 0))
        g = 0.0 if f < 13 else min(1.0, (f - 13) / 6) * (1.0 + 0.15 * math.sin((f - 13) / 4))
        gs = max(g, 1e-3)
        key(glow, f, scale=(gs, gs, gs))
    for o in (chest, lid, glow):
        act = o.animation_data.action
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        # one clip for the whole chest: same-named NLA tracks are merged into one glTF animation `open`
        tr = o.animation_data.nla_tracks.new()
        tr.name = "open"
        tr.strips.new("open", 0, act)
        o.animation_data.action = None
    sc.frame_start, sc.frame_end = 0, 36
    sc.frame_set(0)
    tris = sum(len(p.vertices) - 2 for o in (chest, lid, glow) for p in o.data.polygons)
    return tris


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    out = argv[0]
    tiers = [a for a in argv[1:] if a in TIERS] or list(TIERS)
    os.makedirs(out, exist_ok=True)
    for tier in tiers:
        n = build(tier)
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(filepath=os.path.join(out, f"chest_{tier}.glb"), export_format="GLB", use_selection=True,
                                  export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_yup=True)
        print("CHEST", tier, "tris", n, flush=True)


if __name__ == "__main__":
    main()

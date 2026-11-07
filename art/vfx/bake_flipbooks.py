# Flipbook bake for the VFX system (game/src/vfx/). Runs a Mantaflow gas simulation in Blender,
# renders 64 frames with Cycles (GPU, transparent film, orthographic camera) and packs them into
# an 8x8 atlas (webp, RGBA) for game/public/assets/vfx/.
#
#   blender -b -P art/vfx/bake_flipbooks.py -- <kind> <out_dir> [cell_px]
#   kind: smoke | dust | fire | magic
#
# Atlas conventions (read by game/src/vfx/particles.js):
#   - frames run left-to-right, top-to-bottom; frame 0 is the top-left cell;
#   - smoke, dust and magic are grey (lit density / emission in RGB, coverage in A) and tinted at
#     runtime by the preset colour, so one atlas serves many effects;
#   - fire keeps its colour (blackbody ramp) and is tinted only slightly;
#   - every cell is faded to zero alpha at its border so no hard sprite edge shows.
import bpy, sys, os, math

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
KIND = argv[0] if argv else "smoke"
OUT = argv[1] if len(argv) > 1 else "/tmp/vfx"
CELL = int(argv[2]) if len(argv) > 2 else 128
GRID = 8
FRAMES = GRID * GRID
os.makedirs(OUT, exist_ok=True)
CACHE = os.path.join(OUT, "cache_" + KIND)


def log(*a):
    print("[vfx-bake]", KIND, *a, flush=True)


def use_gpu(sc):
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        sc.cycles.device = "CPU"; return "CPU"
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == kind
                sc.cycles.device = "GPU"; return kind
        except Exception:
            pass
    sc.cycles.device = "CPU"; return "CPU"


# Per-kind simulation and look settings. Every sim is deterministic (no random seeds involved
# beyond Mantaflow's fixed noise), so re-running reproduces the atlas.
CFG = {
    # A billowing puff that grows and thins out: general smoke, burnt-stake wisps, mist.
    "smoke": dict(res=96, frames=(4, 90), inflow=(1, 14), flow_pos=(0, 0, 0.55), flow_r=0.28,
                  buoy=0.35, heat=0.4, vort=0.35, dissolve=70, init_vel=(0, 0, 0.6), normal_vel=0.6,
                  flow_type="SMOKE", emission=False, density=6.0),
    # A low, heavy ground burst that spreads sideways and settles: anchor plant dust.
    "dust": dict(res=96, frames=(2, 66), inflow=(1, 4), flow_pos=(0, 0, 0.35), flow_r=0.3,
                 buoy=-0.25, heat=0.05, vort=0.5, dissolve=45, init_vel=(0, 0, 0.3), normal_vel=2.6,
                 flow_type="SMOKE", emission=False, density=5.0),
    # A flare that licks upward and burns out: storm ignition, burnt stake, embers' birth.
    "fire": dict(res=96, frames=(3, 67), inflow=(1, 26), flow_pos=(0, 0, 0.3), flow_r=0.25,
                 buoy=0.4, heat=1.6, vort=0.6, dissolve=30, init_vel=(0, 0, 0.8), normal_vel=0.4,
                 flow_type="BOTH", emission=True, density=3.0),
    # Thin, curling wisps from a source circling fast: vision memories, gift glow, shimmer.
    "magic": dict(res=96, frames=(10, 74), inflow=(1, 60), flow_pos=(0, 0, 0.7), flow_r=0.1,
                  buoy=0.15, heat=0.6, vort=1.4, dissolve=18, init_vel=(0, 0, 0.4), normal_vel=0.2,
                  flow_type="SMOKE", emission=True, density=4.0, orbit=0.35),
}[KIND]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    log("device", use_gpu(sc))
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.cycles.volume_step_rate = 0.5
    sc.cycles.volume_max_steps = 512
    sc.render.film_transparent = True
    sc.render.resolution_x = CELL
    sc.render.resolution_y = CELL
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.frame_start = 1
    sc.frame_end = CFG["frames"][1]
    world = bpy.data.worlds.new("w"); sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
    return sc


def build(sc):
    # Domain: 2 x 2 x 2 m cube with its base at z = 0.
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1))
    dom = bpy.context.active_object; dom.name = "Domain"
    mod = dom.modifiers.new("Fluid", "FLUID"); mod.fluid_type = "DOMAIN"
    d = mod.domain_settings
    d.domain_type = "GAS"
    d.resolution_max = CFG["res"]
    d.cache_directory = CACHE
    d.cache_type = "ALL"
    d.cache_frame_start = 1
    d.cache_frame_end = CFG["frames"][1]
    d.alpha = CFG["buoy"]
    d.beta = CFG["heat"]
    d.vorticity = CFG["vort"]
    d.use_dissolve_smoke = True
    d.dissolve_speed = CFG["dissolve"]
    d.use_adaptive_domain = False
    d.use_noise = True
    d.noise_scale = 2
    d.noise_strength = 1.2
    for side in ("use_collision_border_front", "use_collision_border_back", "use_collision_border_right",
                 "use_collision_border_left", "use_collision_border_top", "use_collision_border_bottom"):
        if hasattr(d, side):
            setattr(d, side, side.endswith("bottom"))
    if CFG["flow_type"] == "BOTH":
        d.flame_vorticity = 0.8
        d.burning_rate = 0.85
        d.flame_smoke = 0.6

    bpy.ops.mesh.primitive_uv_sphere_add(radius=CFG["flow_r"], location=CFG["flow_pos"], segments=24, ring_count=12)
    flow = bpy.context.active_object; flow.name = "Flow"
    fm = flow.modifiers.new("Fluid", "FLUID"); fm.fluid_type = "FLOW"
    f = fm.flow_settings
    f.flow_type = CFG["flow_type"]
    f.flow_behavior = "INFLOW"
    f.flow_source = "MESH"
    f.surface_distance = 0.6
    f.use_initial_velocity = True
    f.velocity_normal = CFG["normal_vel"]
    f.velocity_coord = CFG["init_vel"]
    f.density = 1.0
    if CFG["flow_type"] == "BOTH":
        f.fuel_amount = 1.4
    # Inflow only during the configured window (a burst rather than a steady source).
    a, b = CFG["inflow"]
    f.use_inflow = True; f.keyframe_insert("use_inflow", frame=a)
    f.use_inflow = False; f.keyframe_insert("use_inflow", frame=b)
    if CFG.get("orbit"):
        r = CFG["orbit"]
        for fr in range(1, CFG["frames"][1] + 1, 2):
            t = fr / 12.0
            flow.location = (math.cos(t * 2.4) * r, math.sin(t * 2.4) * r * 0.6, CFG["flow_pos"][2] + 0.25 * math.sin(t))
            flow.keyframe_insert("location", frame=fr)
    flow.hide_render = True

    # Volume material.
    mat = bpy.data.materials.new("Vol"); mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodePrincipledVolume")
    den = nt.nodes.new("ShaderNodeAttribute"); den.attribute_name = "density"
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = CFG["density"]
    nt.links.new(den.outputs["Fac"], mul.inputs[0])
    nt.links.new(mul.outputs[0], vol.inputs["Density"])
    vol.inputs["Color"].default_value = (0.9, 0.9, 0.9, 1)
    if KIND == "fire":
        fl = nt.nodes.new("ShaderNodeAttribute"); fl.attribute_name = "flame"
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        el = ramp.color_ramp.elements
        el[0].position = 0.0; el[0].color = (0, 0, 0, 1)
        el[1].position = 1.0; el[1].color = (1.0, 0.92, 0.7, 1)
        mid = el.new(0.35); mid.color = (0.9, 0.25, 0.03, 1)
        mid2 = el.new(0.65); mid2.color = (1.0, 0.62, 0.18, 1)
        nt.links.new(fl.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], vol.inputs["Emission Color"])
        em = nt.nodes.new("ShaderNodeMath"); em.operation = "MULTIPLY"; em.inputs[1].default_value = 14.0
        nt.links.new(fl.outputs["Fac"], em.inputs[0])
        nt.links.new(em.outputs[0], vol.inputs["Emission Strength"])
        vol.inputs["Color"].default_value = (0.08, 0.07, 0.07, 1)
    elif CFG["emission"]:
        nt.links.new(den.outputs["Fac"], vol.inputs["Emission Strength"])
        vol.inputs["Emission Color"].default_value = (1, 1, 1, 1)
        em = nt.nodes.new("ShaderNodeMath"); em.operation = "MULTIPLY"; em.inputs[1].default_value = 9.0
        nt.links.new(den.outputs["Fac"], em.inputs[0])
        nt.links.new(em.outputs[0], vol.inputs["Emission Strength"])
        mul.inputs[1].default_value = CFG["density"] * 0.35
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    dom.data.materials.append(mat)

    # Key light from the upper left front so grey sprites carry volume shading; dim fill.
    sun = bpy.data.lights.new("key", "SUN"); sun.energy = 4.0
    so = bpy.data.objects.new("key", sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), math.radians(-35), math.radians(-20))
    fill = bpy.data.lights.new("fill", "SUN"); fill.energy = 0.9
    fo = bpy.data.objects.new("fill", fill); sc.collection.objects.link(fo)
    fo.rotation_euler = (math.radians(110), math.radians(30), math.radians(160))

    cam = bpy.data.cameras.new("cam"); cam.type = "ORTHO"; cam.ortho_scale = 2.0
    co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co)
    co.location = (0, -6, 1); co.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = co
    return dom


def bake(dom):
    bpy.context.view_layer.objects.active = dom
    dom.select_set(True)
    with bpy.context.temp_override(object=dom, active_object=dom):
        bpy.ops.fluid.bake_all()
    log("baked")


def render_frames(sc):
    a, b = CFG["frames"]
    paths = []
    for i in range(FRAMES):
        fr = int(round(a + (b - a) * i / (FRAMES - 1)))
        sc.frame_set(fr)
        p = os.path.join(OUT, "frames_" + KIND, "f%02d.png" % i)
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        paths.append(p)
    log("rendered", len(paths))
    return paths


def pack(paths):
    from PIL import Image
    import numpy as np
    atlas = np.zeros((GRID * CELL, GRID * CELL, 4), np.float32)
    yy, xx = np.mgrid[0:CELL, 0:CELL].astype(np.float32)
    # Border fade: smooth to zero over the outer 12% of each cell.
    e = np.minimum(np.minimum(xx, CELL - 1 - xx), np.minimum(yy, CELL - 1 - yy)) / (CELL * 0.12)
    edge = np.clip(e, 0, 1) ** 2
    for i, p in enumerate(paths):
        im = np.asarray(Image.open(p).convert("RGBA"), np.float32) / 255.0
        im[..., 3] *= edge
        if KIND != "fire":
            # Grey atlases: luminance in RGB, normalised so the brightest frame peaks near white.
            lum = im[..., 0] * 0.3 + im[..., 1] * 0.59 + im[..., 2] * 0.11
            im[..., 0] = im[..., 1] = im[..., 2] = lum
        if KIND in ("magic", "fire"):
            # Emissive sprites: coverage follows brightness so additive blending stays clean.
            im[..., 3] = np.maximum(im[..., 3], im[..., :3].max(-1)) * edge
        r, c = divmod(i, GRID)
        atlas[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = im
    if KIND != "fire":
        peak = max(1e-3, float(np.percentile(atlas[..., 0][atlas[..., 3] > 0.05], 99.5)) if (atlas[..., 3] > 0.05).any() else 1.0)
        atlas[..., :3] = np.clip(atlas[..., :3] / peak, 0, 1)
    img = Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    out = os.path.join(OUT, "flipbook_%s.webp" % KIND)
    img.save(out, "WEBP", quality=82, method=6)
    log("atlas", out, os.path.getsize(out))


sc = reset()
dom = build(sc)
bake(dom)
pack(render_frames(sc))

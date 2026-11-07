# Forget to Foresee: bakes the image-based-lighting environment for the island (golden hour above a
# sea of clouds) as an equirectangular HDR. Run on a GPU box:
#   blender -b -P art/env/bake_env.py -- --out /root/out/env --res 2048 --samples 256 [--sun-disc]
# Scene: Blender's Nishita physical sky (sun disc off by default: the game's directional light is
# the sun, so the IBL must not double-count it) + a volumetric cloud slab 28 m below the camera,
# lit by a warm sun lamp matching render/sky.js. A panoramic equirect camera renders it with Cycles
# on OPTIX. The EXR is converted by art/env/pack_hdr.py (rotation to three.js convention, scale
# normalisation, RLE Radiance .hdr).
import bpy, math, sys, argparse

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--out', default='/root/out/env')
ap.add_argument('--res', type=int, default=2048)
ap.add_argument('--samples', type=int, default=256)
ap.add_argument('--sun-disc', action='store_true')
# Sun: must match SUN preset 'golden' in game/src/render/sky.js (elevation, azimuth from -Z toward -X in three.js space).
ap.add_argument('--elev', type=float, default=13.0)
ap.add_argument('--azim', type=float, default=34.0)
a = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices: d.use = d.type == 'OPTIX'
sc.cycles.device = 'GPU'
sc.cycles.samples = a.samples
sc.cycles.use_denoising = True
sc.cycles.volume_step_rate = 1.0
sc.cycles.volume_max_steps = 512
sc.cycles.max_bounces = 6; sc.cycles.volume_bounces = 2
sc.render.resolution_x = a.res; sc.render.resolution_y = a.res // 2
sc.render.image_settings.file_format = 'OPEN_EXR'
sc.render.image_settings.color_depth = '32'
sc.render.image_settings.color_mode = 'RGB'
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.view_settings.exposure = 0.0

# three.js direction toward the sun (y up), then Blender (x, -z, y).
el, az = math.radians(a.elev), math.radians(a.azim)
tx, ty, tz = -math.sin(az) * math.cos(el), math.sin(el), -math.cos(az) * math.cos(el)
bx, by, bz = tx, -tz, ty

world = bpy.data.worlds.new('ftf_sky'); sc.world = world
world.use_nodes = True
nt = world.node_tree; nt.nodes.clear()
sky = nt.nodes.new('ShaderNodeTexSky')
sky.sky_type = 'NISHITA'
sky.sun_disc = a.sun_disc
sky.sun_size = math.radians(0.8)
sky.sun_intensity = 0.6
sky.sun_elevation = el
# Nishita: rotation measured around +Z; 0 puts the sun on +Y? We solve it from the vector instead.
sky.sun_rotation = math.atan2(bx, by) % (2 * math.pi)
sky.altitude = 1800.0
sky.air_density = 1.0
sky.dust_density = 5.0   # golden haze (Mie)
sky.ozone_density = 1.4
bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = 0.22
out = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(sky.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

# Warm sun lamp (lights the cloud slab; invisible to the camera).
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.2; sun.color = (1.0, 0.74, 0.46); sun.angle = math.radians(1.2)
so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
import mathutils
so.rotation_euler = mathutils.Vector((bx, by, bz)).to_track_quat('Z', 'Y').to_euler()
so.visible_camera = False

# Cloud slab: top at -28 m (CLOUD_LEVEL), 60 m thick, 6 km wide; density = billowy noise x height profile.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -28 - 30))
slab = bpy.context.active_object; slab.name = 'cloud_sea'; slab.scale = (6000, 6000, 60)
mat = bpy.data.materials.new('cloud'); mat.use_nodes = True
mn = mat.node_tree.nodes; ml = mat.node_tree.links; mn.clear()
mo = mn.new('ShaderNodeOutputMaterial')
vol = mn.new('ShaderNodeVolumePrincipled'); vol.inputs['Color'].default_value = (1, 1, 1, 1)
vol.inputs['Anisotropy'].default_value = 0.55
tc = mn.new('ShaderNodeTexCoord'); sep = mn.new('ShaderNodeSeparateXYZ')
ml.new(tc.outputs['Object'], sep.inputs['Vector'])
noise = mn.new('ShaderNodeTexNoise'); noise.noise_dimensions = '3D'
noise.inputs['Scale'].default_value = 6.0; noise.inputs['Detail'].default_value = 8.0; noise.inputs['Roughness'].default_value = 0.55
mapn = mn.new('ShaderNodeMapping'); mapn.inputs['Scale'].default_value = (15, 15, 0.6)  # ~70 m billows across, 100 m tall cells
ml.new(tc.outputs['Object'], mapn.inputs['Vector']); ml.new(mapn.outputs['Vector'], noise.inputs['Vector'])
# height profile: z in object space -0.5..0.5 -> height fraction 0..0.85; density = noise - height (dense bottom, billowy top)
zr = mn.new('ShaderNodeMapRange'); zr.inputs['From Min'].default_value = -0.5; zr.inputs['From Max'].default_value = 0.5
zr.inputs['To Max'].default_value = 0.85
ml.new(sep.outputs['Z'], zr.inputs['Value'])
add = mn.new('ShaderNodeMath'); add.operation = 'SUBTRACT'
ml.new(noise.outputs['Fac'], add.inputs[0]); ml.new(zr.outputs['Result'], add.inputs[1])
add.inputs[1].default_value = 0.0
gain = mn.new('ShaderNodeMapRange'); gain.inputs['From Min'].default_value = -0.35; gain.inputs['From Max'].default_value = 0.1
gain.inputs['To Min'].default_value = 0.0; gain.inputs['To Max'].default_value = 0.09
ml.new(add.outputs['Value'], gain.inputs['Value'])
ml.new(gain.outputs['Result'], vol.inputs['Density'])
ml.new(vol.outputs['Volume'], mo.inputs['Volume'])
slab.data.materials.append(mat)

# Panoramic camera at the plaza (origin), looking along Blender -Y = three.js +Z... orientation is
# irrelevant for an equirect except for the seam: pack_hdr.py rolls the image into three.js convention.
cam = bpy.data.cameras.new('pano'); cam.type = 'PANO'
try:
    cam.panorama_type = 'EQUIRECTANGULAR'
except AttributeError:
    cam.cycles.panorama_type = 'EQUIRECTANGULAR'
co = bpy.data.objects.new('pano', cam); sc.collection.objects.link(co)
co.location = (0, 0, 2.0); co.rotation_euler = (math.radians(90), 0, math.radians(-90))
sc.camera = co
sc.render.filepath = a.out + ('_sun' if a.sun_disc else '') + '.exr'
bpy.ops.render.render(write_still=True)
print('WROTE', sc.render.filepath, 'sun_rotation_deg', math.degrees(sky.sun_rotation), 'three_sun', (tx, ty, tz))

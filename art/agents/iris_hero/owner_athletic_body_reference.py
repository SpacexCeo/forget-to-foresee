"""Iris athletic feminine body — procedural sculpt/retopo reference for Blender 4.x.
Run inside Blender Scripting > Run Script. Non-destructive to existing objects.
Generated geometry is an artistic base, not production topology or automatic rerig.
"""
import bpy
import math
from mathutils import Vector
from math import sin, cos, pi, exp

# ----------------------- adjustable art direction -----------------------
PREFIX = 'IRIS_BODY_'
HEIGHT = 1.72
WAIST = 0.84       # 0.7 narrow, 1.15 fuller
HIPS = 1.08        # 0.85 slim, 1.2 curvy
BUST = 1.03        # 0.85 subtle, 1.15 fuller
GLUTES = 1.08      # 0.85 subtle, 1.2 prominent
MUSCLE = 0.70      # 0 soft, 1.0 defined athlete
SKIN_COLOR = (0.60, 0.35, 0.27, 1.0) # linear-ish viewport RGBA
CREATE_PREVIEW_OUTFIT = False # True for fitted sport top and leggings mockup

# Only remove objects made by this script (safe to rerun).
for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX):
        bpy.data.objects.remove(obj, do_unlink=True)
collection = bpy.data.collections.get('Iris Athletic Body - GENERATED')
if collection is None:
    collection = bpy.data.collections.new('Iris Athletic Body - GENERATED')
    bpy.context.scene.collection.children.link(collection)

def move_to_collection(obj):
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    collection.objects.link(obj)

def make_material(name, color, roughness=0.67):
    material = bpy.data.materials.get(PREFIX + name) or bpy.data.materials.new(PREFIX + name)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    if shader:
        shader.inputs['Base Color'].default_value = color
        shader.inputs['Roughness'].default_value = roughness
    return material

skin = make_material('Natural_Skin', SKIN_COLOR, 0.72)
outfit = make_material('Charcoal_Performance_Fabric', (0.038, 0.042, 0.050, 1), 0.83)
accent = make_material('Iris_Purple_Accent', (0.23, 0.16, 0.34, 1), 0.78)

def mesh_object(name, vertices, faces, material, subdiv=2):
    mesh = bpy.data.meshes.new(PREFIX + name + '_Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(PREFIX + name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    for p in mesh.polygons:
        p.use_smooth = True
    if subdiv:
        s = obj.modifiers.new('Smooth Sculpt Preview', 'SUBSURF')
        s.levels = subdiv
        s.render_levels = subdiv
    return obj

# Build continuous ring surfaces with 48 sections, rather than separate spheres.
# Z values are proportions of the 1.72m adult figure.
S = HEIGHT / 1.72
N = 48

def interpolate(profile, z):
    if z <= profile[0][0]:
        return profile[0][1:]
    if z >= profile[-1][0]:
        return profile[-1][1:]
    for a, b in zip(profile[:-1], profile[1:]):
        if a[0] <= z <= b[0]:
            t = (z-a[0]) / (b[0]-a[0])
            t = t*t*(3-2*t)
            return tuple(a[i]*(1-t) + b[i]*t for i in range(1,len(a)))

def ring_mesh(name, rings, material, extra=None):
    verts, faces = [], []
    for z, xc, yc, rx, ry, side in rings:
        for i in range(N):
            ang = 2*pi*i/N
            xx = xc + rx*cos(ang)
            yy = yc + ry*sin(ang)
            if extra:
                dx,dy,dz = extra(z, ang, xx, yy, side)
            else:
                dx=dy=dz=0
            verts.append(((xx+dx)*S, (yy+dy)*S, (z+dz)*S))
    for j in range(len(rings)-1):
        for i in range(N):
            a = j*N+i
            b = j*N + (i+1)%N
            faces.append((a,b,b+N,a+N))
    faces.append(tuple(reversed(tuple(range(N)))))
    faces.append(tuple((len(rings)-1)*N + i for i in range(N)))
    return mesh_object(name, verts, faces, material)

# X horizontal; Y negative = front; Z vertical. Front projection is -sin(theta).
# torso: glute projection integrated through local surface bump, chest through soft falloff.
body_profile = [
 (0.76, 0.170*HIPS, 0.122*HIPS, 0.000),
 (0.80, 0.198*HIPS, 0.148*HIPS, 0.002),
 (0.85, 0.223*HIPS, 0.158*HIPS, 0.002),
 (0.90, 0.239*HIPS, 0.166*HIPS, 0.004),
 (0.94, 0.227*HIPS, 0.157*HIPS, 0.000),
 (1.00, 0.184*WAIST, 0.132*WAIST, -0.006),
 (1.06, 0.153*WAIST, 0.116*WAIST, -0.007),
 (1.12, 0.171, 0.123, -0.003),
 (1.18, 0.202, 0.136, 0.000),
 (1.24, 0.217, 0.146, 0.002),
 (1.30, 0.219, 0.140, 0.003),
 (1.35, 0.213, 0.126, 0.004),
 (1.39, 0.193, 0.111, 0.003),
 (1.43, 0.108, 0.089, 0.002),
 (1.46, 0.070, 0.070, 0.000),
]

def anatomy(z, ang, xx, yy, side):
    # Two anatomical breasts, smoothly displaced from front torso, not pasted spheres.
    breast_z = exp(-((z-1.265)/0.082)**2)
    breast_x = exp(-((abs(xx)-0.098)/0.076)**2)
    facing_front = max(0.0, -sin(ang))**2
    chest_volume = 0.085*BUST*breast_z*breast_x*facing_front
    # Posterior glute volume is smooth and centered lower than upper hip.
    glute_z = exp(-((z-0.855)/0.102)**2)
    glute_x = exp(-((abs(xx)-0.125)/0.135)**2)
    facing_back = max(0.0, sin(ang))**2
    glute_volume = 0.034*GLUTES*glute_z*glute_x*facing_back
    # Very subtle rectus abdominis and oblique relief (not bodybuilder abs).
    ab = MUSCLE*0.0026*exp(-((z-1.07)/0.12)**2)*exp(-(xx/0.075)**2)*facing_front
    return (0.0, -chest_volume+glute_volume-ab, 0.0)

rings=[]
for i in range(57):
    z=0.76+i*(1.46-0.76)/56
    rx,ry,yc=interpolate(body_profile,z)
    rings.append((z,0.0,yc,rx,ry,'body'))
torso=ring_mesh('Torso_Anatomical',rings,skin,anatomy)

# Legs: hip-root emerges from torso, muscular quadriceps/calf with natural taper.
leg_profile=[
 (0.00,0.044,0.052,0.000), (0.04,0.056,0.065,0.003),
 (0.11,0.055,0.061,0.000), (0.19,0.064,0.073,0.001),
 (0.27,0.078,0.088,0.005), (0.35,0.075,0.082,0.008),
 (0.43,0.062,0.069,0.010), (0.49,0.067,0.073,0.010),
 (0.57,0.088,0.096,0.006), (0.65,0.106,0.112,0.000),
 (0.73,0.123,0.125,0.001), (0.82,0.120,0.120,0.000),
 (0.87,0.095,0.099,0.000)
]
for side,name in [(-1,'Left'),(1,'Right')]:
    cx=side*0.135*HIPS
    leg=[]
    for i in range(62):
        z=0.01+i*(0.865-0.01)/61
        rx,ry,yc=interpolate(leg_profile,z)
        # Slight natural medial shift between thigh and ankle.
        cxz=cx + side*(0.014 if z>0.38 else -0.010)
        leg.append((z,cxz,yc,rx*(1+0.10*MUSCLE),ry*(1+0.05*MUSCLE),side))
    ring_mesh(name+'_Leg_Quad_Calf',leg,skin)

# Foot capsules, overlapping the ankle with low-poly sculpt base.
def ellipsoid(name, loc, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=tuple(v*S for v in loc))
    obj=bpy.context.object
    obj.name=PREFIX+name
    obj.scale=tuple(v*S for v in scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move_to_collection(obj)
    obj.data.materials.append(material)
    for p in obj.data.polygons: p.use_smooth=True
    return obj
for side,name in [(-1,'Left'),(1,'Right')]:
    ellipsoid(name+'_Foot_Base',(side*0.125,-0.087,0.045),(0.068,0.154,0.050),skin)

# Arms are clean independent volumes intended for later retopology / rigging.
arm_profile=[
 (0.00,0.044,0.046), (0.07,0.038,0.040),
 (0.16,0.048,0.052), (0.27,0.050,0.054),
 (0.38,0.051,0.056), (0.47,0.062,0.068),
 (0.58,0.075,0.077)
]
for side,name in [(-1,'Left'),(1,'Right')]:
    arm=[]
    for i in range(49):
        d=i*0.58/48
        z=1.37-d
        rx,ry=interpolate(arm_profile,d)
        x=side*(0.227 + 0.072*math.sin(pi*d/1.17))
        arm.append((z,x,0.011,rx*(1+0.10*MUSCLE),ry,side))
    ring_mesh(name+'_Arm_Deltoid_Triceps',list(reversed(arm)),skin)
    ellipsoid(name+'_Hand',(side*0.278,0.005,0.750),(0.045,0.032,0.092),skin)

# Neck and expressive placeholder head, intentionally not a facial likeness.
neck_profile=[(1.425,0.065,0.065,0.002),(1.47,0.052,0.052,0.002),(1.525,0.055,0.054,0.000)]
neck=[(z,0,yc,rx,ry,0) for z,rx,ry,yc in neck_profile]
ring_mesh('Neck',neck,skin)
ellipsoid('Head_Sculpt_Placeholder',(0.000,-0.004,1.615),(0.090,0.084,0.121),skin)
ellipsoid('Jaw_Sculpt_Placeholder',(0.000,-0.029,1.565),(0.073,0.065,0.070),skin)

# Optional schematic performance-sportswear material proxy; NOT skin/cloth simulation.
if CREATE_PREVIEW_OUTFIT:
    # Simple thin cropped top that matches torso curvature, separate surface.
    top_rings=[]
    for i in range(22):
        z=1.18+i*(1.34-1.18)/21
        rx,ry,yc=interpolate(body_profile,z)
        top_rings.append((z,0,yc,rx+0.005,ry+0.005,'top'))
    ring_mesh('Preview_Sports_Top',top_rings,outfit,anatomy)

# Show newly generated asset without changing existing rig or mesh.
for ob in bpy.context.selected_objects: ob.select_set(False)
torso.select_set(True)
bpy.context.view_layer.objects.active=torso
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.shading.type = 'MATERIAL' if False else 'SOLID'
        area.spaces.active.shading.color_type = 'MATERIAL'
        area.spaces.active.region_3d.view_distance=3.0
print('Iris athletic body created. Adjust parameters at script top and rerun. Separate sculpt/retopo reference; rig not generated.')

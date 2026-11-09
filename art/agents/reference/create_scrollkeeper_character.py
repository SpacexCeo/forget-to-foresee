"""Scrollkeeper — editable stylized NPC blockout for Blender 4.0+.

Run in Blender: Scripting > Open > Run Script.
Or: blender --background --python create_scrollkeeper_character.py
Creates objects in named collections, a portrait camera and studio lighting.
This is a PROPORTION / COSTUME BLOCKOUT, not a scanned human, rig or game-ready mesh.
"""
import bpy
import math
from mathutils import Vector
from math import sin, cos, pi
from pathlib import Path

# -------------------------- USER SETTINGS -----------------------------
CLEAR_SCENE = True
SAVE_BLEND = True
RENDER_PREVIEW = False  # Enable for PNG preview (slower)
OUTPUT_DIR = Path.home() / "scrollkeeper_blender"
RESOLUTION = (1000, 1200)
# ----------------------------------------------------------------------

if CLEAR_SCENE:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        if col.name != bpy.context.scene.collection.name and col.users == 0:
            bpy.data.collections.remove(col)

SCENE = bpy.context.scene
COLLECTIONS = {}

def collection(name):
    col = bpy.data.collections.new(name)
    SCENE.collection.children.link(col)
    COLLECTIONS[name] = col
    return col

for name in ("01_Body", "02_Face", "03_Hair", "04_Clothing", "05_Accessories", "06_Stage"):
    collection(name)

ACTIVE = COLLECTIONS["01_Body"]

def place(obj, name, mat=None):
    obj.name = name
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    ACTIVE.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj

def material(name, rgb, roughness=0.8, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*rgb, 1)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metallic
    return m

skin = material('Warm natural skin', (.64, .40, .32), .89)
skin_shadow = material('Subtle lip and skin warmth', (.43, .22, .22))
hair_dark = material('Chestnut hair | base', (.105, .064, .052), .73)
hair_light = material('Chestnut hair | highlight', (.19, .113, .082), .70)
coat = material('Wool coat | deep charcoal', (.105, .113, .117), .94)
coat_light = material('Wool coat | smoky trim', (.22, .22, .215), .97)
dress = material('Dress | near-black navy', (.065, .078, .102), .91)
scarf_mat = material('Purple scarf | dusty violet', (.30, .18, .39), .99)
boots = material('Leather boots | brown-black', (.079, .064, .061), .61)
leather = material('Leather satchel | cognac', (.27, .145, .077), .76)
metal = material('Old silver | pendant and buckles', (.47, .49, .47), .38, .64)
eye_white = material('Eyes | warm ivory', (.82, .77, .71), .36)
iris = material('Iris | muted hazel', (.24, .185, .105), .35)
pupil = material('Pupil | almost black', (.018, .017, .014), .24)


def smooth(obj):
    if obj.type == 'MESH':
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def uv(name, loc, scale, mat, seg=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    ob = place(bpy.context.object, name, mat)
    ob.scale = scale
    smooth(ob)
    return ob


def cylinder_between(name, a, b, radius1, radius2, mat, vertices=14):
    a, b = Vector(a), Vector(b)
    direction = b - a
    if direction.length < 1e-5:
        return None
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1,
                                    radius2=radius2, depth=direction.length,
                                    location=(a+b)/2)
    ob = place(bpy.context.object, name, mat)
    ob.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    smooth(ob)
    return ob


def line(name, coords, thickness, mat, resolution=3):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 16
    curve.bevel_depth = thickness
    curve.bevel_resolution = resolution
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(coords)-1)
    for p, co in zip(spline.bezier_points, coords):
        p.co = co
        p.handle_left_type = 'AUTO'
        p.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, curve)
    ACTIVE.objects.link(ob)
    curve.materials.append(mat)
    return ob


def surface(name, points, faces, mat, thick=0):
    me = bpy.data.meshes.new(name+' mesh')
    me.from_pydata(points, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ACTIVE.objects.link(ob)
    me.materials.append(mat)
    smooth(ob)
    if thick:
        mod = ob.modifiers.new('Real textile edge thickness', 'SOLIDIFY')
        mod.thickness = thick
        mod.offset = 0
    sub = ob.modifiers.new('Soft cloth silhouette', 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 1
    return ob


def ring_skirt(name, heights, radii, mat, start=0, end=2*pi, count=24, offset=(0, 0), thick=.014):
    """Editable vertical loft, used for dress and coat panels."""
    verts, faces = [], []
    for k, (z, rx, ry) in enumerate(zip(heights, radii[0], radii[1])):
        for i in range(count+1):
            theta = start + (end-start)*i/count
            # small fold variations near lower hem
            ripple = (1 + (0.018 * sin(7*theta+z*2) if k == len(heights)-1 else 0))
            verts.append((offset[0]+rx*cos(theta)*ripple,
                          offset[1]+ry*sin(theta)*ripple, z))
    for k in range(len(heights)-1):
        for i in range(count):
            a = k*(count+1)+i
            faces.append((a, a+1, a+count+2, a+count+1))
    return surface(name, verts, faces, mat, thick)

# Coordinate system: Z up, front is -Y. 1 Blender unit ~ 1 metre.
ACTIVE = COLLECTIONS['01_Body']
# legs & upper body underneath clothing
for side, s in [('L', -1), ('R', 1)]:
    cylinder_between('Thigh_'+side, (s*.112, 0, .89), (s*.115, -.006, .49), .090, .074, dress)
    cylinder_between('Shin_'+side, (s*.115, -.006, .49), (s*.12, -.025, .16), .066, .049, dress)
    uv('Ankle_'+side, (s*.12,-.025,.16), (.052,.055,.078), dress)

uv('Pelvis | base', (0, .015, .93), (.19, .12, .17), dress)
uv('Torso | base', (0, .018, 1.18), (.20, .128, .31), dress)
cylinder_between('Neck', (0, -.01, 1.39), (0, -.015, 1.58), .066, .058, skin)

# Slightly non-identical arm positions
arm_spec = {'L': [(-.215,.002,1.365),(-.285,-.012,1.13),(-.295,-.075,.955)],
            'R':[( .215,.002,1.365),( .286,-.018,1.14),( .304,-.067,.975)]}
for side, pts in arm_spec.items():
    cylinder_between('Upper arm '+side, pts[0], pts[1], .082, .068, dress)
    cylinder_between('Forearm '+side, pts[1], pts[2], .069, .048, dress)
    uv('Palm '+side, (pts[2][0], pts[2][1]-.012, pts[2][2]-.067), (.046,.028,.075), skin)
    s = -1 if side == 'L' else 1
    for i in range(4):
        x = pts[2][0] + (i-1.5)*.021
        y = pts[2][1]-.025
        z = pts[2][2]-.108
        cylinder_between('Finger %s %d'%(side,i), (x,y,z),
                         (x+s*(i-1.5)*.002,y-.009,z-.055+(abs(i-1.5)*.01)),
                         .008,.005,skin,9)
    cylinder_between('Thumb '+side, (pts[2][0]-s*.044,pts[2][1]-.03,pts[2][2]-.046),
                     (pts[2][0]-s*.068,pts[2][1]-.058,pts[2][2]-.096), .013,.008,skin,10)

# Feet point forward. Distinct toes/boot shapes, with ankle shafts.
for side,s in [('L',-1),('R',1)]:
    uv('Boot ankle '+side, (s*.12,-.04,.15), (.067,.076,.142), boots)
    uv('Boot toe '+side, (s*.12,-.105,.083), (.083,.155,.074), boots)
    line('Boot sole welt '+side,
         [(s*.045,-.10,.048),(s*.12,-.205,.047),(s*.195,-.11,.048)], .008, coat_light)
    for j in range(3):
        line('Boot lace '+side+str(j),
             [(s*.092,-.099,.18+j*.029),(s*.148,-.095,.18+j*.029)], .004, coat_light)

ACTIVE = COLLECTIONS['02_Face']
# Head includes chin and cheeks; ears & nose add recognizable anatomy.
uv('Head | facial base', (0,-.018,1.620), (.132,.110,.179), skin,40,28)
uv('Chin shaping', (0,-.064,1.514), (.077,.070,.059), skin)
uv('Nose bridge', (0,-.129,1.616), (.020,.026,.049), skin)
uv('Nose tip', (0,-.150,1.587), (.026,.029,.018), skin)
for side,s in [('L',-1),('R',1)]:
    uv('Ear '+side,(s*.130,-.017,1.612),(.022,.020,.049),skin)
    uv('Cheek '+side,(s*.065,-.104,1.586),(.051,.025,.037),skin)
    uv('Eyeball '+side,(s*.055,-.112,1.659),(.032,.024,.022),eye_white,24,16)
    uv('Iris '+side,(s*.055,-.136,1.659),(.014,.006,.015),iris,18,12)
    uv('Pupil '+side,(s*.055,-.143,1.660),(.007,.0035,.009),pupil,16,10)
    line('Upper eyelid '+side,
        [(s*.028,-.137,1.665),(s*.052,-.143,1.678),(s*.080,-.128,1.667)], .0045,hair_dark)
    line('Eyebrow '+side,
        [(s*.024,-.116,1.701),(s*.051,-.127,1.710),(s*.088,-.103,1.702)], .007,hair_dark)
line('Mouth | upper lip', [(-.035,-.118,1.536),(0,-.132,1.533),(.035,-.118,1.536)],.0045,skin_shadow)
line('Mouth | lower lip', [(-.026,-.122,1.527),(0,-.13,1.524),(.026,-.122,1.527)],.0035,skin_shadow)

ACTIVE = COLLECTIONS['03_Hair']
uv('Hair volume | crown', (0,.004,1.751), (.145,.125,.102), hair_dark,32,20)
uv('Hair volume | back', (0,.074,1.629), (.145,.093,.188), hair_dark,32,20)
# Wavy tapered locks: segmented tapered tubes; edited later as individual hair clumps.
for side,s in [('L',-1),('R',1)]:
    for i in range(7):
        angle = (i/6)*pi*.90
        x = s*(.062+.092*sin(angle))
        y = -.010+.071*cos(angle)
        start = (x,y,1.76-.03*(i/6))
        mid = (x+s*.008,y-.018,1.645-.016*(i%2))
        end = (x+s*.012*sin(i*2),y-.015,1.490+.022*(i%3))
        m = hair_light if i in (1,5) else hair_dark
        cylinder_between('Wavy hair upper %s %s'%(side,i), start,mid,.029,.023,m,10)
        cylinder_between('Wavy hair tip %s %s'%(side,i), mid,end,.023,.003,m,10)
# Long side swept fringe, visible across forehead.
for i in range(7):
    sx=-.117+i*.027
    line('Soft fringe %d'%i, [(sx+.033,.003,1.80),(sx+.015,-.085,1.754),
                            (sx-.018,-.118,1.714-.014*(i%3))], .012 if i<4 else .009,
         hair_light if i in (1,4) else hair_dark)

ACTIVE = COLLECTIONS['04_Clothing']
# Under-dress: entire surface, soft near-knee hem.
ring_skirt('Inner dark dress', [.78,.91,1.08,1.33],
           ([.228,.199,.170,.158],[.185,.143,.129,.120]),dress,
           start=0,end=2*pi,count=40,thick=.012)
# Jacket rear arc and front panels. The front points toward -Y (angles pi .. 2pi).
# Rear section occupies positive Y; two separate front strips keep an open central split.
ring_skirt('Long charcoal coat | back', [.67,.85,1.10,1.40],
           ([.305,.265,.243,.232],[.237,.201,.174,.155]),coat,
           start=0,end=pi,count=28,thick=.018)
ring_skirt('Long charcoal coat | front L', [.67,.85,1.10,1.40],
           ([.305,.265,.243,.232],[.237,.201,.174,.155]),coat,
           start=pi,end=pi*1.45,count=14,thick=.018)
ring_skirt('Long charcoal coat | front R', [.67,.85,1.10,1.40],
           ([.305,.265,.243,.232],[.237,.201,.174,.155]),coat,
           start=pi*1.55,end=2*pi,count=14,thick=.018)
# Shoulder mantle/cape | a shorter, broader overlayer with drape.
ring_skirt('Capelet | upper shoulders', [1.22,1.30,1.405],
           ([.320,.315,.245],[.205,.181,.148]),coat_light,
           count=42,thick=.019)
# Arm sleeves with cuff borders.
for side, pts in arm_spec.items():
    cylinder_between('Wool coat sleeve '+side,pts[0],pts[1],.103,.093,coat,18)
    cylinder_between('Wool coat lower sleeve '+side,pts[1],pts[2],.093,.076,coat,18)
    uv('Thick cuff '+side,(pts[2][0],pts[2][1],pts[2][2]+.028),(.080,.077,.038),coat_light)
# Hem lines
for z,rx,ry,name in [(.681,.300,.231,'Coat hem'),(.780,.228,.185,'Dress hem')]:
    coords=[(rx*cos(t*2*pi/64),ry*sin(t*2*pi/64),z) for t in range(65)]
    line(name,coords,.007,coat_light)
# Layered scarf around neck: front-facing loops plus dangling tail.
for j,(z,rx,ry) in enumerate([(1.433,.134,.115),(1.468,.145,.115),(1.497,.132,.113)]):
    coords=[(rx*cos(t*2*pi/32),-.005+ry*sin(t*2*pi/32),z+.007*sin(4*t*2*pi/32)) for t in range(33)]
    line('Purple scarf wrap %d'%j, coords, .027,scarf_mat,4)
# Broad dangling scarf tail, a tapered quad with slight wave.
surface('Purple scarf hanging end',
        [(-.042,-.165,1.477),(.034,-.165,1.477),
         (-.023,-.184,1.150),(.061,-.182,1.148),
         (-.012,-.169,1.118),(.066,-.169,1.116)],
        [(0,1,3,2),(2,3,5,4)],scarf_mat,.007)
for j in range(8):
    x=-.01+j*.010
    line('Scarf fringe %02d'%j,[(x,-.171,1.12),(x-.002,-.172,1.085-(j%3)*.006)],.0025,scarf_mat)

ACTIVE = COLLECTIONS['05_Accessories']
line('Chest pendant cord',[(-.030,-.151,1.397),(0,-.161,1.365),(.028,-.151,1.399)],.004,boots)
uv('Silver pendant',(0,-.164,1.365),(.018,.009,.022),metal)
# Belt across front, pouch on character's left (viewer's right)
line('Leather belt across waist', [(-.184,-.131,1.051),(0,-.164,1.047),(.184,-.130,1.051)],.014,leather)
uv('Small leather pouch',(.204,-.154,1.014),(.063,.046,.077),leather)
uv('Pouch flap',(.204,-.198,1.047),(.060,.015,.021),boots)
uv('Tiny brass clasp',(.205,-.214,1.031),(.009,.006,.010),metal)

ACTIVE = COLLECTIONS['06_Stage']
# Neutral turntable and key/fill/rim lights, easy to remove for game export.
bpy.ops.mesh.primitive_cylinder_add(vertices=80,radius=.78,depth=.045,location=(0,0,-.03))
base=place(bpy.context.object,'Presentation plinth',material('Warm stone platform',(.36,.35,.33),.94))
bev=base.modifiers.new('Soft stone edge','BEVEL'); bev.width=.028; bev.segments=3
base.modifiers.new('Weighted normals','WEIGHTED_NORMAL')

def aim(obj, xyz):
    direction=Vector(xyz)-obj.location
    obj.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()

def area_light(name, xyz, energy, size):
    bpy.ops.object.light_add(type='AREA', location=xyz)
    ob=place(bpy.context.object,name)
    ob.data.energy=energy
    ob.data.shape='DISK'
    ob.data.size=size
    aim(ob,(0,0,1.0))
    return ob
area_light('Large warm key',(-3,-4,5),500,4.0)
area_light('Cool soft fill',(3,-2,2.7),250,3.0)
area_light('Hair rim',(1.0,2.5,3.2),520,2.5)

bpy.ops.object.camera_add(location=(3.4,-6.3,2.85))
cam=place(bpy.context.object,'Portrait camera')
aim(cam,(0,0,1.00))
cam.data.type='ORTHO'
cam.data.ortho_scale=2.32
SCENE.camera=cam

# World, color management and preview.
world=bpy.data.worlds.new('Soft studio environment') if not bpy.data.worlds else bpy.data.worlds[0]
SCENE.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.28,.29,.32,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
SCENE.render.engine='CYCLES'
SCENE.cycles.samples=48
SCENE.render.resolution_x=RESOLUTION[0]
SCENE.render.resolution_y=RESOLUTION[1]
SCENE.render.resolution_percentage=100
SCENE.render.image_settings.file_format='PNG'
try:
    SCENE.view_settings.view_transform='AgX'
except Exception:
    pass

# Set camera framing in the viewport; the collections are deliberately editable.
for obj in bpy.context.selected_objects:
    obj.select_set(False)
head=bpy.data.objects.get('Head | facial base')
if head:
    head.select_set(True)
    bpy.context.view_layer.objects.active=head
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'

if SAVE_BLEND or RENDER_PREVIEW:
    OUTPUT_DIR.mkdir(parents=True,exist_ok=True)
if SAVE_BLEND:
    path=OUTPUT_DIR/'scrollkeeper_character.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    print('SAVED:',path)
if RENDER_PREVIEW:
    SCENE.render.filepath=str(OUTPUT_DIR/'scrollkeeper_preview.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED:',SCENE.render.filepath)
print('Done: editable NPC blockout; no rig, UV unwrapping, facial shape keys, or export included.')

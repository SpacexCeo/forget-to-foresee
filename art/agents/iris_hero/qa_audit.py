"""Audit sheets of the Iris glb (Cycles): turnaround, face states, clip contact sheets, detail close-ups.

    blender -b -P art/agents/iris_hero/qa_audit.py -- <raw agent_iris.glb> <out dir> [parts]

parts: comma list of turn,face,loco,clips,detail,video (default: all but video). Uses the uncompressed glb
(Blender cannot import KTX2). `video` writes numbered frames of idle, walk, run and understand for ffmpeg.
Env: QA_SAMPLES (default 48), QA_TAG (file prefix, default "audit").
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector as V
from PIL import Image, ImageDraw, ImageFont

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
PARTS = (argv[2] if len(argv) > 2 else "turn,face,loco,clips,detail").split(",")
TAG = os.environ.get("QA_TAG", "audit")
TMP = os.path.join(OUT, "_tmp")
os.makedirs(TMP, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 30
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == kind
            sc.cycles.device = "GPU"
            print("[audit] device", kind)
            break
    except Exception as e:
        print("[audit] no", kind, e)
sc.cycles.samples = int(os.environ.get("QA_SAMPLES", "48"))
sc.cycles.transparent_max_bounces = 64
sc.cycles.max_bounces = 8
sc.cycles.use_denoising = True
sc.view_settings.view_transform = "AgX"
sc.view_settings.exposure = float(os.environ.get("QA_EXPOSURE", "-1.4"))   # the light rig is hot: at 0 black knit reads grey and tan skin white
sc.render.image_settings.file_format = "PNG"
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.42, 0.45, 0.5, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
bpy.ops.import_scene.gltf(filepath=SRC)
for o in bpy.data.objects:
    if o.name.endswith("_col"):
        o.hide_render = True
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.location = (0, 0, 0)
KEYS = [m.shape_keys for m in bpy.data.meshes if m.shape_keys]


def set_clip(clip, frame):
    """Make `clip` the active action of the rig and the shape keys (the importer leaves idle active)."""
    for o in [arm] + KEYS:
        ad = o.animation_data
        if not ad:
            continue
        for tr in ad.nla_tracks:
            tr.mute = True
        want = "OBJECT" if o == arm else "KEY"
        act = None
        for a in bpy.data.actions:
            if a.name.split(".")[0] not in (clip, clip + "_face"):
                continue
            if any(sl.target_id_type == want for sl in getattr(a, "slots", [])):
                act = a
                break
        if act is None and o == arm:
            act = bpy.data.actions.get(clip)
        ad.action = act
        if act is not None and hasattr(ad, "action_slot"):
            sl = [s for s in act.slots if s.target_id_type == want]
            if sl:
                ad.action_slot = sl[0]
    sc.frame_set(frame)


def set_keys(**vals):
    """Hold the current pose and set face morphs by hand (animation on the keys is released)."""
    for k in KEYS:
        if k.animation_data:
            k.animation_data.action = None
        for kb in k.key_blocks:
            if kb.name != "Basis":
                kb.value = vals.get(kb.name, 0.0)


def clip_len(clip):
    a = bpy.data.actions.get(clip)
    return int(round(a.frame_range[1])) + 1 if a else 1


fl = bpy.data.meshes.new("floor")
b = bmesh.new()
bmesh.ops.create_circle(b, cap_ends=True, segments=64, radius=4.0)
b.to_mesh(fl)
fo = bpy.data.objects.new("floor", fl)
sc.collection.objects.link(fo)
fm = bpy.data.materials.new("floor")
fm.use_nodes = True
fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.31, 0.30, 1)
fl.materials.append(fm)

LIGHTS = bpy.data.objects.new("lights", None)
sc.collection.objects.link(LIGHTS)


def light(name, loc, energy, size, color=(1, 1, 1)):
    L = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
    L.data.energy, L.data.size, L.data.color = energy, size, color
    L.location = V(loc)
    L.rotation_euler = (V((0, 0, 1.3)) - L.location).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(L)
    L.parent = LIGHTS


light("key", (-1.8, -2.4, 2.8), 520, 1.6, (1.0, 0.93, 0.85))
light("fill", (2.2, -1.6, 1.6), 140, 2.5, (0.8, 0.86, 1.0))
light("rim", (0.8, 2.6, 2.4), 420, 1.2, (0.95, 0.95, 1.0))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam


def shot(name, az, tgt, dist=6.0, ortho=None, lens=60, res=(1080, 1920), elev=0.0, rig_lights=True):
    """Render from azimuth `az` degrees (0 = front, 90 = her left side, 180 = back) around target `tgt`.
    The light rig turns with the camera, so every view is lit the same way."""
    a, e = math.radians(az), math.radians(elev)
    d = V((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.location = V(tgt) + d * dist
    cam.data.type = "ORTHO" if ortho else "PERSP"
    if ortho:
        cam.data.ortho_scale = ortho
    else:
        cam.data.lens = lens
    cam.rotation_euler = (V(tgt) - cam.location).to_track_quat("-Z", "Y").to_euler()
    LIGHTS.rotation_euler = (0, 0, a if rig_lights else 0)
    sc.render.resolution_x, sc.render.resolution_y = res
    p = os.path.join(TMP, name + ".png")
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    return p


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def sheet(name, rows, scale=1.0, quality=90):
    """rows: list of lists of (label, png path). Writes <OUT>/<TAG>_<name>.jpg."""
    ims = [[(lab, Image.open(p).convert("RGB")) for lab, p in r] for r in rows]
    if scale != 1.0:
        ims = [[(lab, im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)) for lab, im in r]
               for r in ims]
    W = max(sum(im.width for _, im in r) for r in ims)
    H = sum(max(im.height for _, im in r) for r in ims)
    out = Image.new("RGB", (W, H), (20, 20, 22))
    dr = ImageDraw.Draw(out)
    f = font(max(18, int(30 * scale)))
    y = 0
    for r in ims:
        x = 0
        for lab, im in r:
            out.paste(im, (x, y))
            dr.text((x + 13, y + 11), lab, fill=(0, 0, 0), font=f)
            dr.text((x + 12, y + 10), lab, fill=(255, 255, 255), font=f)
            x += im.width
        y += max(im.height for _, im in r)
    p = os.path.join(OUT, f"{TAG}_{name}.jpg")
    out.save(p, quality=quality)
    print("[audit] wrote", p, out.size)


VIEWS = (("front", 0), ("three-quarter", 40), ("side", 90), ("back", 180))

if "turn" in PARTS:
    set_clip("idle", 0)
    set_keys()
    sheet("turnaround", [[(n, shot("turn_" + n, az, (0, 0, 0.90), ortho=1.95)) for n, az in VIEWS]])
    sheet("turnaround_rear_quarter", [[(n, shot("turn2_" + n, az, (0, 0, 0.90), ortho=1.95))
                                       for n, az in (("three-quarter back", 140), ("other side", 270),
                                                     ("three-quarter front right", 320))]])

if "face" in PARTS:
    F = dict(tgt=(0.0, -0.03, 1.62), dist=1.0, lens=85, res=(1080, 1080))
    set_clip("idle", 0)
    set_keys()
    row = [("neutral", shot("face_neutral", 12, **F))]
    set_keys(blink_L=1.0, blink_R=1.0)
    row.append(("blink", shot("face_blink", 12, **F)))
    set_keys(smile=0.8)
    row.append(("smile 0.8", shot("face_smile", 12, **F)))
    n = clip_len("understand")
    best = int(round(0.58 * 75))
    set_clip("understand", best)
    row.append((f"understand wink f{best}", shot("face_wink", 12, **F)))
    set_clip("idle", 0)
    set_keys()
    row2 = [("profile", shot("face_profile", 90, **F)), ("three-quarter", shot("face_q3", 40, **F)),
            ("other three-quarter", shot("face_q3r", -40, **F)),
            ("hairline from above", shot("face_top", 0, (0, -0.02, 1.66), dist=1.0, lens=70, res=(1080, 1080), elev=38))]
    set_keys(mouth_open=0.6, lips_part=0.4)
    row3 = [("mouth open 0.6", shot("face_open", 12, **F))]
    set_keys(smile=1.0, squint_L=0.3, squint_R=0.3, brow_up_L=0.5, brow_up_R=0.5, mouth_open=0.3)
    row3.append(("celebrate face", shot("face_celebrate", 12, **F)))
    set_keys(brow_inner_L=0.7, brow_inner_R=0.7, frown=0.5)
    row3.append(("defeat face", shot("face_defeat", 12, **F)))
    set_clip("talk", 20)
    row3.append(("talk f20", shot("face_talk", 12, **F)))
    sheet("face", [row, row2, row3], scale=0.75)

if "loco" in PARTS:
    for clip in ("idle", "walk", "run"):
        n = clip_len(clip) - (1 if clip != "idle" else 0)
        fr = [int(round(i * n / 8)) for i in range(8)]
        rows = []
        for vn, az in (("side", 90), ("front", 0), ("back", 180)):
            row = []
            for f in fr:
                set_clip(clip, f)
                row.append((f"{clip} {vn} f{f}", shot(f"loco_{clip}_{vn}_{f}", az, (0, 0, 0.92), ortho=2.0, res=(720, 1280))))
            rows.append(row)
        sheet(clip, rows, scale=0.75)

if "clips" in PARTS:
    rows = []
    for clip in ("talk", "think", "gesture_offer", "celebrate", "defeat", "understand"):
        n = clip_len(clip)
        row = []
        for i in range(6):
            f = int(round((i + 0.5) * n / 6))
            set_clip(clip, f)
            row.append((f"{clip} f{f}", shot(f"clip_{clip}_{f}", 30, (0, 0, 0.92), ortho=2.0, res=(720, 1280))))
        rows.append(row)
    sheet("clips", rows, scale=0.6)

if "detail" in PARTS:
    set_clip("idle", 0)
    set_keys()
    D = dict(res=(1080, 1080))
    r1 = [("waist front", shot("d_waist_f", 0, (0, 0, 1.02), dist=1.6, lens=70, **D)),
          ("waist three-quarter", shot("d_waist_q", 40, (0, 0, 1.02), dist=1.6, lens=70, **D)),
          ("waist back", shot("d_waist_b", 180, (0, 0, 1.00), dist=1.6, lens=70, **D)),
          ("neckline", shot("d_neck", 0, (0, 0, 1.38), dist=1.3, lens=70, **D))]
    r2 = [("trainers side", shot("d_shoe_s", 90, (0, 0, 0.10), dist=1.3, lens=70, elev=8, **D)),
          ("trainers front three-quarter", shot("d_shoe_q", 35, (0, 0, 0.10), dist=1.3, lens=70, elev=18, **D)),
          ("hand and cuff", shot("d_hand", 60, (0.28, 0, 0.84), dist=1.0, lens=70, **D)),
          ("hair back", shot("d_hair_b", 180, (0, 0.02, 1.58), dist=1.2, lens=70, **D))]
    r3 = [("hair side", shot("d_hair_s", 90, (0, 0.02, 1.60), dist=1.2, lens=70, **D)),
          ("hair crown", shot("d_hair_t", 150, (0, 0.0, 1.66), dist=1.1, lens=70, elev=45, **D)),
          ("torso front", shot("d_torso_f", 0, (0, 0, 1.25), dist=2.0, lens=70, **D)),
          ("torso back", shot("d_torso_b", 180, (0, 0, 1.25), dist=2.0, lens=70, **D))]
    sheet("detail", [r1, r2, r3], scale=0.75)

if "video" in PARTS:
    for clip, az in (("idle", 25), ("walk", 90), ("walk", 0), ("run", 90), ("run", 0), ("understand", 12)):
        n = clip_len(clip) - (1 if clip in ("walk", "run") else 0)
        d = os.path.join(OUT, "frames", f"{clip}_{az}")
        os.makedirs(d, exist_ok=True)
        for f in range(n):
            set_clip(clip, f)
            if clip == "understand":
                p = shot("v", az, (0.0, -0.03, 1.50), dist=2.2, lens=70, res=(1080, 1080))
            else:
                p = shot("v", az, (0, 0, 0.92), ortho=2.0, res=(1080, 1080))
            os.replace(p, os.path.join(d, f"{f:04d}.png"))

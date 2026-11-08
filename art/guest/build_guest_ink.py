"""Procedural source for guest.glb, round 3: the ink Guest (owner design input 08.11).

    blender -b -P art/guest/build_guest_ink.py -- build     # model, rig, clips, export guest_raw.glb
    blender -b -P art/guest/build_guest_ink.py -- render    # QA renders (close, and far through fog)
    blender -b -P art/guest/build_guest_ink.py -- all

Design (our own; the owner's reference image is third-party mood only and is not copied):
a huge, calm, pale creature that hovers. A smooth domed, bulbous head with two small dark
wide-set eyes; a milky, softly lit translucent body with faint inner organs glowing through
the skin; from the lower body hang long ink-black tendrils that flow downward and bleed at
the tips like ink in water, with a few drops drifting below them. Muted greys on warm
off-white, a sumi-ink feeling: the skin carries grey ink washes rising from the tendril roots.
The two front tendrils are longer: they paint the logogram on the glass (clip `draw`).
No legs, no face beyond the eyes, no radial seven-limb body.

Runtime parts (one armature `guest_rig`):
  guest_body    M_Guest_Skin   translucent skin (KHR transmission + volume + ior), vertex ink washes
  guest_core    M_Guest_Core   inner organs, faintly emissive (the game pulses it)
  guest_eyes    M_Guest_Ink    two small glossy black eyes (the ink texture's opaque part)
  guest_ink     M_Guest_Ink    tendrils and drops, black with an alpha bleed at the tips
Clips: idle (8 s loop), draw (4 s loop, the right front tendril tip traces a ring),
react (1.8 s one-shot), approach (3 s, glides 2.6 m toward the glass and holds),
recede (3 s, from there back to rest).
Sockets: socket_draw_tip (tip of the drawing tendril), socket_core, socket_head.
Blender Z-up, front -Y (glTF: Y-up, front +Z). Pivot on the ground under the body.
"""

import json
import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import blender_kit as K  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
QA_DIR = os.path.join(REPO, "docs", "art", "qa", "guest")
TEX_DIR = os.path.join(HERE, "textures")
GLB_RAW = os.path.join(HERE, "guest_raw.glb")
STATS_PATH = os.path.join(QA_DIR, "build-stats.json")
FPS = 30
SEED = 808
TRI_BUDGET = 16000


def log(*a):
    print("[guest-ink]", *a, flush=True)


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ shape

# body profile: (z, radius) from the bottom of the mantle to the crown
# a big domed head over a smaller mantle that flows into the tendrils (not a snowman)
PROFILE = [(2.80, 0.00), (2.84, 0.30), (3.05, 0.62), (3.45, 0.80), (3.95, 0.84), (4.45, 0.74), (4.85, 0.66), (5.25, 0.86), (5.75, 1.24), (6.35, 1.48), (6.95, 1.46), (7.45, 1.20), (7.82, 0.70), (7.98, 0.00)]
DEPTH = 0.88            # front-back squash
EYE_Z, EYE_X, EYE_R = 6.05, 0.50, 0.090
HEAD_Z0, HEAD_Z1 = 5.05, 7.98
BODY_C = Vector((0, 0, 3.85))
N_TENDRIL = 11


def radius_at(z):
    """Catmull-Rom through the profile (a per-segment smoothstep flattens the slope at every
    point and terraces the surface into rings)."""
    P = PROFILE
    for i in range(len(P) - 1):
        (z1, r1), (z2, r2) = P[i], P[i + 1]
        if z1 <= z <= z2:
            r0 = P[max(i - 1, 0)][1]
            r3 = P[min(i + 2, len(P) - 1)][1]
            t = (z - z1) / (z2 - z1)
            r = 0.5 * ((2 * r1) + (-r0 + r2) * t + (2 * r0 - 5 * r1 + 4 * r2 - r3) * t * t +
                       (-r0 + 3 * r1 - 3 * r2 + r3) * t ** 3)
            return max(r, 0.0)
    return 0.0


def body_point(z, th, rng_lumps):
    r = radius_at(z)
    # soft organic asymmetry: a few broad lumps, a forward brow over the eyes
    lump = sum(a * math.exp(-((z - zc) / 0.45) ** 2) * math.cos(th - tc) for a, zc, tc in rng_lumps)
    r = r * (1.0 + lump)
    return Vector((r * math.cos(th), r * math.sin(th) * DEPTH, z))


def build_body(rng):
    lumps = [(rng.uniform(0.015, 0.035), rng.uniform(2.6, 6.6), rng.uniform(0, 2 * math.pi)) for _ in range(6)]
    nseg, rows = 64, 58
    zs = [PROFILE[0][0] + (PROFILE[-1][0] - PROFILE[0][0]) * (0.5 - 0.5 * math.cos(math.pi * i / rows)) for i in range(rows + 1)]
    bm = bmesh.new()
    ring = []
    for i, z in enumerate(zs[1:-1], 1):
        ring.append([bm.verts.new(body_point(z, -math.pi / 2 + 2 * math.pi * j / nseg, lumps)) for j in range(nseg)])
    bot = bm.verts.new((0, 0, zs[0]))
    top = bm.verts.new((0, 0, zs[-1]))
    for r0, r1 in zip(ring, ring[1:]):
        for j in range(nseg):
            k = (j + 1) % nseg
            bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
    for j in range(nseg):
        k = (j + 1) % nseg
        bm.faces.new((bot, ring[0][k], ring[0][j]))
        bm.faces.new((top, ring[-1][j], ring[-1][k]))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(f.calc_center_median() - Vector((0, 0, f.calc_center_median().z))) < 0:
            f.normal_flip()
    return bm, lumps


def eye_center(side):
    r = radius_at(EYE_Z)
    th = math.atan2(-0.93, side * EYE_X / r)
    p = Vector((r * math.cos(th) * 0.98, r * math.sin(th) * DEPTH * 0.98, EYE_Z))
    return p


def build_eyes():
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    for s in (-1, 1):
        c = eye_center(s)
        geom = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=EYE_R)
        bmesh.ops.scale(bm, vec=(1.0, 0.75, 1.1), verts=geom["verts"])
        bmesh.ops.translate(bm, vec=c, verts=geom["verts"])
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = (0.5, 0.25)            # opaque ink
    return bm


def ellipsoid(bm, c, r, seg=14, rings=9):
    geom = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=r, verts=geom["verts"])
    bmesh.ops.translate(bm, vec=c, verts=geom["verts"])


def build_organs(rng):
    """Faint inner organs seen through the skin: a mantle sac, a heart, a branching brain lobe."""
    bm = bmesh.new()
    ellipsoid(bm, Vector((0.0, 0.05, 3.6)), (0.50, 0.40, 0.65))
    ellipsoid(bm, Vector((0.18, -0.05, 4.35)), (0.22, 0.18, 0.26))
    ellipsoid(bm, Vector((0.0, 0.10, 6.55)), (0.78, 0.60, 0.55))
    ellipsoid(bm, Vector((-0.32, -0.05, 6.20)), (0.32, 0.24, 0.27))
    ellipsoid(bm, Vector((0.34, -0.05, 6.18)), (0.30, 0.24, 0.26))
    # a cord joining them
    pts = [Vector((0.02 * math.sin(i), 0.03, 4.1 + 2.0 * i / 8)) for i in range(9)]
    tube(bm, pts, lambda t: 0.10 - 0.03 * math.sin(math.pi * t), 8)
    return bm


# ------------------------------------------------------------------ tendrils

class Tendril:
    def __init__(self, idx, pts, radius0, bones):
        self.idx, self.pts, self.r0, self.bones = idx, pts, radius0, bones
        acc = [0.0]
        for a, b in zip(pts, pts[1:]):
            acc.append(acc[-1] + (b - a).length)
        self.s = acc

    def point(self, s):
        s = min(max(s, 0.0), self.s[-1])
        for i in range(len(self.s) - 1):
            if self.s[i + 1] >= s:
                f = (s - self.s[i]) / max(self.s[i + 1] - self.s[i], 1e-9)
                return self.pts[i].lerp(self.pts[i + 1], f)
        return self.pts[-1].copy()


def catmull(P, n):
    out = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1].copy())
    return out


def tendril_paths(rng):
    out = []
    for i in range(N_TENDRIL):
        th = -math.pi / 2 + 2 * math.pi * (i + 0.5) / N_TENDRIL + rng.uniform(-0.12, 0.12)
        front = max(0.0, -math.sin(th))
        z0 = 2.82 + 0.20 * rng.random()
        r0 = radius_at(z0) * 0.86
        root = Vector((r0 * math.cos(th), r0 * math.sin(th) * DEPTH, z0))
        out_dir = Vector((math.cos(th), math.sin(th) * DEPTH, 0)).normalized()
        L = 2.0 + 0.6 * rng.random() + (0.25 if front > 0.8 else 0.0)
        L = min(L, z0 - 0.35)                # tips stay above the floor
        sway = Vector((-out_dir.y, out_dir.x, 0)) * rng.uniform(-0.35, 0.35)
        ctrl = [root,
                root + out_dir * 0.35 + Vector((0, 0, -0.35)),
                root + out_dir * 0.55 + sway * 0.5 + Vector((0, 0, -L * 0.42)),
                root + out_dir * 0.40 + sway + Vector((0, 0, -L * 0.75)),
                root + out_dir * 0.55 + sway * 0.6 + Vector((0, 0, -L))]
        if front > 0.8:   # the drawing tendrils reach forward toward the glass
            for k in (3, 4):
                ctrl[k] += Vector((0, -0.55 * (k - 2), 0.15 * (k - 2)))
        out.append((th, catmull(ctrl, 5), L))
    return out


def frames(pts):
    T = [(pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(len(pts))]
    up = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    N = [T[0].cross(up).normalized()]
    for i in range(1, len(pts)):
        n = N[-1] - T[i] * N[-1].dot(T[i])
        N.append(n.normalized() if n.length > 1e-6 else N[-1])
    return T, N


def tube(bm, pts, rfun, sides, uv=None):
    T, N = frames(pts)
    rings = []
    for i, p in enumerate(pts):
        t = i / (len(pts) - 1)
        B = T[i].cross(N[i])
        r = rfun(t)
        rings.append([bm.verts.new(p + (N[i] * math.cos(2 * math.pi * j / sides) + B * math.sin(2 * math.pi * j / sides)) * r) for j in range(sides)])
    faces = []
    for a, b in zip(rings, rings[1:]):
        for j in range(sides):
            k = (j + 1) % sides
            faces.append(bm.faces.new((a[j], a[k], b[k], b[j])))
    tip = bm.verts.new(pts[-1] + T[-1] * rfun(1.0) * 0.5)
    for j in range(sides):
        faces.append(bm.faces.new((rings[-1][j], rings[-1][(j + 1) % sides], tip)))
    return rings, tip, faces


def build_ink(rng, paths):
    """Tendrils (UV v along the length for the alpha bleed) and drifting drops."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    tend = []
    vmeta = {}   # vert -> (tendril index, arc fraction)
    for i, (th, pts, L) in enumerate(paths):
        r0 = 0.085 + 0.025 * rng.random()
        rf = lambda t, r0=r0: r0 * (1.0 - t) ** 0.85 + 0.010 + 0.025 * math.exp(-((t - 0.82) / 0.07) ** 2)
        rings, tip, faces = tube(bm, pts, rf, 7)
        n = len(rings)
        for ri, ring in enumerate(rings):
            for v in ring:
                vmeta[v] = (i, ri / (n - 1))
        vmeta[tip] = (i, 1.0)
        for f in faces:
            for lp in f.loops:
                ti, s = vmeta[lp.vert]
                ang = math.atan2((lp.vert.co - pts[0]).y, (lp.vert.co - pts[0]).x)
                lp[uvl].uv = ((ang / (2 * math.pi)) % 1.0, s)
        tend.append(Tendril(i, pts, r0, [f"guest_tendril_{i}_{k + 1}" for k in range(5)]))
    # drops: a few ink droplets drifting below the longest tips
    drops = []
    for i, (th, pts, L) in sorted(enumerate(paths), key=lambda x: -x[1][2])[:5]:
        d = pts[-1] - pts[-2]
        for k in range(2):
            c = pts[-1] + d.normalized() * (0.25 + 0.35 * k) + Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), -0.15 * k))
            c.z = max(c.z, 0.12 + 0.08 * k)        # the drops never sink below the floor
            geom = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.045 - 0.012 * k)
            bmesh.ops.scale(bm, vec=(1.0, 1.0, 1.7), verts=geom["verts"])
            bmesh.ops.translate(bm, vec=c, verts=geom["verts"])
            for v in geom["verts"]:
                vmeta[v] = (i, 1.0)
            for f in {f for v in geom["verts"] for f in v.link_faces}:
                for lp in f.loops:
                    lp[uvl].uv = (0.5, 0.97)   # drops sit in the bleed zone
            drops.append(c)
    return bm, tend, vmeta


def ink_texture(path, w=256, h=1024):
    """Black ink: opaque along the tendril, bleeding out at the tips (v -> 1) in soft,
    noisy wisps, like ink spreading in water."""
    rng = np.random.default_rng(SEED)
    v = np.linspace(0, 1, h)[:, None]
    u = np.linspace(0, 1, w)[None, :]
    noise = np.zeros((h, w))
    for f, a in ((3, 0.5), (7, 0.3), (17, 0.2)):
        ph = rng.random(4) * 6.28
        noise += a * (np.sin(2 * np.pi * f * u + ph[0] + 3 * np.sin(2 * np.pi * 2 * v + ph[1])) *
                      np.sin(2 * np.pi * f * 0.5 * v + ph[2]))
    edge = 0.80 + 0.07 * noise
    alpha = 1.0 - np.clip((v - edge) / 0.16, 0, 1)
    alpha = np.clip(alpha + 0.25 * np.clip(noise, 0, 1) * (v > 0.85), 0, 1)
    shade = 0.010 + 0.018 * (0.5 + 0.5 * noise) + 0.03 * np.clip((v - 0.7) / 0.3, 0, 1)
    img = np.dstack([shade, shade * 0.96, shade * 1.05, alpha])[::-1]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = bpy.data.images.new("guest_ink_basecolor", w, h, alpha=True)
    im.pixels = img.astype(np.float32).ravel()
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    return im


# ------------------------------------------------------------------ materials

def mat_skin():
    m = bpy.data.materials.new("M_Guest_Skin")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.36
    b.inputs["Transmission Weight"].default_value = 0.35
    b.inputs["IOR"].default_value = 1.35
    b.inputs["Subsurface Weight"].default_value = 0.25
    b.inputs["Subsurface Radius"].default_value = (0.9, 0.7, 0.55)
    return m


def mat_core():
    m = bpy.data.materials.new("M_Guest_Core")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.34, 0.30, 0.27, 1)
    b.inputs["Roughness"].default_value = 0.6
    b.inputs["Emission Color"].default_value = (1.0, 0.78, 0.58, 1)
    b.inputs["Emission Strength"].default_value = 0.6
    return m


def mat_eye():
    m = bpy.data.materials.new("M_Guest_Eye")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.008, 0.008, 0.010, 1)
    b.inputs["Roughness"].default_value = 0.08
    return m


def mat_ink(img):
    m = bpy.data.materials.new("M_Guest_Ink")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = img
    nt.links.new(tx.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tx.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.22
    m.blend_method = "BLEND" if hasattr(m, "blend_method") else m.blend_method
    try:
        m.surface_render_method = "BLENDED"
    except Exception:
        pass
    return m


# ------------------------------------------------------------------ build

def obj_from_bm(name, bm, mat, col):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    me.materials.append(mat)
    me.shade_smooth()
    return o


def paint_skin(obj, paths):
    """Muted greys on warm off-white: ink washes rising from the tendril roots, a darker
    rim around the eyes, a faint vertical veining, a lighter crown."""
    me = obj.data
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    roots = [pts[0] for _, pts, _ in paths]
    eyes = [eye_center(-1), eye_center(1)]
    base = np.array([0.80, 0.78, 0.74])
    ink = np.array([0.075, 0.072, 0.078])
    data = []
    for lp in me.loops:
        p = me.vertices[lp.vertex_index].co
        k = 0.0
        for r in roots:
            dz = p.z - r.z
            horiz = math.hypot(p.x - r.x, (p.y - r.y) / DEPTH)
            if -0.2 < dz < 2.6:
                # the wash climbs from each root in a widening, fading plume (ink rising in water)
                streak = 0.75 + 0.25 * math.sin(p.z * 5.0 + math.atan2(p.y, p.x) * 7.0)
                k = max(k, math.exp(-(horiz / (0.22 + 0.30 * max(dz, 0))) ** 2) *
                        (1.0 - max(dz, 0) / 2.6) ** 1.1 * streak)
        k += 0.12 * (0.5 + 0.5 * math.sin(p.x * 9.0 + 3.0 * math.sin(p.z * 2.3))) * smooth(2.8, 4.7, p.z) * (1 - smooth(4.8, 5.5, p.z))
        for e in eyes:
            k = max(k, 0.55 * math.exp(-((p - e).length / 0.17) ** 2))
        k -= 0.08 * smooth(6.7, 7.6, p.z)
        k = min(1.0, max(-0.1, k))
        c = base * (1 - k) + ink * k
        data += [c[0], c[1], c[2], 1.0]
    col.data.foreach_set("color", data)


def build_rig(col, tend):
    arm = bpy.data.armatures.new("guest_rig")
    rig = bpy.data.objects.new("guest_rig", arm)
    col.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones

    def bone(name, h, t, parent=None, deform=True):
        b = eb.new(name)
        b.head, b.tail = Vector(h), Vector(t)
        b.use_deform = deform
        if parent:
            b.parent = eb[parent]
        return b
    bone("root", (0, 0, 0), (0, 0.6, 0), deform=False)
    bone("hover", (0, 0, 3.1), (0, 0, 3.5), "root", deform=False)
    bone("guest_body", (0, 0, 2.7), (0, 0, 5.0), "hover")
    bone("guest_head", (0, 0, 5.0), (0, 0, 7.9), "guest_body")
    for td in tend:
        Ls = td.s[-1]
        prev = "guest_body"
        for k, nm in enumerate(td.bones):
            bone(nm, td.point(Ls * k / 5), td.point(Ls * (k + 1) / 5), prev)
            prev = nm
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return rig


def skin(obj, rig, weight_fn):
    obj.parent = rig
    mod = obj.modifiers.new("arm", "ARMATURE")
    mod.object = rig
    groups = {}
    me = obj.data
    for v in me.vertices:
        for name, w in weight_fn(v).items():
            if w <= 1e-4:
                continue
            if name not in groups:
                groups[name] = obj.vertex_groups.new(name=name)
            groups[name].add([v.index], w, "REPLACE")


def head_body_w(z):
    a = smooth(4.85, 5.35, z)
    return {"guest_body": 1 - a, "guest_head": a}


def chain_w(td, s):
    """5-bone chain weights at arc fraction s (smooth blend across joints)."""
    x = s * 5
    i = min(4, int(x))
    f = x - i
    w = {td.bones[i]: 1.0}
    if f < 0.25 and i > 0:
        a = 0.5 + 2 * f
        w = {td.bones[i]: a, td.bones[i - 1]: 1 - a}
    elif f > 0.75 and i < 4:
        a = 0.5 + 2 * (1 - f)
        w = {td.bones[i]: a, td.bones[i + 1]: 1 - a}
    if s < 0.06:
        k = s / 0.06
        w = {n: v * k for n, v in w.items()}
        w["guest_body"] = 1 - k
    return w


# ------------------------------------------------------------------ animation

class Anim:
    def __init__(self, rig):
        self.rig = rig
        self.rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}

    def q(self, bone, world_axis, ang):
        ax = (self.rest[bone].to_3x3().inverted() @ Vector(world_axis)).normalized()
        return Quaternion(ax, ang)

    def loc(self, bone, world_off):
        return self.rest[bone].to_3x3().inverted() @ Vector(world_off)

    def action(self, name, seconds):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        if self.rig.animation_data is None:
            self.rig.animation_data_create()
        self.rig.animation_data.action = act
        n = int(round(seconds * FPS))
        act.use_frame_range = True
        act.frame_start, act.frame_end = 0, n
        return act, n

    def key(self, f, pose):
        for pb in self.rig.pose.bones:
            q, l, s = pose.get(pb.name, (None, None, None))
            pb.rotation_quaternion = q if q is not None else Quaternion()
            pb.location = l if l is not None else Vector()
            pb.scale = (s, s, s) if s is not None else (1, 1, 1)
            pb.keyframe_insert("rotation_quaternion", frame=f)
            pb.keyframe_insert("location", frame=f)
            if pb.name in ("guest_body", "guest_head"):
                pb.keyframe_insert("scale", frame=f)


def wave_pose(an, tend, t, T, amp=1.0, skip=()):
    """Tendrils flow: a travelling wave down each chain, phase-shifted per tendril."""
    pose = {}
    for td in tend:
        if td.idx in skip:
            continue
        th = 2 * math.pi * td.idx / N_TENDRIL
        side = Vector((-math.sin(th), math.cos(th), 0))
        out = Vector((math.cos(th), math.sin(th), 0))
        for k, nm in enumerate(td.bones):
            ph = 2 * math.pi * t / T - 0.75 * k + td.idx * 1.7
            a = amp * (0.05 + 0.035 * k)
            q = an.q(nm, side, a * math.sin(ph)) @ an.q(nm, out, 0.6 * a * math.cos(ph * 0.7 + 1.0))
            pose[nm] = (q, None, None)
    return pose


def idle_pose(an, tend, t, T, amp=1.0, skip=()):
    pose = wave_pose(an, tend, t, T, amp, skip)
    w = 2 * math.pi * t / T
    pose["hover"] = (None, an.loc("hover", (0, 0, 0.07 * math.sin(w))), None)
    pose["guest_body"] = (an.q("guest_body", (1, 0, 0), 0.02 * math.sin(w + 0.5)), None, 1.0 + 0.018 * math.sin(2 * w))
    pose["guest_head"] = (an.q("guest_head", (0, 1, 0), 0.03 * math.sin(w * 0.5 + 1.0)) @
                          an.q("guest_head", (1, 0, 0), 0.025 * math.sin(w + 2.0)), None, 1.0 + 0.012 * math.sin(2 * w + 1.0))
    return pose


def draw_tendril(tend):
    """The right front tendril (the one most toward -Y on the agent's right)."""
    fronts = sorted(tend, key=lambda td: td.pts[0].y)[:2]
    return max(fronts, key=lambda td: -td.pts[0].x)


def make_clips(an, tend):
    clips = {}
    T = 8.0
    act, n = an.action("idle", T)
    for f in range(0, n + 1, 4):
        an.key(f, idle_pose(an, tend, f / FPS, T))
    clips["idle"] = act
    # draw: the drawing tendril lifts toward the glass and its last bones circle
    dt_ = draw_tendril(tend)
    T = 4.0
    act, n = an.action("draw", T)
    for f in range(0, n + 1, 3):
        t = f / FPS
        pose = idle_pose(an, tend, t, 8.0, 0.6, skip=(dt_.idx,))
        a = 2 * math.pi * t / T
        for k, nm in enumerate(dt_.bones):
            lift = (-0.32 if k < 2 else -0.12)
            circ = 0.0 if k < 2 else 0.30
            q = an.q(nm, (1, 0, 0), lift + circ * math.sin(a)) @ an.q(nm, (0, 0, 1), circ * math.cos(a))
            pose[nm] = (q, None, None)
        pose["guest_head"] = (an.q("guest_head", (1, 0, 0), -0.06), None, None)
        an.key(f, pose)
    clips["draw"] = act
    # react: the head draws back, the tendrils curl up and outward, then settle
    T = 1.8
    act, n = an.action("react", T)
    for f in range(0, n + 1, 2):
        t = f / FPS
        e = math.sin(math.pi * min(1.0, t / T)) ** 1.5
        pose = idle_pose(an, tend, t, 8.0, 1.0)
        for td in tend:
            th = 2 * math.pi * td.idx / N_TENDRIL
            side = Vector((-math.sin(th), math.cos(th), 0))
            for k, nm in enumerate(td.bones):
                q0 = pose.get(nm, (Quaternion(), None, None))[0]
                pose[nm] = (an.q(nm, side, -0.22 * e * (1 + 0.3 * k)) @ q0, None, None)
        pose["guest_head"] = (an.q("guest_head", (1, 0, 0), 0.18 * e), None, 1.0 + 0.04 * e)
        pose["hover"] = (None, an.loc("hover", (0, 0.25 * e, 0.12 * e)), None)
        an.key(f, pose)
    clips["react"] = act
    # approach / recede: glide toward the glass (front = -Y) and lean in; tendrils trail
    for name, rev in (("approach", False), ("recede", True)):
        T = 3.0
        act, n = an.action(name, T)
        for f in range(0, n + 1, 3):
            t = f / FPS
            u = t / T
            e = smooth(0, 1, 1 - u if rev else u)
            pose = idle_pose(an, tend, t, 8.0, 0.8)
            vel = math.sin(math.pi * u)
            for td in tend:
                for k, nm in enumerate(td.bones):
                    q0 = pose.get(nm, (Quaternion(), None, None))[0]
                    pose[nm] = (an.q(nm, (1, 0, 0), (0.10 if not rev else -0.10) * vel * (0.4 + 0.25 * k)) @ q0, None, None)
            pose["hover"] = (None, an.loc("hover", (0, -2.6 * e, 0.10 * math.sin(math.pi * u))), None)
            pose["guest_body"] = (an.q("guest_body", (1, 0, 0), -0.08 * e), None, None)
            pose["guest_head"] = (an.q("guest_head", (1, 0, 0), -0.10 * e), None, None)
            an.key(f, pose)
        clips[name] = act
    return clips


def stage_build():
    rng = random.Random(SEED)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    col = bpy.context.scene.collection
    bpy.context.scene.render.fps = FPS
    paths = tendril_paths(rng)
    body_bm, _ = build_body(rng)
    body = obj_from_bm("guest_body", body_bm, mat_skin(), col)
    paint_skin(body, paths)
    core = obj_from_bm("guest_core", build_organs(rng), mat_core(), col)
    ink_bm, tend, _ = build_ink(rng, paths)
    ink_mat = mat_ink(ink_texture(os.path.join(TEX_DIR, "guest_ink_basecolor.png")))
    ink = obj_from_bm("guest_ink", ink_bm, ink_mat, col)
    eyes = obj_from_bm("guest_eyes", build_eyes(), ink_mat, col)
    rig = build_rig(col, tend)
    skin(body, rig, lambda v: head_body_w(v.co.z))
    skin(core, rig, lambda v: head_body_w(v.co.z))
    skin(eyes, rig, lambda v: {"guest_head": 1.0})

    def ink_w(v):
        best, bi, bs = 1e9, 0, 0.0
        for td in tend:
            for j, p in enumerate(td.pts):
                d = (p - v.co).length
                if d < best:
                    best, bi, bs = d, td.idx, td.s[j] / td.s[-1]
        return chain_w(tend[bi], bs)
    skin(ink, rig, ink_w)
    # sockets
    an = Anim(rig)
    dt_ = draw_tendril(tend)
    socks = {}
    for name, bone, pos in (("socket_draw_tip", dt_.bones[-1], dt_.pts[-1]), ("socket_core", "guest_body", BODY_C),
                            ("socket_head", "guest_head", Vector((0, 0, 6.4)))):
        e = bpy.data.objects.new(name, None)
        col.objects.link(e)
        e.parent = rig
        e.parent_type = "BONE"
        e.parent_bone = bone
        e.matrix_world = Matrix.Translation(pos)
        socks[name] = [round(c, 3) for c in pos]
    clips = make_clips(an, tend)
    # NLA strips so the exporter writes each action as its own animation
    rig.animation_data.action = None
    for name, act in clips.items():
        tr = rig.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, act)
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in (body, core, eyes, ink)}
    log("tris", tris, sum(tris.values()))
    for o in bpy.context.scene.objects:
        o.select_set(o.name.startswith("guest") or o.name.startswith("socket_"))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=GLB_RAW, export_format="GLB", use_selection=True, export_yup=True,
                              export_extras=True, export_animations=True, export_animation_mode="NLA_TRACKS",
                              export_force_sampling=True, export_frame_step=1, export_def_bones=True,
                              export_skins=True, export_influence_nb=4, export_vertex_color="ACTIVE",
                              export_all_vertex_colors=False, export_cameras=False, export_lights=False,
                              export_reset_pose_bones=True)
    patched = K.patch_materials(GLB_RAW, {
        "M_Guest_Skin": {"KHR_materials_transmission": {"transmissionFactor": 0.35},
                         "KHR_materials_volume": {"thicknessFactor": 0.9, "attenuationDistance": 1.4,
                                                  "attenuationColor": [0.93, 0.86, 0.80]},
                         "KHR_materials_ior": {"ior": 1.35}},
        "M_Guest_Core": {"KHR_materials_emissive_strength": {"emissiveStrength": 0.6}},
        "M_Guest_Ink": {"_set": {"alphaMode": "BLEND", "doubleSided": True}},
    })
    stats = {"design": "ink guest (owner input 08.11)", "triangles": tris, "triangles_total": sum(tris.values()),
             "budget_ok": sum(tris.values()) <= TRI_BUDGET, "clips": sorted(clips), "sockets": socks,
             "tendrils": N_TENDRIL, "draw_tendril": dt_.idx, "patched": patched,
             "glb_raw_bytes": os.path.getsize(GLB_RAW)}
    os.makedirs(QA_DIR, exist_ok=True)
    with open(STATS_PATH, "w") as fh:
        json.dump(stats, fh, indent=2)
    log("stats", json.dumps(stats))


# ------------------------------------------------------------------ QA renders

def stage_render(samples=128, res=1200):
    """Close views in a soft studio, and far views as a huge backlit silhouette in fog."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=GLB_RAW)
    for o in list(sc.objects):
        if o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o)
    rig = next(o for o in sc.objects if o.type == "ARMATURE")
    acts = {a.name.split("|")[-1]: a for a in bpy.data.actions}
    # Blender's importer drops the transmission/volume extensions: mirror them for the QA look
    for m in bpy.data.materials:
        b = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
        if b and m.name.startswith("M_Guest_Skin"):
            # three.js multiplies COLOR_0 into the base colour; do the same for the QA render
            vc = m.node_tree.nodes.new("ShaderNodeVertexColor")
            body = next((o for o in sc.objects if o.type == "MESH" and o.data.color_attributes
                         and m.name in [x.name for x in o.data.materials]), None)
            if body:
                vc.layer_name = body.data.color_attributes[0].name
                m.node_tree.links.new(vc.outputs["Color"], b.inputs["Base Color"])
            # match what three.js shows (transmission + thin attenuation, no subsurface): a milky,
            # translucent body with the inner organs readable through it
            b.inputs["Transmission Weight"].default_value = 0.45
            b.inputs["IOR"].default_value = 1.35
            b.inputs["Subsurface Weight"].default_value = 0.0
            for l in list(m.node_tree.links):
                if l.to_socket.name == "Volume":
                    m.node_tree.links.remove(l)
        if b and m.name.startswith("M_Guest_Core"):
            b.inputs["Emission Strength"].default_value = 1.6
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
                break
        except Exception:
            pass
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.transmission_bounces = 8
    sc.render.resolution_x, sc.render.resolution_y = res, res
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 90
    sc.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    out = os.path.join(QA_DIR, "final")
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".jpg"):
            os.remove(os.path.join(out, f))
    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "AREA"))
    sc.collection.objects.link(key)
    key.data.energy = 1500
    key.data.size = 6
    key.location = (-6, -8, 9)
    key.rotation_euler = (math.radians(50), 0, math.radians(-35))
    back = bpy.data.objects.new("back", bpy.data.lights.new("back", "AREA"))
    sc.collection.objects.link(back)
    back.data.energy = 5000
    back.data.size = 10
    back.data.color = (1.0, 0.92, 0.82)
    back.location = (0, 12, 5)
    back.rotation_euler = (math.radians(-90), 0, 0)
    vol = None

    def shot(name, loc, look, lens, frame_action=None, frame=0):
        cam.location = Vector(loc)
        cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = lens
        if frame_action:
            rig.animation_data_create()
            rig.animation_data.action = acts.get(frame_action)
        sc.frame_set(frame)
        sc.render.filepath = os.path.join(out, f"guest_{name}.jpg")
        bpy.ops.render.render(write_still=True)

    # close, soft studio (warm off-white backdrop)
    bg.inputs["Color"].default_value = (0.42, 0.41, 0.40, 1)
    bg.inputs["Strength"].default_value = 0.6
    shot("front", (0, -17, 4.6), (0, 0, 4.4), 50, "idle", 0)
    shot("three_quarter", (9, -13, 5.4), (0, 0, 4.4), 50, "idle", 60)
    shot("head_close", (1.2, -7.0, 6.5), (0, 0, 6.2), 70, "idle", 0)
    shot("draw", (6, -12, 4.0), (0, -1, 3.5), 45, "draw", 30)
    # far, a huge backlit silhouette emerging from mist
    bg.inputs["Color"].default_value = (0.20, 0.21, 0.23, 1)
    bg.inputs["Strength"].default_value = 0.4
    cube = bpy.data.objects.new("fog", bpy.data.meshes.new("fog"))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=60)
    bm.to_mesh(cube.data)
    bm.free()
    sc.collection.objects.link(cube)
    fm = bpy.data.materials.new("fog")
    fm.use_nodes = True
    nt = fm.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    v = nt.nodes.new("ShaderNodeVolumePrincipled")
    v.inputs["Density"].default_value = 0.035
    v.inputs["Color"].default_value = (0.85, 0.86, 0.88, 1)
    nt.links.new(v.outputs[0], nt.nodes["Material Output"].inputs["Volume"])
    cube.data.materials.append(fm)
    key.data.energy = 1500
    shot("far_fog", (0, -34, 4.0), (0, 0, 4.6), 45, "idle", 30)
    shot("far_fog_approach", (-6, -32, 3.0), (0, -2, 4.0), 45, "approach", 75)
    log("renders", sorted(os.listdir(out)))


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    stage = argv[0] if argv else "build"
    quick = "quick" in argv            # low samples and resolution, for a CPU check
    if stage in ("build", "all"):
        stage_build()
    if stage in ("render", "all"):
        stage_render(samples=12 if quick else 128, res=480 if quick else 1200)

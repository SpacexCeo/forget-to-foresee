"""Iris's face parts that the MakeHuman head does not bring (audit 10.11, defect 3): working upper lashes,
teeth and a tongue inside the mouth, the mouth's inside marked for the skin bake, and a smile that does
not fold the lips into a beak.

Lashes, teeth and tongue are added to the body mesh itself, so every face morph moves them: a lash vertex
copies the shape-key offsets of the lid vertex it grows from; the lower teeth and the tongue ride the
jaw's rotation in `mouth_open` (fitted from the morph itself). They get their own material slots after the
skin bake: the lashes read the dark strip of the hair atlas (alpha strands), the mouth a small texture.
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector as V

import hero_hair2 as H2


def mix_smile(body, puller=0.80, wide=0.38, part=0.0):
    """`smile` was the bare corner-puller unit: the corners rose and the middle of the lips stayed, a beak.
    Blended with the retraction unit (the lips stretch sideways and flatten) it reads as a smile."""
    kb = body.data.shape_keys.key_blocks
    n = len(body.data.vertices)

    def co(name):
        arr = np.empty(n * 3)
        kb[name].data.foreach_get("co", arr)
        return arr.reshape(n, 3)

    basis = co("Basis")
    out = basis + puller * (co("smile") - basis) + wide * (co("mouth_wide") - basis)
    if part:
        out += part * (co("lips_part") - basis)
    kb["smile"].data.foreach_set("co", out.ravel())
    body.data.update()


def mouth_attr(body):
    """`mouthw` on the skin: 1 on the inside of the mouth (the MakeHuman head has the cavity modelled; it
    was baked in skin colour and lit as a pale pocket or a black hole). The cavity is what is reached from
    a vertex deep in the mouth without crossing the lips group."""
    me = body.data
    a = me.attributes.get("mouthw") or me.attributes.new("mouthw", "FLOAT", "POINT")
    gi = body.vertex_groups["lips"].index
    lips = {v.index for v in me.vertices for g in v.groups if g.group == gi and g.weight > 0.5}
    pts = [me.vertices[i].co for i in lips]
    m = sum(pts, V()) / len(pts)
    adj = {}
    for e in me.edges:
        adj.setdefault(e.vertices[0], []).append(e.vertices[1])
        adj.setdefault(e.vertices[1], []).append(e.vertices[0])
    target = m + V((0, 0.045, -0.004))
    seed = min((v.index for v in me.vertices if v.index not in lips and (v.co - target).length < 0.035),
               key=lambda i: (me.vertices[i].co - target).length, default=None)
    inside = set()
    if seed is not None:
        stack = [seed]
        inside.add(seed)
        while stack:
            x = stack.pop()
            for y in adj.get(x, ()):
                if y not in inside and y not in lips and (me.vertices[y].co - m).length < 0.09:
                    inside.add(y)
                    stack.append(y)
    if len(inside) > 900:                       # the fill escaped onto the face: no marking rather than a dark face
        inside = set()
    for v in me.vertices:
        w = 1.0 if v.index in inside else 0.0
        if not w and v.index in lips and any(y in inside for y in adj.get(v.index, ())):
            w = 0.6                              # the inner edge of the lips
        a.data[v.index].value = w
    return len(inside), m


def _layers(b, me):
    return {k.name: b.verts.layers.shape[k.name] for k in me.shape_keys.key_blocks} if me.shape_keys else {}


def add_lashes(body, rig, strip=H2.STRIPS - 1, log=print):
    """Upper lashes: one sheet rooted on the upper lid margin, curling up and out, a little longer toward
    the outer corner (restrained: 4 to 7 mm). UVs read the lash strip of the hair atlas, root to tips."""
    me = body.data
    b = bmesh.new()
    b.from_mesh(me)
    b.verts.ensure_lookup_table()
    layers = _layers(b, me)
    dl = b.verts.layers.deform.verify()
    uv = b.loops.layers.uv.verify()
    lash_a = b.verts.layers.float.get("lash") or b.verts.layers.float.new("lash")
    made = 0
    for sfx, sx in (("L", 1), ("R", -1)):
        E = rig.data.bones[f"eye_{sfx}"].head_local
        r = max(bpy.data.objects[f"eyeball_{sfx}"].dimensions) / 2
        # The lid's free edge is where the blink morph travels furthest; of those vertices the most forward
        # one in each column across the eye is the outer rim, where lashes grow. (Picking the vertex nearest
        # the eyeball took the inner rim: the lashes ran through the lid and came out as a few dark ticks.)
        blink = layers.get(f"blink_{sfx}")
        cols = {}
        for v in b.verts:
            d = v.co - E
            if blink is None or d.length > r * 1.6 or d.y > 0:
                continue
            mv_ = (v[blink] - v.co).length
            if mv_ < 0.0025:
                continue
            k = int((d.x * sx / r + 1.0) * 5.5)                         # 11 columns, inner corner -> outer corner
            cols.setdefault(k, []).append((mv_, v))
        margin = []
        for k in sorted(cols):
            top = max(m_ for m_, _ in cols[k])
            margin.append(min((v for m_, v in cols[k] if m_ >= 0.75 * top), key=lambda v: v.co.y))
        margin = margin[max(1, len(margin) // 5):]                      # none at the inner corner
        prev = None
        n = len(margin)
        for i, mv in enumerate(margin):
            t = i / max(n - 1, 1)
            out = (mv.co - E).normalized()
            dirn = (out * 0.35 + V((sx * 0.22 * (t - 0.3), -0.80, 0.42))).normalized()
            # 3.5 to 6 mm, longest two thirds of the way out, short again at both corners
            L = (0.0029 + 0.0018 * t) * (0.30 + 0.70 * math.sin(math.pi * (0.10 + 0.78 * t)) ** 0.8)
            row = []
            for k in (0.0, 0.55, 1.0):
                co = mv.co + out * 0.0004 + dirn * (L * k) + V((0, 0, 0.0010 * k * k))
                nv = b.verts.new(co)
                nv[lash_a] = 1.0
                for g, w in mv[dl].items():
                    nv[dl][g] = w
                for lay in layers.values():
                    nv[lay] = mv[lay] + (co - mv.co)
                u = (strip + 0.10 + 0.80 * (t if sx > 0 else 1.0 - t)) / H2.STRIPS
                row.append((nv, (u, 0.30 - 0.215 * k)))      # root .. just into the thinning tips
            if prev:
                for k in range(2):
                    quad = (prev[k], row[k], row[k + 1], prev[k + 1])
                    f = b.faces.new([q[0] for q in quad])
                    f.smooth = True
                    for lo, q in zip(f.loops, quad):
                        lo[uv].uv = q[1]
                    made += 1
            prev = row
    b.to_mesh(me)
    b.free()
    me.update()
    log("lashes", made, "faces")
    return made


def jaw_fit(body):
    """The jaw's motion in `mouth_open` as a rotation about a left-right axis: (angle, hinge y, hinge z),
    least squares over the vertices that the morph moves most (chin and lower lip)."""
    kb = body.data.shape_keys.key_blocks
    rows, rhs = [], []
    for v in body.data.vertices:
        d = kb["mouth_open"].data[v.index].co - v.co
        if d.length > 0.015 and abs(v.co.x) < 0.02:
            rows.append((-v.co.z, 1.0, 0.0)); rhs.append(d.y)       # dy = -th * z + a      (a = th * hinge_z)
            rows.append((v.co.y, 0.0, -1.0)); rhs.append(d.z)       # dz =  th * y - b      (b = th * hinge_y)
    th, a, bb = np.linalg.lstsq(np.array(rows), np.array(rhs), rcond=None)[0]
    return float(th), float(bb / th), float(a / th)


def add_mouth(body, m, log=print):
    """Teeth (two arches with their gums) and a tongue inside the mouth cavity; m is the lips' centre."""
    me = body.data
    th, hy, hz = jaw_fit(body)
    log("jaw", round(th, 3), "rad about y", round(hy, 4), "z", round(hz, 4))
    b = bmesh.new()
    b.from_mesh(me)
    layers = _layers(b, me)
    dl = b.verts.layers.deform.verify()
    uv = b.loops.layers.uv.verify()
    geo = b.verts.layers.float.get("mouthgeo") or b.verts.layers.float.new("mouthgeo")
    hg = body.vertex_groups["head"].index
    faces = []

    def jawed(co, k=1.0):
        y, z = co.y - hy, co.z - hz
        a = th * k
        return V((co.x, hy + y * math.cos(a) - z * math.sin(a), hz + y * math.sin(a) + z * math.cos(a)))

    def vert(co, jaw=0.0):
        nv = b.verts.new(co)
        nv[geo] = 1.0
        nv[dl][hg] = 1.0
        for name, lay in layers.items():
            nv[lay] = jawed(co, jaw) if (jaw and name == "mouth_open") else co
        return nv

    def face(quad, ref):
        f = b.faces.new([q[0] for q in quad])
        f.smooth = True
        for lo, q in zip(f.loops, quad):
            lo[uv].uv = q[1]
        faces.append((f, ref))

    lip_z = m.z - 0.0010                                    # the line where the lips meet
    N = 16
    for upper in (True, False):
        y0 = m.y + (0.0035 if upper else 0.0062)            # behind the inner wall of the lips; the lower arch behind the upper
        sgn = 1.0 if upper else -1.0
        z_edge = lip_z + (-0.0028 if upper else -0.0030)
        crown, gum = (0.0110, 0.0170) if upper else (0.0062, 0.0125)
        jaw = 0.0 if upper else 1.0
        cols = []
        for i in range(N + 1):
            t = -1.0 + 2.0 * i / N
            x = (0.0235 if upper else 0.0215) * t
            y = y0 + 0.027 * abs(t) ** 2.0
            u = 0.02 + 0.96 * i / N
            short = 1.0 - 0.18 * abs(t) ** 1.5              # the back teeth sit a little shorter
            A = (vert(V((x, y, z_edge + sgn * 0.0009 * abs(t))), jaw), (u, 0.52))
            B = (vert(V((x, y + 0.0008, z_edge + sgn * crown * short)), jaw), (u, 0.84))
            Cc = (vert(V((x * 1.03, y + 0.0030, z_edge + sgn * gum)), jaw), (u, 0.99))
            D = (vert(V((x * 0.90, y + 0.0048, z_edge + sgn * 0.0020)), jaw), (u, 0.60))
            cols.append((A, B, Cc, D))
        for i in range(N):
            a0, a1 = cols[i], cols[i + 1]
            out = V((a0[0][0].co.x, -0.012, 0.0))           # away from the arch's inside
            face((a0[0], a1[0], a1[1], a0[1]), out)         # enamel
            face((a0[1], a1[1], a1[2], a0[2]), out)         # gum
            face((a0[3], a1[3], a1[0], a0[0]), V((0, 0, -sgn)))   # the biting edge
    # tongue: a flattened ellipsoid on the floor of the mouth
    c = V((0.0, m.y + 0.036, lip_z - 0.0125))
    rx, ry, rz = 0.0150, 0.0260, 0.0048
    LAT, LON = 5, 10
    grid = []
    for j in range(LAT + 1):
        la = -math.pi / 2 + math.pi * j / LAT
        ring = []
        for k in range(LON):
            lo_ = math.tau * k / LON
            p = c + V((rx * math.cos(la) * math.cos(lo_), ry * math.cos(la) * math.sin(lo_), rz * math.sin(la)))
            ring.append((vert(p, 0.9), (0.06 + 0.12 * (0.5 + 0.5 * math.cos(la) * math.cos(lo_)), 0.08 + 0.3 * j / LAT)))
        grid.append(ring)
    for j in range(LAT):
        for k in range(LON):
            quad = (grid[j][k], grid[j][(k + 1) % LON], grid[j + 1][(k + 1) % LON], grid[j + 1][k])
            face(quad, None)                                # (the pole rows are thin quads; fine at this size)
    for f, ref in faces:
        f.normal_update()
        if ref is None:
            ref = f.calc_center_median() - c
        if f.normal.dot(ref) < 0:
            f.normal_flip()
    n = len(faces)
    b.to_mesh(me)
    b.free()
    me.update()
    log("mouth", n, "faces")
    return n


def mouth_material(out_dir, name="agent_iris"):
    """A 256x128 texture: the teeth strip with its gum on the top half, tongue colour bottom left."""
    from PIL import Image
    W, Hh = 256, 128
    img = np.zeros((Hh, W, 3), float)
    img[:, :] = (150, 62, 70)                                           # tongue (rows are written v-up)
    x = np.arange(W)
    teeth = 14
    ph = (x / W * teeth) % 1.0
    gap = np.clip(np.minimum(ph, 1 - ph) / 0.06, 0, 1) ** 0.6          # dark line between two teeth
    rnd = 0.90 + 0.10 * np.sin(ph * math.pi)                            # each tooth rounded
    for row in range(Hh // 2, Hh):
        v = (row - Hh // 2) / (Hh // 2)                                # 0 at the biting edge .. 1 above the gum
        if v < 0.70:
            enamel = np.array((214, 205, 190), float) * (0.93 + 0.07 * min(1.0, v / 0.25))
            img[row] = enamel[None, :] * (0.55 + 0.45 * gap)[:, None] * rnd[:, None]
        else:
            scallop = 0.70 + 0.06 * np.sin(ph * math.pi)                # the gum line dips between the teeth
            g = np.array((168, 84, 92), float)
            e = np.array((214, 205, 190), float) * 0.9
            mask = (v > scallop).astype(float)[:, None]
            img[row] = g[None, :] * mask + (e[None, :] * (0.55 + 0.45 * gap)[:, None]) * (1 - mask)
    p = os.path.join(out_dir, f"{name}_mouth_basecolor.png")
    Image.fromarray(np.flipud(img.clip(0, 255).astype(np.uint8)), "RGB").save(p)
    im = bpy.data.images.load(p)
    im.name = f"{name}_mouth_basecolor"
    mat = bpy.data.materials.new("M_Iris_Mouth")
    mat.use_nodes = True
    nt = mat.node_tree
    bs = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = im
    nt.links.new(tex.outputs["Color"], bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = 0.32
    return mat


def assign_slots(body, skin_fallback, lash_mat, mouth_mat):
    """Material slots: 0 skin, 1 lashes (the hair-card material), 2 mouth; faces by their vertex marks."""
    me = body.data
    if not me.materials:
        me.materials.append(skin_fallback)
    while len(me.materials) > 1:
        me.materials.pop(index=len(me.materials) - 1)
    me.materials.append(lash_mat)
    me.materials.append(mouth_mat)
    la = me.attributes.get("lash")
    mo = me.attributes.get("mouthgeo")
    n1 = n2 = 0
    for p in me.polygons:
        if la and all(la.data[i].value > 0.5 for i in p.vertices):
            p.material_index = 1
            n1 += 1
        elif mo and all(mo.data[i].value > 0.5 for i in p.vertices):
            p.material_index = 2
            n2 += 1
    return n1, n2

"""Townsfolk wardrobe: turns a cast entry's recipe (cast.py) into garments, hair, a hat and props on a body.

    dress(ctx, entry)   ctx = tf_costume.Ctx(body, rig); everything lands in ctx.garments

Our own designs for the hill town: linen, wool, leather and dyed felt; ring-sign brooches, amber beads and
shell buttons as the small details of the world. Nothing is modelled after an existing game, film or show.
"""

import math

import bmesh
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

import build_iris_hero as IH
import hero_costume as C
from tf_costume import (ARMS, HEAD, LEGS, TAU, TORSO, ball, box, obj, sm01, torus, tube_path)

V = Vector
NECK = ("neck", "chest", "shoulder_L", "shoulder_R")
SHOULDERS = TORSO + ("shoulder_L", "shoulder_R")


def surface_tree(ctx):
    co, polys = list(ctx.co), [list(p) for p in ctx.polys]
    for o in ctx.garments.values():
        base = len(co)
        co.extend(o.matrix_world @ v.co for v in o.data.vertices)
        polys.extend([base + i for i in f.vertices] for f in o.data.polygons)
    return BVHTree.FromPolygons(co, polys)


def hit(tree, origin, direction, default=None):
    h = tree.ray_cast(V(origin), V(direction).normalized(), 2.0)
    return (h[0], h[1]) if h[0] is not None else (default, V(direction) * -1)


def torso_garments(ctx):
    return [o for n, o in ctx.garments.items() if o.get("layer") == "torso"]


# ===================================================================== clothes

def dress(ctx, e):
    L, r = ctx.L, e["costume"]
    base = r["base"]
    sl = r.get("sleeves", "long")
    G = ctx.garments

    def torso(o, gcol, tcol=None, mat="cloth", rule=None):
        o["layer"] = "torso"
        return ctx.add(o, gcol, tcol, mat, rule)

    if base in ("robe", "dress"):
        col = r[base]
        hem = r.get("hem", 0.10) * 1.0
        if r.get("under"):
            torso(ctx.top("under_shirt", L.waist - 0.02, "long", ease=0.005, neck="round", relax=3, thick=0.003), r["under"][0])
        wide = sl == "wide"
        neck = {"stand": "high", "wrap": "vee"}.get(r.get("collar"), "round")
        ease = 0.011 if not r.get("under") else 0.013
        top = ctx.top(base + "_top", L.waist - 0.03, "short" if wide else sl, ease=ease, neck=neck, relax=7)
        if r.get("under"):
            ctx.clear(top, 0.004, [G["under_shirt"]], 0.004)
        torso(top, *col)
        if wide:
            for o in ctx.bell_sleeves(base + "_sleeve", r1=0.06 if base == "robe" else 0.04):
                ctx.add(o, *col, rule="sleeve")
        if sl == "rolled":
            ctx.add(ctx.cuff_rolls(base + "_rolls"), col[0])
        skirt = ctx.tube(base + "_skirt", L.waist + 0.035, hem, ease=ease + 0.006, flare=0.075 if base == "dress" else 0.055,
                         folds=0.010 if base == "dress" else 0.007, nfold=11, over=[top], trim_rows=2, top_in=0.004,
                         hem_wave=0.004)
        torso(skirt, *col, rule="skirt")
        if neck == "high":                          # a stand collar band
            ctx.add(ctx.band("collar", lambda t: L.neck + 0.045, 0.05, 0.004, bones=("neck",), thick=0.004), col[1], rule="fit")
    else:
        tro = r["trousers"]
        cut = r.get("trousers_cut", "ankle")
        ctx.add(ctx.trousers("trousers", cut, ease=0.013 if cut != "knee" else 0.016), *tro)
        sh = r["shirt"]
        hemk = r.get("shirt_hem", "tucked")
        ease = {"tucked": 0.010, "tunic": 0.012, "gambeson": 0.018, "blouse": 0.016}[hemk]
        thick = 0.009 if hemk == "gambeson" else 0.004
        neck = "vee" if hemk in ("tunic", "blouse") else ("high" if hemk == "gambeson" else "round")
        hem_z = {"tucked": L.waist - 0.005, "blouse": L.waist - 0.02}.get(hemk, L.hip + 0.03)
        slv = "short" if sl == "wide" else sl
        top = ctx.top("shirt", hem_z, slv, ease=ease, neck=neck, relax=9 if hemk == "blouse" else 6, thick=thick)
        ctx.clear(top, 0.004, [G["trousers"]], 0.004)
        torso(top, *sh)
        if sl == "wide":
            for o in ctx.bell_sleeves("shirt_sleeve", r1=0.035, drop=0.03):
                ctx.add(o, *sh, rule="sleeve")
        if sl == "rolled":
            ctx.add(ctx.cuff_rolls("shirt_rolls"), sh[0])
        if hemk in ("tunic", "gambeson"):
            z1 = L.crotch - (0.10 if hemk == "tunic" else 0.20)
            sk = ctx.tube("shirt_skirt", hem_z + 0.035, z1, ease=ease + 0.008, flare=0.02 if hemk == "tunic" else 0.035,
                          folds=0.004 if hemk == "tunic" else 0.0, over=[top, G["trousers"]], thick=thick,
                          trim_rows=1 if hemk == "tunic" else 2, flare_from=L.hip)
            torso(sk, *sh, rule="skirt")
        if neck == "high":
            ctx.add(ctx.band("collar", lambda t: L.neck + 0.04, 0.045, 0.006, bones=("neck",), thick=0.006), sh[1], rule="fit")

    # ---- over-garments
    over = r.get("over")
    oc = r.get("over_col")
    if over in ("vest", "vest_long"):
        hem_z = L.waist - 0.04
        v = ctx.top("vest", hem_z, "none", ease=0.020, neck="vee", open_front=0.045, relax=5, thick=0.005)
        ctx.clear(v, 0.004, torso_garments(ctx), 0.005)
        torso(v, *oc)
        if over == "vest_long":
            sk = ctx.tube("vest_skirt", hem_z + 0.03, L.knee + 0.04, ease=0.026, flare=0.05, spans=[(180, 161)],
                          over=torso_garments(ctx), thick=0.005, folds=0.006, edge_trim=True)
            torso(sk, *oc, rule="skirt")
    elif over == "tabard":
        tg = torso_garments(ctx)
        yoke = ctx.top("tabard_yoke", L.armpit + 0.01, "none", ease=0.024, neck="wide", relax=4, thick=0.005)
        ctx.clear(yoke, 0.004, tg, 0.006)
        torso(yoke, *oc)
        z1 = L.crotch - 0.14
        pan = ctx.tube("tabard", L.armpit + 0.05, z1, ease=0.030, spans=[(0, 30), (180, 30)], over=tg, thick=0.005,
                       flare=0.01, edge_trim=True)
        torso(pan, *oc, rule="skirt")
    elif over == "stole":
        tg = torso_garments(ctx)
        ctx.add(ctx.band("stole_neck", lambda t: L.neck + 0.03 - 0.085 * (0.5 + 0.5 * math.cos(t)), 0.06, 0.016, bones=NECK,
                         over=tg, thick=0.005), *oc, rule="fit")
        pan = ctx.tube("stole", L.neck - 0.04, L.knee - 0.02, ease=0.026, spans=[(17, 7.6), (343, 7.6)], over=tg, thick=0.005,
                       trim_rows=3, bones=SHOULDERS + ("thigh_L", "thigh_R"))
        torso(pan, *oc, rule="skirt")
    if r.get("apron"):
        tg = torso_garments(ctx)
        ac = r["apron"]
        bib = ctx.key != "innkeeper"
        z0 = L.bust + 0.02 if bib else L.waist + 0.01
        if bib:
            torso(ctx.tube("apron_bib", z0, L.waist - 0.01, ease=0.030, spans=[(0, 26)], over=tg, thick=0.004, trim_rows=0,
                           edge_trim=True, bones=TORSO), *ac)
            ctx.add(ctx.band("apron_halter", lambda t: L.neck + 0.035 - (L.neck + 0.035 - z0) * (0.5 + 0.5 * math.cos(t)) ** 1.5,
                             0.016, 0.014, bones=NECK, over=tg, thick=0.003), ac[1], rule="fit")
        torso(ctx.tube("apron", L.waist + 0.02, L.knee + (0.05 if bib else -0.06), ease=0.036, spans=[(0, 64)], over=tg,
                       thick=0.004, flare=0.03, folds=0.004, edge_trim=True), *ac, rule="skirt")
        torso(ctx.band("apron_ties", lambda t: L.waist + 0.005, 0.022, 0.034, over=tg, thick=0.003), ac[1], rule="fit")
    if r.get("shawl"):
        o = ctx.cape("shawl", L.waist + 0.06, ease=0.024, open_deg=10, flare=0.02, over=torso_garments(ctx), folds=0.010)
        torso(o, *r["shawl"], rule="cape")
    if r.get("capelet"):
        o = ctx.cape("capelet", L.bust - 0.03, ease=0.022, open_deg=8, flare=0.035, over=torso_garments(ctx), folds=0.006)
        torso(o, *r["capelet"], rule="cape")
    if r.get("scarf"):
        ctx.add(ctx.band("scarf", lambda t: L.neck + 0.02 - 0.03 * (0.5 + 0.5 * math.cos(t)), 0.075, 0.012, bones=NECK,
                         over=torso_garments(ctx), thick=0.008, round_=0.012), r["scarf"][0], rule="fit")

    # ---- waist
    tg = torso_garments(ctx)
    if r.get("belt"):
        bc = r["belt"]
        bz = L.waist + (0.0 if base != "shirt_trousers" or r.get("shirt_hem") in ("tunic", "gambeson") else 0.0)
        torso(ctx.band("belt", lambda t: bz, 0.036, 0.008, over=tg, thick=0.005), bc[0], mat="leather", rule="fit")
        tree = surface_tree(ctx)
        p, n = hit(tree, (0.0, ctx.axis.y - 1, bz), (0, 1, 0), V((0, ctx.axis.y - 0.15, bz)))
        b = bmesh.new()
        torus(b, p + V((0, -0.003, 0)), 0.021, 0.0045, axis=V((0, 1, 0)), n=20, m=6)
        box(b, p + V((0.004, -0.004, 0)), 0.036, 0.005, 0.006)
        ctx.add(obj("buckle", b), bc[1], mat="metal", rule="fit")
    if r.get("sash"):
        sc = r["sash"][0]
        torso(ctx.band("sash", lambda t: L.waist + 0.01 * math.sin(t), 0.085, 0.010, over=tg, thick=0.006, round_=0.006), sc, rule="fit")
        torso(ctx.tube("sash_tail", L.waist - 0.02, L.knee + 0.10, ease=0.040, spans=[(62, 6.5)], over=tg, thick=0.004,
                       trim_rows=2, flare=0.01), sc, "ochre" if sc != "ochre" else "amber", rule="skirt")

    # ---- feet
    kind, scol = r["shoes"]
    for shoe in ctx.shoes(kind):
        ctx.add(shoe, scol, "leather_dark" if scol != "leather_dark" else "leather", mat="wood" if kind == "clogs" else "leather", rule="fit")
        if kind == "sandals":
            shoe["nocover"] = 1
    if kind == "wraps":
        ctx.add(ctx.leg_wraps("leg_wraps", L.ankle + 0.02, L.ankle + 0.40 * (L.knee - L.ankle)), "linen", rule="fit")
    if kind == "sandals":
        ctx.add(ctx.straps("sandal_straps", ((-0.115, -0.085), (-0.045, -0.02), (0.02, 0.05))), scol, mat="leather", rule="fit")

    hat_line = hat(ctx, e)
    hair(ctx, e, hat_line)
    if e.get("beard"):
        beard(ctx, *e["beard"])
    props(ctx, e)
    return ctx.garments


# ===================================================================== hats

def hat(ctx, e):
    """-> the height of the hat line (None without a hat): hair tufts stay below it."""
    r = e["costume"].get("hat")
    if not r:
        return None
    kind, col, tcol = r
    L = ctx.L
    line = L.eye.z + 0.062
    scalp = IH.hair_region(ctx.bm, ctx.dom)
    co = ctx.co
    if kind == "skullcap":
        o = ctx.head_shell("hat", [i for i in scalp if co[i].z > line + 0.012], 0.007, 0.004)
        C.set_attr(o, "trim", lambda i, p: 1.0 if p.z < line + 0.026 else 0.0)
        ctx.add(o, col, tcol, rule="head")
        return line + 0.012
    if kind in ("headscarf", "kerchief"):
        ears = IH.group_verts(ctx.bm, "ears", 0.2) if "ears" in ctx.bm.vertex_groups else set()
        region = set(scalp) | {i for i in ears}
        if kind == "kerchief":                         # tied under the chin: also the cheeks' edge and the jaw line
            region |= {i for i, p in enumerate(co) if ctx.dom[i] in HEAD and p.y > ctx.head_c.y + 0.012 and p.z > L.head - 0.01}
        region |= {i for i, p in enumerate(co) if ctx.dom[i] in HEAD and p.y > ctx.head_c.y + 0.01 and p.z > L.head + 0.0}
        o = ctx.head_shell("hat", region, 0.008, 0.003, relax=5)
        C.set_attr(o, "trim", lambda i, p: 1.0 if (p.y < ctx.head_c.y - ctx.head_r[1] * 0.45 and p.z < line + 0.03) else 0.0)
        ctx.add(o, col, tcol, rule="head")
        b = bmesh.new()
        hc, hr = ctx.head_c, ctx.head_r
        if kind == "headscarf":                        # the knot at the nape and two short tails
            kn = V((0, hc.y + hr[1] * 0.92, L.head + 0.035))
            ball(b, kn, 0.022, 1.3, 0.8, 0.9)
            for s in (-1, 1):
                tube_path(b, [kn, kn + V((s * 0.035, 0.02, -0.05)), kn + V((s * 0.05, 0.025, -0.11))], [0.012, 0.016, 0.004], n=6)
        else:                                          # the knot under the chin
            kn = V((0, L.mouth.y + 0.012, L.mouth.z - 0.075))
            ball(b, kn, 0.016, 1.3, 0.8, 0.9)
            for s in (-1, 1):
                tube_path(b, [kn, kn + V((s * 0.03, -0.006, -0.03)), kn + V((s * 0.04, -0.004, -0.07))], [0.009, 0.012, 0.003], n=6)
        ctx.add(obj("hat_knot", b), col, rule="head")
        return 9.0                                     # everything is covered
    prof = {
        "straw": ([(0.19, -0.03), (0.12, -0.010), (0.014, 0.008), (0.012, 0.045), (0.0, 0.085), (-0.03, 0.105), (-0.07, 0.112)], -13, 0),
        "felt": ([(0.085, 0.022), (0.075, 0.006), (0.045, -0.004), (0.012, 0.006), (0.010, 0.05), (0.002, 0.10), (-0.02, 0.125), (-0.06, 0.13)], -9, 7),
        "flatcap": ([(0.012, -0.004), (0.036, 0.022), (0.030, 0.05), (-0.01, 0.068), (-0.05, 0.072)], -10, 4),
        "kettle": ([(0.070, -0.028), (0.040, -0.004), (0.012, 0.008), (0.012, 0.05), (0.0, 0.092), (-0.03, 0.114), (-0.07, 0.120)], -8, 0),
    }[kind]
    line += {"kettle": 0.022, "straw": 0.012}.get(kind, 0.0)
    o = ctx.hat("hat", prof[0], line, pitch=prof[1], roll=prof[2], crown_rows=(2, 4) if kind in ("straw", "felt") else None)
    ctx.add(o, col, tcol, mat={"straw": "straw", "kettle": "metal"}.get(kind, "cloth"), rule="head")
    hc, hr = ctx.head_c, ctx.head_r
    if kind == "flatcap":
        b = bmesh.new()
        ball(b, V((hc.x, hc.y - hr[1] - 0.035, line - 0.004)), 0.062, 1.0, 0.85, 0.10)
        ctx.add(obj("hat_visor", b), tcol, mat="leather", rule="head")
    if kind == "felt":
        b = bmesh.new()
        p = V((hc.x + hr[0] + 0.012, hc.y - 0.02, line + 0.035))
        ball(b, p, 0.011, 0.6, 1, 1.3)
        tube_path(b, [p, p + V((0.02, 0.05, 0.07)), p + V((0.015, 0.09, 0.15))], [0.004, 0.012, 0.002], n=5)   # a feather
        ctx.add(obj("hat_pin", b), "amber", mat="amber", rule="head")
    return line - 0.004


# ===================================================================== hair

def scalp_path(ctx, a0, a1, lat, n=10, off=0.01):
    """Points over the skull ellipsoid from the front (a0) to the back (a1), at lateral angle lat."""
    hc, hr = ctx.head_c, ctx.head_r
    out = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        d = V((math.sin(lat) * math.cos(a) * 0 + math.sin(lat), -math.cos(a) * math.cos(lat), math.sin(a) * math.cos(lat)))
        out.append(hc + V((d.x * (hr[0] + off), d.y * (hr[1] + off), d.z * (hr[2] + off))))
    return out


def hair(ctx, e, hat_line):
    colour, style = e["hair"]
    bm, co, L = ctx.bm, ctx.co, ctx.L
    hc, hr = ctx.head_c, ctx.head_r
    scalp = IH.hair_region(bm, ctx.dom)
    under_hat = hat_line is not None
    idx = scalp
    if style in ("bald_ring", "fringe_low"):
        zcut = hc.z + hr[2] * (0.30 if style == "bald_ring" else 0.42)
        idx = [i for i in scalp if co[i].z < zcut and co[i].y > hc.y - hr[1] * 0.55]
    off = {"shaved": 0.0012, "short_messy": 0.012, "short_curly": 0.012, "covered": 0.004, "bald_ring": 0.013,
           "fringe_low": 0.014}.get(style, 0.007)
    if under_hat:
        off = min(off, 0.005)
    cap = C.hair_cap(bm, idx, offset=off)
    if style == "shaved":
        from cast import HAIR, SKIN
        tone = SKIN[e["skin"]][0]
        HAIR["stubble_" + ctx.key] = tuple(a * 0.55 + b2 * 0.45 for a, b2 in zip(tone, HAIR[colour]))
        colour = "stubble_" + ctx.key
    if style in ("short_messy", "short_curly", "bald_ring", "fringe_low") and not under_hat:
        for v in cap.data.vertices:
            v.co += v.normal * 0.005 * noise.noise(v.co * 38)
        if style in ("bald_ring", "fringe_low"):       # the ring thins out to the skin along its upper edge
            zc_ = max(v.co.z for v in cap.data.vertices)
            for v in cap.data.vertices:
                v.co -= v.normal * (off - 0.001) * sm01(zc_ - 0.035, zc_, v.co.z)
    ctx.add(cap, colour, mat="hair", rule="head")
    cap["nocover"] = 1
    lim = hat_line if under_hat else 9.0
    pts = [(co[i], bm.data.vertices[i].normal.copy()) for i in idx]
    rnd = ctx.rnd
    b = bmesh.new()
    made = False
    if style in ("short_messy",) and not under_hat:
        n_t = 70
        for _ in range(n_t):
            p, nr = rnd.choice(pts)
            if p.z > lim - 0.01:
                continue
            flow = V((rnd.uniform(-0.5, 0.5), -0.5 if p.y < hc.y else 0.4, -0.9 if style != "short_messy" else rnd.uniform(-0.6, 0.3)))
            d = (nr * 0.8 + flow * 0.8).normalized()
            ln = rnd.uniform(0.02, 0.04) * (1.0 if style == "short_messy" else 1.3)
            tube_path(b, [p + nr * 0.004, p + nr * 0.010 + d * ln * 0.5, p + nr * 0.008 + d * ln + V((0, 0, -ln * 0.3))],
                      [rnd.uniform(0.007, 0.011), 0.006, 0.001], n=5, cap=False)
            made = True
    elif style == "short_curly":
        for _ in range(150):
            p, nr = rnd.choice(pts)
            if p.z > lim - 0.012:
                continue
            ball(b, p + nr * rnd.uniform(0.006, 0.014), rnd.uniform(0.011, 0.017), u=7, v=5)
            made = True
    elif style == "bun":
        c = hc + V((0, hr[1] * 0.80, hr[2] * 0.42))
        ball(b, c, 0.047, 1.0, 0.9, 0.95, u=14, v=10)
        torus(b, c - V((0, 0.02, 0.012)), 0.036, 0.008, axis=V((0, 0.8, 0.45)), n=16, m=5)
        made = True
    elif style == "braids_two":
        for s in (-1, 1):
            a = V((s * hr[0] * 0.80, hc.y + hr[1] * 0.35, hc.z - hr[2] * 0.42))
            path = [a, a + V((s * 0.02, -0.01, -0.06)), V((s * 0.085, ctx.axis.y - 0.075, L.neck - 0.02)), V((s * 0.08, ctx.axis.y - 0.115, L.bust + 0.06))]
            for k in range(19):
                t = k / 18
                seg = min(2, int(t * 3))
                q = path[seg].lerp(path[seg + 1], t * 3 - seg) if seg < 3 else path[3]
                ball(b, q + V((0.004 * (k % 2 * 2 - 1), 0, 0)), 0.0125 - 0.003 * t, 1.0, 1.0, 1.25, u=8, v=6)
            made = True
    elif style == "braids_back":
        for lat in (-1.0, -0.66, -0.33, 0.0, 0.33, 0.66, 1.0):
            path = scalp_path(ctx, 0.75, 2.9, lat * 1.05, n=9, off=0.010)
            tube_path(b, path, [0.008] * len(path), n=5, cap=False)
            end = path[-1]
            tail = [end, end + V((0, 0.02, -0.07)), V((lat * 0.07, ctx.axis.y + 0.13, L.neck - 0.02)), V((lat * 0.085, ctx.axis.y + 0.14, L.bust + 0.03))]
            tube_path(b, tail, [0.008, 0.008, 0.007, 0.004], n=5)
        made = True
    if style == "long_side":
        lk = C.hair_locks(C.scalp_points(bm, scalp), hc, hr, seed=17, length=0.27)
        if under_hat:
            IH.delete_verts(lk, lambda i, p: False)
        lk.name = "hair_locks"
        ctx.add(lk, colour, mat="hair", rule="hair")
        lk["nocover"] = 1
    if made:
        o = obj("hair_shape", b, angle=70)
        ctx.add(o, colour, mat="hair", rule="hair" if style.startswith("braids") else "head")
        o["nocover"] = 1
    else:
        b.free()
    if style == "braids_two":
        b = bmesh.new()
        for s in (-1, 1):
            torus(b, V((s * 0.08, ctx.axis.y - 0.113, L.bust + 0.075)), 0.010, 0.004, axis=V((0, 0.3, 1)), n=10, m=5)
        ctx.add(obj("hair_ties", b), "terracotta", rule="hair")


def beard(ctx, colour, style):
    L, co, dom = ctx.L, ctx.co, ctx.dom
    hc, hr = ctx.head_c, ctx.head_r
    m = L.mouth
    lips = IH.group_verts(ctx.bm, "lips", 0.25) if "lips" in ctx.bm.vertex_groups else set()
    if style == "short":                              # stubble is painted in the skin shader
        return
    length = {"goatee": 0.026, "full": 0.030}[style]

    def w_of(i):
        p = co[i]
        if dom[i] not in ("head", "jaw") or i in lips:
            return 0.0
        front = sm01(hc.y + 0.045, hc.y + 0.0, p.y)
        low = sm01(m.z - 0.008, m.z - 0.028, p.z)
        ax = abs(p.x)
        if style == "goatee":
            w = low * (1 - sm01(0.024, 0.044, ax)) * front
            mo = sm01(m.z + 0.002, m.z + 0.007, p.z) * (1 - sm01(m.z + 0.014, m.z + 0.020, p.z)) * (1 - sm01(0.03, 0.045, ax)) * front
            return max(w, mo * 0.45)
        w = low * front
        side = sm01(0.040, 0.055, ax) * sm01(m.z + 0.075, m.z + 0.035, p.z) * sm01(hc.y + 0.05, hc.y + 0.015, p.y)
        mo = sm01(m.z + 0.002, m.z + 0.007, p.z) * (1 - sm01(m.z + 0.016, m.z + 0.022, p.z)) * (1 - sm01(0.035, 0.05, ax)) * front
        return max(w, side * 0.7, mo * (0.55 if style == "full" else 0.8))
    W = {i: w_of(i) for i in range(len(co))}
    W = {i: w for i, w in W.items() if w > 0.06}
    o = C.shell_from_body(ctx.bm, "beard", lambda i, _: i in W, 0.0, 0.0, trim=lambda p, n: 0.0,
                          loop_smooth=((lambda p: True), 12))
    # offset by the beard weight (the edge lies on the skin), longer and hanging under the chin
    kd_src = sorted(W)
    from mathutils.kdtree import KDTree
    kd = KDTree(len(kd_src))
    for j, i in enumerate(kd_src):
        kd.insert(co[i], j)
    kd.balance()
    for v in o.data.vertices:
        _, j, _ = kd.find(v.co)
        w = W[kd_src[j]]
        chin = sm01(m.z - 0.03, m.z - 0.07, v.co.z) if style != "short" else 0.0
        v.co += v.normal * (0.0015 + length * w ** 0.8) + V((0, -0.2, -1.0)) * (length * 0.9 * chin * w)
    o.data.update()
    bb = bmesh.new()
    bb.from_mesh(o.data)
    for _ in range(8):
        bmesh.ops.smooth_vert(bb, verts=[v for v in bb.verts if not v.is_boundary], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bb.to_mesh(o.data)
    bb.free()
    C.smooth(o, 180)
    ctx.add(o, colour, mat="hair", rule="fit")
    o["nocover"] = 1


# ===================================================================== props and small details

def necklace(ctx, name, z_front, z_back, r_bead=0.0, ease=0.012, n=40):
    """Points of a cord round the neck resting on what is worn (tilted ring), optionally with beads."""
    tree = surface_tree(ctx)
    pts = []
    for k in range(n):
        t = TAU * k / n
        z = z_back - (z_back - z_front) * (0.5 + 0.5 * math.cos(t)) ** 1.3
        th = -math.pi / 2 + t
        d = V((math.cos(th), math.sin(th), 0))
        p, _ = hit(tree, V((ctx.axis.x, ctx.axis.y, z)) + d * 0.6, -d, V((ctx.axis.x, ctx.axis.y, z)) + d * 0.12)
        pts.append(p + d * ease)
    b = bmesh.new()
    if r_bead:
        for k, p in enumerate(pts):
            ball(b, p, r_bead * (1.0 + 0.25 * (k % 3 == 0)), u=7, v=5)
    else:
        tube_path(b, pts + [pts[0]], 0.0028, n=5, cap=False)
    return obj(name, b), pts[0]


def props(ctx, e):
    L, B = ctx.L, ctx.bones
    ex = e["costume"].get("extras", ())
    gR, gL = B["prop_R"][0], B["prop_L"][0]
    ay = ctx.axis.y
    if "amber_beads" in ex:
        o, _ = necklace(ctx, "beads", L.bust + 0.085, L.neck + 0.03, r_bead=0.0065, n=54)
        ctx.add(o, "amber", mat="amber", rule="fit")
    for nm, kind in (("loupe", "loupe"), ("ring_pendant", "ring"), ("shell_necklace", "shell")):
        if nm in ex:
            o, front = necklace(ctx, nm + "_cord", L.bust - (0.03 if nm != "shell_necklace" else -0.05), L.neck + 0.03)
            ctx.add(o, "leather_dark", mat="leather", rule="fit")
            b = bmesh.new()
            c = front + V((0, -0.008, -0.028))
            if kind == "loupe":
                torus(b, c, 0.024, 0.0045, axis=V((0, 1, 0)), n=18, m=6)
                tube_path(b, [c + V((0, 0, 0.024)), c + V((0, 0, 0.034))], 0.004, n=6)
            elif kind == "ring":
                torus(b, c - V((0, 0, 0.012)), 0.030, 0.0055, axis=V((0, 1, 0)), n=22, m=6)
                ball(b, c - V((0, 0, 0.012)), 0.009, u=8, v=6)
            else:
                ball(b, c + V((0, 0, 0.01)), 0.02, 1.0, 0.45, 1.2, u=10, v=7)
            ctx.add(obj(nm, b), {"loupe": "bronze", "ring": "amber", "shell": "shell_white"}[kind],
                    mat={"loupe": "metal", "ring": "amber", "shell": "shell"}[kind], rule="fit")
    tree = surface_tree(ctx)
    if "ring_brooch" in ex:
        p, n = hit(tree, (0.075, ay - 1, L.bust + 0.07), (0, 1, 0), V((0.075, ay - 0.12, L.bust + 0.07)))
        b = bmesh.new()
        torus(b, p + V((0, -0.004, 0)), 0.015, 0.004, axis=V((0, 1, 0)), n=16, m=6)
        box(b, p + V((0, -0.005, 0)), 0.04, 0.003, 0.004, Matrix.Rotation(0.6, 3, "Y"))
        ctx.add(obj("ring_brooch", b), "bronze", mat="metal", rule="fit")
    if "ring_sign_chest" in ex:
        z = (L.bust + L.waist) / 2 + 0.03
        p, n = hit(tree, (0, ay - 1, z), (0, 1, 0), V((0, ay - 0.15, z)))
        b = bmesh.new()
        torus(b, p + V((0, -0.005, 0)), 0.060, 0.009, axis=V((0, 1, 0)), n=28, m=6)
        ctx.add(obj("ring_sign", b), "amber", mat="amber", rule="fit")
    if "quill_case" in ex:
        d = V((-0.9, -0.45, 0)).normalized()
        p, n = hit(tree, V((0, ay, L.waist - 0.06)) + d * 0.6, -d, V((0, ay, L.waist - 0.06)) + d * 0.17)
        b = bmesh.new()
        tube_path(b, [p + d * 0.022 + V((0, 0, 0.05)), p + d * 0.022 - V((0, 0, 0.11))], 0.019, n=10)
        tube_path(b, [p + d * 0.022 + V((0, 0, 0.05)), p + d * 0.022 + V((0.01, 0, 0.11))], [0.004, 0.001], n=5)
        ctx.add(obj("quill_case", b), "leather", "bronze", mat="leather", rule="rigid:pelvis")
    if "towel" in ex:
        o = ctx.tube("towel", L.waist + 0.01, L.hip - 0.10, ease=0.046, spans=[(300, 9)], over=torso_garments(ctx), thick=0.004,
                     trim_rows=2, flare=0.005)
        ctx.add(o, "cream", "terracotta", rule="skirt")
    if "pauldron" in ex:
        co, dom = ctx.co, ctx.dom
        o = ctx.shell("pauldron", lambda i, _: co[i].x > 0 and ((dom[i] in ("shoulder_L",)) or (dom[i] == "upperarm_L" and ctx.arm_s(co[i]) < 0.26)
                                                                or (dom[i] == "chest" and co[i].x > L.sh.x - 0.07 and co[i].z > L.armpit + 0.05)),
                      0.020, 0.006, relax=4)
        C.set_attr(o, "trim", lambda i, p: 0.0)
        ctx.add(o, "leather", "bronze", mat="leather", rule="fit")
    if "bracers" in ex:
        co, dom = ctx.co, ctx.dom
        o = ctx.shell("bracers", lambda i, _: dom[i] in ("forearm_L", "forearm_R") and 0.62 < ctx.arm_s(co[i]) < 0.94, 0.019, 0.004, relax=2)
        ctx.add(o, "leather_dark", mat="leather", rule="fit")
    # ---- things held in the right hand (the prop bone carries them)
    stick = None
    b = bmesh.new()
    base = V((gR.x, gR.y - 0.012, 0.0))
    if "broom" in ex:
        top = gR.z + 0.62
        tube_path(b, [base + V((0, 0, 0.22)), V((base.x, base.y, top))], 0.014, n=8)
        stick = ("broom", "wood", "wood")
        b2 = bmesh.new()
        rr = tube_path(b2, [base + V((0, 0, 0.30)), base + V((0, 0, 0.22)), base + V((0, 0, 0.0))], [0.03, 0.05, 0.10], n=14)
        torus(b2, base + V((0, 0, 0.27)), 0.036, 0.008, axis=V((0, 0, 1)), n=14, m=5)
        o2 = obj("broom_head", b2)
        for v in o2.data.vertices:
            if v.co.z < 0.2:
                a = math.atan2(v.co.y - base.y, v.co.x - base.x)
                v.co += V((math.cos(a), math.sin(a), 0)) * 0.008 * math.sin(a * 9)
        ctx.add(o2, "straw", mat="straw", rule="rigid:prop_R")
    elif "spear" in ex:
        top = L.top + 0.42
        tube_path(b, [base, V((base.x, base.y, top))], 0.014, n=8)
        stick = ("spear", "wood", "wood")
        b2 = bmesh.new()
        t0 = V((base.x, base.y, top))
        tube_path(b2, [t0 - V((0, 0, 0.02)), t0 + V((0, 0, 0.05)), t0 + V((0, 0, 0.13)), t0 + V((0, 0, 0.24))], [0.017, 0.022, 0.040, 0.001], n=4)
        for v in b2.verts:
            v.co.y = base.y + (v.co.y - base.y) * 0.28
        torus(b2, t0 - V((0, 0, 0.075)), 0.036, 0.006, axis=V((0, 1, 0)), n=18, m=6)
        ctx.add(obj("spear_head", b2, angle=30), "iron", "amber", mat="metal", rule="rigid:prop_R")
    elif "cane" in ex:
        top = gR.z + 0.03
        hook = [V((base.x, base.y, top)) + V((0, -0.035 * (1 - math.cos(a)), 0.035 * math.sin(a))) for a in (0.5, 1.0, 1.6, 2.2, 2.8)]
        tube_path(b, [base, V((base.x, base.y, top))] + hook, 0.012, n=8)
        stick = ("cane", "wood", "wood")
    elif "toy_top" in ex:
        c = gR + V((0, -0.02, -0.05))
        tube_path(b, [c + V((0, 0, 0.045)), c + V((0, 0, 0.02)), c, c - V((0, 0, 0.045))], [0.004, 0.006, 0.034, 0.001], n=10)
        stick = ("toy_top", "terracotta", "ochre")
    if stick:
        ctx.add(obj(stick[0], b), stick[1], stick[2], mat="wood", rule="rigid:prop_R")
    else:
        b.free()
    # ---- left hand, hip and back
    if "basket" in ex:
        b = bmesh.new()
        c = gL + V((0.0, -0.03, -0.20))
        rings = tube_path(b, [c + V((0, 0, 0.07)), c + V((0, 0, 0.0)), c - V((0, 0, 0.07))], [0.13, 0.115, 0.085], n=18)
        for vv in b.verts:
            vv.co.y = c.y + (vv.co.y - c.y) * 0.8
        torus(b, c + V((0, 0, 0.07)), 0.13, 0.008, axis=V((0, 0, 1)), n=18, m=5)
        for vv in b.verts:
            if abs(vv.co.z - (c.z + 0.07)) < 0.012:
                vv.co.y = c.y + (vv.co.y - c.y) * 0.8
        torus(b, c + V((0, 0, 0.07)), 0.125, 0.007, axis=V((0, 1, 0)), n=14, m=5, arc=math.pi)
        ctx.add(obj("basket", b), "straw", "leather_tan", mat="straw", rule="rigid:prop_L")
        b = bmesh.new()
        for k, (dx, dy) in enumerate(((-0.05, 0.0), (0.04, 0.02), (0.0, -0.035))):
            ball(b, c + V((dx, dy, 0.075)), 0.05, 1.25 if k else 0.9, 0.75, 0.6, u=10, v=7)
        ctx.add(obj("loaves", b), "ochre", mat="bread", rule="rigid:prop_L")
    if "satchel" in ex:
        tg = torso_garments(ctx)
        zc, amp = (L.sh.z + 0.0 + L.hip) / 2, (L.sh.z - L.hip) / 2 + 0.005
        o = ctx.band("satchel_strap", lambda t: zc - amp * math.sin(t), 0.036, 0.010, bones=SHOULDERS, over=tg, thick=0.004)
        ctx.add(o, "leather", mat="leather", rule="fit")
        tree = surface_tree(ctx)
        d = V((0.86, 0.5, 0)).normalized()
        p, n = hit(tree, V((0, ay, L.hip - 0.02)) + d * 0.7, -d, V((0, ay, L.hip)) + d * 0.2)
        c = p + d * 0.055 + V((0, 0, -0.02))
        rot = Matrix.Rotation(math.atan2(d.y, d.x), 3, "Z")
        b = bmesh.new()
        box(b, c, 0.10, 0.27, 0.21, rot)
        box(b, c + d * 0.012 + V((0, 0, 0.05)), 0.10, 0.285, 0.12, rot)
        ctx.add(obj("satchel", b, smooth=False), "leather_tan", "leather", mat="leather", rule="rigid:pelvis")
        if "scroll_tubes" in ex:
            b = bmesh.new()
            side = V((-d.y, d.x, 0))
            for k in (-1, 1):
                a0 = c + V((0, 0, 0.125)) + d * 0.01 * k - side * 0.15
                tube_path(b, [a0, a0 + side * 0.30], 0.020, n=8)
            ctx.add(obj("scroll_tubes", b), "cream", "terracotta", mat="cloth", rule="rigid:pelvis")
    if "ring_lute" in ex:
        tg = torso_garments(ctx)
        zc, amp = (L.sh.z + L.waist) / 2, (L.sh.z - L.waist) / 2
        ctx.add(ctx.band("lute_strap", lambda t: zc + amp * math.sin(t), 0.03, 0.010, bones=SHOULDERS, over=tg, thick=0.004),
                "leather_tan", mat="leather", rule="fit")
        tree = surface_tree(ctx)
        p, n = hit(tree, (0.0, ay + 1, L.bust - 0.05), (0, -1, 0), V((0, ay + 0.16, L.bust - 0.05)))
        c = p + V((-0.02, 0.055, -0.05))
        tilt = Matrix.Rotation(math.radians(-38), 3, "Y")
        b = bmesh.new()
        torus(b, V(), 0.125, 0.036, axis=V((0, 1, 0)), n=28, m=8)
        ball(b, V((0, 0.0, 0)), 0.118, 1.0, 0.16, 1.0, u=20, v=8)
        tube_path(b, [V((0, 0.0, 0.12)), V((0, -0.005, 0.50))], [0.018, 0.013], n=8)
        box(b, V((0, -0.005, 0.54)), 0.05, 0.022, 0.10)
        for k in range(4):
            tube_path(b, [V((-0.04, -0.005, 0.505 + 0.022 * k)), V((0.04, -0.005, 0.505 + 0.022 * k))], 0.005, n=5)
        torus(b, V((0, 0.03, 0)), 0.040, 0.006, axis=V((0, 1, 0)), n=16, m=5)
        for vv in b.verts:
            vv.co = c + tilt @ vv.co
        ctx.add(obj("ring_lute", b), "wood", "amber", mat="wood", rule="rigid:chest")

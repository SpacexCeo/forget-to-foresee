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
        if r.get("hem_at") == "knee":
            hem += L.knee
        if r.get("trousers"):
            ctx.add(ctx.trousers("trousers", r.get("trousers_cut", "ankle"), ease=0.013, width=r.get("trousers_w", 1.06),
                                 taper=0.95 if r.get("trousers_w", 1.0) > 1.1 else 0.74), *r["trousers"])
        if r.get("under"):
            torso(ctx.top("under_shirt", L.waist - 0.02, r.get("under_sleeves", "long"), ease=0.005, neck="round", relax=3,
                          thick=0.003, arm_ease=0.012), r["under"][0])
        wide = sl == "wide"
        neck = {"stand": "high", "wrap": "vee", "scoop": "wide"}.get(r.get("collar"), "round")
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
        over_ = [top] + ([G["trousers"]] if r.get("trousers") else [])
        split = None
        if r.get("underskirt"):
            ucol, uhem = r["underskirt"]
            us = ctx.tube("underskirt", L.waist + 0.02, uhem, ease=ease, flare=0.05, folds=0.006, nfold=9, over=over_,
                          trim_rows=0, hem_wave=0.003)
            torso(us, ucol, rule="skirt")
            over_.append(us)
            split = [(180, 168)]
        skirt = ctx.tube(base + "_skirt", L.waist + 0.035, hem, ease=ease + (0.014 if split else 0.006),
                         flare=0.075 if base == "dress" else 0.06,
                         folds=0.010 if base == "dress" else 0.007, nfold=11, over=over_, trim_rows=2, top_in=0.004,
                         hem_wave=0.0 if split else 0.004, spans=split, edge_trim=bool(split))
        torso(skirt, *col, rule="skirt")
        if neck == "high":                          # a stand collar band
            ctx.add(ctx.band("collar", lambda t: L.neck + 0.045, 0.05, 0.004, bones=("neck",), thick=0.004), col[1], rule="fit")
    else:
        tro = r["trousers"]
        cut = r.get("trousers_cut", "ankle")
        tw = r.get("trousers_w", 1.06)
        ctx.add(ctx.trousers("trousers", cut, ease=0.013 if cut != "knee" else 0.016, width=tw,
                             taper=0.95 if tw > 1.1 else 0.74), *tro)
        if r.get("socks"):
            ctx.add(ctx.leg_wraps("socks", L.ankle + 0.08, L.ankle + 0.42 * (L.knee - L.ankle)), r["socks"][0], rule="fit")
        if r.get("under"):
            us = ctx.top("under_shirt", L.waist - 0.02, r.get("under_sleeves", "long"), ease=0.005, neck="round", relax=3,
                         thick=0.003, arm_ease=0.010)
            ctx.clear(us, 0.004, [G["trousers"]], 0.004)
            torso(us, r["under"][0])
            if r.get("under_sleeves") == "rolled":
                ctx.add(ctx.cuff_rolls("under_rolls"), r["under"][0])
        sh = r["shirt"]
        hemk = r.get("shirt_hem", "tucked")
        ease = {"tucked": 0.010, "tunic": 0.012, "gambeson": 0.018, "blouse": 0.016}[hemk]
        thick = 0.009 if hemk == "gambeson" else 0.004
        neck = "vee" if hemk in ("tunic", "blouse") else ("high" if hemk == "gambeson" else "round")
        hem_z = {"tucked": L.waist - 0.005, "blouse": L.waist - 0.02}.get(hemk, L.hip + 0.03)
        slv = "short" if sl == "wide" else sl
        if r.get("under"):
            ease += 0.011
        top = ctx.top("shirt", hem_z, slv, ease=ease, neck=neck, relax=9 if hemk == "blouse" else 6, thick=thick)
        ctx.clear(top, 0.004, [G["trousers"]] + ([G["under_shirt"]] if r.get("under") else []), 0.004)
        torso(top, *sh)
        if sl == "wide":
            for o in ctx.bell_sleeves("shirt_sleeve", r1=0.035, drop=0.03):
                ctx.add(o, *sh, rule="sleeve")
        if sl == "rolled":
            ctx.add(ctx.cuff_rolls("shirt_rolls"), sh[0])
        if hemk in ("tunic", "gambeson"):
            z1 = L.crotch - (0.10 if hemk == "tunic" else 0.20)
            if "tunic_len" in r:
                z1 = L.crotch - (L.crotch - L.knee) * r["tunic_len"]
            long_ = r.get("tunic_len", 0) > 0.4
            sk = ctx.tube("shirt_skirt", hem_z + 0.035, z1, ease=ease + (0.016 if long_ else 0.008),
                          flare=(0.02 if hemk == "tunic" else 0.035) + (0.05 if long_ else 0.0),
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
        v = ctx.top("vest", hem_z, "none", ease=0.020, neck="vee", open_front=r.get("over_open", 0.045), relax=5, thick=0.005)
        ctx.clear(v, 0.004, torso_garments(ctx), 0.005)
        torso(v, *oc)
        if over == "vest_long":
            sk = ctx.tube("vest_skirt", hem_z + 0.03, L.knee + r.get("over_len", 0.04), ease=0.026, flare=0.05,
                          spans=[(180, 161 if r.get("over_open", 0.045) > 0.03 else 171)],
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
        dusty = "flour" in r.get("extras", ())
        if bib:
            torso(ctx.tube("apron_bib", z0, L.waist - 0.01, ease=0.030, spans=[(0, 26)], over=tg, thick=0.004, trim_rows=0,
                           edge_trim=True, bones=TORSO), *ac)
            ctx.add(ctx.band("apron_halter", lambda t: L.neck + 0.035 - (L.neck + 0.035 - z0) * (0.5 + 0.5 * math.cos(t)) ** 1.5,
                             0.016, 0.014, bones=NECK, over=tg, thick=0.003), ac[1], rule="fit")
        torso(ctx.tube("apron", L.waist + 0.02, L.knee + (0.05 if bib else 0.10), ease=0.036 if bib else 0.044, spans=[(0, 64)],
                       over=tg, thick=0.004, flare=0.03 if bib else 0.085, folds=0.004 if bib else 0.0, edge_trim=True,
                       flare_from=None if bib else L.waist), *ac, rule="skirt")
        torso(ctx.band("apron_ties", lambda t: L.waist + 0.005, 0.022, 0.034, over=tg, thick=0.003), ac[1], rule="fit")
        if dusty:
            for nm in ("apron", "apron_bib"):
                if nm in G:
                    G[nm]["dust"] = 1.0
    if r.get("shawl"):
        o = ctx.cape("shawl", L.waist - 0.04, ease=0.026, open_deg=9, flare=0.03, over=torso_garments(ctx), folds=0.013)
        zmin = min(v.co.z for v in o.data.vertices)
        C.set_attr(o, "trim", lambda i, p: 1.0 if p.z < zmin + 0.075 else 0.0)
        torso(o, *r["shawl"], rule="cape")
    if r.get("capelet"):
        o = ctx.cape("capelet", L.bust - 0.03, ease=0.022, open_deg=8, flare=0.035, over=torso_garments(ctx), folds=0.006)
        torso(o, *r["capelet"], rule="cape")
    # clan agents (C-001): mantles over the shoulders down to a given level, with an icicle or scalloped hem; several
    # tiers make Salt's layered robe. (col, tcol, hem z as an offset from the waist, hem style)
    for k, mt in enumerate(r.get("mantles", ())):
        col, tcol, dz, hem = mt
        o = ctx.cape(f"mantle_{k}", L.waist + dz, ease=0.024 + 0.008 * k, open_deg=4, flare=0.04 + 0.01 * k,
                     over=torso_garments(ctx), folds=0.008)
        zmin = min(v.co.z for v in o.data.vertices)
        for v in o.data.vertices:
            if v.co.z < zmin + 0.07:
                a = math.atan2(v.co.y - ctx.axis.y, v.co.x - ctx.axis.x)
                w = 1.0 - (v.co.z - zmin) / 0.07
                if hem == "icicle":
                    tri = abs(((a * 11 / TAU) % 1.0) - 0.5) * 2.0          # 0 at the tip, 1 between tips
                    v.co.z -= 0.075 * (1.0 - tri) * w
                elif hem == "scallop":
                    v.co.z -= 0.028 * abs(math.sin(a * 7)) * w
        C.set_attr(o, "trim", lambda i, p, zmin=zmin: 1.0 if p.z < zmin + 0.05 else 0.0)
        torso(o, col, tcol, rule="cape")
    if r.get("cowl"):                                   # a hood worn down: a soft roll round the back of the neck
        ctx.add(ctx.band("cowl", lambda t: L.neck - 0.005 - 0.05 * (0.5 + 0.5 * math.cos(t)), 0.09, 0.03, bones=NECK,
                         over=torso_garments(ctx), thick=0.012, round_=0.02), r["cowl"][0], rule="fit")
    if r.get("scarf"):
        ctx.add(ctx.band("scarf", lambda t: L.neck + 0.02 - 0.03 * (0.5 + 0.5 * math.cos(t)), 0.075, 0.012, bones=NECK,
                         over=torso_garments(ctx), thick=0.008, round_=0.012), r["scarf"][0], rule="fit")
        if "tails" in r["scarf"]:
            pan = ctx.tube("scarf_tails", L.neck - 0.03, L.waist - 0.10, ease=0.034, spans=[(16, 7.6), (344, 7.6)],
                           over=torso_garments(ctx), thick=0.006, trim_rows=1, bones=SHOULDERS + ("thigh_L", "thigh_R"))
            torso(pan, r["scarf"][0], "straw", rule="skirt")

    # ---- waist
    tg = torso_garments(ctx)
    if r.get("belt"):
        bc = r["belt"]
        bz = L.waist + (0.0 if base != "shirt_trousers" or r.get("shirt_hem") in ("tunic", "gambeson") else 0.0)
        torso(ctx.band("belt", lambda t: bz, 0.036, 0.012, over=tg, thick=0.005, over_gap=0.007), bc[0], mat="leather", rule="fit")
        tree = surface_tree(ctx)
        p, n = hit(tree, (0.0, ctx.axis.y - 1, bz), (0, 1, 0), V((0, ctx.axis.y - 0.15, bz)))
        b = bmesh.new()
        torus(b, p + V((0, -0.003, 0)), 0.021, 0.0045, axis=V((0, 1, 0)), n=20, m=6)
        box(b, p + V((0.004, -0.004, 0)), 0.036, 0.005, 0.006)
        ctx.add(obj("buckle", b), bc[1], mat="metal", rule="fit")
    if r.get("sash"):
        sc = r["sash"][0]
        torso(ctx.band("sash", lambda t: L.waist + 0.01 * math.sin(t), 0.085, 0.026, over=tg, thick=0.006, round_=0.008,
                       over_gap=0.014), sc, rule="fit")
        tree = surface_tree(ctx)                    # the knot at the left hip
        dk = V((0.62, -0.78, 0)).normalized()
        pk, _ = hit(tree, V((0, ctx.axis.y, L.waist)) + dk * 0.7, -dk, V((0, ctx.axis.y, L.waist)) + dk * 0.17)
        bk = bmesh.new()
        ball(bk, pk + dk * 0.012, 0.032, 1.0, 1.0, 0.85, u=10, v=7)
        ctx.add(obj("sash_knot", bk), sc, rule="fit")
        torso(ctx.tube("sash_tail", L.waist - 0.02, L.knee + 0.10, ease=0.046, spans=[(38, 6.5)], over=tg, thick=0.004,
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
    if kind in ("hood", "hood_point"):              # clan agents (C-001): a deep hood round the face, down the nape
        ears = IH.group_verts(ctx.bm, "ears", 0.2) if "ears" in ctx.bm.vertex_groups else set()
        region = set(scalp) | {i for i in ears}
        region |= {i for i, p in enumerate(co) if ctx.dom[i] in HEAD and p.y > ctx.head_c.y - 0.02 and p.z > L.mouth.z - 0.06}
        region |= {i for i, p in enumerate(co) if ctx.dom[i] in HEAD and p.y > ctx.head_c.y + 0.01}
        region |= {i for i, p in enumerate(co) if ctx.dom[i] == "neck" and p.y > ctx.head_c.y - 0.01}
        region |= {i for i, p in enumerate(co) if ctx.dom[i] in HEAD and p.z > L.eye.z + 0.045}   # a clean brow edge
        o = ctx.head_shell("hat", region, 0.022, 0.005, relax=10)
        hc, hr = ctx.head_c, ctx.head_r
        if kind == "hood_point":                      # Frost: the crown drawn up into a soft point, tipped back
            top = max(v.co.z for v in o.data.vertices)
            for v in o.data.vertices:
                u = max(0.0, (v.co.z - (top - 0.10)) / 0.10)
                v.co.z += 0.11 * u ** 2
                v.co.y += 0.05 * u ** 2
                v.co.x *= 1.0 - 0.45 * u ** 2
        # trim only along the face opening (the front rim), not over the whole front half
        C.set_attr(o, "trim", lambda i, p: 1.0 if p.y < hc.y - hr[1] * 0.92 else 0.0)
        ctx.add(o, col, tcol, rule="head")
        return 9.0
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


def blob(name, b, voxel=0.007, target=1400, smooth_it=4):
    """One clean closed shell from overlapping primitives (curls, buns, braids): voxel remesh, relax, reduce."""
    import bpy
    o = obj(name, b)
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new("r", "REMESH")
    m.mode = "VOXEL"
    m.voxel_size = voxel
    m.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    if smooth_it:
        m = o.modifiers.new("s", "SMOOTH")
        m.factor, m.iterations = 0.5, smooth_it
        bpy.ops.object.modifier_apply(modifier=m.name)
    n = sum(len(f.vertices) - 2 for f in o.data.polygons)
    if n > target:
        m = o.modifiers.new("d", "DECIMATE")
        m.ratio = target / n
        bpy.ops.object.modifier_apply(modifier=m.name)
    C.smooth(o, 180)
    return o


CURLS = {   # style: (ball radius range, lift off the scalp, count, keep(front, up) -> bool)
    "short_curly": ((0.020, 0.028), 0.012, 150),
    "curly_bob": ((0.024, 0.034), 0.016, 170),
    "wavy": ((0.017, 0.024), 0.010, 150),
    "pixie": ((0.013, 0.018), 0.006, 170),
    "swept": ((0.014, 0.020), 0.007, 150),
    "topknot": ((0.012, 0.016), 0.005, 170),
    "bun_curly": ((0.017, 0.024), 0.010, 150),
    "bun_low": ((0.013, 0.018), 0.006, 170),
    "ponytail": ((0.013, 0.017), 0.006, 170),
}


def curl_hair(ctx, style, scalp, lim):
    """Shaded-shell hair: curls laid over the scalp plus the style's own masses, as one remeshed shell.
    -> (head shell, hanging part or None)."""
    co, L, rnd = ctx.co, ctx.L, ctx.rnd
    hc, hr = ctx.head_c, ctx.head_r
    (r0, r1), lift, count = CURLS[style]
    nrm = ctx.bm.data.vertices
    idx = list(scalp)
    if style == "swept":                              # the elder's hairline has gone back
        idx = [i for i in idx if not (co[i].y < hc.y - hr[1] * 0.45 and co[i].z > hc.z + hr[2] * 0.35)]
    b = bmesh.new()
    step = max(1, len(idx) // count)
    order = sorted(idx, key=lambda i: (round(co[i].z, 2), co[i].x))
    for i in order[::step]:
        p = co[i]
        if p.z > lim - 0.012:
            continue
        r = rnd.uniform(r0, r1)
        ball(b, p + nrm[i].normal * (lift + rnd.uniform(-0.003, 0.003)), r, u=8, v=6)
    back = V((0, 1, 0))
    if style == "curly_bob":                          # a full bob to the jaw line, round the sides and the back
        for k in range(46):
            a = math.radians(rnd.uniform(48, 312))    # 0 = front
            z = rnd.uniform(L.head + 0.015, hc.z + 0.02)
            d = V((math.sin(a), -math.cos(a), 0))
            ball(b, V((hc.x + d.x * (hr[0] + 0.022), hc.y + d.y * (hr[1] + 0.02), z)), rnd.uniform(0.028, 0.038), u=8, v=6)
        for k in range(9):                            # curls over the forehead
            a = math.radians(-40 + 10 * k)
            ball(b, V((hc.x + math.sin(a) * hr[0] * 0.9, hc.y - math.cos(a) * hr[1] * 0.93, hc.z + hr[2] * 0.62)),
                 rnd.uniform(0.022, 0.028), u=8, v=6)
    if style in ("wavy", "short_curly"):              # the nape and the sides stay full
        for k in range(22):
            a = math.radians(rnd.uniform(75, 285))
            z = rnd.uniform(L.head + 0.05, hc.z)
            d = V((math.sin(a), -math.cos(a), 0))
            ball(b, V((hc.x + d.x * (hr[0] + 0.008), hc.y + d.y * (hr[1] + 0.008), z)), rnd.uniform(0.020, 0.027), u=8, v=6)
        for k in range(7):
            a = math.radians(-36 + 12 * k)
            ball(b, V((hc.x + math.sin(a) * hr[0] * 0.88, hc.y - math.cos(a) * hr[1] * 0.92, hc.z + hr[2] * 0.66)),
                 rnd.uniform(0.020, 0.026), u=8, v=6)
    if style == "pixie":                              # a short fringe pushed to one side
        for k in range(8):
            a = math.radians(-44 + 11 * k)
            ball(b, V((hc.x + math.sin(a) * hr[0] * 0.9, hc.y - math.cos(a) * hr[1] * 0.95, hc.z + hr[2] * (0.60 - 0.02 * k))),
                 0.018, 1.2, 0.8, 1.0, u=8, v=6)
    if style == "topknot":
        c = hc + V((0, hr[1] * 0.42, hr[2] * 1.02))
        ball(b, c, 0.040, 1.0, 1.0, 0.85, u=12, v=8)
        ball(b, c - V((0, 0, 0.03)), 0.028, u=10, v=6)
        for sx in (-1, 1):                            # loose locks at the temples
            a = hc + V((sx * hr[0] * 0.93, -hr[1] * 0.55, hr[2] * 0.25))
            tube_path(b, [a, a + V((sx * 0.012, -0.01, -0.05)), a + V((sx * 0.008, -0.004, -0.10))], [0.012, 0.011, 0.004], n=6)
    if style == "bun_curly":
        c = hc + V((0, hr[1] * 0.30, hr[2] * 1.06))
        ball(b, c, 0.058, 1.1, 1.0, 0.8, u=14, v=9)
        for k in range(10):
            a = TAU * k / 10
            ball(b, c + V((0.048 * math.cos(a), 0.044 * math.sin(a), rnd.uniform(-0.01, 0.02))), 0.022, u=8, v=6)
        for k in range(7):
            a = math.radians(-36 + 12 * k)
            ball(b, V((hc.x + math.sin(a) * hr[0] * 0.9, hc.y - math.cos(a) * hr[1] * 0.92, hc.z + hr[2] * 0.66)), 0.022, u=8, v=6)
    if style == "bun_low":
        c = hc + V((0, hr[1] * 0.98, -hr[2] * 0.30))
        ball(b, c, 0.052, 1.15, 0.9, 0.95, u=14, v=9)
        torus(b, c + V((0, 0.012, 0)), 0.034, 0.014, axis=V((0, 1, 0.2)), n=16, m=6)
    tail = None
    if style == "ponytail":
        c = hc + V((0, hr[1] * 0.62, hr[2] * 0.92))
        ball(b, c, 0.036, u=10, v=7)
        bt = bmesh.new()
        path = [c + V((0, 0.02, 0.01)), c + V((0, 0.075, 0.0)), c + V((0, 0.105, -0.08)), c + V((0.01, 0.10, -0.18)),
                V((0.0, ctx.axis.y + 0.14, L.bust + 0.10)), V((-0.01, ctx.axis.y + 0.15, L.bust + 0.0))]
        for k in range(26):
            t = k / 25 * (len(path) - 1)
            j = min(len(path) - 2, int(t))
            q = path[j].lerp(path[j + 1], t - j)
            ball(bt, q + V((0.012 * math.sin(k * 1.9), 0.006 * math.cos(k * 1.3), 0)), 0.040 - 0.018 * (k / 25) ** 1.5, u=8, v=6)
        tail = blob("hair_tail", bt, 0.008, 800)
    return blob("hair_shape", b, 0.0065, 1450 if style != "curly_bob" else 1700), tail


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
    off = {"shaved": 0.0012, "braids_two": 0.004, "short_messy": 0.012, "short_curly": 0.012, "covered": 0.004, "bald_ring": 0.013,
           "fringe_low": 0.014}.get(style, 0.007)
    if under_hat:
        off = min(off, 0.005)
    if style == "covered" and under_hat:
        return
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
    elif style == "short_curly_old":
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
            path = [a, a + V((s * 0.02, -0.01, -0.06)), V((s * 0.085, ctx.axis.y - 0.075, L.neck - 0.02)), V((s * 0.08, ctx.axis.y - 0.125, L.bust - 0.02))]
            for k in range(25):
                t = k / 24
                seg = min(2, int(t * 3))
                q = path[seg].lerp(path[seg + 1], t * 3 - seg) if seg < 3 else path[3]
                ball(b, q + V((0.006 * (k % 2 * 2 - 1), 0, 0)), 0.019 - 0.004 * t, 1.0, 1.0, 1.15, u=8, v=6)
            made = True
    elif style == "braids_back":
        for lat in (-1.0, -0.66, -0.33, 0.0, 0.33, 0.66, 1.0):
            path = scalp_path(ctx, 0.75, 2.9, lat * 1.05, n=9, off=0.010)
            tube_path(b, path, [0.008] * len(path), n=5, cap=False)
            end = path[-1]
            tail = [end, end + V((0, 0.02, -0.07)), V((lat * 0.07, ctx.axis.y + 0.13, L.neck - 0.02)), V((lat * 0.085, ctx.axis.y + 0.14, L.bust + 0.03))]
            tube_path(b, tail, [0.008, 0.008, 0.007, 0.004], n=5)
        made = True
    if style in CURLS and not under_hat:
        if style != "short_curly" or True:
            b.free()
            b = bmesh.new()
            made = False
        o, tail = curl_hair(ctx, style, idx, lim)
        ctx.add(o, colour, mat="hair", rule="head")
        o["nocover"] = 1
        if tail:
            ctx.add(tail, colour, mat="hair", rule="hair")
            tail["nocover"] = 1
            bb = bmesh.new()
            c = hc + V((0, hr[1] * 0.80, hr[2] * 0.90))
            torus(bb, c, 0.026, 0.008, axis=V((0, 1, 0.3)), n=12, m=5)
            ctx.add(obj("hair_tie", bb), "amber", mat="amber", rule="head")
    if style == "long_side":
        lk = C.hair_locks(C.scalp_points(bm, scalp), hc, hr, seed=17, length=0.27)
        if under_hat:
            IH.delete_verts(lk, lambda i, p: False)
        lk.name = "hair_locks"
        ctx.add(lk, colour, mat="hair", rule="hair")
        lk["nocover"] = 1
    if made:
        o = blob("hair_shape", b, 0.006, 1300) if style == "braids_two" else obj("hair_shape", b, angle=70)
        ctx.add(o, colour, mat="hair", rule="hair" if style.startswith("braids") else "head")
        o["nocover"] = 1
    else:
        b.free()
    if style == "braids_two":
        b = bmesh.new()
        for s in (-1, 1):
            torus(b, V((s * 0.08, ctx.axis.y - 0.123, L.bust + 0.0)), 0.014, 0.005, axis=V((0, 0.3, 1)), n=10, m=5)
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
        side = sm01(0.040, 0.055, ax) * sm01(m.z + 0.050, m.z + 0.020, p.z) * sm01(hc.y + 0.05, hc.y + 0.015, p.y)   # side whiskers stay below the cheekbone
        mo = sm01(m.z + 0.002, m.z + 0.007, p.z) * (1 - sm01(m.z + 0.016, m.z + 0.022, p.z)) * (1 - sm01(0.035, 0.05, ax)) * front
        return max(w, side * 0.7, mo * (0.55 if style == "full" else 0.8))
    W = {i: w_of(i) for i in range(len(co))}
    W = {i: w for i, w in W.items() if w > 0.06}
    if True:
        nrm = ctx.bm.data.vertices
        b = bmesh.new()
        ids = sorted(W)
        step = max(1, len(ids) // 260)
        for i in ids[::step]:
            w = W[i]
            p = co[i]
            # keep the mouth readable: no balls on the lip line, a thinner moustache above it (the baker's full
            # beard was one blob over the mouth)
            if abs(p.x) < 0.030 and m.z - 0.013 < p.z < m.z + 0.007:
                continue
            above = p.z > m.z
            chin = sm01(m.z - 0.03, m.z - 0.07, p.z)
            c = p + nrm[i].normal * (length * (0.30 if above else 0.45) * w) + V((0, -0.2, -1.0)) * (length * 0.7 * chin * w)
            ball(b, c, (0.005 + length * 0.30 * w) if above else (0.007 + length * 0.55 * w), u=7, v=5)
        o = blob("beard", b, 0.005, 800, smooth_it=3)
        ctx.add(o, colour, mat="hair", rule="fit")
        o["nocover"] = 1
        return
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

def necklace(ctx, name, z_front, z_back, r_bead=0.0, ease=0.005, n=40):
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
    if "cuirass" in ex:                               # leather body armour: chest and back plates down to the waist
        co, dom = ctx.co, ctx.dom
        zt, zb = L.neck - 0.035, L.waist + 0.035
        o = ctx.shell("cuirass", lambda i, _: dom[i] in TORSO and zb < co[i].z < zt and abs(co[i].x) < L.sh.x - 0.035,
                      0.034, 0.006, relax=6)
        ctx.clear(o, 0.004, torso_garments(ctx), 0.006)
        bmx = bmesh.new()
        bmx.from_mesh(o.data)
        bnd = {v.index for v in bmx.verts if v.is_boundary}
        bmx.free()
        zs_ = [zb + (zt - zb) * f for f in (0.22, 0.44, 0.66)]          # the plate rows
        C.set_attr(o, "trim", lambda i, p: 1.0 if i in bnd or any(abs(p.z - z) < 0.011 for z in zs_) else 0.0)
        o["layer"] = "torso"
        ctx.add(o, "leather", "leather_dark", mat="leather", rule="fit")
    for nm, sides in (("pauldron", ("L",)), ("pauldrons", ("L", "R"))):
        if nm not in ex:
            continue
        co, dom = ctx.co, ctx.dom
        for sd in sides:
            sg = 1 if sd == "L" else -1
            o = ctx.shell("pauldron_" + sd, lambda i, _: co[i].x * sg > 0 and (
                (dom[i] == "shoulder_" + sd) or (dom[i] == "upperarm_" + sd and ctx.arm_s(co[i]) < 0.26)
                or (dom[i] == "chest" and co[i].x * sg > L.sh.x - 0.07 and co[i].z > L.armpit + 0.05)), 0.040, 0.006, relax=4)
            bmx = bmesh.new()
            bmx.from_mesh(o.data)
            bnd = {v.index for v in bmx.verts if v.is_boundary}
            bmx.free()
            C.set_attr(o, "trim", lambda i, p: 1.0 if i in bnd else 0.0)
            ctx.add(o, "leather", "bronze", mat="leather", rule="fit")
    if "bracers" in ex:
        co, dom = ctx.co, ctx.dom
        o = ctx.shell("bracers", lambda i, _: dom[i] in ("forearm_L", "forearm_R") and 0.58 < ctx.arm_s(co[i]) < 0.95, 0.027, 0.004, relax=3)
        ctx.add(o, "leather_dark", mat="leather", rule="fit")
    for nm, deg in (("pouch", 55), ("pouch_r", -60)):     # belt pouches
        if nm in ex:
            a = math.radians(deg)
            d = V((math.sin(a), -math.cos(a), 0))
            z = L.waist - 0.075
            p, n = hit(tree, V((0, ay, z)) + d * 0.7, -d, V((0, ay, z)) + d * 0.17)
            c = p + d * 0.026
            rot = Matrix.Rotation(math.atan2(d.y, d.x), 3, "Z")
            b = bmesh.new()
            box(b, c, 0.05, 0.095, 0.11, rot)
            box(b, c + d * 0.006 + V((0, 0, 0.03)), 0.05, 0.103, 0.055, rot)
            ctx.add(obj(nm, b, smooth=False), "leather", "leather_dark", mat="leather", rule="rigid:pelvis")
    if "cross_strap" in ex:
        tg = torso_garments(ctx)
        zc, amp = (L.sh.z + L.waist) / 2, (L.sh.z - L.waist) / 2 + 0.005
        o = ctx.band("cross_strap", lambda t: zc - amp * math.sin(t), 0.03, 0.010, bones=SHOULDERS, over=tg, thick=0.004)
        ctx.add(o, "leather", mat="leather", rule="fit")
    if "sidearm" in ex:                               # a short sheathed blade at the left hip
        d = V((0.93, -0.25, 0)).normalized()
        z = L.waist - 0.03
        p, n = hit(tree, V((0, ay, z)) + d * 0.7, -d, V((0, ay, z)) + d * 0.18)
        c = p + d * 0.03
        b = bmesh.new()
        dn = V((0.05, 0.22, -0.97)).normalized()
        tube_path(b, [c, c + dn * 0.30, c + dn * 0.37], [0.026, 0.021, 0.006], n=8)
        for vv in b.verts:                             # a flat scabbard
            vv.co -= d * (vv.co - c).dot(d) * 0.45
        ctx.add(obj("sidearm_sheath", b), "leather", "bronze", mat="leather", rule="rigid:pelvis")
        b = bmesh.new()
        box(b, c - dn * 0.006, 0.02, 0.085, 0.014, Matrix.Rotation(math.atan2(d.y, d.x), 3, "Z"))
        tube_path(b, [c - dn * 0.01, c - dn * 0.11], [0.015, 0.013], n=8)
        ball(b, c - dn * 0.12, 0.019, u=8, v=6)
        ctx.add(obj("sidearm_hilt", b), "leather_dark", "bronze", mat="metal", rule="rigid:pelvis")
        ctx.garments["sidearm_hilt"]["gcol"] = "bronze"
    if "lute" in ex:                                  # a pear-bodied lute carried on the back, neck up over the left shoulder
        tg = torso_garments(ctx)
        zc, amp = (L.sh.z + L.waist) / 2, (L.sh.z - L.waist) / 2
        ctx.add(ctx.band("lute_strap", lambda t: zc + amp * math.sin(t), 0.03, 0.010, bones=SHOULDERS, over=tg, thick=0.004),
                "leather_tan", mat="leather", rule="fit")
        tree2 = surface_tree(ctx)
        zb = (L.bust + L.waist) / 2
        p, n = hit(tree2, (0.0, ay + 1, zb), (0, -1, 0), V((0, ay + 0.16, zb)))
        c = p + V((-0.03, 0.085, -0.06))
        tilt = Matrix.Rotation(math.radians(-32), 3, "Y")
        b = bmesh.new()
        ball(b, V((0, 0.0, 0)), 0.135, 1.0, 0.52, 1.25, u=18, v=12)
        for vv in b.verts:
            if vv.co.y < -0.012:                       # the flat soundboard faces the back of the wearer
                vv.co.y = -0.012
            if vv.co.z > 0:                            # pear shape: narrower toward the neck
                vv.co.x *= 1 - 0.45 * (vv.co.z / 0.17) ** 1.2
        tube_path(b, [V((0, 0.012, 0.14)), V((0, 0.012, 0.44))], [0.022, 0.017], n=8)
        box(b, V((0, 0.035, 0.475)), 0.045, 0.07, 0.12, Matrix.Rotation(math.radians(35), 3, "X"))
        for vv in b.verts:
            vv.co = c + tilt @ vv.co
        ctx.add(obj("lute", b), "leather_tan", "wood", mat="wood", rule="rigid:chest")
    # ---- clan agents (C-001)
    hc, hr = ctx.head_c, ctx.head_r
    for nm in ("veil", "mouthwrap"):                  # a cloth over the lower face, below the eyes
        if nm in ex:
            region = [i for i, p in enumerate(ctx.co) if ctx.dom[i] in HEAD and p.y < hc.y - 0.015
                      and L.mouth.z - (0.075 if nm == "veil" else 0.055) < p.z < L.eye.z - 0.018]
            # stands well off the lips and teeth (they showed through as dark smudges), one plain colour
            o = ctx.head_shell(nm, region, 0.019, 0.003, relax=8)
            C.set_attr(o, "trim", lambda i, p: 0.0)
            o["nocover"] = 1
            ctx.add(o, *r_cols(e, nm), rule="head")
    if "quartz_shoulders" in ex:                      # Salt: milky quartz clusters on both shoulders
        b = bmesh.new()
        for s_ in (-1, 1):
            sh = ctx.bones["shoulder_L" if s_ > 0 else "shoulder_R"][1]
            for k in range(5):
                a = k * 1.3
                base_ = sh + V((s_ * (0.02 + 0.015 * math.cos(a)), 0.02 * math.sin(a), 0.03))
                tip = base_ + V((s_ * (0.03 + 0.02 * (k % 2)), -0.005 * k, 0.07 + 0.025 * (k % 3)))
                tube_path(b, [base_, tip], [0.016, 0.0], n=6)
        ctx.add(obj("quartz", b, smooth=False), "shell_white", mat="shell", rule="rigid:chest")
    if "stake_collar" in ex:                          # Ash: a collar of charred stakes fanned round the shoulders
        b = bmesh.new()
        nk = ctx.bones["neck"][0]
        for k in range(9):
            a = math.pi * (0.10 + 0.80 * k / 8)
            d = V((math.cos(a), 0.35 * math.sin(a) + 0.12, 0))
            base_ = nk + V((d.x * 0.17, d.y * 0.12, -0.06))
            tip = base_ + V((d.x * 0.10, 0.08, 0.30 + 0.06 * (k % 2)))
            tube_path(b, [base_, tip], [0.018, 0.0], n=6)
        ctx.add(obj("stake_collar", b, smooth=False), "charred", "ember", mat="wood", rule="rigid:chest")
    if "stake_shield" in ex:                          # Ash: a bundle of stakes bound across the left forearm
        b = bmesh.new()
        el, wr = ctx.bones["forearm_L"][0], ctx.bones["forearm_L"][1]
        mid = (el + wr) / 2 + V((0.04, -0.02, 0))
        for k in range(6):
            off = V((0.0, -0.03 + 0.012 * k, -0.06 + 0.024 * k))
            tube_path(b, [mid + off + V((-0.16, 0, 0)), mid + off + V((0.16, 0, 0)), mid + off + V((0.21, 0, 0))], [0.014, 0.014, 0.0], n=6)
        ctx.add(obj("stake_shield", b, smooth=False), "charred", "ember", mat="wood", rule="rigid:forearm_L")
    if "leaves_shoulders" in ex:                      # Moss: broad leaves and small mushrooms on the cloak's shoulders
        b = bmesh.new()
        for s_ in (-1, 1):
            sh = ctx.bones["shoulder_L" if s_ > 0 else "shoulder_R"][1]
            for k in range(4):
                c = sh + V((s_ * (0.01 + 0.03 * k), -0.03 + 0.03 * (k % 2), 0.035))
                ball(b, c, 0.045, 1.0, 0.55, 0.12)
        ctx.add(obj("leaves", b), "moss_c", mat="cloth", rule="rigid:chest")
        b = bmesh.new()
        for s_ in (-1, 1):
            sh = ctx.bones["shoulder_L" if s_ > 0 else "shoulder_R"][1]
            for k in range(3):
                c = sh + V((s_ * (0.03 + 0.025 * k), -0.01, 0.05))
                tube_path(b, [c, c + V((0, 0, 0.025))], [0.006, 0.006], n=5)
                ball(b, c + V((0, 0, 0.03)), 0.016, 1.0, 1.0, 0.55)
        ctx.add(obj("mushrooms", b), "linen_c", mat="cloth", rule="rigid:chest")
    if "cauldron" in ex:                              # Moss: a small cauldron carried in the left hand
        b = bmesh.new()
        gp = gL + V((0.0, -0.01, -0.13))
        ball(b, gp, 0.075, 1.0, 1.0, 0.85)
        torus(b, gp + V((0, 0, 0.06)), 0.062, 0.008, axis=V((0, 0, 1)), n=18, m=5)
        torus(b, gp + V((0, 0, 0.09)), 0.07, 0.004, axis=V((1, 0, 0)), n=16, m=4, arc=math.pi)
        ctx.add(obj("cauldron", b), "iron", "copper", mat="metal", rule="rigid:prop_L")
    if "strongbox" in ex:                             # Amber: a brass-bound strongbox strapped on the back
        b = bmesh.new()
        ch = ctx.bones["chest"][1] if "chest" in ctx.bones else V((0, 0, L.bust))
        c = V((0, hc.y + 0.17, L.bust - 0.02))
        box(b, c, 0.30, 0.18, 0.24)
        ctx.add(obj("strongbox", b, smooth=False), "leather_d", "brass", mat="wood", rule="rigid:chest")
        b = bmesh.new()
        for x in (-0.1, 0.1):
            box(b, c + V((x, 0, 0)), 0.025, 0.19, 0.25)
        box(b, c + V((0, -0.095, 0.0)), 0.05, 0.02, 0.06)
        ctx.add(obj("strongbox_bands", b, smooth=False), "brass", mat="metal", rule="rigid:chest")
    if "keys" in ex:                                  # Amber: a ring of keys at the belt
        b = bmesh.new()
        kc = V((0.13, ctx.axis.y - 0.09, L.waist - 0.06))
        torus(b, kc, 0.03, 0.004, axis=V((0, 1, 0)), n=14, m=4)
        for k in range(3):
            a = -0.6 + 0.6 * k
            tube_path(b, [kc + V((math.sin(a) * 0.03, 0, -0.03)), kc + V((math.sin(a) * 0.05, 0, -0.10))], [0.004, 0.004], n=4)
        ctx.add(obj("keys", b), "brass", mat="metal", rule="rigid:pelvis")
    if "monocle" in ex:                               # Frost: a monocle on the right eye
        b = bmesh.new()
        # on the right eye: the eye centre is about 3 cm off the midline, the ring rests on the cheek and brow
        eyes_r = [ctx.co[i] for i in range(len(ctx.co)) if ctx.dom[i] in HEAD and ctx.co[i].x < -0.012
                  and abs(ctx.co[i].z - L.eye.z) < 0.012 and ctx.co[i].y < hc.y - hr[1] * 0.75]
        exr = sum((q.x for q in eyes_r), 0.0) / len(eyes_r) if eyes_r else -0.031
        eyr = min((q.y for q in eyes_r), default=hc.y - hr[1])
        ey = V((exr * 0.95, eyr - 0.010, L.eye.z))
        torus(b, ey, 0.017, 0.0025, axis=V((0, 1, 0)), n=16, m=4)
        ctx.add(obj("monocle", b), "silver", mat="metal", rule="head")
    if "slate_tablet" in ex:                          # Frost: a slate sign-tablet in the left hand
        b = bmesh.new()
        box(b, gL + V((0.0, -0.03, -0.06)), 0.03, 0.18, 0.24)
        ctx.add(obj("tablet", b, smooth=False), "slate_c", "silver", mat="wood", rule="rigid:prop_L")
    if "lantern" in ex:                               # carried in the left hand, hanging from its ring
        gp = gL + V((0.0, -0.01, -0.085))
        b = bmesh.new()
        torus(b, gp + V((0, 0, 0.0)), 0.026, 0.004, axis=V((1, 0, 0)), n=14, m=5)
        tube_path(b, [gp + V((0, 0, -0.03)), gp + V((0, 0, -0.05)), gp + V((0, 0, -0.075)), gp + V((0, 0, -0.085))],
                  [0.012, 0.03, 0.052, 0.056], n=10)
        tube_path(b, [gp + V((0, 0, -0.235)), gp + V((0, 0, -0.26))], [0.056, 0.05], n=10)
        for k in range(4):
            a = TAU * (k + 0.5) / 4
            q = gp + V((0.05 * math.cos(a), 0.05 * math.sin(a), 0))
            tube_path(b, [q + V((0, 0, -0.085)), q + V((0, 0, -0.235))], 0.0055, n=5)
        ctx.add(obj("lantern", b), "iron", "bronze", mat="metal", rule="rigid:prop_L")
        b = bmesh.new()
        tube_path(b, [gp + V((0, 0, -0.088)), gp + V((0, 0, -0.232))], 0.044, n=10)
        ctx.add(obj("lantern_glass", b), "amber", mat="amber", rule="rigid:prop_L")
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
    elif "armillary_staff" in ex:                     # Frost: a tall silver staff crowned by an armillary
        top = L.top + 0.45
        tube_path(b, [base, V((base.x, base.y, top))], 0.012, n=8)
        stick = ("staff", "silver", "silver")
        b2 = bmesh.new()
        t0 = V((base.x, base.y, top + 0.11))
        for ax in (V((1, 0, 0)), V((0, 1, 0)), V((0.7, 0.7, 0))):
            torus(b2, t0, 0.10, 0.006, axis=ax, n=22, m=4)
        ball(b2, t0, 0.025)
        ctx.add(obj("armillary", b2), "silver", "ice", mat="metal", rule="rigid:prop_R")
    elif "balance" in ex:                             # Salt: a brass balance held up in the right hand
        top = gR.z + 0.20
        tube_path(b, [base + V((0, 0, gR.z - 0.02)), V((base.x, base.y, top))], 0.008, n=6)
        stick = ("balance", "brass", "brass")
        b2 = bmesh.new()
        t0 = V((base.x, base.y, top))
        tube_path(b2, [t0 + V((-0.13, 0, 0)), t0 + V((0.13, 0, 0))], 0.006, n=6)
        for s_ in (-1, 1):
            pc = t0 + V((s_ * 0.13, 0, -0.14))
            for k in range(3):
                a = TAU * k / 3
                tube_path(b2, [t0 + V((s_ * 0.13, 0, 0)), pc + V((math.cos(a) * 0.04, math.sin(a) * 0.04, 0))], 0.0018, n=3)
            torus(b2, pc, 0.045, 0.006, axis=V((0, 0, 1)), n=16, m=4)
            ball(b2, pc + V((0, 0, -0.004)), 0.044, 1.0, 1.0, 0.18)
        ctx.add(obj("balance_beam", b2), "brass", mat="metal", rule="rigid:prop_R")
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


def r_cols(e, nm):
    """Colours for an agent extra: costume key `<name>_col` = (col, tcol), else ivory."""
    c = e["costume"].get(nm + "_col", ("ivory", "ivory"))
    return c[0], c[1] if len(c) > 1 else c[0]

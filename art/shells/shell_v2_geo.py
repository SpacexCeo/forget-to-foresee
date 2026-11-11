"""Analytic surface of the Shell, version 2 (pure numpy, no Blender).

One long, slender spiral seashell (auger / spindle type) used for all four Shells: a whorl section
swept along a logarithmic helico-spiral, apex up. Self-similar: every whorl is the previous one
times W, so one tileable texture strip (u along the whorl, v across it) covers the whole Shell.

Shared by build_shell_v2.py (the game model) and art/town/town_altar.py (the town's sky impostor
samples the same function at low resolution, so the far silhouette is the same Shell).

Coordinates: Z up, metres, pivot at the bottom centre, the aperture looks along -Y (glTF +Z).
"""
import math

import numpy as np

TAU = 2.0 * math.pi

W = 1.19            # growth per whorl
G0 = 0.036          # scale of the first (apex) ring; the last ring has scale 1
RHO = 1.22          # section centre distance from the axis at scale 1
A = 1.18            # section half-width (radial)
B = 1.62            # section half-height (axial)
H = 14.70           # depth of the last section centre below the apex
SUPER = 2.5         # superellipse exponent: flattened flanks, crisp sutures
CANAL_L = 1.55      # length of the siphonal canal below the body whorl
CANAL_PSI = math.radians(-116)
RIBS = 14           # axial growth ribs per whorl
RIB_AMP = 0.034
FLARE = 0.24        # aperture lip flare
FLARE_BACK = 0.20   # whorls over which the lip flares
TARGET_H = 18.0
UV_REPEAT = 2       # texture tiles per whorl (RIBS / UV_REPEAT ribs per tile)

# Spiral cords raised on the outer flank: (angle on the section, amplitude, width), radians.
CORDS = ((math.radians(58), 0.070, 0.20), (math.radians(14), 0.045, 0.13), (math.radians(-30), 0.050, 0.14))

# Texture v: the outer arc of the section (what is seen between two sutures) gets most of the strip.
PSI_LO, PSI_HI = -0.64 * math.pi, 0.60 * math.pi
V_LO, V_HI = 0.06, 0.90

THETA_END = 0.0
N_WHORLS = math.log(1.0 / G0) / math.log(W)
THETA_START = THETA_END - TAU * N_WHORLS


def psi_to_v(psi):
    psi = np.asarray(psi, float)
    return np.where(psi < PSI_LO, (psi + math.pi) / (PSI_LO + math.pi) * V_LO,
                    np.where(psi > PSI_HI, V_HI + (psi - PSI_HI) / (math.pi - PSI_HI) * (1 - V_HI),
                             V_LO + (psi - PSI_LO) / (PSI_HI - PSI_LO) * (V_HI - V_LO)))


def v_to_psi(v):
    v = np.asarray(v, float)
    return np.where(v < V_LO, -math.pi + v / V_LO * (PSI_LO + math.pi),
                    np.where(v > V_HI, PSI_HI + (v - V_HI) / (1 - V_HI) * (math.pi - PSI_HI),
                             PSI_LO + (v - V_LO) / (V_HI - V_LO) * (PSI_HI - PSI_LO)))


def _smooth(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def _spow(x, p):
    return np.sign(x) * np.abs(x) ** p


def scale_of(theta):
    return W ** ((np.asarray(theta, float) - THETA_END) / TAU)


def rib_wave(theta, psi):
    """0..1, one rounded crest per rib; the ribs lean forward toward the lower suture (prosocline)."""
    ph = theta / TAU * RIBS + 0.16 * np.sin(psi * 0.9)
    c = 0.5 + 0.5 * np.cos(TAU * ph)
    return c ** 1.6


def surface(theta, psi, ribs=True):
    """Points of the outer surface for arrays theta (along the spiral) and psi (around the section;
    0 = outermost, +pi/2 = toward the apex). Returns (..., 3) in build coordinates (apex at z = 0)."""
    theta, psi = np.broadcast_arrays(np.asarray(theta, float), np.asarray(psi, float))
    g = scale_of(theta)
    cx, sy = _spow(np.cos(psi), 2.0 / SUPER), _spow(np.sin(psi), 2.0 / SUPER)
    outer = _smooth(np.cos(psi) / 0.45)
    bump = sum(a * np.exp(-((psi - c) / w) ** 2) for c, a, w in CORDS)
    x = A * cx * (1.0 + bump * outer)
    y = B * sy
    if ribs:
        x = x * (1.0 + RIB_AMP * rib_wave(theta, psi) * outer)
    # the lip flares over the last part of the body whorl
    qf = _smooth((theta - (THETA_END - TAU * FLARE_BACK)) / (TAU * FLARE_BACK)) ** 2
    x = x * (1.0 + FLARE * qf * np.clip(np.cos(psi), 0, 1) ** 0.7)
    y = y * (1.0 + 0.07 * qf)
    # siphonal canal: the lower inner lobe of the section is drawn down along the axis
    qc = _smooth((theta - (THETA_END - TAU * 1.45)) / (TAU * 0.45))
    wc = np.clip(np.cos(psi - CANAL_PSI), 0, 1) ** 3 * qc
    r = (RHO + x) * (1.0 - 0.80 * wc)
    y = y - CANAL_L * wc
    r, z = g * r, g * (y - H)
    return np.stack([r * np.cos(theta), -r * np.sin(theta), z], -1)   # -sin: dextral, like most sea snails


def psi_samples(sides):
    """Section sampling: dense on the visible outer arc, sparse on the side buried in the columella."""
    n_out = int(round(sides * 0.72))
    out = np.linspace(PSI_LO, PSI_HI, n_out + 1)
    inn = np.linspace(PSI_HI, PSI_LO + TAU, sides - n_out + 1)[1:]
    psi = np.concatenate([out, inn])            # sides + 1 values, first == last (mod 2 pi): the UV seam
    return psi


def theta_samples(seg_body, seg_apex):
    """Ring angles from the apex to the aperture: fewer segments per whorl on the small apex whorls."""
    th, out = THETA_END, [THETA_END]
    while th > THETA_START + 1e-6:
        g = float(scale_of(th))
        seg = seg_apex + (seg_body - seg_apex) * min(1.0, g / 0.6) ** 0.5
        th = max(THETA_START, th - TAU / seg)
        out.append(th)
    return np.array(out[::-1])


def bottom_z():
    """Lowest point of the build-space surface (tip of the canal)."""
    th = np.linspace(THETA_END - TAU, THETA_END, 97)[:, None]
    ps = np.linspace(-math.pi, 0, 97)[None, :]
    return float(surface(th, ps)[..., 2].min())


def grid(seg_body=60, seg_apex=20, sides=20, ribs=True):
    """Runtime grid: dict with P (rings, sides+1, 3) scaled and shifted so the pivot is the bottom centre
    and the height is TARGET_H, uv (rings, sides+1, 2), theta (rings), psi (sides+1), g (rings), scale."""
    th = theta_samples(seg_body, seg_apex)
    ps = psi_samples(sides)
    P = surface(th[:, None], ps[None, :], ribs=ribs)
    zb = bottom_z()
    sc = TARGET_H / (0.0 - zb)
    P = (P - np.array([0, 0, zb])) * sc
    u = (th - THETA_START) / TAU * UV_REPEAT
    v = psi_to_v(np.where(ps > math.pi, ps - TAU, ps))
    v[-1] = 1.0 if v[-1] < 0.5 else v[-1]
    v[0] = psi_to_v(PSI_LO)
    # the strip is cut at psi = PSI_LO + 2 pi == PSI_LO; make v run 0.06 .. 1.06 so it stays continuous
    v = np.where(np.arange(len(ps)) > 0, np.where(v < v[0] - 1e-9, v + 1.0, v), v)
    v[-1] = v[0] + 1.0
    uv = np.stack(np.broadcast_arrays(u[:, None], v[None, :]), -1)
    return dict(P=P, uv=uv, theta=th, psi=ps, g=scale_of(th), scale=sc, apex=np.array([0.0, 0.0, TARGET_H]))


def to_world(p_build, scale=None):
    zb = bottom_z()
    sc = scale or TARGET_H / (0.0 - zb)
    return (np.asarray(p_build, float) - np.array([0, 0, zb])) * sc


if __name__ == "__main__":
    g = grid()
    P = g["P"].reshape(-1, 3)
    print("rings", len(g["theta"]), "whorls %.2f" % N_WHORLS, "scale %.4f" % g["scale"])
    print("bounds", P.min(0).round(2), P.max(0).round(2), "tris", (len(g["theta"]) - 1) * (len(g["psi"]) - 1) * 2)

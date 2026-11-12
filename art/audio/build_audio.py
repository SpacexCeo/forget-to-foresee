#!/usr/bin/env python3
"""Render every Forget to Foresee sound from scratch and encode it for the web client.

    python3 art/audio/build_audio.py              # all assets
    python3 art/audio/build_audio.py --only gift_chime amb_wind
    python3 art/audio/build_audio.py --list
    python3 art/audio/build_audio.py --wav DIR    # also keep the float WAV masters in DIR

Output: game/public/assets/audio/<name>.ogg (Ogg Opus, 48 kHz) and the runtime manifest
game/src/audio/manifest.js. Requires numpy, scipy and ffmpeg with libopus. No samples are used:
every sound is synthesized here (see synth.py); seeds derive from the asset name, so a re-run
produces the same masters.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from synth import *  # noqa: E402,F401,F403
import synth as S  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / "game/public/assets/audio"
MANIFEST_JS = REPO / "game/src/audio/manifest.js"

ASSETS = {}


def asset(name, kind, loop=False, br=48, target=(-18, "short"), ref=None, rolloff=None, group=None, extra=None):
    """Register a generator. kind: amb | music | voice | sfx | ui | step | sting."""
    def deco(fn):
        ASSETS[name] = dict(fn=fn, kind=kind, loop=loop, br=br, target=target, ref=ref, rolloff=rolloff,
                            group=group, extra=extra or {})
        return fn
    return deco


def variants(base, count, kind, **kw):
    """Register `count` variants base_1..base_N of one generator fn(r, i)."""
    def deco(fn):
        for i in range(count):
            nm = f"{base}_{i + 1}"
            asset(nm, kind, group=base, **kw)(lambda r, i=i, fn=fn: fn(r, i))
        return fn
    return deco


def poisson_times(r, rate, T, weight=None):
    k = r.poisson(rate * T)
    ts = np.sort(r.random(k) * T)
    if weight is not None and len(ts):
        w = weight[np.clip((ts * SR).astype(int), 0, len(weight) - 1)]
        ts = ts[r.random(len(ts)) < w]
    return ts


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# =============================================================================================
# Ambience beds (seamless loops)
# =============================================================================================

def wind_layer(n, r, level=1.0, whistles=((720, 260), (1180, 380), (1730, 300)), bright=1.0, gust=None):
    """Stereo wind: gusting pink body + narrow wandering whistles + hiss."""
    gust = gust if gust is not None else smooth_random(n, 0.12, r, 0.2, 1.0) ** 1.4
    tracks = [smooth_random(n, 0.25, r) for _ in whistles]
    out = []
    for ch in range(2):
        g = np.roll(gust, ch * ns(0.9))
        w = pink(n, r)

        def shape(f, t, g=g):
            gs = ctrl_at(g, t)
            fc = 220 + 1000 * gs * bright
            body = (0.3 + 0.7 * gs) / np.sqrt(1 + (f / fc) ** 4)
            wh = 0
            for (base, span), tr in zip(whistles, tracks):
                cf = base + span * (ctrl_at(np.roll(tr, ch * ns(0.3)), t) - 0.5) * 2
                wh = wh + 2.4 * gs ** 2.4 * np.exp(-0.5 * ((f - cf) / 16) ** 2)
            hiss = 0.12 * gs * bright * np.clip(f / 4000, 0, 1) * (4000 / np.maximum(f, 4000))
            return body + wh * (f / 500) ** 0.5 + hiss * (f / 1000) ** 0.5
        out.append(stft_shape(w, shape))
    return np.stack(out) * level


@asset("amb_wind", "amb", loop=True, br=64, target=(-24, "int"))
def amb_wind(r):
    L, P = 40.0, 3.0
    n = ns(L + P)
    y = wind_layer(n, r)
    y = highpass(y, 35)
    return fold_xfade(y, ns(L), ns(P))


@asset("amb_shell_hum", "amb", loop=True, br=32, target=(-22, "int"), ref=22, rolloff=0.8)
def amb_shell_hum(r):
    """Mono positional hum for each Shell: partials on a 1/32 Hz grid so the slow beating loops exactly."""
    L, P = 32.0, 2.0
    n = ns(L + P)
    t = taxis(n)
    q = 1 / 32.0
    parts = [(27.5, 0.35), (55.0, 1.0), (55.0 + 4 * q, 0.8), (82.5, 0.35), (82.5 + 2 * q, 0.3), (110.0, 0.5),
             (110.0 + 2 * q, 0.45), (165.0, 0.2), (220.0 + q, 0.1), (330.0, 0.05), (880.0, 0.02), (880.0 + 4 * q, 0.02)]
    y = sum(a * np.sin(2 * np.pi * f * t + r.random() * 6.28) for f, a in parts)
    y *= 0.8 + 0.2 * np.sin(2 * np.pi * t / 16)
    y = soft_clip(y * 0.6, 1.8)
    air = bandpass(noise(n, r), 250, 900) * 0.04 * (0.6 + 0.4 * np.sin(2 * np.pi * t / 8))
    y = y + air
    return fold_xfade(y, ns(L), ns(P))


@asset("amb_shell_inside", "amb", loop=True, br=64, target=(-24, "int"))
def amb_shell_inside(r):
    """Inside a Shell: a deeper beating hum, nacre ribs singing, distant creaks, a long hall."""
    L, P = 32.0, 3.0
    Ln, n = ns(L), ns(L + P)
    t = taxis(n)
    q = 1 / 32.0
    hum = sum(a * np.sin(2 * np.pi * f * t + r.random() * 6.28) for f, a in
              [(41.25, 1.0), (41.25 + 3 * q, 0.85), (61.875, 0.4), (82.5, 0.45), (82.5 + 2 * q, 0.35), (123.75, 0.15)])
    hum = soft_clip(hum * 0.5, 2.0) * 0.6
    sing = 0
    for k, (f, a) in enumerate([(1320.0, 1.0), (1980.0 + 2 * q, 0.7), (2640.0 + 4 * q, 0.5), (3300.0 + q, 0.3)]):
        sing = sing + a * np.sin(2 * np.pi * f * t) * periodic_lfo(n, 32 / (k + 1), r) ** 3
    sing *= 0.03
    air = pink(n, r, 2) * 0.03
    air = lowpass(air, 700)
    buf = to_stereo(hum) + pan(sing, 0.0) * 1.0 + air
    for tt in poisson_times(r, 0.18, L + P):
        d = r.uniform(0.6, 1.6)
        m = ns(d)
        tr = taxis(m)
        f = r.uniform(70, 160) * (1 + 0.3 * np.sin(np.pi * tr / d))
        cr = resonator(noise(m, r), 900, 4) * 0.2 + np.sin(phase_of(f)) * 0.5
        cr *= np.sin(np.pi * tr / d) ** 2
        place(buf, pan(cr * 0.08, r.uniform(-0.8, 0.8)), ns(tt))
    y = fold_xfade(buf, Ln, ns(P))
    return reverb_circular(y, make_ir(6.0, rng=r, predelay=0.04), wet=0.55, dry=0.7)


def camp_base(n, r, level=0.25, **kw):
    return wind_layer(n, r, level=level, **kw)


@asset("amb_camp_sol", "amb", loop=True, br=64, target=(-25, "int"))
def amb_camp_sol(r):
    """Salt: crystal chimes stirred by gusts, a faint sizzle of salt grains."""
    L, P = 24.0, 3.0
    n = ns(L + P)
    gust = smooth_random(n, 0.15, r, 0.1, 1.0)
    buf = camp_base(n, r, 0.18, gust=gust ** 1.4)
    notes = [1318.5, 1480.0, 1661.2, 1975.5, 2217.5, 2489.0, 2960.0]
    for tt in poisson_times(r, 3.2, L + P, gust ** 2):
        f0 = r.choice(notes) * (1 + 0.004 * r.standard_normal())
        ch = strike(3.0, f0, BAR_RATIOS[:4], [1, 0.45, 0.22, 0.1], [2.4, 0.9, 0.35, 0.15], r, click=0.15)
        place(buf, pan(ch * r.uniform(0.15, 0.6), r.uniform(-0.75, 0.75)), ns(tt))
    grains = np.zeros(n)
    for tt in poisson_times(r, 50, L + P):
        grains[min(ns(tt), n - 1)] += r.uniform(-1, 1)
    grains = highpass(grains, 5000) * 0.25
    buf += pan(grains, 0.2)
    buf = reverb(buf, make_ir(1.6, rng=r, bright=1.2), wet=0.3)[:, :n]
    return fold_xfade(buf, ns(L), ns(P))


@asset("amb_camp_pepel", "amb", loop=True, br=64, target=(-24, "int"))
def amb_camp_pepel(r):
    """Ash: a smouldering fire, crackles and pops, ember hiss, a shifting log now and then."""
    L, P = 24.0, 3.0
    n = ns(L + P)
    flick = smooth_random(n, 3.0, r, 0.4, 1.0)
    roar = lowpass(brown(n, r, 2), 260) * 0.35 * flick
    buf = roar + camp_base(n, r, 0.1)
    crack = np.zeros((2, n))
    for tt in poisson_times(r, 14, L + P):
        a = min(r.pareto(2.2) * 0.15, 1.0)
        m = ns(r.uniform(0.0004, 0.003))
        c = noise(m, r) * np.linspace(1, 0, m) ** 2
        place(crack, pan(c * a, r.uniform(-0.6, 0.6)), ns(tt))
    buf += bandpass(crack, 900, 9000) * 1.6
    for tt in poisson_times(r, 0.7, L + P):
        m = ns(0.03)
        p = resonator(noise(m, r) * env_exp(m, 0.006), r.uniform(600, 1600), 6) * 2.0
        place(buf, pan(p * r.uniform(0.2, 0.6), r.uniform(-0.5, 0.5)), ns(tt))
    hiss = highpass(noise(n, r, 2), 4500) * 0.02 * smooth_random(n, 1.5, r, 0.3, 1.0)
    buf += hiss
    for tt in poisson_times(r, 0.08, L + P):
        th = membrane(0.6, 110, 55, 0.05, 0.15, r, 0.5, 800)
        place(buf, pan(th * 0.4, r.uniform(-0.3, 0.3)), ns(tt))
    buf = reverb(buf, make_ir(0.8, rng=r), wet=0.15)[:, :n]
    return fold_xfade(buf, ns(L), ns(P))


@asset("amb_camp_moh", "amb", loop=True, br=64, target=(-25, "int"))
def amb_camp_moh(r):
    """Moss: crickets in the growth, a trickling brook bubbling into the cauldron pool."""
    L, P = 24.0, 3.0
    n = ns(L + P)
    buf = camp_base(n, r, 0.1)
    for fc, rate, period, pn in [(4300, 30, 0.62, -0.6), (4750, 34, 0.71, 0.5), (5150, 28, 0.83, 0.1)]:
        gate = smooth_random(n, 0.2, r) > 0.3
        pulse_n = ns(0.014)
        pulse = np.sin(2 * np.pi * fc * taxis(pulse_n)) * np.hanning(pulse_n)
        tr = np.zeros(n)
        tt = r.random() * period
        while tt < L + P - 0.2:
            if gate[ns(tt)]:
                for k in range(4):
                    place(tr, pulse, ns(tt + k / rate), 1 - 0.12 * k)
            tt += period * r.uniform(0.95, 1.05)
        buf += pan(tr * 0.12, pn)
    flow = lowpass(noise(n, r, 2), 700) * 0.06
    buf += flow
    for tt in poisson_times(r, 28, L + P):
        d = r.uniform(0.012, 0.045)
        m = ns(d)
        tb = taxis(m)
        f0 = r.uniform(450, 1500)
        b = np.sin(phase_of(f0 * (1 + 1.6 * tb / d))) * np.exp(-tb / (d * 0.35))
        place(buf, pan(b * r.uniform(0.04, 0.22), r.uniform(-0.35, 0.25)), ns(tt))
    shimmer = bandpass(noise(n, r), 6000, 8500) * (0.5 + 0.5 * np.sin(2 * np.pi * 90 * taxis(n))) * 0.01
    buf += pan(shimmer, -0.4)
    buf = reverb(buf, make_ir(1.0, rng=r), wet=0.2)[:, :n]
    return fold_xfade(buf, ns(L), ns(P))


def creak(r, d):
    """Stick-slip wooden creak: a gliding impulse train exciting wood resonances."""
    m = ns(d)
    tr = taxis(m)
    rate = 35 + 170 * np.sin(np.pi * tr / d) ** r.uniform(0.6, 2.0) * r.uniform(0.5, 1.0)
    ph = np.cumsum(rate) / SR
    imp = np.zeros(m)
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0]
    imp[idx] = r.uniform(0.5, 1.0, len(idx))
    res = modal(ns(0.06), [(r.uniform(260, 360), 1, 0.014), (r.uniform(700, 820), 0.7, 0.01),
                           (r.uniform(1250, 1450), 0.45, 0.007), (r.uniform(2100, 2500), 0.25, 0.004)], r)
    y = np.convolve(imp, res)[:m]
    return y * np.sin(np.pi * tr / d) ** 0.7


def coin(r):
    return strike(0.5, r.uniform(2600, 4300), PLATE_RATIOS[:6], [1, 0.7, 0.5, 0.4, 0.3, 0.2],
                  [0.3, 0.22, 0.15, 0.1, 0.07, 0.05], r, jitter=0.01, click=0.4)


@asset("amb_camp_yantar", "amb", loop=True, br=64, target=(-25, "int"))
def amb_camp_yantar(r):
    """Amber: the wooden pavilion creaks, coins are counted and stacked."""
    L, P = 24.0, 3.0
    n = ns(L + P)
    buf = camp_base(n, r, 0.12) + lowpass(brown(n, r, 2), 380) * 0.05
    tt = r.uniform(0.5, 2.0)
    while tt < L + P:
        place(buf, pan(creak(r, r.uniform(0.4, 1.4)) * r.uniform(0.25, 0.55), r.uniform(-0.7, 0.7)), ns(tt))
        tt += r.uniform(2.5, 6.0)
    for tt in poisson_times(r, 0.28, L + P):
        k = r.integers(1, 6)
        pn = r.uniform(-0.5, 0.5)
        for j in range(k):
            place(buf, pan(coin(r) * r.uniform(0.12, 0.35), pn), ns(tt + j * r.uniform(0.06, 0.18)))
    buf = reverb(buf, make_ir(0.9, rng=r), wet=0.2)[:, :n]
    return fold_xfade(buf, ns(L), ns(P))


@asset("amb_camp_iney", "amb", loop=True, br=64, target=(-25, "int"))
def amb_camp_iney(r):
    """Frost: thin cold wind, a bowed-glass shimmer, ice tinkles and singing ice cracks."""
    L, P = 24.0, 3.0
    n = ns(L + P)
    t = taxis(n)
    buf = camp_base(n, r, 0.2, whistles=((2400, 200), (3100, 260)), bright=1.4)
    glass = sum(a * np.sin(2 * np.pi * f * t) * (0.5 + 0.5 * np.sin(2 * np.pi * t / pdur + r.random() * 6))
                for f, a, pdur in [(1318.5, 1, 12), (1975.5, 0.7, 8), (2637.0, 0.4, 6)])
    buf += pan(glass * 0.012, 0.1)
    for tt in poisson_times(r, 1.3, L + P):
        tk = strike(1.2, r.uniform(3500, 7000), GLASS_RATIOS[:3], [1, 0.4, 0.2], [0.6, 0.25, 0.1], r, click=0.2)
        place(buf, pan(tk * r.uniform(0.06, 0.25), r.uniform(-0.8, 0.8)), ns(tt))
    for tt in poisson_times(r, 0.16, L + P):
        d = r.uniform(0.08, 0.16)
        m = ns(d * 2.5)
        tc = taxis(m)
        f = 350 + 4800 * np.exp(-tc / (d * 0.4))
        ch = np.sin(phase_of(f)) * np.exp(-tc / d)
        ch = place(ch, noise(ns(0.003), r) * 2, 0)
        place(buf, pan(ch * 0.35, r.uniform(-0.7, 0.7)), ns(tt))
    for tt in poisson_times(r, 0.05, L + P):
        m = ns(1.0)
        tg = taxis(m)
        g = np.sin(phase_of(r.uniform(90, 140) * (1 - 0.25 * tg))) * np.sin(np.pi * tg) ** 2
        place(buf, pan(g * 0.12, r.uniform(-0.5, 0.5)), ns(tt))
    buf = reverb(buf, make_ir(2.2, rng=r, bright=1.3), wet=0.3)[:, :n]
    return fold_xfade(buf, ns(L), ns(P))


@asset("amb_camp_iris", "amb", loop=True, br=64, target=(-25, "int"))
def amb_camp_iris(r):
    """Iris: the violet canopy flutters and snaps in the gusts, tent poles creak softly."""
    L, P = 24.0, 3.0
    n = ns(L + P)
    gust = smooth_random(n, 0.14, r, 0.1, 1.0)
    buf = camp_base(n, r, 0.16, gust=gust ** 1.4)
    rate = smooth_random(n, 0.4, r, 6, 13)
    am = (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(rate) / SR)) ** 3
    cloth = bandpass(noise(n, r), 150, 2600) * am * gust ** 2 * 0.35
    cloth2 = bandpass(noise(n, r), 200, 3200) * np.roll(am, ns(0.04)) * gust ** 2 * 0.25
    buf += np.stack([cloth * 0.8 + cloth2 * 0.4, cloth * 0.4 + cloth2 * 0.8])
    for tt in poisson_times(r, 0.3, L + P, gust):
        m = ns(0.12)
        s = bandpass(noise(m, r), 300, 4000) * env_exp(m, 0.015)
        s = s + lowpass(noise(m, r), 200) * env_exp(m, 0.04) * 0.8
        place(buf, pan(s * 0.5, r.uniform(-0.6, 0.6)), ns(tt))
    for tt in poisson_times(r, 0.07, L + P):
        place(buf, pan(creak(r, r.uniform(0.3, 0.8)) * 0.18, r.uniform(-0.6, 0.6)), ns(tt))
    buf = reverb(buf, make_ir(0.5, rng=r), wet=0.1)[:, :n]
    return fold_xfade(buf, ns(L), ns(P))


# =============================================================================================
# The Guests' voice
# =============================================================================================

STROKE_DUR = {"arc": 1.6, "spike": 1.2, "loop": 1.8, "drop": 1.5}


def stroke_shape(kind, u):
    """Per-stroke contours: (f0 multiplier, formant position 0..1, amplitude) over u in [0, 1]."""
    if kind == "arc":
        return 1.0 + 0.55 * np.sin(np.pi * u), 0.5 + 0.5 * np.sin(np.pi * u), np.sin(np.pi * np.clip(u * 1.05, 0, 1)) ** 0.4
    if kind == "spike":
        bump = np.exp(-((u - 0.28) / 0.07) ** 2)
        return 0.8 + 1.9 * bump + 0.3 * u, np.clip(0.2 + 0.8 * bump, 0, 1), np.clip(np.minimum(u / 0.12, 1) * (1 - 0.6 * u), 0, 1)
    if kind == "loop":
        return 1.0 + 0.3 * np.sin(4 * np.pi * u), 0.5 + 0.45 * np.cos(4 * np.pi * u), np.sin(np.pi * u) ** 0.3
    if kind == "drop":
        return 2.0 * (1 - u) ** 1.6 + 0.45, 1 - u, np.minimum(u / 0.08, 1) * (1 - u ** 3)
    raise ValueError(kind)


def guest_voice(r, seq, base=105.0, freeze=None, hold=1.0, wet=0.38):
    """Uncanny non-human voice. seq: [(stroke, dur)]; freeze: time (s) of the spectral freeze."""
    f0m, fpos, amp = [], [], []
    for kind, d in seq:
        u = np.linspace(0, 1, ns(d))
        a, b, c = stroke_shape(kind, u)
        f0m.append(a)
        fpos.append(b)
        amp.append(c)
    f0m, fpos, amp = (np.concatenate(x) for x in (f0m, fpos, amp))
    n = len(f0m)
    f0m = gaussian_filter1d(f0m, ns(0.03))
    fpos = gaussian_filter1d(fpos, ns(0.05))
    amp = gaussian_filter1d(amp, ns(0.02))
    t = taxis(n)
    vib = 1 + 0.012 * np.sin(2 * np.pi * 5.1 * t) + 0.006 * smooth_random(n, 8, r, -1, 1)
    f0 = base * f0m * vib
    src = additive_track(f0, [1 / k ** 1.05 for k in range(1, 70)], 8500)
    src += 0.45 * np.sin(phase_of(f0 * 0.5))            # subharmonic: too large a throat
    src += 0.22 * np.sin(phase_of(f0 * 2.414))          # inharmonic partial: not a vocal fold
    src += 0.1 * bandpass(noise(n, r), 800, 7000)       # breath
    tr3 = smooth_random(n, 1.5, r)

    def formants(f, tt):
        fp = ctrl_at(fpos, tt)
        g3 = ctrl_at(tr3, tt)
        f1 = 280 + 950 * fp                 # F1 and F2 cross over: no human vowel space
        f2 = 2700 - 1800 * fp
        f3 = 3200 + 500 * g3
        f4 = 5200 - 900 * fp                # a narrow glassy whistle
        return 0.03 + gauss_bands(f, [f1, f2, f3, f4], [55, 80, 120, 22], [1.0, 0.85, 0.5, 0.9])
    v = stft_shape(src, formants) * amp
    v *= 0.85 + 0.15 * np.sin(2 * np.pi * 31 * t)       # faint ring modulation growl
    tail = ns(hold + 1.6)
    v = np.pad(v, (0, tail))
    N = len(v)
    out = to_stereo(v)
    if freeze is not None:
        fz = spectral_freeze(v, freeze, hold, fade_out=1.2, jitter=0.12, rng=r)
        d = ns(0.009)
        out = out + 0.8 * np.stack([fz, np.concatenate([np.zeros(d), fz[:-d]])])
    gr = granulate(v[:n], N, r, density=70, grain=(0.03, 0.11), spread=0.05,
                   ratios=((0.5, 1), (1.0, 2), (1.498, 1), (2.0, 1)), pos_track=lambda to: to * 0.9)
    out = out + 0.32 * gr
    out = highpass(out, 40)
    out = reverb(out, make_ir(3.2, rng=r, predelay=0.03), wet=wet)
    # trim the silent end of the reverb tail
    env = np.abs(mono(out))
    last = np.nonzero(env > peak(env) * db(-60))[0][-1]
    return fades(out[:, :last + ns(0.05)], 0.002, 0.3)


for _k, _seq, _fz, _hold, _base in [
    ("arc", [("arc", 1.6)], 0.85, 0.7, 105), ("spike", [("spike", 1.2)], 0.38, 0.6, 105),
    ("loop", [("loop", 1.8)], 0.9, 0.6, 105), ("drop", [("drop", 1.5)], 0.25, 0.5, 105),
]:
    asset("guest_" + _k, "voice", br=64, target=(-17, "short"), ref=6, rolloff=1.0,
          extra={"stroke": _k, "strokeDur": STROKE_DUR[_k]})(
        lambda r, s=_seq, f=_fz, h=_hold, b=_base: guest_voice(r, s, b, f, h))

for _k, _seq, _fz, _hold, _base in [
    ("phrase_1", [("arc", 1.2), ("loop", 1.4), ("drop", 1.0)], 1.3, 1.5, 105),
    ("phrase_2", [("spike", 0.9), ("arc", 1.3), ("spike", 0.8)], 1.6, 1.0, 112),
    ("phrase_3", [("loop", 1.6), ("drop", 1.4)], 0.9, 1.8, 82),
    ("phrase_4", [("drop", 0.8), ("arc", 1.0), ("loop", 1.2), ("spike", 0.7)], 2.2, 1.2, 125),
    ("call", [("spike", 0.6), ("arc", 0.7)], 0.3, 1.4, 140),
]:
    asset("guest_" + _k, "voice", br=64, target=(-17, "short"), ref=6, rolloff=1.0,
          extra={"strokes": [s for s, _ in _seq]})(
        lambda r, s=_seq, f=_fz, h=_hold, b=_base: guest_voice(r, s, b, f, h))


# =============================================================================================
# UI
# =============================================================================================

@asset("ui_hover", "ui", target=(-30, "short"))
def ui_hover(r):
    n = ns(0.09)
    t = taxis(n)
    y = (np.sin(2 * np.pi * 2200 * t) + 0.4 * np.sin(2 * np.pi * 3310 * t)) * np.exp(-t / 0.018)
    return fades(y, 0.002, 0.01)


@asset("ui_click", "ui", target=(-24, "short"))
def ui_click(r):
    n = ns(0.14)
    y = strike(0.14, 1400, WOOD_RATIOS, [1, 0.5, 0.3, 0.15], [0.03, 0.018, 0.01, 0.006], r, click=0.6, click_lp=9000)
    y += membrane(0.14, 220, 160, 0.01, 0.03, r, 0.0) * 0.4
    return fades(y[:n], 0.0005, 0.02)


def nacre_bell(r, f0, dur=1.2, bright=1.0):
    return strike(dur, f0, [1, 2.0, 3.01, 4.17, 5.43], [1, 0.45 * bright, 0.25 * bright, 0.12 * bright, 0.06 * bright],
                  [dur * 0.55, dur * 0.3, dur * 0.18, dur * 0.1, dur * 0.06], r, click=0.15)


@asset("ui_confirm", "ui", target=(-21, "short"))
def ui_confirm(r):
    buf = np.zeros(ns(0.9))
    place(buf, nacre_bell(r, midi(86), 0.8), 0, 0.8)
    place(buf, nacre_bell(r, midi(93), 0.8), ns(0.08), 1.0)
    return reverb(buf, make_ir(1.0, rng=r), wet=0.2)[:, :ns(1.2)]


@asset("ui_error", "ui", target=(-21, "short"))
def ui_error(r):
    buf = np.zeros(ns(0.5))
    for i, m in enumerate([64, 58]):
        nn = ns(0.13)
        tone = wavetable(midi(m), nn, cutoff=1600, tilt=1.6, odd_only=True)
        tone *= env_adsr(nn, 0.004, 0.04, 0.6, 0.05)
        tone *= 1 + 0.25 * np.sin(2 * np.pi * 45 * taxis(nn))
        place(buf, tone, ns(i * 0.15))
    return fades(lowpass(buf, 2200), 0.001, 0.05)


@asset("ui_notify", "ui", target=(-20, "short"))
def ui_notify(r):
    buf = np.zeros(ns(1.6))
    for i, m in enumerate([81, 86, 90]):
        place(buf, nacre_bell(r, midi(m), 1.0), ns(i * 0.09), 0.7 + 0.15 * i)
    return reverb(buf, make_ir(1.4, rng=r), wet=0.3)[:, :ns(2.0)]


# =============================================================================================
# Footsteps (4 variants per surface)
# =============================================================================================

def heel_toe(r, heel, toe, gap):
    buf = np.zeros(ns(0.4))
    place(buf, heel, 0)
    place(buf, toe, ns(gap), r.uniform(0.35, 0.55))
    return buf


# Footsteps v2 (owner, 12.11: soft and natural): six variations per surface, a soft heel, a lighter toe, little
# grit; the client adds a small pitch / volume jitter per step (game/src/audio/town-audio.js).
def soft_heel(r, f_hi, f_lo, decay, scuff_lo, scuff_hi, scuff_amt, dur=0.2):
    n = ns(dur)
    t = taxis(n)
    th = membrane(dur, f_hi, f_lo, 0.006, decay, r, 0.35, 900)
    e = np.minimum(t / 0.004, 1) * np.exp(-t / 0.03)
    sc = bandpass(noise(n, r), scuff_lo, scuff_hi) * e * scuff_amt
    return th + sc


@variants("step_stone", 6, "step", target=(-27, "short"))
def step_stone(r, i):
    def hit(a):
        y = soft_heel(r, r.uniform(105, 135), 62, r.uniform(0.018, 0.026), 1400, 5200, 0.28)
        n = len(y)
        grit = np.zeros(n)
        for tt in poisson_times(r, 120, 0.05):
            grit[ns(tt)] += r.uniform(-1, 1) * 0.5
        return (y + highpass(grit, 3500) * np.exp(-taxis(n) / 0.03)) * a
    return fades(lowpass(heel_toe(r, hit(1), hit(0.7), r.uniform(0.045, 0.07)), 7000)[:ns(0.32)])


@variants("step_wood", 6, "step", target=(-26, "short"))
def step_wood(r, i):
    def hit(a):
        k = strike(0.22, r.uniform(135, 185), WOOD_RATIOS, [1, 0.45, 0.22, 0.1], [0.05, 0.03, 0.016, 0.01], r, click=0.25, click_lp=2800)
        return (k * 0.8 + membrane(0.22, 105, 58, 0.01, 0.035, r, 0.2, 500) * 0.6) * a
    return fades(heel_toe(r, hit(1), hit(0.6), r.uniform(0.05, 0.075))[:ns(0.34)])


@variants("step_grass", 6, "step", target=(-28, "short"))
def step_grass(r, i):
    def hit(a):
        n = ns(0.2)
        t = taxis(n)
        e = np.minimum(t / 0.008, 1) * np.exp(-t / 0.055)
        rust = bandpass(noise(n, r), 700, 4800) * e
        cr = np.zeros(n)
        for tt in poisson_times(r, 180, 0.11):
            cr[ns(tt)] += r.uniform(-1, 1)
        cr = bandpass(cr, 2200, 7000) * np.exp(-t / 0.06)
        return (rust * 0.55 + cr * 0.3 + lowpass(noise(n, r), 220) * np.exp(-t / 0.035) * 0.45) * a
    return fades(heel_toe(r, hit(1), hit(0.65), r.uniform(0.05, 0.08))[:ns(0.34)])


@variants("step_glass", 4, "step", target=(-24, "short"))
def step_glass(r, i):
    def hit(a):
        th = membrane(0.4, 150, 80, 0.008, 0.02, r, 0.4, 900) * 0.7
        g = strike(0.4, r.uniform(2800, 4200), GLASS_RATIOS, [1, 0.5, 0.3, 0.2, 0.1], [0.16, 0.08, 0.05, 0.03, 0.02], r, click=0.6, click_lp=9000)
        return (th + g * 0.5) * a
    return fades(heel_toe(r, hit(1), hit(0.7), r.uniform(0.03, 0.05))[:ns(0.4)])


@variants("step_metal", 4, "step", target=(-24, "short"))
def step_metal(r, i):
    def hit(a):
        th = membrane(0.6, 140, 75, 0.008, 0.025, r, 0.5, 1000) * 0.7
        amps = [1, 0.8, 0.6, 0.55, 0.4, 0.35, 0.25, 0.2, 0.15]
        dec = [0.35, 0.28, 0.2, 0.18, 0.14, 0.12, 0.09, 0.07, 0.06]
        m = strike(0.6, r.uniform(380, 520), PLATE_RATIOS, amps, dec, r, jitter=0.01, click=0.5, click_lp=8000)
        return (th + m * 0.35) * a
    return fades(heel_toe(r, hit(1), hit(0.7), r.uniform(0.03, 0.05))[:ns(0.55)])


# =============================================================================================
# Gameplay SFX
# =============================================================================================

@asset("anchor_plant", "sfx", br=64, target=(-15, "short"), ref=4)
def anchor_plant(r):
    n = ns(3.6)
    buf = np.zeros(n)
    place(buf, membrane(0.8, 95, 40, 0.04, 0.2, r, 0.8, 900), 0, 1.0)
    m = ns(0.35)
    tc = taxis(m)
    crunch = bandpass(noise(m, r), 400, 3200) * np.exp(-tc / 0.06)
    crunch *= 0.6 + 0.4 * (r.random(m) > 0.85)
    place(buf, crunch * 0.5, 0)
    ring = strike(3.4, midi(76), BELL_RATIOS, [0.25, 1, 0.55, 0.5, 0.35, 0.22, 0.14], [3.0, 2.6, 1.8, 1.4, 1.0, 0.7, 0.5], r, click=0.2)
    place(buf, ring * 0.45, ns(0.03))
    place(buf, strike(2.5, midi(83), [1, 2.0, 3.0], [1, 0.3, 0.1], [1.8, 0.8, 0.4], r) * 0.12, ns(0.05))
    return reverb(buf, make_ir(2.0, rng=r), wet=0.3)[:, :ns(4.6)]


@asset("storm_crack", "sfx", br=64, target=(-13, "short"), ref=12)
def storm_crack(r):
    n = ns(5.5)
    buf = np.zeros((2, n))
    m = ns(0.12)
    tz = taxis(m)
    zap = highpass(noise(m, r), 1200) * (np.sin(2 * np.pi * 95 * tz) > 0.3) * np.linspace(0.3, 1, m)
    place(buf, pan(zap * 0.4, -0.2), 0)
    at = ns(0.11)
    bang = noise(ns(0.035), r) * env_exp(ns(0.035), 0.008)
    place(buf, pan(bang * 1.2, 0.0), at)
    cr = np.zeros(ns(0.6))
    for tt in poisson_times(r, 120, 0.6):
        cr[ns(tt)] += r.uniform(-1, 1) * np.exp(-tt / 0.18)
    place(buf, np.stack([highpass(cr, 1500), highpass(np.roll(cr, 37), 1500)]) * 0.8, at)
    rm = n - at
    tr = taxis(rm)
    rumble = lowpass(brown(rm, r, 2), 170) * (np.minimum(tr / 0.25, 1) * np.exp(-tr / 1.4))
    rumble *= 0.6 + 0.4 * smooth_random(rm, 4, r)
    place(buf, rumble * 0.9, at)
    buf = soft_clip(buf * 1.2, 1.5)
    return reverb(buf, make_ir(3.0, rng=r), wet=0.4)[:, :ns(6.5)]


@asset("gift_chime", "sfx", br=64, target=(-16, "short"), ref=5)
def gift_chime(r):
    n = ns(3.5)
    buf = np.zeros((2, n))
    for i, m in enumerate([86, 88, 90, 93, 95, 98]):
        b = strike(2.4, midi(m), BAR_RATIOS[:4], [1, 0.35, 0.15, 0.06], [1.8, 0.7, 0.3, 0.12], r, click=0.15)
        place(buf, pan(b * (0.55 + 0.06 * i), -0.6 + 0.24 * i), ns(i * 0.075))
    pad_n = ns(2.6)
    pad = sum(wavetable(midi(m), pad_n, 2500, 1.4) for m in [62, 66, 69, 74]) * env_adsr(pad_n, 0.4, 0.5, 0.5, 1.2)
    place(buf, lowpass(pad, 1800) * 0.06, 0)
    return reverb(buf, make_ir(2.5, rng=r, bright=1.2), wet=0.45)[:, :ns(4.5)]


@asset("vision_whoosh", "sfx", br=64, target=(-16, "short"))
def vision_whoosh(r):
    D = 2.8
    n = ns(D)
    t = taxis(n)
    w = pink(n, r, 2)
    peak_t = 1.5
    cf = 250 * (5000 / 250) ** np.clip(t / peak_t, 0, 1)

    def shape(f, tt):
        c = ctrl_at(cf, tt)
        return np.exp(-0.5 * (np.log(np.maximum(f, 20) / c) / 0.35) ** 2)
    y = stft_shape(w, shape)
    e = np.where(t < peak_t, (t / peak_t) ** 2.2, np.exp(-(t - peak_t) / 0.25))
    y *= e
    y = np.stack([y[0] * np.cos((t / D) * np.pi / 2), y[1] * np.sin((t / D) * np.pi / 2)]) * 1.4
    bell = to_stereo(nacre_bell(r, midi(81), 2.0))
    rb = reverb(bell, make_ir(2.5, rng=r), wet=1.0, dry=0.3)[:, ::-1]
    place(y, rb[:, -ns(peak_t):] * 0.35, 0)
    return fades(y, 0.01, 0.2)


@asset("memory_dissolve", "sfx", br=64, target=(-17, "short"))
def memory_dissolve(r):
    D = 6.0
    n = ns(D)
    t = taxis(n)
    tone = sum(a * nacre_bell(r, midi(m), 4.0) for m, a in [(62, 1), (65, 0.8), (69, 0.7), (76, 0.5)])
    tone = np.pad(tone, (0, n - len(tone)))
    dry = to_stereo(tone * np.exp(-t / 0.6))
    gr = granulate(tone, n, r, density=110, grain=(0.02, 0.07), spread=0.15,
                   ratios=((1.0, 2), (2.0, 1), (1.498, 1), (3.0, 0.5)),
                   pos_track=lambda to: min(to * 0.5, 3.0), amp_track=lambda to: max(0.0, 1 - to / (D * 0.85)) ** 1.5)
    sp = np.zeros((2, n))
    for tt in poisson_times(r, 14, D, np.clip(1 - t / D, 0, 1) ** 2):
        s = strike(0.3, r.uniform(5000, 9000), [1, 2.3], [1, 0.3], [0.08, 0.04], r)
        place(sp, pan(s * r.uniform(0.05, 0.2), r.uniform(-0.9, 0.9)), ns(tt))
    dust = highpass(noise(n, r, 2), 6000) * 0.04 * np.exp(-t / 2.0) * np.minimum(t / 0.3, 1)
    y = dry * 0.6 + gr * 0.5 + sp + dust
    return reverb(y, make_ir(3.0, rng=r), wet=0.5)[:, :ns(7.0)]


@variants("bid_tick", 3, "sfx", target=(-22, "short"))
def bid_tick(r, i):
    f0 = [1900, 2120, 2380][i]
    y = strike(0.16, f0, [1, 1.51, 2.76, 4.1], [1, 0.5, 0.3, 0.12], [0.05, 0.03, 0.02, 0.01], r, click=0.5, click_lp=9000)
    y += membrane(0.16, 300, 200, 0.01, 0.02, r, 0.0) * 0.25
    return fades(y)


@variants("vote_stone", 3, "sfx", target=(-20, "short"), ref=3)
def vote_stone(r, i):
    def hit(a):
        f0 = r.uniform(900, 1300)
        k = strike(0.25, f0, [1, 1.71, 2.93, 4.32], [1, 0.6, 0.4, 0.2], [0.07, 0.05, 0.03, 0.02], r, jitter=0.01, click=0.8, click_lp=7000)
        n = ns(0.25)
        k += bandpass(noise(n, r), 1000, 5000) * env_exp(n, 0.008) * 0.6
        k += membrane(0.25, 260, 180, 0.01, 0.03, r, 0.0) * 0.4
        return k * a
    buf = np.zeros(ns(0.45))
    place(buf, hit(1.0), 0)
    place(buf, hit(r.uniform(0.25, 0.4)), ns(r.uniform(0.06, 0.1)))
    place(buf, hit(r.uniform(0.08, 0.15)), ns(r.uniform(0.15, 0.2)))
    return fades(buf)


# =============================================================================================
# Outcome stingers
# =============================================================================================

def pad_chord(notes, n, cutoff=1800, attack=0.6, release=1.5, r=None, detune=0.006):
    y = 0
    for m in notes:
        for dt in (-detune, 0, detune):
            y = y + wavetable(midi(m) * (1 + dt), n, cutoff, 1.0, rng=r)
    return lowpass(y, cutoff) * env_adsr(n, attack, 0.5, 0.75, release) / (len(notes) * 3)


@asset("sting_survived", "sting", br=80, target=(-15, "short"))
def sting_survived(r):
    n = ns(6.0)
    buf = np.zeros((2, n))
    place(buf, pad_chord([50, 57, 62, 66, 69, 76], ns(5.5), 2200, 0.8, 2.5, r) * 1.2, 0)
    t = taxis(ns(5.0))
    choir = sum(wavetable(midi(m), len(t), 4000, 1.0, freq_track=1 + 0.006 * np.sin(2 * np.pi * 5 * t)) for m in [62, 66, 69])
    choir = stft_shape(choir, lambda f, tt: 0.05 + gauss_bands(f, [800, 1150, 2900], [80, 90, 150], [1, 0.6, 0.3]))
    place(buf, choir * env_adsr(len(t), 1.2, 0.5, 0.8, 2.0) * 0.5, ns(0.3))
    for i, m in enumerate([74, 78, 81, 86, 88]):
        place(buf, pan(nacre_bell(r, midi(m), 2.5) * 0.25, -0.5 + 0.25 * i), ns(0.2 + i * 0.16))
    return reverb(buf, make_ir(3.5, rng=r), wet=0.45)[:, :ns(8.0)]


@asset("sting_weapon", "sting", br=80, target=(-14, "short"))
def sting_weapon(r):
    n = ns(6.0)
    buf = np.zeros((2, n))
    place(buf, membrane(2.0, 75, 36, 0.06, 0.6, r, 0.7, 700) * 1.0, 0)
    bn = ns(4.0)
    brass = 0
    for m in [38, 39, 45, 56, 57]:
        brass = brass + wavetable(midi(m), bn, 3000, 1.0, rng=r)
    bright = lowpass(brass, 2400)
    dark = lowpass(brass, 500)
    e = np.exp(-taxis(bn) / 0.5)
    brass = (bright * e + dark * (1 - e)) * env_adsr(bn, 0.01, 0.6, 0.5, 2.0) * 0.18
    place(buf, brass, 0)
    sn = ns(3.0)
    ts = taxis(sn)
    # metallic scrape: noise through narrow plate modes that sag downward
    scr = stft_shape(noise(sn, r), lambda f, tt: gauss_bands(
        f, [fm * (1 - 0.1 * tt) for fm in (430, 685, 1010, 1290)], [12, 12, 15, 18], [1, 0.8, 0.6, 0.5]))
    place(buf, pan(scr * np.minimum(ts / 0.2, 1) * np.exp(-ts / 1.0) * 1.2, 0.3), ns(0.15))
    buf = soft_clip(buf * 1.3, 1.6)
    return reverb(buf, make_ir(3.0, rng=r), wet=0.4)[:, :ns(8.0)]


@asset("sting_gone", "sting", br=80, target=(-16, "short"))
def sting_gone(r):
    D = 8.0
    n = ns(D)
    t = taxis(n)
    glide = np.exp(np.log(30 / 55) * np.clip(t / 7, 0, 1))
    hum = sum(a * np.sin(phase_of(f * glide)) for f, a in [(55, 1), (55.125, 0.8), (110, 0.5), (110.06, 0.45), (165, 0.2)])
    hum = soft_clip(hum * 0.6, 2.0) * np.minimum(t / 0.5, 1) * np.clip(1 - t / D, 0, 1) ** 0.7
    buf = to_stereo(hum) * 0.7
    wind = wind_layer(n, r, 0.6, gust=np.sin(np.pi * np.clip(t / 6.5, 0, 1)) ** 1.5)
    buf += wind
    for k, f in enumerate([880, 1320, 1760, 2640]):
        rise = f * (1 + 1.5 * np.clip(t / 6, 0, 1) ** 2)
        s = np.sin(phase_of(rise)) * np.sin(np.pi * np.clip(t / 6.5, 0, 1)) ** 2 * 0.05
        buf += pan(s, -0.6 + 0.4 * k)
    return reverb(buf, make_ir(5.0, rng=r), wet=0.5)[:, :ns(10.0)]


# =============================================================================================
# Adaptive music: three synced stems (calm / uneasy / crisis), 60 bpm, 16 bars = 64 s loop
# =============================================================================================

BPM = 60
BAR = 4.0
LOOP_BARS = 16
LOOP = LOOP_BARS * BAR
CHORDS = [  # four chords of four bars each (MIDI)
    [38, 45, 53, 64, 69],   # Dm add9
    [34, 41, 50, 57, 64],   # Bb maj7 #11
    [31, 38, 46, 53, 57],   # Gm9
    [33, 40, 55, 61, 64],   # A7
]
BELL_SCALE = [[74, 76, 77, 79, 81, 84, 86], [74, 76, 77, 81, 82, 86], [74, 77, 79, 81, 82, 86], [76, 79, 81, 85, 86, 88]]


def music_buf():
    return np.zeros((2, ns(LOOP + 8)))


def add_pads(buf, r, cutoff, amp, cluster=False, attack=3.0):
    for ci, ch in enumerate(CHORDS):
        start = ci * 4 * BAR
        dur = 4 * BAR + 3.0
        n = ns(dur)
        notes = [m for m in ch if m >= 40] + ([ch[0] + 25] if cluster else [])
        y = pad_chord(notes, n, cutoff, attack, 3.0, r, detune=0.005) * amp * len(notes) / 4
        lfo = 0.5 + 0.5 * np.sin(2 * np.pi * taxis(n) / 16 + ci)
        place(buf, np.stack([y * (0.7 + 0.3 * lfo), y * (1.0 - 0.3 * lfo)]), ns(start))


def add_bass(buf, r, amp, drive=1.0):
    for ci, ch in enumerate(CHORDS):
        n = ns(4 * BAR + 2.5)
        f = midi(ch[0] + 12 if ch[0] < 36 else ch[0])
        y = (np.sin(phase_of(f, n)) + 0.3 * np.sin(phase_of(2 * f, n))) * env_adsr(n, 2.0, 1.0, 0.8, 2.5)
        place(buf, soft_clip(y * drive, max(drive, 1.0)) * amp, ns(ci * 4 * BAR))


@asset("mus_calm", "music", loop=True, br=96, target=(-21, "int"), extra={"bpm": BPM, "bars": LOOP_BARS})
def mus_calm(r):
    buf = music_buf()
    add_pads(buf, r, 1900, 0.5)
    add_bass(buf, r, 0.22)
    for bar in range(LOOP_BARS):
        scale = BELL_SCALE[bar // 4]
        for _ in range(r.integers(1, 4)):
            at = bar * BAR + r.integers(0, 8) * 0.5
            m = r.choice(scale)
            place(buf, pan(nacre_bell(r, midi(m), 3.0, 0.8) * r.uniform(0.12, 0.22), r.uniform(-0.5, 0.5)), ns(at))
    for k in range(4):
        n = ns(4 * BAR)
        sw = highpass(noise(n, r, 2), 6500) * np.sin(np.pi * taxis(n) / (4 * BAR)) ** 2 * 0.012
        place(buf, sw, ns(k * 4 * BAR))
    y = reverb(buf, make_ir(4.0, rng=r, predelay=0.03), wet=0.45)
    return fold_add(y, ns(LOOP))


def woodblock(r, f0, dur=0.12):
    return strike(dur, f0, [1, 2.57, 4.03], [1, 0.4, 0.15], [0.035, 0.02, 0.01], r, click=0.3)


@asset("mus_uneasy", "music", loop=True, br=96, target=(-20, "int"), extra={"bpm": BPM, "bars": LOOP_BARS})
def mus_uneasy(r):
    buf = music_buf()
    add_pads(buf, r, 900, 0.55, cluster=True)
    add_bass(buf, r, 0.25)
    for bar in range(LOOP_BARS):
        at = bar * BAR
        place(buf, membrane(0.5, 72, 45, 0.02, 0.12, r, 0.3, 300) * 0.4, ns(at))
        place(buf, membrane(0.5, 66, 42, 0.02, 0.1, r, 0.3, 300) * 0.28, ns(at + 0.32))
        for b in range(4):
            place(buf, pan(woodblock(r, 2400) * 0.06, 0.35), ns(at + b))
            place(buf, pan(woodblock(r, 1800) * 0.03, -0.35), ns(at + b + 0.5))
    for ci, ch in enumerate(CHORDS):
        n = ns(4 * BAR + 1.5)
        tt = taxis(n)
        notes = [ch[2] + 12, ch[2] + 13, ch[1] + 24]
        s = sum(wavetable(midi(m), n, 2600, 1.0, rng=r) for m in notes)
        s *= (0.4 + 0.6 * (0.5 + 0.5 * np.sin(2 * np.pi * 7 * tt))) * (tt / (4 * BAR)) ** 1.5 * np.minimum(1, (n / SR - tt) / 1.5)
        place(buf, pan(lowpass(s, 2400) * 0.06, r.uniform(-0.3, 0.3)), ns(ci * 4 * BAR))
    y = reverb(buf, make_ir(3.5, rng=r, predelay=0.03), wet=0.4)
    return fold_add(y, ns(LOOP))


TAIKO = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1]
OSTINATO = [0, 0, 12, 0, 1, 0, 7, 1]


@asset("mus_crisis", "music", loop=True, br=96, target=(-18, "int"), extra={"bpm": BPM, "bars": LOOP_BARS})
def mus_crisis(r):
    buf = music_buf()
    add_pads(buf, r, 1400, 0.45, cluster=True, attack=1.5)
    sixteenth = BAR / 16
    for bar in range(LOOP_BARS):
        at = bar * BAR
        root = CHORDS[bar // 4][0]
        for s, hit in enumerate(TAIKO):
            if hit:
                acc = 1.0 if s == 0 else (0.7 if s % 4 == 0 else 0.5)
                place(buf, pan(membrane(0.8, 95, 48, 0.03, 0.3, r, 0.5, 900) * acc * 0.6, r.uniform(-0.15, 0.15)), ns(at + s * sixteenth))
            elif s % 2 == 1 and r.random() < 0.35:
                place(buf, pan(membrane(0.3, 180, 110, 0.01, 0.06, r, 0.6, 2500) * 0.18, 0.4), ns(at + s * sixteenth))
        if bar % 4 == 0:
            place(buf, membrane(2.5, 70, 32, 0.08, 0.8, r, 0.8, 600) * 0.9, ns(at))
            cr = highpass(noise(ns(2.5), r, 2), 3000) * env_exp(ns(2.5), 0.6) * 0.08
            place(buf, cr, ns(at))
        for k, off in enumerate(OSTINATO):
            n = ns(0.24)
            m = root + 12 + off if root < 36 else root + off
            y = wavetable(midi(m), n, 1800, 1.0) * env_adsr(n, 0.005, 0.08, 0.5, 0.06)
            place(buf, lowpass(soft_clip(y * 2.0, 2.0), 700) * 0.16, ns(at + k * 0.5))
        if bar % 2 == 0:
            ch = CHORDS[bar // 4]
            bn = ns(2 * BAR)
            br = sum(wavetable(midi(m), bn, 3000, 1.0, rng=r) for m in [ch[0] + 24, ch[0] + 25, ch[0] + 31])
            e = env_adsr(bn, 0.35, 1.0, 0.45, 1.5)
            br = lowpass(br, 2200) * e + lowpass(br, 600) * (1 - e) * 0.5
            place(buf, pan(br * 0.05, r.uniform(-0.3, 0.3)), ns(at))
        if bar % 4 == 3:
            n = ns(BAR)
            ts = taxis(n)
            rz = noise(n, r, 2)
            rz = stft_shape(rz, lambda f, tt: np.exp(-0.5 * (np.log(np.maximum(f, 20) / (400 * 12 ** (tt / BAR))) / 0.3) ** 2))
            place(buf, rz * (ts / BAR) ** 2 * 0.25, ns(at))
        tn = ns(BAR)
        tt = taxis(tn)
        hi = sum(wavetable(midi(m), tn, 4000, 1.0, rng=r) for m in [CHORDS[bar // 4][3] + 12, CHORDS[bar // 4][3] + 13])
        hi *= (0.5 + 0.5 * np.sin(2 * np.pi * 4 * tt)) ** 2
        place(buf, pan(lowpass(hi, 3500) * 0.025, -0.3), ns(at))
    y = reverb(buf, make_ir(2.5, rng=r, predelay=0.02), wet=0.3)
    return fold_add(y, ns(LOOP))


# =============================================================================================
# Combat (owner, 12.11): Iris's strikes and dash, the two casts (a build while she winds up, a strong release), the
# hillside monsters by type, Iris getting hit. Layered (transient + body + tail), varied, never clipping.
# =============================================================================================

def sweep_noise(r, D, f0, f1, f2, t_peak, width=0.45, rise=2.0, fall=0.09, stereo=True, colour="pink"):
    """A whoosh: band-limited noise whose centre glides f0 -> f1 (at t_peak) -> f2, swelling into the peak."""
    n = ns(D)
    t = taxis(n)
    w = pink(n, r, 2 if stereo else 1) if colour == "pink" else noise(n, r, 2 if stereo else 1)
    a = np.clip(t / t_peak, 0, 1)
    b = np.clip((t - t_peak) / max(1e-3, D - t_peak), 0, 1)
    cf = np.where(t < t_peak, f0 * (f1 / f0) ** a, f1 * (f2 / f1) ** b)

    def shape(f, tt):
        c = ctrl_at(cf, tt)
        return np.exp(-0.5 * (np.log(np.maximum(f, 20) / c) / width) ** 2)
    y = stft_shape(w, shape)
    e = np.where(t < t_peak, (t / t_peak) ** rise, np.exp(-(t - t_peak) / fall))
    return fades(y * e, 0.0005, min(0.08, D * 0.3))


@variants("strike_swing", 4, "sfx", target=(-21, "short"))
def strike_swing(r, i):
    D = 0.34
    y = sweep_noise(r, D, r.uniform(350, 500), r.uniform(1800, 2600), r.uniform(700, 1000), r.uniform(0.09, 0.12), 0.4)
    t = taxis(ns(D))
    p = np.linspace(-0.5, 0.5, ns(D)) * (1 if i % 2 else -1)
    return fades(np.stack([y[0] * (1 - p) * 0.8, y[1] * (1 + p) * 0.8]), 0.002, 0.04)


def impact(r, size=1.0, dur=0.45):
    """transient (a bright click) + body (a pitch-dropping thump and a mid punch) + tail (a short crunch, a little room)."""
    n = ns(dur)
    t = taxis(n)
    click = highpass(noise(n, r), 2800) * np.exp(-t / 0.0025) * 0.9
    thump = membrane(dur, r.uniform(150, 190) / size ** 0.5, 48 / size ** 0.3, 0.02 * size, 0.07 * size, r, 0.25, 700) * 1.1
    punch = bandpass(noise(n, r), 280, 1300) * np.minimum(t / 0.002, 1) * np.exp(-t / (0.045 * size)) * 0.8
    crunch = np.zeros(n)
    for tt in poisson_times(r, 260, 0.06 * size):
        crunch[min(n - 1, ns(0.008 + tt))] += r.uniform(-1, 1)
    crunch = bandpass(crunch, 900, 4500) * np.exp(-t / (0.06 * size)) * 0.5
    y = soft_clip(click + thump + punch + crunch, 1.4)
    st = to_stereo(y)
    return fades(reverb(st, make_ir(0.5 * size, rng=r, bright=0.6), wet=0.18, dry=1.0)[:, :n], 0.0005, 0.05)


@variants("strike_impact", 4, "sfx", target=(-17, "short"))
def strike_impact(r, i):
    return fades(impact(r, 1.0, 0.45), 0.0005, 0.08)


@variants("strike_heavy", 2, "sfx", target=(-15, "short"))
def strike_heavy(r, i):
    D = 0.95
    y = impact(r, 1.9, D)
    n = ns(D)
    t = taxis(n)
    sub = np.sin(phase_of(36 + 70 * np.exp(-t / 0.05))) * np.exp(-t / 0.22) * 0.8
    pre = sweep_noise(r, 0.22, 300, 2200, 1200, 0.18, 0.4, rise=2.5, fall=0.03)
    out = np.zeros((2, n + ns(0.22)))
    place(out, pre * 0.7, 0)
    place(out, y + to_stereo(sub), ns(0.2))
    return fades(soft_clip(out, 1.2), 0.002, 0.15)


@variants("dash_whoosh", 3, "sfx", target=(-21, "short"))
def dash_whoosh(r, i):
    D = 0.42
    y = sweep_noise(r, D, r.uniform(2600, 3400), r.uniform(1400, 1800), r.uniform(320, 420), 0.07, 0.55, rise=1.5, fall=0.12, colour="white")
    p = np.linspace(0.7, -0.7, ns(D)) * (1 if i % 2 else -1)
    return fades(np.stack([y[0] * (1 - p), y[1] * (1 + p)]) * 0.7, 0.001, 0.05)


@asset("cast_charge_frost", "sfx", target=(-22, "short"))
def cast_charge_frost(r):
    D = 0.9
    n = ns(D)
    t = taxis(n)
    rise = (t / D) ** 1.6
    y = np.zeros(n)
    for k, ratio in enumerate(GLASS_RATIOS[:4]):
        f = 1150 * ratio * (1 + 0.45 * rise)
        y += np.sin(phase_of(f)) * (0.5 ** k) * (0.6 + 0.4 * np.sin(2 * np.pi * (9 + 5 * rise) * t + k))
    air = highpass(noise(n, r), 5000) * 0.25
    tw = np.zeros(n)
    for tt in poisson_times(r, 40, D, weight=(taxis(n) / D) ** 2):
        tw[ns(tt)] += r.uniform(-1, 1)
    tw = bandpass(tw, 4000, 11000) * 0.8
    y = (y * 0.3 + air + tw) * rise
    st = reverb(to_stereo(y), make_ir(1.2, rng=r, bright=1.4), wet=0.35)
    return fades(st, 0.02, 0.01)


@variants("cast_release_frost", 2, "sfx", target=(-16, "short"))
def cast_release_frost(r, i):
    D = 1.1
    n = ns(D)
    t = taxis(n)
    crack = highpass(noise(n, r), 3000) * np.exp(-t / 0.004) * 1.2
    shard = strike(D, r.uniform(2400, 3200), GLASS_RATIOS, [1, 0.7, 0.45, 0.3, 0.2], [0.35, 0.2, 0.12, 0.08, 0.05], r, click=0.8, click_lp=12000) * 0.6
    sizzle = highpass(noise(n, r), 6000) * np.minimum(t / 0.01, 1) * np.exp(-t / 0.3) * 0.35
    body = membrane(D, 160, 60, 0.02, 0.08, r, 0.3, 1200) * 0.6
    whoosh = sweep_noise(r, D, 4200, 1600, 500, 0.05, 0.5, rise=1.2, fall=0.25)
    y = fades(to_stereo(crack + shard + sizzle + body) + whoosh * 0.8, 0.0005, 0.12)
    return fades(reverb(y, make_ir(1.4, rng=r, bright=1.3), wet=0.3), 0.0005, 0.2)


@asset("cast_charge_storm", "sfx", target=(-22, "short"))
def cast_charge_storm(r):
    D = 0.9
    n = ns(D)
    t = taxis(n)
    rise = (t / D) ** 1.4
    hum = wavetable(110, n, cutoff=2500, rng=r) * 0.4 + wavetable(165, n, cutoff=1800, rng=r) * 0.2
    hum *= 0.6 + 0.4 * np.sin(2 * np.pi * (14 + 30 * rise) * t)
    zaps = np.zeros(n)
    for tt in poisson_times(r, 60, D, weight=(taxis(n) / D) ** 1.5):
        k = ns(tt)
        L = min(n - k, ns(r.uniform(0.004, 0.015)))
        zaps[k:k + L] += noise(L, r) * r.uniform(0.4, 1.0)
    zaps = bandpass(zaps, 1500, 9000)
    y = (hum * 0.5 + zaps * 0.8) * rise
    return fades(reverb(to_stereo(y), make_ir(0.8, rng=r), wet=0.25), 0.02, 0.01)


@variants("cast_release_storm", 2, "sfx", target=(-15, "short"))
def cast_release_storm(r, i):
    D = 1.6
    n = ns(D)
    t = taxis(n)
    snap = np.zeros(n)
    for k in range(r.integers(3, 6)):
        at = ns(r.uniform(0, 0.03))
        L = ns(r.uniform(0.003, 0.012))
        snap[at:at + L] += noise(L, r) * r.uniform(0.6, 1.2)
    snap = highpass(snap, 1200) * 1.3
    rumble = lowpass(brown(n, r), 180) * np.minimum(t / 0.03, 1) * np.exp(-t / 0.5) * 3.0
    buzz = wavetable(95, n, cutoff=3000, rng=r) * np.exp(-t / 0.18) * 0.35
    crackle = np.zeros(n)
    for tt in poisson_times(r, 80, 0.5):
        crackle[ns(0.02 + tt)] += r.uniform(-1, 1)
    crackle = bandpass(crackle, 2000, 9000) * np.exp(-t / 0.25) * 0.7
    y = fades(soft_clip(snap + rumble + buzz + crackle, 1.3), 0.0005, 0.2)
    return fades(reverb(to_stereo(y), make_ir(1.8, rng=r, bright=0.8), wet=0.3), 0.0005, 0.3)


@variants("mob_skitter_attack", 3, "sfx", target=(-22, "short"), ref=4, rolloff=1.2)
def mob_skitter_attack(r, i):
    D = 0.45
    n = ns(D)
    t = taxis(n)
    ch = np.zeros(n)
    rate = r.uniform(28, 40)
    k = 0.0
    while k < 0.32:
        a = ns(k)
        L = ns(0.004)
        ch[a:a + L] += noise(L, r) * (1 - k / 0.4)
        k += 1 / rate * r.uniform(0.8, 1.2)
    ch = bandpass(ch, 2200, 6500)
    sq = np.sin(phase_of(1500 + 600 * np.sin(2 * np.pi * 18 * t) - 900 * t)) * np.exp(-((t - 0.25) / 0.06) ** 2) * 0.25
    return fades(ch + sq, 0.001, 0.05)


@variants("mob_hulker_slam", 2, "sfx", target=(-15, "short"), ref=6, rolloff=0.9)
def mob_hulker_slam(r, i):
    D = 1.2
    n = ns(D)
    t = taxis(n)
    thump = membrane(D, 90, 32, 0.06, 0.28, r, 0.4, 400) * 1.4
    crunch = np.zeros(n)
    for tt in poisson_times(r, 200, 0.18):
        crunch[ns(0.005 + tt)] += r.uniform(-1, 1)
    crunch = bandpass(crunch, 600, 3500) * np.exp(-t / 0.15) * 0.6
    debris = np.zeros(n)
    for tt in poisson_times(r, 25, 0.8):
        debris[ns(0.1 + tt) % n] += r.uniform(-0.5, 0.5)
    debris = bandpass(debris, 1500, 5000) * np.exp(-t / 0.5) * 0.5
    y = fades(soft_clip(thump + crunch + debris, 1.5), 0.0005, 0.15)
    return fades(reverb(to_stereo(y), make_ir(1.2, rng=r, bright=0.5), wet=0.25), 0.0005, 0.2)


@variants("mob_veilbell_seed", 2, "sfx", target=(-19, "short"), ref=5)
def mob_veilbell_seed(r, i):
    D = 1.4
    bell = strike(D, r.uniform(820, 980), BELL_RATIOS, [0.4, 1, 0.5, 0.35, 0.3, 0.2, 0.15], [0.5, 0.6, 0.35, 0.3, 0.25, 0.18, 0.12], r, click=0.3, click_lp=6000)
    whoosh = sweep_noise(r, D, 400, 1800, 3000, 0.12, 0.5, rise=1.5, fall=0.18)
    return fades(reverb(to_stereo(bell * 0.7) + whoosh * 0.4, make_ir(1.6, rng=r, bright=1.2), wet=0.35), 0.001, 0.25)


@variants("mob_crownrift_blade", 2, "sfx", target=(-17, "short"), ref=6)
def mob_crownrift_blade(r, i):
    D = 0.8
    sw = sweep_noise(r, D, 300, 2400, 900, 0.14, 0.38, rise=2.2, fall=0.08) * 0.9
    ring = strike(D, r.uniform(1200, 1600), PLATE_RATIOS, [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15], [0.3, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08, 0.06, 0.05], r, jitter=0.01)
    y = np.zeros((2, ns(D)))
    place(y, sw, 0)
    place(y, to_stereo(ring * 0.25), ns(0.12))
    y = fades(y, 0.001, 0.12)
    return fades(reverb(y, make_ir(1.0, rng=r), wet=0.2), 0.001, 0.15)


@variants("mob_hurt_small", 3, "sfx", target=(-21, "short"), ref=4)
def mob_hurt_small(r, i):
    D = 0.28
    n = ns(D)
    t = taxis(n)
    f = r.uniform(950, 1250) * np.exp(-t / 0.12) + 380
    ch = np.sin(phase_of(f) + 2.5 * np.sin(phase_of(f * 1.5))) * np.minimum(t / 0.004, 1) * np.exp(-t / 0.07) * 0.45
    tap = impact(r, 0.6, D)[0] * 0.6
    return fades(ch + tap, 0.0005, 0.04)


@variants("mob_hurt_big", 2, "sfx", target=(-18, "short"), ref=6)
def mob_hurt_big(r, i):
    D = 0.5
    n = ns(D)
    t = taxis(n)
    src = wavetable(r.uniform(75, 95), n, cutoff=2400, rng=r)
    g = resonator(src, 420, 5) + resonator(src, 900, 6) * 0.6
    g *= np.minimum(t / 0.02, 1) * np.exp(-t / 0.14) * 0.6
    tap = impact(r, 1.3, D)[0] * 0.7
    return fades(soft_clip(g + tap, 1.3), 0.0005, 0.06)


@variants("mob_death", 2, "sfx", target=(-19, "short"), ref=5)
def mob_death(r, i):
    D = 1.6
    n = ns(D)
    t = taxis(n)
    sp = np.zeros(n)
    for tt in poisson_times(r, 70, 1.2, weight=np.exp(-taxis(n) / 0.6)):
        sp[ns(tt)] += r.uniform(-1, 1)
    sp = bandpass(sp, 3000, 11000)
    shimmer = np.zeros(n)
    for k in range(5):
        f = r.uniform(1400, 3200) * (1 + 0.4 * t / D)
        shimmer += np.sin(phase_of(f)) * np.exp(-t / r.uniform(0.3, 0.7)) * 0.12
    whoosh = sweep_noise(r, D, 600, 2600, 5000, 0.25, 0.6, rise=1.3, fall=0.5, stereo=False)
    y = fades(sp * 0.6 + shimmer + (whoosh[0] if whoosh.ndim == 2 else whoosh) * 0.5, 0.001, 0.2)
    return fades(reverb(to_stereo(y), make_ir(1.8, rng=r, bright=1.3), wet=0.4), 0.002, 0.3)


def hurt_voice(r, D, f0, breath=0.6, voiced=0.25):
    """A short exhaled 'uh': breath and a little voice through vowel formants (700 / 1150 / 2600 Hz)."""
    n = ns(D)
    t = taxis(n)
    e = np.minimum(t / 0.012, 1) * np.exp(-t / (D * 0.35))
    br = noise(n, r)
    v = wavetable(f0, n, cutoff=4000, freq_track=1 - 0.15 * t / D, rng=r)
    src = br * breath + v * voiced
    y = resonator(src, 700, 6) + resonator(src, 1150, 7) * 0.7 + resonator(src, 2600, 8) * 0.35
    return y * e


@variants("iris_hurt", 3, "sfx", target=(-16, "short"))
def iris_hurt(r, i):
    D = 0.42
    thud = membrane(D, 140, 60, 0.012, 0.05, r, 0.35, 900) * 0.8
    voice = hurt_voice(r, 0.3, r.uniform(210, 250))
    y = np.zeros(ns(D))
    place(y, thud, 0)
    place(y, voice * 0.9, ns(0.015))
    return fades(soft_clip(to_stereo(y), 1.2), 0.0005, 0.06)


@asset("iris_down", "sfx", target=(-15, "short"))
def iris_down(r):
    D = 1.3
    thud = membrane(D, 110, 40, 0.03, 0.18, r, 0.4, 600)
    voice = hurt_voice(r, 0.55, 200, breath=0.7, voiced=0.3)
    y = np.zeros(ns(D))
    place(y, thud, ns(0.2))
    place(y, voice, 0)
    return fades(reverb(to_stereo(soft_clip(y, 1.2)), make_ir(1.0, rng=r), wet=0.2), 0.0005, 0.3)


# =============================================================================================
# Render + encode + manifest
# =============================================================================================

def render(name):
    spec = ASSETS[name]
    r = rng_for(name)
    y = np.asarray(spec["fn"](r), dtype=np.float64)
    tdb, mode = spec["target"]
    y = normalize(y, tdb, mode)
    if not spec["loop"]:
        y = trim_tail(y)
        y = fades(y, 0.0005, 0.01)
    return y


def trim_tail(y, floor_db=-60.0, keep=0.03):
    """Cut the silent end of a one-shot (reverb tails below `floor_db` re peak): smaller files, exact durations."""
    m = np.abs(y).max(axis=0) if y.ndim == 2 else np.abs(y)
    pk = m.max()
    if pk <= 0:
        return y
    idx = np.nonzero(m > pk * 10 ** (floor_db / 20))[0]
    end = min(m.shape[0], (idx[-1] if len(idx) else m.shape[0] - 1) + ns(keep))
    return y[..., :end]


def encode(y, out_path, br):
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "x.wav"
        data = (y.T if y.ndim == 2 else y).astype(np.float32)
        wavfile.write(wav, SR, data)
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libopus", "-b:a", f"{br}k",
               "-vbr", "on", "-compression_level", "10", "-application", "audio", "-map_metadata", "-1",
               "-fflags", "+bitexact", "-flags:a", "+bitexact", str(out_path)]
        subprocess.run(cmd, check=True)


def entry(name, y):
    spec = ASSETS[name]
    e = {"file": name + ".ogg", "kind": spec["kind"], "dur": round(y.shape[-1] / SR, 4),
         "samples": int(y.shape[-1]), "channels": 1 if y.ndim == 1 else 2}
    if spec["loop"]:
        e["loop"] = True
    if spec["ref"] is not None:
        e["ref"] = spec["ref"]
    if spec["rolloff"] is not None:
        e["rolloff"] = spec["rolloff"]
    e.update(spec["extra"])
    return e


def write_manifest(entries):
    groups = {}
    for nm in sorted(entries):
        g = ASSETS[nm]["group"]
        if g:
            groups.setdefault(g, []).append(nm)
    body = {"sampleRate": SR, "sounds": {k: entries[k] for k in sorted(entries)}, "groups": groups}
    js = ("// GENERATED by art/audio/build_audio.py; do not edit by hand.\n"
          "// Every sound is synthesized from scratch (no samples). Files live in public/assets/audio/.\n"
          "export const AUDIO_MANIFEST = " + json.dumps(body, indent=2) + ";\n")
    MANIFEST_JS.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_JS.write_text(js)


def load_existing_entries():
    if not MANIFEST_JS.exists():
        return {}
    txt = MANIFEST_JS.read_text()
    i = txt.index("{")
    return json.loads(txt[i:txt.rindex("}") + 1])["sounds"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--wav", help="also write float WAV masters to this directory")
    a = ap.parse_args()
    if a.list:
        for k, v in ASSETS.items():
            print(f"{k:22s} {v['kind']}")
        return
    names = a.only or list(ASSETS)
    unknown = [x for x in names if x not in ASSETS]
    if unknown:
        sys.exit("unknown assets: " + ", ".join(unknown))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    entries = load_existing_entries() if a.only else {}
    entries = {k: v for k, v in entries.items() if k in ASSETS}
    for nm in names:
        y = render(nm)
        if not np.all(np.isfinite(y)):
            sys.exit(f"{nm}: non-finite samples")
        encode(y, OUT_DIR / (nm + ".ogg"), ASSETS[nm]["br"])
        if a.wav:
            os.makedirs(a.wav, exist_ok=True)
            wavfile.write(Path(a.wav) / (nm + ".wav"), SR, (y.T if y.ndim == 2 else y).astype(np.float32))
        entries[nm] = entry(nm, y)
        size = (OUT_DIR / (nm + ".ogg")).stat().st_size
        print(f"{nm:22s} {entries[nm]['dur']:7.2f}s ch{entries[nm]['channels']} peak {20*np.log10(peak(y)):6.1f} dB  {size/1024:7.1f} KB", flush=True)
    write_manifest(entries)
    total = sum(p.stat().st_size for p in OUT_DIR.glob("*.ogg"))
    print(f"total {total / 1e6:.2f} MB in {len(list(OUT_DIR.glob('*.ogg')))} files")


if __name__ == "__main__":
    main()

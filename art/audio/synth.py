"""Small offline DSP toolkit for Forget to Foresee audio (numpy + scipy only).

Everything is procedural: oscillators, modal (struck-object) synthesis, noise shaping in the
STFT domain, a synthetic-IR convolution reverb and loop folding. All randomness comes from
`rng_for(name)` so each asset renders identically on every run.
Signals are float64; mono = shape (n,), stereo = shape (2, n).
"""
import zlib

import numpy as np
from scipy import signal
from scipy.ndimage import gaussian_filter1d

SR = 48000


# ---------------------------------------------------------------- basics

def ns(dur):
    """Seconds -> sample count."""
    return int(round(dur * SR))


def taxis(n):
    return np.arange(n) / SR


def rng_for(name, salt=0):
    """Deterministic generator per asset name (crc32 seed)."""
    return np.random.default_rng(zlib.crc32(f"ftf-audio:{name}:{salt}".encode()))


def db(x):
    return 10 ** (x / 20.0)


def place(buf, x, at, gain=1.0, wrap=False):
    """Add x into buf starting at sample `at` (mono or stereo, broadcasting mono into stereo)."""
    n = buf.shape[-1]
    if x.ndim == 1 and buf.ndim == 2:
        x = np.stack([x, x])
    m = x.shape[-1]
    if wrap:
        idx = (at + np.arange(m)) % n
        np.add.at(buf, idx if buf.ndim == 1 else (slice(None), idx), x * gain)
        return buf
    if at >= n or at + m <= 0:
        return buf
    s0, s1 = max(at, 0), min(at + m, n)
    buf[..., s0:s1] += x[..., s0 - at:s1 - at] * gain
    return buf


def pan(x, p):
    """Equal-power pan of a mono signal; p in [-1, 1] (scalar or per-sample)."""
    a = (np.asarray(p) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)])


def to_stereo(x):
    return x if x.ndim == 2 else np.stack([x, x])


def mono(x):
    return x if x.ndim == 1 else x.mean(axis=0)


# ---------------------------------------------------------------- envelopes and control signals

def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def env_ar(n, attack, release=None, curve=1.0):
    """Attack (linear) then exponential-ish release to the end."""
    e = np.ones(n)
    a = min(ns(attack), n)
    if a > 0:
        e[:a] = np.linspace(0, 1, a) ** curve
    if release is not None:
        r = min(ns(release), n - a)
        if r > 0:
            e[n - r:] *= np.linspace(1, 0, r) ** 2
    return e


def env_adsr(n, a, d, s, r):
    pts_t = [0, a, a + d, max(a + d, n / SR - r), n / SR]
    pts_v = [0, 1, s, s, 0]
    return np.interp(taxis(n), pts_t, pts_v)


def fades(x, fin=0.005, fout=0.02):
    n = x.shape[-1]
    e = np.ones(n)
    a, b = min(ns(fin), n), min(ns(fout), n)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if b:
        e[n - b:] *= np.linspace(1, 0, b)
    return x * e


def smooth_random(n, rate_hz, rng, lo=0.0, hi=1.0):
    """Slowly wandering control signal in [lo, hi] (random knots, cosine-smoothed)."""
    k = max(int(n / SR * rate_hz) + 3, 4)
    knots = rng.random(k)
    cr = 200.0  # smooth at a 200 Hz control rate, then interpolate to audio rate
    m = max(int(n / SR * cr) + 2, 8)
    v = np.interp(np.linspace(0, k - 1, m), np.arange(k), knots)
    v = gaussian_filter1d(v, sigma=cr / rate_hz * 0.35, mode="nearest")
    v = np.interp(np.linspace(0, m - 1, n), np.arange(m), v)
    v = (v - v.min()) / max(v.max() - v.min(), 1e-9)
    return lo + (hi - lo) * v


def periodic_lfo(n, period_s, rng=None, phase=None):
    """Sine LFO in [0, 1]; choose period dividing the loop length for seamless loops."""
    ph = phase if phase is not None else (rng.random() * 2 * np.pi if rng is not None else 0)
    return 0.5 + 0.5 * np.sin(2 * np.pi * taxis(n) / period_s + ph)


# ---------------------------------------------------------------- oscillators

def phase_of(freq, n=None, phase0=0.0):
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, float)
    return phase0 + 2 * np.pi * np.cumsum(f) / SR


def sine(freq, n, phase0=0.0):
    return np.sin(phase_of(freq, n, phase0))


def wavetable(f0, n, cutoff=8000.0, tilt=1.0, odd_only=False, phase0=0.0, freq_track=None, rng=None):
    """Band-limited harmonic oscillator via a single-cycle table built for f0.
    tilt 1 = saw, odd_only + tilt 2 ~ triangle-ish. freq_track multiplies f0 per sample (vibrato)."""
    kmax = max(1, int(min(cutoff, SR * 0.45) / f0))
    k = np.arange(1, kmax + 1)
    if odd_only:
        k = k[k % 2 == 1]
    size = 4096
    ph = np.linspace(0, 2 * np.pi, size, endpoint=False)
    amps = 1.0 / k ** tilt
    # soft roll-off near the cutoff avoids a hard brickwall timbre
    amps *= np.clip(1.2 - k * f0 / min(cutoff, SR * 0.45), 0, 1) ** 0.5
    rph = rng.random(len(k)) * 2 * np.pi if rng is not None else np.zeros(len(k))
    table = (amps[:, None] * np.sin(k[:, None] * ph[None, :] + rph[:, None])).sum(0)
    table /= np.abs(table).max() + 1e-12
    f = f0 * (freq_track if freq_track is not None else 1.0)
    p = (phase_of(f, n, phase0) / (2 * np.pi)) % 1.0
    return np.interp(p * size, np.arange(size + 1), np.append(table, table[0]))


def additive_track(f0, harm_amps, cutoff=9000.0):
    """Harmonic oscillator for a gliding f0 track (per-sample band limiting)."""
    ph = phase_of(f0)
    out = np.zeros_like(ph)
    for k, a in enumerate(harm_amps, start=1):
        if a == 0:
            continue
        lim = np.clip((cutoff - k * f0) / 400.0, 0, 1)
        out += a * lim * np.sin(k * ph)
    return out


# ---------------------------------------------------------------- noise and filters

def noise(n, rng, channels=1):
    return rng.standard_normal((channels, n)) if channels > 1 else rng.standard_normal(n)


def _sos(kind, f, order=2):
    nyq = SR / 2
    if isinstance(f, (list, tuple)):
        wn = [min(max(x / nyq, 1e-4), 0.999) for x in f]
    else:
        wn = min(max(f / nyq, 1e-4), 0.999)
    return signal.butter(order, wn, btype=kind, output="sos")


def lowpass(x, f, order=2):
    return signal.sosfilt(_sos("lowpass", f, order), x, axis=-1)


def highpass(x, f, order=2):
    return signal.sosfilt(_sos("highpass", f, order), x, axis=-1)


def bandpass(x, lo, hi, order=2):
    return signal.sosfilt(_sos("bandpass", [lo, hi], order), x, axis=-1)


def resonator(x, f, q):
    b, a = signal.iirpeak(min(f, SR * 0.45), q, fs=SR)
    return signal.lfilter(b, a, x, axis=-1)


def pink(n, rng, channels=1):
    """1/f noise by spectral shaping."""
    w = noise(n, rng, channels)
    spec = np.fft.rfft(w, axis=-1)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    spec /= np.sqrt(f)
    y = np.fft.irfft(spec, n, axis=-1)
    return y / (np.std(y) + 1e-12)


def brown(n, rng, channels=1):
    w = noise(n, rng, channels)
    spec = np.fft.rfft(w, axis=-1)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    spec /= f
    y = np.fft.irfft(spec, n, axis=-1)
    y = highpass(y, 18)
    return y / (np.std(y) + 1e-12)


STFT_N = 2048
STFT_HOP = 512


def stft(x):
    f, t, z = signal.stft(x, SR, nperseg=STFT_N, noverlap=STFT_N - STFT_HOP, boundary="even")
    return f, t, z


def istft(z, n):
    _, y = signal.istft(z, SR, nperseg=STFT_N, noverlap=STFT_N - STFT_HOP, boundary=True)
    y = y[..., :n]
    if y.shape[-1] < n:
        y = np.pad(y, [(0, 0)] * (y.ndim - 1) + [(0, n - y.shape[-1])])
    return y


def stft_shape(x, gain_fn):
    """Time-varying spectral gain: gain_fn(freqs[:,None], times[None,:]) -> (F, T) array."""
    n = x.shape[-1]
    f, t, z = stft(x)
    g = gain_fn(f[:, None], t[None, :])
    return istft(z * g, n)


def ctrl_at(ctrl, times):
    """Sample a per-sample control signal at STFT frame times."""
    idx = np.clip((times * SR).astype(int), 0, len(ctrl) - 1)
    return ctrl[idx]


def gauss_bands(f, centers, widths, gains):
    out = 0
    for c, w, g in zip(centers, widths, gains):
        out = out + g * np.exp(-0.5 * ((f - c) / w) ** 2)
    return out


# ---------------------------------------------------------------- modal synthesis (struck objects)

def modal(n, partials, rng=None, jitter=0.0):
    """partials: iterable of (freq, amp, decay_s). Returns mono."""
    t = taxis(n)
    out = np.zeros(n)
    for f, a, d in partials:
        if f >= SR * 0.47:
            continue
        if rng is not None and jitter:
            f *= 1 + jitter * rng.standard_normal()
        ph = rng.random() * 2 * np.pi if rng is not None else 0
        out += a * np.exp(-t / d) * np.sin(2 * np.pi * f * t + ph)
    return out


def strike(dur, f0, ratios, amps, decays, rng, jitter=0.002, click=0.0, click_lp=6000):
    n = ns(dur)
    y = modal(n, [(f0 * r, a, d) for r, a, d in zip(ratios, amps, decays)], rng, jitter)
    if click:
        c = noise(ns(0.004), rng) * np.linspace(1, 0, ns(0.004)) ** 2
        y = place(y, lowpass(c, click_lp) * click, 0)
    return fades(y, 0.0005, 0.01)


# typical ratio sets
BAR_RATIOS = [1.0, 2.756, 5.404, 8.933, 13.34]           # free-free bar (chimes)
BELL_RATIOS = [0.5, 1.0, 1.183, 1.506, 2.0, 2.514, 3.011]  # church-bell-like (hum, prime, tierce...)
GLASS_RATIOS = [1.0, 2.32, 4.25, 6.63, 9.38]
PLATE_RATIOS = [1.0, 1.59, 2.14, 2.30, 2.65, 2.92, 3.16, 3.50, 4.15]
WOOD_RATIOS = [1.0, 2.57, 4.03, 6.9]


def membrane(dur, f_hi, f_lo, pitch_tau, decay, rng, noise_amt=0.3, noise_lp=3000):
    """Drum / thud: pitch-dropping sine plus a filtered noise burst."""
    n = ns(dur)
    t = taxis(n)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / pitch_tau)
    y = np.sin(phase_of(f)) * np.exp(-t / decay)
    nb = lowpass(noise(n, rng), noise_lp) * np.exp(-t / (decay * 0.25))
    return fades(y + noise_amt * nb, 0.0003, 0.02)


# ---------------------------------------------------------------- dynamics

def soft_clip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def peak(x):
    return float(np.abs(x).max() + 1e-12)


def short_term_rms_db(x, win=0.4):
    m = mono(x) if x.ndim == 2 else x
    w = max(ns(win), 1)
    if len(m) <= w:
        return 20 * np.log10(np.sqrt(np.mean(m ** 2)) + 1e-12)
    c = np.cumsum(np.concatenate([[0], m ** 2]))
    r = (c[w:] - c[:-w]) / w
    return 10 * np.log10(r.max() + 1e-12)


def integrated_rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(mono(x) ** 2)) + 1e-12)


def normalize(x, target_db, mode="short", ceiling_db=-1.0):
    """Scale to a loudness target, then soft-limit to the ceiling."""
    cur = short_term_rms_db(x) if mode == "short" else integrated_rms_db(x)
    y = x * db(target_db - cur)
    c = db(ceiling_db)
    p = peak(y)
    if p > c:
        # gentle knee: only the part above 70 % of the ceiling is compressed
        k = 0.7 * c
        a = np.abs(y)
        over = a > k
        y = np.where(over, np.sign(y) * (k + (c - k) * np.tanh((a - k) / (c - k))), y)
    return y


# ---------------------------------------------------------------- space

def make_ir(rt60, dur=None, rng=None, predelay=0.015, bright=1.0, stereo=True, early=6):
    """Synthetic room/hall impulse response with frequency-dependent decay (4 bands)."""
    rng = rng or np.random.default_rng(1)
    dur = dur or min(rt60 * 1.3, 8.0)
    n = ns(dur)
    t = taxis(n)
    chans = []
    for _ in range(2 if stereo else 1):
        w = rng.standard_normal(n)
        ir = np.zeros(n)
        for lo, hi, k in [(20, 400, 1.15), (400, 2000, 1.0), (2000, 6000, 0.7 * bright), (6000, 20000, 0.4 * bright)]:
            band = bandpass(w, lo, min(hi, SR * 0.45))
            ir += band * np.exp(-6.91 * t / max(rt60 * k, 0.05))
        # sparse early reflections
        for _ in range(early):
            at = ns(predelay + rng.random() * 0.06)
            if at < n:
                ir[at] += (rng.random() * 0.6 + 0.2) * rng.choice([-1, 1]) * 3
        ir[:ns(predelay)] = 0
        ir *= np.minimum(1, t / 0.004 + 0.0)  # tiny fade-in after predelay
        chans.append(ir / np.sqrt(np.sum(ir ** 2)))
    return np.stack(chans) if stereo else chans[0]


def reverb(x, ir, wet=0.3, dry=1.0):
    """Convolve (mono or stereo in) with a stereo IR; output stereo, length len(x)+len(ir)-1."""
    xs = to_stereo(x)
    irs = to_stereo(ir)
    n = xs.shape[1] + irs.shape[1] - 1
    out = np.zeros((2, n))
    for c in range(2):
        out[c] = signal.fftconvolve(xs[c], irs[c]) * wet
    out[:, :xs.shape[1]] += xs * dry
    return out


def reverb_circular(x, ir, wet=0.3, dry=1.0):
    """Reverb for a seamless loop: the tail wraps around to the loop start."""
    y = reverb(x, ir, wet, dry)
    return fold_add(y, x.shape[-1])


# ---------------------------------------------------------------- loops

def fold_add(y, L):
    """Wrap everything after L back onto the start (for exactly periodic material)."""
    out = y[..., :L].copy()
    pos = L
    while pos < y.shape[-1]:
        chunk = y[..., pos:pos + L]
        out[..., :chunk.shape[-1]] += chunk
        pos += L
    return out


def fold_xfade(y, L, P):
    """Seamless loop from a render of length >= L + P: equal-power crossfade of the overrun onto the head."""
    out = y[..., :L].copy()
    w = np.linspace(0, 1, P)
    fin, fout = np.sin(w * np.pi / 2), np.cos(w * np.pi / 2)
    out[..., :P] = y[..., :P] * fin + y[..., L:L + P] * fout
    return out


# ---------------------------------------------------------------- granular / spectral

def resample_ratio(x, ratio):
    """Pitch/speed change by linear interpolation (ratio > 1 = higher, shorter)."""
    n = int(len(x) / ratio)
    if n < 2:
        return x[:1]
    return np.interp(np.arange(n) * ratio, np.arange(len(x)), x)


def granulate(x, out_n, rng, density=80.0, grain=(0.03, 0.12), spread=0.08, ratios=((1.0, 1.0),),
              pos_track=None, stereo=True, amp_track=None):
    """Grain cloud from source x. pos_track(t_out) -> source time (s); ratios: (ratio, weight)."""
    out = np.zeros((2, out_n)) if stereo else np.zeros(out_n)
    count = int(out_n / SR * density)
    rs = np.array([r for r, _ in ratios])
    ws = np.array([w for _, w in ratios], float)
    ws /= ws.sum()
    for _ in range(count):
        to = rng.random() * out_n / SR
        src_t = pos_track(to) if pos_track else to
        src_t += rng.normal(0, spread)
        gl = rng.uniform(*grain)
        r = rng.choice(rs, p=ws)
        s0 = int(np.clip(src_t, 0, max(len(x) / SR - gl * r, 0)) * SR)
        seg = x[s0:s0 + int(gl * r * SR) + 2]
        if len(seg) < 16:
            continue
        g = resample_ratio(seg, r)
        g = g * np.hanning(len(g))
        a = amp_track(to) if amp_track else 1.0
        if stereo:
            place(out, pan(g, rng.uniform(-0.8, 0.8)), int(to * SR), a)
        else:
            place(out, g, int(to * SR), a)
    return out


def spectral_freeze(x, at, hold, fade_in=0.08, fade_out=1.0, jitter=0.15, rng=None):
    """Phase-vocoder freeze: hold the spectrum at time `at` for `hold` s (+fade_out). Mono in/out,
    output length = len(x) (the frozen layer only; mix it with the dry voice)."""
    n = len(x)
    f, t, z = stft(x)
    k0 = int(np.clip(np.searchsorted(t, at), 1, z.shape[1] - 2))
    mag = np.abs(z[:, k0 - 1:k0 + 2]).mean(1)
    dphi = np.angle(z[:, k0 + 1]) - np.angle(z[:, k0])
    frames_hold = int((hold + fade_out) * SR / STFT_HOP)
    out = np.zeros_like(z)
    phase = np.angle(z[:, k0]).copy()
    rng = rng or np.random.default_rng(3)
    for m in range(frames_hold):
        k = k0 + m
        if k >= z.shape[1]:
            break
        tm = m * STFT_HOP / SR
        e = min(1.0, tm / fade_in) if fade_in > 0 else 1.0
        if tm > hold:
            e *= max(0.0, 1 - (tm - hold) / fade_out) ** 1.5
        phase = phase + dphi + jitter * rng.standard_normal(len(phase))
        out[:, k] = mag * e * np.exp(1j * phase)
    return istft(out, n)

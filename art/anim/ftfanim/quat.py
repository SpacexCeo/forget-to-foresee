"""Quaternion and vector helpers on numpy arrays. Quaternions are (x, y, z, w) as in glTF; all functions broadcast."""
import numpy as np


def qnorm(q):
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(a, -1, 0)
    bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by,
                     aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw,
                     aw * bw - ax * bx - ay * by - az * bz], -1)


def qinv(q):
    return q * np.array([-1.0, -1.0, -1.0, 1.0])


def qrot(q, v):
    """Rotates vectors v by quaternions q."""
    u, w = q[..., :3], q[..., 3:4]
    t = 2.0 * np.cross(u, v)
    return v + w * t + np.cross(u, t)


def axis_angle(axis, angle):
    axis = np.asarray(axis, float)
    axis = axis / np.maximum(np.linalg.norm(axis, axis=-1, keepdims=True), 1e-12)
    h = np.asarray(angle, float)[..., None] * 0.5
    return np.concatenate([axis * np.sin(h), np.cos(h)], -1)


def swing(a, b):
    """Shortest rotation that takes direction a onto direction b."""
    a = a / np.maximum(np.linalg.norm(a, axis=-1, keepdims=True), 1e-12)
    b = b / np.maximum(np.linalg.norm(b, axis=-1, keepdims=True), 1e-12)
    c = np.cross(a, b)
    d = np.sum(a * b, -1, keepdims=True)
    q = np.concatenate([c, 1.0 + d], -1)
    # opposite vectors: any perpendicular axis
    bad = (1.0 + d[..., 0]) < 1e-8
    if np.any(bad):
        perp = np.cross(a, np.array([1.0, 0, 0]))
        alt = np.cross(a, np.array([0, 0, 1.0]))
        perp = np.where(np.linalg.norm(perp, axis=-1, keepdims=True) < 1e-6, alt, perp)
        q = np.where(bad[..., None], np.concatenate([perp, np.zeros_like(d)], -1), q)
    return qnorm(q)


def qslerp(a, b, t):
    """Spherical interpolation, shortest path; t broadcasts against the leading shape."""
    t = np.asarray(t, float)[..., None]
    d = np.sum(a * b, -1, keepdims=True)
    b = np.where(d < 0, -b, b)
    d = np.clip(np.abs(d), 0, 1)
    th = np.arccos(d)
    s = np.sin(th)
    small = s < 1e-6
    wa = np.where(small, 1 - t, np.sin((1 - t) * th) / np.where(small, 1, s))
    wb = np.where(small, t, np.sin(t * th) / np.where(small, 1, s))
    return qnorm(wa * a + wb * b)


def qpow(q, t):
    """q raised to t (a fraction of the rotation), shortest path."""
    ident = np.zeros_like(q)
    ident[..., 3] = 1.0
    return qslerp(ident, q, t)


def continuous(q):
    """Flips signs along axis 0 so consecutive quaternions stay in the same hemisphere."""
    q = q.copy()
    d = np.sum(q[1:] * q[:-1], -1)
    flip = np.cumprod(np.where(d < 0, -1.0, 1.0), axis=0)
    q[1:] *= flip[..., None]
    return q


def from_euler(order, angles_deg):
    """Intrinsic rotations applied in the listed order (BVH channel order): R = R(order[0]) * R(order[1]) * ..."""
    ax = {'X': (1.0, 0, 0), 'Y': (0, 1.0, 0), 'Z': (0, 0, 1.0)}
    q = None
    for i, c in enumerate(order):
        r = axis_angle(np.array(ax[c]), np.radians(angles_deg[..., i]))
        q = r if q is None else qmul(q, r)
    return q


def yaw_quat(angle):
    return axis_angle(np.array([0, 1.0, 0]), angle)


def yaw_of(q, fwd=(0, 0, 1.0)):
    """Heading (rotation about +Y) of the forward axis after q."""
    f = qrot(q, np.asarray(fwd, float))
    return np.arctan2(f[..., 0], f[..., 2])


def gauss_filter(x, sigma, wrap=False):
    """Gaussian low-pass along axis 0 (reflect or wrap padding)."""
    if sigma <= 0:
        return x
    r = int(np.ceil(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    n = len(x)
    idx = np.arange(-r, n + r)
    idx = idx % n if wrap else np.clip(idx, 0, n - 1)
    xp = x[idx]
    out = np.zeros_like(x, dtype=float)
    for i, w in enumerate(k):
        out += w * xp[i:i + n]
    return out


def qfilter(q, sigma, wrap=False):
    """Low-pass for quaternion tracks [F, ..., 4]: hemisphere-aligned gaussian, renormalized."""
    if wrap:
        # align the seam too: the wrapped neighbours must share the hemisphere
        q = continuous(q)
        if np.any(np.sum(q[0] * q[-1], -1) < 0):
            sign = np.where(np.sum(q[0] * q[-1], -1) < 0, -1.0, 1.0)
            n = len(q)
            r = int(np.ceil(sigma * 3))
            idx = np.arange(-r, n + r)
            wraps = np.floor_divide(idx, n)
            qp = q[idx % n] * (sign[None, ..., None] ** np.abs(wraps)[(...,) + (None,) * (q.ndim - 1)])
            k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
            k /= k.sum()
            out = np.zeros_like(q)
            for i, w in enumerate(k):
                out += w * qp[i:i + n]
            return qnorm(out)
        return qnorm(gauss_filter(q, sigma, True))
    return qnorm(gauss_filter(continuous(q), sigma, False))


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)

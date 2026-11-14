"""The wing's curves (shared by s04, which builds the membranes, and s07, which puts the bones on the same lines)."""
import numpy as np


def wing_curves(C):
    V = lambda k: np.array(C[k], float)
    S, E, W, B, TH = V('S'), V('E'), V('W'), V('B'), V('thumb'); TIPS = [np.array(t, float) for t in C['tips']]

    def bez(p0, p1, p2, t):
        t = np.asarray(t, float)[..., None]; return (1 - t) ** 2 * p0 + 2 * t * (1 - t) * p1 + t ** 2 * p2

    def finger(i, t):
        """Finger i (0..3) from the wrist to its tip, bent a little towards the trailing edge."""
        tip = TIPS[i]; mid = (W + tip) / 2; d = tip - W; back = np.array([-d[1], d[0], 0.0]); back /= np.linalg.norm(back)
        return bez(W, mid + back * 0.07 * np.linalg.norm(d) + np.array([0, 0, 0.10]), tip, t)

    def arm(u):
        """S -> E -> W, u in 0..1 with the elbow at 0.5, the corner rounded a little."""
        u = np.asarray(u, float)[..., None]; a = S + (E - S) * np.clip(u * 2, 0, 1); b = E + (W - E) * np.clip(u * 2 - 1, 0, 1)
        p = np.where(u < 0.5, a, b); k = np.clip(1 - np.abs(u - 0.5) / 0.12, 0, 1) ** 2
        return p + k * (((S + W) / 2 - E) * 0.06)

    return S, E, W, B, TH, TIPS, bez, finger, arm

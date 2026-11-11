"""A small cloth solver (position-based dynamics) for baking secondary motion onto bones: particles joined by
distance constraints, pinned or softly held to animated targets, gravity, air drag against a head wind, tapered
capsule colliders that move with the body, a floor. Deterministic; numpy only."""
import numpy as np

G = np.array([0.0, -9.81, 0.0])


def colour(cons, n):
    """Splits constraints [(i, j, rest, stiff_stretch, stiff_squash)] into groups that share no particle, as arrays."""
    groups = []; used = []
    for c in cons:
        for g, u in zip(groups, used):
            if c[0] not in u and c[1] not in u:
                g.append(c); u.add(c[0]); u.add(c[1]); break
        else:
            groups.append([c]); used.append({c[0], c[1]})
    return [(np.array([c[0] for c in g]), np.array([c[1] for c in g]), np.array([c[2] for c in g]), np.array([c[3] for c in g]), np.array([c[4] for c in g])) for g in groups]


def grid_constraints(X, bend=0.15, squash=0.05, close=False):
    """Constraints of a grid of rest positions [R, C, 3]: edges and both diagonals (stretch-stiff, soft against
    squashing so the cloth can fold), and two-apart links that keep the rest curvature a little."""
    R, C = X.shape[:2]; idx = np.arange(R * C).reshape(R, C); P = X.reshape(-1, 3); cons = []
    def link(a, b, ks, kq):
        cons.append((int(a), int(b), float(np.linalg.norm(P[a] - P[b])), ks, kq))
    for r in range(R):
        for c in range(C):
            if c + 1 < C: link(idx[r, c], idx[r, c + 1], 1.0, squash)
            if r + 1 < R: link(idx[r, c], idx[r + 1, c], 1.0, squash)
            if r + 1 < R and c + 1 < C: link(idx[r, c], idx[r + 1, c + 1], 0.6, squash); link(idx[r, c + 1], idx[r + 1, c], 0.6, squash)
            if c + 2 < C: link(idx[r, c], idx[r, c + 2], bend, bend)
            if r + 2 < R: link(idx[r, c], idx[r + 2, c], bend, bend)
    return cons


def chain_constraints(P, bend=0.1):
    cons = [(i, i + 1, float(np.linalg.norm(P[i + 1] - P[i])), 1.0, 1.0) for i in range(len(P) - 1)]
    return cons + [(i, i + 2, float(np.linalg.norm(P[i + 2] - P[i])), bend, bend) for i in range(len(P) - 2)]


def simulate(x0, cons, target, hold, caps, fps, sub=4, iters=10, drag=1.2, wind=None, margin=0.012, floor=0.004, friction=0.5):
    """x0 [P, 3] start positions. target [F, P, 3]: where the body would carry every particle (its rest shape under
    the parent bone). hold [P]: 1 pins a particle to its target, 0 leaves it free, between pulls it there (1/s x 20).
    caps: (a [F, K, 3], b [F, K, 3], r0 [K], r1 [K]). wind [F, 3]: air velocity. Returns positions [F, P, 3]."""
    F = len(target); P = len(x0); groups = colour(cons, P)
    w = np.where(hold >= 1, 0.0, 1.0); pin = hold >= 1; soft = (hold > 0) & ~pin
    x = x0.copy(); v = np.zeros_like(x); out = np.zeros((F, P, 3)); dt = 1.0 / (fps * sub)
    a, b, r0, r1 = caps
    for f in range(F):
        fp = max(f - 1, 0)
        for s in range(sub):
            u = (s + 1) / sub
            tg = target[fp] * (1 - u) + target[f] * u; ca = a[fp] * (1 - u) + a[f] * u; cb = b[fp] * (1 - u) + b[f] * u
            air = (wind[f] if wind is not None else 0.0)
            v += G * dt; v += (air - v) * min(drag * dt, 1.0)
            if soft.any(): v[soft] += (tg[soft] - x[soft]) * (hold[soft] * 20.0)[:, None] * min(20.0 * dt, 1.0)
            p = x + v * dt; p[pin] = tg[pin]; hit = np.zeros(P, bool)
            for it in range(iters):
                for i, j, L, ks, kq in groups:
                    d = p[j] - p[i]; dist = np.maximum(np.linalg.norm(d, axis=1), 1e-9); k = np.where(dist > L, ks, kq)
                    wi, wj = w[i], w[j]; s_ = k * (dist - L) / dist / np.maximum(wi + wj, 1e-9)
                    p[i] += (wi * s_)[:, None] * d; p[j] -= (wj * s_)[:, None] * d
                for k in range(len(r0)):
                    ab = cb[k] - ca[k]; t = np.clip((p - ca[k]) @ ab / (ab @ ab), 0, 1); c = ca[k] + t[:, None] * ab
                    d = p - c; dist = np.maximum(np.linalg.norm(d, axis=1), 1e-9); rad = r0[k] + (r1[k] - r0[k]) * t + margin
                    m = (dist < rad) & ~pin
                    if m.any():
                        p[m] = c[m] + d[m] * (rad[m] / dist[m])[:, None]; hit |= m
                low = (p[:, 1] < floor) & ~pin; p[low, 1] = floor; hit |= low
            v = (p - x) / dt; v[hit] *= (1 - friction); x = p
        out[f] = x
    return out

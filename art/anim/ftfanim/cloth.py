"""A small cloth solver (position-based dynamics) for baking secondary motion onto bones: particles joined by
distance constraints, pinned or softly held to animated targets, gravity, air drag against a head wind, tapered
capsule colliders that move with the body, a floor. Deterministic; numpy only."""
import numpy as np

G = np.array([0.0, -9.81, 0.0])


def colour(cons, n):
    """Splits constraints [(i, j, rest, stiff_stretch, stiff_squash[, longest])] into groups that share no particle, as
    arrays. `longest` (default: rest) is the length a link may open to before it resists: folded cloth has slack."""
    groups = []; used = []
    for c in cons:
        for g, u in zip(groups, used):
            if c[0] not in u and c[1] not in u:
                g.append(c); u.add(c[0]); u.add(c[1]); break
        else:
            groups.append([c]); used.append({c[0], c[1]})
    return [(np.array([c[0] for c in g]), np.array([c[1] for c in g]), np.array([c[2] for c in g]), np.array([c[3] for c in g]), np.array([c[4] for c in g]), np.array([c[5] if len(c) > 5 else c[2] for c in g])) for g in groups]


def grid_constraints(X, bend=0.15, squash=0.05, close=False, slack=None):
    """Constraints of a grid of rest positions [R, C, 3]: edges and both diagonals (stretch-stiff, soft against
    squashing so the cloth can fold), and two-apart links that keep the rest curvature a little. `slack` [R]: how much
    longer than the grid the real cloth of each row is (a grid laid on the outer envelope of a folded flare): the
    links along a row, and the diagonals, open that far before they resist."""
    R, C = X.shape[:2]; idx = np.arange(R * C).reshape(R, C); P = X.reshape(-1, 3); cons = []
    sl = np.ones(R) if slack is None else np.asarray(slack, float)
    def link(a, b, ks, kq, s=1.0):
        L = float(np.linalg.norm(P[a] - P[b])); cons.append((int(a), int(b), L, ks, kq, L * s))
    for r in range(R):
        for c in range(C):
            if c + 1 < C: link(idx[r, c], idx[r, c + 1], 1.0, squash, sl[r])
            if r + 1 < R: link(idx[r, c], idx[r + 1, c], 1.0, squash)
            if r + 1 < R and c + 1 < C:
                sd = 0.5 * (1 + 0.5 * (sl[r] + sl[r + 1])); link(idx[r, c], idx[r + 1, c + 1], 0.6, squash, sd); link(idx[r, c + 1], idx[r + 1, c], 0.6, squash, sd)
            if c + 2 < C: link(idx[r, c], idx[r, c + 2], bend, bend, sl[r])
            if r + 2 < R: link(idx[r, c], idx[r + 2, c], bend, bend)
    return cons


def chain_constraints(P, bend=0.1):
    cons = [(i, i + 1, float(np.linalg.norm(P[i + 1] - P[i])), 1.0, 1.0) for i in range(len(P) - 1)]
    return cons + [(i, i + 2, float(np.linalg.norm(P[i + 2] - P[i])), bend, bend) for i in range(len(P) - 2)]


def simulate(x0, cons, target, hold, caps, fps, sub=4, iters=10, drag=1.2, wind=None, margin=0.012, floor=0.004, friction=0.5, leash=None):
    """x0 [P, 3] start positions. target [F, P, 3]: where the body would carry every particle (its rest shape under
    the parent bone). hold [P]: 1 pins a particle to its target, 0 leaves it free, between pulls it there (1/s x 20).
    caps: (a [F, K, 3], b [F, K, 3], r0 [K], r1 [K]). wind [F, 3]: air velocity. margin: the air kept from every
    capsule, one number or [P, K] (per particle and capsule; negative where a close garment dips into a capsule at
    rest). leash [P]: how far a particle may stray from its target before it is drawn back (a hem that nothing pushes
    does not fly up in a lunge; a capsule still wins: the collisions come after). Returns positions [F, P, 3]."""
    F = len(target); P = len(x0); groups = colour(cons, P)
    w = np.where(hold >= 1, 0.0, 1.0); pin = hold >= 1; soft = (hold > 0) & ~pin
    x = x0.copy(); v = np.zeros_like(x); out = np.zeros((F, P, 3)); dt = 1.0 / (fps * sub); rows = np.arange(P); dr = np.asarray(caps[3], float) - np.asarray(caps[2], float)
    a, b, r0, r1 = caps
    margin = np.broadcast_to(np.asarray(margin, float), (P, len(r0))) if np.ndim(margin) else np.full((P, len(r0)), float(margin))
    for f in range(F):
        fp = max(f - 1, 0)
        for s in range(sub):
            u = (s + 1) / sub
            tg = target[fp] * (1 - u) + target[f] * u; ca = a[fp] * (1 - u) + a[f] * u; cb = b[fp] * (1 - u) + b[f] * u
            air = (wind[f] if wind is not None else 0.0)
            v += G * dt; v += (air - v) * min(drag * dt, 1.0)
            if soft.any(): v[soft] += (tg[soft] - x[soft]) * (hold[soft] * 20.0)[:, None] * min(20.0 * dt, 1.0)
            p = x + v * dt; p[pin] = tg[pin]; hit = np.zeros(P, bool)
            if leash is not None:
                dl = tg - p; far = np.linalg.norm(dl, axis=1); over = np.maximum(far - leash, 0) * ~pin
                p += dl / np.maximum(far, 1e-9)[:, None] * (0.35 * over)[:, None]
            ab = cb - ca; ab2 = np.maximum(np.sum(ab * ab, -1), 1e-12)
            for it in range(iters):
                for i, j, L, ks, kq, Lx in groups:
                    d = p[j] - p[i]; dist = np.maximum(np.linalg.norm(d, axis=1), 1e-9); k = np.where(dist > Lx, ks, np.where(dist < L, kq, 0.0))
                    wi, wj = w[i], w[j]; s_ = k * (dist - np.where(dist > Lx, Lx, L)) / dist / np.maximum(wi + wj, 1e-9)
                    p[i] += (wi * s_)[:, None] * d; p[j] -= (wj * s_)[:, None] * d
                # every capsule at once: a particle is moved out of the capsule it is deepest in, then once more
                # (a point between two legs); far quicker than a pass per capsule when a body has twenty of them
                for _ in range(2):
                    t = np.clip(np.einsum('pkj,kj->pk', p[:, None] - ca[None], ab) / ab2[None], 0, 1)
                    d = p[:, None] - (ca[None] + t[..., None] * ab[None]); dist = np.maximum(np.linalg.norm(d, axis=-1), 1e-9)
                    pen = r0[None] + dr[None] * t + margin - dist; k = pen.argmax(1); pk = pen[rows, k]
                    m = (pk > 0) & ~pin
                    if not m.any():
                        break
                    p[m] += d[m, k[m]] / dist[m, k[m]][:, None] * pk[m][:, None]; hit |= m
                low = (p[:, 1] < floor) & ~pin; p[low, 1] = floor; hit |= low
            v = (p - x) / dt; v[hit] *= (1 - friction); x = p
        out[f] = x
    return out

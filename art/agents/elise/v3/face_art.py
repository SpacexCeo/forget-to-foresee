"""Elise v3: her face, drawn from shapes in the front plane (metres): eyes with burgundy irises, lashes, brows, a
hint of a nose, a small mouth, a soft blush, on one flat skin colour. Nothing is projected from a picture."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
SKIN = (249, 229, 219)


def draw(mid_x, eye_z, eye_dx, nose_tip, mouth_z):
    """Returns the art and its frame (x of the left border, z of the top border, pixels per metre)."""
    S_ = 6000.0                                            # art pixels per metre
    AW, AH = 1400, 1500; ax0 = mid_x - AW / 2 / S_; az1 = eye_z + 0.11
    toxy = lambda x, z: ((x - ax0) * S_, (az1 - z) * S_)
    art = Image.new('RGB', (AW, AH), SKIN); dr = ImageDraw.Draw(art, 'RGBA')

    def blob(cx, cz, rx, rz, col, blur):
        """A soft spot of one colour (only its alpha is blurred: no grey fringe)."""
        al = Image.new('L', (AW, AH), 0); x, y = toxy(cx, cz)
        ImageDraw.Draw(al).ellipse([x - rx * S_, y - rz * S_, x + rx * S_, y + rz * S_], fill=col[3])
        lay = Image.new('RGBA', (AW, AH), col[:3] + (0,)); lay.putalpha(al.filter(ImageFilter.GaussianBlur(blur)))
        return lay
    def bez(p0, p1, p2, n=40):
        t = np.linspace(0, 1, n)[:, None]; return (1 - t) ** 2 * np.array(p0) + 2 * t * (1 - t) * np.array(p1) + t ** 2 * np.array(p2)
    def stroke(pts, w0, w1, col):
        """A tapered line through points (metres, front plane): width w0 at the start to w1 at the end (metres)."""
        pts = np.array(pts); n = len(pts)
        for i in range(n - 1):
            w = (w0 + (w1 - w0) * i / (n - 1)) * S_
            a, b = toxy(*pts[i]), toxy(*pts[i + 1]); dr.line([a, b], fill=col, width=max(1, int(round(w))))
            dr.ellipse([a[0] - w / 2, a[1] - w / 2, a[0] + w / 2, a[1] + w / 2], fill=col)

    art.paste(Image.alpha_composite(art.convert('RGBA'), blob(mid_x - eye_dx - 0.010, eye_z - 0.030, 0.017, 0.009, (244, 168, 160, 90), 22)).convert('RGB'))
    art.paste(Image.alpha_composite(art.convert('RGBA'), blob(mid_x + eye_dx + 0.010, eye_z - 0.030, 0.017, 0.009, (244, 168, 160, 90), 22)).convert('RGB'))
    dr = ImageDraw.Draw(art, 'RGBA')
    INK = (38, 30, 36, 255); EW, EH = 0.0225, 0.0112        # half width and half height of an eye
    for sg, cx in ((1, mid_x + eye_dx), (-1, mid_x - eye_dx)):          # sg = +1: her left eye (outer corner at +x)
        cz = eye_z
        inner, outer = (cx - sg * EW, cz - 0.0012), (cx + sg * EW, cz + 0.0030)
        up = bez(inner, (cx - sg * 0.002, cz + EH * 2.05), outer); lo = bez(inner, (cx + sg * 0.002, cz - EH * 1.55), outer)
        poly = [toxy(*p) for p in up] + [toxy(*p) for p in lo[::-1]]
        dr.polygon(poly, fill=(250, 246, 244, 255))
        # the iris, clipped by the eye's outline: burgundy, darker above, a rim, the pupil, two lights
        mask = Image.new('L', (AW, AH), 0); ImageDraw.Draw(mask).polygon(poly, fill=255)
        lay = Image.new('RGBA', (AW, AH), (0, 0, 0, 0)); d3 = ImageDraw.Draw(lay)
        ix, iy = toxy(cx - sg * 0.0008, cz + 0.0018); ir = 0.0122 * S_
        for r_, col in ((1.0, (74, 22, 30, 255)), (0.9, (150, 52, 58, 255)), (0.62, (176, 78, 76, 255))):
            d3.ellipse([ix - ir * r_, iy - ir * r_, ix + ir * r_, iy + ir * r_], fill=col)
        d3.ellipse([ix - ir, iy - ir * 1.0, ix + ir, iy - ir * 0.05], fill=(98, 30, 40, 150))           # the lid's shade on the upper half
        d3.ellipse([ix - ir * 0.36, iy - ir * 0.40, ix + ir * 0.36, iy + ir * 0.40], fill=(40, 12, 18, 255))
        d3.ellipse([ix - sg * ir * 0.50 - ir * 0.2, iy - ir * 0.62, ix - sg * ir * 0.50 + ir * 0.2, iy - ir * 0.22], fill=(255, 250, 248, 255))
        d3.ellipse([ix + sg * ir * 0.42 - ir * 0.1, iy + ir * 0.34, ix + sg * ir * 0.42 + ir * 0.1, iy + ir * 0.54], fill=(240, 200, 196, 230))
        shade = Image.new('RGBA', (AW, AH), (0, 0, 0, 0)); ImageDraw.Draw(shade).polygon([toxy(*p) for p in up] + [toxy(*p) for p in bez(inner, (cx, cz + EH * 0.9), outer)[::-1]], fill=(120, 90, 110, 70))
        lay = Image.alpha_composite(lay, shade)
        art.paste(Image.composite(Image.alpha_composite(art.convert('RGBA'), lay), art.convert('RGBA'), mask).convert('RGB')); dr = ImageDraw.Draw(art, 'RGBA')
        # the upper lash: thick, thinning to the inner corner, with a wing past the outer corner; the lower lash a hair line
        stroke(up, 0.0010, 0.0026, INK)
        stroke(bez(outer, (cx + sg * (EW + 0.004), cz + 0.0052), (cx + sg * (EW + 0.0075), cz + 0.0072)), 0.0026, 0.0004, INK)
        stroke(bez((cx + sg * EW * 0.2, cz - EH * 0.76), (cx + sg * EW * 0.7, cz - EH * 0.62), outer), 0.0005, 0.0010, (70, 52, 58, 230))
        stroke(bez((cx - sg * EW * 0.75, cz + EH * 1.9), (cx, cz + EH * 2.7), (cx + sg * EW * 0.85, cz + EH * 2.25)), 0.0004, 0.0006, (150, 110, 110, 200))     # the lid's fold
        # the brow: thin, low, rising a little outward
        stroke(bez((cx - sg * EW * 0.95, cz + 0.0195), (cx + sg * 0.002, cz + 0.0250), (cx + sg * (EW + 0.004), cz + 0.0215)), 0.0022, 0.0009, (46, 38, 46, 255))
    # the nose: a short soft shade beside the tip and a small dark under it; the mouth: a line, a soft lower lip
    art = Image.alpha_composite(art.convert('RGBA'), blob(mid_x + 0.004, nose_tip[2] + 0.004, 0.0035, 0.0085, (214, 160, 150, 90), 7)).convert('RGB'); dr = ImageDraw.Draw(art, 'RGBA')
    stroke(bez((mid_x - 0.0022, nose_tip[2] - 0.0040), (mid_x, nose_tip[2] - 0.0052), (mid_x + 0.0022, nose_tip[2] - 0.0040)), 0.0007, 0.0007, (150, 96, 92, 255))
    art = Image.alpha_composite(art.convert('RGBA'), blob(mid_x, mouth_z - 0.0042, 0.0085, 0.0034, (226, 142, 140, 120), 8)).convert('RGB'); dr = ImageDraw.Draw(art, 'RGBA')
    stroke(bez((mid_x - 0.0105, mouth_z + 0.0004), (mid_x, mouth_z - 0.0014), (mid_x + 0.0105, mouth_z + 0.0004)), 0.0006, 0.0006, (120, 62, 66, 255))
    stroke(bez((mid_x - 0.004, mouth_z - 0.0078), (mid_x, mouth_z - 0.0088), (mid_x + 0.004, mouth_z - 0.0078)), 0.0005, 0.0005, (196, 130, 126, 200))
    return art, (ax0, az1, S_)

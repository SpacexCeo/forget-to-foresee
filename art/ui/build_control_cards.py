"""Draws the Settings -> Controls card pictures (the owner's infographics never came): one per language and mode,
HUD style (gold lines on dark): a mouse, the two button words read from the play locales (set.ctl.mode.aim.2 / .3,
the part before the colon) and an icon for what each button does in that mode; the card's own lines carry the text. Output: game/public/assets/ui/control-modes/<lang>-<mode>.webp, 600 x 450.
Then the language goes into CONTROL_ART in game/src/ui/control-mode-cards.js.
Usage: python art/ui/build_control_cards.py [lang ...]    (Pillow; fonts: FTF_FONT / FTF_FONT_BOLD / FTF_FONT_CJK,
default the Windows Segoe UI and Microsoft YaHei)
"""
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
LOC = os.path.join(ROOT, 'game', 'src', 'play', 'locales')
OUT = os.path.join(ROOT, 'game', 'public', 'assets', 'ui', 'control-modes')
FONTS = os.environ.get('WINDIR', 'C:/Windows') + '/Fonts/'
FONT = os.environ.get('FTF_FONT', FONTS + 'segoeui.ttf')
FONT_BOLD = os.environ.get('FTF_FONT_BOLD', FONTS + 'segoeuib.ttf')
FONT_CJK = os.environ.get('FTF_FONT_CJK', FONTS + 'msyh.ttc')
FONT_CJK_BOLD = os.environ.get('FTF_FONT_CJK_BOLD', FONTS + 'msyhbd.ttc')

S = 2  # drawn at twice the size, then scaled down: smooth edges
W, H = 600 * S, 450 * S
GOLD, GOLD_DIM, TEAL, TEXT, MUTED = (233, 180, 76), (233, 180, 76, 90), (159, 212, 207), (243, 234, 214), (190, 182, 166)
BG_TOP, BG_BOT, BODY = (18, 28, 29), (9, 14, 15), (27, 36, 37)


def strings(lang):
    src = open(os.path.join(LOC, lang + '.js'), encoding='utf-8').read()
    return {k: v for k, v in re.findall(r"'(set\.ctl\.mode\.[\w.]+)':\s*\"([^\"]*)\"", src)}


def font(lang, size, bold=False):
    path = (FONT_CJK_BOLD if bold else FONT_CJK) if lang == 'zh' else (FONT_BOLD if bold else FONT)
    return ImageFont.truetype(path, size * S)


def split(line):
    """'LMB: attack / interact' -> ('LMB', 'attack / interact'); no colon -> (None, line)."""
    m = re.match(r'^([^:：]{1,40})[:：]\s*(.+)$', line)
    return (m.group(1), m.group(2)) if m else (None, line)


def wrap(d, text, f, width):
    words = list(text) if re.search(r'[\u3000-\u9fff]', text) else text.split(' ')
    sep = '' if re.search(r'[\u3000-\u9fff]', text) else ' '
    lines, cur = [], ''
    for w in words:
        nxt = (cur + sep + w) if cur else w
        if d.textlength(nxt, font=f) <= width or not cur:
            cur = nxt
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines


def card(lang, mode, t):
    img = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):  # the HUD panel: a dark vertical gradient
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3)) + (255,))
    ov = Image.new('RGBA', (W, H)); o = ImageDraw.Draw(ov)
    o.rounded_rectangle([10 * S, 10 * S, W - 10 * S, H - 10 * S], radius=16 * S, outline=GOLD_DIM, width=S)
    for x, y, dx, dy in [(10, 10, 1, 1), (590, 10, -1, 1), (10, 440, 1, -1), (590, 440, -1, -1)]:  # gold corner ticks
        o.line([(x * S, (y + 26 * dy) * S), (x * S, y * S), ((x + 26 * dx) * S, y * S)], fill=GOLD, width=3 * S)
    img = Image.alpha_composite(img, ov); d = ImageDraw.Draw(img)
    P = lambda *xy: [v * S for v in xy]  # noqa: E731

    # the mouse in the middle, both buttons lit (both modes use both)
    mw, mh = 170, 270
    mx, my = 300 - mw / 2, 95
    cx, split_y = 300, my + 110
    d.rounded_rectangle(P(mx, my, mx + mw, my + mh), radius=int(mw / 2 * S), fill=BODY, outline=(233, 230, 220, 90), width=3 * S)
    d.pieslice(P(mx, my, mx + mw, my + mw), 180, 360, fill=GOLD)
    d.rectangle(P(mx, my + mw / 2, mx + mw, split_y), fill=GOLD)
    d.line(P(cx, my, cx, split_y), fill=BODY, width=5 * S)
    d.line(P(mx, split_y, mx + mw, split_y), fill=BODY, width=5 * S)
    d.rounded_rectangle(P(cx - 9, my + 34, cx + 9, my + 74), radius=9 * S, fill=BODY)  # the wheel

    # the button words from the locale ("LMB: ..." -> "LMB"), big, beside their button, with a short leader
    lmb, rmb = split(t['set.ctl.mode.aim.2'])[0] or 'LMB', split(t['set.ctl.mode.aim.3'])[0] or 'RMB'
    kf = font(lang, 34, True)
    for word, side in [(lmb, -1), (rmb, 1)]:
        bx = cx + side * mw * 0.28
        lines = wrap(d, word, kf, 150 * S)
        tx = 300 + side * 205
        ty = 120 - 21 * (len(lines) - 1)
        for i, ln in enumerate(lines):
            d.text((tx * S, (ty + 42 * i) * S), ln, font=kf, fill=GOLD, anchor='mm')
        d.line(P(bx, my + 50, cx + side * (mw / 2 + 8), my + 50), fill=TEXT, width=2 * S)
        d.line(P(cx + side * (mw / 2 + 8), my + 50, tx - side * 40, ty + 26 + 42 * (len(lines) - 1)), fill=GOLD_DIM, width=2 * S)
        d.ellipse(P(bx - 6, my + 44, bx + 6, my + 56), fill=BODY)

    def icon_at(kind, x, y):
        if kind == 'strike':  # a blade's slash
            d.arc(P(x - 34, y - 34, x + 34, y + 34), 200, 340, fill=TEXT, width=4 * S)
            d.line(P(x - 22, y + 22, x + 24, y - 24), fill=GOLD, width=6 * S)
            d.line(P(x - 30, y + 14, x - 14, y + 30), fill=GOLD, width=6 * S)
        elif kind == 'spear':  # a spear thrown forward
            d.line(P(x - 40, y + 20, x + 26, y - 13), fill=TEXT, width=5 * S)
            d.polygon(P(x + 40, y - 20, x + 18, y - 20, x + 30, y - 2), fill=GOLD)
        elif kind == 'point':  # walk to a marked point on the ground
            d.ellipse(P(x - 34, y + 6, x + 34, y + 30), outline=GOLD, width=4 * S)
            d.line(P(x, y + 18, x, y - 30), fill=TEXT, width=4 * S)
            d.polygon(P(x, y - 30, x + 26, y - 20, x, y - 10), fill=GOLD)
        elif kind == 'turn':  # hold and drag: the camera turns
            d.arc(P(x - 38, y - 26, x + 38, y + 26), 20, 330, fill=TEAL, width=5 * S)
            d.polygon(P(x + 40, y - 4, x + 26, y - 20, x + 48, y - 22), fill=TEAL)

    if mode == 'aim':  # the mouse turns the camera (arcs both sides), a crosshair holds the middle
        for a0, a1 in [(120, 165), (15, 60)]:
            d.arc(P(mx - 60, my + 120, mx + mw + 60, my + mh + 40), a0, a1, fill=TEAL, width=5 * S)
        d.ellipse(P(cx - 22, my + mh + 26, cx + 22, my + mh + 70), outline=(255, 255, 255), width=3 * S)
        d.ellipse(P(cx - 4, my + mh + 44, cx + 4, my + mh + 52), fill=(255, 255, 255))
        icon_at('strike', 95, 270); icon_at('spear', 505, 270)
    else:  # left: walk to a point; right held and dragged: turn the camera
        icon_at('point', 95, 270); icon_at('turn', 505, 270)
    return img.convert('RGB').resize((600, 450), Image.LANCZOS)


def main(langs):
    os.makedirs(OUT, exist_ok=True)
    for lang in langs:
        t = strings(lang)
        for mode in ('aim', 'classic'):
            p = os.path.join(OUT, f'{lang}-{mode}.webp')
            card(lang, mode, t).save(p, 'WEBP', quality=88, method=6)
            print(p, os.path.getsize(p))


if __name__ == '__main__':
    main(sys.argv[1:] or ['en', 'ru', 'uk', 'zh', 'it'])

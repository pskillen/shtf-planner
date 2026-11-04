#!/usr/bin/env python3
"""Synthetic best-before-date crops for the date-reader spike. PIL only, seeded, deterministic.
Usage: gen.py OUTDIR   -> OUTDIR/NNN.pgm (+ .png), OUTDIR/labels.json, OUTDIR/sheet.png
All fonts are system fonts; nothing generated here is committed (the script is)."""
import json, math, random, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
R = random.Random(20261104)
W, H = 480, 120

FONTS = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf',
]
FONTS = [f for f in FONTS if os.path.exists(f)]
MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']


def pick_date():
    y = R.randint(2027, 2031) if R.random() < 0.9 else 2026
    m = R.randint(1, 12) if y > 2026 else R.randint(12, 12)
    return m, y


def make_text(m, y):
    d = R.randint(1, 28)
    batch = 'L%d%02d%s' % (R.randint(10, 29), R.randint(10, 99), R.choice('ABCDEFGH'))
    t = '%02d:%02d' % (R.randint(0, 23), R.randint(0, 59))
    kinds = [
        ('BB %02d/%d' % (m, y), 3),
        ('BEST BEFORE END %s %d' % (MON[m - 1], y), 1),
        ('USE BY %02d %s %d' % (d, MON[m - 1], y), 2),
        ('%02d.%02d.%02d' % (d, m, y % 100), 3),
        ('%02d/%02d/%d' % (d, m, y), 2),
        ('%02d/%02d' % (m, y % 100), 2),
        ('EXP %02d.%d' % (m, y), 1),
        ('%02d %s %02d' % (d, MON[m - 1], y % 100), 2),
        ('BBE %s %02d' % (MON[m - 1], y % 100), 1),
        ('BB %02d %s %d' % (d, MON[m - 1], y), 1),
    ]
    core = R.choices([k for k, _ in kinds], [w for _, w in kinds])[0]
    r = R.random()
    if r < 0.30: return [batch + ' ' + t + ' ' + core] if len(core) < 12 else [batch + ' ' + core]
    if r < 0.45: return [batch, core]
    if r < 0.55: return [core, batch + ' ' + t]
    return [core]


def font_for(size, path=None):
    return ImageFont.truetype(path or R.choice(FONTS), size)


def render_lines(lines, fg, bg, fontpath=None, scale=1.0):
    """Text fitted into the box with margin, returns 'L' image."""
    img = Image.new('L', (W, H), bg)
    d = ImageDraw.Draw(img)
    fp = fontpath or R.choice(FONTS)
    size = int(H * (0.62 if len(lines) == 1 else 0.36) * scale)
    f = font_for(size, fp)
    while True:
        wmax = max(d.textlength(l, font=f) for l in lines)
        if wmax <= W * 0.92 or size < 12: break
        size -= 2; f = font_for(size, fp)
    lh = size * 1.15
    y0 = (H - lh * len(lines)) / 2 + R.randint(-4, 4)
    for i, l in enumerate(lines):
        w = d.textlength(l, font=f)
        x = (W - w) / 2 + R.randint(-10, 10) if w < W * 0.9 else 4
        d.text((x, y0 + i * lh), l, font=f, fill=fg)
    return img


def dot_matrix(lines, fg, bg, pitch=None):
    big = render_lines(lines, 0, 255, fontpath=R.choice(['/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf']))
    pitch = pitch or R.choice([5, 6])
    small = big.resize((W // pitch, H // pitch), Image.BOX)
    img = Image.new('L', (W, H), bg)
    d = ImageDraw.Draw(img)
    rad = pitch * R.uniform(0.28, 0.42)
    for y in range(small.height):
        for x in range(small.width):
            if small.getpixel((x, y)) < 150:
                cx = x * pitch + pitch / 2 + R.uniform(-0.6, 0.6); cy = y * pitch + pitch / 2 + R.uniform(-0.6, 0.6)
                d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=fg)
    return img


def emboss(lines, base):
    mask = render_lines(lines, 255, 0)
    img = Image.new('L', (W, H), base)
    hi = ImageChops.offset(mask, -2, -2).filter(ImageFilter.GaussianBlur(1))
    lo = ImageChops.offset(mask, 2, 2).filter(ImageFilter.GaussianBlur(1))
    img = ImageChops.add(img, hi.point(lambda v: v // 6))
    img = ImageChops.subtract(img, lo.point(lambda v: v // 5))
    # brushed-metal streaks
    n = Image.effect_noise((W, H), 18).point(lambda v: (v - 128) // 6 + 128)
    return ImageChops.add(img, n, scale=1.0, offset=-128)


def curve(img, amp):
    out = Image.new('L', img.size, 255)
    ph = R.uniform(0, math.pi)
    for x in range(W):
        dy = int(amp * math.sin(x / W * math.pi * 1.2 + ph))
        out.paste(img.crop((x, 0, x + 1, H)), (x, dy))
    return out


def noise(img, sigma):
    n = Image.effect_noise((W, H), sigma)
    return ImageChops.add(img, n, scale=1.0, offset=-128)


def low_contrast(img, k):
    return img.point(lambda v: int(128 + (v - 128) * k))


def build(cat):
    m, y = pick_date()
    lines = make_text(m, y)
    exp = '%02d/%d' % (m, y)
    dark_on_light = cat != 'inverse'
    if cat == 'dotmatrix':
        fg, bg = (30, 235) if R.random() < .7 else (235, 40)
        img = dot_matrix(lines, fg, bg)
        if R.random() < .5: img = img.filter(ImageFilter.GaussianBlur(0.8))
        if R.random() < .5: img = noise(img, 14)
    elif cat == 'emboss':
        img = emboss(lines, R.choice([150, 170, 190]))
        img = low_contrast(img, 1.0)
        img = noise(img, 8)
    elif cat == 'inverse':
        img = render_lines(lines, R.randint(200, 245), R.randint(15, 50))
        if R.random() < .5: img = noise(img, 10)
    else:
        bg = R.randint(215, 250); fg = R.randint(10, 60)
        img = render_lines(lines, fg, bg)
        if cat == 'lowcontrast': img = low_contrast(img, R.uniform(0.18, 0.3)); img = noise(img, 6)
        if cat == 'blur': img = img.filter(ImageFilter.GaussianBlur(R.uniform(1.4, 2.6)))
        if cat == 'rotated': img = img.rotate(R.choice([-1, 1]) * R.uniform(3, 7), resample=Image.BICUBIC, fillcolor=bg)
        if cat == 'curved': img = curve(img, R.uniform(5, 11))
        if cat == 'noisy': img = noise(img, R.uniform(30, 55))
    return img, exp, ' | '.join(lines)


PLAN = [('clean', 8), ('lowcontrast', 8), ('blur', 8), ('rotated', 8), ('curved', 8), ('noisy', 8), ('dotmatrix', 14), ('emboss', 8), ('inverse', 6)]
labels = []
n = 0
cells = []
for cat, k in PLAN:
    for _ in range(k):
        img, exp, text = build(cat)
        n += 1
        name = '%03d' % n
        img.save(os.path.join(OUT, name + '.png'))
        with open(os.path.join(OUT, name + '.pgm'), 'wb') as fh:
            fh.write(b'P5\n%d %d\n255\n' % img.size); fh.write(img.tobytes())
        labels.append({'id': name, 'cat': cat, 'expect': exp, 'text': text})
        cells.append(img)
json.dump(labels, open(os.path.join(OUT, 'labels.json'), 'w'), indent=1)
cols = 4
sheet = Image.new('L', (cols * (W + 6), ((len(cells) + cols - 1) // cols) * (H + 6)), 128)
for i, c in enumerate(cells):
    sheet.paste(c, ((i % cols) * (W + 6), (i // cols) * (H + 6)))
sheet.resize((sheet.width // 2, sheet.height // 2)).save(os.path.join(OUT, 'sheet.png'))
print(len(labels), 'images')

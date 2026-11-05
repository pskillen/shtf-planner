# Cut the crops listed in photo-crops.json out of the owner's photos, the way the app's captureBox() does:
# crop the rectangle, shrink to at most 256 px high (never enlarge), grey with the app's weights. Writes PGMs
# (and PNGs to look at). The photos are not in the repo, and neither are the outputs.
# usage: python3 date-spike/photo-crops.py PHOTO_DIR OUT_DIR
import json, sys, os
from PIL import Image

photos, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
spec = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'photo-crops.json')))['photos']


def scaled(rect, k, W, H):
    x, y, w, h = rect
    cx, cy = x + w / 2, y + h / 2
    w2, h2 = min(W, w * k), min(H, h * k)
    x2, y2 = max(0, min(W - w2, cx - w2 / 2)), max(0, min(H - h2, cy - h2 / 2))
    return [round(x2), round(y2), round(w2), round(h2)]


for p in spec:
    im = Image.open(os.path.join(photos, p['file'] + '.jpg')).convert('RGB')
    for name, rect in (('tight', p['tight']), ('loose', scaled(p['tight'], 1.8, *im.size)), ('wide', scaled(p['tight'], 3, *im.size))):
        x, y, w, h = rect
        c = im.crop((x, y, x + w, y + h))
        k = min(1, 256 / h)
        if k < 1:
            c = c.resize((round(w * k), round(h * k)), Image.BILINEAR)
        r, g, b = c.split()
        gray = bytes(((77 * rr + 150 * gg + 29 * bb) >> 8) for rr, gg, bb in zip(r.tobytes(), g.tobytes(), b.tobytes()))
        with open(os.path.join(out, f"{p['id']}-{name}.pgm"), 'wb') as f:
            f.write(b'P5\n%d %d\n255\n' % c.size + gray)
        c.save(os.path.join(out, f"{p['id']}-{name}.png"))
print('ok')

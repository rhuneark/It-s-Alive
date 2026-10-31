"""The pixel UI's frames: tiny 9-slice PNGs in src/assets/ui, scaled 3x by CSS (border-image).

Each frame is rings of colour from the outside in (outline, bevel, ...) around a flat body, with
stepped corners (the outline turns each corner one pixel in). A ring has a top/left colour and a
bottom/right colour, so a light top/left and a dark bottom/right make a raised bevel, and the
reverse an inset well. `slice` is how many rings the CSS keeps unstretched (border-image-slice).

    python3 tools/art/ui_frames.py
"""
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[2] / 'src' / 'assets' / 'ui'


def hx(s, a=255):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def frame(name, slice_, rings):
    """rings: [(top/left, bottom/right), ...] from the outside in, then the body colour."""
    n = slice_ * 2 + 3
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    p = im.load()
    body = rings[-1]
    for y in range(n):
        for x in range(n):
            d = min(x, y, n - 1 - x, n - 1 - y)
            dx = min(x, n - 1 - x)
            dy = min(y, n - 1 - y)
            if dx == 0 and dy == 0:
                continue  # the stepped corner
            if d >= slice_ or d >= len(rings) - 1:
                p[x, y] = body
                continue
            tl, br = rings[d]
            if d == 1 and dx == 1 and dy == 1:
                p[x, y] = rings[0][0]  # the outline's step
                continue
            bottom_or_right = (y > n - 1 - y and dy == d) or (x > n - 1 - x and dx == d)
            top_edge = y < n - 1 - y and dy == d
            p[x, y] = br if bottom_or_right and not top_edge else tl
    OUT.mkdir(parents=True, exist_ok=True)
    im.save(OUT / f'{name}.png')


O = hx('#060208')
# Buttons and tiles (slice 3: 9px): outline, bevel, inner bevel, body.
frame('btn-red', 3, [(hx('#1c0306'), hx('#1c0306')), (hx('#ff8a72'), hx('#5a0610')),
                     (hx('#c41e2e'), hx('#7d0b17')), hx('#b3172a')])
frame('btn-dark', 3, [(O, O), (hx('#7d6890'), hx('#100a16')), (hx('#352944'), hx('#1d1527')),
                      hx('#2e2340')])
frame('btn-gold', 3, [(hx('#1e1000'), hx('#1e1000')), (hx('#fff2b0'), hx('#6e4600')),
                      (hx('#e3b030'), hx('#a06a00')), hx('#d29a1c')])
frame('tile-red', 3, [(hx('#1c0306'), hx('#1c0306')), (hx('#ff6f5a'), hx('#3a040b')),
                      (hx('#8e1220'), hx('#550812')), hx('#6e0d18')])
frame('tile-violet', 3, [(O, O), (hx('#c39cff'), hx('#140b24')), (hx('#4a2f78'), hx('#26173f')),
                         hx('#36225a')])
frame('pick-on', 3, [(hx('#1e1000'), hx('#1e1000')), (hx('#ffe28a'), hx('#8a5a00')),
                     (hx('#3d2a12'), hx('#2a1c0a')), hx('#33240f')])
# Panels (slice 4: 12px): outline, plum rim, a dark gap, body.
frame('panel', 4, [(hx('#000000'), hx('#000000')), (hx('#7a5c84'), hx('#3c2a44')),
                   (hx('#0b060e', 245), hx('#0b060e', 245)),
                   (hx('#1c1222', 245), hx('#1c1222', 245)), hx('#170f1c', 242)])
# Wells and rows (slice 2: 6px): outline, then an inset bevel.
frame('well', 2, [(hx('#050206'), hx('#050206')), (hx('#0c0712', 235), hx('#3d2e48', 235)),
                  hx('#1e1527', 235)])
frame('well-gold', 2, [(hx('#1e1000'), hx('#1e1000')), (hx('#6e4600'), hx('#fff2b0')),
                       hx('#c99420')])

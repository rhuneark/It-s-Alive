"""Turn picked raw PixelLab sprites into shipped assets.

- art/picks.json maps option id -> candidate file name in art/raw/ (git-ignored). The chosen
  candidate is copied to art/picked/<id>.png, which IS committed, so the shipped art can be
  rebuilt without the raw candidates.
- alpha is made binary, sprites are cropped to their content
- every sprite is quantized (no dithering) to ONE shared palette, so parts that were
  generated separately still look like they belong to the same monster
- output: public/art/parts/<id>.png (sized for the monster), public/art/icons/<id>.png
  (full-size, for option cards) and src/game/sprites.json ({id: {w, h, a, ...sockets}}: size
  plus the attachment points from anchors.py, which src/game/layout.ts sews together)

Usage: python3 tools/art/process.py
"""
import json
import os
import shutil
import sys

from PIL import Image, ImageEnhance

sys.path.insert(0, os.path.dirname(__file__))
from anchors import points_for  # noqa: E402
from prompts import PARTS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "art", "raw")
PICKED = os.path.join(ROOT, "art", "picked")
OUT = os.path.join(ROOT, "public", "art", "parts")
ICONS = os.path.join(ROOT, "public", "art", "icons")
META = os.path.join(ROOT, "src", "game", "sprites.json")
PICKS = os.path.join(ROOT, "art", "picks.json")
PALETTE_OUT = os.path.join(ROOT, "art", "palette.png")
PALETTE_SIZE = 64
# Largest size (w, h) a part may have on the 160x224 monster canvas, by slot.
# Bigger sprites are scaled down to fit so overlays never bury the torso.
MAX_BOX = {
    "head": (46, 52),
    "head2": (26, 28),
    "eye": (13, 13),
    "heart": (17, 17),
    "maw": (24, 16),
    "hide": (16, 16),
    "jaw": (26, 18),
    "brain": (24, 15),
    "horns": (52, 26),
    "ear": (17, 21),
    "spine": (100, 44),
    "spark": (32, 32),
}


# Props set into the 240x224 laboratory (art/picks.json -> art/raw), drawn in order:
# (id, left x, bottom y). The monster's rack stands in the middle, so props keep to the sides.
SCENE = [
    ("prop_jars", 158, 198),
    ("prop_cart", 2, 222),
    ("prop_coil", 192, 222),
]
SCENE_COLORS = 64
PROP_LIFT = 1.35

# Sprites turned before use (degrees, counter-clockwise): the rat tail was drawn standing up,
# and third arms lean out so they reach past the head instead of hiding behind it.
ROTATE = {"tail_rat": -90, **{p: 30 for p in PARTS if PARTS[p][0] == "arm3"}}


def rotate(im, degrees, k=8):
    """Turn pixel art without smearing it: rotate an 8x nearest-neighbour blow-up, shrink back."""
    big = im.resize((im.width * k, im.height * k), Image.NEAREST)
    big = big.rotate(degrees, resample=Image.NEAREST, expand=True)
    return crop(binarize(big.resize((big.width // k, big.height // k), Image.NEAREST)))


def load_pick(part_id, picks):
    name = picks.get(part_id, f"{part_id}__11.png")
    raw = os.path.join(RAW, name)
    picked = os.path.join(PICKED, f"{part_id}.png")
    if os.path.exists(raw):
        os.makedirs(PICKED, exist_ok=True)
        shutil.copyfile(raw, picked)
    if not os.path.exists(picked):
        raise FileNotFoundError(f"{part_id}: missing {name}")
    return Image.open(picked).convert("RGBA")


def binarize(im):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return im


def crop(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def shrink(im, factor):
    w, h = max(1, round(im.width * factor)), max(1, round(im.height * factor))
    return binarize(im.resize((w, h), Image.LANCZOS))


def build_palette(images):
    pixels = []
    for im in images:
        for r, g, b, a in getattr(im, "get_flattened_data", im.getdata)():
            if a:
                pixels.append((r, g, b))
    strip = Image.new("RGB", (len(pixels), 1))
    strip.putdata(pixels)
    pal = strip.quantize(colors=PALETTE_SIZE, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return pal


def apply_palette(im, pal):
    rgb = im.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(rgb, (0, 0), im.split()[3])
    return out


def main():
    picks = json.load(open(PICKS)) if os.path.exists(PICKS) else {}
    sprites = {}
    icons = {}
    for part_id in PARTS:
        im = crop(binarize(load_pick(part_id, picks)))
        if part_id in ROTATE:
            im = rotate(im, ROTATE[part_id])
        icons[part_id] = im
        box = MAX_BOX.get(PARTS[part_id][0])
        if box:
            factor = min(1.0, box[0] / im.width, box[1] / im.height)
            if factor < 1.0:
                im = crop(shrink(im, factor))
        sprites[part_id] = im
    pal = build_palette(sprites.values())
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(ICONS, exist_ok=True)
    for part_id, im in icons.items():
        apply_palette(im, pal).save(os.path.join(ICONS, f"{part_id}.png"), optimize=True)
    pal_img = pal.convert("RGB").resize((PALETTE_SIZE, 1))
    pal_img.save(PALETTE_OUT)
    meta = {}
    for part_id, im in sprites.items():
        q = apply_palette(im, pal)
        q.save(os.path.join(OUT, f"{part_id}.png"), optimize=True)
        meta[part_id] = {"w": q.width, "h": q.height, **points_for(part_id, PARTS[part_id][0], q)}
    with open(META, "w") as f:
        rows = [f'  "{k}": {json.dumps(v, separators=(", ", ": "))}' for k, v in sorted(meta.items())]
        f.write("{\n" + ",\n".join(rows) + "\n}\n")
    # The laboratory: the wide room with its props set on the floor, on its own palette.
    scene = load_pick("bg_lab", picks).convert("RGBA")
    for prop_id, x, bottom in SCENE:
        prop = crop(binarize(load_pick(prop_id, picks)))
        # lifted a little: the page dims the whole room behind the monster
        rgb = ImageEnhance.Brightness(prop.convert("RGB")).enhance(PROP_LIFT)
        prop = Image.merge("RGBA", (*rgb.split(), prop.split()[3]))
        scene.alpha_composite(prop, (x, bottom - prop.height))
    scene.convert("RGB").quantize(
        colors=SCENE_COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
    ).save(os.path.join(ROOT, "public", "art", "lab.png"), optimize=True)
    total = sum(os.path.getsize(os.path.join(OUT, f"{p}.png")) for p in meta)
    print(f"{len(meta)} sprites, {total / 1024:.1f} KB, palette {PALETTE_SIZE} colors")


if __name__ == "__main__":
    main()

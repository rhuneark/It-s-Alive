"""Turn picked raw PixelLab sprites into shipped assets.

- art/picks.json maps option id -> candidate file name in art/raw/ (git-ignored). The chosen
  candidate is copied to art/picked/<id>.png, which IS committed, so the shipped art can be
  rebuilt without the raw candidates.
- alpha is made binary, sprites are cropped to their content
- every sprite is quantized (no dithering) to ONE shared palette, so parts that were
  generated separately still look like they belong to the same monster
- output: public/art/parts/<id>.png (sized for the monster), public/art/icons/<id>.png
  (full-size, for option cards) and src/game/sprites.json ({id: [w, h]})

Usage: python3 tools/art/process.py
"""
import json
import os
import shutil
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
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
    "ear": (14, 18),
    "spine": (80, 40),
    "spark": (32, 32),
}


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
        meta[part_id] = [q.width, q.height]
    with open(META, "w") as f:
        rows = [f'  "{k}": [{w}, {h}]' for k, (w, h) in sorted(meta.items())]
        f.write("{\n" + ",\n".join(rows) + "\n}\n")
    # The laboratory background gets its own palette (it is mostly stone and storm).
    bg = load_pick("bg_lab", picks).convert("RGB")
    bg.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(
        os.path.join(ROOT, "public", "art", "lab.png"), optimize=True
    )
    total = sum(os.path.getsize(os.path.join(OUT, f"{p}.png")) for p in meta)
    print(f"{len(meta)} sprites, {total / 1024:.1f} KB, palette {PALETTE_SIZE} colors")


if __name__ == "__main__":
    main()

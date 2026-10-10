"""Turn the picked husk, part paintings and room into shipped assets.

- art/picks.json maps a key (option id, or "<option>@<base>" for add-ons painted onto one
  particular head/torso/leg) to its candidate in art/raw/ (git-ignored). The chosen candidate is
  copied to art/picked/<key>.png, which IS committed, so assets can be rebuilt without art/raw.
- every candidate is a full 224x200 scene image (see husk.py); its layer is the candidate cut to
  the slot's mask and cropped. Husk regions are cut the same way.
- all layers share ONE palette, so parts painted in separate jobs still match.
- output: public/art/husk/<region>.png, public/art/parts/<key>.png (layers, which double as the
  option-card icons), public/art/icons/spark_*.png (the spark has no layer), public/art/lab.png,
  and src/game/layers.json ({husk|parts: {key: [x, y, w, h]}}).

Usage: python3 tools/art/process.py
"""
import json
import os
import shutil
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import husk  # noqa: E402

ROOT = husk.ROOT
RAW, PICKED = husk.RAW, husk.PICKED
OUT = os.path.join(ROOT, "public", "art")
META = os.path.join(ROOT, "src", "game", "layers.json")
PALETTE_SIZE = 256
SCENE_COLORS = 64


def load_pick(key, picks):
    raw = os.path.join(RAW, picks.get(key, ""))
    picked = os.path.join(PICKED, f"{key}.png")
    if picks.get(key) and os.path.exists(raw):
        shutil.copyfile(raw, picked)
    if not os.path.exists(picked):
        raise FileNotFoundError(f"{key}: no picked image (art/picks.json -> art/raw/)")
    return Image.open(picked).convert("RGBA")


def binarize(im):
    a = im.split()[3].point(lambda v: 255 if v >= 128 else 0)
    out = im.copy()
    out.putalpha(a)
    return out


def rooted(layer, anchor, reach=2, min_blob=8):
    """Keep only the pieces of `layer` that touch `anchor` (within `reach` px): nothing floats."""
    from PIL import ImageFilter

    near = anchor.filter(ImageFilter.MaxFilter(reach * 2 + 1)).load()
    a = layer.split()[3].load()
    w, h = layer.size
    seen = set()
    keep = Image.new("L", layer.size, 0)
    kp = keep.load()
    for y in range(h):
        for x in range(w):
            if a[x, y] < 128 or (x, y) in seen:
                continue
            blob, stack, touches = [], [(x, y)], False
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                blob.append((cx, cy))
                touches = touches or near[cx, cy] > 0
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and a[nx, ny] >= 128:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if touches and len(blob) >= min_blob:
                for bx, by in blob:
                    kp[bx, by] = 255
    out = layer.copy()
    out.putalpha(keep)
    return out


# An add-on pixel lying on its base must differ from the base by more than this (sum of RGB
# differences), or it is the edit model's re-rendering of the base (a greyer croc, a shifted wig).
STRONG = 110


def only_new(layer, base_img):
    """Drop add-on pixels that merely repaint the base underneath them."""
    out = layer.copy()
    a, lp, bp = out.split()[3].load(), layer.load(), base_img.load()
    w, h = layer.size
    for y in range(h):
        for x in range(w):
            if a[x, y] and bp[x, y][3] >= 128:
                if sum(abs(c - d) for c, d in zip(lp[x, y][:3], bp[x, y][:3])) <= STRONG:
                    a[x, y] = 0
    return out


def all_keys():
    """Every layer the game can show: husk regions, replacements, add-ons (per base where needed)."""
    keys = []
    for slot, ids in husk.catalog():
        if slot == "spark":
            continue
        base_slot = husk.BASE_OF.get(slot)
        for oid in ids:
            if base_slot:
                keys += [(slot, oid, b) for b in husk.options(base_slot)]
            else:
                keys.append((slot, oid, None))
    return keys


def autopick(picks):
    """Keys without a pick take their first candidate in art/raw (review sheets, then override)."""
    for slot, oid, base in all_keys():
        key = husk.key(oid, base)
        if key in picks:
            continue
        found = sorted(f for f in os.listdir(RAW) if f.startswith(f"{key}__") and f[len(key) + 2] in "ie")
        if found:
            picks[key] = found[0]
    return picks


def main(partial=False):
    picks = json.load(open(husk.PICKS))
    if partial:
        picks = autopick(picks)
    R = husk.regions()
    layers = {}  # name -> (scene-sized RGBA layer)
    whole = husk.husk()
    for region in husk.REGIONS:
        layers[f"husk/{region}"] = husk.cut(whole, R[region])
    base_masks = {}
    body = husk.union(*R.values())
    for slot, oid, base in all_keys():
        key = husk.key(oid, base)
        try:
            img = load_pick(key, picks)
        except FileNotFoundError:
            if not partial:
                raise
            continue
        bm = None
        if base:
            if base not in base_masks:
                base_masks[base] = husk.solid(
                    husk.cut(load_pick(base, picks), husk.mask_for(husk.slot_of(base), R))
                )
            bm = base_masks[base].split()[3]
        lay = binarize(husk.cut(husk.placed(slot, img), husk.mask_for(slot, R, bm)))
        if base:
            lay = only_new(lay, base_masks[base])
        # what it must grow from: its base part, or the husk body for parts behind / replacing it
        anchor = body if bm is None else bm
        if slot == "head2":  # it grows from the shoulder, which may be torso or arm
            anchor = husk.union(bm, R["armL"], R["armR"])
        layers[f"parts/{key}"] = rooted(lay, anchor)

    # one palette for every layer
    strip_px = []
    for im in layers.values():
        strip_px += [p[:3] for p in getattr(im, "get_flattened_data", im.getdata)() if p[3]]
    strip = Image.new("RGB", (len(strip_px), 1))
    strip.putdata(strip_px)
    pal = strip.quantize(colors=PALETTE_SIZE, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)

    def quantize(im):
        rgb = im.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
        out = Image.new("RGBA", im.size, (0, 0, 0, 0))
        out.paste(rgb, (0, 0), im.split()[3])
        return out

    for sub in ("husk", "parts", "icons"):  # empty, don't delete: a running dev server keeps serving
        d = os.path.join(OUT, sub)
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))
    meta = {"husk": {}, "parts": {}}
    total = 0
    for name, im in layers.items():
        box = im.getbbox()
        if not box:
            if partial:
                print(f"skipped {name}: nothing attached")
                continue
            raise ValueError(f"{name}: empty layer (nothing in it touches its base)")
        crop = quantize(im.crop(box))
        path = os.path.join(OUT, f"{name}.png")
        crop.save(path, optimize=True)
        total += os.path.getsize(path)
        group, key = name.split("/", 1)
        meta[group][key] = [box[0], box[1], box[2] - box[0], box[3] - box[1]]

    # the spark is an effect, not a layer: its option cards keep a small icon
    for oid in husk.options("spark"):
        im = binarize(load_pick(oid, picks))
        im = quantize(im.crop(im.getbbox()))
        im.save(os.path.join(OUT, "icons", f"{oid}.png"), optimize=True)

    with open(META, "w") as f:
        f.write("{\n")
        groups = []
        for group in ("husk", "parts"):
            rows = [f'    "{k}": {json.dumps(v)}' for k, v in sorted(meta[group].items())]
            groups.append(f'  "{group}": {{\n' + ",\n".join(rows) + "\n  }")
        f.write(",\n".join(groups) + "\n}\n")

    # the laboratory: the room with its props painted in, on its own palette
    room = load_pick("bg_lab", picks).convert("RGB")
    room.quantize(colors=SCENE_COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(
        os.path.join(OUT, "lab.png"), optimize=True
    )
    print(f"{len(layers)} layers, {total / 1024:.1f} KB, palette {PALETTE_SIZE} colours")


if __name__ == "__main__":
    main(partial="--partial" in sys.argv)

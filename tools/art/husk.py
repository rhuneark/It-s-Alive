"""The monster is one human husk with parts painted into it (PixelLab inpainting).

Day 1 shows the whole husk. Each night's winning part is painted INTO the husk
(or onto the chosen head / torso) by inpaint-v3, so every part shares the husk's
scale, pose, light and outline instead of being a separate sprite pasted on.

Everything lives in one coordinate system: the 224x200 laboratory scene, with
the husk standing at HUSK_AT on the floor line. A part's layer is the inpainted
image cut to the part's mask, cropped, and placed back at its scene offset.

    python3 tools/art/husk.py regions                 # debug image of the husk regions and masks
    python3 tools/art/husk.py gen <slot> [ids] [--on base,base] [--seed N]
    python3 tools/art/husk.py sheet <slot> out.png    # contact sheet of candidates
"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "art", "raw")
PICKED = os.path.join(ROOT, "art", "picked")
SCENE = (224, 200)
HUSK_AT = (60, 26)  # husk.png's top-left in the scene; its feet land on FLOOR_Y
FLOOR_Y = 192

REGIONS = ["head", "torso", "loincloth", "armR", "armL", "legR", "legL"]


def husk():
    im = Image.open(os.path.join(PICKED, "husk.png")).convert("RGBA")
    out = Image.new("RGBA", SCENE, (0, 0, 0, 0))
    out.alpha_composite(im, HUSK_AT)
    return out


def _dark(p):
    r, g, b, a = p
    return a > 127 and max(r, g, b) < 100


def region_of(x, y, px):
    """Region of an opaque husk pixel, in husk.png coordinates (see the ASCII map in the docs)."""
    if y <= 41:
        return "head"
    if y <= 62:
        if x <= 37:
            return "armR"
        if x >= 67:
            return "armL"
        return "torso"
    if y <= 92:
        if x <= 35:
            return "armR"
        if x >= 71:
            return "armL"
        return "loincloth" if y >= 84 else "torso"
    # below the belt: hands outside (down to the fingertips), legs inside, the flap between
    if y <= 114 and x <= 30:
        return "armR"
    if y <= 114 and x >= 74:
        return "armL"
    if y <= 120 and _flap(x, y, px):
        return "loincloth"
    return "legR" if x < 52 else "legL"


def _flap(x, y, px):
    """Dark cloth (and the outline right against it) hanging between the thighs."""
    if _dark(px[x, y]) and not (px[x, y][0] < 20 and px[x, y][1] < 20):
        return True
    if px[x, y][0] < 20:  # black outline: cloth if it touches cloth
        for dx in (-1, 1):
            q = px[x + dx, y]
            if _dark(q) and q[0] >= 20:
                return True
    return False


def regions():
    """{region: L mask} in scene coordinates."""
    im = Image.open(os.path.join(PICKED, "husk.png")).convert("RGBA")
    px = im.load()
    masks = {r: Image.new("L", SCENE, 0) for r in REGIONS}
    draws = {r: masks[r].load() for r in REGIONS}
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] > 127:
                draws[region_of(x, y, px)][x + HUSK_AT[0], y + HUSK_AT[1]] = 255
    return masks


def dilate(m, r):
    return m.filter(ImageFilter.MaxFilter(r * 2 + 1)) if r > 0 else m


def union(*ms):
    out = Image.new("L", SCENE, 0)
    for m in ms:
        out = ImageChops.lighter(out, m)
    return out


def minus(a, b):
    return ImageChops.subtract(a, b)


def rect(x0, y0, x1, y1):
    m = Image.new("L", SCENE, 0)
    ImageDraw.Draw(m).rectangle((x0, y0, x1, y1), fill=255)
    return m


def bbox(m):
    return m.getbbox()


# ---------------------------------------------------------------- catalog

_CATALOG = None


def catalog():
    """[(slot, [option ids])] in schedule order, read from src/game/catalog.ts."""
    global _CATALOG
    if _CATALOG is None:
        import subprocess

        js = subprocess.check_output(
            ["npx", "tsx", "-e",
             "import {QUESTIONS} from './src/game/catalog'; "
             "console.log(JSON.stringify(QUESTIONS.map(q => [q.slot, q.options.map(o => o.id)])))"],
            cwd=ROOT, text=True)
        _CATALOG = [tuple(x) for x in json.loads(js)]
    return _CATALOG


def slot_of(option_id):
    for slot, ids in catalog():
        if option_id in ids:
            return slot
    raise KeyError(option_id)


def options(slot):
    return dict(catalog())[slot]


# ---------------------------------------------------------------- masks

REPLACED = ["head", "torso", "armR", "armL", "legR", "legL"]
STYLE = "dark gothic horror pixel art, black outline, muted colors"

# What each slot paints, in the husk's context. {d} = the option's description (prompts.PARTS).
TEMPLATES = {
    "head": "{d}, sewn onto the neck of the stitched corpse with crude black stitches, facing the viewer",
    "torso": "the corpse's chest and belly are {d}, sewn to the neck, shoulders and waist with crude black stitches",
    "armR": "the arm on the left of the picture is {d}, hanging down, sewn on at the shoulder with crude black stitches",
    "armL": "the arm on the right of the picture is {d}, hanging down, sewn on at the shoulder with crude black stitches",
    "legR": "the leg on the left of the picture is {d}, standing on the floor, sewn on at the hip with crude black stitches",
    "legL": "the leg on the right of the picture is {d}, standing on the floor, sewn on at the hip with crude black stitches",
    "browEye": "a third eye in the middle of the forehead: {d}, sewn in with tiny black stitches",
    "chestEye": "{d} sewn into the left side of the chest with black stitches",
    "heart": "an open stitched wound in the right side of the chest showing {d}",
    "maw": "{d} gaping in the middle of the belly, ringed with black stitches",
    "horns": "{d} growing out of the top of the head",
    "ears": "{d}, one on each side of the head, sewn on with black stitches",
    "jaw": "{d} hanging from the chin",
    "brain": "the top of the skull is cut open showing {d}, ringed with black stitches",
    "head2": "a second smaller head, {d}, growing out of the right shoulder on a short stitched neck",
    "arm3": "a third arm, {d}, growing out of the back behind the left shoulder and reaching up into the air",
    "wings": "{d} spread wide behind the body",
    "spine": "{d} sprouting from the back behind the shoulders and neck",
    "tail": "{d} growing from behind the hips and curling out to the right side",
    "hide": "a square patch of {d} sewn onto the shin of the leg on the left of the picture with black stitches",
}

# Which picked part each add-on is painted onto (its layer only fits that base).
BASE_OF = {
    "browEye": "head", "horns": "head", "ears": "head", "jaw": "head", "brain": "head",
    "chestEye": "torso", "heart": "torso", "maw": "torso", "head2": "torso",
    "hide": "legR",
}

# Draw order, back to front. Behind-the-body parts first; the loincloth ties the waist.
Z = {
    "wings": 0, "arm3": 1, "spine": 2, "tail": 3, "legR": 4, "legL": 4, "hide": 5, "torso": 6,
    "chestEye": 7, "maw": 8, "heart": 9, "loincloth": 10, "armR": 11, "armL": 11, "head": 12,
    "ears": 13, "horns": 14, "brain": 15, "jaw": 16, "browEye": 17, "head2": 18,
}


def _body(R, *names):
    return union(*[R[n] for n in names]) if names else Image.new("L", SCENE, 0)


def mask_for(slot, R, base=None):
    """Where `slot` may be painted. `base` = the base part's layer mask (head/torso/leg it sits on)."""
    every = _body(R, *REGIONS)
    b = {n: R[n].getbbox() for n in REGIONS}
    if slot == "head":
        x0, y0, x1, y1 = b["head"]
        return minus(rect(x0 - 14, 2, x1 + 13, y1 - 1), _body(R, "torso", "armR", "armL"))
    if slot == "torso":
        return minus(dilate(R["torso"], 6), _body(R, "head", "armR", "armL", "loincloth", "legR", "legL"))
    if slot in ("armR", "armL"):
        x0, y0, x1, y1 = b[slot]
        area = rect(x0 - 30, y0 - 2, x1, y1 + 24) if slot == "armR" else rect(x0 - 1, y0 - 2, x1 + 29, y1 + 24)
        other = "armL" if slot == "armR" else "armR"
        return minus(area, _body(R, "head", "torso", "loincloth", "legR", "legL", other))
    if slot in ("legR", "legL"):
        x0, y0, x1, y1 = b[slot]
        area = rect(x0 - 10, y0 - 2, 110, FLOOR_Y - 1) if slot == "legR" else rect(113, y0 - 2, x1 + 9, FLOOR_Y - 1)
        other = "legL" if slot == "legR" else "legR"
        return minus(area, _body(R, "head", "torso", "loincloth", "armR", "armL", other))
    hb = (base or R["head"]).getbbox()
    hx = (hb[0] + hb[2]) // 2
    if slot == "browEye":  # the forehead: below a wig's crown, above the eyes
        return rect(hx - 9, hb[1] + 4, hx + 9, hb[1] + (hb[3] - hb[1]) * 3 // 5)
    if slot == "horns":
        return rect(hb[0] - 16, hb[1] - 24, hb[2] + 15, hb[1] + 8)
    if slot == "brain":
        return rect(hx - 13, hb[1] - 8, hx + 13, hb[1] + 10)
    if slot == "ears":
        # beside the head at ear height (a mummy's wraps or a wig can be wider lower down)
        ey = hb[1] + (hb[3] - hb[1]) * 2 // 5
        band = (base or R["head"]).crop((0, ey - 4, SCENE[0], ey + 5)).getbbox()
        l, r = (band[0], band[2]) if band else (hb[0], hb[2])
        return union(rect(l - 15, ey - 18, l + 6, ey + 22), rect(r - 7, ey - 18, r + 14, ey + 22))
    if slot == "jaw":
        return rect(hx - 11, hb[3] - 14, hx + 11, hb[3] + 10)
    # chest add-ons: the edit model picks the side itself, so the whole upper chest is allowed
    if slot == "chestEye":
        return rect(97, 69, 131, 93)
    if slot == "heart":
        return rect(97, 69, 131, 97)
    if slot == "maw":
        return rect(98, 86, 128, 112)
    if slot == "head2":
        return minus(rect(126, 40, 154, 74), _body(R, "head"))
    if slot == "hide":
        lb = (base or R["legR"]).getbbox()
        lx = (lb[0] + lb[2]) // 2 - 2
        return rect(lx - 9, 150, lx + 9, 170)
    if slot == "arm3":
        return minus(rect(58, 14, 100, 80), _body(R, "head", "torso", "armR"))
    if slot == "wings":
        return minus(rect(18, 20, 206, 154), every)
    if slot == "spine":
        return minus(rect(66, 16, 158, 80), every)
    if slot == "tail":
        return minus(rect(118, 90, 216, 196), every)
    raise KeyError(slot)


# ---------------------------------------------------------------- layers and bases

PICKS = os.path.join(ROOT, "art", "picks.json")


def key(option_id, base=None):
    return f"{option_id}@{base}" if base else option_id


def cut(img, mask):
    """img (scene-sized RGBA) limited to mask."""
    out = img.copy()
    out.putalpha(ImageChops.multiply(img.split()[3], mask))
    return out


# Add-ons the edit model always paints on the same side as another (the heart): mirror them
# across the body's centre line so they sit on the other side. The husk is centred on x = 111.5.
MIRROR = {"chestEye"}


def placed(slot, img):
    """A candidate as it is shown: mirrored for MIRROR slots."""
    return img.transpose(Image.FLIP_LEFT_RIGHT) if slot in MIRROR else img


def husk_piece(region, R):
    return cut(husk(), R[region])


def picked(option_id, base=None):
    """The chosen inpainted image for an option (scene-sized), from art/picked/."""
    path = os.path.join(PICKED, f"{key(option_id, base)}.png")
    return Image.open(path).convert("RGBA")


def solid(img):
    """Alpha made all-or-nothing: faint edge pixels from the generator must not widen a layer."""
    out = img.copy()
    out.putalpha(img.split()[3].point(lambda v: 255 if v >= 128 else 0))
    return out


def layer_of(option_id, R, base=None, base_mask=None):
    slot = slot_of(option_id)
    return solid(cut(picked(option_id, base), mask_for(slot, R, base_mask)))


def compose(parts, R):
    """Scene image of the husk with `parts` ({slot: option id}) painted in, back to front."""
    out = Image.new("RGBA", SCENE, (0, 0, 0, 0))
    items = [(Z[r], "husk", r) for r in REGIONS if r not in parts]
    for slot, oid in parts.items():
        items.append((Z[slot], "part", slot))
    for _, kind, name in sorted(items, key=lambda t: t[0]):
        if kind == "husk":
            out.alpha_composite(husk_piece(name, R))
        else:
            out.alpha_composite(layer_of(parts[name], R))
    return out


def window_of(mask, margin=28):
    x0, y0, x1, y1 = mask.getbbox()
    x0, y0 = max(0, x0 - margin), max(0, y0 - margin)
    x1, y1 = min(SCENE[0], x1 + margin), min(SCENE[1], y1 + margin)
    if x1 - x0 < 32:
        x1 = min(SCENE[0], x0 + 32)
    if y1 - y0 < 32:
        y1 = min(SCENE[1], y0 + 32)
    return x0, y0, x1, y1


# Painting area for options whose shape otherwise fills the whole mask (ellipse box).
WING_OVAL = (20, 22, 204, 152)
OVAL = {
    **{w: WING_OVAL for w in ("wings_angel", "wings_bat", "wings_raven")},
    "wings_moth": (28, 26, 196, 148),
    "wings_dragonfly": (28, 26, 196, 148),
    "spine_quills": (68, 18, 156, 96),
    "spine_tentacles": (68, 18, 156, 96),
    "tail_croc": (118, 92, 214, 200),
    "tail_scorpion": (118, 90, 214, 200),
}


# Areas an option must not paint into when generated (x0, y0, x1, y1).
KEEP_CLEAR = {"spine_shark": (84, 0, 142, 80)}


def generate(option_id, base=None, seed=7, lite=False):
    import pixellab
    from prompts import PARTS

    R = regions()
    slot = slot_of(option_id)
    if base:
        base_slot = BASE_OF[slot]
        image = compose({base_slot: base}, R)
        base_mask = layer_of(base, R).split()[3]
    else:
        image, base_mask = compose({}, R), None
    mask = mask_for(slot, R, base_mask)
    if option_id in KEEP_CLEAR:  # a narrow shape would hide behind the head: paint it beside
        mask = minus(mask, rect(*KEEP_CLEAR[option_id]))
    if option_id in OVAL:  # broad shapes fill a box to its edges; an oval leaves round tips
        oval = Image.new("L", SCENE, 0)
        ImageDraw.Draw(oval).ellipse(OVAL[option_id], fill=255)
        mask = ImageChops.multiply(mask, oval)
    win = window_of(mask)
    desc = f"{TEMPLATES[slot].format(d=PARTS[option_id][1])}. {STYLE}"
    if lite:  # /inpaint: 1 generation instead of ~9, a little rougher
        img = pixellab.inpaint_lite(desc, image.crop(win), mask.crop(win), seed=seed)
    else:
        img = pixellab.inpaint(desc, image.crop(win), mask.crop(win), seed=seed)[0]
    out = Image.new("RGBA", SCENE, (0, 0, 0, 0))
    out.alpha_composite(img.convert("RGBA"), win[:2])
    name = f"{key(option_id, base)}__{'l' if lite else 'i'}{seed}.png"
    out.save(os.path.join(RAW, name))
    return name


# ---------------------------------------------------------------- batch edits (add-ons on every base)

# Add-ons that depend on their base are made with edit-images-v2: one job paints the option onto
# all five bases at once (about 10 generations instead of 45), then only what the edit ADDED
# (new or clearly changed pixels inside the slot's mask) is kept, so the base keeps its own colours.
EDITS = {
    "browEye": "add a third eye in the middle of the forehead: {d}, sewn in with tiny black stitches",
    "horns": "add {d} growing out of the top of the head",
    "ears": "add two large {d} sticking far out from the left and right sides of the head, clearly visible, "
            "sewn on with black stitches",
    "jaw": "add {d} hanging down from the chin",
    "brain": "the top of the head is sawn off and {d} bulges out of the open skull, clearly visible, "
             "ringed with black stitches",
    "chestEye": "add {d} sewn into the upper chest with black stitches",
    "heart": "add an open stitched wound in the chest on the right of the picture showing {d}",
    "maw": "add {d} gaping in the middle of the belly, ringed with black stitches",
    "head2": "add a second small head, {d}, growing out of the shoulder on the right of the picture on a short stitched neck",
    "hide": "add a square patch of {d} sewn onto the shin with black stitches",
}


def edit_window(slot, base_mask):
    """64x64 crop (scene coords) that holds the base and room for the add-on."""
    b = base_mask.getbbox()
    cx = (b[0] + b[2]) // 2
    if slot in ("horns", "brain"):
        top = b[1] - 24
    elif slot in ("browEye", "ears"):
        top = b[1] - 12
    elif slot == "jaw":
        top = b[3] - 44
    elif slot in ("chestEye", "heart", "maw"):
        return (80, 60, 144, 124)
    elif slot == "head2":
        return (116, 22, 180, 86)
    elif slot == "hide":
        return (max(0, cx - 34), 136, max(0, cx - 34) + 64, 200)
    x0 = min(max(0, cx - 32), SCENE[0] - 64)
    y0 = min(max(0, top), SCENE[1] - 64)
    return (x0, y0, x0 + 64, y0 + 64)


def added(orig, edit, threshold=70, min_blob=6):
    """Pixels the edit added: opaque where the original was empty, or clearly recoloured."""
    o, e = orig.load(), edit.load()
    w, h = orig.size
    on = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if e[x, y][3] < 128:
                continue
            if o[x, y][3] < 128 or sum(abs(a - b) for a, b in zip(o[x, y][:3], e[x, y][:3])) > threshold:
                on[y][x] = True
    seen = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if on[y][x] and not seen[y][x]:
                blob, stack = [], [(x, y)]
                seen[y][x] = True
                while stack:
                    cx, cy = stack.pop()
                    blob.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and on[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                if len(blob) < min_blob:
                    for cx, cy in blob:
                        on[cy][cx] = False
    out = Image.new("RGBA", orig.size, (0, 0, 0, 0))
    po = out.load()
    for y in range(h):
        for x in range(w):
            if on[y][x]:
                po[x, y] = e[x, y]
    return out


def generate_edit(option_id, seed=7, only=None):
    """One edit job: the option painted onto every base of its slot. Saves one raw per base."""
    import pixellab
    from prompts import PARTS

    R = regions()
    slot = slot_of(option_id)
    bases = only or options(BASE_OF[slot])
    shots = []
    for base in bases:
        base_mask = layer_of(base, R).split()[3]
        image = compose({BASE_OF[slot]: base}, R)
        win = edit_window(slot, base_mask)
        shots.append((base, image, win, mask_for(slot, R, base_mask)))
    desc = (f"{EDITS[slot].format(d=PARTS[option_id][1])}, keep everything else exactly the same, "
            f"{STYLE}")
    outs = pixellab.edit_images(desc, [img.crop(win) for _, img, win, _ in shots], (64, 64), seed=seed)
    names = []
    os.makedirs(os.path.join(RAW, "edits"), exist_ok=True)
    for (base, image, win, mask), edited in zip(shots, outs):
        edited.save(os.path.join(RAW, "edits", f"{key(option_id, base)}__e{seed}.png"))  # for debugging
        lay = Image.new("RGBA", SCENE, (0, 0, 0, 0))
        lay.alpha_composite(added(image.crop(win), edited.convert("RGBA")), win[:2])
        name = f"{key(option_id, base)}__e{seed}.png"
        lay.save(os.path.join(RAW, name))  # cut to the slot mask later, in process.py
        names.append(name)
    return " ".join(names)


def sheet(names, out_path, scale=2, crop=None):
    """Each raw candidate shown in place on its base, side by side."""
    R = regions()
    tiles = []
    for name in names:
        oid, _, rest = name.partition("__")
        option_id, _, base = oid.partition("@")
        slot = slot_of(option_id)
        parts = {BASE_OF[slot]: base} if base else {}
        img = compose(parts, R)
        cand = placed(slot, Image.open(os.path.join(RAW, name)).convert("RGBA"))
        base_mask = layer_of(base, R).split()[3] if base else None
        lay = cut(cand, mask_for(slot, R, base_mask))
        if Z[slot] < 4:  # behind the body
            under = Image.new("RGBA", SCENE, (0, 0, 0, 0))
            under.alpha_composite(lay)
            under.alpha_composite(img)
            img = under
        else:
            img.alpha_composite(lay)
        bg = Image.new("RGBA", SCENE, (52, 48, 60, 255))
        bg.alpha_composite(img)
        if crop:
            bg = bg.crop(crop)
        tiles.append((name, bg.resize((bg.width * scale, bg.height * scale), Image.NEAREST)))
    w, h = tiles[0][1].size
    cols = min(len(tiles), 6)
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new("RGBA", (cols * (w + 4), rows * (h + 14)), (0, 0, 0, 255))
    d = ImageDraw.Draw(out)
    for i, (name, t) in enumerate(tiles):
        x, y = (i % cols) * (w + 4), (i // cols) * (h + 14)
        out.paste(t, (x, y + 14))
        d.text((x + 2, y + 1), name[:40], fill=(255, 255, 255, 255))
    out.save(out_path)


def main(argv):
    cmd = argv[0]
    if cmd == "gen":
        slot = argv[1]
        rest = [a for a in argv[2:] if not a.startswith("--")]
        flags = {}
        for a in argv[2:]:
            if a.startswith("--"):
                k, _, v = a[2:].partition("=")
                flags[k] = v or "1"
        ids = rest or options(slot)
        bases = flags.get("on", "").split(",") if flags.get("on") else [None]
        if flags.get("on") == "all":
            bases = only or options(BASE_OF[slot])
        seeds = [int(s) for s in flags.get("seed", "7").split(",")]
        lite = "lite" in flags
        jobs = [(i, b, s, lite) for i in ids for b in bases for s in seeds]
        with ThreadPoolExecutor(int(flags.get("par", "4"))) as ex:
            for name in ex.map(lambda j: _safe(generate, *j), jobs):
                print(name, flush=True)
    elif cmd == "edit":
        slot = argv[1]
        rest = [a for a in argv[2:] if not a.startswith("--")]
        seed = int(next((a[7:] for a in argv[2:] if a.startswith("--seed=")), "7"))
        only = next((a[5:].split(",") for a in argv[2:] if a.startswith("--on=")), None)
        ids = rest or options(slot)
        with ThreadPoolExecutor(3) as ex:
            for names in ex.map(lambda i: _safe(generate_edit, i, seed, only), ids):
                print(names, flush=True)
    elif cmd == "sheet":
        names = sorted(f for f in os.listdir(RAW)
                       if any(f.startswith(p) for p in argv[1].split(",")) and any(t in f for t in ("__i", "__e")))
        crop = tuple(int(v) for v in argv[3].split(",")) if len(argv) > 3 else None
        sheet(names, argv[2], crop=crop)
    elif cmd == "regions":
        print({r: m.getbbox() for r, m in regions().items()})


def _safe(fn, *a):
    try:
        return fn(*a)
    except Exception as e:  # keep the batch going; report and retry later
        return f"FAILED {a}: {e}"


if __name__ == "__main__":
    main(sys.argv[1:])

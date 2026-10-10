"""Attachment points for every processed sprite, written into src/game/sprites.json.

Each sprite gets "a": the pixel (in the unflipped sprite) that is sewn onto its host,
e.g. the top of an arm, the neck of a head, the cut end of a tail. Hosts also get their
sockets: a torso has neck, shoulders, hips, chest, belly and back points; a head has its
skull top, brow, mouth and the sides where ears go; a leg has a shin.

Most points come from the sprite's own pixels (so a narrow torso gets narrow shoulders).
Faces and tails differ too much for rules, so their points are set by hand in POINTS, as
fractions of the sprite's width and height.
"""

# Hand-placed points (fractions of width, height). Heads: brow = third-eye spot,
# mouth = where a jaw hangs, ear = row (fraction of height) where ears are sewn on.
# Tails: a = the cut end that is sewn to the lower back.
POINTS = {
    "head_croc": {"brow": (0.5, 0.17), "mouth": (0.5, 0.72), "ear": 0.28},
    "head_mummy": {"brow": (0.5, 0.18), "mouth": (0.5, 0.57), "ear": 0.33},
    "head_nobleman": {"brow": (0.5, 0.25), "mouth": (0.5, 0.67), "ear": 0.40},
    "head_raven": {"brow": (0.5, 0.2), "mouth": (0.5, 0.74), "ear": 0.33},
    "head_werewolf": {"brow": (0.5, 0.33), "mouth": (0.5, 0.86), "ear": 0.45},
    "horns_ram": {"a": (0.5, 0.15)},  # ram horns grow from the crown and curl down the sides
    "spine_shark": {"a": (0.8, 1.0)},  # the fin stands at the outer end of its base
    "tail_croc": {"a": (0.06, 0.7)},
    "tail_devil": {"a": (0.08, 0.72)},
    "tail_fox": {"a": (0.06, 0.9)},
    "tail_rat": {"a": (0.03, 0.5)},  # turned on its side by process.py (ROTATE)
    "tail_scorpion": {"a": (0.06, 0.82)},
}


def mask_of(im):
    alpha = im.split()[3].load()
    return [[alpha[x, y] > 127 for x in range(im.width)] for y in range(im.height)]


def _row_xs(m, y):
    y = max(0, min(len(m) - 1, y))
    return [x for x, on in enumerate(m[y]) if on]


def extent(m, y):
    """Leftmost and rightmost opaque x at row y (nearest non-empty row if y is empty)."""
    for dy in range(len(m)):
        for yy in (y - dy, y + dy):
            xs = _row_xs(m, yy) if 0 <= yy < len(m) else []
            if xs:
                return xs[0], xs[-1]
    return 0, len(m[0]) - 1


def mean_x(m, y0, y1):
    xs = [x for y in range(max(0, y0), min(len(m), y1 + 1)) for x in _row_xs(m, y)]
    return round(sum(xs) / len(xs)) if xs else len(m[0]) // 2


def first_row(m, x0, x1):
    for y, row in enumerate(m):
        if any(row[x] for x in range(max(0, x0), min(len(row), x1 + 1))):
            return y
    return 0


def last_row(m, x0, x1):
    for y in range(len(m) - 1, -1, -1):
        if any(m[y][x] for x in range(max(0, x0), min(len(m[y]), x1 + 1))):
            return y
    return len(m) - 1


def _frac(pt, w, h):
    return [round(pt[0] * (w - 1)), round(pt[1] * (h - 1))]


def points_for(part_id, kind, im):
    m = mask_of(im)
    w, h = im.width, im.height
    hand = POINTS.get(part_id, {})
    out = {}
    if kind == "torso":
        out["a"] = [w // 2, 0]
        out["neck"] = [mean_x(m, 0, 2), 0]
        # shoulders: the outermost stump in the upper 40%, so arms hang beside the
        # trunk instead of over a wide belly or chest
        top = range(3, round(h * 0.4))
        lmin = min(extent(m, y)[0] for y in top)
        rmax = max(extent(m, y)[1] for y in top)
        out["shoulderL"] = [lmin + 3, first_row(m, lmin + 3, lmin + 3)]
        out["shoulderR"] = [rmax - 3, first_row(m, rmax - 3, rmax - 3)]
        # hips: a quarter of the way in from the sides of the waist, never closer
        # together than a leg's width
        l, r = extent(m, h - 7)
        cx, half = (l + r) / 2, max(10, round((r - l) * 0.25))
        for name, x in (("hipL", round(cx - half)), ("hipR", round(cx + half))):
            out[name] = [x, last_row(m, x, x)]
        # chest eye and heart sit either side of the breastbone, clear of the arms
        yc = round(h * 0.3)
        l, r = extent(m, yc)
        cx, off = (l + r) / 2, max(7, round((r - l) * 0.17))
        out["chestL"] = [round(cx - off), yc]
        out["chestR"] = [round(cx + off), yc + 4]
        # belly: the row nearest 62% down that is wide enough to hold a mouth and
        # clear of the heart (a skeleton's waist is only a spine, so it moves to the pelvis)
        def room(y):  # narrowest width over the rows a mouth would cover
            return min(extent(m, yy)[1] - extent(m, yy)[0] for yy in range(y - 6, y + 7))

        rows = range(out["chestR"][1] + 14, h - 8)
        wide = [y for y in rows if room(y) >= 20]
        yl = min(wide, key=lambda y: abs(y - h * 0.62)) if wide else max(rows, key=room)
        out["belly"] = [mean_x(m, yl - 1, yl + 1), yl]
        yt = h - 14
        l, r = extent(m, yt)
        out["back"] = [r - 4, yt]
    elif kind == "head":
        out["a"] = [mean_x(m, h - 3, h - 1), h - 1]
        cx = w // 2
        out["top"] = [cx, first_row(m, cx - 2, cx + 2)]
        out["brow"] = _frac(hand["brow"], w, h)
        out["mouth"] = _frac(hand["mouth"], w, h)
        ye = round(hand["ear"] * (h - 1))
        l, r = extent(m, ye)
        out["earL"] = [l + 3, ye]
        out["earR"] = [r - 3, ye]
    elif kind in ("arm", "jaw"):
        out["a"] = [mean_x(m, 0, 3), 0]
    elif kind == "leg":
        out["a"] = [mean_x(m, 0, 3), 0]
        ys = round(h * 0.6)
        out["shin"] = [mean_x(m, ys - 1, ys + 1), ys]
    elif kind == "ear":
        # drawn pointing up and out: sewn on by the inner corner of its base
        xs = [x for y in range(h - 3, h) for x in _row_xs(m, y)]
        out["a"] = [max(xs) - 2, h - 2]
    elif kind in ("head2", "arm3", "brain", "horns", "spine"):
        out["a"] = [mean_x(m, h - 3, h - 1), h - 1]
    elif kind == "wings":
        out["a"] = [w // 2, round(h * 0.4)]
    else:  # eye, heart, maw, hide, spark: centred
        out["a"] = [w // 2, h // 2]
    if "a" in hand:
        out["a"] = _frac(hand["a"], w, h)
    return out

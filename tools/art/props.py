"""Village props for the rampage (PixelLab pixflux, low top-down, transparent).

    python3 tools/art/props.py gen [keys] [--seeds=7,21] [--par=6]   # -> art/raw/props/<key>__s<seed>.png
    python3 tools/art/props.py sheet out.png [keys]                  # review candidates
    python3 tools/art/props.py pick                                  # art/props.json picks -> public/art/props/

Each prop is ONE isolated object on a transparent background, so the game can place, sort and
smash it. Sizes here are the generated pixel size; the game's world size lives in src/game/rampage.
"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import pixellab as px  # noqa: E402

RAW = "art/raw/props"
OUT = "public/art/props"
PICKS = "art/props.json"

STYLE = (
    "single isolated object, centered, transparent background, no sky, no moon, no scenery, "
    "gothic halloween village, dark muted night colours, pixel art"
)
# Small figures drew a moon behind themselves with "night" in the prompt: these use this instead.
PLAIN = (
    "single isolated sprite on an empty transparent background, nothing behind it, "
    "gothic halloween, muted colours, pixel art"
)
PLAIN_KEYS = {"fence", "haystack", "scarecrow", "villager"}

# key: (description, width, height)
PROPS = {
    # small things it can smash from the start
    "pumpkin": ("a carved jack-o'-lantern pumpkin glowing orange", 32, 32),
    "crate": ("a wooden crate", 32, 32),
    "barrel": ("a wooden barrel with iron bands", 32, 32),
    "haystack": ("a round haystack", 40, 40),
    "fence": ("a short wooden picket fence section", 48, 32),
    "grave": ("a cracked stone gravestone", 32, 32),
    "scarecrow": ("a scarecrow with a pumpkin head on a pole", 32, 48),
    "villager": ("a frightened medieval villager in a cloak holding a torch, full body", 32, 48),
    "farmer": ("an angry medieval farmer holding a pitchfork, full body", 32, 48),
    "chicken": ("a white chicken", 32, 32),
    "cart": ("a wooden handcart loaded with pumpkins", 48, 40),
    "lamp": ("an iron street lantern on a post, lit", 32, 64),
    "well": ("a stone village well with a little roof", 48, 48),
    # medium: houses and trees
    "cottage": ("a small thatched-roof cottage with a lit window", 96, 96),
    "house": ("a two-storey timber-framed house with lit windows", 112, 112),
    "tavern": ("a timber tavern with a hanging sign and lit windows", 128, 128),
    "stall": ("a market stall with a striped awning and pumpkins", 80, 72),
    "deadtree": ("a twisted dead leafless tree", 80, 96),
    "pine": ("a dark pine tree", 64, 96),
    "wagon": ("a covered wooden wagon", 96, 72),
    "forge": ("a blacksmith's forge with a glowing furnace", 112, 104),
    # big landmarks
    "church": ("a stone gothic church with a bell tower and stained glass", 160, 160),
    "windmill": ("a wooden windmill with four sails", 128, 176),
    "watchtower": ("a tall stone watchtower with a torch at the top", 96, 192),
    "manor": ("a large gothic manor house with many lit windows", 192, 176),
    "townhall": ("a stone town hall with a clock tower", 176, 192),
    # where it starts: the laboratory it breaks out of
    "lab": ("a mad scientist's tall stone laboratory tower with a lightning rod and glowing green windows", 128, 192),
}


def gen(key, seed):
    desc, w, h = PROPS[key]
    path = f"{RAW}/{key}__s{seed}.png"
    if os.path.exists(path):
        return path
    style = PLAIN if key in PLAIN_KEYS and seed not in (7, 21) else STYLE
    img = px.pixflux(f"{desc}, {style}", w, h, seed=seed, view="low top-down", direction="south")
    img.save(path)
    return path


def trimmed(img):
    box = img.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    return img.crop(box) if box else img


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    cmd = args[0] if args else "gen"
    os.makedirs(RAW, exist_ok=True)
    if cmd == "gen":
        keys = args[1].split(",") if len(args) > 1 else list(PROPS)
        seeds = [int(s) for s in opts.get("seeds", "7,21").split(",")]
        todo = [(k, s) for k in keys for s in seeds]
        with ThreadPoolExecutor(int(opts.get("par", 6))) as ex:
            for path in ex.map(lambda ks: gen(*ks), todo):
                print("ok", path, flush=True)
    elif cmd == "sheet":
        out = args[1]
        keys = args[2].split(",") if len(args) > 2 else list(PROPS)
        files = sorted(f for f in os.listdir(RAW) if f.split("__")[0] in keys)
        cell = 180
        cols = 8
        rows = (len(files) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * cell, rows * (cell + 16)), (52, 62, 56, 255))
        from PIL import ImageDraw

        d = ImageDraw.Draw(sheet)
        for i, f in enumerate(files):
            im = trimmed(Image.open(f"{RAW}/{f}").convert("RGBA"))
            s = min((cell - 10) / im.width, (cell - 10) / im.height)
            im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.NEAREST)
            x, y = (i % cols) * cell, (i // cols) * (cell + 16)
            sheet.alpha_composite(im, (x + (cell - im.width) // 2, y + cell - im.height - 4))
            d.text((x + 4, y + cell), f[:-4], fill=(255, 255, 255, 255))
        sheet.save(out)
        print(out, sheet.size)
    elif cmd == "pick":
        picks = json.load(open(PICKS))
        os.makedirs(OUT, exist_ok=True)
        for key, f in picks.items():
            im = trimmed(Image.open(f"{RAW}/{f}").convert("RGBA"))
            im.save(f"{OUT}/{key}.png", optimize=True)
            print(key, im.size)


if __name__ == "__main__":
    main()

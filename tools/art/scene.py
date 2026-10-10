"""Candidates for the laboratory scene behind the monster: the wide room and its props.

    python3 tools/art/scene.py room [n]          # pixflux rooms -> art/raw/bg_lab__wNN.png
    python3 tools/art/scene.py props [ids...]     # PixelLab Pro props -> art/raw/<id>__proNN.png

Pick in art/picks.json (bg_lab, prop_*), then tools/art/process.py composites the props
onto the room (positions in PROPS) and quantizes it into public/art/lab.png.
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
import pixellab  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "art", "raw")

ROOM = (
    "wide interior of a gothic Victorian mad scientist laboratory at night, front view, "
    "stone brick back wall with a tall arched window showing a lightning storm in the middle, "
    "wooden shelves of glowing green specimen jars and bottles on the far left and far right walls, "
    "copper pipes and hanging chains, flagstone floor, open empty floor in the centre, "
    "dark moody candle light, Frankenstein, dark gothic horror pixel art"
)

PROPS = {
    "prop_cart": "a Victorian surgical cart, metal trolley on small wheels with a tray of bloody "
    "surgical tools, bone saw, scalpels, forceps, needle and thread, glass bottles of chemicals, "
    "side view, dark gothic horror pixel art, black outline",
    "prop_coil": "a tall tesla coil electrical machine with a copper coil, brass dials, a big "
    "knife switch lever and crackling blue sparks on top, side view, dark gothic horror pixel art, "
    "black outline",
    "prop_jars": "a small wooden stand holding three glass specimen jars with a floating brain, "
    "an eyeball and a hand in glowing green liquid, side view, dark gothic horror pixel art, black outline",
}


def room(n):
    os.makedirs(RAW, exist_ok=True)

    def one(seed):
        im = pixellab.pixflux(ROOM, 240, 224, seed=seed, no_background=False, outline="lineless",
                              detail="highly detailed", shading="detailed shading")
        im.save(os.path.join(RAW, f"bg_lab__w{seed:02d}.png"))
        return seed

    with ThreadPoolExecutor(3) as ex:
        for s in ex.map(one, range(1, n + 1)):
            print("room", s, flush=True)


def props(ids):
    os.makedirs(RAW, exist_ok=True)

    def one(pid):
        imgs = pixellab.pro(PROPS[pid], 64, 64)
        for k, im in enumerate(imgs):
            im.save(os.path.join(RAW, f"{pid}__pro{k:02d}.png"))
        return pid, len(imgs)

    with ThreadPoolExecutor(3) as ex:
        for pid, k in ex.map(one, ids or list(PROPS)):
            print("props", pid, k, flush=True)


if __name__ == "__main__":
    what = sys.argv[1]
    if what == "room":
        room(int(sys.argv[2]) if len(sys.argv) > 2 else 6)
    else:
        props(sys.argv[2:])

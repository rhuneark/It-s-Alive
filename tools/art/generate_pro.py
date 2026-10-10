"""Generate 16-variant batches with PixelLab Pro for parts pixflux struggles with.

Usage: python3 tools/art/generate_pro.py id1,id2 ["custom description override"]
Writes art/raw/<id>__pro<N>.png. Skips ids that already have pro files.
"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pixellab import pro  # noqa: E402
from prompts import PARTS, SLOTS, STYLE  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "art", "raw")

PRO_TEMPLATES = {
    "torso": "severed torso of {d}: just the chest and belly, cut off cleanly at the neck, shoulders and waist with stitched stumps, NO head, NO arms, NO legs, front view, symmetrical",
    "maw": "a monstrous {d} torn open in a round patch of grey stitched flesh, seen straight on, just the mouth, NO head, NO face, NO eyes",
    "ear": "a single severed {d}, just the ear, NO head, NO face, NO body, pointing upward",
    "hide": "a ragged square patch of {d} stitched around its edges with black thread, flat texture swatch, NO frame, NO border, NO animal",
    "jaw": "{d} only, hanging downward from the top edge, NO head, NO face, NO body, front view",
    "heart": "{d}, a single anatomical heart organ only, NO animal, NO head, front view",
    "horns": "{d}, only the horns, NO skull, NO head, front view",
    "tail": "a single severed {d} only, NO body, curving upward to the right",
    "spine": "{d} only, growing upward from a flat base line, NO body, NO water, back view",
    "leg": "{d}, one single severed leg standing straight up and down, hip stump at the top, foot at the bottom, NO body, front view",
    "arm": "{d}, one single severed arm hanging straight down, shoulder stump at the top, NO body, front view",
    "arm3": "{d}, one single severed arm reaching straight up, stump at the bottom, NO body, front view",
    "eye": "a single round {d}, just the eyeball, NO face, NO head, NO skin around it, front view",
}


def main():
    ids = sys.argv[1].split(",")
    override = sys.argv[2] if len(sys.argv) > 2 else None
    for part_id in ids:
        if glob.glob(os.path.join(RAW, f"{part_id}__pro*.png")):
            print(part_id, "skip", flush=True)
            continue
        slot, desc = PARTS[part_id]
        w, h, template = SLOTS[slot]
        template = PRO_TEMPLATES.get(slot, template)
        prompt = override or f"{template.format(d=desc)}. {STYLE}"
        imgs = pro(prompt, w, h, seed=3)
        for n, im in enumerate(imgs):
            im.save(os.path.join(RAW, f"{part_id}__pro{n:02d}.png"))
        print(part_id, len(imgs), flush=True)


if __name__ == "__main__":
    main()

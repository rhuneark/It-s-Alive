"""Generate raw part sprites with PixelLab into art/raw/ (never shipped).

Usage: python3 tools/art/generate.py [--seeds 11,23] [--only id1,id2] [--workers 6]
Existing files are skipped, so re-running only fills gaps.
"""
import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(__file__))
from pixellab import pixflux  # noqa: E402
from prompts import PARTS, prompt_for  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "art", "raw")


def job(part_id, seed):
    path = os.path.join(RAW, f"{part_id}__{seed}.png")
    if os.path.exists(path):
        return path, "skip"
    w, h, prompt = prompt_for(part_id)
    img = pixflux(prompt, w, h, seed=seed)
    img.save(path)
    return path, "ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="11,23")
    ap.add_argument("--only", default="")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()
    os.makedirs(RAW, exist_ok=True)
    ids = [i for i in args.only.split(",") if i] or list(PARTS)
    seeds = [int(s) for s in args.seeds.split(",")]
    tasks = [(i, s) for i in ids for s in seeds]
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(job, i, s): (i, s) for i, s in tasks}
        for fut in as_completed(futures):
            i, s = futures[fut]
            done += 1
            try:
                _, status = fut.result()
                print(f"[{done}/{len(tasks)}] {i} seed={s} {status}", flush=True)
            except Exception as e:  # keep going; re-run fills gaps
                print(f"[{done}/{len(tasks)}] {i} seed={s} FAILED {e}", flush=True)


if __name__ == "__main__":
    main()

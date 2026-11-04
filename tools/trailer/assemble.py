"""Turn capture.mjs frames into a constant 30 fps clip (in game time), and a contact sheet.

    python3 tools/trailer/assemble.py clip <scene dir> <out.mp4>
    python3 tools/trailer/assemble.py sheet <scene dir> <out.png> [every seconds]
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

FPS = 30


def load(d):
    idx = json.loads((Path(d) / 'index.json').read_text())
    return idx['frames'], idx.get('marks', [])


def clip(d, out):
    frames, _ = load(d)
    d = Path(d).resolve()
    lines = []
    for i, f in enumerate(frames):
        nxt = frames[i + 1]['t'] if i + 1 < len(frames) else f['t'] + 1 / FPS
        lines.append(f"file '{d / f['file']}'\nduration {max(0.001, nxt - f['t']):.4f}")
    lines.append(f"file '{d / frames[-1]['file']}'")
    lst = d / 'frames.txt'
    lst.write_text('\n'.join(lines) + '\n')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst),
                    '-vf', f'fps={FPS},scale=1080:1920:flags=lanczos,format=yuv420p',
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', str(out)], check=True)
    print(out, f"{frames[-1]['t']:.1f}s")


def sheet(d, out, every=0.5):
    frames, marks = load(d)
    picks, t = [], 0.0
    for f in frames:
        if f['t'] >= t:
            picks.append(f)
            t += every
    cols = 8
    w, h = 135, 240
    rows = (len(picks) + cols - 1) // cols
    im = Image.new('RGB', (cols * w, rows * (h + 16)), (20, 20, 20))
    dr = ImageDraw.Draw(im)
    for i, f in enumerate(picks):
        th = Image.open(Path(d) / f['file']).convert('RGB').resize((w, h))
        x, y = (i % cols) * w, (i // cols) * (h + 16)
        im.paste(th, (x, y))
        dr.text((x + 4, y + h + 2), f"{f['t']:.1f}s", fill=(255, 220, 120))
    im.save(out)
    print(out, len(picks), 'thumbs', marks)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'clip':
        clip(sys.argv[2], sys.argv[3])
    elif cmd == 'sheet':
        sheet(sys.argv[2], sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else 0.5)

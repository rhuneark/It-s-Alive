"""Contact sheet of raw candidates for review: python3 tools/art/contact.py <prefix> <out.png> [scale]"""
import glob
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
prefixes = sys.argv[1].split(",")
out = sys.argv[2]
scale = int(sys.argv[3]) if len(sys.argv) > 3 else 4
files = sorted(f for p in prefixes for f in glob.glob(os.path.join(ROOT, "art", "raw", f"{p}*.png")))
ims = [Image.open(f).convert("RGBA") for f in files]
cw = max(i.width for i in ims) + 8
ch = max(i.height for i in ims) + 14
cols = min(len(ims), max(1, 900 // (cw * scale)) or 1)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGBA", (cols * cw, rows * ch), (52, 40, 60, 255))
d = ImageDraw.Draw(sheet)
for n, (f, im) in enumerate(zip(files, ims)):
    x, y = (n % cols) * cw, (n // cols) * ch
    sheet.alpha_composite(im, (x + 4, y + 2))
sheet = sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST)
d = ImageDraw.Draw(sheet)
for n, f in enumerate(files):
    x, y = (n % cols) * cw * scale, ((n // cols) * ch + ch - 12) * scale
    d.text((x + 6, y + 4), os.path.basename(f)[:-4], fill=(255, 230, 160, 255))
sheet.save(out)
print(out, len(files))

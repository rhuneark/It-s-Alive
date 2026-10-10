"""Grey silhouette init-images that steer PixelLab toward the right part shape."""
from PIL import Image, ImageDraw


def torso(w=64, h=72):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = w // 2
    # neck stump, shoulders, tapering waist, hips
    poly = [
        (cx - 7, 2), (cx + 7, 2), (cx + 9, 8), (cx + 26, 12), (cx + 29, 20), (cx + 26, 34),
        (cx + 20, 50), (cx + 20, 62), (cx + 22, 68), (cx - 22, 68), (cx - 20, 62), (cx - 20, 50),
        (cx - 26, 34), (cx - 29, 20), (cx - 26, 12), (cx - 9, 8),
    ]
    d.polygon(poly, fill=(120, 108, 112, 255), outline=(20, 16, 20, 255))
    d.line([(cx, 14), (cx, 60)], fill=(96, 86, 90, 255))
    return im


def limb(w=32, h=80, top_width=18, bottom_width=14, end=12):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = w // 2
    d.polygon(
        [(cx - top_width // 2, 2), (cx + top_width // 2, 2), (cx + bottom_width // 2, h - end - 2), (cx - bottom_width // 2, h - end - 2)],
        fill=(120, 108, 112, 255), outline=(20, 16, 20, 255),
    )
    d.ellipse([cx - 9, h - end - 6, cx + 9, h - 2], fill=(110, 98, 102, 255), outline=(20, 16, 20, 255))
    return im

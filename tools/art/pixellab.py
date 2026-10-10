"""Minimal PixelLab v2 client. Auth is injected by the environment proxy."""
import base64
import io
import json
import time

import requests
from PIL import Image

BASE = "https://api.pixellab.ai/v2"


def _post(path, body, retries=4):
    for attempt in range(retries):
        r = requests.post(f"{BASE}{path}", json=body, timeout=300)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 ** attempt * 3)
            continue
        if r.status_code >= 400:
            raise RuntimeError(f"{path} {r.status_code}: {r.text[:500]}")
        return r.json()
    raise RuntimeError(f"{path} failed after {retries} retries")


def b64img(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return {"type": "base64", "base64": base64.b64encode(buf.getvalue()).decode(), "format": "png"}


def decode(obj):
    data = obj["base64"] if isinstance(obj, dict) else obj
    if "," in data[:64]:
        data = data.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGBA")


def pixflux(description, w, h, seed=None, **kw):
    body = {
        "description": description,
        "image_size": {"width": w, "height": h},
        "no_background": True,
        "outline": "single color black outline",
        "shading": "medium shading",
        "detail": "medium detail",
        "view": "side",
        "direction": "south",
        "text_guidance_scale": 8,
    }
    if seed is not None:
        body["seed"] = seed
    body.update(kw)
    return decode(_post("/create-image-pixflux", body)["image"])


def bitforge(description, w, h, style_image=None, color_image=None, seed=None, **kw):
    body = {
        "description": description,
        "image_size": {"width": w, "height": h},
        "no_background": True,
        "outline": "single color black outline",
        "shading": "medium shading",
        "detail": "medium detail",
        "view": "side",
        "direction": "south",
    }
    if style_image is not None:
        body["style_image"] = b64img(style_image)
        body["style_strength"] = kw.pop("style_strength", 40)
    if color_image is not None:
        body["color_image"] = b64img(color_image)
    if seed is not None:
        body["seed"] = seed
    body.update(kw)
    return decode(_post("/create-image-bitforge", body)["image"])


def pro(description, w, h, style_image=None, seed=None, poll=6):
    """generate-image-v2 (async). Returns a list of images."""
    body = {"description": description, "image_size": {"width": w, "height": h}, "no_background": True}
    if style_image is not None:
        body["style_image"] = {"image": b64img(style_image), "size": {"width": style_image.width, "height": style_image.height}}
    if seed is not None:
        body["seed"] = seed
    job = _post("/generate-image-v2", body)
    job_id = job.get("background_job_id") or job.get("id")
    while True:
        time.sleep(poll)
        try:
            r = requests.get(f"{BASE}/background-jobs/{job_id}", timeout=60)
        except requests.RequestException:
            continue
        if r.status_code == 429 or r.status_code >= 500:
            continue
        r.raise_for_status()
        j = r.json()
        if j["status"] == "completed":
            resp = j["last_response"]
            imgs = resp.get("images") or [resp.get("image")]
            return [decode(i) for i in imgs if i]
        if j["status"] in ("failed", "error", "cancelled"):
            raise RuntimeError(json.dumps(j)[:500])


def _job(path, body, poll=6):
    """POST an async job and wait for its images."""
    job = _post(path, body)
    job_id = job.get("background_job_id") or job.get("id")
    while True:
        time.sleep(poll)
        try:
            r = requests.get(f"{BASE}/background-jobs/{job_id}", timeout=60)
        except requests.RequestException:
            continue
        if r.status_code == 429 or r.status_code >= 500:
            continue
        r.raise_for_status()
        j = r.json()
        if j["status"] == "completed":
            resp = j["last_response"]
            imgs = resp.get("images") or [resp.get("image")]
            return [decode(i) for i in imgs if i]
        if j["status"] in ("failed", "error", "cancelled"):
            raise RuntimeError(json.dumps(j)[:500])


def inpaint(description, image, mask, seed=None, no_background=True):
    """inpaint-v3 (Pro): repaint the white part of `mask` on `image`. Returns a list of images."""
    size = {"width": image.width, "height": image.height}
    body = {
        "description": description,
        "inpainting_image": {"image": b64img(image), "size": size},
        "mask_image": {"image": b64img(mask.convert("RGB")), "size": size},
        "no_background": no_background,
    }
    if seed is not None:
        body["seed"] = seed
    return _job("/inpaint-v3", body)


def inpaint_lite(description, image, mask, seed=None, **kw):
    """/inpaint (max area 200x200): cheaper, sync. Returns one image."""
    body = {
        "description": description,
        "image_size": {"width": image.width, "height": image.height},
        "inpainting_image": b64img(image),
        "mask_image": b64img(mask.convert("RGB")),
        "no_background": True,
        "outline": "single color black outline",
        "shading": "medium shading",
        "detail": "medium detail",
        "view": "side",
        "direction": "south",
        "text_guidance_scale": 6,
    }
    if seed is not None:
        body["seed"] = seed
    body.update(kw)
    return decode(_post("/inpaint", body)["image"])


def edit_images(description, images, size, seed=None):
    """edit-images-v2 (Pro): the same text edit applied consistently to several images."""
    body = {
        "method": "edit_with_text",
        "edit_images": [{"image": b64img(im), "width": im.width, "height": im.height} for im in images],
        "image_size": {"width": size[0], "height": size[1]},
        "description": description,
        "no_background": True,
    }
    if seed is not None:
        body["seed"] = seed
    return _job("/edit-images-v2", body)

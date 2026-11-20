#!/usr/bin/env python3
"""Compose Chits store screenshots from real simulator captures.

    python3 -I compose.py [device ...]      # devices: see DEVICES below; default all

Inputs:  source/captures/<capture-set>/*.png   (real captures, see source/capture/)
         source/copy.json                       (headlines, layout and captures per slide)
Output:  app-store/<device>/NN-name.png, google-play/phone/NN-name.png  (RGB, no alpha)

Edit copy.json to change wording, colours or which capture a slide uses, then re-run.
Nothing here draws app UI: every phone screen in the output is a simulator capture.
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent          # assets/store-listing
SRC = ROOT / "source"
FONTS = Path(__file__).resolve().parents[3] / "node_modules" / "@expo-google-fonts"
DISPLAY = FONTS / "fredoka/600SemiBold/Fredoka_600SemiBold.ttf"
BODY = FONTS / "nunito/700Bold/Nunito_700Bold.ttf"
EYEBROW = FONTS / "nunito/900Black/Nunito_900Black.ttf"

INK = (43, 38, 32)
PAPER = (255, 253, 246)

# canvas size, capture set, and where the capture's own corners are rounded
DEVICES = {
    "iphone-6.9":       {"size": (1320, 2868), "captures": "iphone-6.9",       "out": "app-store/iphone-6.9",       "radius": 0.115, "store": "apple"},
    "iphone-medium":    {"size": (1206, 2622), "captures": "iphone-medium",    "out": "app-store/iphone-medium",    "radius": 0.115, "store": "apple"},
    "iphone-duo-outer": {"size": (1398, 2034), "captures": "iphone-duo-outer", "out": "app-store/iphone-duo-outer", "radius": 0.07,  "store": "apple"},
    # Landscape: the only real inner-display captures are the unfolded display on its side.
    "iphone-duo-inner": {"size": (2853, 2007), "captures": "iphone-duo-inner", "out": "app-store/iphone-duo-inner", "radius": 0.035, "store": "apple"},
    "google-play":      {"size": (1080, 1920), "captures": "google-play",      "out": "google-play/phone",          "radius": 0.06,  "store": "google"},
}


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def font(path, size):
    return ImageFont.truetype(str(path), max(8, int(size)))


def fit_font(draw, lines, path, start, max_width, min_size=10):
    size = start
    while size > min_size:
        f = font(path, size)
        if all(draw.textlength(line, font=f) <= max_width for line in lines):
            return f
        size -= 2
    return font(path, min_size)


def dotted_background(size, color, dot_alpha=0.07, dots=True):
    w, h = size
    image = Image.new("RGB", size, color)
    if not dots:
        return image
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    step = max(18, int(w * 0.034))
    r = max(1.5, w * 0.0021)
    luminance = sum(color) / 3
    dot = (*INK, int(255 * dot_alpha)) if luminance > 110 else (255, 245, 225, int(255 * dot_alpha))
    for y in range(step // 2, h, step):
        for x in range(step // 2, w, step):
            d.ellipse([x - r, y - r, x + r, y + r], fill=dot)
    image.paste(layer, (0, 0), layer)
    return image


def rounded(image, radius):
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, image.size[0] - 1, image.size[1] - 1], radius=radius, fill=255)
    out = image.convert("RGBA")
    out.putalpha(mask)
    return out


def place(canvas, shot, box_center, width, radius_ratio, rotation=0.0, shadow=True, border=None):
    """Scale a capture to `width`, round its corners, rotate it and drop it onto the canvas."""
    scale = width / shot.width
    img = shot.resize((int(shot.width * scale), int(shot.height * scale)), Image.LANCZOS)
    radius = int(img.width * radius_ratio)
    img = rounded(img, radius)
    if border:
        frame = Image.new("RGBA", (img.width + border[0] * 2, img.height + border[0] * 2), (0, 0, 0, 0))
        ImageDraw.Draw(frame).rounded_rectangle([0, 0, frame.width - 1, frame.height - 1], radius=radius + border[0], fill=border[1])
        frame.paste(img, (border[0], border[0]), img)
        img = frame
    if rotation:
        img = img.rotate(rotation, resample=Image.BICUBIC, expand=True)
    x = int(box_center[0] - img.width / 2)
    y = int(box_center[1] - img.height / 2)
    if shadow:
        blur = max(12, int(canvas.width * 0.028))
        alpha = img.split()[-1].point(lambda a: int(a * 0.32))
        shade = Image.new("RGBA", img.size, (*INK, 0))
        shade.putalpha(alpha)
        pad = blur * 3
        shadow_layer = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
        shadow_layer.paste(shade, (pad, pad), shade)
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(blur))
        canvas.paste(shadow_layer, (x - pad, y - pad + int(blur * 0.9)), shadow_layer)
    canvas.paste(img, (x, y), img)
    return (x, y, x + img.width, y + img.height)


def crop(shot, frac):
    l, t, r, b = frac
    return shot.crop((int(shot.width * l), int(shot.height * t), int(shot.width * r), int(shot.height * b)))


def draw_text_block(canvas, slide, device, area_top, theme):
    """Eyebrow, headline and optional line, left-aligned on a shared margin."""
    w, h = canvas.size
    d = ImageDraw.Draw(canvas)
    google = device["store"] == "google"
    landscape = w > h
    wide = w / h > 0.68
    margin = int(w * (0.075 if not wide else 0.08))
    max_width = w - margin * 2
    ink = hex_rgb(theme.get("ink", "#2B2620"))
    accent = hex_rgb(theme.get("accent", "#2B2620"))
    y = area_top
    if slide.get("eyebrow") and not google:
        ef = font(EYEBROW, w * (0.016 if landscape else 0.030 if not wide else 0.026))
        text = slide["eyebrow"].upper()
        spacing = ef.size * 0.14
        x = margin
        for ch in text:
            d.text((x, y), ch, font=ef, fill=accent)
            x += d.textlength(ch, font=ef) + spacing
        y += int(ef.size * 1.75)
    lines = [slide["headline"].replace("\n", " ")] if landscape else slide["headline"].split("\n")
    start = w * (0.046 if landscape else 0.098 if not wide else 0.082) * (0.92 if google else 1)
    hf = fit_font(d, lines, DISPLAY, start, max_width)
    line_h = int(hf.size * 1.08)
    for line in lines:
        d.text((margin, y), line, font=hf, fill=ink)
        y += line_h
    sub = slide.get("sub")
    if sub and not google:
        y += int(hf.size * 0.28)
        sf = fit_font(d, [sub], BODY, w * (0.021 if landscape else 0.040 if not wide else 0.034), max_width)
        d.text((margin, y), sub, font=sf, fill=hex_rgb(theme.get("muted", "#574E41")))
        y += int(sf.size * 1.4)
    return y


def compose(device_key, slide, index):
    device = DEVICES[device_key]
    w, h = device["size"]
    theme = slide["theme"]
    bg = hex_rgb(theme["background"])
    canvas = dotted_background((w, h), bg, dots=theme.get("dots", True)).convert("RGBA")
    layout = slide.get("layouts", {}).get(device_key) or slide.get("layouts", {}).get("default")
    missing = any(not (SRC / "captures" / device["captures"] / f"{part['capture']}.png").exists() for part in layout["shots"])
    if missing and not PLACEHOLDERS:
        return None
    captures = SRC / "captures" / device["captures"]
    text_top = int(h * (0.055 if device["store"] == "apple" else 0.05))
    text_bottom = draw_text_block(canvas, slide, device, text_top, theme)
    gap = int(h * 0.035)
    radius = device["radius"]

    for part in layout["shots"]:
        source = captures / f"{part['capture']}.png"
        if not source.exists():
            # Template mode only: a clearly marked box where a real capture must go.
            ref = DEVICES[device_key].get("placeholder", (1080, 2400))
            shot = Image.new("RGB", ref, (214, 206, 192))
            pd = ImageDraw.Draw(shot)
            for k in range(-ref[1], ref[0], 90):
                pd.line([(k, 0), (k + ref[1], ref[1])], fill=(200, 191, 176), width=18)
            pf = font(EYEBROW, ref[0] * 0.065)
            for i, line in enumerate(["PLACEHOLDER", "Android capture", f"'{part['capture']}'", "goes here"]):
                tw = pd.textlength(line, font=pf)
                pd.text(((ref[0] - tw) / 2, ref[1] * 0.40 + i * pf.size * 1.4), line, font=pf, fill=(120, 40, 40))
        else:
            shot = Image.open(source).convert("RGB")
        if part.get("crop"):
            shot = crop(shot, part["crop"])
        width = int(w * part["width"])
        scale = width / shot.width
        shot_h = shot.height * scale
        cx = w * part.get("x", 0.5)
        if "top" in part:
            cy = text_bottom + gap + shot_h / 2 + h * part["top"]
        else:
            cy = h * part["y"]
        border = (max(4, int(w * 0.006)), (255, 255, 255, 255)) if part.get("frame") else None
        place(canvas, shot, (cx, cy), width, part.get("radius", radius), part.get("rotate", 0.0), border=border)

    out_dir = ROOT / ("previews/google-play-template-PLACEHOLDERS" if PLACEHOLDERS else device["out"])
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{index:02d}-{slide['file']}.png"
    canvas.convert("RGB").save(path, "PNG", optimize=True)
    return path


PLACEHOLDERS = False


def main():
    global PLACEHOLDERS
    spec = json.loads((SRC / "copy.json").read_text())
    args = [a for a in sys.argv[1:] if a != "--placeholders"]
    PLACEHOLDERS = "--placeholders" in sys.argv
    wanted = args or list(DEVICES)
    for device_key in wanted:
        for index, slide in enumerate(spec["slides"], start=1):
            if device_key in slide.get("skip", []):
                continue
            path = compose(device_key, slide, index)
            print(path or f"SKIPPED {device_key} {index:02d}-{slide['file']}: no real capture")


if __name__ == "__main__":
    main()

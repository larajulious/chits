#!/usr/bin/env python3
"""Google Play feature graphic (1024x500, RGB) from the existing Chits mascot illustration."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
FONTS = ROOT / "node_modules/@expo-google-fonts"
art = Image.open(ROOT / "assets/images/Cheerful Sticky Note Workspace Mascot.png").convert("RGB")
W, H = 1024, 500
# Crop to 2.048:1 keeping Chits right of centre, then scale.
crop_w = int(art.height * W / H)
left = 430  # keeps Chits clear of the words, right of centre
scene = art.crop((left, 0, left + crop_w, art.height)).resize((W, H), Image.LANCZOS)

# Warm ink gradient behind the words, fading out before Chits.
shade = Image.new("L", (W, H), 0)
d = ImageDraw.Draw(shade)
for x in range(W):
    t = max(0.0, 1 - x / (W * 0.58))
    d.line([(x, 0), (x, H)], fill=int(235 * min(1, t * 1.25)))
ink = Image.new("RGB", (W, H), (43, 38, 32))
canvas = Image.composite(ink, scene, shade)

draw = ImageDraw.Draw(canvas)
display = ImageFont.truetype(str(FONTS / "fredoka/600SemiBold/Fredoka_600SemiBold.ttf"), 62)
body = ImageFont.truetype(str(FONTS / "nunito/700Bold/Nunito_700Bold.ttf"), 27)
brand = ImageFont.truetype(str(FONTS / "fredoka/600SemiBold/Fredoka_600SemiBold.ttf"), 34)
x0 = 72
icon = Image.open(ROOT / "assets/images/app_icon.png").convert("RGBA").resize((64, 64), Image.LANCZOS)
mask = Image.new("L", icon.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, 63, 63], radius=15, fill=255)
canvas.paste(icon, (x0, 92), mask)
draw.text((x0 + 80, 104), "Chits", font=brand, fill=(255, 253, 246))
draw.text((x0, 190), "Notes that feel", font=display, fill=(255, 253, 246))
draw.text((x0, 258), "like chats", font=display, fill=(251, 228, 126))
draw.text((x0, 346), "Then turn them into boards and plans.", font=body, fill=(217, 205, 184))
out = ROOT / "assets/store-listing/google-play/feature-graphic/feature-graphic.png"
canvas.save(out, "PNG", optimize=True)
print(out, canvas.size, canvas.mode)

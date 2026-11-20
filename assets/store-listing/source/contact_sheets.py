#!/usr/bin/env python3
"""Contact sheets for each exported set, plus one overall sheet, in previews/."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = Path(__file__).resolve().parents[3] / "node_modules/@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf"
SETS = [("App Store · iPhone 6.9″ (1320×2868)", "app-store/iphone-6.9"),
        ("App Store · iPhone medium 6.3″ (1206×2622)", "app-store/iphone-medium"),
        ("App Store · iPhone Duo outer (1398×2034)", "app-store/iphone-duo-outer"),
        ("App Store · iPhone Duo inner, landscape (2853×2007)", "app-store/iphone-duo-inner"),
        ("Google Play · feature graphic (1024×500)", "google-play/feature-graphic"),
        ("Google Play · TEMPLATE WITH PLACEHOLDERS, not for upload", "previews/google-play-template-PLACEHOLDERS")]
H = 640
out = ROOT / "previews"
out.mkdir(exist_ok=True)
label_font = ImageFont.truetype(str(FONT), 30)
rows = []
for title, folder in SETS:
    files = sorted((ROOT / folder).glob("*.png"))
    if not files:
        continue
    thumbs = []
    for f in files:
        im = Image.open(f).convert("RGB")
        h = H if im.width < im.height * 1.2 else int(H * 0.62)
        thumbs.append((f.name, im.resize((int(im.width * h / im.height), h), Image.LANCZOS)))
    width = sum(t.width for _, t in thumbs) + 24 * (len(thumbs) + 1)
    sheet = Image.new("RGB", (max(width, 900), H + 120), (250, 247, 240))
    d = ImageDraw.Draw(sheet)
    d.text((24, 18), title, font=label_font, fill=(43, 38, 32))
    x = 24
    for name, t in thumbs:
        sheet.paste(t, (x, 70))
        d.text((x, 70 + t.height + 8), name, font=ImageFont.truetype(str(FONT), 18), fill=(87, 78, 65))
        x += t.width + 24
    slug = folder.replace("/", "-")
    sheet.save(out / f"contact-sheet-{slug}.png")
    rows.append(sheet)
    print(out / f"contact-sheet-{slug}.png")
total = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows)), (250, 247, 240))
y = 0
for r in rows:
    total.paste(r, (0, y)); y += r.height
scale = min(1.0, 4000 / total.width)
total = total.resize((int(total.width * scale), int(total.height * scale)), Image.LANCZOS)
total.save(out / "contact-sheet-ALL.png")
print(out / "contact-sheet-ALL.png", total.size)

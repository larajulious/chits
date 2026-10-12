"""Verify rendered fixture pixels; accessibility labels alone miss blank native views.

Usage: python3 tests/native/check-chat-style-images.py SCREENSHOT_DIRECTORY [...]
Requires Pillow. Only use with the cyan React-logo fixture described in the runbook.
"""
import argparse
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('directories', nargs='+', type=Path)
parser.add_argument('--minimum-pixels', type=int, default=20000)
args = parser.parse_args()
results = []
for directory in args.directories:
    files = sorted(directory.glob('*.png'))
    if not files:
        raise SystemExit(f'No screenshots found in {directory}')
    for path in files:
        bitmap = Image.open(path).convert('RGB')
        cyan = sum(1 for red, green, blue in bitmap.getdata()
                   if blue > 140 and green > 130 and red < 130
                   and blue - red > 60 and green - red > 60)
        results.append({'file': str(path), 'size': bitmap.size,
                        'fixturePixels': cyan, 'visible': cyan >= args.minimum_pixels})
print(json.dumps(results, indent=2))
if not all(result['visible'] for result in results):
    raise SystemExit('Image fixture disappeared in one or more screenshots')

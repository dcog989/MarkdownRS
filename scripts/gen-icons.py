#!/usr/bin/env python3
"""Generate missing icon sizes for MarkdownRS from the source icon.png (512x512)."""

import os
import sys

try:
    from PIL import Image
except ImportError:
    print("Pillow not found. Install with: pip install Pillow")
    sys.exit(1)

icons_dir = os.path.join(os.path.dirname(__file__), '..', 'src-tauri', 'icons')
src_path = os.path.join(icons_dir, 'icon.png')

if not os.path.exists(src_path):
    print(f"Source icon not found: {src_path}")
    sys.exit(1)

src = Image.open(src_path).convert('RGBA')
print(f"Source icon: {src.size[0]}x{src.size[1]} {src.mode}")

targets = {
    '256x256.png': 256,
}

for filename, size in targets.items():
    out_path = os.path.join(icons_dir, filename)
    if os.path.exists(out_path):
        img = Image.open(out_path)
        print(f"  {filename}: already exists ({img.size[0]}x{img.size[1]}), skipping")
        continue
    out = src.resize((size, size), Image.LANCZOS)
    out.save(out_path, 'PNG', optimize=True)
    print(f"  {filename}: generated ({size}x{size})")

print("Done.")

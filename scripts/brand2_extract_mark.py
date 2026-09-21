#!/usr/bin/env python3
"""
EDURA v2 brand kit - mark extraction.

The authoritative brand kit is a photographed presentation board (the client's
designer deck). This script isolates the sailboat/pen-nib mark from that board
and separates it into its flat colour layers so each can be vectorised with
potrace.

Input : the board JPEG
Output: /var/minis/shared/edura/brand/v2/work/{layer}.png  (1-bit masks)
        /var/minis/shared/edura/brand/v2/work/flat.png      (4-colour proof)
        /var/minis/shared/edura/brand/v2/work/bbox.json
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

BOARD = sys.argv[1] if len(sys.argv) > 1 else "/var/minis/attachments/uploads/photo_0924F36D.jpeg"
OUT = "/var/minis/shared/edura/brand/v2/work"
os.makedirs(OUT, exist_ok=True)

# Region of the board that contains the mark (with margin).
CROP = (556, 84, 936, 392)

# Palette measured from the board (see docs/10-brand-kit-v2.md).
PAL = {
    "turquoise": (0x3F, 0x9D, 0xA5),
    "terracotta": (0xBF, 0x67, 0x43),
    "sand": (0xD7, 0xC0, 0x97),
    "paper": (0xF3, 0xED, 0xE1),
}


def rgb_to_hsv_arr(a):
    r, g, b = a[..., 0] / 255.0, a[..., 1] / 255.0, a[..., 2] / 255.0
    mx, mn = a.max(axis=2) / 255.0, a.min(axis=2) / 255.0
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rmax = (mx == r) & nz
    gmax = (mx == g) & nz & ~rmax
    bmax = (mx == b) & nz & ~rmax & ~gmax
    h[rmax] = ((g - b)[rmax] / d[rmax]) % 6
    h[gmax] = ((b - r)[gmax] / d[gmax]) + 2
    h[bmax] = ((r - g)[bmax] / d[bmax]) + 4
    h = h * 60.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0.0)
    return h, s, mx


def main():
    im = Image.open(BOARD).convert("RGB").crop(CROP)
    # Denoise the JPEG speckle + paper grain without softening the flat edges.
    im = im.filter(ImageFilter.MedianFilter(size=3))
    a = np.asarray(im).astype(np.float64)
    h, s, v = rgb_to_hsv_arr(a)

    # --- classify ------------------------------------------------------
    # paper first: very light and barely saturated
    paper = (v > 0.80) & (s < 0.22)
    turquoise = (h >= 155) & (h <= 215) & (s >= 0.15) & (v > 0.25)
    terracotta = (h >= 5) & (h <= 32) & (s >= 0.33) & (v < 0.92)
    sand = (h > 30) & (h <= 62) & (s >= 0.22) & (v > 0.60) & ~paper

    # resolve precedence: the strongest chroma wins where masks overlap
    labels = np.full(a.shape[:2], "paper", dtype=object)
    labels[sand] = "sand"
    labels[terracotta] = "terracotta"
    labels[turquoise] = "turquoise"

    # --- ink bounding box ---------------------------------------------
    ink = labels != "paper"
    ys, xs = np.nonzero(ink)
    if len(xs) == 0:
        raise SystemExit("no ink found - adjust the crop")
    # drop stray specks: keep rows/cols with a minimum ink population
    colpop = ink.sum(axis=0)
    rowpop = ink.sum(axis=1)
    x0 = int(np.argmax(colpop >= 2))
    x1 = int(len(colpop) - np.argmax(colpop[::-1] >= 2))
    y0 = int(np.argmax(rowpop >= 2))
    y1 = int(len(rowpop) - np.argmax(rowpop[::-1] >= 2))
    bbox = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}
    json.dump(bbox, open(f"{OUT}/bbox.json", "w"), indent=2)

    # --- write masks ---------------------------------------------------
    for name in ("turquoise", "terracotta", "sand"):
        m = (labels == name).astype(np.uint8) * 255
        Image.fromarray(255 - m).save(f"{OUT}/{name}.png")

    # --- flat proof ----------------------------------------------------
    proof = np.zeros(a.shape, dtype=np.uint8)
    for name, rgb in PAL.items():
        proof[labels == name] = rgb
    Image.fromarray(proof).save(f"{OUT}/flat.png")

    # --- stats ---------------------------------------------------------
    stats = {n: int((labels == n).sum()) for n in ("turquoise", "terracotta", "sand", "paper")}
    print(json.dumps({"bbox": bbox, "crop_size": list(im.size), "pixels": stats}, indent=2))


main()

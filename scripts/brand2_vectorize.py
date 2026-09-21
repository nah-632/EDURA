#!/usr/bin/env python3
"""
EDURA mark - vectorisation (final).

Method, in order:
  1. classify every native pixel of the mark region into the four brand
     colours using a softmax over squared colour distance (edge pixels
     blend, and the softmax splits them proportionally);
  2. smooth *at native resolution* - upsampling before smoothing just
     carries JPEG noise up with it (that was pass 2's mistake);
  3. binary mask -> Gaussian blur -> upscale -> single threshold. The blur
     turns the pixel staircase into a linear ramp, so the thresholded
     contour is already sub-pixel smooth before potrace sees it;
  4. potrace fits beziers to it.
Blur radius is per layer: the turquoise pen nib carries a ~1px slit that a
larger radius would close.

Run: python3 scripts/brand2_vectorize.py [board.jpg]
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
BOARD = sys.argv[1] if len(sys.argv) > 1 else "/var/minis/attachments/uploads/photo_0924F36D.jpeg"
ROOT = "/var/minis/shared/edura/brand/v2"
WORK = f"{ROOT}/work"
LAYERS = f"{WORK}/layers"
os.makedirs(LAYERS, exist_ok=True)

CROP = (562, 92, 892, 386)     # tight: mark only, excludes the phone mockup edge
UP = 8
MIN_NATIVE_PX = 10

BRAND = {
    "turquoise": "#3F9DA5",
    "terracotta": "#BF6743",
    "sand": "#D7C097",
    "paper": "#F7F2E8",
}
RGB = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in BRAND.items()}
ORDER = ["turquoise", "terracotta", "sand", "paper"]

# per layer: classification blur, mask blur, potrace turdsize, alphamax,
#            minimum connected-component area (native px), opening size
CFG = {
    "sand":       (1.10, 1.30, 60, 0.85, 900, 5),
    "terracotta": (0.95, 1.30, 22, 0.72, 45, 3),
    "turquoise":  (0.80, 1.30, 40, 0.75, 48, 3),
}


def coverage(img):
    a = np.asarray(img).astype(np.float64)
    d = np.stack([((a - np.array(RGB[k])) ** 2).sum(axis=2) for k in ORDER], axis=0)
    w = 1.0 / np.maximum(d, 1e-6) ** 2.2
    return w / w.sum(axis=0, keepdims=True)


def components(mask, min_px):
    """Label 4-connected components. Returns (kept_mask, [component_masks])."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    kept = np.zeros_like(mask, dtype=bool)
    comps = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            stack, comp = [(sy, sx)], []
            seen[sy, sx] = True
            while stack:
                y, x = stack.pop()
                comp.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(comp) < min_px:
                continue
            m = np.zeros_like(mask, dtype=bool)
            for y, x in comp:
                m[y, x] = True
            comps.append(m)
            kept |= m
    return kept, comps


def smooth_layer(mask, big_blur, small_blur, small_px=180):
    """Blur the layer's components with a radius proportional to their size.
    A single blur tuned for the hull would round the 10px sparkles away; a
    single blur tuned for the sparkles would leave the hull's long edges
    wobbling. So each connected component gets its own radius."""
    _, comps = components(mask, 1)
    out = np.zeros(mask.shape, dtype=np.float64)
    for m in comps:
        r = big_blur if int(m.sum()) >= small_px else small_blur
        out = np.maximum(out, np.asarray(
            Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)),
            dtype=np.float64))
    return out


# The four sparkles that sit above the sail on the kit board are NOT part of
# the mark. Decision recorded in docs/10-brand-kit-v2.md: at the board's
# resolution each small sparkle is ~10 px, so its needle-thin taper is below
# what the raster can resolve and every trace returns a diamond - the wrong
# shape next to the one large sparkle that is resolvable. Reconstructing them
# from geometry is no longer wanted, so they are removed and the mark is the
# dhow, its pen-nib bow and the wave.
SPARKLE_MAX_PX = 620      # native px; the jib and hull are both far larger
SPARKLE_MAX_RX = 14       # a sparkle is small in both axes


def strip_sparkles(mask):
    """Drop the small compact terracotta components (the sparkle cluster).

    The mast is protected by the compactness test: it is a thin vertical rule
    (~3 x 15 px), so it fails the 0.7..1.45 width/height band and survives.
    """
    out = mask.copy()
    removed = []
    for comp in components(mask, 16)[1]:
        ys, xs = np.nonzero(comp)
        rx = (xs.max() - xs.min() + 1) / 2
        ry = (ys.max() - ys.min() + 1) / 2
        if len(ys) > SPARKLE_MAX_PX or max(rx, ry) > SPARKLE_MAX_RX:
            continue
        if min(rx, ry) < 2.5 or not (0.7 <= rx / ry <= 1.45):
            continue
        out[comp] = False
        removed.append((round(float(xs.mean()), 1), round(float(ys.mean()), 1),
                        round(float(rx), 1), round(float(ry), 1), int(len(ys))))
    return out, removed


def main():
    native = Image.open(BOARD).convert("RGB").crop(CROP).filter(ImageFilter.MedianFilter(3))
    cov = coverage(native)

    # Deterministic partition: every pixel belongs to exactly one colour once
    # each channel is smoothed. Independent thresholds left each layer holding
    # slivers of its neighbours (a sand fringe under the hull, a mangled
    # sparkle) - argmax cannot do that.
    sm = np.stack([np.asarray(Image.fromarray((cov[i] * 255).astype(np.uint8))
                              .filter(ImageFilter.GaussianBlur(
                                  CFG[ORDER[i]][0] if ORDER[i] in CFG else 1.0)))
                   for i in range(4)], axis=0)
    idx = sm.argmax(axis=0)

    masks, fields, metrics = {}, {}, {}
    for i, name in enumerate(ORDER[:3]):
        min_px, morph = CFG[name][4], CFG[name][5]
        m = idx == i
        m, _ = components(m, min_px)
        # Morphological opening. The warm layers need it: a terracotta shape
        # sitting on the cream paper has an anti-aliased rim whose colour
        # passes straight through the sand reference colour, leaving 1px sand
        # tendrils welded to the sparkles. An opening removes anything thinner
        # than the structuring element and leaves the real shapes alone.
        # Skipped for turquoise, whose pen nib carries a ~1px slit.
        if name != "turquoise":
            im_m = Image.fromarray((m * 255).astype(np.uint8))
            m = np.asarray(im_m.filter(ImageFilter.MaxFilter(morph))
                           .filter(ImageFilter.MinFilter(morph))) > 127
        m, _ = components(m, min_px)
        if name == "terracotta":
            m, removed = strip_sparkles(m)
            m = components(m, min_px)[0]
            metrics["sparklesRemoved"] = removed
        masks[name] = m
        fields[name] = Image.fromarray(np.clip(smooth_layer(m, CFG[name][1], 0.45), 0, 255).astype(np.uint8))

    H, W = native.height * UP, native.width * UP
    big = {n: np.asarray(fields[n].resize((W, H), Image.LANCZOS)) > 127 for n in ORDER[:3]}

    ink = np.zeros((H, W), dtype=bool)
    for m in big.values():
        ink |= m
    cols, rows = ink.sum(axis=0), ink.sum(axis=1)
    x0 = int(np.argmax(cols > 0)); x1 = int(W - np.argmax(cols[::-1] > 0))
    y0 = int(np.argmax(rows > 0)); y1 = int(H - np.argmax(rows[::-1] > 0))
    pad = 3
    x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    bw, bh = x1 - x0, y1 - y0

    traced, masks_out = {}, {}
    for name in ORDER[:3]:
        sub = big[name][y0:y1, x0:x1]
        masks_out[name] = sub
        buf = np.where(sub, 0, 255).astype(np.uint8)
        pgm = f"{LAYERS}/{name}.pgm"
        with open(pgm, "wb") as fh:
            fh.write(b"P5\n%d %d\n255\n" % (buf.shape[1], buf.shape[0]))
            fh.write(buf.tobytes())
        svg = f"{LAYERS}/{name}.svg"
        subprocess.run(["potrace", "-s", "-o", svg,
                        "--turdsize", str(CFG[name][2]),
                        "--alphamax", str(CFG[name][3]),
                        "--opttolerance", "0.35", "--longcurve",
                        "--unit", "10", pgm], check=True)
        traced[name] = re.findall(r'<path d="([^"]+)"', open(svg).read())
        Image.fromarray(buf).save(f"{WORK}/mask-{name}.png")

    vb = f"0 0 {bw} {bh}"
    tr = f"translate(0,{bh}) scale(0.1,-0.1)"
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" '
            f'aria-label="Edura">\n')

    def grp(n, fill):
        b = "".join(f'\n        <path d="{d}"/>' for d in traced[n])
        return f'    <g fill="{fill}" transform="{tr}">{b}\n    </g>'

    open(f"{ROOT}/edura-mark.svg", "w").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!-- EDURA brand mark. Vectorised from the supplied brand kit board by\n'
        '     scripts/brand2_vectorize.py - do not redraw or hand-retrace. -->\n'
        + head + grp("sand", BRAND["sand"]) + "\n" + grp("terracotta", BRAND["terracotta"])
        + "\n" + grp("turquoise", BRAND["turquoise"]) + "\n</svg>\n")

    mono = ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<!-- EDURA brand mark, single colour (inherits currentColor). -->\n' + head
            + f'    <g fill="currentColor" transform="{tr}">')
    for n in ("sand", "terracotta", "turquoise"):
        for d in traced[n]:
            mono += f'\n        <path d="{d}"/>'
    mono += "\n    </g>\n</svg>\n"
    open(f"{ROOT}/edura-mark-mono.svg", "w").write(mono)

    # proof sheet
    proof = np.zeros((bh, bw, 3), dtype=np.uint8)
    for n in ORDER[:3]:
        proof[masks_out[n]] = RGB[n]
    Image.fromarray(proof).save(f"{WORK}/proof.png")

    m = {"source": os.path.basename(BOARD), "crop": CROP, "upscale": UP,
         "viewBox": vb, "box": [bw, bh], "aspect": round(bw / bh, 4),
         "palette": BRAND, "paths": {k: len(v) for k, v in traced.items()},
         "bytes": {k: os.path.getsize(f"{ROOT}/{k}") for k in
                   ("edura-mark.svg", "edura-mark-mono.svg")}}
    json.dump(m, open(f"{ROOT}/mark-metrics.json", "w"), indent=2)
    print(json.dumps({"paths": m["paths"], "viewBox": vb, "box": m["box"],
                      "aspect": m["aspect"], "bytes": m["bytes"]}, indent=2))


main()

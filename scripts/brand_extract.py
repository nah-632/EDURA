#!/usr/bin/env python3
"""EDURA brand asset extraction.

Source of truth: brand/edura-logo-source.jpg (the provided logo).
Produces: transparent PNG lockups, symbol-only, monochrome, reverse, app icon,
favicon set -- all derived from the provided artwork (no redesign).

Alpha model: the source is a JPEG on a near-white background. Core (opaque)
pixels are detected by an eroded mask; the anti-aliased edge band gets a
per-pixel alpha estimated by un-mixing the pixel against the background using
the channel with the strongest foreground/background separation.
"""
import os
from PIL import Image, ImageFilter, ImageDraw

BRAND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "brand")
SRC = os.path.join(BRAND, "edura-logo-source.jpg")
OUT = os.path.join(BRAND, "assets")
os.makedirs(os.path.join(OUT, "png"), exist_ok=True)
os.makedirs(os.path.join(OUT, "favicon"), exist_ok=True)

NAVY = (16, 42, 86)      # #102A56 Academic Navy
PRIMARY = (37, 99, 235)  # #2563EB Primary Blue
BG = (251, 252, 255)

im = Image.open(SRC).convert("RGB")
W, H = im.size
px = im.load()

# ---- 1. classify pixels -------------------------------------------------
def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]

# core = clearly ink; edge band = everything else with any ink signal
core = [[False] * W for _ in range(H)]
edge = [[False] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        c = px[x, y]
        if lum(c) < 205:
            core[y][x] = True
        elif lum(c) < 248:
            edge[y][x] = True

# erode the core mask so the edge band owns the anti-aliased pixels
core_img = Image.new("L", (W, H), 0)
cd = core_img.load()
for y in range(H):
    for x in range(W):
        if core[y][x]:
            cd[x, y] = 255
eroded = core_img.filter(ImageFilter.MinFilter(5)).load()

# ---- 2. alpha + unpremultiply ------------------------------------------
alpha = Image.new("L", (W, H), 0)
rgb = Image.new("RGB", (W, H), (0, 0, 0))
ap, rp = alpha.load(), rgb.load()
for y in range(H):
    for x in range(W):
        c = px[x, y]
        if not (core[y][x] or edge[y][x]):
            continue
        if eroded[x, y] == 255:
            # fully opaque interior: keep the original colour
            a = 1.0
        else:
            # strongest separation channel:  ratio = (bg - p) / (bg - f)
            best = 0.0
            for i in range(3):
                f = 60 if i != 2 else 140  # mark/wordmark ink is dark in R/G
                denom = BG[i] - f
                if denom <= 1:
                    continue
                best = max(best, (BG[i] - c[i]) / denom)
            a = min(1.0, max(0.0, best))
        if a <= 0.02:
            continue
        col = tuple(
            max(0, min(255, int(round((c[i] - (1 - a) * BG[i]) / a)))) for i in range(3)
        )
        ap[x, y] = int(round(a * 255))
        rp[x, y] = col

rgba = rgb.convert("RGBA")
rgba.putalpha(alpha)

# ---- 3. split mark (symbol) from wordmark -------------------------------
bb = rgba.getbbox()
mx0, my0, mx1, my1 = bb
col_has = [
    any(alpha.getpixel((x, y)) > 8 for y in range(my0, my1))
    for x in range(W)
]
# first gap of >=20px after the mark ends the symbol
gap_run, gap_start = 0, None
split = None
for x in range(mx0, mx1):
    if not col_has[x]:
        if gap_run == 0:
            gap_start = x
        gap_run += 1
        if gap_run >= 20:
            split = (gap_start, x)
            break
    else:
        gap_run = 0
print("bbox", bb, "split gap", split)

mark_box = (mx0, my0, split[0], my1)
word_box = (split[1] + 1, my0, mx1, my1)
mark = rgba.crop(mark_box)
word = rgba.crop(word_box)
print("mark", mark.size, "word", word.size, "word/mark height ratio",
      round(word.height / mark.height, 3))

# ---- 4. export ----------------------------------------------------------
def save(img, name, scale=1):
    w = int(img.width * scale)
    h = int(img.height * scale)
    r = img.resize((w, h), Image.LANCZOS)
    p = os.path.join(OUT, "png", name)
    r.save(p)
    return p

# lockup with a controlled margin, 1x/2x/3x
PAD = 12
lock = Image.new("RGBA", (rgba.width, rgba.height), (0, 0, 0, 0))
lock.paste(rgba.crop(bb), (0, 0))
lock = lock.crop(lock.getbbox())
saved = []
for s, tag in ((1, ""), (2, "@2x"), (3, "@3x")):
    saved.append(save(lock, f"edura-logo-horizontal{tag}.png", s))
mk = mark.crop(mark.getbbox()) if mark.getbbox() else mark
for s, tag in ((1, ""), (2, "@2x"), (3, "@3x")):
    saved.append(save(mk, f"edura-mark{tag}.png", s))

# monochrome + reverse variants (alpha preserved, ink replaced)
def recolor(img, color):
    out = Image.new("RGBA", img.size, color + (0,))
    out.putalpha(img.getchannel("A"))
    return out

mono_navy = recolor(lock, NAVY)
mono_navy.crop(mono_navy.getbbox()).save(os.path.join(OUT, "png", "edura-logo-mono-navy.png"))
mono_white = recolor(lock, (255, 255, 255))
mono_white.crop(mono_white.getbbox()).save(os.path.join(OUT, "png", "edura-logo-reverse-white.png"))
mono_black = recolor(lock, (0, 0, 0))
mono_black.crop(mono_black.getbbox()).save(os.path.join(OUT, "png", "edura-logo-mono-black.png"))
mk_white = recolor(mk, (255, 255, 255)).crop(recolor(mk, (255, 255, 255)).getbbox())
mk_white.save(os.path.join(OUT, "png", "edura-mark-white.png"))
mk_navy = recolor(mk, NAVY).crop(recolor(mk, NAVY).getbbox())
mk_navy.save(os.path.join(OUT, "png", "edura-mark-navy.png"))

# app icon: navy tile, white mark, safe area ~62%
ICON = 1024
tile = Image.new("RGB", (ICON, ICON), NAVY)
mm = mk_white.copy()
target_h = int(ICON * 0.62)
scale = target_h / mm.height
mm = mm.resize((int(mm.width * scale), target_h), Image.LANCZOS)
tile_rgba = tile.convert("RGBA")
tile_rgba.alpha_composite(mm, ((ICON - mm.width) // 2, (ICON - mm.height) // 2))
tile_rgba.save(os.path.join(OUT, "png", "edura-app-icon-1024.png"))
# white tile variant (for light surfaces)
white_tile = Image.new("RGB", (ICON, ICON), (255, 255, 255)).convert("RGBA")
mk_blue = mk.resize((int(mk.width * target_h / mk.height), target_h), Image.LANCZOS)
white_tile.alpha_composite(mk_blue, ((ICON - mk_blue.width) // 2, (ICON - mk_blue.height) // 2))
white_tile.save(os.path.join(OUT, "png", "edura-app-icon-light-1024.png"))

# favicons
for size in (16, 32, 48, 96, 180, 192, 512):
    ic = tile_rgba.resize((size, size), Image.LANCZOS)
    ic.save(os.path.join(OUT, "favicon", f"favicon-{size}.png"))
tile_rgba.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, "favicon", "apple-touch-icon.png"))
ico = tile_rgba.resize((64, 64), Image.LANCZOS)
ico.save(os.path.join(OUT, "favicon", "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
# maskable icon: extra padding (safe zone 80%)
mk_pad = Image.new("RGBA", (ICON, ICON), (0, 0, 0, 0))
target_h2 = int(ICON * 0.5)
m2 = mk_white.resize((int(mk_white.width * target_h2 / mk_white.height), target_h2), Image.LANCZOS)
mk_pad.alpha_composite(m2, ((ICON - m2.width) // 2, (ICON - m2.height) // 2))
maskable = Image.new("RGB", (ICON, ICON), NAVY).convert("RGBA")
maskable.alpha_composite(mk_pad)
maskable.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "favicon", "maskable-512.png"))

print("exported:", len(saved), "scales;",
      len(os.listdir(os.path.join(OUT, "favicon"))), "favicon files")

# ---- 5. geometry report for the SVG reconstruction ----------------------
print("\n-- mark geometry (px, source scale) --")
print("mark box:", mark_box, "size", mk.size)
right_h = []
for y in range(0, mk.height, max(1, mk.height // 26)):
    row = [x for x in range(mk.width) if mk.getpixel((x, y))[3] > 96]
    if row:
        right_h.append((y, min(row), max(row)))
for y, a, b in right_h:
    print(f"  y={y:3d}  x {a:3d}..{b:3d}  span {b-a:3d}")

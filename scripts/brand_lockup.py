#!/usr/bin/env python3
"""EDURA horizontal lockup: traced mark + typeset wordmark (Manrope, the brand
Latin face), with every proportion matched to the supplied artwork.

Coordinate system = the 1x source pixels (mark ink = 108 x 162), so the lockup
viewBox is directly comparable with the artwork.
"""
import json
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
BRAND = os.path.join(ROOT, "brand")
ASSETS = os.path.join(BRAND, "assets")
FONTSRC = os.path.join(ROOT, "assets-build", "fonts", "Manrope[wght].ttf")
NAVY = "#102A56"
SRC_BBOX = (69, 115, 620, 277)          # ink bbox of the supplied logo (1x px)
SPLIT = (177, 196)                       # gap between mark and wordmark (source px)
MARK_W, MARK_H = 108, 162

# ---- measure the supplied wordmark --------------------------------------
# Measured from the alpha channel of the source-derived extraction (it keeps the
# anti-aliased edge, unlike a threshold on the JPEG), then reported at 1x units.
def ink_bbox(img, thr=24):
    a = img.getchannel("A").point(lambda v: 255 if v > thr else 0)
    return a.getbbox()


lock3 = Image.open(os.path.join(ASSETS, "png", "edura-logo-horizontal@3x.png")).convert("RGBA")
mark3 = Image.open(os.path.join(ASSETS, "png", "edura-mark@3x.png")).convert("RGBA")
mb3 = ink_bbox(mark3)
MARK_W = round((mb3[2] - mb3[0]) / 3)
MARK_H = round((mb3[3] - mb3[1]) / 3)
word_region = lock3.crop((mb3[2], 0, lock3.width, lock3.height))
wb3 = ink_bbox(word_region)
WORD_W = round((wb3[2] - wb3[0]) / 3)
WORD_H = round((wb3[3] - wb3[1]) / 3)
WORD_X = round((mb3[2] + wb3[0]) / 3)
WORD_TOP = round(wb3[1] / 3)
logo = Image.open(os.path.join(BRAND, "edura-logo-source.jpg")).convert("RGB")
word_crop = logo.crop((SPLIT[1] + 1, SRC_BBOX[1], SRC_BBOX[2], SRC_BBOX[3])).convert("L")
wimg = word_crop.point(lambda v: 255 if v < 160 else 0)
print(f"source: mark {MARK_W}x{MARK_H}; wordmark ink {WORD_W}x{WORD_H} at x={WORD_X} y={WORD_TOP}")
print(f"        cap/mark height = {WORD_H / MARK_H:.4f}; word aspect = {WORD_W / WORD_H:.4f}")


def source_letter_widths():
    px = wimg.load()
    W, H = wimg.size
    runs, inrun, start = [], False, 0
    for x in range(W):
        has = any(px[x, y] > 128 for y in range(H))
        if has and not inrun:
            start, inrun = x, True
        elif not has and inrun:
            runs.append(x - start)
            inrun = False
    if inrun:
        runs.append(W - start)
    return runs


SRC_LETTERS = source_letter_widths()

# ---- instantiate Manrope weights and pick the closest --------------------
def instance(weight, path="/tmp/manrope-inst.ttf"):
    """Instantiate a static Manrope master, cached on disk (fontTools
    instantiation is slow enough to dominate the script otherwise)."""
    import shutil
    if not os.path.exists(path):
        f = TTFont(FONTSRC)
        instantiateVariableFont(f, {"wght": weight}).save(path)
    return path


def font_aspect(weight):
    path = instance(weight, f"/tmp/manrope-{weight}.ttf")
    font = ImageFont.truetype(path, 400)
    img = Image.new("L", (4000, 1000), 0)
    d = ImageDraw.Draw(img)
    d.text((200, 200), "EDURA", font=font, fill=255)
    b = img.getbbox()
    return (b[2] - b[0]) / (b[3] - b[1])


target = WORD_W / WORD_H
scores = []
for w in (600, 700, 800):
    ar = font_aspect(w)
    scores.append((abs(ar - target), w, ar))
    print(f"  Manrope {w}: ink aspect {ar:.4f}  target {target:.4f}  Δ {abs(ar - target):.4f}")
BEST_W = min(scores)[1]
print("chosen weight:", BEST_W)

# ---- outline the chosen weight ------------------------------------------
inst = TTFont(instance(BEST_W))
gs = inst.getGlyphSet()
cmap = inst.getBestCmap()
hmtx = inst["hmtx"]
TEXT = "EDURA"

def build(track_fu):
    out, pen = [], 0
    for ch in TEXT:
        gname = cmap[ord(ch)]
        bp = BoundsPen(gs)
        gs[gname].draw(bp)
        out.append({"char": ch, "glyph": gname, "x": pen, "bbox": bp.bounds})
        pen += hmtx[gname][0] + track_fu
    return out


letters = build(0)
ink_x0 = min(l["x"] + l["bbox"][0] for l in letters)
ink_x1 = max(l["x"] + l["bbox"][2] for l in letters)
ink_y1 = max(l["bbox"][3] for l in letters)   # cap height (font units, y-up)
ink_y0 = min(l["bbox"][1] for l in letters)
FU_W, FU_H = ink_x1 - ink_x0, ink_y1 - ink_y0
SCALE = WORD_H / FU_H
# the supplied artwork is slightly wider than Manrope's default spacing, so the
# tracking is solved for (not guessed) to land the ink width on the source's.
TRACK_FU = (WORD_W - FU_W * SCALE) / (len(TEXT) - 1) / SCALE
letters = build(TRACK_FU)
ink_x0 = min(l["x"] + l["bbox"][0] for l in letters)
ink_x1 = max(l["x"] + l["bbox"][2] for l in letters)
FU_W = ink_x1 - ink_x0
print(f"font units: ink {FU_W}x{FU_H}; scale {SCALE:.5f}; tracking {TRACK_FU:.1f}fu "
      f"({TRACK_FU / inst['head'].unitsPerEm * 100:.2f}% em) -> width {FU_W * SCALE:.1f} (source {WORD_W})")
# letter-by-letter sanity check against the artwork
mink = [l["bbox"][2] - l["bbox"][0] for l in letters]
print("manrope letter ink widths (fu):", mink)
print("  scaled to the source cap height:", [round(v * SCALE, 1) for v in mink])

paths = []
for l in letters:
    if not l["bbox"]:
        continue
    pen = SVGPathPen(gs)
    gs[l["glyph"]].draw(pen)
    tx = WORD_X + (l["x"] - ink_x0) * SCALE
    ty = WORD_TOP + l["bbox"][3] * SCALE
    paths.append(f'<path d="{pen.getCommands()}" transform="translate({tx:.2f} {ty:.2f}) '
                 f'scale({SCALE:.5f} {-SCALE:.5f})"/>')
word_paths = "\n    ".join(paths)

TOTAL_W = round(WORD_X + FU_W * SCALE, 2)
TOTAL_H = MARK_H
mark_body = open(os.path.join(ASSETS, "edura-mark.svg")).read().split(">", 1)[1].rsplit("</svg>", 1)[0].strip()


def write_lockup(name, ink, gradient=False):
    mark = open(os.path.join(ASSETS, "edura-mark-gradient.svg" if gradient else "edura-mark.svg")
                ).read().split(">", 1)[1].rsplit("</svg>", 1)[0]
    if gradient:
        mark = '<defs>' + mark.split("<defs>")[1].split("</defs>")[0] + "</defs>" + mark.split("</defs>")[1]
    else:
        mark = mark.replace('fill="currentColor"', f'fill="{ink}"')
    doc = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TOTAL_W} {TOTAL_H}" '
           f'role="img" aria-label="Edura">\n'
           f'  <g>\n    {mark.strip()}\n    <g fill="{ink}">\n    {word_paths}\n    </g>\n  </g>\n</svg>\n')
    p = os.path.join(ASSETS, name)
    open(p, "w").write(doc)
    return p


out = [write_lockup("edura-logo-horizontal.svg", NAVY),
       write_lockup("edura-logo-reverse.svg", "#FFFFFF"),
       write_lockup("edura-logo-mono-black.svg", "#000000"),
       write_lockup("edura-logo-gradient.svg", NAVY, gradient=True)]
print("wrote:\n  " + "\n  ".join(os.path.basename(x) for x in out))

metrics = {
    "source": {"file": "edura-logo-source.jpg", "inkBBox": SRC_BBOX, "markWordGap": SPLIT[0] - (SRC_BBOX[0] + MARK_W)},
    "colors": {"navy": "#102A56", "primary": "#2563EB", "light": "#60A5FA",
               "veryLight": "#EFF6FF", "warmWhite": "#FAFBFC", "graphite": "#172033"},
    "mark": {"viewBox": [MARK_W, MARK_H], "aspect": round(MARK_W / MARK_H, 4),
             "vector": "traced from the supplied artwork (scripts/brand_vectorize.py)"},
    "wordmark": {"font": "Manrope", "weight": BEST_W, "text": TEXT,
                 "capHeightOverMarkHeight": round(WORD_H / MARK_H, 4),
                 "inkAspect": round(FU_W / FU_H, 4),
                 "letterWidthsSource1x": SRC_LETTERS},
    "lockup": {"viewBox": [TOTAL_W, TOTAL_H], "aspect": round(TOTAL_W / TOTAL_H, 4),
               "wordX": WORD_X, "wordTop": WORD_TOP, "gapFromMarkInk": round(WORD_X - MARK_W, 2)},
}
json.dump(metrics, open(os.path.join(BRAND, "brand-metrics.json"), "w"), indent=2)
print("lockup:", TOTAL_W, "x", TOTAL_H, "aspect", round(TOTAL_W / TOTAL_H, 3),
      "gap", round(WORD_X - MARK_W, 2))

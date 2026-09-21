#!/usr/bin/env python3
"""
Build the EDURA lockups from the vectorised mark + the Poppins wordmark.

The brand kit sets "EDURA" in Poppins. Rather than shipping an SVG that
depends on the font being installed, the glyph outlines are extracted once
and emitted as paths - that is what a logo lockup has to be.

Usage:
  python3 scripts/brand2_lockup.py [--weight 600|700] [--preview]
"""
import argparse
import json
import os
import re
import subprocess
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from fontTools.ttLib import TTFont

ROOT = "/var/minis/shared/edura"
BRAND = f"{ROOT}/brand/v2"
TTF = "/tmp/Poppins-SemiBold.ttf"
WORD = "EDURA"
CAP_EM = 700.0          # Poppins cap height, font units (unitsPerEm = 1000)

# Lockup geometry. Every number below was measured off the brand board's main
# lockup (pixel-profile measurement, see docs/10-brand-kit-v2.md):
#   mark ink        211 x 214 px
#   wordmark ink    241 x  50 px   -> ink aspect 4.82, cap = 0.234 x mark height
#   mark->word gap  104 px         -> 0.486 x mark height
# The tracking is then solved for, not guessed: it is the value at which
# Poppins' own ink aspect reproduces the board's 4.82.
TRACKING_EM = 0.0485    # solved; Poppins natural ink aspect is 4.545
CAP_RATIO = 0.2336      # wordmark cap height / mark height
STACK_GAP = 0.486       # mark-to-wordmark gap / mark height
SIDE_GAP = 0.30         # horizontal lockup gap / mark width
WORD_FILL = "#3F9DA5"   # the kit sets the wordmark in the brand turquoise


def wordmark_paths(ttf_path, cap_height, tracking_em):
    """Return (paths, advance_width) for the wordmark at the given cap height."""
    font = TTFont(ttf_path)
    upm = font["head"].unitsPerEm
    cap = font["OS/2"].sCapHeight if hasattr(font["OS/2"], "sCapHeight") else CAP_EM
    scale = cap_height / cap
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    paths = []
    x = 0.0
    for ch in WORD:
        gname = cmap.get(ord(ch))
        if gname is None:
            raise SystemExit(f"no glyph for {ch!r}")
        pen = SVGPathPen(gs)
        tpen = TransformPen(pen, Transform(scale, 0, 0, -scale, x, 0))
        gs[gname].draw(tpen)
        d = pen.getCommands()
        if d:
            paths.append(d)
        x += gs[gname].width * scale + tracking_em * upm * scale
    return paths, x - tracking_em * upm * scale


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weight", default="600")
    ap.add_argument("--preview", action="store_true")
    a = ap.parse_args()

    mark = open(f"{BRAND}/edura-mark.svg").read()
    vb = re.search(r'viewBox="([^"]+)"', mark).group(1)
    _, _, mw, mh = (float(v) for v in vb.split())
    body = re.search(r"<svg[^>]*>(.*)</svg>", mark, re.S).group(1).strip()

    word_cap = CAP_RATIO * mh
    paths, adv = wordmark_paths(TTF, word_cap, TRACKING_EM)
    word_w = adv

    out = {}

    # --- stacked lockup -------------------------------------------------
    gap = STACK_GAP * mh
    total_h = mh + gap + word_cap
    total_w = max(mw, word_w)
    layers = (f'<g transform="translate({(total_w - mw) / 2:.3f} 0)">{body}</g>\n'
              f'  <g fill="{WORD_FILL}" transform="translate({(total_w - word_w) / 2:.3f} '
              f'{mh + gap + word_cap:.3f})">'
              + "".join(f'<path d="{d}"/>' for d in paths) + "</g>")
    out["stacked"] = (0, 0, total_w, total_h, layers)

    # --- horizontal lockup ----------------------------------------------
    hgap = SIDE_GAP * mw
    # optically centre the wordmark on the mark's mass
    ty = (mh - word_cap) / 2
    tot_w2 = mw + hgap + word_w
    layers2 = (f'<g transform="translate(0 0)">{body}</g>\n'
               f'  <g fill="{WORD_FILL}" transform="translate({mw + hgap:.3f} {ty:.3f})">'
               + "".join(f'<path d="{d}"/>' for d in paths) + "</g>")
    out["horizontal"] = (0, 0, tot_w2, mh, layers2)

    # --- horizontal, to the left of nothing (wordmark only) -------------
    out["wordmark"] = (0, 0, word_w, word_cap,
                       f'<g fill="{WORD_FILL}">'
                       + "".join(f'<path d="{d}"/>' for d in paths) + "</g>")

    # geometry sidecar: the React component composes the lockup from ONE copy
    # of the mark paths and ONE copy of the wordmark paths, so it needs the
    # placement of each rather than six pre-baked SVGs.
    geo = {
        "horizontal": {"markTransform": "translate(0 0)",
                       "wordTransform": f"translate({mw + SIDE_GAP * mw:.3f} {(mh - word_cap) / 2:.3f})",
                       "width": round(tot_w2, 3), "height": round(mh, 3)},
        "stacked": {"markTransform": f"translate({(total_w - mw) / 2:.3f} 0)",
                    "wordTransform": f"translate({(total_w - word_w) / 2:.3f} {mh + gap + word_cap:.3f})",
                    "width": round(total_w, 3), "height": round(total_h, 3)},
        "wordmarkAspect": round(word_w / word_cap, 4),
        "markAspect": round(mw / mh, 4),
    }
    json.dump(geo, open(f"{BRAND}/lockup-geometry.json", "w"), indent=2)

    for name, (_, _, w, h, layers) in out.items():
        svg = (f'<?xml version="1.0" encoding="UTF-8"?>\n'
               f'<!-- EDURA {name} lockup. Mark vectorised from the brand kit board; '
               f'wordmark outlines extracted from Poppins (scripts/brand2_lockup.py). '
               f'Do not hand-edit. -->\n'
               f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.3f} {h:.3f}" '
               f'role="img" aria-label="Edura">\n  {layers}\n</svg>\n')
        open(f"{BRAND}/edura-logo-{name}.svg", "w").write(svg)

    metrics = {
        "wordmark": {"font": "Poppins", "weight": a.weight, "text": WORD,
                     "capHeightUnits": word_cap, "advance": round(word_w, 3),
                     "trackingEm": TRACKING_EM},
        "mark": {"viewBox": vb, "width": mw, "height": mh, "aspect": round(mw / mh, 4)},
        "lockups": {k: {"width": round(v[2], 3), "height": round(v[3], 3),
                        "aspect": round(v[2] / v[3], 4)} for k, v in out.items()},
        "geometry": {"stackGapInCapHeights": STACK_GAP, "sideGapInMarkWidths": SIDE_GAP},
    }
    json.dump(metrics, open(f"{BRAND}/lockup-metrics.json", "w"), indent=2)
    print(json.dumps(metrics["lockups"], indent=2))

    if a.preview:
        for name, (_, _, w, h, _) in out.items():
            subprocess.run(["rsvg-convert", "-w", "900", "-b", "#FBF8F2",
                            f"{BRAND}/edura-logo-{name}.svg",
                            "-o", f"/tmp/lockup-{name}.png"], check=True)
        print("previews written to /tmp/lockup-*.png")


main()

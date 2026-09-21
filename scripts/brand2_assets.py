#!/usr/bin/env python3
"""
EDURA v2 brand assets.

Derives the full deliverable set from the two primitives:
  brand/v2/edura-mark.svg        (vectorised from the kit board)
  brand/v2/edura-logo-*.svg      (mark + Poppins wordmark lockups)

Produces: reverse/mono lockups, the signature lockup with the kit tagline,
app icons, the favicon set, and the Open Graph card - then installs the web
assets into app/public so the metadata in the locale layout resolves.

Run: python3 scripts/brand2_assets.py
"""
import json
import os
import re
import subprocess
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

ROOT = "/var/minis/shared/edura"
BRAND = f"{ROOT}/brand/v2"
PUBLIC = f"{ROOT}/app/public"
PUB_BRAND = f"{PUBLIC}/brand"
TMP = "/tmp/edura-fonts"
os.makedirs(TMP, exist_ok=True)
for d in (PUB_BRAND, f"{PUB_BRAND}/icons", f"{PUB_BRAND}/logo"):
    os.makedirs(d, exist_ok=True)

PALETTE = {  # final tokens - keep in sync with app/src/styles/globals.css
    "turquoise": "#3F9DA5", "terracotta": "#BF6743", "sand": "#D7C097",
    "graphite": "#33383A", "deep": "#17434A", "deep900": "#0E2E33",
    "pearl": "#FBF8F2", "white": "#FFFFFF",
}


def _merge(acc, box):
    if acc is None:
        return box
    return (min(acc[0], box[0]), min(acc[1], box[1]),
            max(acc[2], box[2]), max(acc[3], box[3]))


def fetch(url, dest):
    if not os.path.exists(dest):
        with urllib.request.urlopen(urllib.request.Request(
                url, headers={"User-Agent": "Mozilla/5.0"}), timeout=90) as r:
            open(dest, "wb").write(r.read())
    return dest


def arabic_font(weight=600):
    """Noto Kufi Arabic, instantiated at the required weight (it ships as a
    variable font). Used for the Arabic signature lockup."""
    dest = f"{TMP}/NotoKufiArabic-{weight}.ttf"
    if os.path.exists(dest):
        return dest
    var = fetch("https://github.com/google/fonts/raw/main/ofl/notokufiarabic/"
                "NotoKufiArabic%5Bwght%5D.ttf", f"{TMP}/NotoKufiArabic-var.ttf")
    inst = instancer.instantiateVariableFont(TTFont(var), {"wght": weight})
    inst.save(dest)
    return dest


def shaped_text_paths(ttf_path, text, cap_height, tracking_em=0.0):
    """Arabic (or any complex script) text -> SVG paths, shaped with HarfBuzz.

    Drawing a TTF's glyphs directly by character code produces isolated
    letterforms; Arabic needs joining. HarfBuzz returns the shaped glyph ids
    and advances, which are then drawn through fontTools.
    """
    import uharfbuzz as hb
    data = open(ttf_path, "rb").read()
    face = hb.Face(data)
    hbfont = hb.Font(face)
    upm = face.upem
    buf = hb.Buffer()
    buf.add_str(text)
    buf.direction = "rtl"
    buf.script = "Arab"
    buf.language = "ar"
    hb.shape(hbfont, buf)
    font = TTFont(ttf_path)
    gs = font.getGlyphSet()
    cap = getattr(font["OS/2"], "sCapHeight", None) or int(upm * 0.7)
    scale = cap_height / cap
    out, x = [], 0.0
    bx = [None]
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = font.getGlyphName(info.codepoint)
        t = Transform(scale, 0, 0, -scale,
                      x + pos.x_offset * scale, pos.y_offset * scale)
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, t))
        d = pen.getCommands()
        if d:
            out.append((x, d))
        bp = BoundsPen(gs)
        gs[name].draw(TransformPen(bp, t))
        if bp.bounds:
            bx[0] = _merge(bx[0], bp.bounds)
        x += pos.x_advance * scale + tracking_em * upm * scale
    return out, x, bx[0]


def static_font(family, weight):
    """Return a path to a static TTF for (family, weight)."""
    fname = f"{family.replace(' ', '')}-{weight}.ttf"
    dest = f"{TMP}/{fname}"
    if os.path.exists(dest):
        return dest
    if family == "Poppins":
        url = f"https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-{weight}.ttf"
        w = {"600": "SemiBold", "700": "Bold"}[str(weight)]
        url = f"https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-{w}.ttf"
        return fetch(url, dest)
    if family == "Open Sans":
        var = fetch("https://github.com/google/fonts/raw/main/ofl/opensans/"
                    "OpenSans%5Bwdth%2Cwght%5D.ttf", f"{TMP}/OpenSans-var.ttf")
        f = TTFont(var)
        inst = instancer.instantiateVariableFont(f, {"wght": weight, "wdth": 100})
        inst.save(dest)
        return dest
    raise SystemExit(f"unsupported family {family}")


def text_paths(family, weight, text, size, tracking_em=0.0, cap_height=None):
    """Text -> list of SVG path strings, scaled so cap height == required value."""
    ttf = static_font(family, weight)
    font = TTFont(ttf)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    scale = 1.0
    if cap_height is not None:
        cap = getattr(font["OS/2"], "sCapHeight", None) or int(upm * 0.7)
        scale = cap_height / cap
    else:
        scale = size / upm
    out, x = [], 0.0
    bx = [None]
    for ch in text:
        gname = cmap.get(ord(ch))
        if gname is None:
            x += 0.5 * upm * scale
            continue
        t = Transform(scale, 0, 0, -scale, x, 0)
        pen = SVGPathPen(gs)
        gs[gname].draw(TransformPen(pen, t))
        d = pen.getCommands()
        if d:
            out.append((x, d))
        bp = BoundsPen(gs)
        gs[gname].draw(TransformPen(bp, t))
        if bp.bounds:
            bx[0] = _merge(bx[0], bp.bounds)
        x += gs[gname].width * scale + tracking_em * upm * scale
    return out, x, bx[0]


def group(paths, fill, extra=""):
    return (f'<g fill="{fill}"{extra}>'
            + "".join(f'<path d="{d}"/>' for _, d in paths) + "</g>")


def recolour(svg, mapping):
    """Re-fill an SVG produced by the vectoriser."""
    for k, v in mapping.items():
        svg = svg.replace(f'fill="{k}"', f'fill="{v}"')
    return svg


def raster(svg_path, out, width, background=None, height=None):
    cmd = ["rsvg-convert", "-w", str(width)]
    if height:
        cmd += ["-h", str(height)]
    if background:
        cmd += ["-b", background]
    cmd += [svg_path, "-o", out]
    subprocess.run(cmd, check=True)


def write(path, text):
    open(path, "w").write(text)
    return path


def main():
    tagline_en = "Your Path to Educational Success"
    tagline_ar = "طريقك إلى النجاح التعليمي"

    mark = open(f"{BRAND}/edura-mark.svg").read()
    _, _, mw, mh = (float(v) for v in
                    re.search(r'viewBox="([^"]+)"', mark).group(1).split())
    mark_body = re.search(r"<svg[^>]*>(.*)</svg>", mark, re.S).group(1).strip()
    mono_body = re.search(r"<svg[^>]*>(.*)</svg>",
                          open(f"{BRAND}/edura-mark-mono.svg").read(), re.S).group(1).strip()

    written = []

    # --- lockup variants -------------------------------------------------
    for form in ("stacked", "horizontal"):
        src = open(f"{BRAND}/edura-logo-{form}.svg").read()
        for suffix, mark_map, word in (
            ("reverse", {PALETTE["turquoise"]: "#FFFFFF", PALETTE["terracotta"]: "#FFFFFF",
                         PALETTE["sand"]: "#FFFFFF"}, "#FFFFFF"),
            ("mono", {PALETTE["turquoise"]: "currentColor",
                      PALETTE["terracotta"]: "currentColor",
                      PALETTE["sand"]: "currentColor"}, "currentColor"),
        ):
            svg = recolour(src, mark_map)
            svg = svg.replace(f'fill="{PALETTE["turquoise"]}"', f'fill="{word}"')
            svg = svg.replace("<!-- EDURA", f"<!-- EDURA {suffix}")
            written.append(write(f"{BRAND}/edura-logo-{form}-{suffix}.svg", svg))

    # --- signature lockup (mark + wordmark + kit tagline) ----------------
    src = open(f"{BRAND}/edura-logo-stacked.svg").read()
    _, _, lw, lh = (float(v) for v in
                    re.search(r'viewBox="([^"]+)"', src).group(1).split())
    cap = 0.2336 * mh
    body = re.search(r"<svg[^>]*>(.*)</svg>", src, re.S).group(1).strip()

    def build_signature(tagline, ttf, shaper, out_name, lang, tracking=0.006):
        """Solve the tagline cap height so its width matches the wordmark's -
        that equality is the lockup rule the kit's board obeys - then place it
        by its INK bounds, not its baseline, so descenders are never clipped."""
        def measure(ratio):
            if shaper == "hb":
                return fn_hb(ttf, tagline, cap * ratio, tracking_em=tracking)
            return fn_tt("Open Sans", 600, tagline, 0, tracking_em=tracking,
                         cap_height=cap * ratio)

        fn_hb, fn_tt = shaped_text_paths, text_paths
        lo, hi = 0.05, 0.60
        for _ in range(40):
            mid = (lo + hi) / 2
            if measure(mid)[1] < lw:
                lo = mid
            else:
                hi = mid
        ratio = (lo + hi) / 2
        tg, tw, tb = measure(ratio)
        ink_w = tb[2] - tb[0]
        pad = 0.06 * cap
        total_w = max(lw, ink_w + 2 * pad)
        gap = 0.34 * cap
        # ink top of the tagline lands `gap` below the lockup's bottom
        ty = lh + gap - tb[1]
        total_h = ty + tb[3]
        svg = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               f'<!-- EDURA signature lockup, {lang} tagline. -->\n'
               f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w:.2f} '
               f'{total_h:.2f}" role="img" aria-label="Edura - {tagline}">\n'
               f'  <g transform="translate({(total_w - lw) / 2:.2f} 0)">{body}</g>\n'
               f'  <g fill="{PALETTE["graphite"]}" '
               f'transform="translate({(total_w - ink_w) / 2 - tb[0]:.2f} {ty:.2f})">'
               + "".join(f'<path d="{d}"/>' for _, d in tg) + "</g>\n</svg>\n")
        written.append(write(f"{BRAND}/{out_name}", svg))
        return {"taglineCapRatio": round(ratio, 4), "width": round(total_w, 1),
                "height": round(total_h, 1), "inkWidth": round(ink_w, 1)}

    sig_metrics = {
        "en": build_signature(tagline_en, None, "tt", "edura-logo-signature.svg", "English"),
        "ar": build_signature(tagline_ar, arabic_font(600), "hb",
                              "edura-logo-signature-ar.svg", "Arabic", tracking=0.0),
    }

    # --- app icon + favicons --------------------------------------------
    # A flat cream tile keeps the mark's three colours readable; the reverse
    # tile is the dark-surface / maskable variant.
    icon_svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
                f'<rect width="1024" height="1024" rx="224" fill="{PALETTE["pearl"]}"/>'
                f'<g transform="translate(122 152) scale(0.4641)">{mark_body}</g></svg>')
    icon_rev = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
                f'<rect width="1024" height="1024" rx="224" fill="{PALETTE["deep"]}"/>'
                f'<g transform="translate(122 152) scale(0.4641)">{mono_body}</g>'
                f'</svg>').replace("currentColor", "#FFFFFF")
    mask_svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
                f'<rect width="1024" height="1024" fill="{PALETTE["deep"]}"/>'
                f'<g transform="translate(205 255) scale(0.3675)">{mono_body}</g>'
                f'</svg>').replace("currentColor", "#FFFFFF")

    for name, s in (("icon", icon_svg), ("icon-reverse", icon_rev), ("maskable", mask_svg)):
        written.append(write(f"{BRAND}/edura-app-{name}.svg", s))
    written.append(write(f"{PUB_BRAND}/icon.svg", icon_svg))

    raster(f"{BRAND}/edura-app-icon.svg", f"{BRAND}/edura-app-icon-1024.png", 1024)
    raster(f"{BRAND}/edura-app-icon-reverse.svg",
           f"{BRAND}/edura-app-icon-reverse-1024.png", 1024)
    raster(f"{BRAND}/edura-app-maskable.svg", f"{BRAND}/edura-app-maskable-512.png", 512)

    icons = [(16, "favicon-16.png"), (32, "favicon-32.png"), (48, "favicon-48.png"),
             (96, "favicon-96.png"), (180, "apple-touch-icon.png"),
             (192, "favicon-192.png"), (512, "favicon-512.png")]
    for px, fname in icons:
        raster(f"{BRAND}/edura-app-icon.svg", f"{PUB_BRAND}/icons/{fname}", px)
    # rsvg writes PNG whatever the extension; build a real multi-size ICO
    tmp_ico = []
    for px in (16, 32, 48):
        p = f"/tmp/ico-{px}.png"
        raster(f"{BRAND}/edura-app-icon.svg", p, px)
        tmp_ico.append(p)
    subprocess.run(["magick"] + tmp_ico + [f"{PUB_BRAND}/icons/favicon.ico"], check=True)
    raster(f"{BRAND}/edura-app-maskable.svg", f"{PUB_BRAND}/icons/maskable-512.png", 512)
    raster(f"{BRAND}/edura-app-icon-1024.png" if False else f"{BRAND}/edura-app-icon.svg",
           f"{PUB_BRAND}/icons/apple-touch-icon-180.png", 180)

    # --- logo files for the web -----------------------------------------
    for f in os.listdir(BRAND):
        if f.startswith("edura-") and f.endswith(".svg"):
            write(f"{PUB_BRAND}/logo/{f}", open(f"{BRAND}/{f}").read())

    # --- Open Graph card -------------------------------------------------
    og_w, og_h = 1200, 630
    lock = open(f"{BRAND}/edura-logo-signature.svg").read()
    _, _, sw, sh = (float(v) for v in
                    re.search(r'viewBox="([^"]+)"', lock).group(1).split())
    lock_body = re.search(r"<svg[^>]*>(.*)</svg>", lock, re.S).group(1).strip()
    scale = min(430 / sw, 330 / sh)
    og = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {og_w} {og_h}">\n'
          f'  <rect width="{og_w}" height="{og_h}" fill="{PALETTE["pearl"]}"/>\n'
          f'  <rect x="0" y="0" width="{og_w}" height="14" fill="{PALETTE["turquoise"]}"/>\n'
          f'  <rect x="0" y="{og_h - 14}" width="{og_w}" height="14" '
          f'fill="{PALETTE["terracotta"]}"/>\n'
          f'  <g transform="translate({(og_w - sw * scale) / 2:.1f} '
          f'{(og_h - sh * scale) / 2:.1f}) scale({scale:.4f})">{lock_body}</g>\n'
          f'</svg>\n')
    written.append(write(f"{BRAND}/edura-og.svg", og))
    raster(f"{BRAND}/edura-og.svg", f"{PUB_BRAND}/og-image.png", og_w, height=og_h)

    summary = {"files": len(written),
               "public": {"brand": sorted(os.listdir(PUB_BRAND)),
                          "icons": sorted(os.listdir(f"{PUB_BRAND}/icons")),
                          "logo": sorted(os.listdir(f"{PUB_BRAND}/logo"))},
               "iconSize": os.path.getsize(f"{PUB_BRAND}/icons/favicon-512.png")}
    json.dump(summary, open(f"{BRAND}/assets-manifest.json", "w"), indent=2)
    print(json.dumps(summary, indent=2))


main()

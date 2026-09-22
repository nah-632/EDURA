#!/usr/bin/env python3
"""
Visual revision 2026-09-22 — palette and typography.

One-shot migration, kept in the repository as the record of exactly what
changed and why. Run against app/src/styles/globals.css.

What and why
------------
The operator's brief: derive the colour system from the logo's terracotta sail,
use a warm neutral page with dark navy text, and keep ONE accent used sparingly.
The dark teal gradient hero, the repeated dark-green sections, the tracked
eyebrow labels, the arrows on every button and the italic two-tone headline all
read as generated-site defaults and are gone.

In token terms:
  deep teal  -> navy            (headings, the few dark surfaces left)
  turquoise  -> demoted to the logo only; its UI roles move to terracotta
  terracotta -> THE accent (links, focus, buttons, highlights)
  page       -> warm neutral, slightly warmer than before

Idempotent: after one run the old token names are gone, so a second run is a
no-op.
"""
import re
import sys

NEW_TOKENS = """  /* ---- Palette, revision 2 (2026-09-22) -------------------------------
     Derived from the logo: the terracotta sail is the accent, the paper is
     warm neutral, the text is navy. Verified by scripts/check-contrast.mjs.
     ---------------------------------------------------------------------- */
  --navy: #16305a;          /* headings and the few dark surfaces         */
  --navy-700: #1e3e6e;
  --navy-900: #0f2244;
  --brand: #3f9da5;         /* logo turquoise - graphics only, never text */
  --accent: #bf6743;        /* terracotta: THE accent                     */
  --accent-strong: #9e5231; /* terracotta that carries white text, and links */
  --accent-hover: #8a4629;
  --accent-tint: #f7e9e1;
  --sand: #d7c097;          /* sandy beige - warm secondary surface       */
  --sand-tint: #f3eada;
  --warm: #faf7f1;          /* the page                                   */
  --cream: #f4efe4;         /* the warm band                              */

  /* Support (ratio-verified by scripts/check-contrast.mjs) */
  --ink: #2c3956;
  --ink-soft: #4a5570;
  --ink-mute: #657087;
  --line: #e8e0d2;
  --line-strong: #8b8375;
  --ok: #2e7d5b;
  --warn: #8a5410;
  --danger: #b4392c;
  --gold: #a8813c;
"""

# literal -> literal
HEX = {
    "#17434a": "#16305a", "#1f545c": "#1e3e6e", "#0e2e33": "#0f2244",
    "#1f6b73": "#1e3e6e", "#1c6068": "#26477c", "#0b282c": "#0c1c38",
    "#bfe3e6": "#d7c097", "#c6e2e4": "#e3d3b6", "#d9edef": "#f0e6d5",
    "#f6fbfb": "#faf7f1", "#dfeeef": "#f3eada", "#f0f7f7": "#faf7f1",
    "#7fc4ca": "#d7c097", "#2a6e75": "#9e5231",
    "#33383a": "#16305a", "#4a5254": "#4a5570", "#666e70": "#657087",
    "#e7dfd2": "#e8e0d2",
}

# rgba(r,g,b,a) -> rgba(r,g,b,a) ; alpha preserved
RGBA = {
    (23, 67, 74): (22, 48, 90),      # deep teal  -> navy
    (14, 46, 51): (15, 34, 68),      # deep-900   -> navy-900
    (42, 110, 117): (158, 82, 49),   # brand-strong -> accent-strong
    (127, 196, 202): (215, 192, 151),  # brand-light -> sand
    (63, 157, 165): (191, 103, 67),  # turquoise -> terracotta
    (158, 82, 49): (158, 82, 49),
}

TOKEN_RENAMES = [
    ("var(--brand-tint-soft)", "var(--warm)"),
    ("var(--brand-tint)", "var(--sand-tint)"),
    ("var(--brand-light)", "var(--sand)"),
    ("var(--brand-strong)", "var(--accent-strong)"),
    ("var(--deep-900)", "var(--navy-900)"),
    ("var(--deep-700)", "var(--navy-700)"),
    ("var(--deep)", "var(--navy)"),
]

FONT_SWAP = [
    ('--font-body-latin: "Open Sans", system-ui, -apple-system, "Segoe UI", sans-serif;',
     '--font-body-latin: "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif;'),
    ('--font-body-arabic: "Noto Kufi Arabic", system-ui, -apple-system, sans-serif;',
     '--font-body-arabic: "IBM Plex Sans Arabic", system-ui, -apple-system, sans-serif;'),
    ('--font-display-latin: "Poppins", "Open Sans", system-ui, sans-serif;',
     '--font-display-latin: "Fraunces", Georgia, "Times New Roman", serif;'),
    ('--font-display-arabic: "Reem Kufi", "Noto Kufi Arabic", system-ui, sans-serif;',
     '--font-display-arabic: "El Messiri", "IBM Plex Sans Arabic", system-ui, sans-serif;'),
]


def main(path):
    src = open(path).read()
    original = src

    # 1. the token block
    src = re.sub(r"  /\* ---- Brand palette.*?--gold: #[0-9a-f]{6};\n",
                 NEW_TOKENS, src, count=1, flags=re.S)

    # 2. font stacks
    for old, new in FONT_SWAP:
        if old not in src:
            print(f"  ! font stack not found: {old[:48]}...")
        src = src.replace(old, new)

    # 3. token names
    for old, new in TOKEN_RENAMES:
        src = src.replace(old, new)

    # 4. section modifier that named the old colour
    src = src.replace(".section--deep", ".section--navy")
    src = src.replace("--deep-", "--navy-")   # any stragglers

    # 5. literals
    for old, new in sorted(HEX.items(), key=lambda kv: -len(kv[0])):
        src = re.sub(re.escape(old), new, src, flags=re.I)

    def repl_rgba(m):
        vals = [int(v.strip()) for v in m.group(1).split(",")[:3]]
        alpha = m.group(1).split(",")[3].strip()
        rgb = RGBA.get(tuple(vals))
        return m.group(0) if not rgb else "rgba(%d, %d, %d, %s)" % (*rgb, alpha)

    src = re.sub(r"rgba\(([0-9]+,\s*[0-9]+,\s*[0-9]+,\s*[0-9.]+)\)", repl_rgba, src)

    if src == original:
        print("no change (already migrated?)")
        return
    open(path, "w").write(src)

    print("migrated", path)
    for label, pat in (("old token names", r"--(?:deep|brand-tint|brand-strong|brand-light)[a-z0-9-]*"),
                       ("old hex", r"#(?:17434a|1f545c|0e2e33|3f9da5|dfeeef|2a6e75|7fc4ca)")):
        left = sorted(set(re.findall(pat, src, re.I)))
        print(f"  leftover {label}: {left or 'none'}")
    print("  navy refs: %d | accent refs: %d | logo(teal) refs: %d" % (
        src.count("var(--navy"), src.count("var(--accent"), src.count("var(--brand)")))


main(sys.argv[1] if len(sys.argv) > 1 else "src/styles/globals.css")

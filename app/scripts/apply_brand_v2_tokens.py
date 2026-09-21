#!/usr/bin/env python3
"""
Migrate the EDURA design system from brand v1 (navy/blue) to brand v2
(turquoise/terracotta/sand/graphite, per the client's brand kit board).

One-shot migration, kept in the repo as the record of exactly what changed.
Idempotent: running it twice is a no-op because the v1 token names are gone
after the first run.

Run: python3 scripts/apply_brand_v2_tokens.py <file.css>
"""
import re
import sys

NEW_TOKENS = """  /* ---- Brand palette, v2 (measured from the client brand kit board) ---- */
  --deep: #17434a;          /* deep teal: headings, dark brand surfaces   */
  --deep-700: #1f545c;
  --deep-900: #0e2e33;
  --brand: #3f9da5;         /* Bahraini turquoise - identity + graphics   */
  --brand-strong: #2a6e75;  /* turquoise that can carry text (AA)         */
  --brand-light: #7fc4ca;
  --brand-tint: #dfeeef;    /* turquoise wash surfaces                    */
  --brand-tint-soft: #f0f7f7;
  --accent: #bf6743;        /* terracotta - the action colour             */
  --accent-strong: #9e5231; /* terracotta that carries white text (AA)    */
  --accent-hover: #8a4629;
  --accent-tint: #f8e9e1;
  --sand: #d7c097;          /* sandy beige - warm secondary surface       */
  --sand-tint: #f3eada;
  --warm: #fbf8f2;          /* Pearl White - the page                      */
  --graphite: #33383a;      /* kit graphite                               */

  /* Support (ratio-verified by scripts/check-contrast.mjs) */
  --ink: #33383a;
  --ink-soft: #4a5254;
  --ink-mute: #666e70;
  --line: #e7dfd2;
  --line-strong: #8b8375;   /* >=3:1 on the page: form/control borders    */
  --ok: #2e7d5b;
  --warn: #8a5410;
  --danger: #b4392c;
  --gold: #a8813c;
"""

# hex -> hex
HEX = {
    "#102a56": "#17434a", "#16386e": "#1f545c", "#0b1e3e": "#0e2e33",
    "#2563eb": "#9e5231", "#1d4ed8": "#8a4629", "#60a5fa": "#7fc4ca",
    "#eff6ff": "#dfeeef", "#fafbfc": "#fbf8f2", "#172033": "#33383a",
    "#47536b": "#4a5254", "#6b7280": "#666e70", "#e3e8f0": "#e7dfd2",
    "#cdd6e4": "#8b8375", "#0f7b4f": "#2e7d5b", "#b45309": "#8a5410",
    "#b42318": "#b4392c", "#b08442": "#a8813c", "#1b4a9c": "#1f6b73",
    # blue-family tints used directly in components below
    "#cfe0ff": "#bfe3e6", "#cbdffb": "#c6e2e4", "#f7fbff": "#f6fbfb",
    "#d7e5ff": "#c6e2e4", "#eff4ff": "#dfeeef", "#d5e2ff": "#c6e2e4",
    "#e6eeff": "#d9edef", "#1e3a8a": "#17434a", "#eef1f6": "#efeae0",
    "#f6f8fb": "#f7f3eb", "#f0e0c4": "#eedcb6", "#8a6420": "#7a5410",
    "#fdf7ec": "#fdf6e7", "#fff8ec": "#fdf6e7", "#f6e2c0": "#eedcb6",
    "#8a5a12": "#7a5410", "#fef3f2": "#fdeeec", "#fbd7d3": "#f6d2cd",
    "#eefaf3": "#e9f5ef", "#cdeedd": "#c3e4d4", "#f0d3a8": "#eedcb6",
    "#fffaf1": "#fef9ef", "#0a1c3a": "#0b282c", "#1a4685": "#1c6068",
    "#173f7d": "#1f6b73", "#1e3a8a": "#17434a",
}

# rgba(...) -> rgba(...)  (brand-family swaps; alpha preserved)
RGBA = {
    (16, 42, 86): (23, 67, 74),      # navy -> deep
    (6, 17, 38): (14, 46, 51),       # navy-900 -> deep-900
    (8, 21, 46): (14, 46, 51),
    (4, 16, 38): (11, 40, 44),
    (4, 12, 30): (11, 40, 44),
    (37, 99, 235): (158, 82, 49),    # blue -> terracotta-strong
    (96, 165, 250): (127, 196, 202),  # light blue -> brand-light
    (233, 240, 255): (223, 238, 239),
    (226, 236, 255): (223, 238, 239),
    (219, 229, 247): (231, 240, 240),
    (206, 222, 248): (198, 226, 228),
    (255, 205, 138): (215, 192, 151),  # warm gold glow -> sand
}

root_re = re.compile(r"(:root \{)(.*?)(\n\})", re.S)


def main(path):
    src = open(path).read()
    original = src

    # 1. token block
    def repl_root(m):
        body = m.group(2)
        body = re.sub(
            r"  /\* Brand palette.*?--gold: #[0-9a-f]{6};\n",
            NEW_TOKENS, body, flags=re.S)
        # tolerate the v1 block layout variations
        body = re.sub(
            r"  --navy: #[0-9a-f]{6};\n(?:  --[a-z0-9-]+: #[0-9a-f]{3,8};\n)+",
            NEW_TOKENS, body)
        return m.group(1) + body + m.group(3)

    src = root_re.sub(repl_root, src, count=1)

    # 2. legacy token names
    for old, new in (
        ("var(--navy-900)", "var(--deep-900)"),
        ("var(--navy-700)", "var(--deep-700)"),
        ("var(--navy)", "var(--deep)"),
        ("var(--blue-600)", "var(--accent-hover)"),
        ("var(--blue-400)", "var(--brand-light)"),
        ("var(--blue-pale)", "var(--brand-tint)"),
        ("var(--blue)", "var(--brand-strong)"),
    ):
        src = src.replace(old, new)

    # 3. the primary action colour: buttons were blue, they are terracotta now
    src = src.replace("--btn-bg: var(--brand-strong);",
                      "--btn-bg: var(--accent-strong);")
    src = src.replace("--btn-border: var(--brand-strong);",
                      "--btn-border: var(--accent-strong);")

    # 4. hex colours
    for old, new in sorted(HEX.items(), key=lambda kv: -len(kv[0])):
        src = re.sub(re.escape(old), new, src, flags=re.I)

    # 5. rgba families
    def repl_rgba(m):
        vals = [int(v.strip()) for v in m.group(1).split(",")[:3]]
        alpha = m.group(1).split(",")[3].strip()
        rgb = RGBA.get(tuple(vals))
        if not rgb:
            return m.group(0)
        return "rgba(%d, %d, %d, %s)" % (*rgb, alpha)

    src = re.sub(r"rgba\(([0-9]+,\s*[0-9]+,\s*[0-9]+,\s*[0-9.]+)\)", repl_rgba, src)

    if src == original:
        print("no change (already migrated?)")
        return
    open(path, "w").write(src)
    print("migrated", path)
    leftover = sorted(set(re.findall(r"--(?:navy|blue)[a-z0-9-]*", src)))
    print("leftover v1 token names:", leftover or "none")
    left_hex = sorted(set(re.findall(r"#(?:102a56|2563eb|60a5fa|eff6ff)", src, re.I)))
    print("leftover v1 hex:", left_hex or "none")


main(sys.argv[1] if len(sys.argv) > 1 else "src/styles/globals.css")

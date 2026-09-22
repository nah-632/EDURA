#!/usr/bin/env python3
"""
Remove the visual patterns the 2026-09-22 brief names as generated-site tells.

  * the tracked all-caps eyebrow label above a heading, and its leading dash
  * the "→" / "←" appended to every button and link
  * the italic, differently-coloured second line of a display heading

Kept in the repo as the record of the removal. Idempotent: a second run finds
nothing to do.

Every removal is structural (the element goes) rather than a CSS override, so
the markup stops claiming these things were ever meant to be there.

Run from the app directory:  python3 scripts/strip-templated-patterns.py
"""
import os
import re

SRC = "src"
stats = {"kicker": 0, "arrow": 0, "em": 0, "files": 0}


def walk():
    for root, _dirs, files in os.walk(SRC):
        if any(p in root for p in ("node_modules", ".next", "preview")):
            continue
        for f in files:
            if f.endswith((".tsx", ".ts")):
                yield os.path.join(root, f)


def strip_kickers(text):
    # single-line: <span className="kicker ...">…</span>
    text, n1 = re.subn(
        r'[ \t]*<span className="kicker[^"]*"[^>]*>[^<]*</span>\n',
        "", text)
    # multi-line: attributes then children then </span>
    text, n2 = re.subn(
        r'[ \t]*<span className="kicker[^"]*"[^>]*>\n(?:.*?\n)*?[ \t]*</span>\n',
        "", text)
    return text, n1 + n2


def strip_arrows(text):
    # <span className="btn__arrow" aria-hidden="true">\n  →\n</span>
    text, n1 = re.subn(
        r'[ \t]*<span className="btn__arrow"[^>]*>\s*(?:→|←)?\s*</span>\n',
        "", text)
    text, n2 = re.subn(
        r'[ \t]*<span className="btn__arrow"[^>]*>\n\s*(?:→|←)\n\s*</span>\n',
        "", text)
    return text, n1 + n2


def strip_em(text):
    # the class only: the wrapper is a plain span, and leaving it keeps the
    # two-line structure of the heading intact
    text, n = re.subn(r'\s*className="display__em"', "", text)
    return text, n


def main():
    for path in walk():
        original = open(path, encoding="utf-8").read()
        text = original
        text, k = strip_kickers(text)
        text, a = strip_arrows(text)
        text, e = strip_em(text)
        if text != original:
            open(path, "w", encoding="utf-8").write(text)
            stats["kicker"] += k
            stats["arrow"] += a
            stats["em"] += e
            stats["files"] += 1
    print(f"files touched {stats['files']} | kickers {stats['kicker']} | "
          f"arrows {stats['arrow']} | display__em {stats['em']}")
    remaining = []
    for path in walk():
        t = open(path, encoding="utf-8").read()
        for label, pat in (("kicker", r'className="kicker'),
                           ("arrow", r"btn__arrow"),
                           ("display__em", r"display__em")):
            if re.search(pat, t):
                remaining.append(f"{path}: {label}")
    print("remaining:", remaining or "none")


main()

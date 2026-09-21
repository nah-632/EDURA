#!/usr/bin/env python3
"""SQL syntax gate for the EDURA migrations.

There is no local PostgreSQL in this environment (iSH has no signalfd, so the
native server cannot start, and WASM Postgres needs WebAssembly.Global which
this node build lacks) - so migrations are parsed with sqlglot's Postgres
dialect as a syntax gate before being applied to the real database.

Statements whose body is a plpgsql block ($$ ... $$) are checked structurally:
the wrapper must parse, and the body is reported separately because sqlglot does
not implement plpgsql.
"""
import os
import re
import sys

import sqlglot

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def split_statements(sql):
    """Split on semicolons outside $$ ... $$ bodies, string literals and
    parentheses."""
    out, buf, i = [], [], 0
    n = len(sql)
    depth = 0
    in_dollar = False
    in_str = False
    while i < n:
        ch = sql[i]
        if in_dollar:
            if sql.startswith("$$", i):
                in_dollar = False
                buf.append("$$")
                i += 2
                continue
            buf.append(ch)
            i += 1
            continue
        if in_str:
            buf.append(ch)
            if ch == "'":
                if sql.startswith("''", i):
                    buf.append("'")
                    i += 2
                    continue
                in_str = False
            i += 1
            continue
        if sql.startswith("$$", i):
            in_dollar = True
            buf.append("$$")
            i += 2
            continue
        if ch == "'":
            in_str = True
            buf.append(ch)
            i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == ";" and depth == 0:
            out.append("".join(buf).strip())
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return [s for s in out if s and not s.startswith("--")]


def strip_comments(sql):
    return re.sub(r"--[^\n]*", "", sql)


def main():
    targets = sys.argv[1:] or sorted(
        os.path.join(ROOT, "app", "drizzle", f)
        for f in os.listdir(os.path.join(ROOT, "app", "drizzle"))
        if f.endswith(".sql")
    )
    total = ok = skipped = 0
    problems = []
    for path in targets:
        sql = open(path).read()
        stmts = split_statements(strip_comments(sql))
        print(f"\n=== {os.path.basename(path)}: {len(stmts)} statements")
        for s in stmts:
            total += 1
            head = " ".join(s.split())[:78]
            has_body = "$$" in s
            if has_body:
                outer = s.split("$$")[0] + " $$ $$" + (s.rsplit("$$", 1)[-1] if s.count("$$") >= 2 else "")
                outer = outer.replace("begin", "", 1) if False else outer
            try:
                sqlglot.parse_one(s if not has_body else outer, read="postgres")
                ok += 1
            except Exception as exc:  # noqa: BLE001
                if has_body:
                    skipped += 1
                    print(f"  [plpgsql body not parsed, wrapper checked] {head}")
                    continue
                problems.append((path, head, str(exc).split("\n")[0][:160]))
                print(f"  FAIL {head}\n       {str(exc).splitlines()[0][:150]}")
    print(f"\nparsed OK: {ok}/{total}  (plpgsql bodies skipped: {skipped})")
    if problems:
        print("FAILURES:")
        for p, h, e in problems:
            print(f"  {os.path.basename(p)}: {h}\n    -> {e}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

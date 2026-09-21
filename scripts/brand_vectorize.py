#!/usr/bin/env python3
"""Vector reconstruction of the EDURA symbol — traced from the provided art.

Fast path: trace at the 3x raster resolution (the source mark is 108x162 px
upscaled to 324x486), simplify, then emit smooth cubic Beziers with hard
corners preserved where the outline actually has a corner.
"""
import json
import math
import os
import statistics
import sys
from collections import defaultdict

sys.setrecursionlimit(100000)
from PIL import Image

BRAND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "brand")
ASSETS = os.path.join(BRAND, "assets")

mk3 = Image.open(os.path.join(ASSETS, "png", "edura-mark@3x.png")).convert("RGBA")
# De-noise before tracing: a Gaussian blur removes JPEG halo/ringing so the
# traced outline follows the real geometry instead of compression artefacts.
SMOOTH = float(os.environ.get("EDURA_TRACE_BLUR", "4"))
EPS = float(os.environ.get("EDURA_TRACE_EPS", "2.0"))
if SMOOTH:
    from PIL import ImageFilter
    a_blur = mk3.getchannel("A").filter(ImageFilter.GaussianBlur(SMOOTH))
    mk3.putalpha(a_blur)
W3, H3 = mk3.size
alpha = mk3.getchannel("A").load()
rgb = mk3.convert("RGB").load()

inside = [[alpha[x, y] > 128 for x in range(W3)] for y in range(H3)]
print("grid", W3, H3, "inside", sum(sum(r) for r in inside))


def get(x, y):
    if x < 0 or y < 0 or x >= W3 or y >= H3:
        return False
    return inside[y][x]


T, R, B, L = (0.5, 0), (1, 0.5), (0.5, 1), (0, 0.5)
MS = {
    (0, 0, 0, 0): [], (0, 0, 0, 1): [(L, B)], (0, 0, 1, 0): [(B, R)],
    (0, 0, 1, 1): [(L, R)], (0, 1, 0, 0): [(T, R)], (0, 1, 0, 1): [(T, R), (L, B)],
    (0, 1, 1, 0): [(T, B)], (0, 1, 1, 1): [(T, L)], (1, 0, 0, 0): [(T, L)],
    (1, 0, 0, 1): [(T, B)], (1, 0, 1, 0): [(T, L), (B, R)], (1, 0, 1, 1): [(T, R)],
    (1, 1, 0, 0): [(L, R)], (1, 1, 0, 1): [(B, R)], (1, 1, 1, 0): [(L, B)],
    (1, 1, 1, 1): [],
}
segs = []
for y in range(-1, H3):
    row_up, row_dn = inside[y] if 0 <= y < H3 else None, inside[y + 1] if 0 <= y + 1 < H3 else None
    for x in range(-1, W3):
        tl = row_up[x] if row_up and 0 <= x < W3 else False
        tr = row_up[x + 1] if row_up and 0 <= x + 1 < W3 else False
        br = row_dn[x + 1] if row_dn and 0 <= x + 1 < W3 else False
        bl = row_dn[x] if row_dn and 0 <= x < W3 else False
        for p0, p1 in MS[(int(tl), int(tr), int(br), int(bl))]:
            segs.append(((x + p0[0], y + p0[1]), (x + p1[0], y + p1[1])))
print("segments", len(segs))


def key(p):
    return (round(p[0] * 2), round(p[1] * 2))


adj = defaultdict(list)
for i, (s, e) in enumerate(segs):
    adj[key(s)].append((i, e))
    adj[key(e)].append((i, s))

used = [False] * len(segs)
loops = []
for i, (s, e) in enumerate(segs):
    if used[i]:
        continue
    used[i] = True
    loop = [s, e]
    cur = e
    while True:
        nxt = None
        for j, other in adj[key(cur)]:
            if not used[j]:
                nxt = (j, other)
                break
        if not nxt:
            break
        used[nxt[0]] = True
        cur = nxt[1]
        if key(cur) == key(loop[0]):
            break
        loop.append(cur)
    if len(loop) > 20:
        loops.append(loop)
loops.sort(key=len, reverse=True)
print("loops", [len(x) for x in loops[:6]])


def rdp_closed(pts, eps):
    """RDP over a closed ring (no duplicated endpoint): split at the vertex
    farthest from the first one, simplify both halves, rejoin."""
    n = len(pts)
    dmax, idx = -1.0, 0
    for i in range(1, n):
        d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2
        if d > dmax:
            dmax, idx = d, i
    a = rdp(pts[:idx + 1], eps)
    b = rdp(pts[idx:] + [pts[0]], eps)
    return a[:-1] + b[:-1]


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    nrm = math.hypot(dx, dy) or 1e-9
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / nrm
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


# ---- smooth path: Catmull-Rom -> cubic Bezier, corners kept sharp --------
def angle_at(prev, cur, nxt):
    a1 = math.atan2(cur[1] - prev[1], cur[0] - prev[0])
    a2 = math.atan2(nxt[1] - cur[1], nxt[0] - cur[0])
    d = abs((a2 - a1 + math.pi) % (2 * math.pi) - math.pi)
    return math.degrees(d)


def to_path(pts, corner_deg=62.0):
    """Closed Catmull-Rom spline; vertices whose turn exceeds corner_deg are
    emitted as hard corners (L) so the shape is not over-rounded."""
    n = len(pts)
    turns = [angle_at(pts[(i - 1) % n], pts[i], pts[(i + 1) % n]) for i in range(n)]
    out = [f"M{pts[0][0]:.2f},{pts[0][1]:.2f}"]
    for i in range(n):
        j = (i + 1) % n
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[j], pts[(j + 1) % n]
        sharp = turns[i] > corner_deg or turns[j] > corner_deg
        if sharp:
            out.append(f"L{p2[0]:.2f},{p2[1]:.2f}")
        else:
            c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
            c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
            out.append(f"C{c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} {p2[0]:.2f},{p2[1]:.2f}")
    out.append("Z")
    return "".join(out)


SCALE = 1.0 / 3  # 3x raster -> logical 1x box
paths = []
for loop in loops:
    ring = loop[:-1] if key(loop[-1]) == key(loop[0]) else loop
    simp = rdp_closed(ring, EPS)
    print("loop", len(ring), "-> simp", len(simp))
    if len(simp) < 6:
        continue
    pts = [(round(x * SCALE, 2), round(y * SCALE, 2)) for x, y in simp]
    d = to_path(pts)
    if len(d) < 60:
        continue
    paths.append((len(simp), d))
paths.sort(reverse=True)

VB_W, VB_H = round(W3 / 3, 2), round(H3 / 3, 2)
flat = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W} {VB_H}" role="img" aria-label="Edura">']
for _, d in paths:
    flat.append(f'  <path d="{d}" fill="currentColor" fill-rule="evenodd"/>')
flat.append("</svg>")
open(os.path.join(ASSETS, "edura-mark.svg"), "w").write("\n".join(flat) + "\n")
print("mark.svg paths", [p[0] for p in paths], "viewBox", VB_W, VB_H)

# ---- gradient sampling from the artwork ---------------------------------
samples = []
for y in range(H3):
    for x in range(W3):
        if alpha[x, y] > 250:
            samples.append((x, y, rgb[x, y]))
mx = statistics.mean([s[0] for s in samples])
my = statistics.mean([s[1] for s in samples])
mb = statistics.mean([sum(s[2]) for s in samples])
nx = statistics.mean([(s[0] - mx) * (sum(s[2]) - mb) for s in samples]) / (statistics.pvariance([s[0] for s in samples]) or 1)
ny = statistics.mean([(s[1] - my) * (sum(s[2]) - mb) for s in samples]) / (statistics.pvariance([s[1] for s in samples]) or 1)
print("gradient axis", round(nx, 3), round(ny, 3))
axis = sorted(((nx * (s[0] - mx) + ny * (s[1] - my), s[2]) for s in samples), key=lambda t: t[0])
n = len(axis)
stops = []
for i in range(5):
    band = [c for _, c in axis[int(n * i / 5):int(n * (i + 1) / 5)]]
    stops.append((round(i / 4, 2),
                  "#%02X%02X%02X" % (round(statistics.mean([c[0] for c in band])),
                                     round(statistics.mean([c[1] for c in band])),
                                     round(statistics.mean([c[2] for c in band])))))
print("stops", json.dumps(stops))
# map the axis to gradient x1/y1/x2/y2 in user units, clipped to 0..1
ax, ay = nx, ny
norm = math.hypot(ax, ay) or 1
x1 = 0.5 - 0.5 * ax / norm
y1 = 0.5 - 0.5 * ay / norm
x2 = 0.5 + 0.5 * ax / norm
y2 = 0.5 + 0.5 * ay / norm
g = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W} {VB_H}" role="img" aria-label="Edura">',
     '  <defs>',
     f'    <linearGradient id="eduraMark" x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}">']
for off, col in stops:
    g.append(f'      <stop offset="{off}" stop-color="{col}"/>')
g += ['    </linearGradient>', '  </defs>']
for _, d in paths:
    g.append(f'  <path d="{d}" fill="url(#eduraMark)" fill-rule="evenodd"/>')
g.append("</svg>")
open(os.path.join(ASSETS, "edura-mark-gradient.svg"), "w").write("\n".join(g) + "\n")
print("wrote gradient svg")

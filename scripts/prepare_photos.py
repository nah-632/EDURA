#!/usr/bin/env python3
"""
Prepare the four brand photographs for the site.

Source images live in the operator's uploads; the outputs are committed under
app/public/brand/photo/. Run from the repository root:

    python3 scripts/prepare_photos.py <uploads-dir>

Why the hero is cropped
-----------------------
The hero photograph was supplied with a branded panel baked into its left third:
the EDURA logo, "Better Learning Brighter Futures" and a tagline. Two sets of
taglines competing over one headline is exactly what the brief warns against, and
an image containing a raster logo also ages badly the moment the lockup changes.
So the panel is cropped off and the photograph is used purely as a photograph;
the live logo and headline do that job in HTML, where they belong.

The remaining three keep their framing: they carry no embedded headline, only the
logo on the mug/laptop/lanyard, which is a brand detail at display size rather
than competing text.
"""
import os
import subprocess
import sys

OUT = "app/public/brand/photo"

# (source, output, crop "WxH+X+Y" or None, output width, quality)
PLAN = [
    # hero: drop everything left of the branded panel (x >= 470 of 1365)
    ("photo_ABCFAB90.jpeg", "hero-desk.jpg", "895x768+470+0", 1000, 84),
    # father and son at home
    ("photo_57910F9C.jpeg", "family-home.jpg", None, 1100, 82),
    # classroom / tutors around a smart screen
    ("photo_8AD0FAC1.jpeg", "classroom.jpg", None, 1100, 82),
    # product shot: brand touch only
    ("photo_1B6BB4C0.jpeg", "mug.jpg", None, 900, 82),
]


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: prepare_photos.py <uploads-dir>")
    src_dir = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)

    for source, name, crop, width, quality in PLAN:
        src = os.path.join(src_dir, source)
        if not os.path.exists(src):
            print(f"  !! missing {src}")
            continue
        dst = os.path.join(OUT, name)
        cmd = ["magick", src]
        if crop:
            cmd += ["-crop", crop, "+repage"]
        cmd += ["-resize", f"{width}x>", "-strip",
                "-interlace", "none", "-sampling-factor", "4:2:0",
                "-quality", str(quality), dst]
        subprocess.run(cmd, check=True)
        print(f"  {name:18s} {os.path.getsize(dst) / 1024:7.1f} KB  <- {source}"
              + (f"  (cropped {crop})" if crop else ""))


main()

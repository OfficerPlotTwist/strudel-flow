#!/usr/bin/env python
"""Generates scripts/launcher/strudel-flow.ico - the Desktop launcher icon.

The mark is the app itself in miniature: a dark CRT screen with a phosphor
flow-wave running across it, in the same palette as src/styles/crt.css.

Each ICO size is rendered from its own 8x supersample rather than downscaling
one 256px master. A single master turns the wave into grey mush at 16px,
because stroke weight that reads at 256 is sub-pixel at 16. Rendering per size
lets the wave stay proportionally thick, and lets the scanlines - which are
noise below 48px - be dropped where they do not survive.

Usage: python scripts/make-launcher-icon.py
"""
from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "scripts" / "launcher" / "strudel-flow.ico"

PHOSPHOR = (125, 247, 168)
PHOSPHOR_DIM = (58, 125, 85)
BG = (6, 10, 7)
BG_RAISED = (12, 19, 14)

SIZES = [256, 128, 64, 48, 32, 16]
SS = 8  # supersample factor


def wave_points(w, h, samples=400):
    """Two summed sines - a 'flow' rather than a test tone."""
    pts = []
    left, right = w * 0.13, w * 0.87
    mid = h * 0.52
    amp = h * 0.17
    for i in range(samples + 1):
        t = i / samples
        x = left + (right - left) * t
        y = mid - amp * (math.sin(t * math.tau * 1.5) * 0.78
                         + math.sin(t * math.tau * 3.0 + 0.9) * 0.30)
        pts.append((x, y))
    return pts


def render(size):
    w = h = size * SS
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Bezel, then the screen inset inside it.
    radius = int(w * 0.22)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=BG_RAISED + (255,))
    inset = w * 0.075
    d.rounded_rectangle(
        [inset, inset, w - 1 - inset, h - 1 - inset],
        radius=int(radius * 0.72),
        fill=BG + (255,),
        outline=PHOSPHOR_DIM + (150,),
        width=max(1, int(w * 0.008)),
    )

    # Scanlines: legible texture at 48px and up, dirt below it.
    if size >= 48:
        step = h / 22
        y = inset + step / 2
        while y < h - inset:
            d.line([(inset, y), (w - inset, y)], fill=PHOSPHOR + (16,), width=max(1, int(h * 0.004)))
            y += step

    pts = wave_points(w, h)
    stroke = max(2, int(w * 0.055))

    # Glow first (blurred, on its own layer), crisp trace on top - that order
    # is what makes it read as emitted light rather than an outlined shape.
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    stamp(ImageDraw.Draw(glow), pts, stroke * 1.9, PHOSPHOR + (190,))
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.030))
    img.alpha_composite(glow)

    stamp(d, pts, stroke, PHOSPHOR + (255,))

    return img.resize((size, size), Image.LANCZOS)


def stamp(draw, pts, width, fill):
    """Strokes a path by stamping a disc at every sample.

    ImageDraw.line(joint="curve") scallops a curve this thick - the butt-capped
    segment rectangles do not fill the outside of each bend - and the ripple
    survives the downsample as a visibly lumpy trace. Discs at ~1/25th of the
    stroke width cannot scallop.
    """
    r = width / 2
    for x, y in pts:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def main():
    frames = [render(s) for s in SIZES]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Pillow writes every `sizes` entry from the base image, so hand it the
    # largest frame and append the per-size renders explicitly.
    frames[0].save(OUT, format="ICO", sizes=[(s, s) for s in SIZES],
                   append_images=frames[1:])
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes) sizes={SIZES}")


if __name__ == "__main__":
    main()

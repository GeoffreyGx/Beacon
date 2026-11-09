"""Generates Beacon's app icons from an original calendar glyph.
(Not a Remix Icon: the Remix Icon License forbids using its icons as an app icon.)
Requires Pillow. Run from the project root:  python3 assets/icon-src/generate.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path("assets")
SS = 4  # supersampling factor for smooth edges
SIZE = 1024

def hex_rgb(h, a=255):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)

def gradient(top, bottom):
    img = Image.new("RGBA", (SIZE * SS, SIZE * SS))
    t, b = hex_rgb(top), hex_rgb(bottom)
    d = ImageDraw.Draw(img)
    for yy in range(SIZE * SS):
        f = yy / (SIZE * SS - 1)
        d.line([(0, yy), (SIZE * SS, yy)], fill=tuple(round(t[i] + (b[i] - t[i]) * f) for i in range(4)))
    return img

def draw_glyph(img, stroke, accent, scale=1.0, cy=540):
    """Calendar: rounded body outline, filled header band, two ring tabs, 3x2 date tiles (one accented)."""
    d = ImageDraw.Draw(img)
    k = SS * scale
    X = lambda v: (512 + (v - 512) * scale) * SS
    Y = lambda v: (cy + (v - 540) * scale) * SS
    w = round(52 * k)
    s, a = hex_rgb(stroke), hex_rgb(accent)
    # Body outline
    d.rounded_rectangle([X(232), Y(300), X(792), Y(800)], radius=84 * k, outline=s, width=w)
    # Header band (rounded top, square bottom)
    d.rounded_rectangle([X(232), Y(300), X(792), Y(470)], radius=84 * k, fill=s)
    d.rectangle([X(232), Y(390), X(792), Y(470)], fill=s)
    # Ring tabs
    for cx in (352, 672):
        d.rounded_rectangle([X(cx) - w / 2, Y(220), X(cx) + w / 2, Y(370)], radius=w / 2, fill=s)
    # Date tiles
    for row, yy in enumerate((600, 705)):
        for col, xx in enumerate((382, 512, 642)):
            r = 38 * k
            d.rounded_rectangle([X(xx) - r, Y(yy) - r, X(xx) + r, Y(yy) + r], radius=12 * k,
                                fill=a if (row, col) == (0, 2) else s)
    return img

def save(img, name, size=SIZE):
    img.resize((size, size), Image.LANCZOS).save(OUT / name)
    print("wrote", OUT / name)

transparent = lambda: Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
solid = lambda c: Image.new("RGBA", (SIZE * SS, SIZE * SS), hex_rgb(c))

# iOS: full-bleed and opaque (iOS applies the rounded mask).
save(draw_glyph(gradient("#3b82f6", "#1d4ed8"), "#ffffff", "#ef4444"), "icon.png")
save(draw_glyph(gradient("#1f2937", "#0b1120"), "#60a5fa", "#f87171"), "ios-dark.png")
save(draw_glyph(solid("#000000"), "#ffffff", "#9ca3af"), "ios-tinted.png")  # grayscale; iOS applies the tint
# Android adaptive icon: glyph within the 66% safe zone on transparent + separate background.
save(draw_glyph(transparent(), "#ffffff", "#ef4444", scale=0.6, cy=530), "android-icon-foreground.png")
save(gradient("#3b82f6", "#1d4ed8"), "android-icon-background.png")
save(draw_glyph(transparent(), "#ffffff", "#ffffff", scale=0.6, cy=530), "android-icon-monochrome.png")
# Web
save(draw_glyph(gradient("#3b82f6", "#1d4ed8"), "#ffffff", "#ef4444"), "favicon.png", size=48)

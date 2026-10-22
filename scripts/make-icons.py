# Small home-screen icons from the official logo (scaled + padded with its own navy; logo not redrawn).
from PIL import Image
src = Image.open("public/brand/bereket-logo.jpg").convert("RGB")
BG = (0x26, 0x41, 0x7B)
def make(size, frac):
    canvas = Image.new("RGB", (size, size), BG)
    inner = round(size * frac)
    logo = src.copy(); logo.thumbnail((inner, inner), Image.LANCZOS)
    canvas.paste(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return canvas
make(192, 1.0).quantize(48).save("public/icons/icon-192.png", optimize=True)
make(512, 1.0).save("public/icons/icon-512.webp", quality=74)
make(512, 0.8).save("public/icons/maskable-512.webp", quality=74)
make(180, 1.0).quantize(48).save("public/icons/apple-touch-icon.png", optimize=True)
make(48, 1.0).quantize(32).save("src/app/icon.png", optimize=True)

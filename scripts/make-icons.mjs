// Builds favicon/PWA icons from the official logo: scale + pad with the logo's own edge colour. No redrawing.
import sharp from "sharp";
const src = "public/brand/bereket-logo.jpg";
const bg = { r: 0x26, g: 0x41, b: 0x7b, alpha: 1 };
async function icon(size, out, pad = 0) {
  const inner = Math.round(size * (1 - pad * 2));
  const img = await sharp(src).resize(inner, inner, { fit: "contain", background: bg }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: img, gravity: "center" }]).png().toFile(out);
}
await icon(192, "public/icons/icon-192.png");
await icon(512, "public/icons/icon-512.png");
await icon(512, "public/icons/maskable-512.png", 0.1);
await icon(180, "public/icons/apple-touch-icon.png");
await icon(48, "src/app/icon.png");
await icon(180, "src/app/apple-icon.png");
console.log("icons done");

// Build-time icons from the official logo: scaled + padded with the logo's own navy. The logo is never redrawn.
import sharp from "sharp";
import { mkdirSync } from "fs";
const src = "public/brand/bereket-logo.jpg";
const bg = { r: 0x26, g: 0x41, b: 0x7b, alpha: 1 };
mkdirSync("public/icons", { recursive: true });
async function canvas(size, frac) {
  const inner = Math.round(size * frac);
  const logo = await sharp(src).resize(inner, inner, { fit: "contain", background: bg }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } }).composite([{ input: logo, gravity: "center" }]);
}
await (await canvas(192, 1)).png({ palette: true, colours: 48 }).toFile("public/icons/icon-192.png");
await (await canvas(180, 1)).png({ palette: true, colours: 48 }).toFile("public/icons/apple-touch-icon.png");
await (await canvas(512, 1)).webp({ quality: 74 }).toFile("public/icons/icon-512.webp");
await (await canvas(512, 0.8)).webp({ quality: 74 }).toFile("public/icons/maskable-512.webp");
await (await canvas(48, 1)).png({ palette: true, colours: 32 }).toFile("src/app/icon.png");
console.log("icons generated");

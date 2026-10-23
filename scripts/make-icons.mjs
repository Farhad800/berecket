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
// Android status-bar badge: must be a white shape on transparent (a plain bell, not the logo).
const bell = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
await sharp(Buffer.from(bell)).png().toFile("public/icons/badge-96.png");
console.log("icons generated");

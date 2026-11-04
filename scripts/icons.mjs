// Renders public/favicon.svg to the PWA icons (public/icon-192.png, public/icon-512.png and the
// padded public/icon-maskable-512.png).
// Run `npm run icons` after changing the SVG; the PNGs are committed.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url));
for (const size of [192, 512]) {
  const png = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
  await writeFile(new URL(`../public/icon-${size}.png`, import.meta.url), png);
  console.log(`public/icon-${size}.png`);
}

// Maskable icon: Android crops it to a circle or squircle, so the art is scaled to 80 % and
// centred on the brand colour (the safe zone) instead of reusing the full-bleed icon.
const BRAND = '#2f5d50';
const MASKABLE = 512;
const inner = Math.round(MASKABLE * 0.8);
const pad = (MASKABLE - inner) / 2;
const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
const maskable = await sharp({
  create: { width: MASKABLE, height: MASKABLE, channels: 4, background: BRAND },
})
  .composite([{ input: art, left: pad, top: pad }])
  .png()
  .toBuffer();
await writeFile(new URL('../public/icon-maskable-512.png', import.meta.url), maskable);
console.log('public/icon-maskable-512.png');

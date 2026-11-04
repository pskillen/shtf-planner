// Renders public/favicon.svg to the PWA icons (public/icon-192.png, public/icon-512.png).
// Run `npm run icons` after changing the SVG; the PNGs are committed.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url));
for (const size of [192, 512]) {
  const png = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
  await writeFile(new URL(`../public/icon-${size}.png`, import.meta.url), png);
  console.log(`public/icon-${size}.png`);
}

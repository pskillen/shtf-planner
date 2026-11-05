// Renders a few synthetic best-before labels (text drawn from SVG, never a photo) to
// test/fixtures/datecodes/*.png, and the first one as public/ocr/selftest.png, which the date
// reader checks before it trusts the graphics chip.
// Run `node scripts/datecode-fixtures.mjs` after changing the list; the PNGs are committed.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

/** [file name, the text on the label]. */
const LABELS = [
  ['best-before-06-2027', 'BEST BEFORE 06/2027'],
  ['use-by-22-mar-2027', 'USE BY 22 MAR 2027'],
  ['bbe-mar-2028', 'BBE MAR 2028'],
  ['exp-05-2028', 'EXP 05.2028'],
  ['bare-29-01-27', '29.01.27'],
  ['bare-12-26', '12.26'],
];

const W = 640;
const H = 160;

async function render(text) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#f4f1e8"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="DejaVu Sans Mono, monospace"
      font-weight="bold" font-size="52" fill="#1a1a1a">${text}</text>
  </svg>`;
  return sharp(Buffer.from(svg), { density: 96 }).png().toBuffer();
}

const dir = new URL('../test/fixtures/datecodes/', import.meta.url);
await mkdir(dir, { recursive: true });
for (const [name, text] of LABELS) {
  const png = await render(text);
  await writeFile(new URL(`${name}.png`, dir), png);
  console.log(`test/fixtures/datecodes/${name}.png  ${text}`);
  if (name === LABELS[0][0]) {
    await writeFile(new URL('../public/ocr/selftest.png', import.meta.url), png);
    console.log('public/ocr/selftest.png');
  }
}

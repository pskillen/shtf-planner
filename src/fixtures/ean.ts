/** A tiny EAN-13 renderer, so the barcode decoder is tested on real bars without a camera. */
const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
];
const R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
];
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

export function ean13Bits(code: string): string {
  const d = code.split('').map(Number);
  const parity = PARITY[d[0]!]!;
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += (parity[i] === 'L' ? L : G)[d[i + 1]!];
  bits += '01010';
  for (let i = 0; i < 6; i++) bits += R[d[i + 7]!];
  return bits + '101';
}

/** An RGBA frame of the code, black bars on white, with a quiet zone; `scale` pixels a module. */
export function ean13Frame(
  code: string,
  scale = 3,
  height = 90,
): { data: Uint8ClampedArray; width: number; height: number } {
  const bits = ean13Bits(code);
  const quiet = 12 * scale;
  const width = bits.length * scale + quiet * 2;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    for (let y = 0; y < height; y++) {
      for (let s = 0; s < scale; s++) {
        const p = (y * width + quiet + i * scale + s) * 4;
        data[p] = data[p + 1] = data[p + 2] = 0;
      }
    }
  }
  return { data, width, height };
}

/** The same frame turned a quarter turn, as a tin held sideways would look. */
export function rotatedFrame(f: { data: Uint8ClampedArray; width: number; height: number }) {
  const out = new Uint8ClampedArray(f.data.length);
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const from = (y * f.width + x) * 4;
      const to = (x * f.height + (f.height - 1 - y)) * 4;
      for (let c = 0; c < 4; c++) out[to + c] = f.data[from + c]!;
    }
  }
  return { data: out, width: f.height, height: f.width };
}

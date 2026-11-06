import { describe, expect, it } from 'vitest';
import {
  adaptive,
  frameDiff,
  fromRGBA,
  gray,
  invert,
  resizeToHeight,
  rotate,
  saturatedShare,
  sharpness,
  stretch,
  thumb,
  variantsFor,
  type Gray,
} from './image';
import { boxToVideoRect } from '../camera';

/** Vertical stripes, so there are edges. */
function stripes(w: number, h: number, period = 4): Gray {
  const g = gray(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) g.d[y * w + x] = Math.floor(x / (period / 2)) % 2 ? 200 : 40;
  return g;
}

describe('grey measures', () => {
  it('turns RGBA into grey with the barcode loop weights', () => {
    const g = fromRGBA([255, 255, 255, 255, 0, 0, 0, 255], 2, 1);
    expect(g.d[0]).toBe(255 * 0 + ((255 * 77 + 255 * 150 + 255 * 29) >> 8));
    expect(g.d[1]).toBe(0);
  });

  it('saturatedShare counts pixels at or above the level', () => {
    const g = gray(10, 10);
    for (let i = 0; i < 25; i++) g.d[i] = 250;
    for (let i = 25; i < 30; i++) g.d[i] = 249;
    expect(saturatedShare(g)).toBeCloseTo(0.25);
    expect(saturatedShare(g, 249)).toBeCloseTo(0.3);
  });

  it('sharpness is zero for a flat frame and positive for stripes', () => {
    const flat = gray(64, 32);
    flat.d.fill(128);
    expect(sharpness(flat)).toBe(0);
    expect(sharpness(stripes(64, 32))).toBeGreaterThan(2);
  });

  it('sharpness falls when the same stripes are blurred by shrinking and enlarging', () => {
    const sharp = stripes(96, 48);
    const soft = resizeToHeight(resizeToHeight(sharp, 12), 48);
    expect(sharpness(soft)).toBeLessThan(sharpness(sharp));
  });

  it('frameDiff is the mean absolute grey difference, and 255 for different sizes', () => {
    const a = gray(32, 8);
    const b = gray(32, 8);
    b.d.fill(10);
    expect(frameDiff(a, a)).toBe(0);
    expect(frameDiff(a, b)).toBe(10);
    expect(frameDiff(a, gray(16, 8))).toBe(255);
  });

  it('thumb makes a small picture of any frame', () => {
    const t = thumb(stripes(200, 100));
    expect([t.w, t.h]).toEqual([32, 8]);
  });
});

describe('pictures for the reader', () => {
  it('stretch spreads the grey levels', () => {
    const g = gray(20, 20);
    for (let i = 0; i < g.d.length; i++) g.d[i] = 100 + (i % 20);
    const s = stretch(g);
    expect(Math.min(...s.d)).toBeLessThan(10);
    expect(Math.max(...s.d)).toBeGreaterThan(245);
  });

  it('invert and rotate are their own undo', () => {
    const g = stripes(8, 4);
    expect(invert(invert(g)).d).toEqual(g.d);
    expect(rotate(rotate(g, 180), 180).d).toEqual(g.d);
    expect(rotate(rotate(g, 90), 270).d).toEqual(g.d);
    expect([rotate(g, 90).w, rotate(g, 90).h]).toEqual([4, 8]);
  });

  it('adaptive gives only ink and paper', () => {
    const out = adaptive(stripes(64, 32));
    expect(new Set(out.d)).toEqual(new Set([0, 255]));
  });
});

describe('which pictures a crop gets', () => {
  const names = (g: Gray) => variantsFor(g).map((v) => v.name);

  it('a tall crop gets all six, cheapest first, adaptive last', () => {
    expect(names(gray(480, 256))).toEqual([
      'stretch@64',
      'stretch',
      'inv@64',
      'inv',
      'dots',
      'adapt',
    ]);
  });

  it('a crop of 80 pixels high or less skips the native-size ones', () => {
    expect(names(gray(480, 80))).toEqual(['stretch@64', 'inv@64', 'dots', 'adapt']);
    expect(names(gray(480, 81))).toContain('stretch');
  });

  it('every picture is made without error for a small crop (never below 64 high)', () => {
    for (const v of variantsFor(stripes(100, 30))) {
      expect(v.apply(stripes(100, 30)).h).toBeGreaterThanOrEqual(30);
    }
  });
});

describe('the cover crop, as the date box uses it', () => {
  it('a box on a wide strip over a wide frame maps through the crop', () => {
    // A 1920x1080 frame in a 360x200 strip: scaled by 360/1920 (the width binds), cropped top and bottom.
    const r = boxToVideoRect(
      { x: 0.06, y: 0.22, w: 0.88, h: 0.56 },
      { w: 360, h: 200 },
      { w: 1920, h: 1080 },
    );
    expect(r.sh).toBe(597);
    expect(r.sy).toBe(Math.round((1.25 + 0.22 * 200) / 0.1875));
    expect(r.sw).toBe(Math.round((0.88 * 360) / 0.1875));
    expect(r.sx).toBe(Math.round((0.06 * 360) / 0.1875));
  });
});

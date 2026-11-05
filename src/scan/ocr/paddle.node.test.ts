import { readFile } from 'node:fs/promises';
import * as ort from 'onnxruntime-web';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatMonthYear } from '../../engine/datecode';
import { fromRGBA, type Gray } from './image';
import { Paddle, type Ort } from './paddle';
import { readFrame } from './reader';

// The real FP16 models on the WASM provider in node, over the synthetic labels in
// test/fixtures/datecodes (drawn from SVG, never a photo).
const TODAY = '2026-11-15';
const MODELS = new URL('../../../public/ocr/paddle/', import.meta.url);
const FIXTURES = new URL('../../../test/fixtures/datecodes/', import.meta.url);

async function grey(name: string): Promise<Gray> {
  const { data, info } = await sharp(new URL(`${name}.png`, FIXTURES).pathname)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return fromRGBA(data, info.width, info.height);
}

let paddle: Paddle;

beforeAll(async () => {
  const runtime = ort as unknown as Ort;
  runtime.env.wasm.numThreads = 1;
  const file = (n: string) => readFile(new URL(n, MODELS));
  paddle = await Paddle.create(
    runtime,
    {
      det: new Uint8Array(await file('det-fp16.onnx')),
      rec: new Uint8Array(await file('rec-fp16.onnx')),
      dict: (await file('dict.txt')).toString('utf8'),
    },
    'wasm',
  );
}, 60_000);

afterAll(async () => {
  await paddle?.release();
});

describe('the FP16 pipeline on synthetic labels', () => {
  it.each([
    ['best-before-06-2027', '06/2027'],
    ['use-by-22-mar-2027', '03/2027'],
    ['bbe-mar-2028', '03/2028'],
    ['exp-05-2028', '05/2028'],
    ['bare-29-01-27', '01/2027'],
  ])(
    'reads %s as %s',
    async (name, want) => {
      const v = await readFrame(paddle, await grey(name), TODAY);
      expect(v.value ? formatMonthYear(v.value) : null).toBe(want);
    },
    60_000,
  );

  it('offers a bare 12.26 as a suggestion and gives no result', async () => {
    const v = await readFrame(paddle, await grey('bare-12-26'), TODAY);
    expect(v.value).toBeNull();
    expect(v.suggestions.map(formatMonthYear)).toContain('12/2026');
  }, 60_000);
});

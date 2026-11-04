import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { button, el, logBox } from '../ui';

// Spike A: near-live EAN-13 scanning, BarcodeDetector vs zxing, with Open Food Facts lookup.

const OFF_FIELDS = 'product_name,quantity,nutriments,image_front_small_url';
// OFF asks for AppName/Version (ContactEmail). A real app needs a real contact here.
const OFF_UA = 'SHTFPlanner-prototype/0.0 (prototype; contact tbd)';

type Row = { n: number; decoder: string; ean: string; ms: number; found: boolean | 'queued'; name: string; kcal: string };

async function lookup(ean: string): Promise<{ found: boolean | 'queued'; name: string; qty: string; kcal: string; img?: string }> {
  try {
    // User-Agent is settable in Chrome fetch; OFF's CORS allows User-Agent and X-User-Agent headers.
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=${OFF_FIELDS}`, {
      headers: { 'User-Agent': OFF_UA, 'X-User-Agent': OFF_UA },
    });
    const j = await res.json();
    if (j.status !== 1 || !j.product) return { found: false, name: '', qty: '', kcal: '' };
    const p = j.product;
    return { found: true, name: p.product_name ?? '', qty: p.quantity ?? '', kcal: String(p.nutriments?.['energy-kcal_100g'] ?? ''), img: p.image_front_small_url };
  } catch {
    // Offline: queue the EAN with a placeholder entry, resolve later.
    const q = JSON.parse(localStorage.getItem('ean-queue') ?? '[]');
    q.push({ ean, at: new Date().toISOString() });
    localStorage.setItem('ean-queue', JSON.stringify(q));
    return { found: 'queued', name: '(queued, offline)', qty: '', kcal: '' };
  }
}

// ---- tiny EAN-13 renderer, so the decoders can be self-tested on desktop without a tin ----
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
export function ean13Bits(code: string) {
  const d = code.split('').map(Number);
  const par = PARITY[d[0]];
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += (par[i] === 'L' ? L : G)[d[i + 1]];
  bits += '01010';
  for (let i = 0; i < 6; i++) bits += R[d[i + 7]];
  return bits + '101';
}
export function ean13Check(code12: string) {
  const s = code12.split('').reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return code12 + ((10 - (s % 10)) % 10);
}
function drawEan(canvas: HTMLCanvasElement, code: string, scale = 3) {
  const bits = ean13Bits(code);
  const quiet = 12 * scale;
  canvas.width = bits.length * scale + quiet * 2;
  canvas.height = 120 * scale / 2;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#fff';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#000';
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') c.fillRect(quiet + i * scale, 10, scale, canvas.height - 20);
}

export function mount(root: HTMLElement) {
  const { pre, log } = logBox();
  const video = el('video', { autoplay: true, playsInline: true, muted: true });
  const status = el('div', { textContent: 'idle' });
  const result = el('div');
  const table = el('table');
  const rows: Row[] = [];
  let stream: MediaStream | null = null;
  let decoder: 'barcodedetector' | 'zxing' = 'BarcodeDetector' in window ? 'barcodedetector' : 'zxing';
  let t0 = 0;
  let armed = false;
  let loop: number | undefined;
  let zxingStop: (() => void) | undefined;
  const sel = el('select');
  for (const [v, t] of [['barcodedetector', 'BarcodeDetector (native)'], ['zxing', 'zxing (JS)']]) sel.append(new Option(t, v));
  sel.value = decoder;
  sel.onchange = async () => { decoder = sel.value as typeof decoder; if (stream) await startDecoding(); };
  const res = el('select');
  for (const [v, t] of [['720', '1280x720'], ['1080', '1920x1080'], ['480', '640x480']]) res.append(new Option(t, v));

  async function onCode(ean: string, source: string) {
    if (!armed) return;
    armed = false;
    const ms = Math.round(performance.now() - t0);
    navigator.vibrate?.(100);
    status.textContent = `${source}: ${ean} in ${ms} ms`;
    const r = await lookup(ean);
    result.replaceChildren(el('b', { textContent: `${ean} ${r.found === true ? '' : r.found === false ? '(not found)' : '(queued)'}` }), el('br'), `${r.name} | ${r.qty} | ${r.kcal} kcal/100g`, el('br'));
    if (r.img) result.append(el('img', { src: r.img, height: 80 }));
    const row: Row = { n: rows.length + 1, decoder: source, ean, ms, found: r.found, name: r.name, kcal: r.kcal };
    rows.push(row);
    log(`#${row.n}\t${row.decoder}\t${row.ean}\t${row.ms}ms\tfound=${row.found}\t${row.name}\t${row.kcal}`);
    (window as any).__rows = rows;
    summarise();
  }

  function summarise() {
    const by: Record<string, number[]> = {};
    for (const r of rows) (by[r.decoder] ??= []).push(r.ms);
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const found = rows.filter((r) => r.found === true).length;
    table.replaceChildren(
      el('tr', {}, el('th', { textContent: 'decoder' }), el('th', { textContent: 'n' }), el('th', { textContent: 'median ms' })),
      ...Object.entries(by).map(([d, a]) => el('tr', {}, el('td', { textContent: d }), el('td', { textContent: String(a.length) }), el('td', { textContent: String(med(a)) }))),
      el('tr', {}, el('td', { colSpan: 3, textContent: `OFF hit rate ${found}/${rows.length}` })),
    );
  }

  async function startDecoding() {
    stopDecoding();
    if (!stream) return;
    if (decoder === 'barcodedetector') {
      const det = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const tick = async () => {
        if (armed && video.readyState >= 2) {
          try {
            const codes = await det.detect(video);
            if (codes.length) onCode(codes[0].rawValue, 'barcodedetector');
          } catch (e) { /* frame not ready */ }
        }
        loop = window.setTimeout(tick, 100); // ~10 fps
      };
      tick();
    } else {
      const hints = new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
        [DecodeHintType.TRY_HARDER, true],
      ]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
      const controls = await reader.decodeFromStream(stream, video, (result) => {
        if (result) onCode(result.getText(), 'zxing');
      });
      zxingStop = () => controls.stop();
    }
    status.textContent = `decoding with ${decoder}`;
  }
  function stopDecoding() {
    if (loop) clearTimeout(loop);
    loop = undefined;
    zxingStop?.();
    zxingStop = undefined;
  }

  async function start() {
    const h = Number(res.value);
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: (h * 16) / 9 }, height: { ideal: h }, advanced: [{ focusMode: 'continuous' } as any] } as MediaTrackConstraints,
      audio: false,
    });
    video.srcObject = stream;
    const s = stream.getVideoTracks()[0].getSettings();
    log(`camera ${s.width}x${s.height} facing=${s.facingMode} BarcodeDetector=${'BarcodeDetector' in window} UA=${navigator.userAgent}`);
    await video.play().catch(() => {});
    await startDecoding();
  }

  async function selfTest() {
    // Desktop check without a tin: render EAN-13 codes to a canvas and decode with both decoders.
    const canvas = el('canvas');
    const codes = ['5000169005743', '3017620422003', ean13Check('401234567890')];
    for (const code of codes) {
      drawEan(canvas, code);
      const out: string[] = [];
      const reader = new BrowserMultiFormatReader();
      const t = performance.now();
      try {
        const r = reader.decodeFromCanvas(canvas);
        out.push(`zxing ${r.getText()} ${(performance.now() - t).toFixed(1)}ms`);
      } catch (e) { out.push('zxing FAIL ' + String(e)); }
      if ('BarcodeDetector' in window) {
        const det = new (window as any).BarcodeDetector({ formats: ['ean_13'] });
        const t2 = performance.now();
        const c = await det.detect(canvas);
        out.push(`native ${c[0]?.rawValue ?? 'FAIL'} ${(performance.now() - t2).toFixed(1)}ms`);
      } else out.push('native: BarcodeDetector not available here');
      log(`selftest ${code}: ${out.join(' | ')}`);
    }
    root.append(canvas);
  }

  async function lookupOnly() {
    const ean = prompt('EAN', '3017620422003');
    if (!ean) return;
    const t = performance.now();
    const r = await lookup(ean);
    log(`lookup ${ean}: ${JSON.stringify(r)} in ${Math.round(performance.now() - t)}ms`);
  }

  async function resolveQueue() {
    const q: { ean: string }[] = JSON.parse(localStorage.getItem('ean-queue') ?? '[]');
    localStorage.setItem('ean-queue', '[]');
    for (const item of q) log(`resolve ${item.ean}: ${JSON.stringify(await lookup(item.ean))}`);
  }

  root.append(
    el('h3', { textContent: 'Spike A: barcode' }),
    el('div', {}, 'Decoder: ', sel, ' Resolution: ', res),
    button('Start camera', start),
    button('Tin in frame: start timer', () => { t0 = performance.now(); armed = true; status.textContent = 'timing...'; result.replaceChildren(); }),
    button('Stop camera', () => { stopDecoding(); stream?.getTracks().forEach((t) => t.stop()); stream = null; }),
    el('br'),
    button('Self-test (rendered EAN-13)', selfTest),
    button('Lookup EAN by hand', lookupOnly),
    button('Resolve offline queue', resolveQueue),
    video,
    status,
    result,
    table,
    pre,
  );
}

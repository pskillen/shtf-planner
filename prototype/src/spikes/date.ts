import { button, el, gz } from '../ui';
import { Cam, bigValue, fileToGray, grayToCanvas, monthYearPicker } from './date/camera.ts';
import { ENGINE_LABEL, type EngineId, getEngine, measureSizes } from './date/ocr-service.ts';
import { VARIANTS, type Gray } from './date/image.ts';
import { type MonthYear, addMonths, fmtMY } from './date/parse.ts';
import { copyText, load, median, p90, readUntil, save } from './date/read-loop.ts';
import { readDate } from './date/reader.ts';

// Screen E: the date reader on its own. Frame the date in the yellow box, tap Read (or tick Auto), check, tap OK.

type Attempt = { at: string; engine: string; ms: number; raw: string; parsed: string; final: string; outcome: 'ok' | 'corrected' | 'picked' | 'unread'; conf: number };
const KEY = 'date-spike-attempts';

export function summaryText(rows: Attempt[]) {
  const by = new Map<string, Attempt[]>();
  for (const r of rows) (by.get(r.engine) ?? by.set(r.engine, []).get(r.engine)!).push(r);
  const lines = ['engine | n | ok unchanged | corrected | picked by hand | not read | median ms | p90 ms'];
  for (const [e, a] of by) {
    const c = (o: string) => a.filter((x) => x.outcome === o).length;
    const ms = a.map((x) => x.ms);
    lines.push(`${e} | ${a.length} | ${c('ok')} (${Math.round((100 * c('ok')) / a.length)}%) | ${c('corrected')} | ${c('picked')} | ${c('unread')} | ${Math.round(median(ms))} | ${Math.round(p90(ms))}`);
  }
  lines.push('', 'attempts (engine | ms | raw OCR | parsed | final | outcome):');
  for (const r of rows) lines.push(`${r.engine} | ${Math.round(r.ms)} | ${r.raw.replace(/\s+/g, ' ')} | ${r.parsed || '-'} | ${r.final || '-'} | ${r.outcome}`);
  return lines.join('\n');
}

export function mount(root: HTMLElement) {
  const cam = new Cam();
  const rows: Attempt[] = load<Attempt[]>(KEY, []);
  let engineId: EngineId = 'paddle';
  let reading = false, stopFlag = false;
  let current: { parsed: MonthYear | null; value: MonthYear | null; raw: string; ms: number; conf: number; engine: string; touched: 'none' | 'corrected' | 'picked' } | null = null;

  const status = el('div', { textContent: 'idle' });
  const sel = el('select');
  for (const id of Object.keys(ENGINE_LABEL) as EngineId[]) sel.append(new Option(ENGINE_LABEL[id], id));
  sel.value = engineId;
  sel.onchange = () => { engineId = sel.value as EngineId; };
  const auto = el('input', { type: 'checkbox', checked: true });
  const resultBox = el('div');
  const debug = el('div');
  const table = el('pre');
  const sizes = el('pre');

  const refreshTable = () => { table.textContent = rows.length ? summaryText(rows) : 'no attempts yet'; };

  function logAttempt(outcome: Attempt['outcome']) {
    if (!current) return;
    rows.push({ at: new Date().toISOString(), engine: current.engine, ms: current.ms, raw: current.raw, parsed: current.parsed ? fmtMY(current.parsed) : '', final: current.value ? fmtMY(current.value) : '', outcome, conf: Math.round(current.conf * 100) / 100 });
    save(KEY, rows);
    refreshTable();
    current = null;
    resultBox.replaceChildren();
  }

  function showResult() {
    const c = current!;
    resultBox.replaceChildren();
    const v = bigValue(c.value);
    const raw = el('div', { textContent: `OCR: ${c.raw.replace(/\s+/g, ' ') || '(nothing)'}  |  ${c.engine}  |  ${Math.round(c.ms)} ms  |  confidence ${Math.round(c.conf * 100)}%` });
    raw.style.cssText = 'font-size:12px;opacity:.75;word-break:break-all;';
    const ok = button('OK', () => logAttempt(c.touched === 'none' ? 'ok' : c.touched));
    ok.style.cssText = 'font-size:26px;padding:14px 36px;background:#2a7;color:#fff;border:0;border-radius:8px;';
    const adj = (n: number) => button(n > 0 ? '+1 month' : '-1 month', () => { c.value = addMonths(c.value!, n); c.touched = 'corrected'; showResult(); });
    adj(1).style.cssText = adj(-1).style.cssText = '';
    const pickBtn = button("Couldn't read: pick it", () => { showPicker(); });
    resultBox.append(v, raw, ok, adj(-1), adj(1), el('br'), pickBtn);
  }

  function showPicker() {
    resultBox.replaceChildren(el('div', { textContent: 'Pick the month and year' }), monthYearPicker(current?.value ?? null, (v) => {
      if (!current) current = { parsed: null, value: null, raw: '', ms: 0, conf: 0, engine: 'none', touched: 'picked' };
      current.value = v; current.touched = 'picked';
      logAttempt(current.parsed ? 'picked' : 'picked');
    }));
  }

  async function runRead(crop?: Gray) {
    if (reading) return;
    reading = true; stopFlag = false;
    resultBox.replaceChildren();
    try {
      status.textContent = `loading ${ENGINE_LABEL[engineId]}…`;
      const t = performance.now();
      const engine = await getEngine(engineId);
      const loaded = performance.now() - t;
      status.textContent = loaded > 50 ? `engine ready (${Math.round(loaded)} ms to load); reading…` : 'reading…';
      let res, shown: Gray | null = null, ms: number;
      if (crop) {
        const t1 = performance.now();
        res = await readDate(engine, crop);
        ms = performance.now() - t1; shown = crop;
      } else {
        const lo = await readUntil(cam, engine, auto.checked ? 10000 : 0, () => stopFlag, (c) => { shown = c; });
        res = lo.res; ms = lo.ms;
      }
      if (shown) { debug.replaceChildren(grayToCanvas(shown, 360), grayToCanvas(VARIANTS[1].apply(shown), 360)); }
      if (!res) { status.textContent = 'stopped'; return; }
      if (res.value) {
        current = { parsed: res.value, value: res.value, raw: res.text, ms, conf: res.confidence, engine: engine.name, touched: 'none' };
        status.textContent = `read in ${Math.round(ms)} ms (${res.tries.length} passes, ${res.votes} agreeing)`;
        navigator.vibrate?.(60);
        showResult();
      } else {
        current = { parsed: null, value: null, raw: res.text, ms, conf: 0, engine: engine.name, touched: 'picked' };
        status.textContent = `no date found after ${Math.round(ms)} ms`;
        const unread = button('Log as not read', () => { current!.touched = 'none'; logAttempt('unread'); });
        resultBox.append(el('div', { textContent: `OCR: ${res.text.replace(/\s+/g, ' ') || '(nothing)'}` }), unread, el('br'));
        showPicker();
        resultBox.insertBefore(unread, resultBox.firstChild);
      }
    } finally { reading = false; }
  }

  const fileIn = el('input', { type: 'file', accept: 'image/*' });
  fileIn.onchange = async () => { const f = fileIn.files?.[0]; if (f) await runRead(await fileToGray(f)); };

  const torchBtn = button('Torch', async () => { await cam.setTorch(!cam.torchOn); torchBtn.textContent = cam.torchOn ? 'Torch off' : 'Torch'; });

  root.append(
    el('h3', { textContent: 'Spike E: date reader' }),
    el('div', {}, 'Engine: ', sel, el('label', {}, ' ', auto, ' auto-retry up to 10 s')),
    button('Start camera', async () => { await cam.start(); status.textContent = cam.info(); }),
    button('Stop camera', () => { stopFlag = true; cam.stop(); }),
    torchBtn,
    cam.wrap,
    (() => { const b = button('READ', () => runRead()); b.style.cssText = 'font-size:24px;padding:14px 40px;'; return b; })(),
    button('Stop reading', () => { stopFlag = true; }),
    status,
    resultBox,
    el('div', {}, 'Or test a photo: ', fileIn),
    debug,
    el('h4', { textContent: 'Log' }),
    table,
    button('Copy summary', async () => { status.textContent = (await copyText(summaryText(rows))) ? 'copied' : 'copy failed'; }),
    button('Clear log', () => { if (confirm('Clear the attempt log?')) { rows.length = 0; save(KEY, rows); refreshTable(); } }),
    el('h4', { textContent: 'Download sizes' }),
    button('Measure sizes', async () => { sizes.textContent = (await measureSizes(async (b) => gz(b))).join('\n'); }),
    sizes,
  );
  refreshTable();
  (window as any).__dateSpike = { rows, runRead, getEngine };
}

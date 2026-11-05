import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { button, el } from '../ui';
import { Cam, monthYearPicker } from './date/camera.ts';
import { type Gray } from './date/image.ts';
import { ENGINE_LABEL, type EngineId, getEngine } from './date/ocr-service.ts';
import { type MonthYear, addMonths, fmtMY } from './date/parse.ts';
import { copyText, load, median, p90, save, scanUntil } from './date/read-loop.ts';
import { resultCard, statusLine, styleBtn } from './date/widgets.ts';

// Screen F: mock stocktake, timed. scan barcode -> read date -> outcome -> Next. One camera stream for the whole session.

type Outcome = 'ok' | 'date_misread' | 'date_unreadable' | 'barcode_unreadable';
type Item = {
  n: number; ean: string; tBarcodeMs: number; tDateMs: number; totalMs: number; outcome: Outcome; engine: string; raw: string; parsed: string; final: string;
  aimMs?: number; computeMs?: number; frames?: number; skipped?: number; yearAssumed?: boolean;
};
type Session = { id: string; mode: 'ocr' | 'picker'; engine: string; startedAt: number; stoppedAt?: number; items: Item[] };
const KEY = 'stocktake-sessions';
const OUTCOMES: Outcome[] = ['ok', 'date_misread', 'date_unreadable', 'barcode_unreadable'];

const sec = (ms: number) => (ms / 1000).toFixed(1);
const big = (b: HTMLElement, bg: string) => styleBtn(b, bg, '#fff', 17);

export function sessionStats(s: Session) {
  const el_ = ((s.stoppedAt ?? Date.now()) - s.startedAt) / 60000;
  const tot = s.items.map((i) => i.totalMs / 1000);
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, s.items.filter((i) => i.outcome === o).length]));
  return { n: s.items.length, perMin: el_ > 0 ? s.items.length / el_ : 0, medianS: median(tot), p90S: p90(tot), counts, minutes: el_ };
}

export function summaryText(sessions: Session[]) {
  const L: string[] = [];
  const picker = sessions.filter((s) => s.mode === 'picker');
  const pickerDate = picker.flatMap((s) => s.items.filter((i) => i.outcome !== 'barcode_unreadable').map((i) => i.tDateMs));
  const pickerMed = median(pickerDate);
  for (const s of sessions.filter((x) => x.items.length)) {
    const st = sessionStats(s);
    L.push(`session ${s.id}  mode=${s.mode === 'ocr' ? 'OCR (' + s.engine + ')' : 'picker only'}  items=${st.n}  ${st.perMin.toFixed(1)} items/min  median ${st.medianS.toFixed(1)} s  p90 ${st.p90S.toFixed(1)} s  over ${st.minutes.toFixed(1)} min`);
    L.push(`  outcomes: ${OUTCOMES.map((o) => `${o}=${st.counts[o]}`).join(' ')}`);
    const bc = s.items.map((i) => i.tBarcodeMs / 1000), dt = s.items.map((i) => i.tDateMs / 1000);
    L.push(`  median time to barcode ${median(bc).toFixed(1)} s, to date ${median(dt).toFixed(1)} s`);
    const cm = s.items.filter((i) => i.computeMs !== undefined && i.engine !== 'picker' && i.engine !== 'none').map((i) => i.computeMs! / 1000);
    const am = s.items.filter((i) => i.aimMs !== undefined && i.engine !== 'picker' && i.engine !== 'none').map((i) => i.aimMs! / 1000);
    if (cm.length) L.push(`  date step split: median aim ${median(am).toFixed(1)} s, median compute ${median(cm).toFixed(1)} s (OCR + parse of the frame that read)`);
    if (s.mode === 'ocr' && pickerDate.length) {
      const swapped = s.items.map((i) => (i.totalMs - i.tDateMs + pickerMed) / 1000);
      const mins = swapped.reduce((a, b) => a + b, 0) / 60;
      L.push(`  baseline (date step swapped for median picker time ${sec(pickerMed)} s): median ${median(swapped).toFixed(1)} s/item, ${(s.items.length / mins).toFixed(1)} items/min of work time`);
    }
  }
  if (!picker.length) L.push('(no picker-only session yet: run a second basket with the Picker only toggle for the baseline)');
  L.push('', 'items (session | n | ean | barcode s | date s | total s | outcome | engine | raw OCR | parsed | final | aim s | compute s | frames read (skipped) | year assumed):');
  for (const s of sessions) for (const i of s.items) L.push(`${s.id} | ${i.n} | ${i.ean} | ${sec(i.tBarcodeMs)} | ${sec(i.tDateMs)} | ${sec(i.totalMs)} | ${i.outcome} | ${i.engine} | ${i.raw.replace(/\s+/g, ' ')} | ${i.parsed || '-'} | ${i.final || '-'} | ${i.aimMs === undefined ? '-' : sec(i.aimMs)} | ${i.computeMs === undefined ? '-' : sec(i.computeMs)} | ${i.frames ?? '-'} (${i.skipped ?? '-'}) | ${i.yearAssumed ? 'yes' : 'no'}`);
  return L.join('\n');
}

export function mount(root: HTMLElement) {
  const cam = new Cam();
  const sessions: Session[] = load<Session[]>(KEY, []);
  // a reload mid-session leaves it open: close it at its last item so the stats stay honest
  for (const s of sessions) if (!s.stoppedAt) s.stoppedAt = s.startedAt + (s.items.length ? s.items.reduce((a, i) => a + i.totalMs, 0) : 0);
  let cur: Session | null = null;
  let engineId: EngineId = 'paddle';
  let pickerOnly = false;

  // per-item state
  let phase: 'idle' | 'scan' | 'date' | 'done' = 'idle';
  let itemStart = 0, tBarcode = 0, tDate = 0, ean = '', barcodeFail = false;
  let parsed: MonthYear | null = null, value: MonthYear | null = null, raw = '', engineName = '';
  let aimMs = 0, computeMs = 0, frames = 0, skippedFrames = 0, yearAssumed = false, shownCrop: Gray | null = null;
  let dateState: 'reading' | 'result' | 'fix' | 'pick' = 'reading', pickOutcome: Outcome = 'ok';
  let abort = false, stopBarcode: (() => void) | undefined, runId = 0;

  const clock = el('span'); clock.style.cssText = 'font-size:24px;font-weight:700;margin:0 6px;';
  const count = el('span'); count.style.cssText = 'font-size:16px;';
  const status = statusLine();
  const stage = el('div');
  const buttons = el('div');
  const summary = el('pre');
  const note = el('div'); note.style.cssText = 'font-size:12px;opacity:.8;';
  const modeBox = el('input', { type: 'checkbox' });
  modeBox.onchange = () => { pickerOnly = modeBox.checked; };
  const sel = el('select');
  for (const id of Object.keys(ENGINE_LABEL) as EngineId[]) sel.append(new Option(ENGINE_LABEL[id], id));
  sel.value = engineId; sel.onchange = () => { engineId = sel.value as EngineId; };

  const persist = () => save(KEY, sessions);
  const refreshSummary = () => { summary.textContent = sessions.length ? summaryText(sessions) : 'no sessions yet'; };
  setInterval(() => {
    if (cur && !cur.stoppedAt) { const s = (Date.now() - cur.startedAt) / 1000; clock.textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; count.textContent = `${cur.items.length} items`; }
  }, 500);

  // ---------------------------------------------------------------- barcode
  function startBarcode(onCode: (c: string) => void) {
    let stopped = false, timer: number | undefined;
    const done = (c: string) => { if (stopped) return; stopped = true; stop(); navigator.vibrate?.(80); onCode(c); };
    const stop = () => { stopped = true; clearTimeout(timer); };
    if ('BarcodeDetector' in window) {
      const det = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const tick = async () => {
        if (stopped) return;
        try { const r = await det.detect(cam.video); if (r.length) return done(r[0].rawValue); } catch { /* frame not ready */ }
        timer = window.setTimeout(tick, 100);
      };
      tick();
    } else {
      const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]], [DecodeHintType.TRY_HARDER, true]]);
      // Not decodeFromStream: stopping that resets the video element, which would kill the shared preview.
      const reader = new BrowserMultiFormatReader(hints);
      const cv = document.createElement('canvas');
      const tick = () => {
        if (stopped) return;
        const vw = cam.video.videoWidth, vh = cam.video.videoHeight;
        if (vw) {
          const k = Math.min(1, 1280 / vw);
          cv.width = Math.round(vw * k); cv.height = Math.round(vh * k);
          cv.getContext('2d', { willReadFrequently: true })!.drawImage(cam.video, 0, 0, cv.width, cv.height);
          try { return done(reader.decodeFromCanvas(cv).getText()); } catch { /* no code in this frame */ }
        }
        timer = window.setTimeout(tick, 40);
      };
      tick();
    }
    return stop;
  }

  // ---------------------------------------------------------------- item flow
  async function startItem() {
    if (!cur) return;
    const id = ++runId;
    phase = 'scan'; abort = false; barcodeFail = false;
    ean = ''; parsed = value = null; raw = ''; engineName = pickerOnly ? 'picker' : engineId;
    tBarcode = tDate = 0; aimMs = computeMs = frames = skippedFrames = 0; yearAssumed = false; shownCrop = null;
    itemStart = performance.now();
    if (!cam.running) await cam.start();
    cam.setBoxVisible(false); cam.setStripVisible(true); void cam.video.play().catch(() => {});
    status.set('looking', undefined, 'barcode');
    render();
    stopBarcode = startBarcode((code) => { if (id === runId) gotBarcode(code, id); });
  }

  function gotBarcode(code: string, id: number) {
    ean = code; tBarcode = performance.now() - itemStart;
    status.set('got', undefined, 'barcode');
    startDate(id);
  }

  async function startDate(id: number) {
    phase = 'date';
    if (cur!.mode === 'picker') { dateState = 'pick'; pickOutcome = 'ok'; cam.setBoxVisible(false); cam.setStripVisible(false); status.set('ready'); render(); return; }
    dateState = 'reading'; pickOutcome = 'date_unreadable';
    cam.setBoxVisible(true);
    status.set('looking', { frames: 0, skipped: 0 });
    render();
    try {
      const engine = await getEngine(cur!.engine as EngineId);
      // engine load time lands in the item time on purpose: the first item pays it, the owner should feel that
      const lo = await scanUntil(cam, engine, 8000, () => abort || id !== runId || phase !== 'date' || dateState !== 'reading', (s, i) => { if (id === runId && phase === 'date' && dateState === 'reading') status.set(s, i); });
      if (id !== runId || phase !== 'date' || dateState !== 'reading') return;
      engineName = engine.name;
      raw = lo.res?.text ?? '';
      aimMs = lo.aimMs; computeMs = lo.computeMs; frames = lo.frames; skippedFrames = lo.skipped; shownCrop = lo.crop;
      yearAssumed = !!lo.res?.yearAssumed;
      cam.video.pause(); // freeze on the frame that was read
      if (lo.res?.value) {
        parsed = value = lo.res.value; dateState = 'result';
        status.set('got', undefined, 'date', yearAssumed ? '(year assumed)' : '');
        navigator.vibrate?.(60);
      } else { dateState = 'pick'; status.set('none'); }
      tDate = performance.now() - itemStart - tBarcode;
      cam.setBoxVisible(false);
      render();
    } catch (e) { note.textContent = String(e); }
  }

  function finish(outcome: Outcome) {
    if (!cur || phase === 'done') return;
    stopBarcode?.(); abort = true;
    const total = performance.now() - itemStart;
    if (!tBarcode) tBarcode = total;
    if (!tDate) tDate = Math.max(0, total - tBarcode);
    const o: Outcome = barcodeFail ? 'barcode_unreadable' : outcome;
    cur.items.push({ n: cur.items.length + 1, ean, tBarcodeMs: tBarcode, tDateMs: tDate, totalMs: total, outcome: o, engine: engineName, raw, parsed: parsed ? fmtMY(parsed) : '', final: value ? fmtMY(value) : '', aimMs, computeMs, frames, skipped: skippedFrames, yearAssumed });
    persist(); refreshSummary();
    phase = 'done'; cam.setBoxVisible(false); cam.setStripVisible(true); void cam.video.play().catch(() => {});
    status.set('ready');
    render();
  }

  function pick(outcome: Outcome) {
    stage.append(monthYearPicker(value, (v) => {
      value = v;
      if (!tDate) tDate = performance.now() - itemStart - tBarcode;
      finish(outcome);
    }));
  }

  // ---------------------------------------------------------------- render
  function render() {
    stage.replaceChildren(); buttons.replaceChildren();
    // the strip gives its room to the month picker when the picker is up
    cam.setStripVisible(!!cur && !(phase === 'date' && (dateState === 'fix' || dateState === 'pick')));
    if (!cur) { stage.append('Press Start. Aim at a barcode, then at the best-before date.'); return; }
    const detail = () => `${raw.replace(/\s+/g, ' ') || '(nothing)'} | ${engineName} | aim ${Math.round(aimMs)} + compute ${Math.round(computeMs)} ms, ${frames} frame${frames === 1 ? '' : 's'}, ${skippedFrames} skipped`;
    if (phase === 'scan') {
      buttons.append(big(button('Barcode can\'t read', () => manualEntry()), '#a52'));
    } else if (phase === 'date') {
      stage.append(el('div', { textContent: `barcode ${ean || '(manual)'}  ${sec(tBarcode)} s`, style: 'font-size:12px;opacity:.75' } as any));
      if (dateState === 'reading') {
        buttons.append(
          big(button("Date can't read", () => { abort = true; value = null; tDate = performance.now() - itemStart - tBarcode; dateState = 'pick'; pickOutcome = 'date_unreadable'; cam.setBoxVisible(false); status.set('none'); render(); }), '#888'),
          big(button("Barcode can't read", () => manualEntry()), '#a52'));
      } else if (dateState === 'result') {
        stage.append(resultCard({ crop: shownCrop, value, yearAssumed, detail: detail() }).row);
        buttons.append(
          big(button('OK', () => finish('ok')), '#2a7'),
          big(button('Date misread', () => { dateState = 'fix'; render(); }), '#c62'),
          big(button("Date can't read", () => { value = null; dateState = 'pick'; pickOutcome = 'date_unreadable'; render(); }), '#888'));
      } else if (dateState === 'fix') {
        stage.append(resultCard({ crop: shownCrop, value, yearAssumed, detail: 'fix it: +-1 month, or pick' }).row);
        buttons.append(big(button('Done', () => finish('date_misread')), '#2a7'), big(button('-1', () => { value = addMonths(value!, -1); render(); }), '#26c'), big(button('+1', () => { value = addMonths(value!, 1); render(); }), '#26c'));
        pick('date_misread');
      } else {
        if (cur.mode === 'picker') stage.append(el('div', { textContent: 'Picker only: pick the best-before month' }));
        else stage.append(resultCard({ crop: shownCrop, value: null, yearAssumed: false, detail: `No date read. OCR: ${raw.replace(/\s+/g, ' ') || 'nothing'}` }).row);
        pick(pickOutcome);
      }
    } else if (phase === 'done') {
      const it = cur.items[cur.items.length - 1];
      stage.append(el('div', { textContent: `Item ${it.n}: ${it.outcome}  ${it.final || '-'}${it.yearAssumed ? ' (year assumed)' : ''}  ${sec(it.totalMs)} s` }));
      buttons.append(big(button('Next', () => { startItem(); }), '#26c'));
    }
  }

  function manualEntry() {
    barcodeFail = true; stopBarcode?.(); abort = true; const mid = ++runId;
    const inp = el('input', { type: 'text', placeholder: 'EAN (manual entry stub)' } as any);
    inp.inputMode = 'numeric'; inp.style.cssText = 'font-size:18px;padding:8px;';
    stage.replaceChildren(el('div', { textContent: 'Barcode can\'t read: type it (stub), then continue to the date' }), inp,
      button('Continue', () => { ean = inp.value || '(skipped)'; tBarcode = performance.now() - itemStart; abort = false; startDate(mid); }));
    buttons.replaceChildren();
  }

  // ---------------------------------------------------------------- session controls
  const startBtn = button('Start', async () => {
    if (cur && !cur.stoppedAt) return;
    cur = { id: new Date().toISOString().slice(5, 16).replace('T', ' '), mode: pickerOnly ? 'picker' : 'ocr', engine: engineId, startedAt: Date.now(), items: [] };
    sessions.push(cur); persist();
    await startItem();
  });
  styleBtn(startBtn, '#26c', '#fff', 20);
  const stopBtn = button('Stop', () => {
    if (!cur) return;
    abort = true; runId++; stopBarcode?.();
    cur.stoppedAt = Date.now(); persist(); phase = 'idle'; cam.setBoxVisible(false);
    cur = null; clock.textContent = ''; render(); refreshSummary(); status.set('ready');
    stage.append(el('div', { textContent: 'Session stopped. Summary below.' }));
  });
  styleBtn(stopBtn, '#888', '#fff', 20);

  const title = el('div', { textContent: 'Spike F: mock stocktake' });
  title.style.cssText = 'font-size:15px;font-weight:700;margin:2px 0 4px;';
  const cfgRow = el('div', {}, sel, el('label', {}, ' ', modeBox, ' picker only (baseline)'));
  cfgRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;margin-top:4px;font-size:14px;';
  sel.style.cssText = 'font-size:15px;padding:6px;max-width:55vw;';
  const topRow = el('div', {}, startBtn, stopBtn, clock, count);
  topRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;';
  root.append(
    title, topRow, cfgRow,
    cam.ui, status.box, stage, buttons, note,
    el('h4', { textContent: 'Summary' }), summary,
    button('Copy summary', async () => { note.textContent = (await copyText(cam.summaryLine() + '\n\n' + summaryText(sessions))) ? 'copied' : 'copy failed'; }),
    button('Clear sessions', () => { if (confirm('Clear all stocktake sessions?')) { sessions.length = 0; persist(); refreshSummary(); } }),
  );
  cam.setBoxVisible(false);
  render(); refreshSummary();
  (window as any).__stocktake = { sessions };
}

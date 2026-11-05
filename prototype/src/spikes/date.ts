import { button, el, gz } from '../ui';
import { Cam, fileToGray, grayToCanvas, monthYearPicker } from './date/camera.ts';
import { ENGINE_LABEL, type EngineId, getEngine, measureSizes } from './date/ocr-service.ts';
import { type Gray } from './date/image.ts';
import { type MonthYear, addMonths, fmtMY } from './date/parse.ts';
import { copyText, load, median, p90, save, scanUntil } from './date/read-loop.ts';
import { readDate } from './date/reader.ts';
import { resultCard, smallCrop, statusLine, styleBtn } from './date/widgets.ts';

// Screen E: the date reader on its own. Frame the date in the yellow box, tap READ, check the frozen result, tap OK.

type Attempt = {
  at: string; engine: string; ms: number; raw: string; parsed: string; final: string;
  outcome: 'ok' | 'corrected' | 'picked' | 'unread'; conf: number;
  aimMs?: number; computeMs?: number; frames?: number; skipped?: number; passes?: number; yearAssumed?: boolean; expired?: boolean; zoom?: number; agreed?: number; stop?: string; needAgree?: boolean; glare?: number;
};
const KEY = 'date-spike-attempts';

const n0 = (x: number | undefined) => (x === undefined ? '-' : String(Math.round(x)));

export function summaryText(rows: Attempt[]) {
  const by = new Map<string, Attempt[]>();
  for (const r of rows) (by.get(r.engine) ?? by.set(r.engine, []).get(r.engine)!).push(r);
  const lines = ['engine | n | ok unchanged | corrected | picked by hand | not read | median total ms | p90 total ms | median compute ms | median aim ms'];
  for (const [e, a] of by) {
    const c = (o: string) => a.filter((x) => x.outcome === o).length;
    const ms = a.map((x) => x.ms);
    const comp = a.filter((x) => x.computeMs !== undefined).map((x) => x.computeMs!);
    const aim = a.filter((x) => x.aimMs !== undefined).map((x) => x.aimMs!);
    lines.push(`${e} | ${a.length} | ${c('ok')} (${Math.round((100 * c('ok')) / a.length)}%) | ${c('corrected')} | ${c('picked')} | ${c('unread')} | ${Math.round(median(ms))} | ${Math.round(p90(ms))} | ${comp.length ? Math.round(median(comp)) : '-'} | ${aim.length ? Math.round(median(aim)) : '-'}`);
  }
  for (const [e, a] of by) lines.push(`${e}: stopped on agreement ${a.filter((x) => x.stop === 'agreement').length}, one confident read ${a.filter((x) => x.stop === 'confident').length}, first read (agreement off) ${a.filter((x) => x.stop === 'single').length}`);
  lines.push('', 'attempts (engine | total ms | aim ms | compute ms | frames read (skipped) | passes | raw OCR | parsed | final | outcome | year assumed | expired | zoom | frames agreed | stopped on | need two frames | glare frames):');
  for (const r of rows) lines.push(`${r.engine} | ${n0(r.ms)} | ${n0(r.aimMs)} | ${n0(r.computeMs)} | ${r.frames ?? '-'} (${r.skipped ?? '-'}) | ${r.passes ?? '-'} | ${r.raw.replace(/\s+/g, ' ')} | ${r.parsed || '-'} | ${r.final || '-'} | ${r.outcome} | ${r.yearAssumed ? 'yes' : 'no'} | ${r.expired ? 'yes' : 'no'} | ${r.zoom ? r.zoom.toFixed(1) + 'x' : '-'} | ${r.agreed ?? '-'} | ${r.stop ?? '-'} | ${r.needAgree === undefined ? '-' : r.needAgree ? 'yes' : 'no'} | ${r.glare ?? '-'}`);
  return lines.join('\n');
}

type Cur = {
  parsed: MonthYear | null; value: MonthYear | null; raw: string; ms: number; aimMs: number; computeMs: number; frames: number; skipped: number;
  passes: number; conf: number; engine: string; yearAssumed: boolean; expired: boolean; agreed: number; stop: string; needAgree: boolean; glare: number; touched: 'none' | 'corrected' | 'picked'; crop: Gray | null;
};

export function mount(root: HTMLElement) {
  const cam = new Cam();
  const rows: Attempt[] = load<Attempt[]>(KEY, []);
  const thumbs = new Map<Attempt, Gray>(); // in memory only: the crop of each attempt made in this page's life
  let engineId: EngineId = 'paddle';
  let reading = false, stopFlag = false;
  let current: Cur | null = null;
  let phase: 'ready' | 'scanning' | 'result' | 'none' | 'pick' = 'ready';

  const title = el('div', { textContent: 'Spike E: date reader' });
  title.style.cssText = 'font-size:15px;font-weight:700;margin:2px 0 4px;';
  const status = statusLine();
  const note = el('div');
  note.style.cssText = 'font-size:12px;opacity:.75;min-height:15px;word-break:break-all;';
  const sel = el('select');
  for (const id of Object.keys(ENGINE_LABEL) as EngineId[]) sel.append(new Option(ENGINE_LABEL[id], id));
  sel.value = engineId;
  sel.onchange = () => { engineId = sel.value as EngineId; };
  sel.style.cssText = 'font-size:14px;padding:4px;max-width:60vw;';
  const auto = el('input', { type: 'checkbox', checked: true });
  const agree = el('input', { type: 'checkbox', checked: true }); // round 3: two frames must agree before "Got it"
  const rot = el('input', { type: 'checkbox', checked: false }); // off: each extra rotation multiplies the work
  const area = el('div'); // the controls / frozen result, re-rendered per phase
  const table = el('pre');
  const logList = el('div');
  const sizes = el('pre');

  const refreshLog = () => {
    table.textContent = rows.length ? summaryText(rows) : 'no attempts yet';
    logList.replaceChildren();
    [...rows].reverse().forEach((r) => {
      const item = el('div');
      item.style.cssText = 'border-bottom:1px solid #aaa;padding:4px 0;cursor:pointer;';
      const head = el('div');
      head.style.cssText = 'display:flex;gap:8px;align-items:center;';
      const t = thumbs.get(r);
      if (t) head.append(grayToCanvas(smallCrop(t, 90), 90, 'flex:0 0 90px;width:90px;'));
      else { const none = el('div', { textContent: '(no image)' }); none.style.cssText = 'flex:0 0 90px;font-size:11px;opacity:.6;'; head.append(none); }
      head.append(el('div', { textContent: `${r.engine}  ${r.final || '-'}${r.yearAssumed ? ' (year assumed)' : ''}${r.expired ? ' (expired)' : ''}  ${r.outcome}  ${n0(r.ms)} ms` }));
      const more = el('div');
      more.style.cssText = 'display:none;font-size:12px;margin-top:4px;word-break:break-all;';
      more.append(el('div', { textContent: `raw OCR: ${r.raw.replace(/\s+/g, ' ') || '(nothing)'}` }), el('div', { textContent: `parsed ${r.parsed || '-'}, final ${r.final || '-'}, conf ${r.conf}; aim ${n0(r.aimMs)} ms, compute ${n0(r.computeMs)} ms, ${r.frames ?? '-'} frames read, ${r.skipped ?? '-'} skipped, ${r.passes ?? '-'} passes; agreed ${r.agreed ?? '-'}, stopped on ${r.stop ?? '-'}, need two frames ${r.needAgree === undefined ? '-' : r.needAgree ? 'yes' : 'no'}` }));
      if (t) more.append(grayToCanvas(t, 360));
      item.append(head, more);
      item.onclick = () => { more.style.display = more.style.display === 'none' ? 'block' : 'none'; };
      logList.append(item);
    });
  };

  function logAttempt(outcome: Attempt['outcome']) {
    if (!current) return;
    const r: Attempt = {
      at: new Date().toISOString(), engine: current.engine, ms: current.ms, raw: current.raw, parsed: current.parsed ? fmtMY(current.parsed) : '',
      final: current.value ? fmtMY(current.value) : '', outcome, conf: Math.round(current.conf * 100) / 100,
      aimMs: Math.round(current.aimMs), computeMs: Math.round(current.computeMs), frames: current.frames, skipped: current.skipped, passes: current.passes, yearAssumed: current.yearAssumed, expired: current.expired, zoom: cam.zoom ?? undefined, agreed: current.agreed, stop: current.stop, needAgree: current.needAgree, glare: current.glare,
    };
    rows.push(r);
    if (current.crop) thumbs.set(r, current.crop);
    save(KEY, rows);
    current = null;
    backToReady();
    refreshLog();
  }

  function resume() { cam.setStripVisible(true); if (cam.running) void cam.video.play().catch(() => {}); }
  function backToReady() { phase = 'ready'; status.set('ready'); note.textContent = ''; resume(); render(); }

  function render() {
    area.replaceChildren();
    if (phase === 'ready') {
      const b = styleBtn(button('READ', () => runRead()), '#26c', '#fff', 26);
      b.style.width = '100%';
      area.append(b);
    } else if (phase === 'scanning') {
      const b = styleBtn(button('Stop', () => { stopFlag = true; }), '#888', '#fff', 22);
      b.style.width = '100%';
      area.append(b);
    } else if (phase === 'result' && current) {
      const c = current;
      const detail = `${c.raw.replace(/\s+/g, ' ') || '(nothing)'} | ${c.engine} | ${Math.round(c.conf * 100)}%`;
      area.append(resultCard({ crop: c.crop, value: c.value, yearAssumed: c.yearAssumed, expired: c.expired, detail }).row);
      const row = el('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;';
      const adj = (n: number) => styleBtn(button(n > 0 ? '+1' : '-1', () => { c.value = addMonths(c.value!, n); c.touched = 'corrected'; render(); }));
      row.append(
        styleBtn(button('OK', () => logAttempt(c.touched === 'none' ? 'ok' : c.touched)), '#2a7', '#fff', 24),
        adj(-1), adj(1),
        styleBtn(button("Couldn't read", () => { phase = 'pick'; render(); })),
      );
      area.append(row);
    } else if (phase === 'none') {
      const c = current;
      area.append(resultCard({ crop: c?.crop ?? null, value: null, yearAssumed: false, detail: `OCR: ${c?.raw.replace(/\s+/g, ' ') || '(nothing)'}` }).row);
      area.append(styleBtn(button('Log as not read', () => { if (current) { current.touched = 'none'; logAttempt('unread'); } }), '#888'),
        styleBtn(button('Pick it', () => { phase = 'pick'; render(); })),
        styleBtn(button('Try again', () => { current = null; backToReady(); void runRead(); }), '#26c'));
    } else if (phase === 'pick') {
      cam.setStripVisible(false);
      area.append(el('div', { textContent: 'Pick the month and year' }), monthYearPicker(current?.value ?? null, (v) => {
        if (!current) current = { parsed: null, value: null, raw: '', ms: 0, aimMs: 0, computeMs: 0, frames: 0, skipped: 0, passes: 0, conf: 0, engine: 'none', yearAssumed: false, expired: false, agreed: 0, stop: '', needAgree: agree.checked, glare: 0, touched: 'picked', crop: null };
        current.value = v; current.touched = 'picked';
        logAttempt('picked');
      }), styleBtn(button('Log as not read', () => { if (current) { current.touched = 'none'; current.value = null; logAttempt('unread'); } }), '#888'));
    }
  }

  function finish(g: { value: MonthYear | null; raw: string; ms: number; aimMs: number; computeMs: number; frames: number; skipped: number; passes: number; conf: number; yearAssumed: boolean; expired?: boolean; crop: Gray | null; agreed?: number; stop?: string | null; lone?: string; glare?: number }, engineName: string) {
    current = { parsed: g.value, value: g.value, raw: g.raw, ms: g.ms, aimMs: g.aimMs, computeMs: g.computeMs, frames: g.frames, skipped: g.skipped, passes: g.passes, conf: g.conf, engine: engineName, yearAssumed: g.yearAssumed, expired: !!g.expired, agreed: g.agreed ?? 0, stop: g.stop ?? '', needAgree: agree.checked, glare: g.glare ?? 0, touched: g.value ? 'none' : 'picked', crop: g.crop };
    cam.video.pause(); // freeze the preview on the frame that was read
    if (g.value) {
      phase = 'result';
      status.set('got', undefined, 'date', [g.yearAssumed ? '(year assumed)' : '', g.expired ? '(expired)' : ''].filter(Boolean).join(' '));
      navigator.vibrate?.(60);
    } else {
      phase = 'none';
      status.set('none');
    }
    note.textContent = `${g.frames} frame${g.frames === 1 ? '' : 's'}, ${g.skipped} skipped${g.glare ? `, ${g.glare} glare` : ''}, ${g.passes} pass${g.passes === 1 ? '' : 'es'} | aim ${Math.round(g.aimMs)} + compute ${Math.round(g.computeMs)} ms` + (g.value ? ` | ${g.stop === 'agreement' ? g.agreed + ' frames agreed' : g.stop === 'confident' ? 'one confident read' : 'first read'}` : g.lone ? ` | saw ${g.lone} once, never confirmed` : '');
    render();
  }

  async function runRead(crop?: Gray) {
    if (reading) return;
    reading = true; stopFlag = false;
    phase = 'scanning'; current = null;
    status.set('looking', { frames: 0, skipped: 0 });
    render();
    try {
      if (!crop && !cam.running) { await cam.start(); note.textContent = cam.info(); }
      note.textContent = `loading ${ENGINE_LABEL[engineId]}…`;
      const t = performance.now();
      const engine = await getEngine(engineId);
      const loaded = performance.now() - t;
      note.textContent = loaded > 50 ? `engine loaded in ${Math.round(loaded)} ms (not counted in the times below)` : '';
      status.set('looking', { frames: 0, skipped: 0 });
      if (crop) {
        status.set('reading', { frames: 0, skipped: 0 });
        const t1 = performance.now();
        const res = await readDate(engine, crop, rot.checked ? { rotations: [0, 90, 270, 180] } : {});
        const ms = performance.now() - t1;
        finish({ value: res.value, raw: res.text, ms, aimMs: 0, computeMs: ms, frames: 1, skipped: 0, passes: res.variants, conf: res.confidence, yearAssumed: res.yearAssumed, expired: res.expired, crop }, engine.name);
        return;
      }
      const lo = await scanUntil(cam, engine, auto.checked ? 10000 : 0, () => stopFlag, (s, i) => status.set(s, i), { ...(rot.checked ? { rotations: [0, 90, 270, 180] as (0 | 90 | 180 | 270)[] } : {}), needAgree: agree.checked });
      if (lo.outcome === 'stopped') { backToReady(); note.textContent = 'stopped'; return; }
      finish({ value: lo.res?.value ?? null, raw: lo.res?.text ?? '', ms: lo.totalMs, aimMs: lo.aimMs, computeMs: lo.computeMs, frames: lo.frames, skipped: lo.skipped, passes: lo.res?.variants ?? 0, conf: lo.res?.confidence ?? 0, yearAssumed: lo.res?.yearAssumed ?? false, expired: lo.res?.expired ?? false, crop: lo.crop, agreed: lo.agreed, stop: lo.stop, lone: lo.lone ? fmtMY(lo.lone.value) : undefined, glare: lo.glare }, engine.name);
    } catch (e) {
      backToReady(); note.textContent = String(e);
    } finally { reading = false; }
  }

  const fileIn = el('input', { type: 'file', accept: 'image/*' });
  fileIn.onchange = async () => { const f = fileIn.files?.[0]; if (f) await runRead(await fileToGray(f)); };

  const camBtn = styleBtn(button('Start camera', async () => {
    if (cam.running) { stopFlag = true; cam.stop(); camBtn.textContent = 'Start camera'; return; }
    await cam.start(); note.textContent = cam.info(); camBtn.textContent = 'Stop camera';
  }), '', '', 15);
  const torchBtn = styleBtn(button('Torch', async () => { await cam.setTorch(!cam.torchOn); torchBtn.textContent = cam.torchOn ? 'Torch off' : 'Torch'; }), '', '', 15);
  camBtn.style.minHeight = torchBtn.style.minHeight = '38px';
  const cfg = el('div', {}, camBtn, torchBtn, sel, el('label', {}, ' ', auto, ' auto'), el('label', {}, ' ', agree, ' Need two frames to agree'), el('label', {}, ' ', rot, ' sideways too'));
  cfg.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;';

  root.append(
    title, cfg,
    cam.ui, status.box, note, area,
    el('div', {}, 'Or test a photo: ', fileIn),
    el('h4', { textContent: 'Log (tap a row for the crop and the raw text)' }),
    logList,
    el('h4', { textContent: 'Summary' }),
    table,
    button('Copy summary', async () => { note.textContent = (await copyText(cam.summaryLine() + '\n\n' + summaryText(rows))) ? 'copied' : 'copy failed'; }),
    button('Clear log', () => { if (confirm('Clear the attempt log?')) { rows.length = 0; thumbs.clear(); save(KEY, rows); refreshLog(); } }),
    el('h4', { textContent: 'Download sizes' }),
    button('Measure sizes', async () => { sizes.textContent = (await measureSizes(async (b) => gz(b))).join('\n'); }),
    sizes,
  );
  render(); refreshLog();
  (window as any).__dateSpike = { rows, runRead, getEngine, cam };
}

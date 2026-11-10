import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { expiryLevel, expiryWindows } from '../../../engine';
import { toYearMonth, type OfferedSuggestion } from '../../../engine/datecode';
import {
  startDateLoop,
  type DateCamera,
  type DateLoop,
  type LoopStatus,
} from '../../../scan/dateLoop';
import type { Gray } from '../../../scan/ocr/image';
import { READER_DOWNLOAD_MB, readerDownloaded } from '../../../scan/ocr/cache';
import { getDateReader, peekDateReader } from '../../../scan/ocr/client';
import { ReaderStopped } from '../../../scan/ocr/errors';
import { ExpiryBadge } from '../../components/ExpiryBadge';
import { EXPIRY_LABEL } from '../../labels';
import { useDocument } from '../../state';
import { readUseWebGpu } from './dateSettings';
import { formatMonth } from './stock';
import { buzz } from './stocktakeTunables';

/** What the camera settled on, for the screen to decide what to do with. */
export interface DateRead {
  /** `YYYY-MM`. */
  bestBefore: string;
  yearAssumed: boolean;
  expired: boolean;
  /** Milliseconds from the start to the first frame that went into the answer. */
  aimMs: number;
  /** Milliseconds of compute on the frames that went into the answer. */
  computeMs: number;
  totalMs: number;
}

/** The numbers of a search that ended without an answer. */
export interface DateSearch {
  frames: number;
  totalMs: number;
}

type Phase = 'idle' | 'loading' | 'running' | 'got' | 'none' | 'unavailable';

const MESSAGE: Record<LoopStatus, string> = {
  looking: 'Looking for a date…',
  hold: 'Hold still',
  glare: 'Glare: tilt the phone a little',
  reading: 'Reading…',
  checking: 'Checking…',
};

/** Paints a grey picture into a canvas, in memory only. */
function Crop({ crop }: { crop: Gray }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rgba = new Uint8ClampedArray(crop.w * crop.h * 4);
      for (let i = 0; i < crop.d.length; i++) {
        const v = crop.d[i]!;
        rgba[i * 4] = v;
        rgba[i * 4 + 1] = v;
        rgba[i * 4 + 2] = v;
        rgba[i * 4 + 3] = 255;
      }
      canvas.width = crop.w;
      canvas.height = crop.h;
      ctx.putImageData(new ImageData(rgba, crop.w, crop.h), 0, 0);
    } catch {
      // No canvas here: the card just has no picture.
    }
  }, [crop]);
  return (
    <canvas
      ref={ref}
      className="date-crop"
      role="img"
      aria-label="The part of the label that was read"
    />
  );
}

/**
 * Reads the best-before month off the camera and shows what it found: one status line, then the
 * card (month large, expiry word and colour, "year assumed", the small crop it read) or up to
 * three one-tap suggestions. It never writes the document: the screen decides what a result or a
 * tap means. Starts by itself when `cam` is there (`autoStart`); Read again starts it over.
 */
export function DateReader({
  cam,
  todayIso,
  autoStart = true,
  onResult,
  onSuggestion,
  onSearched,
  paused = false,
  onAgain,
  centre = null,
}: {
  cam: DateCamera | null;
  todayIso: string;
  autoStart?: boolean;
  onResult: (read: DateRead) => void;
  /** A tap on a suggestion, as `YYYY-MM`. */
  onSuggestion: (bestBefore: string) => void;
  onSearched?: (search: DateSearch) => void;
  /** The person set the date by hand: stop looking (a late read must not overwrite it). */
  paused?: boolean;
  /** Read again was tapped. */
  onAgain?: () => void;
  /** The centre of the camera strip, where the status and the read month are drawn. */
  centre?: HTMLElement | null;
}) {
  const { settings } = useDocument();
  const windows = expiryWindows(settings);
  const [phaseState, setPhase] = useState<Phase>('idle');
  const [line, setLine] = useState('');
  const [run, setRun] = useState(0);
  const [read, setRead] = useState<{ ym: string; assumed: boolean; crop: Gray | null } | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<OfferedSuggestion[]>([]);
  // Whether the reader's files are already kept on this phone (null: not known, or no Cache Storage).
  const [downloaded, setDownloaded] = useState<boolean | null>(null);
  useEffect(() => {
    let gone = false;
    void readerDownloaded().then((d) => {
      if (!gone) setDownloaded(d);
    });
    return () => {
      gone = true;
    };
  }, []);
  const loopRef = useRef<DateLoop | null>(null);
  const live = useRef({ onResult, onSearched, todayIso, onAgain });
  useEffect(() => {
    live.current = { onResult, onSearched, todayIso, onAgain };
  });
  // What the card shows now, so a new camera stream (hide and show) does not redo a finished read.
  const phaseRef = useRef<Phase>('idle');
  useEffect(() => {
    phaseRef.current = phaseState;
  });

  useEffect(() => {
    if (!cam || !autoStart || paused) return;
    if (phaseRef.current === 'got' || phaseRef.current === 'none') return;
    let gone = false;
    // A restart (a new camera stream after the page was shown again) is a load, whatever the last
    // run left on the line: "unavailable" or a stale "Reading…" must not sit over a live camera.
    setPhase('loading');
    setLine('');
    // A browser with no Worker throws here: that is "not available", like a failed load.
    const loaded = Promise.resolve()
      .then(() => getDateReader(readUseWebGpu()))
      .then(async (reader) => {
        await reader.ready;
        return reader;
      });
    loaded.then(
      (reader) => {
        if (gone) return;
        setPhase('running');
        const loop = startDateLoop(cam, reader, {
          todayIso: live.current.todayIso,
          onStatus: (s, info) => {
            if (gone) return;
            setLine(
              s === 'checking' && info.pending
                ? `Got ${formatMonth(toYearMonth(info.pending))} once, checking…`
                : MESSAGE[s],
            );
          },
        });
        loopRef.current = loop;
        void loop.result.then((out) => {
          if (gone) return;
          loopRef.current = null;
          if (out.outcome === 'got' && out.settled) {
            const ym = toYearMonth(out.settled.value);
            buzz('date');
            setRead({ ym, assumed: out.settled.yearAssumed, crop: out.crop });
            setLine('Got it');
            setPhase('got');
            live.current.onResult({
              bestBefore: ym,
              yearAssumed: out.settled.yearAssumed,
              expired: out.settled.expired,
              aimMs: out.aimMs,
              computeMs: out.computeMs,
              totalMs: out.totalMs,
            });
          } else if (out.outcome === 'none') {
            setSuggestions(out.suggestions);
            setLine('No date found');
            setPhase('none');
            live.current.onSearched?.({ frames: out.frames, totalMs: out.totalMs });
          } else if (out.outcome === 'failed') {
            setPhase('unavailable');
          }
        });
      },
      (e: unknown) => {
        // A reader shut down on purpose (the page was hidden) is not a fault: a new stream reloads it.
        if (!gone && !(e instanceof ReaderStopped)) setPhase('unavailable');
      },
    );
    return () => {
      gone = true;
      loopRef.current?.abort();
      loopRef.current = null;
    };
  }, [cam, autoStart, run, paused]);

  /** Starts the search over: the old card and suggestions go. */
  const again = (): void => {
    setRead(null);
    setSuggestions([]);
    setLine('');
    setPhase('loading');
    setRun((n) => n + 1);
    live.current.onAgain?.();
  };
  // Before the first status arrives the line says what the wait is: the reader's first load, or the start.
  const looking = phaseState === 'idle' || phaseState === 'loading' || phaseState === 'running';
  const phase: Phase | 'paused' =
    !cam || !autoStart
      ? 'idle'
      : paused && looking
        ? 'paused'
        : phaseState === 'idle'
          ? 'loading'
          : phaseState;
  const shownLine =
    line ||
    (peekDateReader()?.status().state === 'ready'
      ? MESSAGE.looking
      : downloaded === false
        ? `Getting the date reader ready… (about ${READER_DOWNLOAD_MB} MB, once)`
        : 'Getting the date reader ready…');

  if (phase === 'unavailable') {
    return (
      <div className="date-reader">
        <p role="status" aria-live="polite" className="date-status">
          {downloaded === false && navigator.onLine === false
            ? `Connect once to download the date reader (about ${READER_DOWNLOAD_MB} MB). Pick the date for now.`
            : 'The date reader isn’t available here; pick the date.'}
        </p>
      </div>
    );
  }
  if (phase === 'idle') return null;
  if (phase === 'paused') {
    return (
      <div className="date-reader">
        <div className="date-head">
          <p role="status" aria-live="polite" className="date-status" data-testid="date-status">
            Date set by hand
          </p>
          <button type="button" className="secondary" onClick={again}>
            Read again
          </button>
        </div>
      </div>
    );
  }

  // The button that fits (Stop while looking, Read again after) and the small crop that was read.
  const actions = (
    <div className={centre ? 'centre-actions' : 'date-head'}>
      {phase === 'got' && read?.crop ? <Crop crop={read.crop} /> : <span />}
      {phase === 'loading' || phase === 'running' ? (
        <button type="button" className="secondary" onClick={() => loopRef.current?.stop()}>
          Stop
        </button>
      ) : null}
      {phase === 'got' || phase === 'none' ? (
        <button type="button" className="secondary" onClick={again}>
          Read again
        </button>
      ) : null}
    </div>
  );

  // The status, the month and the button are drawn on the camera strip (`centre`), where the eye
  // is and so that nothing below the strip is pushed down; with no strip they sit here.
  const onStrip = (
    <>
      <div className="centre-stack">
        <div
          className="centre-pill"
          role="status"
          aria-live="polite"
          data-testid="date-status"
          data-phase={phase}
        >
          {shownLine}
        </div>
        {phase === 'got' && read ? (
          <div className="centre-result" data-testid="date-result">
            <strong className="date-month">{formatMonth(read.ym)}</strong>{' '}
            <ExpiryBadge bestBefore={read.ym} />
            {read.assumed ? <span className="bb bb-check"> · year assumed</span> : null}
          </div>
        ) : null}
      </div>
      {centre ? actions : null}
    </>
  );

  return (
    <div className="date-reader">
      {centre ? createPortal(onStrip, centre) : onStrip}
      {centre ? null : actions}
      {phase === 'none' && suggestions.length > 0 ? (
        <div className="chips" role="group" aria-label="Suggested dates">
          {suggestions.map((s) => {
            const ym = toYearMonth(s);
            const level = expiryLevel(ym, todayIso, windows);
            return (
              <button type="button" className="chip" key={ym} onClick={() => onSuggestion(ym)}>
                {formatMonth(ym)}
                {level === 'ok' ? null : (
                  <span className={`bb bb-${level}`}> · {EXPIRY_LABEL[level]}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

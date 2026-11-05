/**
 * How sure the camera date reading is, as pure functions over what the reader returned: no
 * timers, no images, no clock (today comes in as ISO text).
 *
 * Two levels. One frame is read in several passes (cheapest picture first), each pass's text is
 * parsed, and {@link FrameTally} turns the passes into a verdict. Across frames,
 * {@link AgreementTally} settles on a month-year once two frames give the same one, or one frame
 * is confident enough alone, and never on a year that was only assumed.
 */
import { parseDates, type MonthYear, type Suggestion } from './parse';

/** A pass counts as sure when the parser's confidence reaches this... */
export const SURE_PARSER = 0.7;
/** ...and the text reader's confidence reaches this... */
export const SURE_ENGINE = 0.75;
/**
 * A frame is trusted alone only above this. Picked from the bench: every wrong single pass had a
 * parser confidence of 0.6 or less (no label, or year assumed), which becomes a frame confidence
 * of 0.7 at most even when two passes agree. Year-assumed reads never pass alone.
 */
export const CONFIDENT_ALONE = 0.85;
/** A single unsure pass is capped here: it needs company. */
export const SINGLE_UNSURE_CAP = 0.6;
/** A single sure pass is capped here. */
export const SINGLE_SURE_CAP = 0.9;
/** Passes that read different dates multiply the confidence by this. */
export const DISAGREE_FACTOR = 0.6;
/** Passes agreeing add this much each after the first (up to {@link AGREE_CAP}). */
export const AGREE_BONUS = 0.1;
export const AGREE_CAP = 0.97;
/** Agreeing passes within one frame that end it early. */
export const PASSES_TO_AGREE = 2;
/** Frames giving the same month and year that settle the read. */
export const FRAMES_TO_AGREE = 2;
/** At most this many one-tap suggestions. */
export const MAX_SUGGESTIONS = 3;

/** One pass over one picture of the frame: what the text reader returned. */
export interface Pass {
  /** Which picture variant it was ("stretch@64"). */
  variant: string;
  text: string;
  /** The text reader's own confidence, 0 to 1. */
  engineConf: number;
  ms: number;
}

/** What a pass came to once parsed, for the log and the tests. */
export interface PassInfo {
  variant: string;
  text: string;
  engineConf: number;
  ms: number;
  found: MonthYear | null;
}

/** The verdict on one frame. Never carries pixels. */
export interface FrameVerdict {
  value: MonthYear | null;
  /** Day and month were printed, the year was filled in. */
  yearAssumed: boolean;
  /** The month has passed (up to 24 months back). */
  expired: boolean;
  /** Weak date-like runs seen in any pass, most often seen first. Never a result. */
  suggestions: Suggestion[];
  confidence: number;
  /** Raw text of the winning pass (or the first non-empty one). */
  text: string;
  /** Passes that gave the winner. */
  votes: number;
  passes: PassInfo[];
  /** Compute for this frame, filled in by the caller. */
  ms: number;
}

const monthKey = (m: MonthYear): number => m.year * 12 + m.month;
const labelOf = (m: MonthYear): string => `${String(m.month).padStart(2, '0')}/${m.year}`;

/** A pass is trusted outright when the parser is sure of the shape and the reader of the characters. */
export const isSure = (parserConf: number, engineConf: number, yearAssumed: boolean): boolean =>
  !yearAssumed && parserConf >= SURE_PARSER && engineConf >= SURE_ENGINE;

interface Entry {
  value: MonthYear;
  votes: number;
  conf: number;
  text: string;
  assumed: boolean;
  expired: boolean;
  sure: boolean;
}

/** Collects the passes of one frame. Add a pass at a time; it says when to stop trying more. */
export class FrameTally {
  private readonly entries = new Map<number, Entry>();
  private readonly weak = new Map<string, { s: Suggestion; n: number }>();
  private readonly passes: PassInfo[] = [];
  private winner: Entry | undefined;

  constructor(private readonly todayIso: string) {}

  /** Adds one pass. Returns true when the frame is settled and further passes are not needed. */
  add(pass: Pass): boolean {
    const parsed = parseDates(pass.text, this.todayIso);
    for (const s of parsed.suggestions) {
      const k = labelOf(s);
      const e = this.weak.get(k);
      if (e) e.n++;
      else this.weak.set(k, { s, n: 1 });
    }
    const best = parsed.best;
    this.passes.push({
      variant: pass.variant,
      text: pass.text,
      engineConf: pass.engineConf,
      ms: pass.ms,
      found: best ? { month: best.month, year: best.year } : null,
    });
    if (!best) return false;
    const k = monthKey(best);
    const sure = isSure(parsed.confidence, pass.engineConf, !!best.yearAssumed);
    const e = this.entries.get(k) ?? {
      value: { month: best.month, year: best.year },
      votes: 0,
      conf: 0,
      text: pass.text,
      assumed: !!best.yearAssumed,
      expired: !!best.expired,
      sure: false,
    };
    e.votes++;
    e.sure ||= sure;
    e.conf = Math.max(e.conf, parsed.confidence * (0.5 + 0.5 * Math.min(1, pass.engineConf + 0.2)));
    this.entries.set(k, e);
    this.winner = [...this.entries.values()].sort(
      (a, b) => b.votes - a.votes || b.conf - a.conf,
    )[0];
    if (sure && this.entries.size === 1) return true;
    return (
      this.winner !== undefined && this.winner.votes >= PASSES_TO_AGREE && this.entries.size === 1
    );
  }

  verdict(ms: number): FrameVerdict {
    const first = this.passes.find((p) => p.text)?.text ?? '';
    const suggestions = [...this.weak.values()]
      .sort((a, b) => b.n - a.n)
      .map((e) => e.s)
      .slice(0, MAX_SUGGESTIONS);
    const w = this.winner;
    if (!w) {
      return {
        value: null,
        yearAssumed: false,
        expired: false,
        suggestions,
        confidence: 0,
        text: first,
        votes: 0,
        passes: this.passes,
        ms,
      };
    }
    // Disagreeing passes lower the confidence; a single unconfirmed, unsure pass is capped.
    let c = w.conf;
    if (w.votes >= 2) c = Math.min(AGREE_CAP, c + AGREE_BONUS * (w.votes - 1));
    else if (!w.sure) c = Math.min(c, SINGLE_UNSURE_CAP);
    else c = Math.min(c, SINGLE_SURE_CAP);
    if (this.entries.size > 1) c *= DISAGREE_FACTOR;
    return {
      value: w.value,
      yearAssumed: w.assumed,
      expired: w.expired,
      suggestions,
      confidence: c,
      text: w.text,
      votes: w.votes,
      passes: this.passes,
      ms,
    };
  }
}

/** Why the loop stopped on a date. */
export type StopReason = 'agreement' | 'confident' | 'single';

/** A read that is settled. */
export interface Settled {
  value: MonthYear;
  yearAssumed: boolean;
  expired: boolean;
  stop: StopReason;
  /** Frames that gave this month and year (1 for a lone confident or unchecked read). */
  agreed: number;
  /** The `at` of the first frame that gave it. */
  firstAt: number;
  /** Compute of the frames that gave it, added up. */
  computeMs: number;
  /** The frame that completed the answer. */
  frame: FrameVerdict;
}

/** A suggestion with why it is offered. */
export type OfferedSuggestion = Suggestion & { why: 'seen once' | 'weak read' };

/** What is left when nothing settled. */
export interface Unsettled {
  /** A date read once and never confirmed. */
  lone: { value: MonthYear; text: string } | null;
  suggestions: OfferedSuggestion[];
}

export interface AgreementOptions {
  /**
   * On: settle when two frames give the same month and year, or one is confident alone. Off (a
   * single tapped read): the first date read is the answer.
   */
  needAgree: boolean;
}

/** Collects frame verdicts until one month-year is settled. */
export class AgreementTally {
  private readonly seen = new Map<
    number,
    { value: MonthYear; n: number; firstAt: number; computeMs: number; text: string }
  >();
  private readonly weak = new Map<string, { s: Suggestion; n: number }>();
  private pendingValue: MonthYear | undefined;

  constructor(
    private readonly todayIso: string,
    private readonly opts: AgreementOptions = { needAgree: true },
  ) {}

  /** The date read once and waiting for a second frame ("Got Jun 2027 once, checking…"). */
  get pending(): MonthYear | undefined {
    return this.pendingValue;
  }

  /** Adds a frame. Returns the settled read, or undefined to keep looking. `at` is a timestamp for the caller's timing. */
  addFrame(v: FrameVerdict, at: number): Settled | undefined {
    for (const s of v.suggestions) {
      const k = labelOf(s);
      const e = this.weak.get(k);
      if (e) e.n++;
      else this.weak.set(k, { s, n: 1 });
    }
    if (!v.value) return undefined;
    const settle = (
      stop: StopReason,
      agreed: number,
      firstAt: number,
      computeMs: number,
    ): Settled => ({
      value: v.value as MonthYear,
      yearAssumed: v.yearAssumed,
      expired: v.expired,
      stop,
      agreed,
      firstAt,
      computeMs,
      frame: v,
    });
    if (!this.opts.needAgree) return settle('single', 1, at, v.ms);
    const k = monthKey(v.value);
    const e = this.seen.get(k) ?? { value: v.value, n: 0, firstAt: at, computeMs: 0, text: v.text };
    e.n++;
    e.computeMs += v.ms;
    this.seen.set(k, e);
    if (e.n >= FRAMES_TO_AGREE) return settle('agreement', e.n, e.firstAt, e.computeMs);
    if (!v.yearAssumed && v.confidence >= CONFIDENT_ALONE) return settle('confident', 1, at, v.ms);
    this.pendingValue = v.value;
    return undefined;
  }

  /** At the end with nothing settled: a lone read, and up to three suggestions. */
  finish(): Unsettled {
    const lone = [...this.seen.values()].sort((a, b) => b.n - a.n)[0];
    const now = monthKey({
      year: Number(this.todayIso.slice(0, 4)),
      month: Number(this.todayIso.slice(5, 7)),
    });
    const out: OfferedSuggestion[] = [];
    const offer = (s: Suggestion, why: OfferedSuggestion['why']): void => {
      if (!out.some((o) => o.year === s.year && o.month === s.month)) out.push({ ...s, why });
    };
    for (const e of this.seen.values()) {
      offer(
        {
          ...e.value,
          text: e.text.replace(/\s+/g, ' ').slice(0, 30),
          expired: monthKey(e.value) < now,
        },
        'seen once',
      );
    }
    [...this.weak.values()].sort((a, b) => b.n - a.n).forEach((e) => offer(e.s, 'weak read'));
    return {
      lone: lone ? { value: lone.value, text: lone.text } : null,
      suggestions: out.slice(0, MAX_SUGGESTIONS),
    };
  }
}

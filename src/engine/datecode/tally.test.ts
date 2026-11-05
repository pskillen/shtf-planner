import { describe, expect, it } from 'vitest';
import {
  AgreementTally,
  CONFIDENT_ALONE,
  DISAGREE_FACTOR,
  FrameTally,
  SINGLE_SURE_CAP,
  SINGLE_UNSURE_CAP,
  isSure,
  type FrameVerdict,
} from './tally';

const TODAY = '2026-11-15';
const YEAR = 2028; // clear of the parser's limits

/** A frame whose every pass read `text` with the text reader this sure of itself. */
function frame(texts: string[], engineConf = 0.95): FrameVerdict {
  const t = new FrameTally(TODAY);
  for (const [i, text] of texts.entries()) {
    if (t.add({ variant: `v${i}`, text, engineConf, ms: 5 })) break;
  }
  return t.verdict(20);
}

describe('one frame, in passes', () => {
  it('stops at the first sure pass when only one date has been seen', () => {
    const t = new FrameTally(TODAY);
    expect(t.add({ variant: 'a', text: 'USE BY 14 JUN 2028', engineConf: 0.95, ms: 1 })).toBe(true);
    const v = t.verdict(3);
    expect(v.value).toEqual({ month: 6, year: YEAR });
    expect(v.votes).toBe(1);
    expect(v.confidence).toBeLessThanOrEqual(SINGLE_SURE_CAP);
    expect(v.confidence).toBeGreaterThan(CONFIDENT_ALONE);
  });

  it('stops at two agreeing unsure passes, and adds to the confidence', () => {
    const t = new FrameTally(TODAY);
    // No label: the parser is not sure, so one pass does not end it.
    expect(t.add({ variant: 'a', text: '14 JUN 2028', engineConf: 0.5, ms: 1 })).toBe(false);
    expect(t.add({ variant: 'b', text: '14 JUN 2028', engineConf: 0.5, ms: 1 })).toBe(true);
    const v = t.verdict(2);
    expect(v.votes).toBe(2);
    expect(v.value).toEqual({ month: 6, year: YEAR });
  });

  it('caps a single unsure pass', () => {
    const v = frame(['BB 06/2028'], 0.4);
    expect(v.votes).toBe(1);
    expect(v.confidence).toBeLessThanOrEqual(SINGLE_UNSURE_CAP);
  });

  it('multiplies the confidence down when passes disagree, and does not stop early', () => {
    const t = new FrameTally(TODAY);
    expect(t.add({ variant: 'a', text: 'BB 06/2028', engineConf: 0.4, ms: 1 })).toBe(false);
    expect(t.add({ variant: 'b', text: 'BB 07/2028', engineConf: 0.4, ms: 1 })).toBe(false);
    const v = t.verdict(2);
    expect(v.confidence).toBeLessThanOrEqual(SINGLE_UNSURE_CAP * DISAGREE_FACTOR);
  });

  it('is never sure about an assumed year or an expired date', () => {
    expect(isSure(0.7, 0.9, true)).toBe(false);
    expect(isSure(0.7, 0.9, false)).toBe(true);
    expect(isSure(0.69, 0.9, false)).toBe(false);
    expect(isSure(0.7, 0.74, false)).toBe(false);
    const assumed = frame(['BEST BEFORE 11 NOV']);
    expect(assumed.yearAssumed).toBe(true);
    expect(assumed.confidence).toBeLessThan(CONFIDENT_ALONE);
    const expired = frame(['BEST BEFORE 06 10 2026']);
    expect(expired.expired).toBe(true);
    expect(expired.confidence).toBeLessThan(CONFIDENT_ALONE);
  });

  it('gathers weak runs from every pass, most often seen first, three at most', () => {
    const v = frame(['06/28', '12.27 06/28 01/29 03.30', 'nothing'], 0.3);
    expect(v.value).toBeNull();
    expect(v.suggestions.length).toBeLessThanOrEqual(3);
    expect(v.suggestions[0]).toMatchObject({ month: 6, year: 2028 });
  });

  it('keeps the raw text of the winner and never any pixels', () => {
    const v = frame(['L2314B BB 06/2028']);
    expect(v.text).toContain('06/2028');
    expect(Object.keys(v)).not.toContain('data');
  });
});

describe('across frames', () => {
  it('two frames that agree settle', () => {
    const a = new AgreementTally(TODAY);
    const unsure = frame(['L2314B 14 JUN 2028'], 0.5);
    expect(unsure.confidence).toBeLessThan(CONFIDENT_ALONE);
    expect(a.addFrame(unsure, 100)).toBeUndefined();
    expect(a.pending).toEqual({ month: 6, year: YEAR });
    const s = a.addFrame(unsure, 220);
    expect(s).toMatchObject({ stop: 'agreement', agreed: 2, firstAt: 100 });
    expect(s?.computeMs).toBe(40);
  });

  it('one frame at or above the bar settles alone', () => {
    const a = new AgreementTally(TODAY);
    const sure = frame(['BEST BEFORE 06 10 2028']);
    expect(sure.confidence).toBeGreaterThanOrEqual(CONFIDENT_ALONE);
    expect(a.addFrame(sure, 1)).toMatchObject({ stop: 'confident', agreed: 1 });
  });

  it('a year-assumed read never settles alone, and settles on two', () => {
    const a = new AgreementTally(TODAY);
    const assumed = frame(['BEST BEFORE 11 NOV']);
    expect(a.addFrame(assumed, 1)).toBeUndefined();
    expect(a.addFrame(assumed, 2)).toMatchObject({
      stop: 'agreement',
      agreed: 2,
      yearAssumed: true,
    });
  });

  it('an expired read needs two frames', () => {
    const a = new AgreementTally(TODAY);
    const expired = frame(['BEST BEFORE 06 10 2026']);
    expect(a.addFrame(expired, 1)).toBeUndefined();
    expect(a.addFrame(expired, 2)).toMatchObject({ stop: 'agreement', expired: true });
  });

  it('frames that disagree do not settle, and the first is reported as seen once', () => {
    const a = new AgreementTally(TODAY);
    for (let i = 0; i < 12; i++) {
      const month = String(i + 1).padStart(2, '0');
      expect(a.addFrame(frame([`BB ${month}/2028`], 0.6), i)).toBeUndefined();
    }
    const end = a.finish();
    expect(end.lone).not.toBeNull();
    expect(end.suggestions).toHaveLength(3);
    expect(end.suggestions.every((s) => s.why === 'seen once')).toBe(true);
  });

  it('with agreement off the first date is the answer', () => {
    const a = new AgreementTally(TODAY, { needAgree: false });
    expect(a.addFrame(frame(['BB 06/2028'], 0.4), 5)).toMatchObject({ stop: 'single', agreed: 1 });
  });

  it('a bare MM/YY is never a result: none, with the month-year offered', () => {
    const a = new AgreementTally(TODAY);
    const v = frame(['L2314B 06/28']);
    expect(v.value).toBeNull();
    expect(a.addFrame(v, 1)).toBeUndefined();
    expect(a.addFrame(v, 2)).toBeUndefined();
    const end = a.finish();
    expect(end.lone).toBeNull();
    expect(end.suggestions[0]).toMatchObject({ month: 6, year: 2028, why: 'weak read' });
  });

  it('suggestions: seen-once values first, then weak runs by frequency, no duplicates, expired marked', () => {
    const a = new AgreementTally(TODAY);
    a.addFrame(frame(['BB 09/2026'], 0.4), 1); // expired, labelled, seen once
    a.addFrame(frame(['12.27 12.27'], 0.3), 2);
    a.addFrame(frame(['12.27 06.28'], 0.3), 3);
    const end = a.finish();
    expect(end.suggestions.map((s) => `${s.month}/${s.year}`)).toEqual([
      '9/2026',
      '12/2027',
      '6/2028',
    ]);
    expect(end.suggestions[0]).toMatchObject({ why: 'seen once', expired: true });
    expect(end.suggestions[1]).toMatchObject({ why: 'weak read', expired: false });
  });

  it('nothing read gives nothing', () => {
    const a = new AgreementTally(TODAY);
    a.addFrame(frame(['nothing here']), 1);
    expect(a.finish()).toEqual({ lone: null, suggestions: [] });
  });
});

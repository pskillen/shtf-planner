import { useEffect, useRef, useState } from 'react';
import {
  nextReviewDue,
  reviewItems,
  reviewPeriod,
  reviewSession,
  reviewSummary,
  score,
  type ReviewAction,
  type ReviewItem,
} from '../../engine';
import { today } from '../../util';
import { ReviewRow } from '../components/ReviewRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { Toast } from '../components/Toast';
import { formatReviewDate } from '../reviewDisplay';
import { useChange, useDocument, useEditable, useSync } from '../state';
import { CAPABILITY_LABEL } from '../labels';
import { wholePercent } from './score/view';
import { usePacks } from '../usePacks';
import { answerReview, finishReview, undoReview } from './review/actions';
import { actions, reviewRow } from './review/view';
import { QuickAdd, type QuickAddPrefill } from './stores/QuickAdd';

const now = () => Date.now();
type Receipt = {
  answer: NonNullable<ReturnType<typeof answerReview>>;
  baseLabel: string;
  label: string;
  ordinal: number;
};

export function ReviewScreen() {
  const doc = useDocument();
  const change = useChange();
  const editable = useEditable();
  const packs = usePacks();
  const sync = useSync();
  const finishing = useRef(false);
  const [summaryAt, setSummaryAt] = useState<string>();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const receiptCounts = useRef(new Map<string, number>());
  const timers = useRef(
    new Map<
      string,
      { remaining: number; started: number; timer?: ReturnType<typeof setTimeout> }
    >(),
  );
  const [replacementToken, setReplacementToken] = useState<string>();
  const [error, setError] = useState('');
  const [replace, setReplace] = useState<QuickAddPrefill>();
  useEffect(
    () => () => {
      timers.current.forEach(({ timer }) => clearTimeout(timer));
    },
    [],
  );

  function startTimer(token: string) {
    const entry = timers.current.get(token);
    if (!entry) return;
    entry.started = now();
    entry.timer = setTimeout(() => {
      timers.current.delete(token);
      setReceipts((previous) => previous.filter((r) => r.answer.token !== token));
    }, entry.remaining);
  }
  function pauseTimers() {
    timers.current.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.remaining = Math.max(0, entry.remaining - (now() - entry.started));
      entry.timer = undefined;
    });
  }
  function closeReplacement() {
    setReplace(undefined);
    timers.current.forEach((_, token) => startTimer(token));
  }
  const asOf = today();
  const { until } = reviewPeriod(doc, asOf);
  const items = reviewItems(doc, packs, asOf, until);
  const latestFinished = Object.values(doc.reviews)
    .flatMap((r) => (r.finished ? [r.finished] : []))
    .sort()
    .at(-1);
  const lastSummary = latestFinished
    ? reviewSummary(Object.values(doc.reviews).filter((r) => r.finished === latestFinished))
    : undefined;
  const lastDelta =
    lastSummary?.before !== undefined && lastSummary.after !== undefined
      ? wholePercent(lastSummary.after) - wholePercent(lastSummary.before)
      : undefined;
  const summary = summaryAt
    ? reviewSummary(Object.values(doc.reviews).filter((r) => r.finished === summaryAt))
    : undefined;
  function finish() {
    if (!editable || finishing.current) return;
    finishing.current = true;
    const timestamp = new Date().toISOString();
    try {
      change('finish review', (d) => {
        finishReview(d, packs, asOf, timestamp, crypto.randomUUID());
      });
      timers.current.forEach(({ timer }) => clearTimeout(timer));
      timers.current.clear();
      setReceipts([]);
      setReplace(undefined);
      setSummaryAt(timestamp);
      void sync?.flush().catch(() => undefined);
    } catch {
      finishing.current = false;
      setError('Could not finish this review. Please try again.');
    }
  }
  function answer(item: ReviewItem, action: ReviewAction) {
    if (!editable) return;
    const row = reviewRow(item, doc, packs);
    const actionLabel = actions[item.kind].find(([value]) => value === action)?.[1] ?? action;
    const label = `${actionLabel}: ${row.title} · ${row.detail}`;
    let result: ReturnType<typeof answerReview>;
    change('answer review', (d) => {
      result = answerReview(
        d,
        packs,
        item,
        action,
        asOf,
        new Date().toISOString(),
        crypto.randomUUID(),
        crypto.randomUUID(),
      );
    });
    if (!result!) {
      setError('This item changed. Refresh the review and check it again.');
      return;
    }
    const saved = result;
    const ordinal = (receiptCounts.current.get(label) ?? 0) + 1;
    receiptCounts.current.set(label, ordinal);
    setReceipts((previous) => {
      const duplicate = previous.some((receipt) => receipt.baseLabel === label);
      return [
        ...previous.map((receipt) =>
          receipt.baseLabel === label && receipt.label === label
            ? { ...receipt, label: `${label} · answer ${receipt.ordinal}` }
            : receipt,
        ),
        {
          answer: saved,
          baseLabel: label,
          label: duplicate ? `${label} · answer ${ordinal}` : label,
          ordinal,
        },
      ];
    });
    timers.current.set(saved.token, { remaining: 5000, started: now() });
    startTimer(saved.token);
    setError('');
    if (item.kind === 'expiry' && action === 'replace') {
      pauseTimers();
      setReplacementToken(saved.token);
      setReplace({
        productId: item.productId,
        locationId: item.locationId,
        itemId: item.itemId,
      });
    }
  }
  function undo(receipt: NonNullable<ReturnType<typeof answerReview>>) {
    if (!editable) return;
    let restored = false;
    change('undo review answer', (d) => {
      restored = undoReview(d, receipt);
    });
    clearTimeout(timers.current.get(receipt.token)?.timer);
    timers.current.delete(receipt.token);
    setReceipts((previous) => previous.filter((r) => r.answer.token !== receipt.token));
    if (receipt.token === replacementToken && replace) closeReplacement();
    if (!restored) setError('This item changed since your answer. Check it in Stores.');
  }
  return (
    <section className="screen">
      <ScreenHeader title="Review" />
      {summary ? (
        <div aria-label="Review summary">
          <h2>Review summary</h2>
          <p>
            Checked {summary.checked} · Used {summary.used} · Marked for replacement{' '}
            {summary.replaceChosen} · Binned {summary.binned} · Maintenance jobs done{' '}
            {summary.maintenanceDone} · Deferred {summary.deferred}
          </p>
          {summary.differingAnswers > 0 && (
            <p>
              {summary.differingAnswers}{' '}
              {summary.differingAnswers === 1 ? 'item answered' : 'items answered'} differently on
              another device.
            </p>
          )}
          {summary.before !== undefined &&
            summary.after !== undefined &&
            (() => {
              const before = wholePercent(summary.before);
              const after = wholePercent(summary.after);
              const delta = after - before;
              return (
                <p>
                  Score at finish {before} % → {after} % ({delta >= 0 ? '+' : ''}
                  {delta})
                </p>
              );
            })()}
          <p>Current weakest: {CAPABILITY_LABEL[score(doc, packs, asOf).weakest]}</p>
          <p>Next review {formatReviewDate(nextReviewDue(doc))}</p>
          <button
            type="button"
            onClick={() => {
              finishing.current = false;
              setSummaryAt(undefined);
            }}
          >
            Start another review
          </button>
        </div>
      ) : (
        <>
          {reviewSession(doc).ids.length > 0 && <p>Review in progress</p>}
          {latestFinished && (
            <button type="button" onClick={() => setSummaryAt(latestFinished)}>
              Last review {formatReviewDate(latestFinished.slice(0, 10))}
              {lastDelta !== undefined && `: ${lastDelta >= 0 ? '+' : ''}${lastDelta}`}
            </button>
          )}
          {items.length === 0 ? (
            <p>Nothing to check until {formatReviewDate(until)}.</p>
          ) : (
            <ul className="row-list" aria-label="Items to review">
              {items.map((item) => (
                <ReviewRow
                  key={item.key}
                  item={item}
                  doc={doc}
                  packs={packs}
                  editable={editable}
                  onAnswer={answer}
                />
              ))}
            </ul>
          )}
          <button type="button" onClick={finish} disabled={!editable || !!replace}>
            Finish review
          </button>
        </>
      )}
      {!replace &&
        receipts.map((receipt) => (
          <Toast key={receipt.answer.token}>
            {receipt.label}.{' '}
            <button
              type="button"
              aria-label={`Undo ${receipt.label}`}
              onClick={() => undo(receipt.answer)}
              disabled={!editable}
            >
              Undo
            </button>
          </Toast>
        ))}
      {error ? <Toast>{error}</Toast> : null}
      {replace && editable ? (
        <QuickAdd
          prefill={replace}
          onClose={closeReplacement}
          reviewUndo={receipts.map((receipt) => (
            <p key={receipt.answer.token} role="status">
              {receipt.label}.{' '}
              <button
                type="button"
                aria-label={`Undo ${receipt.label}`}
                onClick={() => undo(receipt.answer)}
                disabled={!editable}
              >
                Undo
              </button>
            </p>
          ))}
        />
      ) : null}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { reviewItems, reviewPeriod, type ReviewAction, type ReviewItem } from '../../engine';
import { today } from '../../util';
import { ReviewRow } from '../components/ReviewRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { Toast } from '../components/Toast';
import { formatReviewDate } from '../reviewDisplay';
import { useChange, useDocument, useEditable } from '../state';
import { usePacks } from '../usePacks';
import { answerReview, undoReview } from './review/actions';
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

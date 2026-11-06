import { useEffect, useState } from 'react';
import { reviewItems, reviewPeriod, type ReviewAction, type ReviewItem } from '../../engine';
import { today } from '../../util';
import { ReviewRow } from '../components/ReviewRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { Toast } from '../components/Toast';
import { formatReviewDate } from '../reviewDisplay';
import { useChange, useDocument, useEditable } from '../state';
import { usePacks } from '../usePacks';
import { answerReview, undoReview } from './review/actions';
import { QuickAdd, type QuickAddPrefill } from './stores/QuickAdd';

export function ReviewScreen() {
  const doc = useDocument();
  const change = useChange();
  const editable = useEditable();
  const packs = usePacks();
  const [receipt, setReceipt] = useState<ReturnType<typeof answerReview>>();
  const [error, setError] = useState('');
  const [replace, setReplace] = useState<QuickAddPrefill>();
  const asOf = today();
  const { until } = reviewPeriod(doc, asOf);
  const items = reviewItems(doc, packs, asOf, until);
  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(() => setReceipt(undefined), 5000);
    return () => clearTimeout(timer);
  }, [receipt]);
  function answer(item: ReviewItem, action: ReviewAction) {
    if (!editable) return;
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
    if (!result!) return;
    setReceipt(result);
    setError('');
    if (item.kind === 'expiry' && action === 'replace')
      setReplace({
        productId: item.productId,
        locationId: item.locationId,
        itemId: doc.products[item.productId]?.itemId,
      });
  }
  function undo() {
    if (!editable || !receipt) return;
    let restored = false;
    change('undo review answer', (d) => {
      restored = undoReview(d, receipt);
    });
    setReceipt(undefined);
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
      {receipt ? (
        <Toast>
          Answer saved.{' '}
          <button type="button" onClick={undo} disabled={!editable}>
            Undo
          </button>
        </Toast>
      ) : null}
      {error ? <Toast>{error}</Toast> : null}
      {replace && editable ? (
        <QuickAdd prefill={replace} onClose={() => setReplace(undefined)} />
      ) : null}
    </section>
  );
}

import { useState } from 'react';
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
  const [receipts, setReceipts] = useState<NonNullable<ReturnType<typeof answerReview>>[]>([]);
  const [replacementToken, setReplacementToken] = useState<string>();
  const [error, setError] = useState('');
  const [replace, setReplace] = useState<QuickAddPrefill>();
  const asOf = today();
  const { until } = reviewPeriod(doc, asOf);
  const items = reviewItems(doc, packs, asOf, until);
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
    if (!result!) {
      setError('This item changed. Refresh the review and check it again.');
      return;
    }
    const saved = result;
    setReceipts((previous) => [...previous, saved]);
    setTimeout(
      () => setReceipts((previous) => previous.filter((r) => r.token !== saved.token)),
      5000,
    );
    setError('');
    if (item.kind === 'expiry' && action === 'replace') {
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
    setReceipts((previous) => previous.filter((r) => r.token !== receipt.token));
    if (receipt.token === replacementToken) setReplace(undefined);
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
      {receipts
        .filter((receipt) => !replace || receipt.token !== replacementToken)
        .map((receipt) => (
          <Toast key={receipt.token}>
            Answer saved.{' '}
            <button type="button" onClick={() => undo(receipt)} disabled={!editable}>
              Undo
            </button>
          </Toast>
        ))}
      {error ? <Toast>{error}</Toast> : null}
      {replace && editable ? (
        <QuickAdd
          prefill={replace}
          onClose={() => setReplace(undefined)}
          onUndoReview={
            receipts.find((r) => r.token === replacementToken)
              ? () => {
                  const receipt = receipts.find((r) => r.token === replacementToken);
                  if (receipt) undo(receipt);
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}

import { reviewItems, reviewPeriod } from '../../engine';
import { today } from '../../util';
import { ReviewRow } from '../components/ReviewRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { formatReviewDate } from '../reviewDisplay';
import { useDocument } from '../state';
import { usePacks } from '../usePacks';

export function ReviewScreen() {
  const doc = useDocument();
  const packs = usePacks();
  const asOf = today();
  const { until } = reviewPeriod(doc, asOf);
  const items = reviewItems(doc, packs, asOf, until);
  return (
    <section className="screen">
      <ScreenHeader title="Review" />
      {items.length === 0 ? (
        <p>Nothing to check until {formatReviewDate(until)}.</p>
      ) : (
        <ul className="row-list" aria-label="Items to review">
          {items.map((item) => (
            <ReviewRow key={item.key} item={item} doc={doc} packs={packs} />
          ))}
        </ul>
      )}
    </section>
  );
}

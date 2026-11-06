import { useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ReviewAction, ReviewItem } from '../../engine';
import type { Document, Packs } from '../../model';
import { reviewRow } from '../screens/review/view';

const urgencyLabel = { overdue: 'Overdue', due: 'Due today', soon: 'Upcoming' } as const;
const actions: Record<ReviewItem['kind'], [ReviewAction, string][]> = {
  expiry: [
    ['fine', 'Fine'],
    ['used', 'Used'],
    ['replace', 'Replace'],
    ['binned', 'Binned'],
  ],
  maintenance: [
    ['done', 'Done'],
    ['not-now', 'Not now'],
  ],
  age: [['noted', 'Noted']],
  recount: [
    ['recounted', 'Recounted'],
    ['not-now', 'Not now'],
  ],
  plan: [
    ['still-true', 'Still true'],
    ['no-longer', 'No longer'],
  ],
};
export function ReviewRow({
  item,
  doc,
  packs,
  editable,
  onAnswer,
}: {
  item: ReviewItem;
  doc: Document;
  packs: Packs;
  editable: boolean;
  onAnswer: (item: ReviewItem, action: ReviewAction) => void;
}) {
  const row = reviewRow(item, doc, packs);
  const start = useRef<number | null>(null);
  return (
    <li
      className="row-item"
      data-review-kind={item.kind}
      onTouchStart={(e) => {
        start.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const end = e.changedTouches[0]?.clientX;
        if (
          editable &&
          start.current !== null &&
          end !== undefined &&
          Math.abs(end - start.current) > 80
        ) {
          const options = actions[item.kind];
          onAnswer(item, options[end > start.current ? 0 : options.length - 1]![0]);
        }
        start.current = null;
      }}
    >
      <Link className="row-main" to={row.to}>
        <strong>{row.title}</strong>
        <span className="muted">{row.detail}</span>
        <span className={`badge review-${item.urgency}`}>{urgencyLabel[item.urgency]}</span>
      </Link>
      <div className="review-actions">
        {item.kind === 'age' || item.kind === 'recount' ? (
          <Link className="button secondary" to={row.to}>
            {item.kind === 'age' ? 'Open person' : 'Open place'}
          </Link>
        ) : null}
        {actions[item.kind].map(([action, label]) => (
          <button
            type="button"
            key={action}
            disabled={!editable}
            aria-label={`${label}: ${row.title}`}
            onClick={() => onAnswer(item, action)}
          >
            {label}
          </button>
        ))}
      </div>
    </li>
  );
}

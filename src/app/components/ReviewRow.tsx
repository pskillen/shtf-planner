import { Link } from 'react-router-dom';
import type { ReviewItem } from '../../engine';
import type { Document, Packs } from '../../model';
import { reviewRow } from '../screens/review/view';

const urgencyLabel = { overdue: 'Overdue', due: 'Due today', soon: 'Upcoming' } as const;

export function ReviewRow({ item, doc, packs }: { item: ReviewItem; doc: Document; packs: Packs }) {
  const row = reviewRow(item, doc, packs);
  return (
    <li className="row-item" data-review-kind={item.kind}>
      <Link className="row-main" to={row.to}>
        <strong>{row.title}</strong>
        <span className="muted">{row.detail}</span>
        <span className={`badge review-${item.urgency}`}>{urgencyLabel[item.urgency]}</span>
      </Link>
    </li>
  );
}

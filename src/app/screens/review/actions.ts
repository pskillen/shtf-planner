import {
  addMonths,
  encodeReviewAnswer,
  reviewSession,
  reviewItems,
  reviewPeriod,
  score,
  type ReviewAction,
  type ReviewItem,
} from '../../../engine';
import type { Document, Packs, PlanItem, Stock } from '../../../model';

export function completePlan(entry: PlanItem, today: string, months?: number): void {
  const interval =
    entry.doneAt && entry.expires
      ? (Date.parse(entry.expires) - Date.parse(entry.doneAt)) / 86400000
      : 0;
  entry.doneAt = today;
  if (months) entry.expires = addMonths(today, months);
  else if (Number.isFinite(interval) && interval > 0)
    entry.expires = new Date(Date.parse(today) + interval * 86400000).toISOString().slice(0, 10);
  else delete entry.expires;
}

type Receipt = {
  reviewId: string;
  token: string;
  stock?: Stock;
  maintenance?: { assetId: string; jobId: string; before?: string; after: string };
  plan?: {
    id: string;
    before: Pick<PlanItem, 'doneAt' | 'expires'>;
    after: Pick<PlanItem, 'doneAt' | 'expires'>;
  };
};
const dates = (p: PlanItem) => ({ doneAt: p.doneAt, expires: p.expires });
const sameDates = (
  a: Pick<PlanItem, 'doneAt' | 'expires'>,
  b: Pick<PlanItem, 'doneAt' | 'expires'>,
) => a.doneAt === b.doneAt && a.expires === b.expires;
function setDates(p: PlanItem, v: Pick<PlanItem, 'doneAt' | 'expires'>) {
  if (v.doneAt === undefined) delete p.doneAt;
  else p.doneAt = v.doneAt;
  if (v.expires === undefined) delete p.expires;
  else p.expires = v.expires;
}
export function answerReview(
  doc: Document,
  packs: Packs,
  item: ReviewItem,
  action: ReviewAction,
  day: string,
  timestamp: string,
  id: string,
  opId: string,
): Receipt | undefined {
  const session = reviewSession(doc);
  if (session.resolvedKeys.has(item.key)) return;
  const current = reviewItems(doc, packs, day, reviewPeriod(doc, day).until).find(
    (candidate) => candidate.key === item.key,
  );
  if (!current || current.kind !== item.kind || current.due !== item.due) return;
  if (
    item.kind === 'expiry' &&
    current.kind === 'expiry' &&
    (JSON.stringify(current.stock) !== JSON.stringify(item.stock) ||
      current.itemId !== item.itemId ||
      current.text !== item.text)
  )
    return;
  if (
    item.kind === 'maintenance' &&
    current.kind === 'maintenance' &&
    (current.lastDone !== item.lastDone ||
      current.purchased !== item.purchased ||
      current.typeId !== item.typeId)
  )
    return;
  if (
    item.kind === 'plan' &&
    current.kind === 'plan' &&
    (current.doneAt !== item.doneAt || current.expires !== item.expires)
  )
    return;
  if (
    item.kind === 'expiry' &&
    (!doc.stock[item.stockId] || !doc.products[item.productId] || !doc.locations[item.locationId])
  )
    return;
  if (item.kind === 'maintenance' && !doc.assets[item.assetId]) return;
  if (item.kind === 'plan' && !doc.plans[item.planId]) return;
  if (item.kind === 'recount' && !doc.locations[item.locationId]) return;
  if (item.kind === 'age' && !doc.household.members.some((m) => m.id === item.memberId)) return;
  const reviewId = session.primaryId ?? id;
  const token = encodeReviewAnswer({ opId, key: item.key, action });
  const receipt: Receipt = { reviewId, token };
  if (!session.primaryId)
    doc.reviews[id] = {
      id,
      started: timestamp,
      resolved: [],
      scoreBefore: score(doc, packs, day, doc.settings.horizonDays).overall,
    };
  if (item.kind === 'expiry' && ['used', 'replace', 'binned'].includes(action)) {
    receipt.stock = structuredClone(doc.stock[item.stockId]!);
    delete doc.stock[item.stockId];
  }
  if (item.kind === 'maintenance' && action === 'done') {
    const maintenance = doc.assets[item.assetId]!.maintenance;
    receipt.maintenance = {
      assetId: item.assetId,
      jobId: item.jobId,
      before: maintenance[item.jobId],
      after: day,
    };
    maintenance[item.jobId] = day;
  }
  if (item.kind === 'plan' && (action === 'still-true' || action === 'no-longer')) {
    const plan = doc.plans[item.planId]!;
    const before = dates(plan);
    if (action === 'still-true') completePlan(plan, day, packs.plans[item.planId]?.expiresMonths);
    else {
      delete plan.doneAt;
      delete plan.expires;
    }
    receipt.plan = { id: item.planId, before, after: dates(plan) };
  }
  doc.reviews[reviewId]!.resolved.push(token);
  return receipt;
}
export function undoReview(doc: Document, receipt: Receipt): boolean {
  const review = doc.reviews[receipt.reviewId];
  if (!review || review.finished || !review.resolved.includes(receipt.token)) return false;
  const s = receipt.stock;
  if (
    s &&
    (!doc.products[s.productId] ||
      !doc.locations[s.locationId] ||
      doc.stock[s.id] ||
      Object.values(doc.stock).some(
        (r) =>
          r.productId === s.productId &&
          r.locationId === s.locationId &&
          r.bestBefore === s.bestBefore,
      ))
  )
    return false;
  const m = receipt.maintenance;
  if (m && (!doc.assets[m.assetId] || doc.assets[m.assetId]!.maintenance[m.jobId] !== m.after))
    return false;
  const p = receipt.plan;
  if (p && (!doc.plans[p.id] || !sameDates(doc.plans[p.id]!, p.after))) return false;
  if (s) doc.stock[s.id] = s;
  if (m) {
    const map = doc.assets[m.assetId]!.maintenance;
    if (m.before === undefined) delete map[m.jobId];
    else map[m.jobId] = m.before;
  }
  if (p) setDates(doc.plans[p.id]!, p.before);
  review.resolved.splice(review.resolved.indexOf(receipt.token), 1);
  return true;
}

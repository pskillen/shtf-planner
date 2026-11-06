import type { ReviewAction, ReviewItem } from '../../../engine';
import type { Document, Packs } from '../../../model';
import { formatQty } from '../../../util';
import { formatReviewDate } from '../../reviewDisplay';
import { equipmentEditPath } from '../assets/route';

export const actions: Record<ReviewItem['kind'], [ReviewAction, string][]> = {
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

/** Display and destinations for engine-ordered review items; keys are opaque. */
export function reviewRow(item: ReviewItem, doc: Document, packs: Packs) {
  const date = formatReviewDate(item.due);
  switch (item.kind) {
    case 'expiry': {
      const stock = doc.stock[item.stockId];
      const product = doc.products[item.productId];
      const unit = product?.itemId ? packs.items[product.itemId]?.unit : undefined;
      const place = doc.locations[item.locationId]?.name ?? 'Unknown place';
      return {
        title: `${item.text} · ${place}${stock ? ` · ${formatQty(stock.qty)} ${unit ?? 'packs'}` : ''}`,
        detail: `Best before ${date}`,
        to: `/app/stores?stock=${encodeURIComponent(item.stockId)}`,
      };
    }
    case 'maintenance': {
      const asset = doc.assets[item.assetId];
      const name = asset?.name || (asset && packs.assets[asset.typeId]?.name) || 'Equipment';
      return { title: name, detail: `${item.text} · ${date}`, to: equipmentEditPath(item.assetId) };
    }
    case 'age':
      return {
        title: item.text,
        detail: `Around ${date}`,
        to: `/app/people?member=${encodeURIComponent(item.memberId)}`,
      };
    case 'recount':
      return {
        title: item.text,
        detail: `Recount · ${date}`,
        to: `/app/stores?place=${encodeURIComponent(item.locationId)}`,
      };
    case 'plan':
      return {
        title: item.text,
        detail: `Re-confirm · ${date}`,
        to: `/app/gaps?plan=${encodeURIComponent(item.planId)}`,
      };
  }
}

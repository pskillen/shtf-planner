import type { CapabilityId, Category, Document, Packs, Stock } from '../model';
import { compareText } from '../util';
import { CAPABILITY_ORDER, guidanceRules } from './context';
import { addMonths, ageInMonths } from './dates';
import { expiryLevel, expiryWindows, type ExpiryLevel } from './expiry';
import { maintenanceDue } from './maintenance';
import { decodeReviewAnswer, reviewSession } from './reviewSession';
import { applicablePlanItems } from './targets';

type Common = {
  key: string;
  due: string;
  urgency: 'overdue' | 'due' | 'soon';
  capability?: CapabilityId;
  text: string;
};
export type ReviewItem = Common &
  (
    | {
        kind: 'expiry';
        stockId: string;
        productId: string;
        locationId: string;
        expiryLevel: ExpiryLevel;
        stock: Stock;
        itemId?: string;
      }
    | {
        kind: 'maintenance';
        assetId: string;
        jobId: string;
        lastDone?: string;
        purchased?: string;
        typeId: string;
      }
    | { kind: 'age'; memberId: string; sourceId: string; transitionId: string }
    | { kind: 'recount'; locationId: string }
    | { kind: 'plan'; planId: string; doneAt?: string; expires?: string }
  );
const categoryCapability: Partial<Record<Category, CapabilityId>> = {
  water: 'water',
  food: 'food',
  heat: 'heat',
  power: 'power',
  fuel: 'heat',
  light: 'light',
  medical: 'medical',
  comms: 'comms',
  baby: 'sanitation',
  pets: 'food',
  sanitation: 'sanitation',
};
const urgency = (due: string, asOf: string): Common['urgency'] =>
  due < asOf ? 'overdue' : due === asOf ? 'due' : 'soon';
const component = (id: string) => encodeURIComponent(id);
const lastDay = (month: string): string => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, number!, 0)).toISOString().slice(0, 10);
};
const plusDay = (date: string): string => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
};
/** First calendar day on which the engine's age predicate reaches the boundary. */
function ageBoundary(dob: string, months: number): string {
  let date = addMonths(dob, months);
  while (ageInMonths(dob, date) < months) date = plusDay(date);
  return date;
}

/** Items due by the inclusive boundary, minus the union resolved in open reviews. */
export function reviewItems(
  doc: Document,
  packs: Packs,
  asOf: string,
  until: string,
): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const stock of Object.values(doc.stock)) {
    if (!stock.bestBefore) continue;
    const due = lastDay(stock.bestBefore);
    const product = doc.products[stock.productId];
    const item = product?.itemId ? packs.items[product.itemId] : undefined;
    if (due <= until)
      items.push({
        kind: 'expiry',
        key: `stock:${stock.id}`,
        stockId: stock.id,
        stock: { ...stock },
        itemId: product?.itemId,
        productId: stock.productId,
        locationId: stock.locationId,
        due,
        urgency: urgency(due, asOf),
        capability: item ? categoryCapability[item.category] : undefined,
        text: product?.name ?? 'Stock',
        expiryLevel: expiryLevel(stock.bestBefore, asOf, expiryWindows(doc.settings)),
      });
  }
  for (const job of maintenanceDue(doc, packs, asOf)) {
    if (job.due > until) continue;
    const asset = doc.assets[job.assetId]!;
    const type = packs.assets[asset.typeId];
    items.push({
      kind: 'maintenance',
      key: `maint:${component(job.assetId)}:${component(job.jobId)}`,
      assetId: job.assetId,
      jobId: job.jobId,
      lastDone: job.lastDone,
      purchased: asset.purchased,
      typeId: asset.typeId,
      due: job.due,
      urgency: urgency(job.due, asOf),
      capability: type ? categoryCapability[type.category] : undefined,
      text: job.text,
    });
  }
  const completedRecounts = new Map<string, string>();
  for (const review of Object.values(doc.reviews)) {
    if (!review.finished) continue;
    for (const entry of review.resolved) {
      const answer = decodeReviewAnswer(entry);
      if (answer?.action !== 'recounted') continue;
      const existing = completedRecounts.get(answer.key);
      if (!existing || Date.parse(review.finished) > Date.parse(existing))
        completedRecounts.set(answer.key, review.finished);
    }
  }
  for (const location of Object.values(doc.locations)) {
    const key = `recount:${location.id}`;
    const last = completedRecounts.get(key);
    const due = last ? addMonths(last.slice(0, 10), doc.settings.reviewCadenceMonths) : asOf;
    if (due <= until)
      items.push({
        kind: 'recount',
        key,
        locationId: location.id,
        due,
        urgency: urgency(due, asOf),
        text: location.name,
      });
  }
  for (const planId of applicablePlanItems(doc, packs)) {
    const entry = doc.plans[planId];
    const plan = packs.plans[planId];
    if (!entry?.doneAt || !plan) continue;
    const due =
      entry.expires ??
      (plan.expiresMonths ? addMonths(entry.doneAt, plan.expiresMonths) : undefined);
    if (due && due <= until)
      items.push({
        kind: 'plan',
        key: `plan:${planId}`,
        planId,
        doneAt: entry.doneAt,
        expires: entry.expires,
        due,
        urgency: urgency(due, asOf),
        capability: plan.capability,
        text: plan.text,
      });
  }
  const enabledItems = packs
    .enabledPacks(doc.settings)
    .flatMap((pack) => (pack.kind === 'items' ? pack.items : []));
  const rules = guidanceRules(doc, packs, doc.settings.horizonDays);
  for (const member of doc.household.members) {
    const addEdge = (
      sourceKind: 'item' | 'rule',
      sourceId: string,
      boundary: number,
      direction: 'enter' | 'leave' | 'change',
      text: string,
      capability?: CapabilityId,
    ) => {
      const due = ageBoundary(member.dob, boundary);
      if (due < asOf || due > until) return;
      const transitionId = JSON.stringify([sourceKind, sourceId, boundary, direction]);
      items.push({
        kind: 'age',
        key: `age:${component(member.id)}:${component(transitionId)}`,
        memberId: member.id,
        sourceId,
        transitionId,
        due,
        urgency: urgency(due, asOf),
        capability,
        text,
      });
    };
    for (const item of enabledItems) {
      if (!item.ageBand) continue;
      addEdge(
        'item',
        item.id,
        item.ageBand.fromMonths,
        'enter',
        `${item.name} becomes suitable for ${member.name}`,
        categoryCapability[item.category],
      );
      addEdge(
        'item',
        item.id,
        item.ageBand.toMonths,
        'leave',
        `${item.name} age band ends for ${member.name}`,
        categoryCapability[item.category],
      );
    }
    for (const rule of rules) {
      const bands = rule.perPersonDay?.ageBands;
      if (
        !bands ||
        (rule.minHorizonDays !== undefined && rule.minHorizonDays > doc.settings.horizonDays) ||
        (rule.appliesTo?.risk && !doc.home.risks.includes(rule.appliesTo.risk)) ||
        (rule.appliesTo?.tag && !member.tags.includes(rule.appliesTo.tag))
      )
        continue;
      const zeroMultiplier = (rule.multipliers ?? []).some(
        (m) =>
          m.factor === 0 &&
          (m.tag
            ? member.tags.includes(m.tag)
            : m.risk
              ? doc.home.risks.includes(m.risk)
              : doc.home.insulation === m.insulation),
      );
      if (zeroMultiplier || rule.perPersonDay?.resource === 'medicationDays') continue;
      const boundaries = new Set(bands.flatMap((band) => [band.fromMonths, band.toMonths]));
      const amountAt = (age: number) =>
        bands.find((band) => age >= band.fromMonths && age < band.toMonths)?.amount ?? 0;
      for (const boundary of boundaries) {
        if (amountAt(boundary - 1) === amountAt(boundary)) continue;
        addEdge(
          'rule',
          rule.id,
          boundary,
          'change',
          `${rule.text}: needs change for ${member.name}`,
          rule.capability,
        );
      }
    }
  }
  const resolved = reviewSession(doc).resolvedKeys;
  return items
    .filter((item) => !resolved.has(item.key))
    .sort((a, b) => {
      const aOverdue = a.urgency === 'overdue' ? 0 : 1;
      const bOverdue = b.urgency === 'overdue' ? 0 : 1;
      const rank = (c?: CapabilityId) =>
        c === undefined ? CAPABILITY_ORDER.length : CAPABILITY_ORDER.indexOf(c);
      return (
        aOverdue - bOverdue ||
        compareText(a.due, b.due) ||
        rank(a.capability) - rank(b.capability) ||
        compareText(a.key, b.key)
      );
    });
}

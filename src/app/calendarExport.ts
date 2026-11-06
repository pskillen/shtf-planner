import type { CalendarCandidate } from '../engine';
import { generateIcs } from '../util/ics';

/** Generate opaque, stable event identities; household labels never enter the file. */
export async function calendarFile(
  createdAt: string,
  candidates: readonly CalendarCandidate[],
  timestamp: string,
): Promise<string> {
  const events = await Promise.all(
    candidates.map(async (candidate) => {
      const input = new TextEncoder().encode(JSON.stringify([createdAt, candidate.identity]));
      const digest = await crypto.subtle.digest('SHA-256', input);
      const hex = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      return {
        uid: `${hex}@shtf-planner.invalid`,
        date: candidate.due,
        summary: candidate.summary,
      };
    }),
  );
  return generateIcs(events, timestamp);
}

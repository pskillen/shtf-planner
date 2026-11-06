export type IcsEvent = {
  uid: string;
  date: string;
  summary: string;
  description?: string;
};

const CRLF = '\r\n';

function compactDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new TypeError(`Invalid calendar date: ${date}`);
  const [, year, month, day] = match;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new TypeError(`Invalid calendar date: ${date}`);
  }
  return `${year}${month}${day}`;
}

function compactTimestamp(timestamp: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(timestamp);
  if (!match) throw new TypeError(`Invalid UTC timestamp: ${timestamp}`);
  const [, year, month, day, hour, minute, second] = match;
  compactDate(`${year}-${month}-${day}`);
  if (+hour > 23 || +minute > 59 || +second > 59) {
    throw new TypeError(`Invalid UTC timestamp: ${timestamp}`);
  }
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldLine(line: string): string {
  const folded: string[] = [];
  const encoder = new TextEncoder();
  let current = '';
  let octets = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (octets + size > 75) {
      folded.push(current);
      current = ' ';
      octets = 1;
    }
    current += character;
    octets += size;
  }
  folded.push(current);
  return folded.join(CRLF);
}

/** Serialize all-day calendar events using RFC 5545 content-line rules. */
export function generateIcs(events: IcsEvent[], dtstamp: string): string {
  const stamp = compactTimestamp(dtstamp);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SHTF Planner//Review Calendar//EN'];

  for (const event of events) {
    if (!event.uid) {
      throw new TypeError('Calendar events require a UID');
    }
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description !== undefined) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

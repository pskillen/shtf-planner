import { describe, expect, it } from 'vitest';
import { generateIcs } from './ics';

const stamp = '2026-11-06T12:34:56Z';

describe('generateIcs', () => {
  it('writes all-day events, explicit stamps and CRLF with a final CRLF', () => {
    const output = generateIcs(
      [{ uid: 'review-1@example.test', date: '2027-01-05', summary: 'Review' }],
      stamp,
    );
    expect(output).toContain('DTSTAMP:20261106T123456Z\r\n');
    expect(output).toContain('DTSTART;VALUE=DATE:20270105\r\n');
    expect(output).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(output.endsWith('\r\n')).toBe(true);
    expect(output.replace(/\r\n/g, '')).not.toContain('\n');
    expect(output).toContain('VERSION:2.0\r\n');
    expect(output).toContain('PRODID:-//SHTF Planner//Review Calendar//EN\r\n');
  });

  it('escapes TEXT values including all newline forms', () => {
    const output = generateIcs(
      [
        {
          uid: 'u\\id,one;\ntwo',
          date: '2027-01-05',
          summary: 'A,B;C\\D\r\nE\rF\nG',
          description: 'Line 1\nLine 2',
        },
      ],
      stamp,
    ).replace(/\r\n[ \t]/g, '');
    expect(output).toContain('UID:u\\\\id\\,one\\;\\ntwo\r\n');
    expect(output).toContain('SUMMARY:A\\,B\\;C\\\\D\\nE\\nF\\nG\r\n');
    expect(output).toContain('DESCRIPTION:Line 1\\nLine 2\r\n');
  });

  it('is stable for identical input and rejects an empty calendar', () => {
    const events = [{ uid: 'stable', date: '2027-01-05', summary: 'Review' }];
    expect(generateIcs(events, stamp)).toBe(generateIcs(events, stamp));
    expect(() => generateIcs([], stamp)).toThrow(TypeError);
  });

  it('folds ASCII and Unicode lines within 75 octets and unfolds losslessly', () => {
    const summary = `${'a'.repeat(70)} 🙂 ${'é'.repeat(40)} 🧯`;
    const output = generateIcs([{ uid: 'emoji-🧯', date: '2027-01-05', summary }], stamp);
    const physicalLines = output.slice(0, -2).split('\r\n');
    expect(physicalLines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(output.replace(/\r\n[ \t]/g, '')).toContain(`SUMMARY:${summary}\r\n`);
    expect(output).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(output).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });

  it('rejects invalid calendar dates and timestamps', () => {
    expect(() => generateIcs([{ uid: 'x', date: '2027-02-29', summary: 'x' }], stamp)).toThrow(
      TypeError,
    );
    expect(() => generateIcs([], '2026-11-06T12:34:56+00:00')).toThrow(TypeError);
    expect(() => generateIcs([], 'not-a-date')).toThrow(TypeError);
  });
});

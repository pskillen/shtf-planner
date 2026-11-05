import { useState, type ReactNode } from 'react';
import { Field } from '../../components/controls';
import { formatMonth, monthChips, parseMonth } from './stock';
import type { Item } from '../../../model';

/**
 * A best-before month. A `type="month"` box where the browser has one (Android Chrome opens a
 * month and year wheel); anywhere else it is a text box that reads "Mar 2027" or "03/2027". Under
 * it, one-tap chips for how long this kind of thing keeps ("+1 y", "+2 y", "+5 y"), so nothing
 * needs a precise tap. `value` is `YYYY-MM` or undefined (no best-before).
 */
export function MonthField({
  value,
  onChange,
  shelfLife,
  today,
  label = 'Best before',
  quiet = false,
  action,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  shelfLife: Item['shelfLife'];
  today: string;
  label?: string;
  /** No hint line unless the text is not a month: for a screen short of room. */
  quiet?: boolean;
  /** Sits on the same row as the input, to its right (e.g. Read the date). */
  action?: ReactNode;
}) {
  const native = supportsMonthInput();
  const [text, setText] = useState(value ?? '');
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (parseMonth(text) !== value) setText(value ?? '');
  }
  const chips = monthChips(shelfLife, today);
  const bad = !native && text.trim() !== '' && parseMonth(text) === undefined;
  const hint = bad
    ? 'Read as a month and year, like Mar 2027 or 03/2027.'
    : quiet
      ? undefined
      : !value
        ? 'Optional.'
        : native
          ? undefined
          : formatMonth(value);

  const input = native ? (
    <input
      type="month"
      value={value ?? ''}
      onChange={(e) => onChange(parseMonth(e.target.value))}
    />
  ) : (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="Mar 2027"
      value={text}
      aria-invalid={bad || undefined}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseMonth(e.target.value));
      }}
    />
  );

  return (
    <>
      <Field label={label} hint={hint}>
        {action ? (
          <div className="field-input-row">
            <div className="field-input-main">{input}</div>
            {action}
          </div>
        ) : (
          input
        )}
      </Field>
      {chips.length > 0 || value ? (
        <div className="chips" role="group" aria-label={`${label}, quick choices`}>
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              className={c.value === value ? 'chip on' : 'chip'}
              aria-pressed={c.value === value}
              onClick={() => onChange(c.value)}
            >
              {c.label}
            </button>
          ))}
          {value ? (
            <button type="button" className="chip" onClick={() => onChange(undefined)}>
              No date
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Whether this browser has a real month box (it falls back to a text box when it has none). */
function supportsMonthInput(): boolean {
  if (typeof document === 'undefined') return false;
  const probe = document.createElement('input');
  probe.setAttribute('type', 'month');
  return probe.type === 'month';
}

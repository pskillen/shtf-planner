import { useId, useState, type ReactNode } from 'react';

/** A labelled form row. The control is the child; the label wraps it so a tap on the text focuses. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint muted">{hint}</span> : null}
    </label>
  );
}

/** A labelled group of buttons (chips, segments): a group is not one control, so no <label>. */
export function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field" role="group" aria-labelledby={id}>
      <span className="field-label" id={id}>
        {label}
      </span>
      {children}
      {hint ? <span className="field-hint muted">{hint}</span> : null}
    </div>
  );
}

/** Multi-select chips. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: readonly T[];
  onChange: (next: T[]) => void;
  label?: string;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={on ? 'chip on' : 'chip'}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Single-select segmented buttons. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | undefined;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'segment on' : 'segment'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** An on/off switch with its label. */
export function Switch({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="switch-row">
      <span className="switch-text">
        <span>{label}</span>
        {hint ? <span className="field-hint muted">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/**
 * A number box that lets you type "1." or clear it while typing. It reports a number when the text
 * parses, `undefined` when it is empty, and ignores text that is not a number. Inside a `Field` it
 * is named by the visible label; `ariaLabel` is only for when several share one label, and must
 * start with the visible text (so voice control and screen readers agree on the name).
 */
export function NumberInput({
  value,
  onChange,
  min = 0,
  step = 'any',
  placeholder,
  ariaLabel,
}: {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  min?: number;
  step?: number | 'any';
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [seen, setSeen] = useState(value);
  // Follow an outside change (a reset, a different record) without fighting the typing.
  if (seen !== value) {
    setSeen(value);
    if ((text === '' ? undefined : Number(text)) !== value) {
      setText(value === undefined ? '' : String(value));
    }
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === '') return onChange(undefined);
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

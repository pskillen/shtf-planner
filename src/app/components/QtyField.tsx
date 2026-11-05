import { Stepper } from './Stepper';
import { Segmented } from './controls';

const FRACTIONS = [0, 0.25, 0.5, 0.75] as const;
type Fraction = (typeof FRACTIONS)[number];

const FRACTION_OPTIONS: ReadonlyArray<{ value: Fraction; label: string }> = [
  { value: 0, label: '+' },
  { value: 0.25, label: '¼' },
  { value: 0.5, label: '½' },
  { value: 0.75, label: '¾' },
];

const snapFraction = (n: number): Fraction => {
  const q = Math.round(n * 4) / 4;
  return (FRACTIONS.includes(q as Fraction) ? q : 0) as Fraction;
};

const splitQty = (value: number): { whole: number; fraction: Fraction } => {
  const whole = Math.floor(value);
  return { whole, fraction: snapFraction(value - whole) };
};

/**
 * Whole packs plus an optional quarter fraction. The total is never zero: with no fraction chosen
 * the stepper starts at one; with a fraction, zero whole packs is allowed (e.g. ½).
 */
export function QtyField({
  value,
  onChange,
  label = 'How many',
}: {
  value: number;
  onChange: (next: number) => void;
  label?: string;
}) {
  const { whole, fraction } = splitQty(value);
  const minWhole = fraction === 0 ? 1 : 0;

  const setWhole = (w: number) => {
    const next = w + fraction;
    onChange(next > 0 ? next : fraction || 1);
  };

  const setFraction = (f: Fraction) => {
    const w = f === 0 ? Math.max(whole, 1) : whole;
    onChange(w + f);
  };

  return (
    <div className="qty-field">
      <Stepper label={label} value={whole} min={minWhole} onChange={setWhole} />
      <Segmented
        label={`${label}, fraction`}
        options={FRACTION_OPTIONS}
        value={fraction}
        onChange={setFraction}
      />
    </div>
  );
}

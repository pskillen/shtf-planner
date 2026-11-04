import { NumberInput } from './controls';

/**
 * A quantity with big minus and plus buttons around a number box: for counting things at a
 * cupboard, one-handed. Whole numbers from `min`; typing works too.
 */
export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = 9999,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="secondary"
        aria-label={`One fewer: ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        −
      </button>
      <NumberInput
        value={value}
        min={min}
        step={1}
        ariaLabel={`${label}, number`}
        onChange={(n) => n !== undefined && onChange(clamp(n))}
      />
      <button
        type="button"
        className="secondary"
        aria-label={`One more: ${label}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </button>
    </div>
  );
}

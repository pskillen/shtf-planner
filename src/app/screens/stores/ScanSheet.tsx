import { useState } from 'react';
import type { ItemType, ProductInfo } from '../../../model';
import { CameraStrip } from '../../components/CameraStrip';
import { Field } from '../../components/controls';
import { Sheet } from '../../components/Sheet';
import { buzz } from './stocktakeTunables';
import { ScanResolve } from './ScanResolve';
import { readTypedCode } from './scanHelpers';

/**
 * A sheet that scans a barcode and works out what it is: the camera strip, a way to type the
 * number or find the item by name, and the card from `ScanResolve` once a code is read. Used by
 * Quick add; the stocktake lays the same pieces out on its own screen.
 */
export function ScanSheet({
  onClose,
  onBack,
  onType,
  onSortLater,
}: {
  onClose: () => void;
  /** "Find it by name": back to the search. */
  onBack: () => void;
  onType: (type: ItemType, code: string) => void;
  /** Absent: no "Sort later" (there is nowhere to keep a scan). */
  onSortLater?: (code: string, product: ProductInfo | undefined) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function got(next: string): void {
    buzz('barcode');
    setNote(null);
    setCode(next);
  }

  return (
    <Sheet
      title="Scan a barcode"
      onClose={onClose}
      actions={
        <button type="button" className="secondary" onClick={onBack}>
          Find it by name
        </button>
      }
    >
      <CameraStrip mode="barcode" chip="1 BARCODE" scanning={code === null} onCode={got} />
      {note ? (
        <p className="note" role="status">
          {note}
        </p>
      ) : null}
      {code === null ? (
        <>
          <p className="muted">Hold the barcode upright in the blue box.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const r = readTypedCode(typed);
              if ('problem' in r) return setProblem(r.problem);
              setProblem(null);
              setTyped('');
              got(r.code);
            }}
          >
            <Field label="Type the number" hint={problem ?? undefined}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={typed}
                aria-invalid={problem ? true : undefined}
                onChange={(e) => setTyped(e.target.value)}
              />
            </Field>
            <button type="submit" className="secondary" disabled={typed.trim() === ''}>
              Use this number
            </button>
          </form>
        </>
      ) : (
        <>
          <ScanResolve
            key={code}
            code={code}
            onType={(type) => onType(type, code)}
            onSortLater={
              onSortLater
                ? (product) => {
                    onSortLater(code, product);
                    setCode(null);
                    setNote('Kept to sort later.');
                  }
                : undefined
            }
          />
          <button type="button" className="secondary" onClick={() => setCode(null)}>
            Scan another
          </button>
        </>
      )}
    </Sheet>
  );
}

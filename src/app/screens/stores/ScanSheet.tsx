import { useState } from 'react';
import type { OffFacts } from '../../../model';
import { CameraStrip } from '../../components/CameraStrip';
import { Field } from '../../components/controls';
import { Sheet } from '../../components/Sheet';
import { buzz } from './stocktakeTunables';
import { ScanResolve } from './ScanResolve';
import { readTypedCode } from './scanHelpers';

/** A sheet that scans a barcode and resolves it to a product via `ScanResolve`. */
export function ScanSheet({
  onClose,
  onBack,
  onProduct,
  onSortLater,
  sortLaterBlocked,
  reidentify,
  initialCode,
  addedStatus,
}: {
  onClose: () => void;
  onBack: () => void;
  onProduct: (productId: string, code: string) => void;
  onSortLater?: (code: string, off: OffFacts | undefined) => void;
  sortLaterBlocked?: string;
  reidentify?: boolean;
  initialCode?: string;
  addedStatus?: { message: string; stockId: string | undefined; onEdit: () => void };
}) {
  const [code, setCode] = useState<string | null>(initialCode ?? null);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);

  function got(next: string): void {
    buzz('barcode');
    setFlash((n) => n + 1);
    setNote(null);
    setCode(next);
  }

  return (
    <Sheet
      title="Scan a barcode"
      onClose={onClose}
      actions={
        <button type="button" className="secondary" onClick={onBack}>
          {reidentify ? 'Keep as it was' : 'Find it by name'}
        </button>
      }
    >
      {addedStatus ? (
        <p className="note" role="status" data-testid="last-add-status">
          {addedStatus.message}
          {addedStatus.stockId ? (
            <>
              {' '}
              <button type="button" className="link" onClick={addedStatus.onEdit}>
                Edit
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {reidentify ? null : (
        <CameraStrip
          mode="barcode"
          chip="1 BARCODE"
          scanning={code === null}
          onCode={got}
          flashKey={flash}
        />
      )}
      {note ? (
        <p className="note" role="status">
          {note}
        </p>
      ) : null}
      {code === null ? (
        <>
          <p className="muted">Hold the barcode upright, across the red line.</p>
          <form
            className="number-row"
            onSubmit={(e) => {
              e.preventDefault();
              const r = readTypedCode(typed);
              if ('problem' in r) return setProblem(r.problem);
              setProblem(null);
              setTyped('');
              got(r.code);
            }}
          >
            <Field label="Or type the barcode number">
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
          {problem ? (
            <p className="field-hint warn" role="alert">
              {problem}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <ScanResolve
            key={code}
            code={code}
            reidentify={reidentify}
            onProduct={(productId) => onProduct(productId, code)}
            sortLaterBlocked={sortLaterBlocked}
            onSortLater={
              onSortLater
                ? (off) => {
                    onSortLater(code, off);
                    setCode(null);
                    setNote('Kept to sort later.');
                  }
                : undefined
            }
          />
          <div className="scan-actions">
            <button type="button" className="secondary" onClick={() => setCode(null)}>
              Scan another
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

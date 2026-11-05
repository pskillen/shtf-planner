import { useEffect, useState } from 'react';
import { today } from '../../../util';
import { terminateDateReader } from '../../../scan/ocr/client';
import { CameraStrip } from '../../components/CameraStrip';
import { Sheet } from '../../components/Sheet';
import type { CameraStream } from '../../../scan/camera';
import { DateReader, type DateRead } from './DateReader';

/**
 * Quick add's "Read the date": a sheet with the camera strip in date mode and the same reader
 * card. **Use this date** hands the month back to the form's field and closes; a suggestion does
 * the same. The person still taps Add: nothing is saved from here.
 */
export function ReadDateSheet({
  onUse,
  onClose,
}: {
  /** The month as `YYYY-MM`. */
  onUse: (bestBefore: string) => void;
  onClose: () => void;
}) {
  const [cam, setCam] = useState<CameraStream | null>(null);
  const [read, setRead] = useState<DateRead | null>(null);
  const [centre, setCentre] = useState<HTMLElement | null>(null);

  // The models' memory goes back when the sheet goes.
  useEffect(() => () => terminateDateReader(), []);

  return (
    <Sheet
      title="Read the date"
      onClose={onClose}
      actions={
        <button type="button" disabled={!read} onClick={() => read && onUse(read.bestBefore)}>
          Use this date
        </button>
      }
    >
      <CameraStrip mode="date" chip="DATE" onReady={setCam} onCentre={setCentre} />
      <DateReader
        cam={cam}
        centre={centre}
        todayIso={today()}
        onResult={setRead}
        onSuggestion={(ym) => {
          onUse(ym);
        }}
      />
    </Sheet>
  );
}

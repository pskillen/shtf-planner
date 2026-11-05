import { useState } from 'react';
import { Switch } from '../../components/controls';
import { peekDateReader } from '../../../scan/ocr/client';
import { aboutLine, readUseWebGpu, writeUseWebGpu } from './dateSettings';

/**
 * A collapsed line on the stocktake screen so the person can compare the two ways the reader can
 * run: which one is in use, how long the last read took, and a switch for the graphics chip.
 */
export function DateAbout({ onChange }: { onChange: () => void }) {
  const [on, setOn] = useState(readUseWebGpu);
  return (
    <details className="date-about">
      <summary>About the date reader</summary>
      <p className="muted" data-testid="date-about">
        {aboutLine(peekDateReader()?.status())}
      </p>
      <Switch
        label="Use the graphics chip (WebGPU) when available"
        checked={on}
        onChange={(next) => {
          setOn(next);
          writeUseWebGpu(next);
          onChange();
        }}
      />
    </details>
  );
}

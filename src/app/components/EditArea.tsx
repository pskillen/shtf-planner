import type { ReactNode } from 'react';
import { useEditable } from '../state';

/**
 * Wraps the controls that write to the document. When the document is read-only (saved by a
 * newer version, or invalid) they are disabled; whatever sits outside stays usable, so rows still
 * open to be read and the page keeps its normal contrast.
 */
export function EditArea({ children }: { children: ReactNode }) {
  const editable = useEditable();
  return (
    <fieldset className="plain" disabled={!editable}>
      {children}
    </fieldset>
  );
}

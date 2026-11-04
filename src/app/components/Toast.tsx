import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** The one place toasts appear: a column above the tab bar that stacks whatever is showing. */
function toastRegion(): HTMLElement {
  let region = document.querySelector<HTMLElement>('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    document.body.appendChild(region);
  }
  return region;
}

/**
 * A toast (undo, sync, update). It is drawn into the shared toast region instead of being
 * positioned by itself, so any number showing at once stack one above the other with no overlap
 * and no gap where one is missing.
 */
export function Toast({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return createPortal(
    <div className={className ? `toast ${className}` : 'toast'} role="status" data-testid={testId}>
      {children}
    </div>,
    toastRegion(),
  );
}

import type { RuntimeLine } from './runtimeView';

/** The runtime sentences for one piece of equipment, as muted lines. */
export function RuntimeText({ lines }: { lines: readonly RuntimeLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <span key={l.key} className="muted">
          {l.text}
        </span>
      ))}
    </>
  );
}

/**
 * Quick add buttons for the lines with no fuel. They are separate buttons, so a caller keeps them
 * outside the row's own button or link.
 */
export function RuntimeQuickAdd({
  lines,
  onQuickAdd,
}: {
  lines: readonly RuntimeLine[];
  onQuickAdd: (prefill: { itemId: string; productId?: string }) => void;
}) {
  return (
    <>
      {lines.map((l) =>
        l.quickAdd ? (
          <button
            key={l.key}
            type="button"
            className="secondary runtime-add"
            onClick={() =>
              onQuickAdd({
                itemId: l.quickAdd!.itemId,
                ...(l.quickAdd!.productId ? { productId: l.quickAdd!.productId } : {}),
              })
            }
          >
            {l.quickAdd.label}
          </button>
        ) : null,
      )}
    </>
  );
}

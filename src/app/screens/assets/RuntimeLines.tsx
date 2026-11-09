import type { RuntimeLine } from './runtimeView';

/** The runtime sentences for one piece of equipment, as muted lines. */
export function RuntimeText({
  lines,
  as: Tag = 'span',
}: {
  lines: readonly RuntimeLine[];
  as?: 'span' | 'p';
}) {
  return (
    <>
      {lines.map((l) => (
        <Tag key={l.key} className="muted">
          {l.text}
        </Tag>
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

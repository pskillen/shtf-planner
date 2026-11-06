import type { PlaceWarning } from './stock';

/**
 * One box for a place whose conditions do not suit some of what is kept there. It says it once;
 * opening it names the products, so the Stores list is not a wall of the same warning.
 */
export function PlaceWarningBox({ warning }: { warning: PlaceWarning }) {
  const n = warning.products.length;
  return (
    <details className="place-warning">
      <summary>
        <span aria-hidden="true">⚠</span> {warning.summary}{' '}
        <span className="muted">
          ({n} {n === 1 ? 'product' : 'products'})
        </span>
      </summary>
      <ul>
        {warning.products.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    </details>
  );
}

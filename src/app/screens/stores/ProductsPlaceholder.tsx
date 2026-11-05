import { Link } from 'react-router-dom';

/** B5 replaces this with the full product list. Keeps › links from Stores working. */
export function ProductsPlaceholder() {
  return (
    <section className="screen stores">
      <h1>Your products</h1>
      <p className="muted">The product list is coming in the next update.</p>
      <Link className="button secondary" to="/app/stores">
        Back to Stores
      </Link>
    </section>
  );
}

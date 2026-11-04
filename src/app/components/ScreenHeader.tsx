import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** The top of a setup screen: a way back to the hub and the title. Onboarding passes no `back`. */
export function ScreenHeader({
  title,
  back = '/app',
  backLabel = 'Home',
  children,
}: {
  title: string;
  back?: string | null;
  backLabel?: string;
  children?: ReactNode;
}) {
  return (
    <header className="screen-header">
      {back ? (
        <Link to={back} className="back-link">
          ← {backLabel}
        </Link>
      ) : null}
      <h1>{title}</h1>
      {children}
    </header>
  );
}

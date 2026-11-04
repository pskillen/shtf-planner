import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Footer } from './Footer';

const TABS = [
  { path: '', label: 'Home', icon: '⌂' },
  { path: 'stores', label: 'Stores', icon: '▤' },
  { path: 'gaps', label: 'Gaps', icon: '△' },
  { path: 'score', label: 'Score', icon: '★' },
  { path: 'more', label: 'More', icon: '≡' },
] as const;

function Placeholder({ title }: { title: string }) {
  return (
    <section className="screen">
      <h1>{title}</h1>
      <p className="muted">Coming in a later phase.</p>
    </section>
  );
}

/** The app proper: top bar, one screen per tab, bottom nav, footer. */
export function Shell() {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="topbar-name">SHTF Planner</span>
      </header>
      <main className="main">
        <Routes>
          {TABS.map((t) => (
            <Route
              key={t.label}
              index={t.path === ''}
              path={t.path || undefined}
              element={<Placeholder title={t.label} />}
            />
          ))}
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>
      <Footer />
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <NavLink
            key={t.label}
            to={t.path ? `/app/${t.path}` : '/app'}
            end
            className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
          >
            <span className="tab-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

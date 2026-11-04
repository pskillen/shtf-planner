import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Footer } from './Footer';
import { StoreBanner } from './StoreBanner';
import { HomeHub } from './screens/HomeHub';
import { Onboarding } from './screens/Onboarding';
import { AssetsScreen } from './screens/AssetsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { HorizonScreen } from './screens/HorizonScreen';
import { LocationsScreen } from './screens/LocationsScreen';
import { MoreScreen } from './screens/MoreScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { RisksScreen } from './screens/RisksScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useEditable } from './state';
import type { ReactNode } from 'react';

function Screen({ children }: { children: ReactNode }) {
  return <section className="screen">{children}</section>;
}

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
  // A read-only document (saved by a newer version, or invalid) disables every control in a screen.
  const editable = useEditable();
  return (
    <div className="shell">
      <header className="topbar">
        <span className="topbar-name">SHTF Planner</span>
      </header>
      <StoreBanner />
      <main className="main">
        <fieldset className="plain" disabled={!editable}>
          <Routes>
            <Route index element={<HomeHub />} />
            <Route path="setup/:step" element={<Onboarding />} />
            <Route
              path="people"
              element={
                <Screen>
                  <PeopleScreen />
                </Screen>
              }
            />
            <Route
              path="home"
              element={
                <Screen>
                  <HomeScreen />
                </Screen>
              }
            />
            <Route
              path="locations"
              element={
                <Screen>
                  <LocationsScreen />
                </Screen>
              }
            />
            <Route
              path="assets"
              element={
                <Screen>
                  <AssetsScreen />
                </Screen>
              }
            />
            <Route
              path="risks"
              element={
                <Screen>
                  <RisksScreen />
                </Screen>
              }
            />
            <Route
              path="horizon"
              element={
                <Screen>
                  <HorizonScreen />
                </Screen>
              }
            />
            <Route
              path="more"
              element={
                <Screen>
                  <MoreScreen />
                </Screen>
              }
            />
            <Route
              path="more/settings"
              element={
                <Screen>
                  <SettingsScreen />
                </Screen>
              }
            />
            {TABS.filter((t) => !['', 'more'].includes(t.path)).map((t) => (
              <Route key={t.label} path={t.path} element={<Placeholder title={t.label} />} />
            ))}
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </fieldset>
      </main>
      <Footer />
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <NavLink
            key={t.label}
            to={t.path ? `/app/${t.path}` : '/app'}
            end={t.path === ''}
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

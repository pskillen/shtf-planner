import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './Footer';
import { ScreenBoundary } from './ScreenBoundary';
import { StoreBanner } from './StoreBanner';
import { TABS, activeTab, showsTabs } from './tabs';
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
import type { ReactNode } from 'react';

function Screen({ children }: { children: ReactNode }) {
  return <section className="screen">{children}</section>;
}

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
  const { pathname } = useLocation();
  const tabs = showsTabs(pathname);
  const current = activeTab(pathname);
  return (
    <div className={tabs ? 'shell' : 'shell no-tabs'}>
      <header className="topbar">
        <span className="topbar-name">SHTF Planner</span>
      </header>
      <StoreBanner />
      <main className="main">
        <ScreenBoundary key={pathname}>
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
        </ScreenBoundary>
      </main>
      <Footer />
      {tabs ? (
        <nav className="tabbar" aria-label="Main">
          {TABS.map((t) => (
            <Link
              key={t.label}
              to={t.path ? `/app/${t.path}` : '/app'}
              className={t.path === current ? 'tab active' : 'tab'}
              aria-current={t.path === current ? 'page' : undefined}
            >
              <span className="tab-icon" aria-hidden="true">
                {t.icon}
              </span>
              <span>{t.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

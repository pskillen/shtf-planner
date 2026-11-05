import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './Footer';
import { DataScreen } from './screens/data/DataScreen';
import { SyncChrome } from './sync/SyncChrome';
import { SyncPill } from './sync/SyncPill';
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
import { ScoreScreen } from './screens/ScoreScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { GapsScreen } from './screens/GapsScreen';
import { StoresScreen } from './screens/StoresScreen';
import { StocktakeScreen } from './screens/stores/StocktakeScreen';
import { ProductsPlaceholder } from './screens/stores/ProductsPlaceholder';
import type { ReactNode } from 'react';
import { TooOld } from './TooOld';
import { useStoreStatus } from './state';

function Screen({ children }: { children: ReactNode }) {
  return <section className="screen">{children}</section>;
}

/**
 * A screen's identity for the error boundary: each path is its own, except the setup steps, which
 * share one so `Onboarding` (and what it remembers between steps) stays mounted.
 */
const screenKey = (pathname: string): string =>
  pathname.startsWith('/app/setup') ? '/app/setup' : pathname;

/** The app proper: top bar, one screen per tab, bottom nav, footer. */
export function Shell() {
  const { pathname } = useLocation();
  const storeStatus = useStoreStatus();
  const tooOld = storeStatus.kind === 'too-old';
  const tabs = !tooOld && showsTabs(pathname);
  const current = activeTab(pathname);
  return (
    <div className={tabs ? 'shell' : 'shell no-tabs'}>
      <header className="topbar">
        <span className="topbar-name">SHTF Planner</span>
        {!tooOld ? <SyncPill /> : null}
      </header>
      {!tooOld ? <StoreBanner /> : null}
      {!tooOld ? <SyncChrome /> : null}
      <main className="main">
        {tooOld ? (
          <TooOld />
        ) : (
          <ScreenBoundary key={screenKey(pathname)}>
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
              <Route path="more/data" element={<DataScreen />} />
              <Route
                path="more/settings"
                element={
                  <Screen>
                    <SettingsScreen />
                  </Screen>
                }
              />
              <Route path="stores" element={<StoresScreen />} />
              <Route path="stores/products" element={<ProductsPlaceholder />} />
              <Route path="stores/stocktake" element={<StocktakeScreen />} />
              <Route path="gaps" element={<GapsScreen />} />
              <Route path="score" element={<ScoreScreen />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </ScreenBoundary>
        )}
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

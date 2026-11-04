import { describe, expect, it } from 'vitest';
import { activeTab, showsTabs } from '../src/app/tabs';

describe('the bottom tabs', () => {
  it('highlights Home for the hub and every screen reached from it', () => {
    for (const p of [
      '/app',
      '/app/people',
      '/app/home',
      '/app/locations',
      '/app/assets',
      '/app/risks',
      '/app/horizon',
      '/app/setup/people',
    ]) {
      expect(activeTab(p), p).toBe('');
    }
  });

  it('highlights the tab that owns the path, and what is under it', () => {
    expect(activeTab('/app/stores')).toBe('stores');
    expect(activeTab('/app/gaps')).toBe('gaps');
    expect(activeTab('/app/score')).toBe('score');
    expect(activeTab('/app/more')).toBe('more');
    expect(activeTab('/app/more/settings')).toBe('more');
  });

  it('hides the tabs during first-run setup only', () => {
    expect(showsTabs('/app/setup/people')).toBe(false);
    expect(showsTabs('/app/setup')).toBe(false);
    expect(showsTabs('/app')).toBe(true);
    expect(showsTabs('/app/people')).toBe(true);
    expect(showsTabs('/app/setups')).toBe(true);
  });
});

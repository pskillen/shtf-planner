// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShoppingScreen } from '../src/app/screens/ShoppingScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

// The engine never names a piece that is not in the document, so the screen's own filter is
// only reached by a row built from an earlier state of it: stand one in by adding a stale id.
vi.mock('../src/app/screens/gaps/view', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/app/screens/gaps/view')>();
  return {
    ...real,
    buildGapsView: (...args: Parameters<typeof real.buildGapsView>) => {
      const view = real.buildGapsView(...args);
      return {
        ...view,
        shopping: view.shopping.map((r) =>
          r.assetIds ? { ...r, assetIds: [...r.assetIds, 'asset-gone'] } : r,
        ),
      };
    },
  };
});

afterEach(cleanup);

describe('shopping links to equipment that has been deleted', () => {
  it('skips the missing id and keeps the pieces that exist', () => {
    const doc = biggarDocument();
    doc.settings.horizonDays = 28;
    const s = liveStore(doc);
    render(s.wrap(<ShoppingScreen />));
    const hrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
      .filter((h) => h.includes('edit='));
    expect(hrefs).toContain('/app/assets?edit=asset-bbq');
    expect(hrefs.some((h) => h.includes('asset-gone'))).toBe(false);
  });
});

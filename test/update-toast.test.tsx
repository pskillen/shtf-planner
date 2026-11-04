// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateToast } from '../src/app/UpdateToast';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, sw.setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

function setController(controller: object | null) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { controller },
    configurable: true,
  });
}

describe('the update toast', () => {
  const reload = vi.fn();
  beforeEach(() => {
    reload.mockReset();
    vi.stubGlobal('location', { ...window.location, reload });
    setController({});
    sw.needRefresh = false;
    sw.setNeedRefresh.mockReset();
    sw.updateServiceWorker.mockReset();
  });

  it('shows nothing until a new version is waiting', () => {
    render(<UpdateToast />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('applies the waiting worker only when Reload is tapped', () => {
    sw.needRefresh = true;
    render(<UpdateToast />);
    expect(screen.getByRole('status').textContent).toContain('Update available');
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads the page itself on a first visit, when no worker controls it yet', () => {
    setController(null);
    sw.needRefresh = true;
    render(<UpdateToast />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Later without updating', () => {
    sw.needRefresh = true;
    render(<UpdateToast />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(sw.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();
  });
});

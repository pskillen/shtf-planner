// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_ID_OVERRIDE_KEY,
  GIS_SCRIPT_SRC,
  getGoogleClientId,
  loadGoogleIdentity,
  resetGoogleIdentityLoaderForTests,
} from './loadGoogleIdentity';
import { DriveNetworkError } from './driveTypes';

describe('getGoogleClientId', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is empty when the build has none and nothing is kept in the browser', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    expect(getGoogleClientId()).toBe('');
  });

  it('falls back to a client id kept in this browser', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    localStorage.setItem(CLIENT_ID_OVERRIDE_KEY, '  mine.apps.googleusercontent.com ');
    expect(getGoogleClientId()).toBe('mine.apps.googleusercontent.com');
  });

  it('ignores a client id kept in the browser on a production build', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    vi.stubGlobal('__BUILD_ENV__', 'prod');
    localStorage.setItem(CLIENT_ID_OVERRIDE_KEY, 'mine.apps.googleusercontent.com');
    expect(getGoogleClientId()).toBe('');
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'built.apps.googleusercontent.com');
    expect(getGoogleClientId()).toBe('built.apps.googleusercontent.com');
  });

  it('prefers the built-in id', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'built.apps.googleusercontent.com');
    localStorage.setItem(CLIENT_ID_OVERRIDE_KEY, 'mine');
    expect(getGoogleClientId()).toBe('built.apps.googleusercontent.com');
  });
});

describe('loadGoogleIdentity', () => {
  afterEach(() => {
    resetGoogleIdentityLoaderForTests();
    document.head.innerHTML = '';
    delete window.google;
  });

  it('loads the script once, only on demand, and resolves when google is defined', async () => {
    expect(document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`)).toBeNull();
    const first = loadGoogleIdentity();
    const second = loadGoogleIdentity();
    const scripts = document.querySelectorAll(`script[src="${GIS_SCRIPT_SRC}"]`);
    expect(scripts).toHaveLength(1);
    window.google = { accounts: { oauth2: {} } } as unknown as typeof window.google;
    (scripts[0] as HTMLScriptElement).onload?.(new Event('load'));
    await expect(first).resolves.toBe(window.google);
    await expect(second).resolves.toBe(window.google);
  });

  it('rejects when the script fails, and a later attempt can try again', async () => {
    const attempt = loadGoogleIdentity();
    (document.querySelector('script') as HTMLScriptElement).onerror?.(new Event('error'));
    await expect(attempt).rejects.toThrow(/Failed to load/);
    await expect(attempt).rejects.toBeInstanceOf(DriveNetworkError);
    document.head.innerHTML = '';
    const again = loadGoogleIdentity();
    expect(document.querySelectorAll('script')).toHaveLength(1);
    window.google = { accounts: { oauth2: {} } } as unknown as typeof window.google;
    (document.querySelector('script') as HTMLScriptElement).onload?.(new Event('load'));
    await expect(again).resolves.toBeTruthy();
  });
});

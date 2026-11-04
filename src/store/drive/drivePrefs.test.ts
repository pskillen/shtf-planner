import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRIVE_ACCESS_TOKEN_KEY,
  DRIVE_TOKEN_REFRESH_BUFFER_MS,
  clearDriveSession,
  clearDriveToken,
  driveSessionIsValid,
  isDriveConnected,
  loadDriveSession,
  saveDriveSession,
} from './drivePrefs';
import { memoryStorage } from './testStorage';

describe('drivePrefs', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips a session under the shtf-planner keys', () => {
    saveDriveSession({ accessToken: 'tok', expiresAt: 5000, accountEmail: 'a@example.test' });
    expect(loadDriveSession()).toEqual({
      accessToken: 'tok',
      expiresAt: 5000,
      accountEmail: 'a@example.test',
    });
    expect(DRIVE_ACCESS_TOKEN_KEY.startsWith('shtf-planner:drive:')).toBe(true);
    expect(isDriveConnected()).toBe(true);
  });

  it('dropping the token keeps the person connected; disconnecting clears everything', () => {
    saveDriveSession({ accessToken: 'tok', expiresAt: 5000, accountEmail: 'a@example.test' });
    clearDriveToken();
    expect(loadDriveSession()).toBeNull();
    expect(isDriveConnected()).toBe(true);
    clearDriveSession();
    expect(isDriveConnected()).toBe(false);
    expect(storage.length).toBe(0);
  });

  it('treats a token as expired a minute early', () => {
    const s = { accessToken: 't', expiresAt: 1_000_000 };
    expect(driveSessionIsValid(s, 1_000_000 - DRIVE_TOKEN_REFRESH_BUFFER_MS - 1)).toBe(true);
    expect(driveSessionIsValid(s, 1_000_000 - DRIVE_TOKEN_REFRESH_BUFFER_MS)).toBe(false);
    expect(driveSessionIsValid(null)).toBe(false);
  });

  it('survives storage that throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(loadDriveSession()).toBeNull();
    expect(() => saveDriveSession({ accessToken: 't', expiresAt: 1 })).not.toThrow();
    expect(isDriveConnected()).toBe(false);
  });
});

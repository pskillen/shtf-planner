import { describe, expect, it } from 'vitest';
import { resolveBuildEnv } from '../src/util/build-env';

describe('resolveBuildEnv', () => {
  it('defaults to local', () => {
    expect(resolveBuildEnv(undefined)).toBe('local');
    expect(resolveBuildEnv('')).toBe('local');
  });
  it('shows main as next', () => {
    expect(resolveBuildEnv('main')).toBe('next');
  });
  it.each(['local', 'preview', 'dev', 'next', 'staging', 'prod'])('keeps %s', (env) => {
    expect(resolveBuildEnv(env)).toBe(env);
  });
  it('rejects an unknown value', () => {
    expect(() => resolveBuildEnv('prodd')).toThrow(/Unknown BUILD_ENV/);
  });
});

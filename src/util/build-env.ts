/** The deploy targets the footer can show. */
export type BuildEnv = 'local' | 'preview' | 'dev' | 'next' | 'staging' | 'prod';

const KNOWN: readonly BuildEnv[] = ['local', 'preview', 'dev', 'next', 'staging', 'prod'];

/**
 * Maps the `BUILD_ENV` a workflow passes to a build environment. The workflow for a push to
 * `main` passes `main`, which is shown as `next`. Unset is `local`; an unknown value is an error,
 * so a typo in a workflow fails the build instead of shipping a wrong footer.
 */
export function resolveBuildEnv(raw: string | undefined): BuildEnv {
  const value = (raw ?? '').trim();
  if (value === '') return 'local';
  if (value === 'main') return 'next';
  if ((KNOWN as readonly string[]).includes(value)) return value as BuildEnv;
  throw new Error(`Unknown BUILD_ENV "${value}" (expected main or one of ${KNOWN.join(', ')})`);
}

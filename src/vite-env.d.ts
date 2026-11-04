/// <reference types="vite/client" />

/** The deploy target (vite.config.ts, from BUILD_ENV; `main` is mapped to `next`). */
declare const __BUILD_ENV__: 'local' | 'preview' | 'dev' | 'next' | 'staging' | 'prod';
/** The version shown in the footer: a bare SemVer tag, a short SHA, or "local" (from BUILD_VERSION). */
declare const __BUILD_VERSION__: string;

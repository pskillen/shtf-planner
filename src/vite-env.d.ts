/// <reference types="vite/client" />

/** The deploy target: local, preview, dev, main, staging or prod (vite.config.ts, from BUILD_ENV). */
declare const __BUILD_ENV__: string;
/** The version shown in the footer: a bare SemVer tag, a short SHA, or "local" (from BUILD_VERSION). */
declare const __BUILD_VERSION__: string;

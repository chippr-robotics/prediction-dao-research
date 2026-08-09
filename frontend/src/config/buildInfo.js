/**
 * Which build am I looking at?
 *
 * Exists for troubleshooting: when someone reports a problem, the first question is always which
 * build they are on, and "latest" is not an answer — the SPA is a static bundle behind a CDN, so a
 * member can be running something several deploys old without knowing it.
 *
 * The COMMIT is the identifier that matters. `frontend/package.json` is `0.0.0` (a workspace
 * placeholder, never bumped) and the root version moves rarely, so a version string alone cannot
 * tell two builds apart. The short SHA pins the tree exactly and is greppable straight back to a
 * commit, a PR and a CI run.
 *
 * BOTH VALUES ARE BUILD-TIME CONSTANTS, substituted by Vite's `define` (see vite.config.js). They
 * are deliberately NOT read from `import.meta.env` at runtime: `.dockerignore` excludes `.git`, so
 * the container cannot derive the SHA itself, and a value that is only sometimes present would make
 * this display sometimes lie.
 *
 * HONESTY RULE: when the commit is unknown — a local `vite dev`, or an image built without the
 * build arg — this reports `dev` rather than inventing or omitting. A build label that silently
 * disappears in some environments is worse than one that says it does not know, because the absence
 * reads as "no version info exists" rather than "this build was not stamped".
 */

/* global __APP_VERSION__, __APP_COMMIT__ */

// The `typeof` guards keep this importable under plain vitest, where Vite's `define` substitution
// does not run — without them every test that renders the Footer would throw a ReferenceError.
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
export const APP_COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev'

/** True when this build carries a real commit stamp (i.e. was built by CI, not a dev server). */
export const IS_STAMPED = APP_COMMIT !== 'dev' && APP_COMMIT.length > 0

/**
 * The one-line label rendered in the nav drawer, e.g. `v1.0.0 · a1b2c3d` or `v1.0.0 · dev`.
 * Kept here rather than in the component so the format has a single definition and a test can
 * assert it without rendering anything.
 */
export function buildLabel() {
  return `v${APP_VERSION} · ${APP_COMMIT}`
}

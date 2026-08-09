/**
 * Build identity (spec 076, FR-029/FR-031/FR-032).
 *
 * Answers "what is this build?" for the account panel. Two values, both baked in at build time by
 * Vite from the Dockerfile's build args — never hardcoded, never hand-edited, so they cannot go
 * stale (FR-032).
 *
 * THE RULE THAT MATTERS (FR-031, constitution III): when a build does not correspond to a published
 * release, this reports `unreleased+<short-sha>`. It NEVER falls back to the nearest tag. A surface
 * that shows a release number for a build that is not that release makes the whole release record
 * untrustworthy — an operator matching a bug report to a version would be matching it to a lie.
 * "I don't know which release this is" is a useful answer; a wrong release number is not.
 */

const UNRELEASED_PREFIX = 'unreleased+'
const UNKNOWN = 'unknown'

/** Vite inlines these at build time; both are absent in dev and in any un-passed build arg. */
function raw(key) {
  const value = import.meta.env?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

/** A published release tag looks exactly like this — anything else is not a release. */
const RELEASE_RE = /^v\d+\.\d+\.\d+$/
const RC_RE = /^v\d+\.\d+\.\d+-rc\.\d+$/

/** The build's commit SHA, shortened for display. Empty when unavailable. */
export function gitSha({ short = true } = {}) {
  const sha = raw('VITE_GIT_SHA')
  if (!sha) return ''
  return short ? sha.slice(0, 7) : sha
}

/**
 * True when this build is a published release or release candidate. Used to decide whether the UI
 * presents a version or discloses an unreleased build.
 */
export function isReleased() {
  const v = raw('VITE_APP_VERSION')
  return RELEASE_RE.test(v) || RC_RE.test(v)
}

/** True specifically for a release candidate (a staging build). */
export function isReleaseCandidate() {
  return RC_RE.test(raw('VITE_APP_VERSION'))
}

/**
 * The version string to display.
 *
 *   v1.4.0            a published production release
 *   v1.4.0-rc.2       a release candidate on staging
 *   unreleased+b7c48f1  anything else, including a malformed build arg
 *   unreleased        anything else with no SHA either
 */
export function appVersion() {
  const v = raw('VITE_APP_VERSION')
  if (RELEASE_RE.test(v) || RC_RE.test(v)) return v

  // Deliberately ignores whatever `v` actually contained. A build arg carrying something that is
  // not a version — a branch name, a partial tag, a stale value — must not be shown as one.
  const sha = gitSha()
  return sha ? `${UNRELEASED_PREFIX}${sha}` : UNRELEASED_PREFIX.replace('+', '')
}

/**
 * Everything a display surface needs, in one call.
 * `label` is ready to render; `released` tells the caller whether to add a disclosure.
 */
export function buildIdentity() {
  const released = isReleased()
  return {
    label: appVersion(),
    sha: gitSha() || UNKNOWN,
    released,
    candidate: isReleaseCandidate(),
  }
}

/**
 * Tests for frontend/src/config/version.js (spec 076, T015).
 *
 * The case that matters most is the UNRELEASED one. A build that is not a published release must
 * say so; showing the nearest tag would make every release record untrustworthy (FR-031,
 * constitution III).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

const SHA = 'b7c48f1a958f8fbfb5d0bb54ed762db7ea6a2011'

/** version.js reads import.meta.env at call time, so a fresh import per case is not required. */
async function load() {
  vi.resetModules()
  return import('../../config/version')
}

function setEnv({ version, sha } = {}) {
  vi.stubEnv('VITE_APP_VERSION', version ?? '')
  vi.stubEnv('VITE_GIT_SHA', sha ?? '')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('appVersion (spec 076)', () => {
  it('reports a published release verbatim', async () => {
    setEnv({ version: 'v1.4.0', sha: SHA })
    const { appVersion, isReleased, isReleaseCandidate } = await load()
    expect(appVersion()).toBe('v1.4.0')
    expect(isReleased()).toBe(true)
    expect(isReleaseCandidate()).toBe(false)
  })

  it('reports a release candidate verbatim and flags it as one', async () => {
    setEnv({ version: 'v1.4.0-rc.2', sha: SHA })
    const { appVersion, isReleased, isReleaseCandidate } = await load()
    expect(appVersion()).toBe('v1.4.0-rc.2')
    expect(isReleased()).toBe(true)
    expect(isReleaseCandidate()).toBe(true)
  })

  it('reports unreleased+sha when no version was baked in (FR-031)', async () => {
    setEnv({ version: '', sha: SHA })
    const { appVersion, isReleased } = await load()
    expect(appVersion()).toBe('unreleased+b7c48f1')
    expect(isReleased()).toBe(false)
  })

  it('reports unreleased when neither value is present', async () => {
    setEnv({})
    const { appVersion, isReleased } = await load()
    expect(appVersion()).toBe('unreleased')
    expect(isReleased()).toBe(false)
  })

  it('NEVER shows a malformed build arg as if it were a version', async () => {
    // The failure this guards against: a build arg carrying a branch name, a partial tag, or a
    // stale value being rendered as a release. Each of these must degrade to unreleased.
    // Note `'v1.4.0 '` is deliberately NOT in this list — surrounding whitespace is trimmed before
    // the decision, which the next test asserts. A build arg picking up a stray newline is a
    // transport artefact, not a malformed version.
    for (const bad of ['v1.4', '1.4.0', 'main', 'v1.4.0-dirty', 'latest', 'v1.4', 'release-1.4.0']) {
      setEnv({ version: bad, sha: SHA })
      const { appVersion, isReleased } = await load()
      expect(isReleased(), `"${bad}" must not read as released`).toBe(false)
      expect(appVersion(), `"${bad}" must degrade`).toBe('unreleased+b7c48f1')
    }
  })

  it('trims surrounding whitespace before deciding', async () => {
    setEnv({ version: '  v1.4.0  ', sha: `  ${SHA}  ` })
    const { appVersion } = await load()
    expect(appVersion()).toBe('v1.4.0')
  })
})

describe('gitSha', () => {
  it('shortens for display and can return the full value', async () => {
    setEnv({ version: 'v1.4.0', sha: SHA })
    const { gitSha } = await load()
    expect(gitSha()).toBe('b7c48f1')
    expect(gitSha({ short: false })).toBe(SHA)
  })

  it('returns empty rather than a placeholder when absent', async () => {
    setEnv({ version: 'v1.4.0' })
    const { gitSha } = await load()
    expect(gitSha()).toBe('')
  })
})

describe('buildIdentity', () => {
  it('bundles a ready-to-render label with the released flag', async () => {
    setEnv({ version: 'v1.4.0', sha: SHA })
    const { buildIdentity } = await load()
    expect(buildIdentity()).toEqual({
      label: 'v1.4.0',
      sha: 'b7c48f1',
      released: true,
      candidate: false,
    })
  })

  it('marks an unreleased build so the UI can disclose it', async () => {
    setEnv({ sha: SHA })
    const { buildIdentity } = await load()
    expect(buildIdentity()).toEqual({
      label: 'unreleased+b7c48f1',
      sha: 'b7c48f1',
      released: false,
      candidate: false,
    })
  })

  it('says unknown rather than empty when there is no sha at all', async () => {
    setEnv({})
    const { buildIdentity } = await load()
    expect(buildIdentity().sha).toBe('unknown')
  })
})

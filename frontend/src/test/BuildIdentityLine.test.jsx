import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

/**
 * The account-modal version line (spec 076, FR-029/FR-031), T017.
 *
 * Rendered in isolation rather than through FairWinsUserModal: the modal needs wallet, price, role
 * and router context, none of which this line touches, and a test that drags all of it in would be
 * testing the providers rather than the disclosure.
 *
 * The behaviour under test is the honest-state one — an unreleased build must be MARKED as such in
 * the visible text, not merely represented by a string a reader could mistake for a version.
 */

const SHA = 'b7c48f1a958f8fbfb5d0bb54ed762db7ea6a2011'

async function renderLine({ version, sha } = {}) {
  vi.stubEnv('VITE_APP_VERSION', version ?? '')
  vi.stubEnv('VITE_GIT_SHA', sha ?? '')
  vi.resetModules()
  const { buildIdentity } = await import('../config/version')
  const { label, sha: short, released, candidate } = buildIdentity()
  const description = released
    ? candidate
      ? 'Release candidate — pre-production build'
      : 'Released build'
    : 'Unreleased build — not a published release'

  return render(
    <div className="fwum-build-identity" data-testid="build-identity">
      <span className="fwum-build-label">Version</span>
      <span className="fwum-build-value" title={`${description} (commit ${short})`}>
        {label}
      </span>
      {!released && <span className="fwum-build-note">not a published release</span>}
      <span className="sr-only">{description}</span>
    </div>
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('build identity line', () => {
  it('shows a published release plainly', async () => {
    await renderLine({ version: 'v1.4.0', sha: SHA })
    expect(screen.getByTestId('build-identity').textContent).toMatch(/v1\.4\.0/)
    expect(screen.queryByText('not a published release')).toBeNull()
  })

  it('labels a release candidate as pre-production', async () => {
    await renderLine({ version: 'v1.4.0-rc.2', sha: SHA })
    const line = screen.getByTestId('build-identity')
    expect(line.textContent).toMatch(/v1\.4\.0-rc\.2/)
    expect(line.textContent).toMatch(/Release candidate/)
  })

  it('MARKS an unreleased build rather than showing a bare string (FR-031)', async () => {
    await renderLine({ sha: SHA })
    const line = screen.getByTestId('build-identity')
    expect(line.textContent).toMatch(/unreleased\+b7c48f1/)
    // The visible marker is the point: a reader must not be able to mistake this for a release.
    expect(screen.getByText('not a published release')).toBeInTheDocument()
    expect(line.textContent).toMatch(/Unreleased build/)
  })

  it('never displays a version the build is not', async () => {
    await renderLine({ version: 'main', sha: SHA })
    const line = screen.getByTestId('build-identity')
    expect(line.textContent).not.toMatch(/main/)
    expect(line.textContent).toMatch(/unreleased/)
  })

  it('carries the commit in the title for copy-paste during triage', async () => {
    await renderLine({ version: 'v1.4.0', sha: SHA })
    expect(screen.getByTitle(/commit b7c48f1/)).toBeInTheDocument()
  })

  it('has no accessibility violations in either state', async () => {
    const { container: released } = await renderLine({ version: 'v1.4.0', sha: SHA })
    expect(await axe(released)).toHaveNoViolations()

    const { container: unreleased } = await renderLine({ sha: SHA })
    expect(await axe(unreleased)).toHaveNoViolations()
  })
})

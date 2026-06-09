import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { MemoryRouter } from 'react-router-dom'

import EntryGate from '../components/compliance/EntryGate'
import MembershipAttestation from '../components/compliance/MembershipAttestation'
import DenyListAdmin from '../components/admin/DenyListAdmin'
import { TermsPage } from '../pages/legal/LegalDocPage'
import Footer from '../components/Footer'

/**
 * Spec 007 (FR-053 / SC-015): the new compliance trust surfaces must meet WCAG 2.1 AA.
 * jsdom-level axe checks structural a11y (roles, names, labels, landmarks); color-contrast
 * needs a real browser and is covered by the Lighthouse/axe CI job.
 */
describe('Compliance UI accessibility (T054, FR-053)', () => {
  beforeEach(() => localStorage.clear())

  it('EntryGate has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <EntryGate />
      </MemoryRouter>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('MembershipAttestation has no axe violations', async () => {
    const { container } = render(<MembershipAttestation onChange={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('Legal document page (Terms) has no axe violations', async () => {
    const { container } = render(<TermsPage />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('Footer (condensed in-app) has no axe violations (Spec 010)', async () => {
    const { container } = render(<Footer variant="condensed" />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('DenyListAdmin has no axe violations', async () => {
    const { container } = render(
      <DenyListAdmin
        signer={null}
        contracts={{ sanctionsGuard: '0x1111111111111111111111111111111111111111' }}
        runTx={() => {}}
        pendingTx={false}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

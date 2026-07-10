// Spec 049 (US2, FR-006) — vault-list badge: 'managed' renders the shield badge + summary,
// 'foreign' renders the unrecognized-policy marker, 'none'/'unsupported' render nothing.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import PolicyBadge from '../../components/custody/PolicyBadge'
import VaultList from '../../components/custody/VaultList'

const A = '0x1111111111111111111111111111111111111111'

describe('PolicyBadge', () => {
  it('renders the policy summary for a managed vault', () => {
    render(<PolicyBadge status="managed" summary="limits on 1 asset · 2-address allowlist" />)
    expect(screen.getByText(/limits on 1 asset · 2-address allowlist/i)).toBeInTheDocument()
    expect(screen.getByText(/policy-governed vault/i)).toBeInTheDocument()
  })

  it('falls back to a generic label when a managed vault has no summary', () => {
    render(<PolicyBadge status="managed" summary="" />)
    expect(screen.getByText(/policy active/i)).toBeInTheDocument()
  })

  it('marks a foreign guard as an unrecognized policy', () => {
    render(<PolicyBadge status="foreign" />)
    expect(screen.getByText(/unrecognized policy/i)).toBeInTheDocument()
  })

  it('renders nothing for none, unsupported, and unknown statuses', () => {
    for (const status of ['none', 'unsupported', undefined]) {
      const { container, unmount } = render(<PolicyBadge status={status} summary="ignored" />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it('appears inside a VaultList row when the vault carries policy data', () => {
    const vaults = [
      {
        chainId: 1337,
        address: A,
        label: 'Treasury',
        isSafe: true,
        owners: [A],
        threshold: 1,
        owner: true,
        policyStatus: 'managed',
        policySummary: '1-hour delay',
      },
    ]
    render(<VaultList vaults={vaults} activeAddress={null} onSelect={vi.fn()} />)
    expect(screen.getByText(/1-hour delay/i)).toBeInTheDocument()
  })

  it('has no axe violations in all rendering states', async () => {
    const { container } = render(
      <ul>
        <li>
          <PolicyBadge status="managed" summary="limits on 2 assets" />
        </li>
        <li>
          <PolicyBadge status="foreign" />
        </li>
      </ul>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

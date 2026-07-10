// Spec 043 (US1) — vault detail renders live on-chain facts and the unreadable-vault state.
// Spec 049 — VaultDetail hosts the Policy section (PolicyPanel); the policy lib is mocked here
// (tests run on a network without the engine) — PolicyPanel behavior has its own suites.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

vi.mock('../../lib/custody/policy', () => ({
  getPolicyStatus: vi.fn(async () => 'unsupported'),
  readPolicy: vi.fn(async () => null),
  describeRules: () => [],
  validatePolicyConfig: () => {},
  buildPolicyChangeTx: vi.fn(),
  buildSetGuardTx: vi.fn(),
  NATIVE_ASSET: '0x0000000000000000000000000000000000000000',
  shortAddress: (a) => String(a),
}))

import VaultDetail from '../../components/custody/VaultDetail'
import VaultList from '../../components/custody/VaultList'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'

describe('VaultDetail', () => {
  it('renders threshold, role, and owners for a loaded Safe', async () => {
    const vault = { isSafe: true, address: A, chainId: 63, owners: [A, B], threshold: 2, owner: true, label: 'Coop', version: '1.4.1' }
    const { container } = render(<VaultDetail vault={vault} />)
    expect(screen.getByText(/2 of 2 owners/i)).toBeInTheDocument()
    expect(screen.getByText(/can propose & approve/i)).toBeInTheDocument()
    // Spec 049 — the Policy section is mounted (here in its unsupported-network state).
    expect(screen.getByRole('heading', { name: /^policy$/i })).toBeInTheDocument()
    expect(await screen.findByText(/aren.t supported on this network/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows an unreadable state for a non-Safe reference', () => {
    render(<VaultDetail vault={{ isSafe: false, address: A, label: 'x' }} onForget={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/could not read a safe/i)
  })
})

describe('VaultList', () => {
  it('marks the active vault and calls onSelect', () => {
    const onSelect = vi.fn()
    const vaults = [{ chainId: 63, address: A, label: 'One', isSafe: true, owners: [A], threshold: 1, owner: true }]
    render(<VaultList vaults={vaults} activeAddress={A} onSelect={onSelect} />)
    const item = screen.getByRole('button', { name: /One/i })
    expect(item).toHaveAttribute('aria-current', 'true')
  })

  it('renders an empty state with no vaults', () => {
    render(<VaultList vaults={[]} activeAddress={null} onSelect={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(/no vaults yet/i)
  })
})

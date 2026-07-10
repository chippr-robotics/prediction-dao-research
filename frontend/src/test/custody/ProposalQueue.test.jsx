// Spec 043 (US2) — queue: owner can approve pending / execute ready; view-only sees no actions (FR-016);
// approvals-remaining and history render.
// Spec 049 (US3) — proposals targeting the chain's policy guard render as decoded "Policy change" /
// "Activate policy engine" entries; ordinary proposals render exactly as before.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import ProposalQueue from '../../components/custody/ProposalQueue'
import { STATUS } from '../../lib/custody/proposalStatus'
import { encodeConfigureRules, buildSetGuardTx, NATIVE_ASSET } from '../../lib/custody/policy'
import { getContractAddressForChain } from '../../config/contracts'

const A = '0xAAaAAa0000000000000000000000000000000001'
const HASH1 = '0x' + '11'.repeat(32)
const HASH2 = '0x' + '22'.repeat(32)

const pending = {
  safeTxHash: HASH1,
  to: '0x3333333333333333333333333333333333333333',
  nonce: 5n,
  approvals: 1,
  threshold: 2,
  approvers: [],
  status: STATUS.PENDING,
}
const ready = { ...pending, safeTxHash: HASH2, approvals: 2, approvers: [A], status: STATUS.READY }

describe('ProposalQueue', () => {
  it('shows Approve for a pending proposal and remaining count (owner)', () => {
    render(
      <ProposalQueue queue={[pending]} history={[]} isOwner connectedAddress={A} onApprove={vi.fn()} onExecute={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    expect(screen.getByText(/1 more needed/i)).toBeInTheDocument()
  })

  it('shows Execute for a ready proposal (owner)', () => {
    render(
      <ProposalQueue queue={[ready]} history={[]} isOwner connectedAddress={A} onApprove={vi.fn()} onExecute={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /execute/i })).toBeInTheDocument()
  })

  it('shows no action buttons for a view-only (non-owner) member', () => {
    render(
      <ProposalQueue queue={[pending, ready]} history={[]} isOwner={false} connectedAddress={A} onApprove={vi.fn()} onExecute={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /approve|execute/i })).not.toBeInTheDocument()
  })

  it('disables Approve when the connected owner already approved', () => {
    const mine = { ...pending, approvers: [A] }
    render(
      <ProposalQueue queue={[mine]} history={[]} isOwner connectedAddress={A} onApprove={vi.fn()} onExecute={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /approved/i })).toBeDisabled()
  })

  it('renders history and an empty-queue state, no axe violations', async () => {
    const done = { ...pending, safeTxHash: HASH2, status: STATUS.EXECUTED }
    const { container } = render(
      <ProposalQueue queue={[]} history={[done]} isOwner connectedAddress={A} onApprove={vi.fn()} onExecute={vi.fn()} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/no pending transactions/i)
    expect(screen.getByText(/history/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('ProposalQueue — policy proposals (spec 049)', () => {
  // Chain 1337 carries the synced spec 049 guard addresses.
  const CHAIN = 1337
  const GUARD = getContractAddressForChain('safePolicyGuard', CHAIN)
  const VAULT = '0x4444444444444444444444444444444444444444'

  it('renders a configureRules proposal as a decoded "Policy change" entry', async () => {
    const data = encodeConfigureRules({
      limits: [{ asset: NATIVE_ASSET, perTxLimit: 10n ** 18n, windowLimit: 0n }],
      cooldown: 7200,
      allowlistEnabled: true,
      allowlistAdd: ['0x1111111111111111111111111111111111111111'],
    })
    const p = { ...pending, to: GUARD, data }
    const { container } = render(
      <ProposalQueue
        queue={[p]}
        history={[]}
        isOwner
        connectedAddress={A}
        chainId={CHAIN}
        vaultAddress={VAULT}
        onApprove={vi.fn()}
        onExecute={vi.fn()}
      />,
    )
    expect(screen.getByText(/^policy change$/i)).toBeInTheDocument()
    expect(screen.getByText(/per-transaction limit 1\.0/i)).toBeInTheDocument()
    expect(screen.getByText(/transaction delay: 2 hours/i)).toBeInTheDocument()
    expect(screen.getByText(/recipient allowlist: enabled/i)).toBeInTheDocument()
    expect(screen.getByText(/add recipient 0x1111…1111/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders a setGuard self-tx as "Activate policy engine"', () => {
    const tx = buildSetGuardTx(VAULT, CHAIN)
    const p = { ...pending, to: tx.to, data: tx.data }
    render(
      <ProposalQueue
        queue={[p]}
        history={[]}
        isOwner={false}
        connectedAddress={A}
        chainId={CHAIN}
        vaultAddress={VAULT}
        onApprove={vi.fn()}
        onExecute={vi.fn()}
      />,
    )
    expect(screen.getByText(/^activate policy engine$/i)).toBeInTheDocument()
    expect(screen.getByText(/rules take effect when this executes/i)).toBeInTheDocument()
  })

  it('leaves ordinary and undecodable proposals rendering as before', () => {
    const ordinary = { ...pending, data: '0x' }
    const strange = { ...pending, safeTxHash: HASH2, to: GUARD, data: '0xdeadbeef' }
    render(
      <ProposalQueue
        queue={[ordinary, strange]}
        history={[]}
        isOwner
        connectedAddress={A}
        chainId={CHAIN}
        vaultAddress={VAULT}
        onApprove={vi.fn()}
        onExecute={vi.fn()}
      />,
    )
    expect(screen.queryByText(/policy change/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/activate policy engine/i)).not.toBeInTheDocument()
  })
})

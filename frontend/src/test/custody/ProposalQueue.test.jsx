// Spec 043 (US2) — queue: owner can approve pending / execute ready; view-only sees no actions (FR-016);
// approvals-remaining and history render.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import ProposalQueue from '../../components/custody/ProposalQueue'
import { STATUS } from '../../lib/custody/proposalStatus'

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

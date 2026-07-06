// Spec 043 (US2) — proposal status derivation (data-model.md state machine).

import { describe, it, expect } from 'vitest'
import { deriveProposalStatus, STATUS, isQueued, approvalsRemaining } from '../../lib/custody/proposalStatus'

describe('deriveProposalStatus', () => {
  const base = { approvals: 0, threshold: 2, currentNonce: 5, proposalNonce: 5 }

  it('is pending below threshold at the current nonce', () => {
    expect(deriveProposalStatus({ ...base, approvals: 1 })).toBe(STATUS.PENDING)
  })
  it('is ready at/above threshold at the current nonce', () => {
    expect(deriveProposalStatus({ ...base, approvals: 2 })).toBe(STATUS.READY)
    expect(deriveProposalStatus({ ...base, approvals: 3 })).toBe(STATUS.READY)
  })
  it('is executed/failed when the Safe emitted the outcome', () => {
    expect(deriveProposalStatus({ ...base, approvals: 2, executed: true })).toBe(STATUS.EXECUTED)
    expect(deriveProposalStatus({ ...base, approvals: 2, failed: true })).toBe(STATUS.FAILED)
  })
  it('is superseded when the proposal nonce is behind the current nonce', () => {
    expect(deriveProposalStatus({ ...base, approvals: 2, proposalNonce: 4 })).toBe(STATUS.SUPERSEDED)
  })
  it('is superseded when cancelled (but executed still wins)', () => {
    expect(deriveProposalStatus({ ...base, approvals: 2, cancelled: true })).toBe(STATUS.SUPERSEDED)
    expect(deriveProposalStatus({ ...base, approvals: 2, cancelled: true, executed: true })).toBe(STATUS.EXECUTED)
  })
  it('is pending (queued) when the proposal nonce is ahead of the current nonce', () => {
    expect(deriveProposalStatus({ ...base, approvals: 2, proposalNonce: 6 })).toBe(STATUS.PENDING)
  })
})

describe('helpers', () => {
  it('isQueued covers pending and ready only', () => {
    expect(isQueued(STATUS.PENDING)).toBe(true)
    expect(isQueued(STATUS.READY)).toBe(true)
    expect(isQueued(STATUS.EXECUTED)).toBe(false)
    expect(isQueued(STATUS.SUPERSEDED)).toBe(false)
  })
  it('approvalsRemaining never goes negative', () => {
    expect(approvalsRemaining(1, 3)).toBe(2)
    expect(approvalsRemaining(5, 3)).toBe(0)
  })
})

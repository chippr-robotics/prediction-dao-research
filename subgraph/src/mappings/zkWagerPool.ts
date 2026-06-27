import { BigInt } from '@graphprotocol/graph-ts'
import {
  Joined,
  JoiningClosedEvent,
  OutcomeProposed,
  Approved,
  OutcomeLocked,
  Claimed,
  PoolCancelled,
} from '../../generated/templates/ZKWagerPool/ZKWagerPool'
import { Pool, PoolJoin, PoolProposal, PoolVote, PoolPayout } from '../../generated/schema'

// Spec 034: per-pool indexing (dynamic data source). Privacy (FR-010): index commitments, nullifiers and
// payout shares only — never a nickname (derived client-side) or a wallet->vote link. The pool address is
// `dataSource.address()` — available via the event's `address`.

export function handleJoined(event: Joined): void {
  const poolId = event.address.toHexString()
  const join = new PoolJoin(poolId + '-' + event.params.identityCommitment.toString())
  join.pool = poolId
  join.identityCommitment = event.params.identityCommitment
  join.timestamp = event.block.timestamp
  join.txHash = event.transaction.hash
  join.save()

  const pool = Pool.load(poolId)
  if (pool != null) {
    pool.memberCount = pool.memberCount + 1
    pool.save()
  }
}

export function handleJoiningClosed(event: JoiningClosedEvent): void {
  const pool = Pool.load(event.address.toHexString())
  if (pool != null) {
    pool.state = 1 // JoiningClosed
    pool.save()
  }
}

export function handleOutcomeProposed(event: OutcomeProposed): void {
  const poolId = event.address.toHexString()
  const id = poolId + '-' + event.params.proposalId.toHexString()
  let proposal = PoolProposal.load(id)
  if (proposal == null) {
    proposal = new PoolProposal(id)
    proposal.pool = poolId
    proposal.proposalId = event.params.proposalId
    proposal.approvalCount = 0
    proposal.lockedAt = null
  }
  proposal.save()
}

export function handleApproved(event: Approved): void {
  const poolId = event.address.toHexString()

  const vote = new PoolVote(poolId + '-' + event.params.nullifier.toString())
  vote.pool = poolId
  vote.proposalId = event.params.proposalId
  vote.nullifier = event.params.nullifier
  vote.message = event.params.message
  vote.timestamp = event.block.timestamp
  vote.txHash = event.transaction.hash
  vote.save()

  const id = poolId + '-' + event.params.proposalId.toHexString()
  let proposal = PoolProposal.load(id)
  if (proposal == null) {
    proposal = new PoolProposal(id)
    proposal.pool = poolId
    proposal.proposalId = event.params.proposalId
    proposal.approvalCount = 0
    proposal.lockedAt = null
  }
  proposal.approvalCount = proposal.approvalCount + 1
  proposal.save()
}

export function handleOutcomeLocked(event: OutcomeLocked): void {
  const poolId = event.address.toHexString()
  const pool = Pool.load(poolId)
  if (pool != null) {
    pool.state = 2 // Resolved
    pool.lockedOutcome = event.params.proposalId
    pool.save()
  }
  const id = poolId + '-' + event.params.proposalId.toHexString()
  const proposal = PoolProposal.load(id)
  if (proposal != null) {
    proposal.lockedAt = event.block.timestamp
    proposal.save()
  }
}

export function handleClaimed(event: Claimed): void {
  const poolId = event.address.toHexString()
  const payout = new PoolPayout(poolId + '-' + event.params.shareRef.toHexString())
  payout.pool = poolId
  payout.shareRef = event.params.shareRef
  payout.recipient = event.params.recipient
  payout.amount = event.params.amount
  payout.timestamp = event.block.timestamp
  payout.txHash = event.transaction.hash
  payout.save()
}

export function handlePoolCancelled(event: PoolCancelled): void {
  const pool = Pool.load(event.address.toHexString())
  if (pool != null) {
    pool.state = 3 // Cancelled
    pool.save()
  }
}

// Silence unused import warnings for BigInt in builds where it isn't otherwise referenced.
export function _noop(): BigInt {
  return BigInt.zero()
}

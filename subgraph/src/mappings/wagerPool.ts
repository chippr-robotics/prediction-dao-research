import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts'
import {
  Joined,
  JoiningClosedEvent,
  OutcomeProposed,
  Approved,
  OutcomeLocked,
  Claimed,
  Refunded,
  PoolCancelled,
} from '../../generated/templates/WagerPool/WagerPool'
import {
  Pool,
  PoolMember,
  PoolProposal,
  PoolPayoutEntry,
  PoolApproval,
  PoolClaim,
  PoolRefund,
} from '../../generated/schema'

// Spec 034: per-pool indexing (dynamic data source, address-based redesign). Everything is PUBLIC and
// keyed by real wallet address — there is no anonymity primitive, nullifier or commitment. The winner's
// wallet address IS the claim code. Nicknames are client-side only (FR-009), so nothing rendered is
// stored. The pool address is `event.address` (== dataSource.address()). The mappings make no contract
// calls; all fields come from event params (and the Pool entity seeded by the factory handler).

function proposalKey(pool: string, proposalId: Bytes): string {
  return pool + '-' + proposalId.toHexString()
}

// A member joined by their public wallet (FR-006). Advance memberCount + accumulate gross escrow.
export function handleJoined(event: Joined): void {
  const poolId = event.address.toHexString()
  const pool = Pool.load(poolId)

  const id = poolId + '-' + event.params.member.toHexString()
  let m = PoolMember.load(id)
  if (m == null) {
    m = new PoolMember(id)
    m.pool = poolId
    m.member = event.params.member
    m.buyIn = pool != null ? pool.buyIn : BigInt.zero()
    m.joinedAt = event.block.timestamp
    m.joinedAtBlock = event.block.number
    m.joinTxHash = event.transaction.hash
    m.refunded = false
    m.refundedAt = null
    m.save()
  }

  if (pool != null) {
    pool.memberCount = pool.memberCount + 1
    pool.escrowTotal = pool.escrowTotal.plus(pool.buyIn)
    pool.save()
  }
}

// Joining closed (creator-initiated, auto-on-full, or via pokeDeadline). Freezes the approval denominator.
export function handleJoiningClosed(event: JoiningClosedEvent): void {
  const pool = Pool.load(event.address.toHexString())
  if (pool != null) {
    pool.state = 1 // JoiningClosed
    pool.frozenDenominator = event.params.frozenDenominator.toI32() // uint32 -> BigInt
    pool.save()
  }
}

// The creator proposed a payout matrix (winner -> amount). Store the full split as parallel arrays on
// the proposal AND as PoolPayoutEntry children so the resolved split is fully queryable on-chain-sourced.
export function handleOutcomeProposed(event: OutcomeProposed): void {
  const poolId = event.address.toHexString()
  const proposalId = event.params.proposalId
  const id = proposalKey(poolId, proposalId)

  const entries = event.params.entries

  const winners = new Array<Bytes>(entries.length)
  const amounts = new Array<BigInt>(entries.length)
  let total = BigInt.zero()
  for (let i = 0; i < entries.length; i++) {
    const winner = entries[i].winner
    const amount = entries[i].amount
    winners[i] = winner
    amounts[i] = amount
    total = total.plus(amount)

    const entryId = id + '-' + i.toString()
    const pe = new PoolPayoutEntry(entryId)
    pe.pool = poolId
    pe.proposal = id
    pe.index = i
    pe.winner = winner
    pe.amount = amount
    pe.save()
  }

  let proposal = PoolProposal.load(id)
  if (proposal == null) {
    proposal = new PoolProposal(id)
    proposal.pool = poolId
    proposal.proposalId = proposalId
    proposal.approvalCount = 0
    proposal.locked = false
    proposal.lockedAt = null
  }
  proposal.winners = winners
  proposal.amounts = amounts
  proposal.entryCount = entries.length
  proposal.totalPayout = total
  proposal.proposedAt = event.block.timestamp
  proposal.proposedTxHash = event.transaction.hash
  proposal.save()

  const pool = Pool.load(poolId)
  if (pool != null) {
    pool.currentProposalId = proposalId
    pool.save()
  }
}

// A member approved a proposed matrix (public wallet). Record it and bump the proposal's approval count.
export function handleApproved(event: Approved): void {
  const poolId = event.address.toHexString()
  const proposalId = event.params.proposalId
  const id = proposalKey(poolId, proposalId)

  const approvalId = id + '-' + event.params.member.toHexString()
  let a = PoolApproval.load(approvalId)
  if (a == null) {
    a = new PoolApproval(approvalId)
    a.pool = poolId
    a.proposal = id
    a.proposalId = proposalId
    a.member = event.params.member
    a.timestamp = event.block.timestamp
    a.txHash = event.transaction.hash
    a.save()

    let proposal = PoolProposal.load(id)
    if (proposal == null) {
      // Defensive: an Approved should follow its OutcomeProposed, but seed a stub if ordering surprises us.
      proposal = new PoolProposal(id)
      proposal.pool = poolId
      proposal.proposalId = proposalId
      proposal.winners = new Array<Bytes>(0)
      proposal.amounts = new Array<BigInt>(0)
      proposal.entryCount = 0
      proposal.totalPayout = BigInt.zero()
      proposal.approvalCount = 0
      proposal.locked = false
      proposal.proposedAt = event.block.timestamp
      proposal.proposedTxHash = event.transaction.hash
      proposal.lockedAt = null
    }
    proposal.approvalCount = proposal.approvalCount + 1
    proposal.save()
  }
}

// The proposal reached threshold and locked as the resolved outcome (FR-016). Pool -> Resolved.
export function handleOutcomeLocked(event: OutcomeLocked): void {
  const poolId = event.address.toHexString()
  const proposalId = event.params.proposalId

  const pool = Pool.load(poolId)
  if (pool != null) {
    pool.state = 2 // Resolved
    pool.lockedOutcome = proposalId
    pool.resolvedAt = event.block.timestamp
    pool.save()
  }

  const proposal = PoolProposal.load(proposalKey(poolId, proposalId))
  if (proposal != null) {
    proposal.locked = true
    proposal.lockedAt = event.block.timestamp
    proposal.save()
  }
}

// A winner claimed their share to a recipient address they chose (FR-018).
export function handleClaimed(event: Claimed): void {
  const poolId = event.address.toHexString()
  const c = new PoolClaim(event.transaction.hash.toHexString() + '-' + event.logIndex.toString())
  c.pool = poolId
  c.winner = event.params.winner
  c.recipient = event.params.recipient
  c.amount = event.params.amount
  c.timestamp = event.block.timestamp
  c.txHash = event.transaction.hash
  c.save()
}

// A member's buy-in was returned on the cancel / refund-only path (FR-019/FR-022).
export function handleRefunded(event: Refunded): void {
  const poolId = event.address.toHexString()
  const r = new PoolRefund(event.transaction.hash.toHexString() + '-' + event.logIndex.toString())
  r.pool = poolId
  r.member = event.params.member
  r.amount = event.params.amount
  r.timestamp = event.block.timestamp
  r.txHash = event.transaction.hash
  r.save()

  const m = PoolMember.load(poolId + '-' + event.params.member.toHexString())
  if (m != null) {
    m.refunded = true
    m.refundedAt = event.block.timestamp
    m.save()
  }
}

// Creator cancelled while joining was still open (FR-023). Pool -> Cancelled (members refund).
export function handlePoolCancelled(event: PoolCancelled): void {
  const pool = Pool.load(event.address.toHexString())
  if (pool != null) {
    pool.state = 3 // Cancelled
    pool.save()
  }
}

// Keep the Address import referenced (used by generated bindings' type inference in some builds).
export function _noop(): Address {
  return Address.zero()
}

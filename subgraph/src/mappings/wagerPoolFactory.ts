import { PoolCreated, TokenAllowed } from '../../generated/WagerPoolFactory/WagerPoolFactory'
import { WagerPool as PoolTemplate } from '../../generated/templates'
import { Pool, PoolAllowedToken } from '../../generated/schema'
import { BigInt } from '@graphprotocol/graph-ts'

// Spec 034 (Group Wager Pools, address-based redesign — the ZK/Semaphore design was removed).
// Index WagerPoolFactory.PoolCreated so pools can be discovered/listed without an eth_getLogs scan,
// and spin up a dynamic WagerPool data source to index each immutable ERC-1167 clone. Also index
// TokenAllowed so the create-pool flow can list allowlisted buy-in tokens. Network-scoped by
// deployment. Everything here is PUBLIC wallet-keyed; nicknames are client-side only (FR-009), so we
// store the language-independent integer word indices, never a rendered phrase. No contract calls.
export function handlePoolCreated(event: PoolCreated): void {
  const p = new Pool(event.params.pool.toHexString())
  p.poolId = event.params.poolId
  p.creator = event.params.creator
  p.token = event.params.token
  p.buyIn = event.params.buyIn
  p.maxMembers = event.params.maxMembers.toI32() // uint32 -> BigInt in graph-ts
  p.thresholdBips = event.params.thresholdBips // uint16 -> i32
  p.acceptDeadline = event.params.acceptDeadline // uint64 -> BigInt
  p.resolveDeadline = event.params.resolveDeadline

  const idx = event.params.wordIndices
  const words = new Array<i32>(idx.length)
  for (let i = 0; i < idx.length; i++) {
    words[i] = idx[i].toI32() // uint32 -> BigInt
  }
  p.wordIndices = words

  p.state = 0 // JoiningOpen
  p.memberCount = 0
  // frozenDenominator (nullable Int) is left unset until JoiningClosedEvent; assigning `null` to a
  // nullable numeric field triggers a spurious AS201 usize->i32 warning, so we intentionally omit it.
  p.escrowTotal = BigInt.zero()
  p.currentProposalId = null
  p.lockedOutcome = null
  p.resolvedAt = null
  p.createdAt = event.block.timestamp
  p.createdAtBlock = event.block.number
  p.createdTxHash = event.transaction.hash
  p.save()

  // Begin indexing this clone's events (joins, proposals, approvals, claims, refunds, lifecycle).
  PoolTemplate.create(event.params.pool)
}

// The factory's per-network buy-in-token allowlist (FR-024). Last write wins.
export function handleTokenAllowed(event: TokenAllowed): void {
  const id = event.params.token.toHexString()
  let t = PoolAllowedToken.load(id)
  if (t == null) {
    t = new PoolAllowedToken(id)
    t.token = event.params.token
  }
  t.allowed = event.params.allowed
  t.updatedAt = event.block.timestamp
  t.updatedTxHash = event.transaction.hash
  t.save()
}

import { PoolCreated } from '../../generated/ZKWagerPoolFactory/ZKWagerPoolFactory'
import { ZKWagerPool as PoolTemplate } from '../../generated/templates'
import { Pool } from '../../generated/schema'

// Spec 034 (ZK-Wager Pools): index ZKWagerPoolFactory.PoolCreated so pools can be discovered/listed
// without an eth_getLogs scan, and spin up a dynamic data source to index each pool clone. Network-scoped
// by deployment. Privacy: we store the pool's public config only — no nickname, no wallet->vote link.
export function handlePoolCreated(event: PoolCreated): void {
  const p = new Pool(event.params.pool.toHexString())
  p.poolId = event.params.poolId
  p.creator = event.params.creator
  p.token = event.params.token
  p.buyIn = event.params.buyIn
  p.maxMembers = event.params.maxMembers.toI32() // uint32 -> BigInt in graph-ts
  p.thresholdBips = event.params.thresholdBips // uint16 -> i32
  p.joinDeadline = event.params.joinDeadline

  const idx = event.params.wordIndices
  const words = new Array<i32>(idx.length)
  for (let i = 0; i < idx.length; i++) {
    words[i] = idx[i].toI32() // uint32 -> BigInt
  }
  p.wordIndices = words

  p.state = 0 // JoiningOpen
  p.memberCount = 0
  p.lockedOutcome = null
  p.createdAt = event.block.timestamp
  p.createdAtBlock = event.block.number
  p.createdTxHash = event.transaction.hash
  p.save()

  // Begin indexing this clone's events (joins, proposals, approvals, payouts).
  PoolTemplate.create(event.params.pool)
}

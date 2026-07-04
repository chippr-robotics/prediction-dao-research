import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  newMockEvent,
} from 'matchstick-as/assembly/index'
import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { PoolCreated, TokenAllowed } from '../generated/WagerPoolFactory/WagerPoolFactory'
import {
  Joined,
  JoiningClosedEvent,
  OutcomeProposed,
  Approved,
  OutcomeLocked,
  Claimed,
  Refunded,
  PoolCancelled,
} from '../generated/templates/WagerPool/WagerPool'
import { handlePoolCreated, handleTokenAllowed } from '../src/mappings/wagerPoolFactory'
import {
  handleJoined,
  handleJoiningClosed,
  handleOutcomeProposed,
  handleApproved,
  handleOutcomeLocked,
  handleClaimed,
  handleRefunded,
  handlePoolCancelled,
} from '../src/mappings/wagerPool'

// Spec 034 (Group Wager Pools, address-based redesign) — matchstick coverage for the pool factory +
// per-pool template mappings. The ZK/Semaphore design was removed: everything is PUBLIC and keyed by
// real wallet address (no nullifier/commitment, no anonymity). Nicknames are client-side only (FR-009),
// so only the language-independent integer word indices are indexed — never a rendered phrase.

const POOL = '0x00000000000000000000000000000000000000c1' // ERC-1167 clone address (Pool entity id)
const CREATOR = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x00000000000000000000000000000000000000a5' // USDC (network buy-in token)
const MEMBER_A = '0x2222222222222222222222222222222222222222'
const MEMBER_B = '0x3333333333333333333333333333333333333333'
const RECIPIENT = '0x4444444444444444444444444444444444444444'
const PROPOSAL = '0x00000000000000000000000000000000000000000000000000000000000000f0' // bytes32

const WORD_INDICES: Array<i32> = [12, 2047, 0, 873]
const BUY_IN = BigInt.fromI32(1000000) // 1 USDC (6 decimals)
const MAX_MEMBERS = 50
const THRESHOLD_BIPS = 6000 // 60%
const ACCEPT_DEADLINE = BigInt.fromI32(1893456000)
const RESOLVE_DEADLINE = BigInt.fromI32(1900000000)

// ---- mock event builders -------------------------------------------------

function poolCreated(poolId: i32): PoolCreated {
  const e = changetype<PoolCreated>(newMockEvent())
  e.parameters = new Array<ethereum.EventParam>()
  // Param order MUST match PoolCreated(uint256 poolId, address pool, address creator, uint32[4]
  //   wordIndices, address token, uint256 buyIn, uint32 maxMembers, uint16 thresholdBips,
  //   uint64 acceptDeadline, uint64 resolveDeadline).
  e.parameters.push(new ethereum.EventParam('poolId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(poolId))))
  e.parameters.push(new ethereum.EventParam('pool', ethereum.Value.fromAddress(Address.fromString(POOL))))
  e.parameters.push(new ethereum.EventParam('creator', ethereum.Value.fromAddress(Address.fromString(CREATOR))))
  e.parameters.push(new ethereum.EventParam('wordIndices', ethereum.Value.fromI32Array(WORD_INDICES)))
  e.parameters.push(new ethereum.EventParam('token', ethereum.Value.fromAddress(Address.fromString(TOKEN))))
  e.parameters.push(new ethereum.EventParam('buyIn', ethereum.Value.fromUnsignedBigInt(BUY_IN)))
  e.parameters.push(new ethereum.EventParam('maxMembers', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(MAX_MEMBERS))))
  e.parameters.push(new ethereum.EventParam('thresholdBips', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(THRESHOLD_BIPS))))
  e.parameters.push(new ethereum.EventParam('acceptDeadline', ethereum.Value.fromUnsignedBigInt(ACCEPT_DEADLINE)))
  e.parameters.push(new ethereum.EventParam('resolveDeadline', ethereum.Value.fromUnsignedBigInt(RESOLVE_DEADLINE)))
  return e
}

function tokenAllowed(token: string, allowed: boolean): TokenAllowed {
  const e = changetype<TokenAllowed>(newMockEvent())
  e.parameters = new Array<ethereum.EventParam>()
  e.parameters.push(new ethereum.EventParam('token', ethereum.Value.fromAddress(Address.fromString(token))))
  e.parameters.push(new ethereum.EventParam('allowed', ethereum.Value.fromBoolean(allowed)))
  return e
}

function joined(member: string): Joined {
  const e = changetype<Joined>(newMockEvent())
  e.address = Address.fromString(POOL)
  e.parameters = new Array<ethereum.EventParam>()
  e.parameters.push(new ethereum.EventParam('member', ethereum.Value.fromAddress(Address.fromString(member))))
  return e
}

function joiningClosed(frozenDenominator: i32): JoiningClosedEvent {
  const e = changetype<JoiningClosedEvent>(newMockEvent())
  e.address = Address.fromString(POOL)
  e.parameters = new Array<ethereum.EventParam>()
  e.parameters.push(new ethereum.EventParam('frozenDenominator', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(frozenDenominator))))
  return e
}

function outcomeProposed(winners: Array<string>, amounts: Array<BigInt>): OutcomeProposed {
  const e = changetype<OutcomeProposed>(newMockEvent())
  e.address = Address.fromString(POOL)
  e.parameters = new Array<ethereum.EventParam>()
  e.parameters.push(new ethereum.EventParam('proposalId', ethereum.Value.fromFixedBytes(Bytes.fromHexString(PROPOSAL))))
  const tuples = new Array<ethereum.Tuple>()
  for (let i = 0; i < winners.length; i++) {
    const t = new ethereum.Tuple()
    t.push(ethereum.Value.fromAddress(Address.fromString(winners[i])))
    t.push(ethereum.Value.fromUnsignedBigInt(amounts[i]))
    tuples.push(t)
  }
  e.parameters.push(new ethereum.EventParam('entries', ethereum.Value.fromTupleArray(tuples)))
  return e
}

function approved(member: string): Approved {
  const e = changetype<Approved>(newMockEvent())
  e.address = Address.fromString(POOL)
  e.parameters = new Array<ethereum.EventParam>()
  e.parameters.push(new ethereum.EventParam('proposalId', ethereum.Value.fromFixedBytes(Bytes.fromHexString(PROPOSAL))))
  e.parameters.push(new ethereum.EventParam('member', ethereum.Value.fromAddress(Address.fromString(member))))
  return e
}

function outcomeLocked(): OutcomeLocked {
  const e = changetype<OutcomeLocked>(newMockEvent())
  e.address = Address.fromString(POOL)
  e.parameters = new Array<ethereum.EventParam>()
  e.parameters.push(new ethereum.EventParam('proposalId', ethereum.Value.fromFixedBytes(Bytes.fromHexString(PROPOSAL))))
  return e
}

function claimed(winner: string, recipient: string, amount: BigInt, logIndex: i32): Claimed {
  const e = changetype<Claimed>(newMockEvent())
  e.address = Address.fromString(POOL)
  e.logIndex = BigInt.fromI32(logIndex)
  e.parameters = new Array<ethereum.EventParam>()
  e.parameters.push(new ethereum.EventParam('winner', ethereum.Value.fromAddress(Address.fromString(winner))))
  e.parameters.push(new ethereum.EventParam('recipient', ethereum.Value.fromAddress(Address.fromString(recipient))))
  e.parameters.push(new ethereum.EventParam('amount', ethereum.Value.fromUnsignedBigInt(amount)))
  return e
}

function refunded(member: string, amount: BigInt, logIndex: i32): Refunded {
  const e = changetype<Refunded>(newMockEvent())
  e.address = Address.fromString(POOL)
  e.logIndex = BigInt.fromI32(logIndex)
  e.parameters = new Array<ethereum.EventParam>()
  e.parameters.push(new ethereum.EventParam('member', ethereum.Value.fromAddress(Address.fromString(member))))
  e.parameters.push(new ethereum.EventParam('amount', ethereum.Value.fromUnsignedBigInt(amount)))
  return e
}

function poolCancelled(): PoolCancelled {
  const e = changetype<PoolCancelled>(newMockEvent())
  e.address = Address.fromString(POOL)
  e.parameters = new Array<ethereum.EventParam>()
  return e
}

// Seed the Pool entity the way the factory would (also spawns the WagerPool template).
function seedPool(): void {
  handlePoolCreated(poolCreated(1))
}

// ---- factory ------------------------------------------------------------

describe('WagerPoolFactory (spec 034)', () => {
  afterEach(() => {
    clearStore()
  })

  // matchstick (0.6.0) tracks dataSourceCount cumulatively for the whole file, so the count assertion
  // MUST be the first test (only point where it is a known 0). Do not reorder below other tests.
  test('handlePoolCreated instantiates the per-pool WagerPool template for the clone', () => {
    assert.dataSourceCount('WagerPool', 0)
    handlePoolCreated(poolCreated(2))
    assert.dataSourceCount('WagerPool', 1)
  })

  test('handlePoolCreated indexes a Pool with its public fields and JoiningOpen state', () => {
    handlePoolCreated(poolCreated(1))

    assert.entityCount('Pool', 1)
    assert.fieldEquals('Pool', POOL, 'poolId', '1')
    assert.fieldEquals('Pool', POOL, 'creator', CREATOR)
    assert.fieldEquals('Pool', POOL, 'token', TOKEN)
    assert.fieldEquals('Pool', POOL, 'buyIn', '1000000')
    assert.fieldEquals('Pool', POOL, 'maxMembers', '50')
    assert.fieldEquals('Pool', POOL, 'thresholdBips', '6000')
    assert.fieldEquals('Pool', POOL, 'acceptDeadline', '1893456000')
    assert.fieldEquals('Pool', POOL, 'resolveDeadline', '1900000000')
    // language-independent BIP-39 indices only — no rendered phrase/nickname text
    assert.fieldEquals('Pool', POOL, 'wordIndices', '[12, 2047, 0, 873]')
    assert.fieldEquals('Pool', POOL, 'state', '0') // JoiningOpen
    assert.fieldEquals('Pool', POOL, 'memberCount', '0')
    assert.fieldEquals('Pool', POOL, 'escrowTotal', '0')
    assert.fieldEquals('Pool', POOL, 'lockedOutcome', 'null')
    assert.fieldEquals('Pool', POOL, 'currentProposalId', 'null')
  })

  test('handleTokenAllowed upserts the PoolAllowedToken allowlist state', () => {
    handleTokenAllowed(tokenAllowed(TOKEN, true))
    assert.entityCount('PoolAllowedToken', 1)
    assert.fieldEquals('PoolAllowedToken', TOKEN, 'allowed', 'true')
    // last write wins
    handleTokenAllowed(tokenAllowed(TOKEN, false))
    assert.entityCount('PoolAllowedToken', 1)
    assert.fieldEquals('PoolAllowedToken', TOKEN, 'allowed', 'false')
  })
})

// ---- per-pool template ---------------------------------------------------

describe('WagerPool template (spec 034)', () => {
  afterEach(() => {
    clearStore()
  })

  test('handleJoined records a public-wallet PoolMember and advances count + escrow', () => {
    seedPool()
    handleJoined(joined(MEMBER_A))
    handleJoined(joined(MEMBER_B))

    assert.entityCount('PoolMember', 2)
    assert.fieldEquals('PoolMember', POOL + '-' + MEMBER_A, 'member', MEMBER_A)
    assert.fieldEquals('PoolMember', POOL + '-' + MEMBER_A, 'buyIn', '1000000')
    assert.fieldEquals('PoolMember', POOL + '-' + MEMBER_A, 'refunded', 'false')
    assert.fieldEquals('Pool', POOL, 'memberCount', '2')
    assert.fieldEquals('Pool', POOL, 'escrowTotal', '2000000') // 2 * buyIn
  })

  test('handleJoiningClosed advances state and freezes the denominator', () => {
    seedPool()
    handleJoined(joined(MEMBER_A))
    handleJoined(joined(MEMBER_B))
    handleJoiningClosed(joiningClosed(2))

    assert.fieldEquals('Pool', POOL, 'state', '1') // JoiningClosed
    assert.fieldEquals('Pool', POOL, 'frozenDenominator', '2')
  })

  test('handleOutcomeProposed stores the full payout matrix (arrays + child entries)', () => {
    seedPool()
    const winners = [MEMBER_A, MEMBER_B]
    const amounts = [BigInt.fromI32(1500000), BigInt.fromI32(500000)]
    handleOutcomeProposed(outcomeProposed(winners, amounts))

    const id = POOL + '-' + PROPOSAL
    assert.entityCount('PoolProposal', 1)
    assert.fieldEquals('PoolProposal', id, 'entryCount', '2')
    assert.fieldEquals('PoolProposal', id, 'totalPayout', '2000000')
    assert.fieldEquals('PoolProposal', id, 'approvalCount', '0')
    assert.fieldEquals('PoolProposal', id, 'locked', 'false')
    // Pool tracks the latest proposal
    assert.fieldEquals('Pool', POOL, 'currentProposalId', PROPOSAL)

    // per-winner child entries make the resolved split queryable on-chain-sourced
    assert.entityCount('PoolPayoutEntry', 2)
    assert.fieldEquals('PoolPayoutEntry', id + '-0', 'winner', MEMBER_A)
    assert.fieldEquals('PoolPayoutEntry', id + '-0', 'amount', '1500000')
    assert.fieldEquals('PoolPayoutEntry', id + '-1', 'winner', MEMBER_B)
    assert.fieldEquals('PoolPayoutEntry', id + '-1', 'amount', '500000')
  })

  test('handleApproved records public approvals and bumps the count (idempotent per member)', () => {
    seedPool()
    handleOutcomeProposed(outcomeProposed([MEMBER_A], [BigInt.fromI32(2000000)]))
    handleApproved(approved(MEMBER_A))
    handleApproved(approved(MEMBER_B))
    handleApproved(approved(MEMBER_A)) // duplicate — must not double-count

    const id = POOL + '-' + PROPOSAL
    assert.entityCount('PoolApproval', 2)
    assert.fieldEquals('PoolApproval', id + '-' + MEMBER_A, 'member', MEMBER_A)
    assert.fieldEquals('PoolProposal', id, 'approvalCount', '2')
  })

  test('handleOutcomeLocked resolves the pool and locks the proposal', () => {
    seedPool()
    handleOutcomeProposed(outcomeProposed([MEMBER_A], [BigInt.fromI32(2000000)]))
    handleOutcomeLocked(outcomeLocked())

    const id = POOL + '-' + PROPOSAL
    assert.fieldEquals('Pool', POOL, 'state', '2') // Resolved
    assert.fieldEquals('Pool', POOL, 'lockedOutcome', PROPOSAL)
    assert.fieldEquals('PoolProposal', id, 'locked', 'true')
  })

  test('handleClaimed records a settled winning share (winner, chosen recipient, amount)', () => {
    seedPool()
    const c = claimed(MEMBER_A, RECIPIENT, BigInt.fromI32(2000000), 7)
    handleClaimed(c)

    assert.entityCount('PoolClaim', 1)
    const cid = c.transaction.hash.toHexString() + '-' + c.logIndex.toString()
    assert.fieldEquals('PoolClaim', cid, 'winner', MEMBER_A)
    assert.fieldEquals('PoolClaim', cid, 'recipient', RECIPIENT)
    assert.fieldEquals('PoolClaim', cid, 'amount', '2000000')
  })

  test('handleRefunded records the refund and flips the member flag', () => {
    seedPool()
    handleJoined(joined(MEMBER_A))
    handleRefunded(refunded(MEMBER_A, BigInt.fromI32(1000000), 3))

    assert.entityCount('PoolRefund', 1)
    assert.fieldEquals('PoolMember', POOL + '-' + MEMBER_A, 'refunded', 'true')
  })

  test('handlePoolCancelled advances the pool to Cancelled', () => {
    seedPool()
    handlePoolCancelled(poolCancelled())
    assert.fieldEquals('Pool', POOL, 'state', '3') // Cancelled
  })
})

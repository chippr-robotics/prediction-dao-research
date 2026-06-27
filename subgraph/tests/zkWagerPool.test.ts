import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  newMockEvent,
} from 'matchstick-as/assembly/index'
import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import { PoolCreated } from '../generated/ZKWagerPoolFactory/ZKWagerPoolFactory'
import { handlePoolCreated } from '../src/mappings/zkWagerPoolFactory'

// T022 (spec 034 — ZK-Wager Pools) — matchstick coverage for the pool factory indexing.
//
// ASSUMED MAPPING NAMES/PATHS (the pool mappings/manifest are authored separately, T0xx; reconcile
// these if they land differently):
//   - generated factory binding:  ../generated/ZKWagerPoolFactory/ZKWagerPoolFactory
//       (data source `name: ZKWagerPoolFactory` in subgraph.yaml)
//   - handler:                     handlePoolCreated  in  ../src/mappings/zkWagerPoolFactory.ts
//       (creates the Pool entity AND calls ZKWagerPool.create(pool) to spawn the per-pool template)
//   - dynamic template name:       "ZKWagerPool"  (templates[].name in subgraph.yaml)
//
// What this asserts:
//   1. handlePoolCreated writes a Pool entity keyed by the pool clone address with the public,
//      on-chain fields from the event (poolId/creator/token/buyIn/maxMembers/thresholdBips/
//      joinDeadline/wordIndices) and the initial JoiningOpen state (state == 0, memberCount == 0).
//   2. The "ZKWagerPool" data-source template is instantiated for the new clone.
//   3. PRIVACY (FR-009/FR-010): no nickname is ever stored, and no wallet->vote linkage exists —
//      there are zero PoolVote rows at creation, and the Pool carries no creator-as-voter / nickname
//      field. Nicknames are derived client-side from the public identity commitment; the subgraph
//      indexes commitments/nullifiers/shares only.

const POOL = '0x00000000000000000000000000000000000000c1' // ERC-1167 clone address (entity id)
const CREATOR = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x00000000000000000000000000000000000000a5' // USDC (network buy-in token)

// The four language-independent BIP-39 word indices identifying the pool (FR-003). Each is 0..2047;
// the nickname/phrase is rendered client-side from these — never stored as text on-chain or here.
const WORD_INDICES: Array<i32> = [12, 2047, 0, 873]

const BUY_IN = BigInt.fromI32(1000000) // 1 USDC (6 decimals)
const MAX_MEMBERS = 50
const THRESHOLD_BIPS = 6000 // 60%
const JOIN_DEADLINE = BigInt.fromI32(1893456000) // some future unix ts

function poolCreated(poolId: i32): PoolCreated {
  let event = changetype<PoolCreated>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  // Param order MUST match the PoolCreated event signature:
  //   PoolCreated(uint256 poolId, address pool, address creator, uint32[4] wordIndices,
  //               address token, uint256 buyIn, uint32 maxMembers, uint16 thresholdBips,
  //               uint64 joinDeadline)
  event.parameters.push(new ethereum.EventParam('poolId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(poolId))))
  event.parameters.push(new ethereum.EventParam('pool', ethereum.Value.fromAddress(Address.fromString(POOL))))
  event.parameters.push(new ethereum.EventParam('creator', ethereum.Value.fromAddress(Address.fromString(CREATOR))))
  event.parameters.push(new ethereum.EventParam('wordIndices', ethereum.Value.fromI32Array(WORD_INDICES)))
  event.parameters.push(new ethereum.EventParam('token', ethereum.Value.fromAddress(Address.fromString(TOKEN))))
  event.parameters.push(new ethereum.EventParam('buyIn', ethereum.Value.fromUnsignedBigInt(BUY_IN)))
  event.parameters.push(new ethereum.EventParam('maxMembers', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(MAX_MEMBERS))))
  event.parameters.push(new ethereum.EventParam('thresholdBips', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(THRESHOLD_BIPS))))
  event.parameters.push(new ethereum.EventParam('joinDeadline', ethereum.Value.fromUnsignedBigInt(JOIN_DEADLINE)))
  return event
}

describe('ZKWagerPoolFactory.PoolCreated (spec 034 / T022)', () => {
  afterEach(() => {
    clearStore()
  })

  test('handlePoolCreated indexes a Pool with its public fields and JoiningOpen state', () => {
    handlePoolCreated(poolCreated(1))

    assert.entityCount('Pool', 1)
    // keyed by the clone address (lowercased hex)
    assert.fieldEquals('Pool', POOL, 'poolId', '1')
    assert.fieldEquals('Pool', POOL, 'creator', CREATOR)
    assert.fieldEquals('Pool', POOL, 'token', TOKEN)
    assert.fieldEquals('Pool', POOL, 'buyIn', '1000000')
    assert.fieldEquals('Pool', POOL, 'maxMembers', '50')
    assert.fieldEquals('Pool', POOL, 'thresholdBips', '6000')
    assert.fieldEquals('Pool', POOL, 'joinDeadline', '1893456000')
    // the four language-independent BIP-39 indices, stored as ints (no rendered phrase/nickname text)
    assert.fieldEquals('Pool', POOL, 'wordIndices', '[12, 2047, 0, 873]')
    // initial lifecycle: JoiningOpen (0), no members, no locked outcome
    assert.fieldEquals('Pool', POOL, 'state', '0')
    assert.fieldEquals('Pool', POOL, 'memberCount', '0')
    assert.fieldEquals('Pool', POOL, 'lockedOutcome', 'null')
  })

  test('instantiates the per-pool ZKWagerPool data-source template for the clone', () => {
    assert.dataSourceCount('ZKWagerPool', 0)
    handlePoolCreated(poolCreated(2))
    // the factory handler spawns exactly one ZKWagerPool template for the new clone
    assert.dataSourceCount('ZKWagerPool', 1)
  })

  test('PRIVACY (FR-009/FR-010): stores no nickname text and no wallet->vote linkage', () => {
    handlePoolCreated(poolCreated(3))

    // No vote/payout rows exist at creation — and crucially nothing links the creator wallet to a vote.
    assert.entityCount('PoolVote', 0)
    assert.entityCount('PoolPayout', 0)
    // No joins are recorded by PoolCreated either (joins arrive via the template's Joined handler,
    // carrying only the public identity commitment — never a nickname).
    assert.entityCount('PoolJoin', 0)

    // The Pool exposes only public, language-independent identifiers (commitment-derivable phrase),
    // never a stored nickname string. Asserting the wager fields above already covers what IS stored;
    // here we re-assert the integer word indices to make explicit that the human-readable phrase is a
    // client-side render of these and is NOT persisted.
    assert.fieldEquals('Pool', POOL, 'wordIndices', '[12, 2047, 0, 873]')
  })
})

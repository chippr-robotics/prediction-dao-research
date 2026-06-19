import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  newMockEvent,
} from 'matchstick-as/assembly/index'
import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import {
  WagerCreated,
  WagerAccepted,
  PayoutClaimed,
  WagerRefunded,
  WagerDrawn,
  WagerCancelled,
  WagerResolved,
  WagerDeclined,
} from '../generated/WagerRegistry/WagerRegistry'
import {
  handleWagerCreated,
  handleWagerAccepted,
  handlePayoutClaimed,
  handleWagerRefunded,
  handleWagerDrawn,
  handleWagerCancelled,
  handleWagerResolved,
  handleWagerDeclined,
} from '../src/mappings/wagerRegistry'

const CREATOR = Address.fromString('0x1111111111111111111111111111111111111111')
const OPPONENT = Address.fromString('0x2222222222222222222222222222222222222222')
const TOKEN = Address.fromString('0x3333333333333333333333333333333333333333')
const CREATOR_STAKE = BigInt.fromI32(1000)
const OPPONENT_STAKE = BigInt.fromI32(2000)

function transferId(event: ethereum.Event, party: Address): string {
  return (
    event.transaction.hash.toHexString() +
    '-' +
    event.logIndex.toString() +
    '-' +
    party.toHexString()
  )
}

function created(wagerId: i32): WagerCreated {
  let event = changetype<WagerCreated>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('wagerId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(wagerId))))
  event.parameters.push(new ethereum.EventParam('creator', ethereum.Value.fromAddress(CREATOR)))
  event.parameters.push(new ethereum.EventParam('opponent', ethereum.Value.fromAddress(OPPONENT)))
  event.parameters.push(new ethereum.EventParam('token', ethereum.Value.fromAddress(TOKEN)))
  event.parameters.push(new ethereum.EventParam('creatorStake', ethereum.Value.fromUnsignedBigInt(CREATOR_STAKE)))
  event.parameters.push(new ethereum.EventParam('opponentStake', ethereum.Value.fromUnsignedBigInt(OPPONENT_STAKE)))
  event.parameters.push(new ethereum.EventParam('resolutionType', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(0))))
  event.parameters.push(new ethereum.EventParam('metadataHash', ethereum.Value.fromFixedBytes(Bytes.fromI32(7))))
  event.parameters.push(new ethereum.EventParam('metadataUri', ethereum.Value.fromString('ipfs://cid')))
  return event
}

function accepted(wagerId: i32): WagerAccepted {
  let event = changetype<WagerAccepted>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('wagerId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(wagerId))))
  event.parameters.push(new ethereum.EventParam('opponent', ethereum.Value.fromAddress(OPPONENT)))
  return event
}

function payout(wagerId: i32, winner: Address, amount: BigInt): PayoutClaimed {
  let event = changetype<PayoutClaimed>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('wagerId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(wagerId))))
  event.parameters.push(new ethereum.EventParam('winner', ethereum.Value.fromAddress(winner)))
  event.parameters.push(new ethereum.EventParam('amount', ethereum.Value.fromUnsignedBigInt(amount)))
  return event
}

function refunded(wagerId: i32): WagerRefunded {
  let event = changetype<WagerRefunded>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('wagerId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(wagerId))))
  event.parameters.push(new ethereum.EventParam('creator', ethereum.Value.fromAddress(CREATOR)))
  event.parameters.push(new ethereum.EventParam('opponent', ethereum.Value.fromAddress(OPPONENT)))
  return event
}

function drawn(wagerId: i32): WagerDrawn {
  let event = changetype<WagerDrawn>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('wagerId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(wagerId))))
  event.parameters.push(new ethereum.EventParam('creator', ethereum.Value.fromAddress(CREATOR)))
  event.parameters.push(new ethereum.EventParam('opponent', ethereum.Value.fromAddress(OPPONENT)))
  event.parameters.push(new ethereum.EventParam('by', ethereum.Value.fromAddress(CREATOR)))
  return event
}

function cancelled(wagerId: i32): WagerCancelled {
  let event = changetype<WagerCancelled>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('wagerId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(wagerId))))
  return event
}

function resolved(wagerId: i32, winner: Address): WagerResolved {
  let event = changetype<WagerResolved>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('wagerId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(wagerId))))
  event.parameters.push(new ethereum.EventParam('winner', ethereum.Value.fromAddress(winner)))
  event.parameters.push(new ethereum.EventParam('by', ethereum.Value.fromAddress(CREATOR)))
  return event
}

function declined(wagerId: i32): WagerDeclined {
  let event = changetype<WagerDeclined>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('wagerId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(wagerId))))
  event.parameters.push(new ethereum.EventParam('opponent', ethereum.Value.fromAddress(OPPONENT)))
  return event
}

// ---------------------------------------------------------------------------
// US1 — Wager identity + lifecycle status
// ---------------------------------------------------------------------------
describe('US1: Wager indexing', () => {
  afterEach(() => {
    clearStore()
  })

  test('WagerCreated stores v2 fields and status open', () => {
    handleWagerCreated(created(1))
    assert.fieldEquals('Wager', '1', 'creator', CREATOR.toHexString())
    assert.fieldEquals('Wager', '1', 'opponent', OPPONENT.toHexString())
    assert.fieldEquals('Wager', '1', 'token', TOKEN.toHexString())
    assert.fieldEquals('Wager', '1', 'creatorStake', '1000')
    assert.fieldEquals('Wager', '1', 'opponentStake', '2000')
    assert.fieldEquals('Wager', '1', 'resolutionType', '0')
    assert.fieldEquals('Wager', '1', 'status', 'open')
  })

  test('status transitions: accepted -> active, resolved sets winner/resolvedAt', () => {
    handleWagerCreated(created(2))
    handleWagerAccepted(accepted(2))
    assert.fieldEquals('Wager', '2', 'status', 'active')
    handleWagerResolved(resolved(2, CREATOR))
    assert.fieldEquals('Wager', '2', 'status', 'resolved')
    assert.fieldEquals('Wager', '2', 'winner', CREATOR.toHexString())
  })

  test('terminal statuses: refunded / drawn / cancelled / declined', () => {
    handleWagerCreated(created(3))
    handleWagerRefunded(refunded(3))
    assert.fieldEquals('Wager', '3', 'status', 'refunded')

    handleWagerCreated(created(4))
    handleWagerDrawn(drawn(4))
    assert.fieldEquals('Wager', '4', 'status', 'drawn')

    handleWagerCreated(created(5))
    handleWagerCancelled(cancelled(5))
    assert.fieldEquals('Wager', '5', 'status', 'cancelled')

    handleWagerCreated(created(6))
    handleWagerDeclined(declined(6))
    assert.fieldEquals('Wager', '6', 'status', 'declined')
  })
})

// ---------------------------------------------------------------------------
// US2 — Per-transfer records with transaction hashes
// ---------------------------------------------------------------------------
describe('US2: WagerTransfer records', () => {
  afterEach(() => {
    clearStore()
  })

  test('WagerCreated emits a creator deposit row (party -> escrow)', () => {
    let event = created(10)
    handleWagerCreated(event)
    let id = transferId(event, CREATOR)
    assert.entityCount('WagerTransfer', 1)
    assert.fieldEquals('WagerTransfer', id, 'direction', 'deposit')
    assert.fieldEquals('WagerTransfer', id, 'party', CREATOR.toHexString())
    assert.fieldEquals('WagerTransfer', id, 'amount', '1000')
    assert.fieldEquals('WagerTransfer', id, 'from', CREATOR.toHexString())
    assert.fieldEquals('WagerTransfer', id, 'to', event.address.toHexString())
    assert.fieldEquals('WagerTransfer', id, 'txHash', event.transaction.hash.toHexString())
  })

  test('WagerAccepted emits an opponent deposit using the stored opponentStake', () => {
    handleWagerCreated(created(11))
    let event = accepted(11)
    handleWagerAccepted(event)
    let id = transferId(event, OPPONENT)
    assert.fieldEquals('WagerTransfer', id, 'direction', 'deposit')
    assert.fieldEquals('WagerTransfer', id, 'party', OPPONENT.toHexString())
    assert.fieldEquals('WagerTransfer', id, 'amount', '2000')
    assert.fieldEquals('WagerTransfer', id, 'to', event.address.toHexString())
  })

  test('PayoutClaimed emits a payout row (escrow -> winner) with the event amount', () => {
    handleWagerCreated(created(12))
    handleWagerAccepted(accepted(12))
    let event = payout(12, CREATOR, BigInt.fromI32(2900))
    handlePayoutClaimed(event)
    let id = transferId(event, CREATOR)
    assert.fieldEquals('WagerTransfer', id, 'direction', 'payout')
    assert.fieldEquals('WagerTransfer', id, 'amount', '2900')
    assert.fieldEquals('WagerTransfer', id, 'from', event.address.toHexString())
    assert.fieldEquals('WagerTransfer', id, 'to', CREATOR.toHexString())
  })

  test('WagerRefunded emits TWO refund rows (one per party) with distinct ids', () => {
    handleWagerCreated(created(13))
    let event = refunded(13)
    handleWagerRefunded(event)
    assert.entityCount('WagerTransfer', 2)
    let creatorId = transferId(event, CREATOR)
    let opponentId = transferId(event, OPPONENT)
    assert.assertTrue(creatorId != opponentId)
    assert.fieldEquals('WagerTransfer', creatorId, 'direction', 'refund')
    assert.fieldEquals('WagerTransfer', creatorId, 'amount', '1000')
    assert.fieldEquals('WagerTransfer', creatorId, 'to', CREATOR.toHexString())
    assert.fieldEquals('WagerTransfer', opponentId, 'amount', '2000')
    assert.fieldEquals('WagerTransfer', opponentId, 'to', OPPONENT.toHexString())
  })

  test('WagerDrawn emits two refund rows; WagerCancelled emits one (creator only)', () => {
    handleWagerCreated(created(14))
    handleWagerDrawn(drawn(14))
    assert.entityCount('WagerTransfer', 2)
    clearStore()

    handleWagerCreated(created(15))
    let event = cancelled(15)
    handleWagerCancelled(event)
    assert.entityCount('WagerTransfer', 1)
    let id = transferId(event, CREATOR)
    assert.fieldEquals('WagerTransfer', id, 'direction', 'refund')
    assert.fieldEquals('WagerTransfer', id, 'amount', '1000')
  })

  test('WagerDeclined emits one refund row (creator only) for the returned stake', () => {
    handleWagerCreated(created(16))
    // One deposit row from creation so far.
    assert.entityCount('WagerTransfer', 1)
    let event = declined(16)
    // The decline happens in a different transaction than creation; give it a
    // distinct hash so the refund row doesn't share the deposit's transfer id
    // (newMockEvent reuses one default txHash/logIndex across mock events).
    event.transaction.hash = Bytes.fromHexString(
      '0x00000000000000000000000000000000000000000000000000000000deadbeef',
    )
    handleWagerDeclined(event)
    // Decline refunds the creator their stake — a second (refund) row.
    assert.entityCount('WagerTransfer', 2)
    let id = transferId(event, CREATOR)
    assert.fieldEquals('WagerTransfer', id, 'direction', 'refund')
    assert.fieldEquals('WagerTransfer', id, 'party', CREATOR.toHexString())
    assert.fieldEquals('WagerTransfer', id, 'amount', '1000')
    assert.fieldEquals('WagerTransfer', id, 'from', event.address.toHexString())
    assert.fieldEquals('WagerTransfer', id, 'to', CREATOR.toHexString())
  })
})

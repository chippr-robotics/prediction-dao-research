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
  OpenWagerCreated,
  WagerAccepted,
} from '../generated/WagerRegistry/WagerRegistry'
import {
  handleOpenWagerCreated,
  handleWagerAccepted,
} from '../src/mappings/wagerRegistry'

// T027 (feature 024) — matchstick coverage for the open-challenge discovery indexing:
//   handleOpenWagerCreated writes a Wager with opponent == 0x0 / status == "open" (no named opponent), and the
//   existing handleWagerAccepted backfills opponent (and flips to "active") when the challenge is taken.
// (The `opponent` field is non-nullable, so an unbound open challenge is `status == open && opponent == 0x0`.)

const CREATOR = Address.fromString('0x1111111111111111111111111111111111111111')
const TAKER = Address.fromString('0x2222222222222222222222222222222222222222')
const CLAIM_AUTHORITY = Address.fromString('0x9999999999999999999999999999999999999999')
const TOKEN = Address.fromString('0x3333333333333333333333333333333333333333')
const ZERO = Address.zero()
const STAKE = BigInt.fromI32(10000)

function openCreated(wagerId: i32): OpenWagerCreated {
  let event = changetype<OpenWagerCreated>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  // Param order MUST match the OpenWagerCreated event signature.
  event.parameters.push(new ethereum.EventParam('wagerId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(wagerId))))
  event.parameters.push(new ethereum.EventParam('creator', ethereum.Value.fromAddress(CREATOR)))
  event.parameters.push(new ethereum.EventParam('claimAuthority', ethereum.Value.fromAddress(CLAIM_AUTHORITY)))
  event.parameters.push(new ethereum.EventParam('token', ethereum.Value.fromAddress(TOKEN)))
  event.parameters.push(new ethereum.EventParam('stake', ethereum.Value.fromUnsignedBigInt(STAKE)))
  event.parameters.push(new ethereum.EventParam('resolutionType', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(0))))
  event.parameters.push(new ethereum.EventParam('metadataHash', ethereum.Value.fromFixedBytes(Bytes.fromHexString('0xabcd'.padEnd(66, '0')) as Bytes)))
  event.parameters.push(new ethereum.EventParam('metadataUri', ethereum.Value.fromString('ipfs://bafyOpen')))
  return event
}

function accepted(wagerId: i32, opponent: Address): WagerAccepted {
  let event = changetype<WagerAccepted>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('wagerId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(wagerId))))
  event.parameters.push(new ethereum.EventParam('opponent', ethereum.Value.fromAddress(opponent)))
  return event
}

describe('open challenges (024) — discovery indexing', () => {
  afterEach(() => {
    clearStore()
  })

  test('handleOpenWagerCreated indexes opponent == 0x0 and status == open with equal stakes', () => {
    handleOpenWagerCreated(openCreated(1))

    assert.entityCount('Wager', 1)
    assert.fieldEquals('Wager', '1', 'creator', CREATOR.toHexString())
    assert.fieldEquals('Wager', '1', 'opponent', ZERO.toHexString()) // no named opponent yet
    assert.fieldEquals('Wager', '1', 'token', TOKEN.toHexString())
    assert.fieldEquals('Wager', '1', 'creatorStake', '10000')
    assert.fieldEquals('Wager', '1', 'opponentStake', '10000') // equal stakes (single `stake`)
    assert.fieldEquals('Wager', '1', 'status', 'open')
  })

  test('handleWagerAccepted backfills the opponent and flips status to active', () => {
    handleOpenWagerCreated(openCreated(2))
    assert.fieldEquals('Wager', '2', 'opponent', ZERO.toHexString())

    handleWagerAccepted(accepted(2, TAKER))

    assert.fieldEquals('Wager', '2', 'opponent', TAKER.toHexString()) // backfilled on accept
    assert.fieldEquals('Wager', '2', 'status', 'active')
  })
})

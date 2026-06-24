import { assert, describe, test, clearStore, afterEach, newMockEvent } from 'matchstick-as/assembly/index'
import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import { Transfer, Paused, Frozen } from '../generated/templates/TokenInstance/TokenInstance'
import { handleTransfer, handlePaused, handleFrozen } from '../src/mappings/token'

// Spec 028 expansion (US10/US12): the per-token TokenInstance mapping — Transfer builds Holder balances + a
// mint/transfer/burn activity; admin events build activity rows.

const TOKEN = '0x00000000000000000000000000000000000000aa'
const ALICE = '0x00000000000000000000000000000000000000a1'
const BOB = '0x00000000000000000000000000000000000000b2'
const ZERO = '0x0000000000000000000000000000000000000000'

function hid(account: string): string {
  return TOKEN + '-' + account
}

function transferEvent(from: string, to: string, value: i32, logIndex: i32): Transfer {
  const e = changetype<Transfer>(newMockEvent())
  e.address = Address.fromString(TOKEN)
  e.logIndex = BigInt.fromI32(logIndex)
  e.parameters = new Array<ethereum.EventParam>()
  e.parameters.push(new ethereum.EventParam('from', ethereum.Value.fromAddress(Address.fromString(from))))
  e.parameters.push(new ethereum.EventParam('to', ethereum.Value.fromAddress(Address.fromString(to))))
  e.parameters.push(new ethereum.EventParam('value', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(value))))
  return e
}

describe('TokenInstance mapping (spec 028 / US10-US12)', () => {
  afterEach(() => {
    clearStore()
  })

  test('Transfer builds holder balances + mint/transfer/burn activity', () => {
    handleTransfer(transferEvent(ZERO, ALICE, 1000, 1)) // mint
    handleTransfer(transferEvent(ALICE, BOB, 400, 2)) // transfer
    handleTransfer(transferEvent(BOB, ZERO, 100, 3)) // burn

    assert.fieldEquals('Holder', hid(ALICE), 'balance', '600')
    assert.fieldEquals('Holder', hid(BOB), 'balance', '300')
    // zero address is never a holder
    assert.notInStore('Holder', hid(ZERO))
    assert.entityCount('TokenActivity', 3)
  })

  test('Paused + Frozen build admin activity', () => {
    const p = changetype<Paused>(newMockEvent())
    p.address = Address.fromString(TOKEN)
    p.logIndex = BigInt.fromI32(1)
    p.parameters = new Array<ethereum.EventParam>()
    p.parameters.push(new ethereum.EventParam('account', ethereum.Value.fromAddress(Address.fromString(ALICE))))
    handlePaused(p)

    const f = changetype<Frozen>(newMockEvent())
    f.address = Address.fromString(TOKEN)
    f.logIndex = BigInt.fromI32(2)
    f.parameters = new Array<ethereum.EventParam>()
    f.parameters.push(new ethereum.EventParam('account', ethereum.Value.fromAddress(Address.fromString(BOB))))
    f.parameters.push(new ethereum.EventParam('frozen', ethereum.Value.fromBoolean(true)))
    handleFrozen(f)

    assert.entityCount('TokenActivity', 2)
  })
})

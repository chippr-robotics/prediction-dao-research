import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  newMockEvent,
} from 'matchstick-as/assembly/index'
import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import { TokenCreated } from '../generated/TokenFactory/TokenFactory'
import { handleTokenCreated } from '../src/mappings/tokenFactory'

const TOKEN = '0x00000000000000000000000000000000000000aa'
const ISSUER = '0x00000000000000000000000000000000000000bb'

function tokenCreated(id: i32, standard: i32, token: string, issuer: string, name: string, symbol: string): TokenCreated {
  let event = changetype<TokenCreated>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('id', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(id))))
  event.parameters.push(new ethereum.EventParam('standard', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(standard))))
  event.parameters.push(new ethereum.EventParam('token', ethereum.Value.fromAddress(Address.fromString(token))))
  event.parameters.push(new ethereum.EventParam('issuer', ethereum.Value.fromAddress(Address.fromString(issuer))))
  event.parameters.push(new ethereum.EventParam('name', ethereum.Value.fromString(name)))
  event.parameters.push(new ethereum.EventParam('symbol', ethereum.Value.fromString(symbol)))
  return event
}

describe('TokenFactory.TokenCreated (spec 028 / issue #761)', () => {
  afterEach(() => {
    clearStore()
  })

  test('indexes a created token by address with its standard + metadata', () => {
    handleTokenCreated(tokenCreated(1, 2, TOKEN, ISSUER, 'Acme', 'ACME'))

    assert.entityCount('Token', 1)
    assert.fieldEquals('Token', TOKEN, 'registryId', '1')
    assert.fieldEquals('Token', TOKEN, 'standard', '2') // RESTRICTED_ERC1404
    assert.fieldEquals('Token', TOKEN, 'tokenAddress', TOKEN)
    assert.fieldEquals('Token', TOKEN, 'issuer', ISSUER)
    assert.fieldEquals('Token', TOKEN, 'name', 'Acme')
    assert.fieldEquals('Token', TOKEN, 'symbol', 'ACME')
  })

  test('records each standard distinctly', () => {
    handleTokenCreated(tokenCreated(1, 0, '0x00000000000000000000000000000000000000a1', ISSUER, 'Fungible', 'FUN'))
    handleTokenCreated(tokenCreated(2, 1, '0x00000000000000000000000000000000000000a2', ISSUER, 'Collectible', 'COL'))
    assert.entityCount('Token', 2)
    assert.fieldEquals('Token', '0x00000000000000000000000000000000000000a1', 'standard', '0')
    assert.fieldEquals('Token', '0x00000000000000000000000000000000000000a2', 'standard', '1')
  })
})

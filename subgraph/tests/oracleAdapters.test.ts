import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  newMockEvent,
} from 'matchstick-as/assembly/index'
import { BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import {
  ConditionRegistered,
  MarketLinked,
  ConditionResolved,
} from '../generated/ChainlinkDataFeedOracleAdapter/ChainlinkDataFeedOracleAdapter'
import {
  handleDataFeedConditionRegistered,
  handleDataFeedMarketLinked,
  handleDataFeedConditionResolved,
} from '../src/mappings/oracleAdapters'

// 32-byte condition id used across the cases.
const COND = Bytes.fromHexString('0x00000000000000000000000000000000000000000000000000000000000000aa')
const ID = 'chainlinkDataFeed-' + COND.toHexString()

function registered(desc: string, ert: i32): ConditionRegistered {
  let event = changetype<ConditionRegistered>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('conditionId', ethereum.Value.fromFixedBytes(COND)))
  event.parameters.push(new ethereum.EventParam('description', ethereum.Value.fromString(desc)))
  event.parameters.push(new ethereum.EventParam('expectedResolutionTime', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(ert))))
  return event
}

function linked(marketId: i32): MarketLinked {
  let event = changetype<MarketLinked>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('friendMarketId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(marketId))))
  event.parameters.push(new ethereum.EventParam('conditionId', ethereum.Value.fromFixedBytes(COND)))
  return event
}

function resolved(outcome: boolean, confidence: i32, resolvedAt: i32): ConditionResolved {
  let event = changetype<ConditionResolved>(newMockEvent())
  event.parameters = new Array<ethereum.EventParam>()
  event.parameters.push(new ethereum.EventParam('conditionId', ethereum.Value.fromFixedBytes(COND)))
  event.parameters.push(new ethereum.EventParam('outcome', ethereum.Value.fromBoolean(outcome)))
  event.parameters.push(new ethereum.EventParam('confidence', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(confidence))))
  event.parameters.push(new ethereum.EventParam('resolvedAt', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(resolvedAt))))
  return event
}

describe('oracle adapter conditions (issue #751)', () => {
  afterEach(() => {
    clearStore()
  })

  test('ConditionRegistered creates an OracleCondition', () => {
    handleDataFeedConditionRegistered(registered('', 1000))
    assert.entityCount('OracleCondition', 1)
    assert.fieldEquals('OracleCondition', ID, 'adapter', 'chainlinkDataFeed')
    assert.fieldEquals('OracleCondition', ID, 'conditionId', COND.toHexString())
    assert.fieldEquals('OracleCondition', ID, 'expectedResolutionTime', '1000')
    assert.fieldEquals('OracleCondition', ID, 'resolved', 'false')
  })

  test('MarketLinked records a link and ensures the condition exists', () => {
    handleDataFeedMarketLinked(linked(42))
    assert.entityCount('OracleMarketLink', 1)
    // The condition is ensured even though registration was not replayed here.
    assert.entityCount('OracleCondition', 1)
  })

  test('ConditionResolved marks the condition resolved with its outcome', () => {
    handleDataFeedConditionRegistered(registered('', 0))
    handleDataFeedConditionResolved(resolved(true, 10000, 12345))
    assert.fieldEquals('OracleCondition', ID, 'resolved', 'true')
    assert.fieldEquals('OracleCondition', ID, 'outcome', 'true')
    assert.fieldEquals('OracleCondition', ID, 'confidence', '10000')
    assert.fieldEquals('OracleCondition', ID, 'resolvedAt', '12345')
  })
})

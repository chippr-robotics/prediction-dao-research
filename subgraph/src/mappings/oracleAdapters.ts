import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { OracleCondition, OracleMarketLink } from '../../generated/schema'

// The three adapters emit identical ConditionRegistered / MarketLinked /
// ConditionResolved signatures (declared on IOracleAdapter), but codegen emits a
// separate typed module per data source, so we alias the imports and delegate to
// shared helpers. Mappings make no contract calls — a handler can never revert.
import {
  ConditionRegistered as DataFeedConditionRegistered,
  MarketLinked as DataFeedMarketLinked,
  ConditionResolved as DataFeedConditionResolved,
} from '../../generated/ChainlinkDataFeedOracleAdapter/ChainlinkDataFeedOracleAdapter'
import {
  ConditionRegistered as FunctionsConditionRegistered,
  MarketLinked as FunctionsMarketLinked,
  ConditionResolved as FunctionsConditionResolved,
} from '../../generated/ChainlinkFunctionsOracleAdapter/ChainlinkFunctionsOracleAdapter'
import {
  ConditionRegistered as UmaConditionRegistered,
  MarketLinked as UmaMarketLinked,
  ConditionResolved as UmaConditionResolved,
} from '../../generated/UMAOptimisticOracleV3Adapter/UMAOptimisticOracleV3Adapter'

// Schema enum (OracleAdapterType) string values.
const ADAPTER_DATAFEED = 'chainlinkDataFeed'
const ADAPTER_FUNCTIONS = 'chainlinkFunctions'
const ADAPTER_UMA = 'uma'

// A conditionId could in principle be reused across adapters, so key by both.
function conditionKey(adapter: string, conditionId: Bytes): string {
  return adapter + '-' + conditionId.toHexString()
}

// Create a minimal condition row if we somehow see a link/resolve before the
// registration (on-chain, registerCondition precedes both — but indexing must
// never assume event ordering). Returns the loaded-or-created entity.
function ensureCondition(
  adapter: string,
  adapterAddress: Address,
  conditionId: Bytes,
  event: ethereum.Event
): OracleCondition {
  const id = conditionKey(adapter, conditionId)
  let c = OracleCondition.load(id)
  if (c == null) {
    c = new OracleCondition(id)
    c.adapter = adapter
    c.conditionId = conditionId
    c.adapterAddress = adapterAddress
    c.description = ''
    c.expectedResolutionTime = BigInt.fromI32(0)
    c.resolved = false
    c.registeredAt = event.block.timestamp
    c.registeredTxHash = event.transaction.hash
    c.save()
  }
  return c
}

// ConditionRegistered → upsert (idempotent if the adapter ever re-registers).
function registerCondition(
  adapter: string,
  adapterAddress: Address,
  conditionId: Bytes,
  description: string,
  expectedResolutionTime: BigInt,
  event: ethereum.Event
): void {
  const id = conditionKey(adapter, conditionId)
  let c = OracleCondition.load(id)
  if (c == null) {
    c = new OracleCondition(id)
    c.adapter = adapter
    c.conditionId = conditionId
    c.resolved = false
    c.registeredAt = event.block.timestamp
    c.registeredTxHash = event.transaction.hash
  }
  c.adapterAddress = adapterAddress
  c.description = description
  c.expectedResolutionTime = expectedResolutionTime
  c.save()
}

// MarketLinked → one immutable OracleMarketLink per event.
function linkMarket(
  adapter: string,
  adapterAddress: Address,
  marketId: BigInt,
  conditionId: Bytes,
  event: ethereum.Event
): void {
  ensureCondition(adapter, adapterAddress, conditionId, event)
  const id = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  const link = new OracleMarketLink(id)
  link.condition = conditionKey(adapter, conditionId)
  link.marketId = marketId
  link.conditionId = conditionId
  link.adapter = adapter
  link.linkedAt = event.block.timestamp
  link.linkedTxHash = event.transaction.hash
  link.save()
}

// ConditionResolved → flip the condition to resolved with its outcome.
function resolveCondition(
  adapter: string,
  adapterAddress: Address,
  conditionId: Bytes,
  outcome: boolean,
  confidence: BigInt,
  resolvedAt: BigInt,
  event: ethereum.Event
): void {
  const c = ensureCondition(adapter, adapterAddress, conditionId, event)
  c.resolved = true
  c.outcome = outcome
  c.confidence = confidence
  c.resolvedAt = resolvedAt
  c.save()
}

// ── Chainlink Data Feed ──────────────────────────────────────────────────────
export function handleDataFeedConditionRegistered(event: DataFeedConditionRegistered): void {
  registerCondition(ADAPTER_DATAFEED, event.address, event.params.conditionId, event.params.description, event.params.expectedResolutionTime, event)
}
export function handleDataFeedMarketLinked(event: DataFeedMarketLinked): void {
  linkMarket(ADAPTER_DATAFEED, event.address, event.params.friendMarketId, event.params.conditionId, event)
}
export function handleDataFeedConditionResolved(event: DataFeedConditionResolved): void {
  resolveCondition(ADAPTER_DATAFEED, event.address, event.params.conditionId, event.params.outcome, event.params.confidence, event.params.resolvedAt, event)
}

// ── Chainlink Functions ──────────────────────────────────────────────────────
export function handleFunctionsConditionRegistered(event: FunctionsConditionRegistered): void {
  registerCondition(ADAPTER_FUNCTIONS, event.address, event.params.conditionId, event.params.description, event.params.expectedResolutionTime, event)
}
export function handleFunctionsMarketLinked(event: FunctionsMarketLinked): void {
  linkMarket(ADAPTER_FUNCTIONS, event.address, event.params.friendMarketId, event.params.conditionId, event)
}
export function handleFunctionsConditionResolved(event: FunctionsConditionResolved): void {
  resolveCondition(ADAPTER_FUNCTIONS, event.address, event.params.conditionId, event.params.outcome, event.params.confidence, event.params.resolvedAt, event)
}

// ── UMA Optimistic Oracle V3 ─────────────────────────────────────────────────
export function handleUmaConditionRegistered(event: UmaConditionRegistered): void {
  registerCondition(ADAPTER_UMA, event.address, event.params.conditionId, event.params.description, event.params.expectedResolutionTime, event)
}
export function handleUmaMarketLinked(event: UmaMarketLinked): void {
  linkMarket(ADAPTER_UMA, event.address, event.params.friendMarketId, event.params.conditionId, event)
}
export function handleUmaConditionResolved(event: UmaConditionResolved): void {
  resolveCondition(ADAPTER_UMA, event.address, event.params.conditionId, event.params.outcome, event.params.confidence, event.params.resolvedAt, event)
}

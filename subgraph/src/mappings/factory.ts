import { BigInt, Bytes, log } from '@graphprotocol/graph-ts'
import {
  MarketCreated,
  MemberAdded,
  MarketAccepted,
  ResolutionProposed,
  MarketResolved,
  MarketChallenged,
  MarketCancelled,
  MarketRefunded,
  FriendGroupMarketFactory,
} from '../../generated/FriendGroupMarketFactory/FriendGroupMarketFactory'
import { Wager, User } from '../../generated/schema'

const MARKET_TYPES = ['oneVsOne', 'smallGroup', 'eventTracking', 'propBet', 'bookmaker']
const STATUSES = [
  'pending_acceptance',
  'active',
  'pending_resolution',
  'challenged',
  'resolved',
  'cancelled',
  'refunded',
  'oracle_timed_out',
]

function getOrCreateUser(address: Bytes): User {
  const id = address.toHexString()
  let user = User.load(id)
  if (user == null) {
    user = new User(id)
    user.save()
  }
  return user
}

function loadOrCreateWager(marketId: BigInt, address: Bytes): Wager {
  const id = marketId.toString()
  let wager = Wager.load(id)
  if (wager == null) {
    wager = new Wager(id)
    wager.creator = getOrCreateUser(address).id
    wager.participants = []
    wager.acceptedCount = BigInt.zero()
    wager.stakePerParticipant = BigInt.zero()
    wager.stakeToken = Bytes.empty()
    wager.tradingPeriodSeconds = BigInt.zero()
    wager.createdAt = BigInt.zero()
    wager.acceptanceDeadline = BigInt.zero()
    wager.endTime = BigInt.zero()
    wager.description = ''
    wager.isEncrypted = false
    wager.marketType = 'oneVsOne'
    wager.status = 'pending_acceptance'
    wager.resolutionType = 0
  }
  return wager as Wager
}

function hydrateFromContract(wager: Wager, factory: FriendGroupMarketFactory, marketId: BigInt): void {
  const result = factory.try_friendMarkets(marketId)
  if (result.reverted) {
    log.warning('friendMarkets({}) reverted', [marketId.toString()])
    return
  }
  const data = result.value
  wager.marketType = MARKET_TYPES[data.value1]
  wager.creator = getOrCreateUser(data.value2).id
  wager.stakePerParticipant = data.value16
  wager.stakeToken = data.value17
  wager.tradingPeriodSeconds = data.value18
  wager.createdAt = data.value7
  wager.acceptanceDeadline = data.value14
  wager.endTime = data.value7.plus(data.value18)
  wager.description = data.value9
  wager.resolutionType = data.value20

  const withStatus = factory.try_getFriendMarketWithStatus(marketId)
  if (!withStatus.reverted) {
    wager.status = STATUSES[withStatus.value.value5]
    wager.acceptedCount = withStatus.value.value9
  }
}

export function handleMarketCreated(event: MarketCreated): void {
  const factory = FriendGroupMarketFactory.bind(event.address)
  const wager = loadOrCreateWager(event.params.marketId, event.params.creator)
  hydrateFromContract(wager, factory, event.params.marketId)
  wager.save()
}

export function handleMemberAdded(event: MemberAdded): void {
  const wager = Wager.load(event.params.friendMarketId.toString())
  if (wager == null) return
  const user = getOrCreateUser(event.params.member)
  const ids = wager.participants
  let exists = false
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] == user.id) { exists = true; break }
  }
  if (!exists) {
    ids.push(user.id)
    wager.participants = ids
    wager.save()
  }
}

export function handleMarketAccepted(event: MarketAccepted): void {
  const wager = Wager.load(event.params.friendMarketId.toString())
  if (wager == null) return
  wager.acceptedCount = wager.acceptedCount.plus(BigInt.fromI32(1))
  const factory = FriendGroupMarketFactory.bind(event.address)
  const withStatus = factory.try_getFriendMarketWithStatus(event.params.friendMarketId)
  if (!withStatus.reverted) wager.status = STATUSES[withStatus.value.value5]
  wager.save()
}

export function handleResolutionProposed(event: ResolutionProposed): void {
  const wager = Wager.load(event.params.friendMarketId.toString())
  if (wager == null) return
  wager.status = 'pending_resolution'
  wager.save()
}

export function handleMarketResolved(event: MarketResolved): void {
  const wager = Wager.load(event.params.friendMarketId.toString())
  if (wager == null) return
  wager.status = 'resolved'
  wager.outcomeBool = event.params.outcome
  wager.winner = event.params.winner
  wager.resolvedAt = event.block.timestamp
  wager.save()
}

export function handleMarketChallenged(event: MarketChallenged): void {
  const wager = Wager.load(event.params.friendMarketId.toString())
  if (wager == null) return
  wager.status = 'challenged'
  wager.save()
}

export function handleMarketCancelled(event: MarketCancelled): void {
  const wager = Wager.load(event.params.friendMarketId.toString())
  if (wager == null) return
  wager.status = 'cancelled'
  wager.save()
}

export function handleMarketRefunded(event: MarketRefunded): void {
  const wager = Wager.load(event.params.friendMarketId.toString())
  if (wager == null) return
  wager.status = 'refunded'
  wager.save()
}

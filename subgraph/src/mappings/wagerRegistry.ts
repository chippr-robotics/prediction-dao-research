import { BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import {
  WagerCreated,
  WagerAccepted,
  PayoutClaimed,
  WagerRefunded,
  WagerDrawn,
  WagerCancelled,
  WagerResolved,
  WagerDeclined,
  DrawProposed,
  DrawRevoked,
} from '../../generated/WagerRegistry/WagerRegistry'
import { Wager, WagerTransfer } from '../../generated/schema'

// Transfer directions (GraphQL enum values are stored as strings).
const DEPOSIT = 'deposit'
const PAYOUT = 'payout'
const REFUND = 'refund'

/**
 * Stable, collision-free transfer id. A single transaction (and even a single
 * log, e.g. WagerRefunded/WagerDrawn) can produce more than one transfer, so the
 * txHash+logIndex pair is not unique on its own — the party disambiguates the
 * two refund rows that share one log (FR-009).
 */
function transferId(event: ethereum.Event, party: Bytes): string {
  return (
    event.transaction.hash.toHexString() +
    '-' +
    event.logIndex.toString() +
    '-' +
    party.toHexString()
  )
}

/**
 * Record one immutable WagerTransfer. Amounts come from event payloads or the
 * stakes stored on the Wager at creation — never a contract read (research R3),
 * so a handler can never revert. Escrow is the WagerRegistry itself (R4), so the
 * escrow side is event.address.
 */
function recordTransfer(
  event: ethereum.Event,
  wagerId: string,
  party: Bytes,
  direction: string,
  token: Bytes,
  amount: BigInt,
  from: Bytes,
  to: Bytes,
): void {
  let transfer = new WagerTransfer(transferId(event, party))
  transfer.wager = wagerId
  transfer.party = party
  transfer.direction = direction
  transfer.token = token
  transfer.amount = amount
  transfer.from = from
  transfer.to = to
  transfer.txHash = event.transaction.hash
  transfer.blockNumber = event.block.number
  transfer.timestamp = event.block.timestamp
  transfer.save()
}

export function handleWagerCreated(event: WagerCreated): void {
  let id = event.params.wagerId.toString()
  let wager = new Wager(id)
  wager.creator = event.params.creator
  wager.opponent = event.params.opponent
  wager.token = event.params.token
  wager.creatorStake = event.params.creatorStake
  wager.opponentStake = event.params.opponentStake
  wager.resolutionType = event.params.resolutionType
  wager.metadataHash = event.params.metadataHash
  wager.metadataUri = event.params.metadataUri
  wager.status = 'open'
  wager.createdAt = event.block.timestamp
  wager.save()

  // Creator deposit: creator -> escrow (registry), amount = creatorStake (event).
  recordTransfer(
    event,
    id,
    event.params.creator,
    DEPOSIT,
    event.params.token,
    event.params.creatorStake,
    event.params.creator,
    event.address,
  )
}

export function handleWagerAccepted(event: WagerAccepted): void {
  let id = event.params.wagerId.toString()
  let wager = Wager.load(id)
  if (wager == null) return
  // The actual acceptor is in the event; open wagers may have had a zero opponent.
  wager.opponent = event.params.opponent
  wager.status = 'active'
  wager.save()

  // Opponent deposit: opponent -> escrow, amount = opponentStake (stored at create).
  recordTransfer(
    event,
    id,
    event.params.opponent,
    DEPOSIT,
    wager.token,
    wager.opponentStake,
    event.params.opponent,
    event.address,
  )
}

export function handlePayoutClaimed(event: PayoutClaimed): void {
  let id = event.params.wagerId.toString()
  let wager = Wager.load(id)
  if (wager == null) return
  wager.winner = event.params.winner
  if (wager.status != 'resolved') wager.status = 'resolved'
  wager.save()

  // Payout: escrow -> winner, amount = event amount.
  recordTransfer(
    event,
    id,
    event.params.winner,
    PAYOUT,
    wager.token,
    event.params.amount,
    event.address,
    event.params.winner,
  )
}

export function handleWagerRefunded(event: WagerRefunded): void {
  let id = event.params.wagerId.toString()
  let wager = Wager.load(id)
  if (wager == null) return
  wager.status = 'refunded'
  wager.save()

  // Two refund rows: each party gets their own stake back from escrow.
  recordTransfer(event, id, event.params.creator, REFUND, wager.token, wager.creatorStake, event.address, event.params.creator)
  recordTransfer(event, id, event.params.opponent, REFUND, wager.token, wager.opponentStake, event.address, event.params.opponent)
}

export function handleWagerDrawn(event: WagerDrawn): void {
  let id = event.params.wagerId.toString()
  let wager = Wager.load(id)
  if (wager == null) return
  wager.status = 'drawn'
  wager.save()

  // Draw: both stakes returned to their parties.
  recordTransfer(event, id, event.params.creator, REFUND, wager.token, wager.creatorStake, event.address, event.params.creator)
  recordTransfer(event, id, event.params.opponent, REFUND, wager.token, wager.opponentStake, event.address, event.params.opponent)
}

export function handleWagerCancelled(event: WagerCancelled): void {
  let id = event.params.wagerId.toString()
  let wager = Wager.load(id)
  if (wager == null) return
  wager.status = 'cancelled'
  wager.save()

  // Cancelled before acceptance: only the creator ever deposited.
  recordTransfer(event, id, wager.creator, REFUND, wager.token, wager.creatorStake, event.address, wager.creator)
}

export function handleWagerResolved(event: WagerResolved): void {
  let id = event.params.wagerId.toString()
  let wager = Wager.load(id)
  if (wager == null) return
  wager.status = 'resolved'
  wager.winner = event.params.winner
  wager.resolvedAt = event.block.timestamp
  wager.save()
  // Status only — the value movement is recorded by handlePayoutClaimed.
}

export function handleWagerDeclined(event: WagerDeclined): void {
  let id = event.params.wagerId.toString()
  let wager = Wager.load(id)
  if (wager == null) return
  wager.status = 'declined'
  wager.save()
}

export function handleDrawProposed(event: DrawProposed): void {
  let id = event.params.wagerId.toString()
  let wager = Wager.load(id)
  if (wager == null) return
  wager.status = 'draw_proposed'
  wager.save()
}

export function handleDrawRevoked(event: DrawRevoked): void {
  let id = event.params.wagerId.toString()
  let wager = Wager.load(id)
  if (wager == null) return
  // Revoking a draw proposal returns the wager to active.
  wager.status = 'active'
  wager.save()
}

import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import {
  Transfer,
  Paused,
  Unpaused,
  Frozen,
  RoleGranted,
  RoleRevoked,
} from '../../generated/templates/TokenInstance/TokenInstance'
import { Holder, TokenActivity } from '../../generated/schema'

// Spec 028 expansion (US10/US12): per-fungible-token indexing, instantiated from handleTokenCreated. Builds the
// holder cap table from Transfer and the activity feed from Transfer + admin events. The mapping makes no
// contract calls. ERC-721 tokens are NOT indexed here (different Transfer encoding) — handled separately if added.

const ZERO = Address.fromString('0x0000000000000000000000000000000000000000')

function holderId(token: Address, account: Address): string {
  return token.toHexString() + '-' + account.toHexString()
}

function adjustHolder(token: Address, account: Address, delta: BigInt, ts: BigInt): void {
  if (account.equals(ZERO)) return // mint source / burn sink — not a holder
  const id = holderId(token, account)
  let h = Holder.load(id)
  if (h == null) {
    h = new Holder(id)
    h.token = token
    h.account = account
    h.balance = BigInt.zero()
    h.firstHeldAt = ts
  }
  h.balance = h.balance.plus(delta)
  h.lastUpdatedAt = ts
  h.save()
}

function newActivity(event: ethereum.Event, type: string, actor: Address, detail: string): TokenActivity {
  const a = new TokenActivity(event.transaction.hash.toHexString() + '-' + event.logIndex.toString())
  a.token = event.address
  a.type = type
  a.actor = actor
  a.detail = detail
  a.timestamp = event.block.timestamp
  a.txHash = event.transaction.hash
  return a
}

export function handleTransfer(event: Transfer): void {
  const token = event.address
  const from = event.params.from
  const to = event.params.to
  const value = event.params.value
  const ts = event.block.timestamp

  adjustHolder(token, from, BigInt.zero().minus(value), ts)
  adjustHolder(token, to, value, ts)

  const type = from.equals(ZERO) ? 'mint' : to.equals(ZERO) ? 'burn' : 'transfer'
  const actor = from.equals(ZERO) ? to : from
  const a = newActivity(event, type, actor, '')
  a.from = from
  a.to = to
  a.amount = value
  a.save()
}

export function handlePaused(event: Paused): void {
  newActivity(event, 'pause', event.params.account, '').save()
}

export function handleUnpaused(event: Unpaused): void {
  newActivity(event, 'unpause', event.params.account, '').save()
}

export function handleFrozen(event: Frozen): void {
  const type = event.params.frozen ? 'freeze' : 'unfreeze'
  newActivity(event, type, event.params.account, event.params.account.toHexString()).save()
}

export function handleRoleGranted(event: RoleGranted): void {
  const a = newActivity(event, 'role_granted', event.params.sender, event.params.role.toHexString())
  a.to = event.params.account
  a.save()
}

export function handleRoleRevoked(event: RoleRevoked): void {
  const a = newActivity(event, 'role_revoked', event.params.sender, event.params.role.toHexString())
  a.to = event.params.account
  a.save()
}

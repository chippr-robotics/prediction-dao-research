import { Address, BigInt } from '@graphprotocol/graph-ts'
import { VoucherMinted, Transfer } from '../../generated/MembershipVoucher/MembershipVoucher'
import { MembershipRedeemed } from '../../generated/MembershipManager/MembershipManager'
import { Voucher } from '../../generated/schema'

const ZERO_ADDRESS = Address.fromString('0x0000000000000000000000000000000000000000')

const HELD = 'held'
const REDEEMED = 'redeemed'
const BURNED = 'burned'

// Mint: create the Voucher in `held` state with its snapshotted (role, tier, durationDays).
export function handleVoucherMinted(event: VoucherMinted): void {
  const v = new Voucher(event.params.id.toString())
  v.tokenId = event.params.id
  v.owner = event.params.minter
  v.role = event.params.role
  v.tier = event.params.tier
  v.durationDays = event.params.durationDays.toI32()
  v.status = HELD
  v.minter = event.params.minter
  v.mintedAt = event.block.timestamp
  v.mintTxHash = event.transaction.hash
  v.save()
}

// ERC-721 Transfer: track ownership across gifts/resales; mark burns. The mint Transfer (from == 0) is
// covered by handleVoucherMinted, so skip it here. A burn (to == 0) sets `burned` UNLESS the same tx also
// emitted MembershipRedeemed — in redeemVoucher the burn log precedes the MembershipRedeemed log, so
// handleMembershipRedeemed runs after and overrides the status to `redeemed`.
export function handleTransfer(event: Transfer): void {
  if (event.params.from.equals(ZERO_ADDRESS)) return // mint — handled by handleVoucherMinted

  const v = Voucher.load(event.params.tokenId.toString())
  if (v == null) return

  if (event.params.to.equals(ZERO_ADDRESS)) {
    v.status = BURNED
  } else {
    v.owner = event.params.to
  }
  v.save()
}

// Redemption: mark the voucher redeemed and record who redeemed it (may be a fresh wallet).
export function handleMembershipRedeemed(event: MembershipRedeemed): void {
  const v = Voucher.load(event.params.voucherId.toString())
  if (v == null) return
  v.status = REDEEMED
  v.redeemedBy = event.params.user
  v.redeemedAt = event.block.timestamp
  v.redeemTxHash = event.transaction.hash
  v.save()
}

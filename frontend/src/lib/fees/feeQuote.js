/**
 * Platform-fee quotes for wrapper services (spec 060).
 *
 * The FeeRouter contract is the single on-chain source of truth for platform
 * fees; member surfaces quote the LIVE rate from it before any signature and
 * pass that quoted rate back as `maxFeeBps`, so a member can never be charged
 * more than the rate they were shown (FR-005). Networks with no router
 * deployed quote `{ available: false, bps: 0 }` — surfaces then behave exactly
 * as before the fee system existed (no fee, no fee line). A FAILED read on a
 * network that HAS a router is different: the caller must block the action
 * rather than proceed on a possibly-understated rate (FR-015).
 */
import { Contract, id as keccakId } from 'ethers'
import { FEE_ROUTER_ABI } from '../../abis/FeeRouter'
import { getContractAddressForChain } from '../../config/contracts'

/** Launch wrapper service ids (bytes32 = keccak256 of the label). */
export const FEE_SERVICES = {
  EARN_LEND: keccakId('earn.lend'),
  POLYMARKET_TAKER: keccakId('polymarket.taker'),
  POLYMARKET_MAKER: keccakId('polymarket.maker'),
}

const BPS_DENOMINATOR = 10_000n

/** Floor fee/net split — mirrors the contract math exactly (member's favor). */
export function splitFee(grossAmount, bps) {
  const gross = BigInt(grossAmount)
  const feeAmount = (gross * BigInt(bps)) / BPS_DENOMINATOR
  return { feeAmount, netAmount: gross - feeAmount }
}

/** "0.50%" for 50 bps — the display form of a rate. */
export function bpsToPercent(bps) {
  return `${(Number(bps) / 100).toFixed(2)}%`
}

/**
 * Quote the live rate for one wrapper service on one chain.
 *
 * Returns:
 *   { available: false, bps: 0, routerAddress: null }  — no router on this
 *     chain (fee system not deployed): proceed WITHOUT a fee, like today.
 *   { available: true, bps, capBps, routerAddress }    — live rate obtained:
 *     disclose it and pass `bps` as maxFeeBps.
 * Throws on a failed read when a router IS configured — callers must treat
 * that as "cannot quote" and block the fee-bearing action (FR-015), never
 * fall back to assuming zero.
 */
export async function fetchFeeQuote({ serviceId, chainId, provider }) {
  const routerAddress = getContractAddressForChain('feeRouter', chainId)
  if (!routerAddress) {
    return { available: false, bps: 0, capBps: 0, routerAddress: null }
  }
  const router = new Contract(routerAddress, FEE_ROUTER_ABI, provider)
  const service = await router.getService(serviceId)
  const kind = Number(service.kind)
  if (kind === 0) {
    // Router deployed but the service is not registered yet — honestly no fee.
    return { available: false, bps: 0, capBps: 0, routerAddress }
  }
  return {
    available: true,
    bps: Number(service.feeBps),
    capBps: Number(service.capBps),
    routerAddress,
  }
}

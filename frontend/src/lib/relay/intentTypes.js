/**
 * EIP-712 typed-data definitions for intent-based signatures (spec 035).
 *
 * One struct per action, mirroring specs/035-intent-based-payments/contracts/intent-eip712-schemas.md
 * (CreateWagerIntent uses the complete field list from research.md §A3 — the schemas doc elides the
 * middle fields with "…"). Every struct carries the common trailing fields
 * `nonce / validAfter / validBefore` plus an actor address field that MUST equal the recovered signer;
 * money-in structs additionally staple `paymentNonce` (== the EIP-3009 authorization nonce, FR-007).
 *
 * Domains are PER CONTRACT (name + version + chainId + verifyingContract) so a signature is valid only
 * on the network and contract it was signed for (FR-005/FR-021). The payment leg is signed under the
 * STABLECOIN's own domain (native Circle USDC version '2', bridged USDC.e '1'), driven by
 * `stablecoin.domainVersion` in config/networks.js — null means the token lacks EIP-3009 and
 * payment-class intents are unavailable on that chain (FR-020, e.g. Mordor/ETC USC).
 */
import { NETWORKS } from '../../config/networks'
import {
  CONTRACT_DOMAINS,
  INTENT_TYPES,
  INTENT_ACTIONS,
  RECEIVE_WITH_AUTHORIZATION_TYPES,
  domainFor,
  typeStringFor,
} from '@fairwins/intent-types'
import { PaymentUnsupportedOnChain } from './errors'

/*
 * Struct definitions AND the FairWins EIP-712 domains now live in @fairwins/intent-types
 * (spec 075, FR-024/FR-025) — one source, consumed by this app AND by services/relay-gateway, and
 * checked against the verifying contracts by test/intent/TypehashParity.test.js.
 *
 * They used to be duplicated here and in the gateway, kept in step by hand. That held for 26 of 27
 * structs; `InvalidateNonce` was missing from the gateway entirely. The domains had the same three
 * copies and no gate at all — and a struct signed under a wrong domain is just as dead as a wrong
 * struct, because the domain separator is half of the digest.
 *
 * Re-exported so relay callers still need only this module for both signature legs.
 */
export { INTENT_TYPES, INTENT_ACTIONS, RECEIVE_WITH_AUTHORIZATION_TYPES, CONTRACT_DOMAINS, typeStringFor }

/*
 * The five FairWins domains, as named helpers. Each is a thin binding of a CONTRACT_DOMAINS key —
 * the name/version pair lives in the package and is asserted against that contract's own
 * `__EIP712_init(...)` call, so editing a literal here is no longer possible.
 */

/**
 * EIP-712 domain for CallsignRegistry intents (spec 054). Its own per-contract domain (name/version set in
 * CallsignRegistry.initialize) gives network + contract isolation.
 * @param {number} chainId
 * @param {string} verifyingContract - the callsignRegistry PROXY address for this chain
 */
export function callsignRegistryDomain(chainId, verifyingContract) {
  return domainFor('callsignRegistry', chainId, verifyingContract)
}

/**
 * EIP-712 domain for WagerRegistry intents (existing domain, WagerRegistry.sol — unchanged by the
 * spec-035 upgrade so already-deployed verifier state stays valid).
 * @param {number} chainId
 * @param {string} verifyingContract - the wagerRegistry PROXY address for this chain
 */
export function wagerRegistryDomain(chainId, verifyingContract) {
  return domainFor('wagerRegistry', chainId, verifyingContract)
}

/**
 * EIP-712 domain for MembershipManager intents (added by the spec-035 upgrade via reinitializer(2)).
 * @param {number} chainId
 * @param {string} verifyingContract - the membershipManager PROXY address for this chain
 */
export function membershipManagerDomain(chainId, verifyingContract) {
  return domainFor('membershipManager', chainId, verifyingContract)
}

/**
 * EIP-712 domain for a WagerPool CLONE (spec 034/035). verifyingContract is the pool clone's own
 * address — each clone is its own SignerIntentBase domain, so the six actor twins are verified there
 * even though the relayer submits through the factory forwarder.
 * @param {number} chainId
 * @param {string} verifyingContract - the pool CLONE address
 */
export function wagerPoolDomain(chainId, verifyingContract) {
  return domainFor('wagerPool', chainId, verifyingContract)
}

/**
 * EIP-712 domain for the WagerPoolFactory (spec 035/036 Tier 2 — createPoolWithSig). verifyingContract
 * is the factory PROXY address for this chain.
 * @param {number} chainId
 * @param {string} verifyingContract - the wagerPoolFactory PROXY address
 */
export function wagerPoolFactoryDomain(chainId, verifyingContract) {
  return domainFor('wagerPoolFactory', chainId, verifyingContract)
}

/**
 * EIP-712 domain for the payment leg — the STABLECOIN's own domain, built from config/networks.js
 * (`stablecoin.domainVersion`: native Circle USDC '2', bridged USDC.e '1'). This is the FR-020
 * pre-sign check: a chain whose token lacks EIP-3009 (`domainVersion: null`, e.g. Mordor/ETC USC)
 * throws PaymentUnsupportedOnChain BEFORE any wallet prompt, so the caller self-submits.
 *
 * Strict per-chain lookup (no default-network fallback) — a wrong-domain signature would burn the
 * user's prompt on an authorization no token accepts.
 *
 * @param {number} chainId
 * @returns {{name: string, version: string, chainId: number, verifyingContract: string}}
 * @throws {PaymentUnsupportedOnChain} when the chain has no EIP-3009 stablecoin configured
 */
export function stablecoinDomain(chainId) {
  const stablecoin = NETWORKS[chainId]?.stablecoin
  if (!stablecoin || stablecoin.domainVersion == null) {
    const symbol = stablecoin?.symbol || 'stablecoin'
    throw new PaymentUnsupportedOnChain(
      `Gasless payments are not available on chain ${chainId}: ${symbol} does not support EIP-3009 receiveWithAuthorization. Submit the transaction yourself (you pay gas).`,
      { chainId: Number(chainId) }
    )
  }
  return {
    name: stablecoin.name,
    version: stablecoin.domainVersion,
    chainId: Number(chainId),
    verifyingContract: stablecoin.address,
  }
}

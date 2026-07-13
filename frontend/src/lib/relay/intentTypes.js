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
import { RECEIVE_WITH_AUTHORIZATION_TYPES } from '../pools/gasless'
import { PaymentUnsupportedOnChain } from './errors'

// Re-exported so relay callers need only this module for both signature legs (shape reused verbatim
// from the spec-034 prototype in lib/pools/gasless.js — the token-side EIP-3009 struct is unchanged).
export { RECEIVE_WITH_AUTHORIZATION_TYPES }

/** Common trailing fields shared by every intent struct (schema: "Common trailing fields"). */
const TRAILING = [
  { name: 'nonce', type: 'bytes32' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
]

/** `{ wagerId, actor }` shape shared by most no-stake wager intents. */
const WAGER_ACTOR = [
  { name: 'wagerId', type: 'uint256' },
  { name: 'actor', type: 'address' },
]

/**
 * EIP-712 struct field lists, keyed by primary type. Pass as
 * `{ [primaryType]: INTENT_TYPES[primaryType] }` to `signer.signTypedData` (no nested custom types).
 */
export const INTENT_TYPES = {
  CreateWagerIntent: [
    { name: 'creator', type: 'address' },
    { name: 'opponent', type: 'address' },
    { name: 'arbitrator', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'creatorStake', type: 'uint128' },
    { name: 'opponentStake', type: 'uint128' },
    { name: 'acceptDeadline', type: 'uint64' },
    { name: 'resolveDeadline', type: 'uint64' },
    { name: 'resolutionType', type: 'uint8' },
    { name: 'conditionId', type: 'bytes32' },
    { name: 'creatorIsYes', type: 'bool' },
    { name: 'metadataHash', type: 'bytes32' },
    { name: 'metadataUri', type: 'string' },
    { name: 'termsVersionHash', type: 'bytes32' },
    { name: 'paymentNonce', type: 'bytes32' },
    ...TRAILING,
  ],
  AcceptWagerIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'taker', type: 'address' },
    { name: 'paymentNonce', type: 'bytes32' },
    ...TRAILING,
  ],
  ClaimPayoutIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'claimant', type: 'address' },
    ...TRAILING,
  ],
  ClaimRefundIntent: [...WAGER_ACTOR, ...TRAILING],
  DeclareDrawIntent: [...WAGER_ACTOR, ...TRAILING],
  RevokeDrawIntent: [...WAGER_ACTOR, ...TRAILING],
  CancelOpenIntent: [...WAGER_ACTOR, ...TRAILING],
  DeclineIntent: [...WAGER_ACTOR, ...TRAILING],
  DeclareWinnerIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'winner', type: 'address' },
    { name: 'actor', type: 'address' },
    ...TRAILING,
  ],
  PurchaseTierIntent: [
    { name: 'role', type: 'bytes32' },
    { name: 'tier', type: 'uint8' },
    { name: 'acceptedTermsHash', type: 'bytes32' },
    { name: 'member', type: 'address' },
    { name: 'paymentNonce', type: 'bytes32' },
    ...TRAILING,
  ],
  UpgradeTierIntent: [
    { name: 'role', type: 'bytes32' },
    { name: 'tier', type: 'uint8' },
    { name: 'acceptedTermsHash', type: 'bytes32' },
    { name: 'member', type: 'address' },
    { name: 'paymentNonce', type: 'bytes32' },
    ...TRAILING,
  ],
  ExtendMembershipIntent: [
    { name: 'role', type: 'bytes32' },
    { name: 'member', type: 'address' },
    { name: 'paymentNonce', type: 'bytes32' },
    ...TRAILING,
  ],
  RedeemVoucherIntent: [
    { name: 'voucherId', type: 'uint256' },
    { name: 'acceptedTermsHash', type: 'bytes32' },
    { name: 'redeemer', type: 'address' },
    ...TRAILING,
  ],
  // Gasless cancel of an unsubmitted intent (invalidateNonceWithSig, FR-006) — no validAfter: the
  // cancel should be executable immediately, bounded only by validBefore.
  InvalidateNonce: [
    { name: 'signer', type: 'address' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'validBefore', type: 'uint256' },
  ],

  // ---- Tier-2 group pools (spec 035/036) ----
  // Byte-identical to the on-chain typehashes: the six actor twins verify against the CLONE's domain,
  // CreatePool against the FACTORY's. `pool`/`entries` ride in intent.params (calldata), NOT the struct.
  ApproveOutcome: [
    { name: 'member', type: 'address' },
    { name: 'proposalId', type: 'bytes32' },
    ...TRAILING,
  ],
  ClaimShare: [
    { name: 'winner', type: 'address' },
    { name: 'index', type: 'uint256' },
    { name: 'recipient', type: 'address' },
    ...TRAILING,
  ],
  ProposeOutcome: [
    { name: 'creator', type: 'address' },
    { name: 'proposalId', type: 'bytes32' },
    ...TRAILING,
  ],
  CloseJoining: [
    { name: 'creator', type: 'address' },
    ...TRAILING,
  ],
  Cancel: [
    { name: 'creator', type: 'address' },
    ...TRAILING,
  ],
  Refund: [
    { name: 'member', type: 'address' },
    ...TRAILING,
  ],
  CreatePool: [
    { name: 'creator', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'buyIn', type: 'uint256' },
    { name: 'maxMembers', type: 'uint32' },
    { name: 'thresholdBips', type: 'uint16' },
    { name: 'acceptDeadline', type: 'uint64' },
    { name: 'resolveDeadline', type: 'uint64' },
    ...TRAILING,
  ],

  // ---- Callsign registry (spec 054) — signer-attributed, no payment leg (free with Gold membership).
  //      Byte-identical to CallsignRegistry.sol typehashes + services/relay-gateway/src/intent/intentTypes.js.
  CommitCallsignIntent: [
    { name: 'owner', type: 'address' },
    { name: 'commitment', type: 'bytes32' },
    ...TRAILING,
  ],
  RegisterCallsignIntent: [
    { name: 'owner', type: 'address' },
    { name: 'callsign', type: 'string' },
    { name: 'salt', type: 'bytes32' },
    ...TRAILING,
  ],
  ChangeCallsignIntent: [
    { name: 'owner', type: 'address' },
    { name: 'newCallsign', type: 'string' },
    { name: 'salt', type: 'bytes32' },
    ...TRAILING,
  ],
  ReleaseCallsignIntent: [
    { name: 'owner', type: 'address' },
    { name: 'callsignHash', type: 'bytes32' },
    ...TRAILING,
  ],
  RequestRepointIntent: [
    { name: 'owner', type: 'address' },
    { name: 'callsignHash', type: 'bytes32' },
    { name: 'newOwner', type: 'address' },
    ...TRAILING,
  ],
  CancelRepointIntent: [
    { name: 'owner', type: 'address' },
    { name: 'callsignHash', type: 'bytes32' },
    ...TRAILING,
  ],
}

/**
 * Gateway `action` → typed-data + routing metadata:
 *   primaryType  — key into INTENT_TYPES
 *   verifier     — which FairWins EIP-712 domain verifies the intent ('wagerRegistry' | 'membershipManager';
 *                  null = both contracts expose it, caller picks via signIntent's `verifier` option)
 *   intentClass  — gateway Intent class ('payment' carries an EIP-3009 authorization; else 'signer-attributed')
 *   actorField   — struct field that MUST equal the recovered signer (auto-filled by signIntent)
 */
export const INTENT_ACTIONS = {
  createWager: { primaryType: 'CreateWagerIntent', verifier: 'wagerRegistry', intentClass: 'payment', actorField: 'creator' },
  acceptWager: { primaryType: 'AcceptWagerIntent', verifier: 'wagerRegistry', intentClass: 'payment', actorField: 'taker' },
  // Open-challenge accept: same AcceptWagerIntent, plus the separate claim-code proof signature
  // (rebound to taker = signer) carried in params by the call site (schema §"Open-challenge accept").
  acceptOpenWager: { primaryType: 'AcceptWagerIntent', verifier: 'wagerRegistry', intentClass: 'payment', actorField: 'taker' },
  claimPayout: { primaryType: 'ClaimPayoutIntent', verifier: 'wagerRegistry', intentClass: 'signer-attributed', actorField: 'claimant' },
  claimRefund: { primaryType: 'ClaimRefundIntent', verifier: 'wagerRegistry', intentClass: 'signer-attributed', actorField: 'actor' },
  declareDraw: { primaryType: 'DeclareDrawIntent', verifier: 'wagerRegistry', intentClass: 'signer-attributed', actorField: 'actor' },
  revokeDraw: { primaryType: 'RevokeDrawIntent', verifier: 'wagerRegistry', intentClass: 'signer-attributed', actorField: 'actor' },
  cancelOpen: { primaryType: 'CancelOpenIntent', verifier: 'wagerRegistry', intentClass: 'signer-attributed', actorField: 'actor' },
  declineWager: { primaryType: 'DeclineIntent', verifier: 'wagerRegistry', intentClass: 'signer-attributed', actorField: 'actor' },
  declareWinner: { primaryType: 'DeclareWinnerIntent', verifier: 'wagerRegistry', intentClass: 'signer-attributed', actorField: 'actor' },
  purchaseTier: { primaryType: 'PurchaseTierIntent', verifier: 'membershipManager', intentClass: 'payment', actorField: 'member' },
  upgradeTier: { primaryType: 'UpgradeTierIntent', verifier: 'membershipManager', intentClass: 'payment', actorField: 'member' },
  extendMembership: { primaryType: 'ExtendMembershipIntent', verifier: 'membershipManager', intentClass: 'payment', actorField: 'member' },
  redeemVoucher: { primaryType: 'RedeemVoucherIntent', verifier: 'membershipManager', intentClass: 'signer-attributed', actorField: 'redeemer' },
  invalidateNonce: { primaryType: 'InvalidateNonce', verifier: null, intentClass: 'signer-attributed', actorField: 'signer' },

  // ---- Tier-2 group pools (spec 035/036, factory-forwarder) ----
  // `verifier` = the getContractAddressForChain KEY that resolves the intent TARGET (the factory, whose
  //   forwarder the relayer calls — the only whitelisted pool address). `domainVerifier` = the EIP-712
  //   domain the signature is verified under; `verifyingContractParam` names the param holding the
  //   verifyingContract (the CLONE) — the domain/target SPLIT. The six actor twins sign under the clone;
  //   createPool signs under the factory. `authOnly` (poolJoin) = no intent struct, the EIP-3009
  //   authorization is the whole intent; `authToParam` binds the money to the clone, not the factory.
  poolCloseJoining: { primaryType: 'CloseJoining', verifier: 'wagerPoolFactory', domainVerifier: 'wagerPool', verifyingContractParam: 'pool', intentClass: 'signer-attributed', actorField: 'creator' },
  poolCancel: { primaryType: 'Cancel', verifier: 'wagerPoolFactory', domainVerifier: 'wagerPool', verifyingContractParam: 'pool', intentClass: 'signer-attributed', actorField: 'creator' },
  poolRefund: { primaryType: 'Refund', verifier: 'wagerPoolFactory', domainVerifier: 'wagerPool', verifyingContractParam: 'pool', intentClass: 'signer-attributed', actorField: 'member' },
  poolApprove: { primaryType: 'ApproveOutcome', verifier: 'wagerPoolFactory', domainVerifier: 'wagerPool', verifyingContractParam: 'pool', intentClass: 'signer-attributed', actorField: 'member' },
  poolProposeOutcome: { primaryType: 'ProposeOutcome', verifier: 'wagerPoolFactory', domainVerifier: 'wagerPool', verifyingContractParam: 'pool', intentClass: 'signer-attributed', actorField: 'creator' },
  poolClaim: { primaryType: 'ClaimShare', verifier: 'wagerPoolFactory', domainVerifier: 'wagerPool', verifyingContractParam: 'pool', intentClass: 'signer-attributed', actorField: 'winner' },
  poolCreate: { primaryType: 'CreatePool', verifier: 'wagerPoolFactory', domainVerifier: 'wagerPoolFactory', intentClass: 'signer-attributed', actorField: 'creator' },
  poolJoin: { verifier: 'wagerPoolFactory', intentClass: 'payment', authOnly: true, authToParam: 'pool' },

  // ---- Callsign registry (spec 054) — target + domain both the registry; owner == recovered signer.
  //      register/change/requestRepoint execute only while the signer holds Gold+ (else revert on-chain);
  //      the gateway SHOULD pre-screen tier. requestRepoint is itself tier-exempt on-chain (recovery safety).
  callsignCommit: { primaryType: 'CommitCallsignIntent', verifier: 'callsignRegistry', domainVerifier: 'callsignRegistry', intentClass: 'signer-attributed', actorField: 'owner' },
  callsignRegister: { primaryType: 'RegisterCallsignIntent', verifier: 'callsignRegistry', domainVerifier: 'callsignRegistry', intentClass: 'signer-attributed', actorField: 'owner' },
  callsignChange: { primaryType: 'ChangeCallsignIntent', verifier: 'callsignRegistry', domainVerifier: 'callsignRegistry', intentClass: 'signer-attributed', actorField: 'owner' },
  callsignRelease: { primaryType: 'ReleaseCallsignIntent', verifier: 'callsignRegistry', domainVerifier: 'callsignRegistry', intentClass: 'signer-attributed', actorField: 'owner' },
  callsignRequestRepoint: { primaryType: 'RequestRepointIntent', verifier: 'callsignRegistry', domainVerifier: 'callsignRegistry', intentClass: 'signer-attributed', actorField: 'owner' },
  callsignCancelRepoint: { primaryType: 'CancelRepointIntent', verifier: 'callsignRegistry', domainVerifier: 'callsignRegistry', intentClass: 'signer-attributed', actorField: 'owner' },
}

/**
 * EIP-712 domain for CallsignRegistry intents (spec 054). Its own per-contract domain (name/version set in
 * CallsignRegistry.initialize) gives network + contract isolation.
 * @param {number} chainId
 * @param {string} verifyingContract - the callsignRegistry PROXY address for this chain
 */
export function callsignRegistryDomain(chainId, verifyingContract) {
  return { name: 'FairWins CallsignRegistry', version: '1', chainId: Number(chainId), verifyingContract }
}

/**
 * EIP-712 domain for WagerRegistry intents (existing domain, WagerRegistry.sol — unchanged by the
 * spec-035 upgrade so already-deployed verifier state stays valid).
 * @param {number} chainId
 * @param {string} verifyingContract - the wagerRegistry PROXY address for this chain
 */
export function wagerRegistryDomain(chainId, verifyingContract) {
  return { name: 'FairWins WagerRegistry', version: '1', chainId: Number(chainId), verifyingContract }
}

/**
 * EIP-712 domain for MembershipManager intents (added by the spec-035 upgrade via reinitializer(2)).
 * @param {number} chainId
 * @param {string} verifyingContract - the membershipManager PROXY address for this chain
 */
export function membershipManagerDomain(chainId, verifyingContract) {
  return { name: 'FairWins MembershipManager', version: '1', chainId: Number(chainId), verifyingContract }
}

/**
 * EIP-712 domain for a WagerPool CLONE (spec 034/035). verifyingContract is the pool clone's own
 * address — each clone is its own SignerIntentBase domain, so the six actor twins are verified there
 * even though the relayer submits through the factory forwarder.
 * @param {number} chainId
 * @param {string} verifyingContract - the pool CLONE address
 */
export function wagerPoolDomain(chainId, verifyingContract) {
  return { name: 'FairWins WagerPool', version: '1', chainId: Number(chainId), verifyingContract }
}

/**
 * EIP-712 domain for the WagerPoolFactory (spec 035/036 Tier 2 — createPoolWithSig). verifyingContract
 * is the factory PROXY address for this chain.
 * @param {number} chainId
 * @param {string} verifyingContract - the wagerPoolFactory PROXY address
 */
export function wagerPoolFactoryDomain(chainId, verifyingContract) {
  return { name: 'FairWins WagerPoolFactory', version: '1', chainId: Number(chainId), verifyingContract }
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

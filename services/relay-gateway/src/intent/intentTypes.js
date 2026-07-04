/**
 * Spec-035 intent type definitions — the ONE place where the EIP-712 structs
 * (specs/035-intent-based-payments/contracts/intent-eip712-schemas.md) and the
 * signer-attributed entrypoint ABI (…/withsig-entrypoints.md) live.
 *
 * Everything else (verification, encoding, tests, docs) derives from this module so a
 * spec-035 schema change is a one-file edit.
 *
 * Notes / recorded assumptions:
 * - The struct set below mirrors the DEPLOYED contracts (contracts/wagers/WagerRegistryIntents.sol,
 *   contracts/access/MembershipManager.sol) — the on-chain typehashes are authoritative. This
 *   includes fields the schemas doc elided: AcceptWagerIntent carries `paymentNonce` (it is a
 *   money-in intent — the "common trailing fields" rule), CreateWagerIntent's "…" is the full
 *   CreateArgs layout, and DeclareWinnerIntent backs declareWinnerWithSig.
 * - Per data-model.md, for the `payment` class `uniquenessMarker` IS the EIP-3009 nonce; we also
 *   require the intent-struct replay nonce to equal it (client signs both legs with one marker),
 *   which keeps the request shape to a single `uniquenessMarker` field.
 */
import { ethers } from 'ethers'

// ---------------------------------------------------------------------------
// EIP-712 domains (per verifying contract; chainId + verifyingContract added at runtime)
// ---------------------------------------------------------------------------

export const CONTRACT_DOMAINS = {
  wagerRegistry: { name: 'FairWins WagerRegistry', version: '1' },
  membershipManager: { name: 'FairWins MembershipManager', version: '1' },
}

// ---------------------------------------------------------------------------
// EIP-712 struct definitions (verbatim from intent-eip712-schemas.md)
// ---------------------------------------------------------------------------

const TAIL = [
  { name: 'nonce', type: 'bytes32' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
]

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
    ...TAIL,
  ],
  AcceptWagerIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'taker', type: 'address' },
    { name: 'paymentNonce', type: 'bytes32' },
    ...TAIL,
  ],
  ClaimPayoutIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'claimant', type: 'address' },
    ...TAIL,
  ],
  ClaimRefundIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'actor', type: 'address' },
    ...TAIL,
  ],
  DeclareDrawIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'actor', type: 'address' },
    ...TAIL,
  ],
  RevokeDrawIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'actor', type: 'address' },
    ...TAIL,
  ],
  CancelOpenIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'actor', type: 'address' },
    ...TAIL,
  ],
  DeclineIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'actor', type: 'address' },
    ...TAIL,
  ],
  DeclareWinnerIntent: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'winner', type: 'address' },
    { name: 'actor', type: 'address' },
    ...TAIL,
  ],
  PurchaseTierIntent: [
    { name: 'role', type: 'bytes32' },
    { name: 'tier', type: 'uint8' },
    { name: 'acceptedTermsHash', type: 'bytes32' },
    { name: 'member', type: 'address' },
    { name: 'paymentNonce', type: 'bytes32' },
    ...TAIL,
  ],
  UpgradeTierIntent: [
    { name: 'role', type: 'bytes32' },
    { name: 'tier', type: 'uint8' },
    { name: 'acceptedTermsHash', type: 'bytes32' },
    { name: 'member', type: 'address' },
    { name: 'paymentNonce', type: 'bytes32' },
    ...TAIL,
  ],
  ExtendMembershipIntent: [
    { name: 'role', type: 'bytes32' },
    { name: 'member', type: 'address' },
    { name: 'paymentNonce', type: 'bytes32' },
    ...TAIL,
  ],
  RedeemVoucherIntent: [
    { name: 'voucherId', type: 'uint256' },
    { name: 'acceptedTermsHash', type: 'bytes32' },
    { name: 'redeemer', type: 'address' },
    ...TAIL,
  ],
}

// EIP-3009 payment-leg typed data (token's own domain — native USDC version "2").
export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
}

// ---------------------------------------------------------------------------
// Signer-attributed entrypoint ABI (verbatim from withsig-entrypoints.md)
// ---------------------------------------------------------------------------

const AUTH_TUPLE = '(uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)'
const CREATE_ARGS_TUPLE =
  '(address opponent,address arbitrator,address token,uint128 creatorStake,uint128 opponentStake,uint64 acceptDeadline,uint64 resolveDeadline,uint8 resolutionType,bytes32 conditionId,bool creatorIsYes,bytes32 metadataHash,string metadataUri,bytes32 termsVersionHash,bytes32 paymentNonce)'

export const ENTRYPOINT_ABI = [
  // WagerRegistry — no-stake …WithSig twins
  'function claimPayoutWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function claimRefundWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function declareDrawWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function revokeDrawWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function cancelOpenWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function declineWagerWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function declareWinnerWithSig(uint256 wagerId, address winner, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  // WagerRegistry — money-in …WithAuthorization twins (EIP-3009 pull attributed to signer)
  `function createWagerWithAuthorization(${CREATE_ARGS_TUPLE} args, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ${AUTH_TUPLE} stakeAuth, ${AUTH_TUPLE} feeAuth) returns (uint256)`,
  `function acceptWagerWithAuthorization(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ${AUTH_TUPLE} stakeAuth, ${AUTH_TUPLE} feeAuth)`,
  `function acceptOpenWagerWithAuthorization(uint256 wagerId, address signer, bytes claimCodeSig, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ${AUTH_TUPLE} stakeAuth, ${AUTH_TUPLE} feeAuth)`,
  // MembershipManager
  `function purchaseTierWithAuthorization(bytes32 role, uint8 tier, bytes32 termsHash, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ${AUTH_TUPLE} priceAuth, ${AUTH_TUPLE} feeAuth)`,
  `function upgradeTierWithAuthorization(bytes32 role, uint8 tier, bytes32 termsHash, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ${AUTH_TUPLE} priceAuth, ${AUTH_TUPLE} feeAuth)`,
  `function extendMembershipWithAuthorization(bytes32 role, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ${AUTH_TUPLE} priceAuth, ${AUTH_TUPLE} feeAuth)`,
  'function redeemVoucherWithSig(uint256 voucherId, bytes32 termsHash, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
]

export const entrypointInterface = new ethers.Interface(ENTRYPOINT_ABI)

/** Zeroed ERC3009Auth tuple — feeAuth is "ignored/empty" when fee-netting is off (spec 035). */
export const EMPTY_AUTH = {
  value: 0n,
  validAfter: 0n,
  validBefore: 0n,
  nonce: ethers.ZeroHash,
  v: 0,
  r: ethers.ZeroHash,
  s: ethers.ZeroHash,
}

const authTuple = (a) => [a.value, a.validAfter, a.validBefore, a.nonce, a.v, a.r, a.s]

// ---------------------------------------------------------------------------
// Action registry: canonical action name → class, contract, struct, encoder
// ---------------------------------------------------------------------------
//
// `actorField` is the struct field that MUST equal the recovered signer (spec 035:
// "an actor address field that MUST equal the recovered signer").
// `params` lists the client-supplied action parameters (everything else is derived).
// `buildMessage` produces the EIP-712 message we verify the signature against.
// `encode` produces the calldata handed to the engine (Interface.encodeFunctionData).

function withSigAction({ contract, typeName, actorField, fn, paramNames, buildArgs }) {
  return {
    intentClass: 'signer-attributed',
    contract,
    typeName,
    actorField,
    fn,
    paramNames,
    buildMessage: (params, signer, intent) => {
      const msg = {}
      for (const f of INTENT_TYPES[typeName]) {
        if (f.name === actorField) msg[f.name] = signer
        else if (f.name === 'nonce') msg[f.name] = intent.uniquenessMarker
        else if (f.name === 'validAfter') msg[f.name] = intent.validAfter
        else if (f.name === 'validBefore') msg[f.name] = intent.validBefore
        else msg[f.name] = params[f.name]
      }
      return msg
    },
    encode: (params, signer, intent) =>
      entrypointInterface.encodeFunctionData(fn, buildArgs(params, signer, intent)),
  }
}

function withAuthAction({ contract, typeName, actorField, fn, paramNames, buildArgs }) {
  return {
    intentClass: 'payment',
    contract,
    typeName,
    actorField,
    fn,
    paramNames,
    buildMessage: (params, signer, intent) => {
      const msg = {}
      for (const f of INTENT_TYPES[typeName]) {
        if (f.name === actorField) msg[f.name] = signer
        else if (f.name === 'nonce') msg[f.name] = intent.uniquenessMarker
        else if (f.name === 'paymentNonce') msg[f.name] = intent.authorization.nonce
        else if (f.name === 'validAfter') msg[f.name] = intent.validAfter
        else if (f.name === 'validBefore') msg[f.name] = intent.validBefore
        else msg[f.name] = params[f.name]
      }
      return msg
    },
    encode: (params, signer, intent) =>
      entrypointInterface.encodeFunctionData(fn, buildArgs(params, signer, intent)),
  }
}

const sigArgs = (first) => (params, signer, intent) => [
  params[first],
  signer,
  intent.uniquenessMarker,
  intent.validAfter,
  intent.validBefore,
  intent.signature,
]

const stakeAuthOf = (intent) => authTuple({
  value: intent.authorization.value,
  validAfter: intent.authorization.validAfter,
  validBefore: intent.authorization.validBefore,
  nonce: intent.authorization.nonce,
  v: intent.authorization.v,
  r: intent.authorization.r,
  s: intent.authorization.s,
})

const feeAuthOf = (intent) => authTuple(intent.feeAuthorization ?? EMPTY_AUTH)

export const ACTIONS = {
  // ---- WagerRegistry, no-stake ----
  claimPayout: withSigAction({
    contract: 'wagerRegistry', typeName: 'ClaimPayoutIntent', actorField: 'claimant',
    fn: 'claimPayoutWithSig', paramNames: ['wagerId'], buildArgs: sigArgs('wagerId'),
  }),
  claimRefund: withSigAction({
    contract: 'wagerRegistry', typeName: 'ClaimRefundIntent', actorField: 'actor',
    fn: 'claimRefundWithSig', paramNames: ['wagerId'], buildArgs: sigArgs('wagerId'),
  }),
  declareDraw: withSigAction({
    contract: 'wagerRegistry', typeName: 'DeclareDrawIntent', actorField: 'actor',
    fn: 'declareDrawWithSig', paramNames: ['wagerId'], buildArgs: sigArgs('wagerId'),
  }),
  revokeDraw: withSigAction({
    contract: 'wagerRegistry', typeName: 'RevokeDrawIntent', actorField: 'actor',
    fn: 'revokeDrawWithSig', paramNames: ['wagerId'], buildArgs: sigArgs('wagerId'),
  }),
  cancelOpen: withSigAction({
    contract: 'wagerRegistry', typeName: 'CancelOpenIntent', actorField: 'actor',
    fn: 'cancelOpenWithSig', paramNames: ['wagerId'], buildArgs: sigArgs('wagerId'),
  }),
  declineWager: withSigAction({
    contract: 'wagerRegistry', typeName: 'DeclineIntent', actorField: 'actor',
    fn: 'declineWagerWithSig', paramNames: ['wagerId'], buildArgs: sigArgs('wagerId'),
  }),
  declareWinner: withSigAction({
    contract: 'wagerRegistry', typeName: 'DeclareWinnerIntent', actorField: 'actor',
    fn: 'declareWinnerWithSig', paramNames: ['wagerId', 'winner'],
    buildArgs: (params, signer, intent) => [
      params.wagerId, params.winner, signer, intent.uniquenessMarker,
      intent.validAfter, intent.validBefore, intent.signature,
    ],
  }),

  // ---- WagerRegistry, money-in (payment class) ----
  createWager: withAuthAction({
    contract: 'wagerRegistry', typeName: 'CreateWagerIntent', actorField: 'creator',
    fn: 'createWagerWithAuthorization',
    paramNames: [
      'opponent', 'arbitrator', 'token', 'creatorStake', 'opponentStake', 'acceptDeadline',
      'resolveDeadline', 'resolutionType', 'conditionId', 'creatorIsYes', 'metadataHash',
      'metadataUri', 'termsVersionHash',
    ],
    buildArgs: (params, signer, intent) => [
      [
        params.opponent, params.arbitrator, params.token, params.creatorStake, params.opponentStake,
        params.acceptDeadline, params.resolveDeadline, params.resolutionType, params.conditionId,
        params.creatorIsYes, params.metadataHash, params.metadataUri, params.termsVersionHash,
        intent.authorization.nonce, // paymentNonce — asserted on-chain against stakeAuth.nonce
      ],
      signer, intent.uniquenessMarker, intent.validAfter, intent.validBefore,
      intent.signature, stakeAuthOf(intent), feeAuthOf(intent),
    ],
  }),
  acceptWager: withAuthAction({
    contract: 'wagerRegistry', typeName: 'AcceptWagerIntent', actorField: 'taker',
    fn: 'acceptWagerWithAuthorization', paramNames: ['wagerId'],
    buildArgs: (params, signer, intent) => [
      params.wagerId, signer, intent.uniquenessMarker, intent.validAfter, intent.validBefore,
      intent.signature, stakeAuthOf(intent), feeAuthOf(intent),
    ],
  }),
  acceptOpenWager: withAuthAction({
    contract: 'wagerRegistry', typeName: 'AcceptWagerIntent', actorField: 'taker',
    fn: 'acceptOpenWagerWithAuthorization', paramNames: ['wagerId', 'claimCodeSig'],
    buildArgs: (params, signer, intent) => [
      params.wagerId, signer, params.claimCodeSig, intent.uniquenessMarker, intent.validAfter,
      intent.validBefore, intent.signature, stakeAuthOf(intent), feeAuthOf(intent),
    ],
  }),

  // ---- MembershipManager ----
  purchaseTier: withAuthAction({
    contract: 'membershipManager', typeName: 'PurchaseTierIntent', actorField: 'member',
    fn: 'purchaseTierWithAuthorization', paramNames: ['role', 'tier', 'acceptedTermsHash'],
    buildArgs: (params, signer, intent) => [
      params.role, params.tier, params.acceptedTermsHash, signer, intent.uniquenessMarker,
      intent.validAfter, intent.validBefore, intent.signature, stakeAuthOf(intent), feeAuthOf(intent),
    ],
  }),
  upgradeTier: withAuthAction({
    contract: 'membershipManager', typeName: 'UpgradeTierIntent', actorField: 'member',
    fn: 'upgradeTierWithAuthorization', paramNames: ['role', 'tier', 'acceptedTermsHash'],
    buildArgs: (params, signer, intent) => [
      params.role, params.tier, params.acceptedTermsHash, signer, intent.uniquenessMarker,
      intent.validAfter, intent.validBefore, intent.signature, stakeAuthOf(intent), feeAuthOf(intent),
    ],
  }),
  extendMembership: withAuthAction({
    contract: 'membershipManager', typeName: 'ExtendMembershipIntent', actorField: 'member',
    fn: 'extendMembershipWithAuthorization', paramNames: ['role'],
    buildArgs: (params, signer, intent) => [
      params.role, signer, intent.uniquenessMarker, intent.validAfter, intent.validBefore,
      intent.signature, stakeAuthOf(intent), feeAuthOf(intent),
    ],
  }),
  redeemVoucher: withSigAction({
    contract: 'membershipManager', typeName: 'RedeemVoucherIntent', actorField: 'redeemer',
    fn: 'redeemVoucherWithSig', paramNames: ['voucherId', 'acceptedTermsHash'],
    buildArgs: (params, signer, intent) => [
      params.voucherId, params.acceptedTermsHash, signer, intent.uniquenessMarker,
      intent.validAfter, intent.validBefore, intent.signature,
    ],
  }),
}

/** Allowed action names per target contract key — the version-pinned allow-list (FR-025). */
export function actionsForContract(contractKey) {
  return Object.entries(ACTIONS)
    .filter(([, a]) => a.contract === contractKey)
    .map(([name]) => name)
}

/** Single-type EIP-712 `types` object for an action's intent struct. */
export function typesFor(action) {
  const def = ACTIONS[action]
  return { [def.typeName]: INTENT_TYPES[def.typeName] }
}

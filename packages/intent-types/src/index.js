/**
 * @fairwins/intent-types — the SINGLE definition of every FairWins EIP-712 intent struct.
 *
 * WHY THIS PACKAGE EXISTS (spec 075, FR-024/FR-025)
 * These field lists decide what a member's signature authorises. A mismatch between the signer and
 * the verifier does not raise an error — it produces a signature that verifies against something
 * other than what the member was shown. CLAUDE.md required three copies (contract typehashes, the
 * frontend, the relay gateway) to stay byte-identical, enforced only by human discipline.
 *
 * Discipline held for 26 of 27 structs. It did not hold for the 27th: `InvalidateNonce` existed in
 * the contract and the frontend and was ABSENT from the gateway, so a relayed `invalidateNonce`
 * was an unknown action there. That is the whole argument for this file.
 *
 * WHY IT COULD NOT SIMPLY BE IMPORTED BEFORE
 * `frontend/src` uses extensionless relative imports (Vite-resolved) — 2,966 of them — while the
 * gateway is plain Node ESM, which requires extensions. The gateway physically could not import
 * the frontend's copy, so it kept its own. This package is authored Node-resolvable (extensioned
 * imports, explicit `exports`) so BOTH can consume it.
 *
 * RULES FOR THIS FILE
 *   · Zero runtime dependencies. It is pure data plus one pure function.
 *   · Never import from frontend/src, services/, or a Vite virtual module.
 *   · Changing a struct changes what signatures mean. test/intent/TypehashParity.test.js checks
 *     every entry against the deployed contract's own *_TYPEHASH constant and fails on a mismatch.
 */

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
 * EIP-3009 `ReceiveWithAuthorization` — the token-side leg of every gasless payment intent
 * (`joinWithAuthorization`, stake pulls). Structurally identical to the two copies it replaces:
 * frontend/src/lib/pools/gasless.js and the gateway's own literal.
 *
 * NOTE the asymmetry with everything above: this struct's authoritative typehash lives in the
 * DEPLOYED USDC contract, not in this repository. The only in-repo Solidity copy is
 * contracts/mocks/MockUSDCPermit.sol — a MOCK. So it is verified against a recorded fixed vector
 * rather than against a contract constant; asserting it against the mock would prove nothing.
 */
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

/**
 * Render an EIP-712 type string for `primaryType`, e.g.
 *   `InvalidateNonceIntent(address signer,bytes32 nonce,uint256 validBefore)`
 *
 * keccak256 of this string is the struct's typehash, which is what the Solidity side stores as a
 * `*_TYPEHASH` constant. That equality is the machine check that replaces the convention.
 *
 * Only flat structs are supported, which is all this repo uses — every intent is a single level
 * with value-type fields. A nested custom type would need its referenced types appended in
 * alphabetical order per EIP-712; throw rather than emit a subtly wrong string.
 */
export function typeStringFor(primaryType, types = INTENT_TYPES) {
  const fields = types[primaryType]
  if (!fields) throw new Error(`Unknown intent primaryType: ${primaryType}`)
  for (const f of fields) {
    if (/^[A-Z]/.test(f.type.replace(/\[\]$/, ''))) {
      throw new Error(
        `typeStringFor does not support nested custom types (${primaryType}.${f.name}: ${f.type}). ` +
          'EIP-712 requires referenced types appended in alphabetical order; add that support ' +
          'deliberately rather than emitting a subtly wrong string.',
      )
    }
  }
  return `${primaryType}(${fields.map((f) => `${f.type} ${f.name}`).join(',')})`
}

/**
 * Gateway `action` -> typed-data + routing metadata. Pure data, so it lives here alongside the
 * structs it references (spec 075): both the client that SIGNS and the gateway that VERIFIES
 * derive their action set from this one table, which is what makes a missing action a test
 * failure instead of a runtime "unknown action".
 *
 * Original contract:
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

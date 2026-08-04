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

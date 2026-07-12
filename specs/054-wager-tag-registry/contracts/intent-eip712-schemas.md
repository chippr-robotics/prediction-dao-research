# EIP-712 Intent Schemas: Wager Tag Registry (spec 054)

Domain: the registry's own (`name: "WagerTagRegistry"`, `version: "1"`, chainId,
verifyingContract) via `SignerIntentBase` / `EIP712Upgradeable` — network + contract
isolation per spec 035.

**Sync rule (CLAUDE.md)**: these structs MUST stay byte-identical in three places —
`WagerTagRegistry` typehashes, `frontend/src/lib/relay/intentTypes.js`, and
`services/relay-gateway/src/intent/intentTypes.js`. The relay-gateway policy must allowlist
each primary type. No payment leg: tag actions are free with membership (no EIP-3009 staple).

Common trailing fields on every struct (spec 035 convention):
`nonce: bytes32, validAfter: uint256, validBefore: uint256`. The actor field (`owner`) MUST
equal the recovered signer.

```text
CommitTagIntent(
  address owner,
  bytes32 commitment,
  bytes32 nonce, uint256 validAfter, uint256 validBefore)

RegisterTagIntent(
  address owner,
  string  tag,          // canonical form
  bytes32 salt,
  bytes32 nonce, uint256 validAfter, uint256 validBefore)

ChangeTagIntent(
  address owner,
  string  newTag,
  bytes32 salt,
  bytes32 nonce, uint256 validAfter, uint256 validBefore)

ReleaseTagIntent(
  address owner,
  bytes32 tagHash,      // explicit target: intent can't silently apply to a later tag
  bytes32 nonce, uint256 validAfter, uint256 validBefore)

RequestRepointIntent(
  address owner,
  bytes32 tagHash,
  address newOwner,
  bytes32 nonce, uint256 validAfter, uint256 validBefore)

CancelRepointIntent(
  address owner,
  bytes32 tagHash,
  bytes32 nonce, uint256 validAfter, uint256 validBefore)
```

Notes:

- `finalizeRepoint` / `reclaimLapsed` are permissionless calls — no intent structs.
- `ReleaseTagIntent`/repoint intents pin `tagHash` so a stale signed intent cannot act on a
  tag registered after signing (same defense the wager intents get from pinning `wagerId`).
- Short `validBefore` windows are recommended client-side for `RequestRepointIntent` — it is
  the highest-risk intent (payout redirect); the 48 h on-chain delay remains the backstop.
- Relay-gateway policy additions: per-signer rate limits consistent with on-chain cooldowns;
  the existing screening/quota/killswitch middleware applies unchanged.
- Eligibility is NOT encoded in the struct — no field changes for the Gold-tier gate. The
  `CommitTagIntent` / `RegisterTagIntent` / `ChangeTagIntent` executions are only accepted
  on-chain while the signer holds a Gold-tier-or-above membership (revert
  `InsufficientMembershipTier` otherwise); the relay-gateway policy SHOULD pre-screen the
  signer's tier before relaying so it does not burn gas on a call that will revert.
  `RequestRepointIntent` is exempt from the tier check (recovery/migration safety, FR-022).

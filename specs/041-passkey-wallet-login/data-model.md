# Data Model: Passkey Wallet Accounts & Site-Wide Login Management (041)

Storage locations are one of: **on-chain** (authoritative), **authenticator**
(platform credential manager, never readable by the app), **local**
(browser storage, non-authoritative cache/UX), **sync** (spec-032 encrypted
data sync). No FairWins server storage.

## Entities

### PasskeyCredential *(authenticator + local reference)*

The WebAuthn credential guarding the account. Private key never leaves the
authenticator; may be synced across the user's devices by their platform.

| Field | Type | Storage | Notes |
|---|---|---|---|
| credentialId | bytes (base64url) | local | WebAuthn credential handle for `get()` ceremonies |
| publicKey | P-256 (x,y) | local + on-chain (as owner entry) | registered as an account owner |
| rpId | string | implicit | the FairWins origin; pins credentials to the site |
| prfCapable | boolean | local | detected at creation; drives FR-012 degradation |
| label | string | local | user-facing device label ("Pixel 9", "YubiKey") |
| createdAt | timestamp | local (+ on-chain event time) | shown in controllers panel (FR-018) |

### PasskeyAccount *(on-chain, authoritative)*

The ERC-4337 smart account = the FairWins identity (FR-005/FR-010).

| Field | Type | Storage | Notes |
|---|---|---|---|
| address | address | derived | `factory.getAddress(initialOwners, nonce)`; identical on all networks (FR-023); fixed by the initial owner set forever |
| owners | list<bytes> | on-chain | P-256 pubkeys and/or EOA addresses; add/remove only by an existing owner (FR-019/FR-020); never empty (FR-020) |
| deployedPerNetwork | map<chainId, bool> | on-chain (code exists) | counterfactual until first action on that network (FR-007) |
| entryPoint / implementation | address | on-chain | pinned pair from `deployments/` (research §2) |
| roles / balances / wagers | — | on-chain | not new state — existing contracts key off `address`, strictly per network (FR-011/FR-023) |

**State transitions**:
`reserved` (address derived, no code anywhere) → `active(chain)` (first
UserOp with initCode lands on that chain) — one-way, per network. Owner set:
`add(owner)` / `remove(owner)` guarded by `owners.length > 1` on remove.

### AccountController *(on-chain + local projection)*

A row in the controllers panel — union view of on-chain owners with local
credential metadata.

| Field | Type | Storage | Notes |
|---|---|---|---|
| kind | enum passkey \| wallet | derived | P-256 pubkey ⇒ passkey; address ⇒ linked wallet |
| ownerRef | bytes | on-chain | the owner entry |
| label / addedAt | string / timestamp | local / on-chain event | FR-018 |
| screeningStatus | enum clear \| flagged \| unknown | local (advisory) + on-chain guard (authoritative) | wallet controllers only; flagged ⇒ link refused / account flagged (clarification Q2) |
| wrappedSeedPresent | boolean | sync | whether this credential has a wrapped master-seed blob (see EncryptionKeyMaterial) |

### LoginSession *(local)*

| Field | Type | Notes |
|---|---|---|
| activeAddress | address | the connected identity (either account type) |
| loginMethod | enum passkey \| injected \| walletconnect | determines signing ceremony only (FR-002) |
| chainId | number | active network |
| cachedRoles / screeningCache | existing shapes | reconciled on-chain per existing `roleStorage` pattern |
| — expiry | none | persists until explicit sign-out (FR-003, clarification Q4); sign-out clears every row above |

### AccountProfile *(local, non-authoritative)*

`nickname` (FR-018), `preferredNetwork`, `dismissedWarnings`
(device-loss warnings shown at the three FR-021 moments — tracked so they
re-arm until a second controller exists). Never used for authorization.

### EncryptionKeyMaterial *(sync + derived)*

Implements research §6 / FR-012.

| Field | Type | Storage | Notes |
|---|---|---|---|
| masterSeed | 32 bytes | never stored raw | random per account; exists only in memory after unwrap |
| wrappedSeed[credentialId] | AEAD blob | sync (spec-032 channel) | masterSeed encrypted under KEK = HKDF(PRF(salt_fairwins)) of that credential |
| wrappedSeed[eoa] | AEAD blob | sync | optional: masterSeed wrapped under the legacy signature-derived key of a linked EOA controller |
| saltFairwins | constant | code | fixed PRF eval point, versioned like the existing encryption-terms message |
| derivedKeys | x25519 + X-Wing | derived in memory | fed into the existing envelope-encryption stack unchanged |

**Invariants**: every PRF-capable controller SHOULD have a wrappedSeed blob
(created at add time); removing a controller removes its blob (with on-chain
removal as the authoritative revocation); an account whose controllers are
all non-PRF has no masterSeed and shows encrypted features as unavailable
(clarification Q1).

### SubmissionRoute *(config + runtime, local)*

Per-network routing table for research §3.

| Field | Type | Notes |
|---|---|---|
| intentRelayerUrl | url | 036 relayer endpoint (existing config key) |
| bundlerUrls | url[] | ordered: self-hosted alto first, third-party fallbacks |
| erc20PaymasterUrl | url? | optional fee-in-USDC path (research §4) |
| health | enum per endpoint | drives FR-017 bounded-time failure surfacing and the clarification-Q3 fee fallback |

## Relationships

```text
PasskeyCredential 1..n ──owns──► PasskeyAccount 1 ──is──► identity for roles/wagers/pools (existing entities)
LinkedWallet(EOA)  0..n ──owns──► PasskeyAccount
PasskeyAccount 1 ──has 0..1──► EncryptionKeyMaterial (masterSeed) ──wrapped per──► each controller
Browser 1 ──holds──► LoginSession 0..1 + AccountProfile 0..n
SubmissionRoute: per chainId, consumed by the connector for every write
```

## Validation rules (from requirements)

- Owner-set changes: authorized by existing owner; `remove` blocked when it
  would empty the set (FR-020); wallet links require screening pass
  (FR-019 + clarification Q2).
- Address derivation inputs (initialOwners, nonce, factory address) MUST be
  identical across networks — enforced by deploy script assertions (FR-023).
- Fee disclosure precedes every ceremony (FR-008); stablecoin-denominated
  where the USDC fee path is active (FR-014).
- Session state is cleared atomically on sign-out; switching login method
  swaps the whole LoginSession (no cross-account bleed, FR-024).

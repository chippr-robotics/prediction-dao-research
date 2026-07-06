# Passkey wallet accounts (spec 041)

FairWins passkey accounts are **self-custodial ERC-4337 smart accounts** owned
by WebAuthn P-256 credentials (device biometrics). This guide covers the
architecture; the user-facing recovery story lives in
`docs/user-guide/passkey-recovery.md`, ops in
`docs/runbooks/relayer-operations.md`.

## Contract stack (`contracts/account/`)

Vendored **Coinbase Smart Wallet v1.1.0** + pinned dependency closure —
provenance and the vendoring rules (no logic modifications, path-only import
rewrites) are in `contracts/account/README.md`. Key properties the platform
relies on:

- **Multi-owner**: P-256 public keys (passkeys) and EOA addresses (linked
  wallets) are interchangeable controllers; add/remove is owner-authorized
  self-calls; `removeOwnerAtIndex` reverts on the last owner (FR-020).
- **ERC-1271** with a per-account replay-safe hash — how passkey accounts
  sign spec-035 intents and USDC EIP-3009 authorizations (ERC-7598).
- **`executeBatch`** — approve+act in ONE user ceremony (FR-016).
- **WebAuthnSol**: RIP-7212 precompile first (3,450 gas on Polygon/Amoy),
  FreshCryptoLib Solidity fallback elsewhere — the same bytecode serves the
  deferred ETC/Mordor increment (FR-022).
- **UUPS upgradable by its owners only** — FairWins holds no authority over
  instances (plan.md Complexity Tracking).

Deployment: `scripts/deploy/deploy-account-stack.js` deploys the
implementation + factory through the canonical CREATE2 deployer with a pinned
salt, so **`accountFactory` has the same address on every network** and
account addresses are chain-independent (FR-023). Recorded deployment keys:
`entryPoint`, `accountFactory`, `accountImpl`, `p256Verifier` (explicit null —
the FCL fallback is inlined). Never hardcode these; they flow through
`sync:frontend-contracts`.

## ERC-1271 intent signing

The merged 035/036 rails originally verified intent signers with ECDSA only.
Spec 041 extended `contracts/upgradeable/SignerIntentBase.sol` with an
ECDSA-then-ERC-1271 check (OZ SignatureChecker semantics, inlined — see the
file's comment for the Cancun `mcopy` constraint) and
`services/relay-gateway/src/intent/verify.js` with the matching fail-closed
`isValidSignature` eth_call fallback. Ship path for live networks:
`scripts/deploy/upgrade-erc1271-intents.js` (in-place upgrades of both
registry facets + `membershipManagerImpl`, storage-layout gated; new
`WagerPool` template for FUTURE clones — existing clones are immutable and
stay ECDSA-only for `…WithSig` twins).

**Scope note**: the EIP-3009 *payment leg* (`ERC3009Auth` v/r/s) is still
ECDSA-only — passkey stake-moving actions ride `executeBatch` UserOps until
the ERC-7598 bytes leg is plumbed through the twins.
`test/fork/usdc-erc1271-authorization.test.js` already proves native USDC
accepts the contract-account authorization.

## Frontend architecture (`frontend/src/lib/passkey/`, `connectors/passkey.js`)

- **`credentials.js`** — WebAuthn ceremonies (PRF requested at creation),
  capability detection (FR-004), typed errors (`CeremonyCancelled`,
  `AuthenticatorUnavailable`), local credential bookkeeping.
- **`smartAccount.js`** — viem-native account layer (`viem/account-abstraction`,
  no vendor SDK): address derivation, owner-bytes encodings, controller
  mutation encoders with last-owner/screening guards, controller reads.
- **`submission.js`** — the routing decision table: relayed intent first
  (gasless), ordered bundler list for UserOps, `SubmissionUnavailable` when
  both are down; honest lifecycle tracking (never `included` before
  inclusion, `stalled` after the window — FR-017).
- **`intentSigner.js`** — drop-in `signer` adapter for the EXISTING
  `lib/relay/intentClient.signIntent`: EIP-712 types imported from
  `lib/relay/intentTypes.js` (three-way byte-identical rule), ERC-1271
  WebAuthn envelope out.
- **`prfKeys.js`** — WebAuthn PRF → HKDF → AES-GCM master-seed wrapping: same
  encryption keys on every device/controller; explicit degradation on
  non-PRF authenticators (clarification Q1) — never silently-wrong keys.
- **`sendBatch.js`** — fulfills `WalletContext.sendCalls` for passkey
  sessions; counterfactual accounts activate automatically via initCode on
  the first action (FR-007).
- **Connector** (`fairwinsPasskey`) — sign-up/sign-in, silent reconnect,
  sessions persist until sign-out (clarification Q4), `ChainNotSupportedError`
  on networks without passkey config (FR-022).

`WalletContext` exposes `loginMethod` (informational only — identity and
gating ALWAYS key off `address`), `accountCapabilities.encryption`, and
`sendCalls`. Classic-wallet paths are untouched (SC-004).

## Compliance

Screening keys off the **account address** everywhere. Additionally
(clarification Q2): linked wallet controllers are screened at link time
(refused when flagged OR unscreenable — fail-closed) and re-screened with the
account (`usePasskeyAccount.accountFlagged`); on-chain guards remain
authoritative.

## Network scope

Polygon (137) + **Amoy (80002, the passkey validation network)**. ETC/Mordor
are a deferred increment: self-deploy the EntryPoint + factory (same salt →
same addresses), WebAuthnSol falls back to FCL, bundler must be self-hosted.
The deploy script hard-fails on any cross-network factory divergence.

## Complexity-tracking exceptions (plan.md)

1. The self-hosted **alto bundler** colocated with the relay gateway extends
   the spec-036 no-backend exception (same "can censor, cannot steal" bound).
2. User-owned account proxies sit **outside the UUPSManaged regime** — only
   account owners hold upgrade authority.

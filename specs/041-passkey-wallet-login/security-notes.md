# Security Notes — Spec 041 Foundational Phase (T027)

**Scope reviewed**: `contracts/account/` (vendored Coinbase Smart Wallet v1.1.0
closure), the `SignerIntentBase.sol` ERC-1271 extension, deploy/upgrade scripts
(`deploy-account-stack.js`, `upgrade-erc1271-intents.js`), the relay-gateway
`verify.js` ERC-1271 fallback, and the frontend key-handling module
(`lib/passkey/prfKeys.js`). Checklist per
`.github/agents/smart-contract-security.agent.md`; constitution Principle I.

## Static analysis

- **Slither**: runs as the gating "Slither Static Analysis" CI job; green on
  the branch pushes containing `contracts/account/` and the `SignerIntentBase`
  change (PR #799 checks, 2026-07-04). No new high/critical findings surfaced.
  Vendored-code informational findings (assembly usage in solady/FCL,
  low-level calls in `CoinbaseSmartWallet._call`) are **accepted**: they are
  upstream-audited patterns; forking to "fix" them would forfeit the audit
  (contracts/account/README.md).
- **Medusa**: the existing `WagerRegistryFuzzTest` corpus covers the registry
  facets post-upgrade (verification-logic change only; no state machinery
  touched). No new stateful surface was added by 041's contract change.

## Review findings & accepted risks

1. **`SignerIntentBase._isValidSignerSignature`** (the one FairWins-authored
   contract change):
   - ECDSA-first ordering preserves the EOA gas profile; the ERC-1271 leg is a
     `staticcall` (read-only — no reentrancy surface) executed BEFORE the
     nonce burn, with the burn still preceding all external interactions of
     the calling twin (checks → effects → interactions held).
   - Return-data validation requires ≥32 bytes AND the exact magic word —
     short/garbage returns are rejected (tested: `MockERC1271` matrix).
   - A malicious *signer contract* that answers "valid" to everything can only
     authorize **its own** intents — identical trust semantics to an EOA
     signing freely. No cross-account authority exists.
   - DoS consideration: a signer contract with an expensive `isValidSignature`
     only burns the relayer's gas allowance for that one call; the gateway
     pre-verifies off-chain (same ERC-1271 check) and refuses invalid intents
     before any engine submission.
2. **Vendored wallet custody**: only registered owners can execute, add or
   remove controllers, or upgrade (`_authorizeUpgrade` = onlyOwner). FairWins
   deploys the factory but holds **zero** authority over instances. The
   `removeLastOwner` escape hatch exists upstream; the FairWins UI never calls
   it and `removeOwnerAtIndex` reverts `LastOwner` (tested) — FR-020 holds for
   every app path.
3. **Deterministic deploy**: `deploy-account-stack.js` refuses to run without
   the canonical CREATE2 deployer and EntryPoint v0.6, and hard-fails on any
   cross-network `accountFactory` divergence — misconfiguration cannot
   silently fork account identities (FR-023).
4. **Gateway ERC-1271 fallback** mirrors the on-chain check exactly and is
   fail-closed (no provider / no code / revert / wrong magic ⇒ reject); the
   payment class stays strict-ECDSA, so no relaxation of the EIP-3009 leg.
5. **PRF key handling** (`prfKeys.js`, constitution I applied to key code):
   master seed is generated from `crypto.getRandomValues`, held memory-only,
   wrapped per-credential with AES-GCM under an HKDF-SHA256 KEK from the PRF
   output; AEAD auth failure surfaces `EncryptionUnavailable` — the
   no-silent-wrong-keys invariant is tested. Blob store carries only
   ciphertext; `SALT_FAIRWINS_V1` / `fairwins-kek-v1` info-strings are
   versioned constants.

## Known limitations (documented, not defects)

- Existing immutable `WagerPool` clones keep ECDSA-only `…WithSig` twins; the
  new `poolImpl` template covers future clones (tasks T013; plan Complexity
  Tracking).
- Payment-carrying intents (`ERC3009Auth` v/r/s) remain EOA-only until the
  ERC-7598 bytes leg is plumbed through the twins; passkey accounts use
  `executeBatch` UserOps for stake-moving actions meanwhile. The fork test
  (T015) already proves native USDC accepts the contract-account
  authorization for that future step.

## Fee benchmark (T059)

Placeholder — populated when the SC-006 benchmark runs on Amoy
(`scripts/ops/passkey-fee-benchmark.js`).

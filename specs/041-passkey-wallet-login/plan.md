# Implementation Plan: Passkey Wallet Accounts & Site-Wide Login Management

**Branch**: `claude/passkey-wallet-login-lyiv8c` (spec dir `041-passkey-wallet-login`) | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/041-passkey-wallet-login/spec.md`

## Sequencing decision (binding for this plan)

The maintainer decided that **041 implementation begins only after specs 035
(intent-based signatures) and 036 (self-hosted relayer) are implemented and
deployed**. That gate has since been satisfied: **PR #800 merged the 035/036
implementation** (intent facets + `services/relay-gateway` policy gateway +
`services/oz-relayer` engine config), and **PR #793 merged the spec-034
rework** (Semaphore removed; address-based `WagerPool`/`WagerPoolFactory`
with `SignerIntentBase`-powered `…WithSig` twins). This plan therefore
assumes:

- The FairWins **relayer is live** (`services/relay-gateway` +
  `services/oz-relayer`) and is the **first-party submission path**; the
  spec's "third-party, replaceable submission infrastructure" posture remains
  as fallback/defense-in-depth. Spec FR-013 is interpreted as **"the design
  must not hard-depend on the relayer"**, not "the relayer won't exist".
- **Platform-wide intents (035) exist on the contracts.** Passkey smart
  accounts sign those intents as contract accounts (ERC-1271 per USDC v2.2 /
  ERC-7598); we do not invent a parallel action path.
  **Post-merge finding (analysis C1)**: the merged rails verify intent
  signers with **ECDSA only** (`SignerIntentBase.sol` `digest.recover`,
  gateway `verify.js` `ethers.verifyTypedData`) — a contract account can
  never satisfy them. **Enabling ERC-1271 signers is foundational work in
  this feature** (research.md §11; tasks T011–T015): a logic-only
  `SignatureChecker` extension shipped as in-place upgrades of both registry
  facets + `membershipManagerImpl` (storage-layout gated), a matching
  gateway fallback, and a new `poolImpl` for future pool clones (existing
  clones are immutable and stay ECDSA-only).
- The relayer's compliance screening, self-submit fallback, and edge
  perimeter (036) apply to passkey traffic too.

Consequence: most user actions from a passkey account are **intents relayed
by the relay gateway** (fully gasless for the user). The ERC-4337
UserOperation path is needed for (a) operations on the smart account itself
(deploy, add/remove controllers, upgrades), (b) actions not covered by 035
intents, and (c) the self-sufficiency fallback when the relayer is down
(FR-013/FR-014).

> **Open point for the maintainer**: PR #793 moved the *pools* launch
> sequence to **Mordor → Polygon (no Amoy)**. 041's clarified network scope
> (Polygon 137 + Amoy 80002 first; ETC/Mordor later) is driven by a physical
> constraint — Mordor has no RIP-7212 precompile, no canonical EntryPoint,
> and no bundler infrastructure — so this plan keeps Amoy as the passkey
> validation network. If the platform standardizes on Mordor-first testing,
> the ETC/Mordor increment (self-deploy EntryPoint + FCL fallback verifier +
> self-hosted-bundler-only) moves forward in priority and should be
> re-scoped via `/speckit-clarify`.

## Summary

Add passkey (WebAuthn/P-256) login as a first-class connector in the existing
wagmi v3 + viem architecture. A passkey user gets a **standards-based
ERC-4337 smart account** (vendored, audited, open-source implementation with
a WebAuthn owner validator that uses the RIP-7212 precompile on Polygon/Amoy
and a Solidity P-256 verifier fallback elsewhere), deployed counterfactually
with the **same address on every platform network**. Actions route
**intents-first through the 036 relayer** (signed via ERC-1271); account
management and fallback route as UserOperations through a bundler (self-
hosted alongside the relayer, with configurable third-party fallback).
Encryption keys derive from the **WebAuthn PRF extension** (device-dependent
degradation per the clarification session), with a per-account master key
wrapped per-credential so all controllers derive the same keys. One
contract-side enabler ships with this feature: the merged intent rails are
extended from ECDSA-only to **`SignatureChecker` (ERC-1271) signer
verification** so contract accounts can sign intents at all (analysis C1,
research.md §11). The site-wide login manager unifies passkey + injected +
WalletConnect behind the existing `WalletContext` single source of truth; no
existing flow changes for classic wallets. See [research.md](./research.md)
for the technology decisions and alternatives.

## Technical Context

**Language/Version**: Solidity ^0.8.x (vendored smart-account contracts +
deploy/verify glue), JavaScript ES2022 / React 18 + Vite (frontend), Node 20
(scripts, relayer/bundler ops from 036)

**Primary Dependencies**:
- `wagmi ^3.6` + `viem ^2.53` — already in the frontend; viem's
  `viem/account-abstraction` module (bundler client, smart-account and
  WebAuthn-owner abstractions) and WebAuthn P-256 helpers are the integration
  surface — **no new vendor SDK**
- Vendored ERC-4337 smart-account contracts: **Coinbase Smart Wallet
  (`coinbase/smart-wallet`, BSD-3)** — multi-owner (passkey pubkeys + EOA
  addresses), ERC-1271, `executeBatch`, WebAuthnSol with RIP-7212-first +
  FreshCryptoLib Solidity fallback, deterministic CREATE2 factory (same
  address cross-chain), user-controlled UUPS upgrade — final selection
  rationale + alternatives in research.md §1
- ERC-4337 `EntryPoint` (canonical deployment on Polygon/Amoy; self-deployed
  deterministically on ETC/Mordor in the later increment)
- Self-hosted open-source bundler (Pimlico `alto`, MIT) colocated with the
  036 relayer deployment (`services/relay-gateway` + `services/oz-relayer`);
  third-party public bundler endpoints as configured fallback
- Merged relay stack (specs 035/036): `frontend/src/lib/relay/`
  (`intentClient.js`, `intentTypes.js`, `useIntentAction.js`, `errors.js`,
  `IntentStatus.jsx`) — the passkey intent path builds ON these, never beside
  them; EIP-712 intent structs stay byte-identical in three places (contract
  typehashes ↔ `frontend/src/lib/relay/intentTypes.js` ↔
  `services/relay-gateway/src/intent/intentTypes.js`)
- Existing: ethers v6 (legacy EOA signer paths), MembershipManager /
  WagerRegistry / SanctionsGuard ABIs via `sync:frontend-contracts`

**Storage**: No new FairWins datastore. Browser: wagmi/localStorage session
persistence (existing pattern), local account profile (nickname). On-chain:
account owner set, roles, funds. Wrapped encryption-key blobs ride the spec
032 encrypted-data-sync channel. Bundler/relayer operational state is 036's
already-scoped datastore.

**Testing**: Hardhat unit + integration for vendored contracts and deploy
scripts (P-256 verifier exercised via the Solidity fallback since Hardhat has
no RIP-7212 precompile; precompile path covered by Amoy live/fork checks);
Vitest for connector/context/hooks with a mocked authenticator; Cypress e2e
with the Chrome DevTools **virtual WebAuthn authenticator** for full passkey
journeys; existing suites must pass unchanged (SC-004).

**Target Platform**: Web SPA (evergreen browsers with WebAuthn platform
authenticators) against Polygon PoS (137) + Amoy (80002); ETC (61) / Mordor
(63) deferred increment per spec FR-022.

**Project Type**: Web (frontend + contracts + ops scripts; no new backend
beyond the 036 exception).

**Performance Goals**: SC-001 ≤60 s / ≤3 interactions to fundable account;
SC-005 ≤10 s returning sign-in; SC-006 passkey fee ≤2× classic fee per
action; single biometric prompt per user action (SC-002, via `executeBatch`
for approve+act).

**Constraints**: Self-custody (FairWins can never sign/move funds — FR-006);
no new always-on FairWins service beyond extending the 036 exception with a
bundler process (SC-009, Complexity Tracking); same account address on every
platform network (FR-023) → deterministic factory + pinned EntryPoint/factory
addresses; sessions persist until sign-out (FR-003); per-transaction WebAuthn
ceremony (FR-008); storage append-only / UUPSManaged rules apply only to
FairWins-managed proxies — user accounts are user-controlled (see
Constitution Check).

**Scale/Scope**: Early-stage: thousands of passkey accounts, tens of
concurrent onboardings; one new connector, one account-management surface,
~4 vendored contracts + deploy scripts, no subgraph changes (wagers/pools
index by address as today).

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.0.0 before
Phase 0; re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Security-first contracts | PASS (with obligations) | Vendored, upstream-audited account contracts are still in-repo Solidity: they enter `contracts/` (new `contracts/account/` area), MUST pass Slither/Medusa in CI, and get the `.github/agents/` security review. Custody analysis: only user credentials control accounts (FR-006); FairWins deploys the factory but holds no authority over instances. Upgrade authority over an account belongs to its owners, not FairWins — explicitly reasoned in research.md §1. |
| II. Test-first | PASS | Test obligations enumerated per artifact in quickstart.md; contract tests land with the vendored contracts, connector/UI tests with each frontend slice; failure paths (declined ceremony, bundler down, relayer down, flagged controller) are first-class cases. |
| III. Honest state | PASS | Counterfactual (never-deployed) accounts shown as "ready to receive, activates on first action"; UserOp/intent lifecycle surfaced truthfully (pending until on-chain inclusion — FR-017); encrypted features show explicit unavailability on non-PRF authenticators (FR-012). |
| IV. Fail loudly in CI | PASS | New CI jobs (contract tests for `contracts/account/`, Cypress passkey e2e) gate normally; no `continue-on-error`. |
| V. Accessible, consistent frontend | PASS | Login surface + account management meet WCAG 2.1 AA (axe/Lighthouse in CI); all new addresses (entryPoint, accountFactory, p256Verifier) flow through `deployments/` + `sync:frontend-contracts` — never hardcoded. |
| Tech stack constraint | PASS (justified) | New "core technology" = WebAuthn + ERC-4337 via viem's built-in module and vendored BSD-3 contracts; no proprietary SDK, no new framework. Justification: required by the feature (P-256 credentials cannot control EOAs). |
| Upgradeable-contracts guardrail (CLAUDE.md/specs 025/027) | PASS (scoped exception, documented) | The UUPSManaged/append-only/`check:storage-layout` regime governs **FairWins-managed** proxies. Smart-wallet instances are **user-owned** proxies upgradable only by their owners; FairWins never holds upgrade authority and ships no in-place upgrades to them. The factory itself is deployed **immutable** (not a FairWins UUPS proxy). Recorded in Complexity Tracking. The ERC-1271 enablement (analysis C1) touches FairWins-managed contracts and follows the sanctioned path exactly: logic-only `SignerIntentBase` change, in-place upgrade of both registry facets (storage from `WagerRegistryCore`, `check:storage-layout` gating) + `membershipManagerImpl` via the `upgrade-gasless-intents.js` pattern; pools get a new `poolImpl` for future clones (existing clones immutable by design). |
| No-backend rule (spec 007, as amended by 036) | PASS (extends 036 exception) | The bundler is a stateless-authority, operationally-stateful process colocated with the 036 relayer, same "can censor, cannot steal" bound, same edge perimeter, same self-submit-style fallback (third-party bundlers + native-gas path). No new user-data backend. Recorded in Complexity Tracking. |

**Post-Phase-1 re-check**: design artifacts (data-model.md, contracts/,
quickstart.md) introduce no additional violations; the two scoped exceptions
above remain the only entries in Complexity Tracking. GATE: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/041-passkey-wallet-login/
├── plan.md              # This file
├── research.md          # Phase 0: decisions + alternatives
├── data-model.md        # Phase 1: entities, state, storage locations
├── quickstart.md        # Phase 1: end-to-end validation guide
├── contracts/           # Phase 1: interface contracts
│   ├── passkey-connector.md      # wagmi connector + WalletContext surface
│   ├── onchain-deployments.md    # vendored contracts, deployment keys, addresses
│   ├── submission-and-fees.md    # intent-first routing, UserOp path, fee fallback
│   └── key-derivation.md         # PRF → HKDF → master-key wrap contract
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
contracts/
└── account/                        # NEW: vendored smart-account stack (see contracts/onchain-deployments.md)
    ├── CoinbaseSmartWallet.sol     # vendored account implementation (+ factory, WebAuthnSol, FCL verifier)
    └── ...                         # exact vendored file set pinned in research.md §1

scripts/
├── deploy/
│   └── deploy-account-stack.js     # NEW: deterministic factory/EntryPoint/verifier deploy + deployments/ recording
└── sync-frontend-contracts.js      # EXTENDED: new keys entryPoint, accountFactory, p256Verifier

deployments/                        # EXTENDED: per-network entries for the new keys

test/
├── account/                        # NEW: Hardhat unit tests (owner mgmt, ERC-1271, executeBatch, P-256 fallback verify)
└── integration/
    └── passkey-account.e2e.test.js # NEW: membership purchase + wager flow from a smart account (msg.sender = account)

frontend/src/
├── connectors/
│   └── passkey.js                  # NEW: wagmi createConnector wrapping viem smart account + WebAuthn owner
├── lib/passkey/                    # NEW: credential ceremonies, account client, PRF key derivation, storage
│   ├── credentials.js              # WebAuthn create/get, credential-id bookkeeping, capability detection (FR-004)
│   ├── smartAccount.js             # account address derivation, UserOp build/submit, executeBatch composition
│   ├── submission.js               # intent-first routing: 035 intent via 036 relayer ⇄ UserOp via bundler (fallback matrix)
│   └── prfKeys.js                  # PRF → HKDF → master-key wrap/unwrap (see contracts/key-derivation.md)
├── contexts/WalletContext.jsx      # EXTENDED: signer abstraction (viem-first for smart accounts; ethers path kept for EOA)
├── components/wallet/
│   ├── WalletButton.jsx            # EXTENDED: "Continue with passkey" option (FR-001/FR-004)
│   └── PasskeyOnboarding.jsx       # NEW: sign-up ceremony, warnings (FR-021), funding view reuse (spec 011)
├── components/account/
│   └── ControllersPanel.jsx        # NEW: controllers list, add passkey/link wallet/remove, screening states (FR-018–FR-021)
└── hooks/
    └── usePasskeyAccount.js        # NEW: account state, controllers, capability + degradation flags

frontend/src/lib/relay/             # 035/036-owned intent stack; REUSED as-is (intentClient, intentTypes,
                                    #   useIntentAction, errors, IntentStatus) — passkey intentSigner builds on it

contracts/upgradeable/SignerIntentBase.sol   # EXTENDED: ECDSA-only recover → SignatureChecker (ERC-1271 fallback);
                                             #   shipped via in-place upgrade of both registry facets + membershipManagerImpl
services/relay-gateway/src/intent/verify.js  # EXTENDED: ERC-1271 eth_call fallback for contract-account signers
services/relay-gateway/ + services/oz-relayer/  # 036-owned; otherwise EXTENDED by ops config only:
                                                #   colocated alto bundler + endpoints (docs/runbooks/relayer-operations.md)
```

**Structure Decision**: Follow the existing three-workspace layout
(contracts/ + frontend/ + scripts/, with services/ owned by 036). All new
frontend code hangs off the existing `WalletContext` single-source-of-truth
pattern rather than introducing a parallel state tree; all new addresses
flow through `deployments/` → `sync:frontend-contracts` per constitution V.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Bundler process added to the 036 relayer deployment (extends the spec-007 no-backend exception) | ERC-4337 UserOperations require a bundler; account-management ops and the relayer-down fallback cannot ride 035 intents | Third-party-bundler-only: leaves ETC/Mordor increment impossible (no public bundlers) and puts an un-vetted third party on the only path to account control changes; the 036 exception already establishes the ops posture ("can censor, cannot steal", edge perimeter, funded hot wallet) |
| User-owned upgradeable proxies that do NOT use `UUPSManaged.sol` (deviation from the specs-025/027 house pattern) | Smart-wallet instances must be upgradable by **their owners only**; routing upgrade authority through FairWins' UUPSManaged would give FairWins authority over user funds and violate FR-006 | Freezing accounts as immutable clones: forecloses future account-standard migration for users and diverges from the vendored implementation's audited upgrade path; re-rolling our own account contract violates "don't re-roll audited wiring" |

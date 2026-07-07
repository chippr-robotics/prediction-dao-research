# Implementation Plan: Safe Multisig Custody

**Branch**: `claude/fairwins-safe-multisig-custody-322ady` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/043-safe-multisig-custody/spec.md`

## Summary

Bring the Safe (v1.4.1) multisignature vault pattern into FairWins as a **Custody** area under **My Wallet →
Finance**, with **On chain** (multisig) and **Off chain** (disabled placeholder) sub-sections. Members create
or load Safe vaults, and propose / approve / execute vault transactions using an **entirely on-chain** flow —
`approveHash` + `execTransaction` with pre-validated signatures — with **no hosted Safe Transaction Service and
no app backend**. Pending-transaction discovery is served by a tiny, events-only on-chain **`SafeProposalHub`**
helper (censorship-resistant, serverless) with a signed EIP-712 payload link/QR as the never-stranded fallback.
An **active-identity ("operate as") seam** lets a member act as a vault across the app's money-moving surfaces
(wagers, Pay & Transfer, ClearPath, Token Mint, Membership, Trade/Swap): each such action becomes a
threshold-gated Safe transaction. Vault references + labels ride the existing encrypted backup (spec 032);
vault events register as a new **Custody** activity source in the notification system (spec 031).

## Technical Context

**Language/Version**: Solidity `^0.8.x` (Hardhat) for the one new helper contract; JavaScript/JSX (React 18 +
Vite) for the frontend, using **ethers v6** (the codebase's contract layer) atop wagmi v3 / viem v2 connection
state. Vitest for frontend tests; Hardhat (Mocha/Chai) for contract tests.

**Primary Dependencies**: Existing app stack only. Interact with Safe via **hand-maintained minimal ABIs** in
`frontend/src/abis/` (`Safe`, `SafeProxyFactory`, `MultiSendCallOnly`, and the new `SafeProposalHub`) called
through ethers v6 — **no new runtime Safe SDK** (`@safe-global/protocol-kit` is rejected below). Canonical Safe
addresses are configuration, not a dependency.

**Storage**:
- On-chain: existing Safe v1.4.1 singletons/factory/handler/MultiSend (external, immutable); one new
  events-only `SafeProposalHub` (holds no funds, no state beyond events); the vault itself is the source of
  truth for owners/threshold/nonce/approvedHashes.
- Client-side: vault references + labels in the same `localStorage`-then-encrypted-backup path used by the
  address book (spec 032 `syncedObjects`); proposal preimages cached locally by the proposer and rediscovered
  from `SafeProposalHub` events by co-owners.

**Testing**: Vitest unit/component/a11y (`vitest-axe`) under `frontend/src/test/{custody,sources,backup}`;
Hardhat unit + integration for `SafeProposalHub` and the vault-transaction encoders under `test/`; fork tests
against Mordor/Polygon Safe deployments for the create/approve/execute round-trip.

**Target Platform**: PWA (browsers, desktop/mobile) on Mordor (63) and Polygon (137) at launch; Ethereum
Classic mainnet (61) ready at the contract level (addresses verified) but gated on an app-level ETC network
block (prerequisite, see Constraints).

**Project Type**: Web application (existing `frontend/` + `contracts/` monorepo).

**Performance Goals**: UI interactions ≤ standard app expectations; vault state reads batched to keep the
Custody panel responsive (initial vault load < 2s on a healthy RPC). No new latency-critical path — approvals
and execution are user-initiated on-chain transactions.

**Constraints**:
- **On-chain only / no app backend** (FR-017): approvals and execution use Safe primitives; discovery uses the
  on-chain hub + never-stranded EIP-712 payload fallback. No hosted Safe Transaction Service, Client Gateway,
  or Config Service (unlike etclabscore/web-core, which self-hosts that stack).
- **Networks gated by Safe availability** (FR-030): Custody renders only where the Safe factory + `SafeProposalHub`
  resolve for the active chain; otherwise it shows "unavailable on this network." Launch = Mordor (63) +
  Polygon (137). **ETC mainnet (61) requires adding an ETC entry to the app's network config** (`contracts.js`
  has no `61` block today) — treated as a prerequisite, not part of this feature's core.
- **Safe as signer cannot use the gasless intent twins**: `WagerRegistry`/`MembershipManager` `…WithSig` /
  `…WithAuthorization` verify EOA signatures via `ecrecover` only (no EIP-1271), so a vault must self-submit
  every action via `execTransaction`. This is consistent with the on-chain-only decision.

**Scale/Scope**: ~1 new tiny contract; ~1 Custody page/panel tree; 1 activity source; 1 synced-object entry;
1 active-identity context + a shared `submitAsActiveAccount` seam wired into 7 existing submit chokepoints
(staged by priority). Six prioritized user stories from the spec.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Security-First Smart Contracts (NON-NEGOTIABLE)** | One new contract, `SafeProposalHub`, is **events-only**: it holds no funds, custodies nothing, and grants no authority over any Safe (it merely emits a proposer-supplied preimage; integrity is enforced by owners recomputing `getTransactionHash` before approving). It follows checks-effects-interactions trivially (no state, no external calls), and MUST pass Slither + the smart-contract security agent review and target EthTrust-SL L2. All *authority* stays in the audited Safe v1.4.1 contracts. **Fund custody is delegated to Safe, not re-rolled.** Vault-transaction encoding (pre-validated signatures, MultiSend batching) is client-side and covered by fork tests. ✅ within principle. |
| **II. Test-First & Coverage (NON-NEGOTIABLE)** | `SafeProposalHub` gets unit + integration tests; the client vault-tx encoders (hash, pre-validated sig ordering, MultiSend) get unit tests + a Mordor/Polygon fork test for the full create→approve→execute round-trip (resolution/claim/refund paths for vault-owned wagers included). Frontend logic (identity switch, proposal lifecycle, source detection, backup round-trip) gets Vitest coverage. ✅ |
| **III. Honest State, No Mocks** | All vault state (owners, threshold, nonce, approvals, balances) read live from chain; pending proposals reflect real on-chain `approvedHashes`. Not-yet-approved actions exist **only** as pending vault-queue entries (FR-022b) — never surfaced as active wagers/transfers until executed, so no implied finality. Network-scoped vault refs carry `chainId`. **One honest-state reconciliation** required in the spec re: vault-won wager payout claims — see Complexity Tracking. ✅ (with reconciliation) |
| **IV. Fail Loudly in CI** | No `continue-on-error` added. New Hardhat tests, Vitest tests, Slither, and a11y audits gate the pipeline. Storage-layout gating N/A (`SafeProposalHub` is non-upgradeable, stateless). ✅ |
| **V. Accessible, Consistent Frontend** | Custody reuses `PortalNav` tab semantics, existing panel patterns, and the notification-preference surface; new UI meets WCAG 2.1 AA with `vitest-axe` coverage. Safe addresses come from config (the sync-artifact convention), never hand-copied into components. ✅ |
| **Additional: new core tech** | No new runtime dependency (hand-rolled ABIs + ethers v6). Rejecting `@safe-global/protocol-kit` documented in research.md. ✅ |
| **Additional: key management** | No private keys handled; owners sign with their own connected wallets. No secrets. ✅ |

**Gate result**: PASS (one spec reconciliation logged in Complexity Tracking; no unjustified violations).

## Project Structure

### Documentation (this feature)

```text
specs/043-safe-multisig-custody/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + rationale (Safe version, discovery, seam, deps)
├── data-model.md        # Phase 1 — entities, fields, state transitions
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/           # Phase 1 — SafeProposalHub interface + client vault-tx & UI/source/backup contracts
│   ├── SafeProposalHub.md
│   ├── vault-transactions.md
│   └── frontend-integration.md
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
contracts/
└── custody/
    └── SafeProposalHub.sol          # NEW: events-only proposal preimage broadcaster (immutable, no funds)

test/
├── custody/
│   └── SafeProposalHub.test.js      # NEW: unit
├── integration/
│   └── safe-vault-lifecycle.test.js # NEW: create→approve→execute (+ vault-owned wager) via encoders
└── fork/
    └── safe-mordor-polygon.fork.js  # NEW: against live Safe v1.4.1 deployments

scripts/deploy/
└── custody/deploy-safe-proposal-hub.js  # NEW: deploy + record in deployments/, then sync:frontend-contracts

frontend/src/
├── config/
│   ├── contracts.js                 # EDIT: add safeProposalHub key to MORDOR/POLYGON blocks (synced)
│   └── safeContracts.js             # NEW: canonical Safe v1.4.1 addresses per supported chainId + lookup
├── abis/
│   ├── Safe.js, SafeProxyFactory.js, MultiSendCallOnly.js, SafeProposalHub.js   # NEW hand-maintained ABIs
├── contexts/
│   └── CustodyContext.jsx           # NEW: active identity (personal vs vault), operate-as state + indicator
├── lib/custody/
│   ├── safeVault.js                 # NEW: read owners/threshold/nonce/balances; create/load
│   ├── vaultTransaction.js          # NEW: build SafeTx, getTransactionHash, pre-validated sig, MultiSend batch
│   ├── proposalHub.js               # NEW: emit/read Proposed events; EIP-712 payload link/QR fallback
│   └── submitAsActiveAccount.js     # NEW: shared seam — personal send vs vault proposal
├── hooks/
│   ├── useCustodyVaults.js          # NEW: vault list, load-by-address, refresh
│   ├── useVaultProposals.js         # NEW: pending queue + history from chain + hub
│   └── useActiveAccount.js          # NEW: read/switch active identity; expose submit seam
├── components/custody/
│   ├── CustodyPanel.jsx             # NEW: On chain / Off chain sub-sections
│   ├── VaultList.jsx, VaultDetail.jsx, CreateVaultWizard.jsx, LoadVaultForm.jsx
│   ├── ProposalQueue.jsx, ProposalDetail.jsx, ProposeTransactionForm.jsx
│   ├── OwnersThresholdPanel.jsx     # governance (add/remove owner, change threshold)
│   └── OperateAsIndicator.jsx       # NEW: persistent app-wide active-identity banner/switcher
├── pages/WalletPage.jsx             # EDIT: add {id:'custody', label:'Custody'} to Finance group + panel
├── data/notifications/sources/
│   ├── custodySource.js             # NEW: activity source (spec 031)
│   └── index.js                     # EDIT: register custodySource
├── lib/notifications/deliveryPreferences.js  # EDIT: add 'custody' to NOTIFICATION_CATEGORIES
├── data/notifications/domains.js    # EDIT: add custody to DOMAIN_META
├── lib/backup/syncedObjects.js      # EDIT: add vaultReferences synced object (networkScoped)
└── lib/backup/backupBundle.js       # EDIT: extend assertNetworkTagged for vaultReferences
```

**Structure Decision**: Reuse the existing web-app monorepo. Contracts stay under `contracts/custody/`; all
UI/logic under `frontend/src`, integrating through the documented spec-031 (activity source), spec-032
(`syncedObjects`), and WalletPage tab-group seams rather than parallel mechanisms. The active-identity concept
is genuinely new and is isolated in `CustodyContext` + a single `submitAsActiveAccount` seam so the 7 existing
submit chokepoints reroute through one place.

## Complexity Tracking

| Item | Why Needed | Simpler Alternative Rejected Because |
|------|-----------|--------------------------------------|
| **New contract `SafeProposalHub`** (events-only) | On-chain-only discovery of a pending transaction's preimage without a hosted backend; the chain otherwise reveals only the 32-byte hash before execution | *Pure off-chain payload sharing* (link/QR) alone was de-prioritized by the user as the primary mechanism; it remains the never-stranded fallback. *Reusing the encrypted-sync store* was rejected in clarification (on-chain-only). The hub is the minimal on-chain-native answer; it holds no funds and grants no authority, so its risk is far below routing custody through new stateful code. |
| **Active-identity ("operate as") seam** touching 7 chokepoints | Spec (US3, FR-020–022c) requires acting as the vault across all money-moving surfaces | No existing delegation/impersonation concept exists; a per-call `modalSigner` swap can't represent a *contract* account that signs via threshold approvals. A single shared `submitAsActiveAccount` seam is the smallest change that covers all chokepoints; wiring is **staged by priority** (P1: Transfer + Wager; P2: Membership, ClearPath, Token Mint, Trade). |
| **Spec reconciliation — vault-won wager payout claims (FR-022c)** | `WagerRegistry.claimPayout` requires `msg.sender == w.winner` and its gasless twin is EOA-`ecrecover` only (no EIP-1271). A vault that *wins* a wager can only claim by an `execTransaction` **from** the Safe → a threshold-gated action | FR-022c's "inbound needs no approval" holds for plain ERC-20 receipts and for `claimRefund` (caller-agnostic — any owner triggers it, funds route to the vault). It **cannot** hold for wager *payout* claims without a contract change (add EIP-1271 intent support), which is out of scope for v1. Spec FR-022c is reconciled to scope "no-approval inbound" to receipts + refunds, and to note payout-claims for a vault-won wager are a threshold Safe transaction. Recorded here and reflected in the spec. |

## Follow-ups (post-landing)

These are tracked outside this PR and are intended for a separate session/PR:

- **US3 operate-as** — wired surfaces: Pay & Transfer, wager **create** + **accept**, vault-won payout **claim**
  routing (FR-022c), **Trade/Swap** (`DexContext`), **Token Mint** (`useTokenFactory`), and **ClearPath**
  governance (castVote/queue/execute via connector `encode`). **Remaining: Membership purchase**
  (`usePurchaseFlow`) — its stake goes through the deep `purchaseRoleWithStablecoin` service layer and a vault
  buying its own membership is the most niche operate-as case; deferred as a focused follow-up. The wager
  claim UI routes correctly but is only reachable once a "view the vault's wagers" list is added (the wager
  list is keyed to the connected address today).
- **Ethereum Classic mainnet (61)** — Custody is contract-ready (the canonical Safe v1.4.1 addresses already
  resolve for 61 in `safeContracts.js` shape), but the app has **no `61` network block** today
  (`frontend/src/config/contracts.js` / `networks.js`). Adding an ETC network entry (RPC, chain + token config)
  is a **prerequisite** — after which deploying a `SafeProposalHub` to ETC and syncing lights up Custody there
  with the same address set. This is config-only and out of scope for this feature.
- **Live-network tasks** — deploy the hub to Mordor/Polygon (T008/T058) and run the fork tests against the live
  Safe v1.4.1 deployments (T015/T025/T044); these require funded wallets and a fork RPC.

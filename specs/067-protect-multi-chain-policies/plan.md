# Implementation Plan: Protect Multi-Chain Vaults & Advanced Policy Engine

**Branch**: `claude/protect-multi-chain-policies-mt82ah` (feature `067-protect-multi-chain-policies`) | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/067-protect-multi-chain-policies/spec.md`

## Summary

Protect grows along three axes:

1. **Multi-chain vaults.** The vault list stops filtering to the connected chain and shows every
   saved vault with a chain name/badge; off-chain vaults render read-only with a switch prompt
   (the guard already exists in `VaultProposalsPanel` — it becomes universal). ETC mainnet (61)
   joins `SAFE_CONTRACTS` (address-ready since spec 043), and the custody contract set
   (`safeProposalHub`, `policyGuardSetupV2`, new `safePolicyGuardV2`) is deployed to Mordor (63),
   ETC (61), and Polygon (137).

2. **Ordered policy engine — `SafePolicyGuardV2`.** A new, non-upgradeable guard singleton (the
   exact migration path spec 049 documented: "future rule types ship as a new guard version that
   vaults adopt via threshold-approved `setGuard`"). Policy becomes an ordered array of numbered
   rules with first-match-governs semantics. Each rule scopes by asset (native / specific token /
   any), amount bounds, and destination set (recipients or approved contracts), and names an
   approver set (all listed owners must have approved). Approver verification reuses the existing
   fully-on-chain approval flow: the guard recomputes the SafeTx hash (`nonce() - 1`) and checks
   `approvedHashes(owner, hash)` — no signature-format change. Rules are replaced atomically
   (`setRules`) so add/edit/remove/reorder is always one threshold-approved self-transaction.

3. **UX consistency.** Owner entry uses a shared custody address field composed from the
   platform's `AddressInput` + `AddressBookButton` + `QRScanner` (per the `CpAddressField`
   precedent); the rule list reorders via native HTML5 drag plus keyboard ↑/↓ controls (per the
   `PoolParticipants` precedent, no new dependency); the approved-contracts picker reads a new
   per-chain service catalog derived from existing config (dex venue, staking, hub addresses).
   The nav move to Tools (FR-024) already shipped with the spec commit.

Legacy vaults on `SafePolicyGuard` v1 keep enforcing untouched; adopting V2 is a threshold-approved
`setRules` + `setGuard` two-step, mirroring the spec-049 attach flow.

## Technical Context

**Language/Version**: Solidity ^0.8.24 (viaIR, runs=1) for contracts; modern JS (ES modules) with
React 19 + Vite for the frontend; ethers v6.

**Primary Dependencies**: No new dependencies. Contracts: zero external imports (custody family
convention — `ISafeGuard.sol` local replica; `@safe-global/safe-contracts@1.4.1` stays
devDependency/test-only). Frontend: existing `html5-qrcode` (QR), native HTML5 drag-and-drop,
existing `AddressInput` / `AddressBookButton` / `QRScanner` components.

**Storage**: On-chain — new `SafePolicyGuardV2` singleton keyed by Safe address (ordered rule
array + per-rule window accounting + vault meta). Client — existing `custody_vault_references`
localStorage store via `userStorage` (already carries `chainId` per entry; already a spec-032
synced object). New per-chain service catalog is build-time config, not storage.

**Testing**: Hardhat unit tests (`test/custody/`), integration tests against real Safe v1.4.1
(`test/integration/policy-guard-safe.test.js` pattern, viaIR disabled for the Safe closure);
frontend Vitest + Testing Library + vitest-axe in `frontend/src/test/custody/`.

**Target Platform**: PWA. Custody chains after this feature: Polygon (137), Mordor (63), ETC (61)
— `SAFE_CONTRACTS` membership plus per-chain custody deployment keys. Hardhat (1337) for local
policy-engine testing.

**Project Type**: Web application (Solidity contracts + React frontend; no backend — custody is
serverless by spec 043 design).

**Performance Goals**: Guard `checkTransaction` bounded: ≤ 16 rules/vault, ≤ 8 approvers/rule,
≤ 16 targets/rule; approver verification is O(rule approvers) `approvedHashes` static reads.
Vault list enrichment reads N chains in parallel with per-vault failure isolation (a dead RPC on
one chain must not blank the list).

**Constraints**: Lockout-proof by construction (policy management path always open — FR-021);
zero regression for guard-less vaults and v1-guard vaults; no delegatecall / no gas refunds on
policy vaults (carried from 049); pre-validated-signature approval flow unchanged; policy silence
is denial once V2 rules exist (spec assumption); `getNetwork()` fallback-to-default behavior must
never be used for custody chain resolution (strict lookups only).

**Scale/Scope**: 1 new contract (~500 lines) + reuse of `PolicyGuardSetup` (guard-agnostic,
redeploy to new chains only); ~6 new/changed lib modules; ~8 custody components touched + 2 new
(shared address field, rule composer/list); 3 deploy-script targets; config for 3 chains;
~30 new contract test cases + ~15 frontend suites.

## Constitution Check

*GATE: evaluated pre-Phase 0 and re-checked post-Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Security-first contracts | PASS (with named deviation) | `SafePolicyGuardV2` is fund-custody enforcement: checks-effects-interactions respected (guard is read-only during `_checkPolicy`, accounting committed before execution exactly as v1); reentrancy surface limited to static reads into the calling Safe; Slither + Medusa gates required; security-agent review required before merge; EthTrust-SL L2 target with documented accepted risks. Non-UUPS singleton is a deliberate deviation — see Complexity Tracking. |
| II. Test-first | PASS | Contract unit + real-Safe integration suites planned per rule kind and per FR (matching 049's coverage shape); frontend Vitest suites per component incl. axe. Full mapping in Phase 2 tasks. |
| III. Honest state | PASS | Cross-chain vault list reads live chain state per vault chain; unreachable chain ⇒ per-vault honest error, never stale/blank; policy summaries derive from decoded on-chain rules; preview never implies enforcement (guard is the enforcement). Network-unavailable states stay explicit (FR-005). |
| IV. Fail loudly in CI | PASS | New tests join existing gates; no `continue-on-error`; `coverage-threshold-policy.json` gains `SafePolicyGuardV2.sol` (tier A/B) — fixing the gap where v1 guard was never listed. |
| V. Accessible frontend | PASS | Reorder ships drag + keyboard controls with ARIA labels (FR-016, PoolParticipants precedent); axe assertions on every new/touched component; shared AddressInput retains its labeling contract. |
| Tech stack constraint | PASS | No new core technology; no new npm dependency. |
| Key management / deployments | PASS | Deterministic CREATE2 deploys via existing custody deploy scripts + floppy keystore flow; `deployments/` records `safePolicyGuardV2` per chain; `sync:frontend-contracts` regenerates frontend records. |

**Post-Phase-1 re-check**: design artifacts introduce no new violations; the single deviation
(non-upgradeable guard) is unchanged from spec 049 and justified below.

## Project Structure

### Documentation (this feature)

```text
specs/067-protect-multi-chain-policies/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── SafePolicyGuardV2.md      # on-chain rule engine contract spec
│   └── frontend-integration.md   # lib/component contracts + service catalog
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
contracts/custody/
├── SafePolicyGuardV2.sol        # NEW ordered rule engine guard (singleton, non-upgradeable)
├── SafePolicyGuard.sol          # v1 — untouched, keeps enforcing for legacy vaults
├── PolicyGuardSetup.sol         # untouched (guard-agnostic); redeployed to 61/63
└── SafeProposalHub.sol          # untouched; deployed to 61/63

scripts/deploy/custody/
├── deploy-policy-guard-v2.js    # NEW (pattern: deploy-policy-guard.js; targets 1337/63/61/137)
└── deploy-safe-proposal-hub.js  # extend TARGETS to 63/61

test/custody/
├── SafePolicyGuardV2.test.js    # NEW unit suite (MockSafe harness + approvedHashes mock)
└── (v1 suites untouched)
test/integration/
└── policy-guard-v2-safe.test.js # NEW real Safe v1.4.1 integration suite

frontend/src/config/
├── safeContracts.js             # add 61 to SAFE_CONTRACTS
├── contracts.js                 # per-chain safePolicyGuardV2/policyGuardSetup/safeProposalHub
│                                #   + DEPLOYMENT_BLOCKS_BY_CHAIN safeProposalHub entries (fixes
│                                #   the existing gap that breaks useVaultProposals everywhere)
└── serviceCatalog.js            # NEW per-chain approved-services catalog (dex/staking/platform)

frontend/src/lib/custody/
├── policyV2.js                  # NEW encode/decode/validate/describe ordered rules; status adds
│                                #   'managed-v2'; match preview (first-match simulation)
├── policy.js                    # v1 — untouched except status plumbing
└── vaultReferences.js           # untouched (already chain-keyed)

frontend/src/hooks/
├── useCustodyVaults.js          # remove per-chain filter; per-vault chain providers; parallel
│                                #   enrichment with per-vault error isolation
└── useVaultProposals.js         # unchanged API; benefits from deployment-block fix

frontend/src/components/custody/
├── CustodyAddressField.jsx      # NEW shared owner/recipient entry (AddressInput + book + QR;
│                                #   CpAddressField pattern) — used by CreateVaultWizard,
│                                #   LoadVaultForm, OwnersThresholdPanel, ProposeTransactionForm
├── RuleList.jsx                 # NEW ordered rule display + drag/keyboard reorder
├── RuleComposer.jsx             # NEW per-kind rule editor incl. approver picker + service picker
├── PolicyPanelV2.jsx            # NEW ordered-policy read/edit/propose surface (v1 PolicyPanel
│                                #   kept for legacy vaults, rendered by status)
├── VaultList.jsx                # chain badge per row
├── VaultDetail.jsx              # chain name (not raw id); upgrade-to-V2 entry point
├── CustodyPanel.jsx             # cross-chain list; per-chain creation gating
└── CreateVaultWizard.jsx        # CustodyAddressField owners; explicit chain statement (FR-001)

frontend/src/test/custody/       # new suites per new module/component (axe on all components)
```

**Structure Decision**: Web application layout already in place (contracts + frontend). All new
on-chain code stays in `contracts/custody/`; all new client logic in `lib/custody/` +
`components/custody/`, mirroring specs 043/049 so the custody family remains one reviewable unit.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `SafePolicyGuardV2` is a plain singleton, not `UUPSManaged` (CLAUDE.md upgradeable-contracts rule) | A policy guard with an upgrade admin is a custody backdoor: whoever controls the proxy could rewrite every vault's spending rules. Immutability is the security feature; version migration is vault-consented (`setGuard`), which is precisely how this feature succeeds v1. | UUPS proxy rejected for the same reason spec 049 rejected it (Complexity Tracking, 049 plan.md): an upgrade key defeats the trust model. Per-vault guard clones rejected (gas, address sprawl, N-contract reads — 049 research R1). |
| Two live guard versions (v1 + V2) during migration | FR-020 requires legacy policies to keep enforcing unchanged; forcing migration would let a single release change vault rules without owner consent. | Auto-migrating state into V2 rejected: guard state is keyed to the singleton address and migration without a threshold-approved `setGuard` violates the consent model. UI carries the seam (status `managed` vs `managed-v2`), contracts stay clean. |

# Implementation Plan: Multisig Policy Engine

**Branch**: `claude/issue-852-speckit-flow-jpxwxa` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/049-multisig-policy-engine/spec.md` (GitHub issue #852)

## Summary

Layer an on-chain policy engine over the spec 043 Safe multisig vaults. A single non-upgradeable
`SafePolicyGuard` contract per chain implements the Safe v1.4.1 transaction-guard interface and
enforces four opt-in rule types per vault (per-transaction limit, 24-hour-window limit, recipient
allowlist, cooldown) on every fund movement out of the vault — after owner approvals, before
execution. Rule configuration is only callable by the vault itself (`msg.sender == safe`), so every
policy change rides the vault's existing threshold-approval flow. A `PolicyGuardSetup` delegatecall
helper wires the guard + initial rules into `Safe.setup` so policies are live from a new vault's
first transaction. The Protect view grows a Policy step in vault creation, a policy panel with live
rule state on vault detail, policy badges in the vault list, pre-flight violation feedback when
proposing transactions, and threshold-approved rule-change management — all network-gated via
`getContractAddressForChain`. Full design rationale in [research.md](./research.md).

## Technical Context

**Language/Version**: Solidity ^0.8.24 (default repo compiler entry, viaIR, optimizer runs=1);
JavaScript ES modules (React 19, ethers v6, wagmi v3/viem v2)

**Primary Dependencies**: Safe v1.4.1 guard interface (interface replicated locally, no runtime
dep); `@safe-global/safe-contracts@1.4.1` added as **devDependency** for integration tests only;
no OpenZeppelin in the new contracts (custody-family precedent: `SafeProposalHub`)

**Storage**: On-chain singleton state in `SafePolicyGuard` keyed by Safe address (rule configs +
window/cooldown accounting); no backend; vault labels/references stay in the spec 043 encrypted
backup

**Testing**: Hardhat (`test/custody/*.test.js` unit with `MockSafe`, `test/integration/` with real
Safe v1.4.1); frontend Vitest + Testing Library (+ vitest-axe for the new UI); Slither on new
contracts

**Target Platform**: EVM chains where custody is supported — Hardhat/localhost in this feature;
Mordor (63) → Polygon (137) as ops rollout, matching `CUSTODY_SUPPORTED_CHAIN_IDS`

**Project Type**: Web application (Solidity contracts + React frontend; no subgraph change — reads
are direct RPC, consistent with spec 043's on-chain-only discovery)

**Performance Goals**: Policy view renders complete rule state within 5 s (SC-004) — one
`getPolicy` multicall-style read per vault; guard adds bounded gas to `execTransaction`
(no unbounded loops; allowlist is O(1) mapping lookups)

**Constraints**: Lockout-proof by construction (FR-008/SC-003); zero regression for policy-less
vaults (FR-010/SC-007 — guard not set ⇒ Safe behavior byte-identical); no delegatecall and no gas
refunds on policy-enabled vaults (documented v1 limitation); addresses resolved only via generated
sync artifacts

**Scale/Scope**: 2 new contracts (~350 lines total) + 1 test mock; ~6 frontend components
touched/added; 2 deployment keys; no schema/subgraph changes

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.0.0 — PASS (pre-Phase-0 and
re-checked post-Phase-1).*

- **I. Security-First (fund custody path — highest risk)**: PASS. Guard is restriction-only (can
  block, never move funds); CEI respected (`checkTransaction` writes accounting state then
  reverts-or-returns; no external calls out of the guard; `PolicyGuardSetup` external call is the
  final action of setup delegatecall); no reentrancy surface (guard is called by the Safe, makes
  no untrusted calls); explicit reasoning for access control: `msg.sender == safe` is the entire
  authority model — no admin, no upgrade key, nothing to compromise. Delegatecall + gas-refund
  denial closes the two known guard-bypass channels; `approve` counting closes allowance-drain.
  Slither + security-agent review before merge; EthTrust-SL L2 target documented in the contract
  doc. Accepted-risk register (documented in contract doc + UI): fixed window ≤2× straddle,
  unrecognized-calldata value moves constrained only by allowlist/target rules.
- **II. Test-First & Coverage**: PASS. Unit (MockSafe) + integration (real Safe 1.4.1) suites
  specified per acceptance scenario, incl. failure/edge paths (window boundary, lockout attempt,
  stale approvals, foreign guard). Frontend Vitest for policy lib + each new component. Spec 043
  suites must stay green (SC-007).
- **III. Honest State**: PASS. All policy reads from chain; window semantics disclosed in UI;
  pre-flight uses the guard's own `previewTransaction` so client display cannot drift from
  enforcement; foreign guards surfaced as "unrecognized", never hidden; network-scoped via
  per-chain addresses.
- **IV. Fail Loudly in CI**: PASS. No CI policy changes; new tests join existing gates;
  `check:storage-layout` untouched (no proxy).
- **V. Accessible, Consistent Frontend**: PASS. New UI follows custody component/CSS patterns,
  WCAG 2.1 AA (axe tests), addresses/ABIs only via sync artifacts + `getContractAddressForChain`.
- **Additional constraints**: Solidity+Hardhat / React+Vite+Vitest only — the one new
  devDependency (`@safe-global/safe-contracts`, tests only) is justified in research R7. Deploy
  script + `deployments/` recording per convention. No archived-code imports.
- **Deviation from CLAUDE.md upgradeable-contract guidance**: `SafePolicyGuard` is deliberately
  **non-upgradeable** — see Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/049-multisig-policy-engine/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R8
├── data-model.md        # Phase 1 — entities & state
├── quickstart.md        # Phase 1 — validation guide
├── checklists/
│   └── requirements.md  # Spec quality checklist (passed)
├── contracts/           # Phase 1 — interface contracts
│   ├── SafePolicyGuard.md
│   ├── PolicyGuardSetup.md
│   └── frontend-integration.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
contracts/
├── custody/
│   ├── SafeProposalHub.sol          # existing (spec 043)
│   ├── SafePolicyGuard.sol          # NEW — singleton guard + policy state
│   └── PolicyGuardSetup.sol         # NEW — Safe.setup delegatecall helper
└── mocks/
    └── MockSafe.sol                 # NEW — test-only Safe guard-flow harness

test/
├── custody/
│   ├── SafePolicyGuard.test.js      # NEW — unit (rules, exemptions, errors, views)
│   └── PolicyGuardSetup.test.js     # NEW — unit (delegatecall wiring)
└── integration/
    └── policy-guard-safe.test.js    # NEW — real Safe v1.4.1 end-to-end

scripts/deploy/custody/
└── deploy-policy-guard.js           # NEW — deploy + record both addresses

frontend/src/
├── abis/
│   └── SafePolicyGuard.js           # NEW — synced/curated ABI (+ setup helper ABI)
├── config/
│   └── contracts.js                 # + safePolicyGuard / policyGuardSetup keys (via sync)
├── lib/custody/
│   ├── policy.js                    # NEW — reads, encoding, preview, error decoding
│   └── safeVault.js                 # + optional setupTo/setupData in initializer
├── components/custody/
│   ├── PolicyStep.jsx               # NEW — wizard step
│   ├── PolicyPanel.jsx              # NEW — detail view rules + live state + change flow
│   ├── PolicyBadge.jsx              # NEW — vault list summary
│   ├── CreateVaultWizard.jsx        # + Policy step
│   ├── VaultDetail.jsx              # + PolicyPanel
│   ├── VaultList.jsx                # + PolicyBadge
│   ├── ProposeTransactionForm.jsx   # + pre-flight preview
│   └── Custody.css                  # + policy styles
└── test/custody/                    # NEW Vitest suites for all of the above
```

**Structure Decision**: Web application layout already in place — contracts under
`contracts/custody/` beside their spec 043 sibling, frontend inside the existing custody feature
folder, tests mirroring source per repo convention. No new top-level directories.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New contract does NOT inherit `UUPSManaged` (deviates from CLAUDE.md upgradeable-contracts guidance) | A fund-restriction guard must be immutable to be trustworthy: any upgrade key is a backdoor that can rewrite every vault's enforcement | UUPS proxy would satisfy the guidance but inverts the trust model; future rule types ship as a new guard version that vaults adopt via threshold-approved `setGuard` |
| New devDependency `@safe-global/safe-contracts@1.4.1` | Integration tests must exercise the real `execTransaction` guard calling convention, ERC-165 `setGuard` check, and `setup` delegatecall | MockSafe alone cannot prove compatibility with the actual Safe bytecode the vaults run; vendoring sources copies ~15 files into the repo for the same result |

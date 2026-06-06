# Implementation Plan: Local Dev Environment

**Branch**: `006-local-dev-environment` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-local-dev-environment/spec.md`

## Summary

Deliver a repeatable local development environment in which two well-known Hardhat
accounts are fully funded — native gas (already provided by the node), a balance of
the test ERC20 stake token, an active `WAGER_PARTICIPANT` membership, and a
pre-approved allowance to the wager contract — so a developer can drive the full
create → accept → resolve wager lifecycle through the React app against a local chain
with zero manual setup and no remote network.

Technical approach: reuse the existing local infrastructure (`npm run node`,
`scripts/deploy/deploy.js`, `scripts/utils/sync-frontend-contracts.js`, the
permissionless `MockERC20.mint`, and the admin `MembershipManager.grantMembership`).
The single missing piece is a seeding step: the current `seed:local` target points at
`scripts/operations/seed-testnet.js`, which targets a nonexistent v1
`ConditionalMarketFactory` and never mints tokens or grants membership. We replace it
with a new `scripts/operations/seed-local.js` and wire a one-command orchestrator
(`npm run setup:local`) that runs deploy → sync → seed against the running node, plus a
documented runbook. **No `contracts/` changes are required** — `mint` and
`grantMembership` already exist with the access model we need (mint is permissionless;
the deployer/account #0 holds `ROLE_MANAGER_ROLE`).

## Technical Context

**Language/Version**: JavaScript (Node, Hardhat scripts via ethers v6); Solidity 0.8.x (no contract changes); React 18 + Vite (frontend, config only).

**Primary Dependencies**: Hardhat (local node, chainId 1337), ethers v6, existing `scripts/deploy/deploy.js` + `scripts/deploy/lib/constants.js`, `scripts/utils/sync-frontend-contracts.js`; frontend wagmi config (`frontend/src/config/{contracts,networks,wagmi}.js`).

**Storage**: On-chain state on the ephemeral local Hardhat node; deployment record at `deployments/localhost-chain1337-v2.json` (source of truth for addresses). No new persistent storage.

**Testing**: Hardhat (`npm test`) integration test asserting the post-seed invariants; existing Cypress "full" tier (`frontend/cypress`) and Vitest for any frontend touch. No frontend logic changes expected beyond synced config.

**Target Platform**: Developer workstation (Linux/macOS) running a local Hardhat node + the Vite dev server.

**Project Type**: Web app (Solidity contracts + React frontend) — this feature is dev-tooling/orchestration + docs, not a product surface change.

**Performance Goals**: Full bring-up (deploy → sync → seed) completes in well under the 5-minute SC-001 budget on a clean checkout; seeding itself is a handful of transactions.

**Constraints**: No real funds, no remote faucets, no public/testnet access (FR-012). Frontend addresses MUST come from the generated sync artifact, never hand-edited (Constitution V). The two wallets use the publicly-known deterministic Hardhat test keys — these are not secrets, but no real/admin key may ever be committed.

**Scale/Scope**: 2 funded wallets; 1 local chain; the v2 contract set already deployed by `deploy.js`. One new script, a few npm scripts, one integration test, and docs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|-----------|----------|------------|
| I. Security-First Smart Contracts (NON-NEGOTIABLE) | **No contract changes** | `contracts/` is untouched. We call existing `MockERC20.mint` (test-only, `contracts/mocks/`) and `MembershipManager.grantMembership` (admin-gated, already shipped). No new value-bearing code → no new Slither/Medusa/security-review surface. PASS. |
| II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE) | Yes | Add a Hardhat integration test that runs the seed routine against the in-process network and asserts the post-seed invariants (token balance > 0, `checkCanCreate` true, allowance ≥ threshold for both wallets). Frontend config is generated, not logic; covered by existing localhost wiring tests. PASS (test authored with the script). |
| III. Honest State, No Mocks in Shipped Paths | Yes | `MockERC20` and the seed script live strictly in test/dev scope (`contracts/mocks/`, `scripts/operations/`). The `HARDHAT_CONTRACTS` block is network-scoped to chainId 1337 and only active when `VITE_NETWORK_ID=1337`; it cannot leak into mainnet/testnet paths. No mock data enters production UX. PASS. |
| IV. Fail Loudly in CI | Yes | If any CI wiring is added, no `continue-on-error` on the seed/integration test. The seed script must exit non-zero on failure (e.g., missing deployment record). PASS by design. |
| V. Accessible, Consistent Frontend | Yes | Frontend contract addresses are written by `sync-frontend-contracts.js` (the generated artifact) — the runbook MUST use sync, never hand-copy `HARDHAT_CONTRACTS`. No new UI. PASS. |
| Key management | Yes | Two wallets = Hardhat deterministic test accounts #0/#1, whose private keys are publicly known and safe to document for local use only. No deployer/admin/floppy-keystore key is used or committed. PASS. |
| Archived code | Yes | `seed-testnet.js`'s v1 `ConditionalMarketFactory` path is replaced, not imported; nothing under `contracts-archive/`/`test-archive/` is touched. PASS. |

**Result**: All gates pass. No violations → **Complexity Tracking section omitted.**

## Project Structure

### Documentation (this feature)

```text
specs/006-local-dev-environment/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature spec (/speckit-specify output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output — the developer runbook
├── contracts/
│   └── local-env-contract.md   # CLI/command surface + post-seed invariants
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
scripts/
├── operations/
│   └── seed-local.js            # NEW — mint test token, grant membership, approve allowance for 2 wallets
├── deploy/
│   └── deploy.js                # EXISTING — deploys v2 set to localhost (unchanged)
└── utils/
    └── sync-frontend-contracts.js   # EXISTING — writes HARDHAT_CONTRACTS (unchanged; invoked for 1337)

contracts/
├── mocks/MockERC20.sol          # EXISTING — permissionless mint (unchanged)
└── access/MembershipManager.sol # EXISTING — grantMembership / checkCanCreate (unchanged)

test/
└── integration/
    └── seed-local.test.js       # NEW — asserts post-seed invariants on the local network

frontend/src/config/
├── contracts.js                 # EXISTING — HARDHAT_CONTRACTS block (written by sync, not hand-edited)
├── networks.js                  # EXISTING — chain 1337 entry (unchanged)
└── wagmi.js                     # EXISTING — hardhat/localhost transport (unchanged)

docs/developer-guide/
└── setup.md                     # UPDATE — add the local end-to-end runbook section

package.json                     # UPDATE — repoint seed:local; add setup:local + sync:frontend-contracts:local
deployments/localhost-chain1337-v2.json   # GENERATED by deploy:local — addresses source of truth
```

**Structure Decision**: Single web-app repo (existing). This feature adds one new script (`scripts/operations/seed-local.js`), one new integration test (`test/integration/seed-local.test.js`), npm-script wiring, and docs. It changes no Solidity and no frontend logic — frontend config is regenerated by the existing sync tool. This honors YAGNI: every other capability (node, deploy, sync, mint, grant) already exists.

## Key Decisions (see research.md for rationale)

1. **Two wallets = Hardhat accounts #0 (`0xf39Fd6…92266`) and #1 (`0x7099…79C8`)** — deterministic, publicly-known dev keys; zero-ceremony MetaMask import; no secrets.
2. **Reuse, don't build** — `MockERC20.mint` (permissionless) + `MembershipManager.grantMembership` (deployer has `ROLE_MANAGER_ROLE`); no new contracts.
3. **New `scripts/operations/seed-local.js`** replaces the broken v1 `seed-testnet.js` for the local target; `seed:local` is repointed.
4. **One-command orchestration** — `npm run setup:local` = deploy:local → sync (1337) → seed:local, against a node started separately via `npm run node`; the runbook documents the sequence.
5. **Membership tier = Bronze, long duration (365 days)** for both wallets — any active tier passes `checkCanCreate`; long expiry avoids mid-session expiry.
6. **Pre-approve allowance** — seed approves the WagerRegistry for a large amount from each wallet (FR-006 "pre-approved" branch) to remove approval friction in the manual flow.
7. **Idempotent seed** — re-running restores funded state after a chain restart (FR-010/FR-011); seed reads addresses from `deployments/localhost-chain1337-v2.json`.
8. **Default end-to-end uses a non-oracle wager** (creator/opponent/either resolution) so resolution needs no external oracle; private/encrypted wagers are out of scope for the default flow (spec assumptions).

## Phase 0 — Research

See [research.md](./research.md). All Technical Context items are resolved; no `NEEDS CLARIFICATION` remain.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — entities (Local chain, Developer wallet + funded-state, Test token, Contract set, Deployment record, Frontend config block) and the wallet/wager state transitions.
- [contracts/local-env-contract.md](./contracts/local-env-contract.md) — the command surface (`npm run node` / `setup:local` / `seed:local` / sync) and the post-seed invariants the environment guarantees.
- [quickstart.md](./quickstart.md) — the developer runbook proving the feature end-to-end.

Post-design Constitution re-check: unchanged — all gates still PASS (no contract or production-path changes introduced by the design).

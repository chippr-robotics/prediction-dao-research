# Implementation Plan: Configurable Platform Fee Wrapper

**Branch**: `feat/platform-fee-wrapper` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/060-platform-fee-wrapper/spec.md`

## Summary

Add a single on-chain **`FeeRouter`** contract (UUPS, per network) that is both the
**source of truth for every configurable platform fee** and the **atomic fee-charging
wrapper** for external services with no native revenue share. Services are registered as
`bytes32` service ids with a per-service hard cap (wrapper services ≤ 250 bps; the
Polymarket taker/maker entries keep their spec-057 caps of 100/50); a `FEE_ADMIN_ROLE`
sets rates 0..cap; every change emits an attributable event (the change history).
The first wrapper consumer is **Earn lending** (spec 050): when the lending fee is
nonzero, the frontend routes vault deposits through
`FeeRouter.depositToVaultWithFee(serviceId, vault, assets, receiver, maxFeeBps)` — pull
principal, skim fee to the per-network treasury, deposit the remainder into the ERC-4626
vault for the member, atomically; `maxFeeBps` pins the member to the rate they were shown
(FR-005). With a zero fee (or no router deployed on the chain) the existing direct
approve+deposit path is unchanged. The **Polymarket builder fee** moves its source of
truth on-chain: the relay-gateway's `/fee-rate` endpoint reads the FeeRouter entries on
Polygon (short-TTL cache, env values demoted to fallback/caps), so an admin bps change is
live in Predict's existing confirm UI with **no gateway redeploy and no new gateway
mutability** — the gateway stays stateless with no admin API, per its design. A new
role-gated **Fees tab** in the AdminPanel (pattern: `ProtocolConfigTab`) lists all fee
systems — wrapper services, Polymarket taker/maker, OpenSea referral (display-only,
no-cost) — with live rates, caps, treasury, per-network availability, and on-chain
change history, and writes changes via the wallet (`runTx`, on-chain role = auth).
Docs: developer guide (how to register a future service: Lido, Polygon LST, Uniswap),
operations runbook (change/verify/emergency-zero/reconcile), and a member-facing fees
page. Decision log: [research.md](research.md).

## Technical Context

**Language/Version**: Solidity 0.8.x + Hardhat (contracts); JavaScript ESM — Node ≥20
(relay-gateway, Express 4), Node ≥22 + React 19 + Vite (frontend)

**Primary Dependencies**: contracts: OpenZeppelin upgradeable (`UUPSManaged` base,
`AccessControlUpgradeable`, `SafeERC20`, `ReentrancyGuardUpgradeable`), ERC-4626 vault
interface (no new dep); gateway: ethers v6 (already present) for the on-chain fee read —
no new npm dep; frontend: ethers v6 + existing wagmi/`sendCalls` rail — no new dep

**Storage**: on-chain FeeRouter storage (append-only + `__gap`); no new off-chain
persistence — the gateway keeps its stateless, env-at-boot design and only gains a
short-TTL in-memory cache for the on-chain fee read; fee change history = contract events

**Testing**: Hardhat unit tests (`test/feeRouter.test.js`), upgrade/storage tests
(`test/upgradeable/FeeRouter.upgrade.test.js`), integration with a mock ERC-4626 vault;
gateway Vitest + Supertest with injected provider mock (`test/fees.test.js`); frontend
Vitest + Testing Library + vitest-axe (VaultSheet fee line, Fees tab)

**Target Platform**: EVM networks in `deployments/` (Polygon first; router deployable
per network); relay-gateway on Cloud Run; frontend SPA

**Project Type**: web application — `contracts/` + `services/relay-gateway/` +
`frontend/` + `docs/`; no subgraph changes

**Performance Goals**: fee quote (rate read) resolves with the vault detail load (one
extra `eth_call`, cacheable); admin change visible on member surfaces within one block +
gateway cache TTL (≤ 60 s, satisfies SC-003's 1-minute bound)

**Constraints**: gateway must remain stateless (no durable store, no admin HTTP API);
member is never charged above the disclosed rate (`maxFeeBps` enforced on-chain); fee
math rounds down (member's favor); zero-fee and router-undeployed paths must be
byte-identical to today's behavior

**Scale/Scope**: 1 new contract (+1 mock), ~3 service ids at launch (`earn.lend`,
`polymarket.taker`, `polymarket.maker`), 1 new admin tab, 1 gateway read-path change,
1 Earn call-path change, 3 docs artifacts

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Security-first contracts | PASS (design gate) | FeeRouter is value-bearing (custodies funds transiently within one tx). CEI + `nonReentrant` on `depositToVaultWithFee`; `SafeERC20` everywhere; fee transfer and vault deposit in one tx (atomicity FR-003); caps enforced in the setter **and** re-checked at charge time; `maxFeeBps` protects members from admin front-running; role-gated setters (`FEE_ADMIN_ROLE`), upgrade gated `UPGRADER_ROLE` via `UUPSManaged`. Slither + security-agent review before merge; fund-custody reasoning recorded here and in research.md R2. |
| II. Test-first, comprehensive | PASS | Unit tests for fee math (incl. rounding-to-zero, cap rejection, maxFeeBps revert, treasury-unset ⇒ zero fee), atomic-revert test (vault deposit reverts ⇒ fee reverts), upgrade/storage-layout test, gateway `/fee-rate` on-chain-source tests (incl. RPC-failure fallback), frontend tests for fee line, zero-fee path, and Fees tab (incl. axe). |
| III. Honest state, no mocks in shipped paths | PASS | Disclosed rate is read live from the same contract the admin writes; gateway falls back to env caps only with an explicit `source` marker; UI never shows a rate it can't honor (maxFeeBps); mock vault lives in `contracts/mocks/` only. |
| IV. Fail loudly in CI | PASS | New tests join existing gates; `check:storage-layout` extended to FeeRouter; no `continue-on-error`. |
| V. Accessible, consistent frontend | PASS | Fees tab follows AdminPanel/PortalNav pattern; fee line follows the spec-057 disclosure pattern with info bubble; axe tests; addresses only via `getContractAddressForChain` from sync artifacts. |
| Constraints (stack, keys, deployments) | PASS | No new core tech. Admin actions use wallet-as-auth on-chain roles (floppy keystore flow unchanged). Deployment via `scripts/deploy/lib/upgradeable.js` `deployProxy`, recorded keys `feeRouter`/`feeRouterImpl` in `deployments/`. |

**Post-design re-check (after Phase 1)**: PASS — the one YAGNI trade-off (no `…WithSig`
intent twins on `depositToVaultWithFee` in v1) is logged in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/060-platform-fee-wrapper/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities/storage
├── quickstart.md        # Phase 1 validation guide
├── contracts/
│   ├── fee-router.md
│   └── gateway-fees.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
contracts/fees/{FeeRouter,IFeeRouter}.sol           # NEW — UUPS registry + atomic wrapper
contracts/mocks/{MockERC4626Vault,FeeRouterUpgradeMock}.sol  # NEW (test-only)
test/feeRouter.test.js + test/upgradeable/FeeRouter.upgrade.test.js  # NEW
test/helpers/proxy.js                                # EXTEND — deployFeeRouter
scripts/deploy/deploy-fee-router.js                  # NEW
scripts/deploy/check-storage-layout.js               # EXTEND
scripts/utils/sync-frontend-contracts.js             # EXTEND
services/relay-gateway/src/fees/onchain.js           # NEW — FeeRouter reader + TTL cache
services/relay-gateway/src/{config/index,polymarket/routes,server}.js  # EXTEND
frontend/src/abis/FeeRouter.js                       # NEW
frontend/src/lib/fees/feeQuote.js                    # NEW
frontend/src/lib/earn/vaultActions.js                # EXTEND — fee path
frontend/src/components/earn/VaultSheet.jsx          # EXTEND — fee line
frontend/src/components/admin/FeesTab.jsx            # NEW
frontend/src/components/admin/adminNav.js + AdminPanel.jsx  # EXTEND
frontend/src/contexts/{RoleContext,WalletContext}.jsx + utils/blockchainService.js  # EXTEND — FEE_ADMIN
docs/developer-guide/platform-fees.md + docs/runbooks/fee-operations.md + docs/user-guide/platform-fees.md  # NEW
```

**Structure Decision**: web-application layout already in place; this feature adds one
contract module (`contracts/fees/`), one gateway module (`src/fees/`), one admin tab, and
extends the Earn call path — all inside existing directories and conventions.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New value-bearing contract (FeeRouter) | FR-003 atomicity: fee + external-service leg must revert together; a frontend-batched fee transfer is not atomic for classic wallets (separate txs ⇒ treasury could keep a fee for a failed deposit) | "Batch a treasury transfer client-side" rejected — violates FR-003/FR-005 and honest-state; no cap or consent ceiling enforceable on-chain |
| No `…WithSig` intent twins on `depositToVaultWithFee` in v1 | Earn deposits already ride the spec-041 `sendCalls` rail (passkey UserOps get gasless via spec-050 paymaster); adding twins forces the three-way intentTypes sync for a path with no relayer consumer today | Kept out per YAGNI; documented so a future spec can add twins without storage changes (functions only) |

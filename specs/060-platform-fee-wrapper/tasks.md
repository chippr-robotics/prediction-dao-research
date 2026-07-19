# Tasks: Configurable Platform Fee Wrapper

**Input**: Design documents from `/specs/060-platform-fee-wrapper/`

**Tests**: Included — the constitution makes test-first non-negotiable (Principle II).

**Organization**: Grouped by user story; each is an independently testable increment.
US1 (fee wrapper + Earn) is the MVP.

## Phase 1: Setup

- [X] T001 `contracts/fees/IFeeRouter.sol` — interface (enum, struct, reads, setters,
      `depositToVaultWithFee`, events, errors)
- [X] T002 [P] `contracts/mocks/MockERC4626Vault.sol` — minimal ERC-4626 with a settable
      revert mode

## Phase 2: Foundational (blocking all stories)

- [X] T003 `contracts/fees/FeeRouter.sol` — UUPS via `UUPSManaged`; append-only storage;
      `initialize`; `MAX_WRAPPED_FEE_BPS`; `FEE_ADMIN_ROLE`; register/setTreasury/setFeeBps
      with cap+role guards; `quoteFee`; atomic `depositToVaultWithFee` (nonReentrant, CEI,
      maxFeeBps consent, treasury-unset skip)
- [X] T004 `test/feeRouter.test.js` — fee math incl. floor-to-zero, cap enforcement,
      maxFeeBps revert, treasury-unset skip, atomic revert, role gating, events, enumeration,
      ConfigOnly rejects deposit
- [X] T005 [P] `test/helpers/proxy.js` — `deployFeeRouter` helper
- [X] T006 [P] `test/upgradeable/FeeRouter.upgrade.test.js` + register FeeRouter in
      `scripts/deploy/check-storage-layout.js`
- [X] T007 `scripts/deploy/deploy-fee-router.js` — deploy + register launch services + append
      `feeRouter`/`feeRouterImpl`
- [X] T008 [P] map `feeRouter` in `scripts/utils/sync-frontend-contracts.js` +
      `frontend/src/abis/FeeRouter.js`
- [X] T009 `npm run compile && npx hardhat test … && npm run check:storage-layout` green

## Phase 3: US1 — Member fee on Earn deposits (P1) 🎯 MVP

- [X] T010 [P] `frontend/src/lib/fees/feeQuote.js` — live rate quote (floor math, three
      outcomes)
- [X] T011 `frontend/src/lib/earn/vaultActions.js` — `buildDepositCalls` fee path
- [X] T012 `frontend/src/components/earn/VaultSheet.jsx` — fee line + info bubble + block on
      failed quote + earnCopy tip
- [X] T013 [P] frontend tests: `vaultActions.test.js` fee path, `VaultSheet.test.jsx` fee
      line/hide/blocked, `feeQuote.test.js`
- [X] T014 verify local (deposit with 50 bps → treasury +0.50 / vault 99.50; 0 bps → parity)

## Phase 4: US2 — Admin Fees tab (P2)

- [X] T015 [P] `FEE_ADMIN` in `RoleContext.js`, `WalletContext.jsx`, `blockchainService.js`
- [X] T016 `frontend/src/components/admin/FeesTab.jsx` — services table, gateway rows,
      edit forms, change history
- [X] T017 register in `adminNav.js` (fees item + icon + param) + `AdminPanel.jsx`
- [X] T018 [P] `FeesTab.test.jsx` + `FeesTab.axe.test.jsx` + `adminNav.test.js`
- [X] T019 `npm run test:frontend`

## Phase 5: US3 — Live disclosure across surfaces (P3)

- [X] T020 [P] `services/relay-gateway/src/fees/onchain.js` — FeeRouter reader + TTL cache +
      clamp + fallback
- [X] T021 `services/relay-gateway/src/config/index.js` — `FEE_ROUTER_*` + deployment pinning
- [X] T022 `polymarket/routes.js` + `server.js` — `/fee-rate` source, `/status.fees`
- [X] T023 [P] `services/relay-gateway/test/fees.test.js`
- [X] T024 Predict UI needs no data-path change (verified); gateway + frontend suites green

## Phase 6: US4 — Docs & runbook (P4)

- [X] T025 [P] `docs/developer-guide/platform-fees.md`
- [X] T026 [P] `docs/runbooks/fee-operations.md`
- [X] T027 [P] `docs/user-guide/platform-fees.md` + mkdocs nav
- [X] T028 SC-005 register-a-service walkthrough validated against the guide

## Phase 7: Polish & cross-cutting

- [X] T029 [P] CLAUDE.md guardrail + SPECKIT plan pointer
- [X] T030 [P] `.env.example` FEE_ROUTER_* + demoted POLYMARKET_BUILDER_* fallback
- [ ] T031 full gates: compile + test + check:storage-layout + test:frontend + gateway vitest;
      Slither on `contracts/fees/` (slither not installed locally — run in CI)
- [ ] T032 security pass against `.github/agents/smart-contract-security.agent.md`
      (reentrancy, CEI, access control, fee-math, token edge cases) — record in PR

## Notes

Reconstructed after a mid-session environment teleport discarded the original sandbox
branch; all code recreated in `feat/platform-fee-wrapper` off `origin/main` and pushed.

---
description: "Task list for Sponsored Paymaster for Passkey Smart Accounts (spec 050)"
---

# Tasks: Sponsored Paymaster for Passkey Smart Accounts

**Input**: Design documents from `/specs/050-sponsored-paymaster/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED — Constitution II (Test-First) is NON-NEGOTIABLE. Contract/gateway/frontend test
tasks precede their implementation and must fail first.

**Organization**: Grouped by user story (spec.md) for independent implementation + testing. Three
layers per story: contract (`contracts/account/**`, `test/account/**`) · gateway
(`services/relay-gateway/**`) · frontend (`frontend/src/**`).

**Branch/PR**: commit on a `050-sponsored-paymaster` branch off `origin/main` (never main directly).
Contract changes require a smart-contract security review before merge (Constitution I).

**Ops prerequisites (external, provided by operator — not code tasks)**: a **KMS** key for the
sponsorship signer; a **floppy-keystore** admin for the paymaster `owner`; MATIC to fund the deposit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete dependency)
- **[Story]**: US1–US4 (user-story phases only)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: vendor the v0.6 paymaster substrate and scaffold surfaces.

- [x] T001 [P] Vendor eth-infinitism **v0.6** `IPaymaster.sol` into `contracts/account/lib/account-abstraction/interfaces/` (path-only rewrite, no logic edits). **Refinement**: the paymaster is **self-contained** (reuses the already-vendored `UserOperation` + `_packValidationData`, OZ `ECDSA`/`Ownable`, and an inline minimal `IEntryPointStake` deposit/stake interface), so the full `IEntryPoint`/`IStakeManager`/`INonceManager` tree is **not** vendored — smaller audited surface (YAGNI)
- [x] T002 [P] ~~Vendor `core/BasePaymaster.sol`~~ **Superseded by the self-contained design (T001)** — no `BasePaymaster` dependency; deposit/stake handled directly against the inline `IEntryPointStake` interface
- [x] T003 [P] Document env vars: add `VITE_SPONSOR_PAYMASTER_POLYGON` / `VITE_SPONSOR_PAYMASTER_AMOY` (and deprecate `VITE_ERC20_PAYMASTER_*`) in `frontend/.env.example`; add `PAYMASTER_ADDRESS_<id>`, `ENTRYPOINT_V06_<id>`, `PM_SIGNER_KMS_KEY`, `PM_ACCOUNT_QUOTA_PER_MIN/DAY`, `PM_GLOBAL_QUOTA_PER_DAY`, `PM_MAX_COST_WEI`, `PM_MAX_GAS`, `PM_APPROVAL_TTL_SEC`, `PM_RUNWAY_WARN_HRS` in `services/relay-gateway/.env.example`
- [x] T004 [P] Scaffold `services/relay-gateway/src/paymaster/` (`build.js`, `sign.js`, `policy.js` stubs) + `services/relay-gateway/test/paymaster.test.js` skeleton

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the on-chain paymaster + deploy path that ALL stories depend on. The contract's
`getHash`/`paymasterAndData` layout is the byte-contract the gateway must mirror.

**⚠️ CRITICAL**: No user story can complete until Phase 2 is done.

- [x] T005 [P] Contract unit tests `test/account/VerifyingPaymaster.test.js` + `contracts/mocks/MockEntryPointStake.sol`: valid sig sponsors (sigFailed=0, window echoed); wrong-signer + tampered-op → sigFailed=1; `onlyEntryPoint` guard; malformed `paymasterAndData` reverts; `setVerifyingSigner` owner-only + zero rejected + rotation flips who can sponsor; `deposit`/owner-only `withdrawTo`; zero-signer constructor rejected. **9 passing.**
- [x] T006 Implement `contracts/account/FairWinsVerifyingPaymaster.sol` (self-contained `is IPaymaster, Ownable`; `verifyingSigner`; signature-only, zero-storage `validatePaymasterUserOp`; `getHash`; `setVerifyingSigner`; owner-gated `withdrawTo`/stake) — EntryPoint v0.6. **Compiles (paris), unit tests green.** ⚠️ still needs the fork test (T007), Slither/Medusa + security review (T029) before merge.
- [x] T007 [P] Write fork test `test/account/fork/VerifyingPaymaster.fork.test.js` (real EntryPoint v0.6 on a Polygon fork): fund deposit, sign an approval with a local key standing in for KMS, submit a **first-use** `executeBatch` UserOp for a **zero-native** counterfactual account, assert inclusion + sender native balance unchanged
- [x] T008 Implement `scripts/deploy/deploy-verifying-paymaster.js` (CREATE2 deploy, set `verifyingSigner` to the KMS-derived address, record `deployments/<net>.json` `{verifyingPaymaster, verifyingSigner, entryPoint}`, optional `--deposit`) — mirrors `scripts/deploy/deploy-account-stack.js`

**Checkpoint**: paymaster compiles, unit + fork tests pass, deploy script ready. User stories can begin.

---

## Phase 3: User Story 1 - Send funds with no native token, for free (Priority: P1) 🎯 MVP

**Goal**: a zero-native passkey account gets its UserOp (USDC/native transfer, first-use deploy) sponsored end-to-end.

**Independent Test**: on Amoy, from an account holding only USDC, send USDC and native — both included, sponsored, native balance unchanged.

- [x] T009 [P] [US1] Gateway grant-path test in `services/relay-gateway/test/paymaster.test.js`: `pm_getPaymasterData` returns a recoverable, correctly-packed `paymasterAndData` whose hash matches the contract `getHash`; stub length == real length (TDD)
- [x] T010 [US1] Implement `services/relay-gateway/src/paymaster/build.js` — `getHash` + pack/stub `paymasterAndData`, **byte-identical to `FairWinsVerifyingPaymaster.getHash`** (cross-checked in T009)
- [x] T011 [US1] Implement `services/relay-gateway/src/paymaster/sign.js` — KMS digest sign → 65-byte `{r,s,v}`; derive + cache signer address; boot health-check
- [x] T012 [US1] Add `POST /v1/paymaster` (`pm_getPaymasterStubData` / `pm_getPaymasterData` grant path: killswitch + sanctions screen + sign) to `services/relay-gateway/src/server.js`; add config keys (`PAYMASTER_ADDRESS_<id>`, `ENTRYPOINT_V06_<id>`, `PM_SIGNER_KMS_KEY`, `PM_APPROVAL_TTL_SEC`) in `services/relay-gateway/src/config/index.js` + startup check `KMS signer address == on-chain verifyingSigner`
- [x] T013 [P] [US1] Rename `erc20PaymasterUrl` → `sponsorPaymasterUrl` and read `VITE_SPONSOR_PAYMASTER_<net>` in `frontend/src/config/networks.js`
- [x] T014 [US1] Wire `createPaymasterClient(http(sponsorPaymasterUrl))` (+ `context: {}`) into `frontend/src/lib/passkey/smartAccount.js#buildAccount`; expose a "paymaster-wired" flag for the US2 fallback
- [~] T015 [US1] **Contract deployed + validated on Amoy** (2026-07-11): FairWinsVerifyingPaymaster `0xA00A06ae44FA2bd40Ec10D9613c96afD779b6898`, deposit 0.1 POL, verifyingSigner = KMS `0x9Ec0…22CD`. A real sponsored UserOp was included on the live Amoy EntryPoint (tx `0x6742…a322a`, block 41956043) — deposit paid, account native stayed 0. **Remaining for the browser headline test:** deploy the /v1/paymaster gateway + set `PAYMASTER_ADDRESS_80002`/`PM_SIGNER_KMS_KEY` (+ gateway IAM) + `VITE_SPONSOR_PAYMASTER_AMOY`. ~~Execute deploy + fund on Amoy (T008), wire gateway (`PAYMASTER_ADDRESS_80002`, `PM_SIGNER_KMS_KEY`) + SPA (`VITE_SPONSOR_PAYMASTER_AMOY`), run the headline test per [quickstart.md](./quickstart.md) §3 (SC-001)

**Checkpoint**: a native-token-less account transacts for free on Amoy — MVP demonstrable.

---

## Phase 4: User Story 2 - Honest fee disclosure & never-stranded fallback (Priority: P1)

**Goal**: the confirm UI states the true cost; when sponsorship is unavailable the user self-submits (or sees an honest shortfall), never a false "free".

**Independent Test**: force sponsorship-unavailable (dead URL / killswitch) → confirm reads "you pay the network fee"; account with native completes self-submit; account without native sees the exact shortfall.

- [x] T016 [P] [US2] Vitest in `frontend/src/lib/passkey/__tests__/sendBatch.fallback.test.js`: sponsorship 503/unreachable → fallback to self-native; native shortfall → `InsufficientFeeBalance`; a **reverting** op is NOT retried as self-submit (TDD)
- [x] T017 [US2] Implement never-stranded fallback in `frontend/src/lib/passkey/sendBatch.js` (rebuild bundler client WITHOUT paymaster on sponsorship failure; distinguish sponsorship-unavailable from op-revert; throw `InsufficientFeeBalance{shortfall}` when native is short)
- [x] T018 [US2] Update `frontend/src/hooks/useTransfer.js` — route reflects the real outcome (`sponsored` | `self-native` | `self-short`), removing the unconditional `route = 'gasless'`
- [x] T019 [P] [US2] Update `frontend/src/components/wallet/TransferForm.jsx` — badge driven by the real `FeeDisclosure` state ("Sponsored — no network fee" only when actually sponsored, else native fee)
- [ ] T020 [P] [US2] Update `frontend/src/components/wallet/PasskeyConfirm.jsx` — fee disclosure + `InsufficientFeeBalance` shortfall (spec-041 T031 pattern), WCAG 2.1 AA
- [ ] T021 [US2] Validate never-stranded on Amoy (dead paymaster URL / killswitch on) per [quickstart.md](./quickstart.md) §3 (SC-003, SC-004)

**Checkpoint**: US1 + US2 both work; every disclosure matches the real outcome, no dead-ends.

---

## Phase 5: User Story 3 - Sponsorship budget protected from abuse (Priority: P2)

**Goal**: only eligible, in-quota, in-ceiling accounts are sponsored; killswitch halts instantly; deposit exposure is bounded.

**Independent Test**: sanctioned/over-quota/over-cost requests refused (self-submit still offered); killswitch stops all sponsorship within one request; deposit never exceeds the funded cap.

- [x] T022 [P] [US3] Gateway policy tests in `services/relay-gateway/test/paymaster.test.js`: sanctioned → 403; over-quota → 429 `{retryAfterSec}`; over-`PM_MAX_COST_WEI` → 400 `cost_ceiling_exceeded`; over-`PM_MAX_GAS` → 400; killswitch → 503; refusal spends nothing; boot fails on signer mismatch (TDD)
- [x] T023 [US3] Implement `services/relay-gateway/src/paymaster/policy.js` — `estCostWei`/gas-ceiling checks composing the existing `policy/sanctions.js`, `policy/quotas.js`, `policy/killswitch.js`
- [x] T024 [US3] Wire `policy.js` into the `POST /v1/paymaster` pipeline in `services/relay-gateway/src/server.js` (order per [contracts/gateway-paymaster-api.md](./contracts/gateway-paymaster-api.md)); add `PM_ACCOUNT_QUOTA_PER_MIN/DAY`, `PM_GLOBAL_QUOTA_PER_DAY`, `PM_MAX_COST_WEI`, `PM_MAX_GAS` to config
- [ ] T025 [US3] Validate the abuse matrix on Amoy (sanctioned/over-quota refused with working self-submit; killswitch halts; deposit bounded) per [quickstart.md](./quickstart.md) §3 (SC-005, SC-006)

**Checkpoint**: the pool is drain-protected; US1–US3 all independently functional.

---

## Phase 6: User Story 4 - Operator sees sponsorship runway (Priority: P3)

**Goal**: the deposit's remaining balance + estimated time-to-empty are visible before it drains.

**Independent Test**: `/status` reports `paymasterDepositRunwayHrs`; a low-runway condition is surfaced.

- [x] T026 [P] [US4] Gateway test in `services/relay-gateway/test/paymaster.test.js`: `/status` reports `paymasterDepositRunwayHrs` (operator-only, like `gasWalletRunwayHrs`) and flags `< PM_RUNWAY_WARN_HRS` (TDD)
- [x] T027 [US4] Add `paymasterDepositRunwayHrs` (`balanceOf(paymaster) / burnRate`) + `PM_RUNWAY_WARN_HRS` to the health cache + `/status` in `services/relay-gateway/src/server.js`
- [x] T028 [US4] Wire the runway metric + low-runway alert into ops monitoring alongside the alto-executor + relayer gas wallets; document in `docs/runbooks/paymaster-operations.md` (SC-007)

**Checkpoint**: all four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T029 [P] Run Slither + Medusa on `contracts/account/FairWinsVerifyingPaymaster.sol` (no new high/critical; document any accepted finding) + smart-contract security-agent review (Constitution I)
- [ ] T030 [P] `npm run sync:frontend-contracts:<net>` (paymaster address into frontend artifacts, never hardcoded) + `npm run verify:<net>` for the deployed paymaster
- [ ] T031 [P] Flip docs from "planned" → live where deployed: `docs/developer-guide/gasless-intents.md`, `docs/developer-guide/passkey-accounts.md`, `docs/runbooks/paymaster-operations.md`
- [ ] T032 Run the full [quickstart.md](./quickstart.md) validation (fork → Amoy → Polygon) and record results
- [ ] T033 Production rollout: execute deploy + fund + monitor + verify on Polygon 137 (EntryPoint v0.6) per the runbook; register `paymasterDepositRunwayHrs` in prod monitoring

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **BLOCKS all stories** (contract + `getHash` + deploy script).
- **US1 (P3)** → after Foundational. **MVP.**
- **US2 (P4)** → after US1 (needs the paymaster-client wiring from T014 to build the fallback around).
- **US3 (P5)** → after US1 (extends the `/v1/paymaster` pipeline from T012 with full policy).
- **US4 (P6)** → after US1 + deploy (needs a funded paymaster address to measure runway).
- **Polish (P7)** → after the desired stories; T033 (prod) last.

### Critical byte-match dependency
- T010 (gateway `build.js getHash`) MUST equal T006 (contract `getHash`) — verified by T009. A drift silently produces `AA34`/rejected ops.

### Within each story
- Tests first (TDD, must fail) → implementation → on-chain validation task.
- Contract before gateway (`getHash` source of truth) before frontend.

### Parallel opportunities
- Setup: T001–T004 all [P].
- Foundational: T005 + T007 [P] (tests) while T006/T008 implement.
- US1: T013 [P] (frontend config) parallel to gateway T010–T012.
- US2: T019 + T020 [P] (separate components).
- Cross-story: once Foundational is done, a contract dev, a gateway dev, and a frontend dev can advance US1 layers concurrently.

---

## Parallel Example: Foundational

```bash
# Write both contract test suites first (they fail until T006):
Task: "Unit tests test/account/VerifyingPaymaster.test.js"          # T005
Task: "Fork test test/account/fork/VerifyingPaymaster.fork.test.js"  # T007
```

## Parallel Example: User Story 1

```bash
# Frontend config rename in parallel with gateway endpoint work:
Task: "networks.js sponsorPaymasterUrl rename"      # T013 [P]
Task: "gateway build.js getHash/pack"               # T010
Task: "gateway sign.js KMS signing"                 # T011
```

---

## Implementation Strategy

### MVP First (US1 only)
1. Phase 1 Setup → 2. Phase 2 Foundational (CRITICAL) → 3. Phase 3 US1 → **STOP & VALIDATE** on Amoy
(a zero-native account transfers for free) → demo. This is the headline that unblocks the reported bug.

### Incremental delivery
US1 (free transfers) → US2 (honest disclosure + never-stranded — required before public exposure, Constitution III) → US3 (abuse resistance — required before Polygon/mainnet funding) → US4 (runway ops) → Polish + Polygon rollout.

### Recommended gating before Polygon (T033)
US1 + US2 + US3 complete and validated on Amoy, T029 security review passed, deposit cap + limits set.

---

## Notes
- [P] = different files, no incomplete dependency. [Story] = traceability to spec.md.
- Verify each test fails before implementing (Constitution II).
- Contract PR carries a smart-contract security review (Constitution I); no `continue-on-error` on lint/build/test/security (Constitution IV).
- Never-stranded (US2) and honest disclosure are ship-blockers, not polish — they satisfy Constitution III.
- KMS signer + floppy owner + deposit funding are operator actions; deploy tasks (T015/T033) assume they're provisioned.

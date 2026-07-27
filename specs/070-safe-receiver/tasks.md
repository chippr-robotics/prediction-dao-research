---
description: "Task list for Safe Receiver — counterparty-segregated receive addresses"
---

# Tasks: Safe Receiver — counterparty-segregated receive addresses

> ⚠️ **Superseded pending rework.** Design review found 4 critical and 18 major
> issues in this feature's design — see [review-findings.md](./review-findings.md).
> Several statements in this document are falsified there. Do not implement from it as it stands.


**Input**: Design documents from `/specs/070-safe-receiver/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Constitution Principle II is NON-NEGOTIABLE — tests are written alongside the behaviour they describe, and contract tests precede implementation.

**Organization**: Grouped by user story. Phase 2 is genuinely blocking — every story needs the contracts to exist and be deployed, because even free client-side derivation needs the factory and template addresses.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1–US7 from spec.md

---

## Phase 1: Setup

**Purpose**: Scaffolding and the registrations that silently do nothing if forgotten.

- [ ] T001 Create `contracts/receiver/` and add `contracts/receiver/ISafeReceiver.sol` with the shared events and custom errors from [contracts/ISafeReceiverFactory.md](./contracts/ISafeReceiverFactory.md) and [contracts/ISafeReceiveAddress.md](./contracts/ISafeReceiveAddress.md)
- [ ] T002 [P] Create `test/receiver/` and `test/receiver/integration/` directories
- [ ] T003 [P] Add `test/receiver/**` to the `test:coverage` testfiles glob in `package.json` — without this the new contracts are never measured and the gate passes on nothing
- [ ] T004 [P] Create `frontend/src/lib/receiver/` and `frontend/src/components/receiver/` directories

**Checkpoint**: `npm run compile` succeeds; the coverage glob includes the new path.

---

## Phase 2: Foundational (BLOCKING)

**Purpose**: The two contracts, their full test suite, and every registration touchpoint. No user story can start until the factory and template are deployed, because derivation depends on both addresses.

**⚠️ CRITICAL**: Nothing in Phase 3+ can begin until this checkpoint passes.

### Contract tests (write FIRST — they must fail before implementation)

- [ ] T005 [P] Write `test/receiver/SafeReceiverFactory.test.js` covering derivation stability, idempotent `deploy`, write-once `commitCounterparty`, and the `screen` tri-state per [contracts/ISafeReceiverFactory.md](./contracts/ISafeReceiverFactory.md) "Invariants the test suite must prove"
- [ ] T006 [P] Write `test/receiver/SafeReceiveAddress.test.js` covering `onlyOwner` `transferOut`, `amount == 0` full sweep with zero residual, pre-deployment value retention (native + token), and the empty `receive()` accepting a 21,000-gas transfer
- [ ] T007 [P] Write `test/receiver/SafeReceiverFactory.security.test.js` — full access-control matrix over `setSanctionsGuard`, `setScreeningRequired`, `commitCounterparty` and the UUPS upgrade path, plus the required-but-unset-guard unreachability cases (mirror `test/pools/WagerPoolFactory.security.test.js:36-80,192-214`)
- [ ] T008 [P] Write `test/receiver/SafeReceiveAddress.security.test.js` — the hostile-factory-upgrade drain attempt, reentrancy via a malicious native destination and via `contracts/mocks/ReentrantToken.sol`, fee-on-transfer exact-or-revert, and screening-failure-moves-nothing for all three screened parties
- [ ] T009 [P] Add `contracts/mocks/MockHostileReceiverFactory.sol` — a factory implementation that attempts to drain a clone, used by T008 to prove the `onlyOwner` boundary holds across an upgrade

### Contract implementation

- [ ] T010 Implement `contracts/receiver/SafeReceiveAddress.sol` — ERC-1167 template, `_disableInitializers()` in the constructor, `owner`/`factory`/`index` written once at `initialize`, empty `receive()`, no `fallback()`, `transferOut` `onlyOwner` + `nonReentrant` with the check order from [contracts/ISafeReceiveAddress.md](./contracts/ISafeReceiveAddress.md); native forward uses checked `call{value:}` per `contracts/bridge/BridgeRouter.sol:363-368`, never `.transfer()`/`.send()`
- [ ] T011 Implement `contracts/receiver/SafeReceiverFactory.sol` on `UUPSManaged` — `__UUPSManaged_init(admin)` first, **immutable** `receiveAddressImpl` with no setter, `Clones.cloneDeterministic` + `predictDeterministicAddress` against `salt = keccak256(abi.encode(owner, index))`, permissionless idempotent `deploy`, write-once `commitCounterparty`, fail-closed `screen` tri-state per `contracts/pools/WagerPoolFactory.sol:285-303`, trailing `__gap`
- [ ] T012 Add the accepted-Slither-findings NatSpec block to both contracts with per-detector rationale, in the style of `contracts/custody/SafePolicyGuardV2.sol:63-72` (expect `low-level-calls` and `arbitrary-send-eth` at minimum)
- [ ] T013 Create `test/helpers/receiver.js` — deploy helper using `upgrades.deployProxy(..., { kind: 'uups' })`, returning factory, template and a funded member

### Integration, upgrade and fork tests

- [ ] T014 Write `test/receiver/integration/receiver-lifecycle.test.js` — derive → pay while codeless → lazy deploy → partial `transferOut` → remainder stays in place with no change address → full sweep leaves zero residual
- [ ] T015 [P] Write `test/upgradeable/SafeReceiverFactory.upgrade.test.js` — `receiveAddressOf(o, i)` is byte-identical across an upgrade, `commitCounterparty` stays write-once across an upgrade, and no `setReceiveAddressImpl` exists on the ABI
- [ ] T016 [P] Write `test/fork/SafeReceiverScreening.fork.test.js` pinning the real Chainalysis oracle screening gas on Polygon — `research.md` §R7's 13,232 is a mock-oracle floor, not the production number

### Registration (2 fail loud, 4 fail silent)

- [ ] T017 [P] Add `{ name: "SafeReceiverFactory", deploymentsKey: "safeReceiverFactory" }` to `UPGRADEABLE_CONTRACTS` in `scripts/deploy/check-storage-layout.js:20-31` — **fails silent** if missed
- [ ] T018 [P] Add both contracts to `coverage-threshold-policy.json` `gated` at **Tier A** (95% statements / 90% branches) — **fails silent** if missed
- [ ] T019 [P] Add three CATALOG entries to `scripts/deploy/verify.js` — `safeReceiverFactory` (proxy), `safeReceiverFactoryImpl` (impl), `safeReceiveAddressImpl` (template) — **fails loud**: `npm run verify:<net>` exits 1 on an unknown key
- [ ] T020 [P] Add the deployment keys to the `isV2` mapping in `scripts/utils/sync-frontend-contracts.js:263-286` — **fails silent** if missed
- [ ] T021 Add `safeReceiverFactory` and `safeReceiveAddressImpl` address slots to each target per-chain `*_CONTRACTS` block in `frontend/src/config/contracts.js` — **fails loud**: the sync throws without the block. The **template address must be present**, not just the factory: client-side derivation needs both.

### Deployment

- [ ] T022 Write `scripts/deploy/deploy-safe-receiver.js` — deploy template, then `deployProxy` the factory with `(admin, template, sanctionsGuard, screeningRequired)`, `CONFIRM_MAINNET` gate before fetching a signer, and record `safeReceiverFactory` / `safeReceiverFactoryImpl` / `safeReceiveAddressImpl` + `constructorArgs.safeReceiverFactoryImpl = []` + a `deployBlocks` entry immediately
- [ ] T023 [P] Hand-write `frontend/src/abis/SafeReceiverFactory.js` and `frontend/src/abis/SafeReceiveAddress.js` from the compiled artifacts — ABIs are hand-maintained; the sync script emits addresses only
- [ ] T024 Deploy to a local hardhat node and run `npm run check:storage-layout` and the full `test/receiver/` suite green

**Checkpoint**: Both contracts implemented and deployed locally, all contract tests green, storage-layout gate lists `SafeReceiverFactory`, coverage output names both contracts. User stories can now begin.

---

## Phase 3: User Story 1 — Give each payer their own address (Priority: P1) 🎯 MVP

**Goal**: A member creates labelled receive addresses at zero cost, shows them as plain address QR codes, and sees per-address balances with no commingling.

**Independent Test**: Create three labelled addresses, pay each from a different account, verify three correctly attributed balances and that each was payable as a plain address by an ordinary wallet.

### Tests

- [ ] T025 [P] [US1] Write `frontend/src/lib/receiver/__tests__/deriveAddress.test.js` asserting client derivation equals `factory.receiveAddressOf(owner, index)` for index 0, a mid value, and a large value — **if these ever diverge, a member's published address points where their funds cannot be reached**
- [ ] T026 [P] [US1] Write `frontend/src/lib/receiver/__tests__/receiverStore.test.js` — append-only cursor `max(index)+1`, peek does not burn an index, retired addresses are never reissued, records are keyed `(chainId, index)`

### Implementation

- [ ] T027 [P] [US1] Implement `frontend/src/lib/receiver/deriveAddress.js` — pure ERC-1167 CREATE2 prediction from `(factoryAddress, templateAddress, owner, index)`, no provider, no RPC, mirroring `frontend/src/lib/custody/safeVault.js:64-78`
- [ ] T028 [US1] Implement `frontend/src/lib/receiver/receiverStore.js` — `ReceiveAddressRecord` CRUD over `userStorage` per [data-model.md](./data-model.md) §3, cursor derived as `max(index)+1` per `frontend/src/lib/bitcoin/wallet.js:45-49`, peek/issue split per `useBitcoinWallet.js:462-471`
- [ ] T029 [US1] Register `safeReceiverAddresses` in `frontend/src/lib/backup/syncedObjects.js` as `networkScoped: true`, mirroring the `vaultReferences` shape at `syncedObjects.js:70-86`
- [ ] T030 [P] [US1] Implement `frontend/src/lib/receiver/availability.js` — the typed five-value `ReceiverAvailability` from [data-model.md](./data-model.md) §4.4, following the `BRIDGE_UNAVAILABLE_REASON` precedent at `useBridgeAvailability.js:38-46`; strict `NETWORKS[chainId]` lookups only, never `getNetwork()`
- [ ] T031 [US1] Implement `frontend/src/hooks/useSafeReceiver.js` — list addresses, read balances with **per-address failure isolation** (`useCustodyVaults.js:116-129`), on-demand rather than polled, `unreachable` never rendered as `not found`
- [ ] T032 [US1] Add Multicall3 batching for the list view where available (`frontend/src/abis/Multicall3.js` has zero importers today); where unavailable, bound the scanned set and **disclose the list is partial** rather than implying completeness
- [ ] T033 [P] [US1] Build `frontend/src/components/receiver/ReceiveAddressCard.jsx` — plain address, QR via `AddressQRCode` (bare EIP-55, no URI scheme, per `AddressQRCode.jsx:18-19`), label, copy
- [ ] T034 [P] [US1] Build `frontend/src/components/receiver/ReceiveAddressList.jsx` — per-address rows with per-instance failure isolation
- [ ] T035 [US1] Build `frontend/src/components/receiver/CreateAddressModal.jsx` — label + optional counterparty address, and the optional on-chain `commitCounterparty` with its write-once consequence stated before signing
- [ ] T036 [US1] Build `frontend/src/components/receiver/SafeReceiverPanel.jsx` — section shell carrying the two mandatory disclosures: **anyone can pay these addresses, deposits are not blocked** (FR-006) and **these addresses are publicly linkable to each other and to your account** (FR-007)
- [ ] T037 [US1] Add `{ id: 'receiver', label: 'Receive', icon: … }` to the **Tools** group in `frontend/src/config/appNav.js:52-72` and wire it into `visibleNavGroups` so it **hides entirely** on networks without the factory (the `collectibles`/`predict` precedent), plus the `WalletPage.jsx` tab entry
- [ ] T038 [P] [US1] Write component tests for the panel, list, card and create modal under `frontend/src/test/receiver/`

**Checkpoint**: US1 fully functional and independently demonstrable — addresses created, paid, and listed per counterparty.

---

## Phase 4: User Story 2 — Nothing leaves until you know who paid (Priority: P1)

**Goal**: Clearance is a positive assertion; every withheld portion carries a reason; uncertainty never permits.

**Independent Test**: Pay one address from a clean account and another from a deny-listed account; verify the first is spendable and the second is withheld with its reason and excluded from every total. Make screening unavailable and verify previously-cleared value becomes withheld.

### Tests

- [ ] T039 [P] [US2] Write `frontend/src/lib/receiver/__tests__/clearance.test.js` with **all twelve** cases from [contracts/clearance-model.md](./contracts/clearance-model.md) "Required test cases", including the assertion that screening is called with `{ force: true }` and the decomposition-invariant violation case
- [ ] T040 [P] [US2] Write `frontend/src/lib/receiver/__tests__/attribution.test.js` — log-scan success, missing deploy block, provider range cap, and RPC error each producing the correct typed outcome and **never** an empty set that reads as "no deposits"

### Implementation

- [ ] T041 [US2] Implement `frontend/src/lib/receiver/attribution.js` — `Transfer` logs filtered by recipient topic, refusing to scan without a recorded deploy block and saying so (the `useVaultProposals.js:53-61` precedent); handle provider block-range caps explicitly
- [ ] T042 [US2] Implement `frontend/src/lib/receiver/clearance.js` — the eight-step algorithm from [contracts/clearance-model.md](./contracts/clearance-model.md), screening every depositor with `{ force: true }` (`useAddressScreening.js:50-53`), the closed `WithholdReason` enumeration, and the hard `spendable + Σ withheld == total` assertion
- [ ] T043 [US2] Extend `ReceiveAddressCard.jsx` with the balance decomposition — spendable and withheld shown together, every withheld portion carrying its reason, so a total exceeding spendable is never mysterious (FR-015)
- [ ] T044 [US2] Write the member-facing copy for all seven withhold reasons per the clearance-model wording rules — "check unavailable" must never read as "this payer is sanctioned", and `unattributable` must not imply wrongdoing
- [ ] T045 [US2] Ensure every read failure surfaces as a failure state, never as `0` or an empty list (FR-016) — add explicit tests asserting the rendered output is not a zero

**Checkpoint**: Clearance drives what the member sees; nothing unverified is presented as spendable.

---

## Phase 5: User Story 3 — Sweep cleared funds (Priority: P1)

**Goal**: Cleared funds move to the member's account in one action, with on-chain screening of named actors, per-address and per-asset outcomes, and no gas ever needed at the receive address.

**Independent Test**: Sweep a cleared address; verify funds arrive, gas was paid once from the member's own account, and nothing was sent to the receive address first. Deny-list the member and verify the sweep reverts with nothing moved.

### Tests

- [ ] T046 [P] [US3] Write `frontend/src/hooks/__tests__/useReceiverSweep.test.js` — per-address and per-asset outcomes, one failure never aborting the rest, `skipped` reported rather than omitted, and the sweep consuming `spendable` rather than `total`
- [ ] T047 [P] [US3] Extend `test/receiver/integration/receiver-lifecycle.test.js` with the multi-address, multi-asset batch: member-screen is batch-wide, destination and counterparty screens are per-item and isolated

### Implementation

- [ ] T048 [US3] Implement `frontend/src/hooks/useReceiverSweep.js` — lazy `deploy` folded in where the clone has no code, then `transferOut` per address/asset, returning `SweepOutcome[]` in the `legacyKeys.js:396-450` shape with a gas reserve estimated against the real contract destination (`legacyKeys.js:376-391`)
- [ ] T049 [US3] Map contract reverts to member-facing causes — `SanctionedAddress` must name **which** party failed (payer / recipient / committed counterparty), and `ScreeningNotConfigured` must read as "the check could not be completed", never as a sanctions verdict (FR-028, FR-029)
- [ ] T050 [US3] Build `frontend/src/components/receiver/SweepModal.jsx` — recipient, amount, asset, network, screening status, any fee, and **what is being withheld and why**; state plainly when the sweep moves less than the address holds (FR-023)
- [ ] T051 [US3] Recompute clearance at confirmation time and, if it changed since render, tell the member before signing rather than silently sweeping a different amount
- [ ] T052 [US3] Wire the two-rail write pattern — passkey via `sendCalls`/`executeBatch` for a single confirmation, classic via the sequential path — per `frontend/src/hooks/useOpenChallengeAccept.js:217-256`
- [ ] T053 [P] [US3] Write component tests for `SweepModal.jsx` including the withheld-disclosure and amount-changed paths

**Checkpoint**: MVP complete — members can create addresses, see honest clearance, and collect their money.

---

## Phase 6: User Story 4 — Spend directly from a receive address (Priority: P2)

**Goal**: Pay a third party straight from a receive address; the remainder stays in place, still attributed, with no change address.

**Independent Test**: Spend part of a cleared balance to an external address; verify the payee receives the exact amount, the remainder stays in the same address with the same counterparty, and the destination was screened.

- [ ] T054 [P] [US4] Write tests asserting the remainder stays in the same address after a partial spend and that **no new address is created** (FR-024)
- [ ] T055 [US4] Extend `useReceiverSweep.js` with an explicit-amount spend path to an arbitrary destination
- [ ] T056 [US4] Extend `SweepModal.jsx` (or a sibling) with destination entry using the app's standard address entry, identity resolution and screening
- [ ] T057 [US4] Refuse an over-spend before any signature, stating how much is actually spendable (FR: US4 scenario 4)

**Checkpoint**: Pass-through payments work without a sweep hop.

---

## Phase 7: User Story 5 — Recover every address on a new device (Priority: P2)

**Goal**: Every address and balance recovers from the member's account alone — no local data, no backup, no platform service, no scanning.

**Independent Test**: Create funded addresses, clear all local data, reconnect on a fresh profile, verify everything reappears without a backup; then restore the backup and verify labels return.

- [ ] T058 [P] [US5] Write `frontend/src/lib/receiver/__tests__/recovery.test.js` — full recovery with an empty store and **zero** calls to any platform service, plus label restoration from backup
- [ ] T059 [US5] Implement derivation-based rediscovery in `useSafeReceiver.js` — walk indices from 0 and rebuild the list from chain state alone
- [ ] T060 [US5] Bound the rediscovery walk honestly — decide and document the stopping rule, and **disclose** when the walk stopped early rather than implying the list is complete
- [ ] T061 [US5] Show unlabelled recovered addresses with an explanation that labels are missing, never as blank entries that look like new addresses (FR-028)
- [ ] T062 [US5] Implement "is this address mine?" lookup from a pasted address, mirroring `useCustodyVaults.js:164-214` `loadByAddress` (FR-029)

**Checkpoint**: No member can lose access to a receive address.

---

## Phase 8: User Story 6 — Honest availability across networks (Priority: P2)

**Goal**: Every surface states what it can actually do on the active network; the five availability states never collapse into one message.

**Independent Test**: Walk the section on an enforcing network, a mock-oracle network, a no-guard network, an unreadable-guard network and an undeployed network, and verify five distinct, accurate messages.

- [ ] T063 [P] [US6] Write `frontend/src/lib/receiver/__tests__/availability.test.js` covering all five states, asserting that `not-deployed` and `screening-unreadable` produce **different** messages (FR-032)
- [ ] T064 [US6] Detect the mock-oracle case and describe it in different terms from a real-oracle network (FR-033) — a `MockSanctionsOracle` guarantee is materially weaker and must not read identically
- [ ] T065 [US6] Render the availability disclosure in `SafeReceiverPanel.jsx`, naming the networks where screening **is** enforced with a switch affordance (FR-031), following `CustodyPanel.jsx:66-80`
- [ ] T066 [US6] Give an unsupported network reached by deep link a stated reason rather than a broken or empty screen (FR-034)
- [ ] T067 [US6] Enforce per-network scoping of balances and addresses; assert no cross-network aggregation anywhere (FR-035)

**Checkpoint**: No surface claims a control the chain will not deliver.

---

## Phase 9: User Story 7 — Sweep without holding gas (Priority: P3)

**Goal**: A passkey member sweeps several addresses in one confirmation, sponsored where available, with an honest fallback.

**Independent Test**: Sponsored sweep of several addresses in one confirmation with no gas token spent; then disable sponsorship and verify the same sweep completes with the member paying.

- [ ] T068 [P] [US7] Write tests for the sponsored path, the self-paid fallback, and the batch-too-large split
- [ ] T069 [US7] Batch deploy+transferOut calls into one `executeBatch` UserOp, sized against `PM_MAX_GAS` 3,000,000 (≈53 ERC-20 sweeps) and the 6 ops/min per-account quota
- [ ] T070 [US7] Disclose sponsored vs. member-paid at the confirm step, and **never** label a sweep sponsored unless the submission actually returned sponsored (FR-037)
- [ ] T071 [US7] Split a batch that exceeds the sponsorship limit and tell the member, rather than failing opaquely
- [ ] T072 [US7] Verify the self-submit fallback works with no gateway, no relayer and no paymaster (FR-011, FR-030)

**Checkpoint**: Collecting money needs no gas token, but never *requires* the platform.

---

## Phase 10: Polish & Cross-Cutting

- [ ] T073 [P] Write `docs/developer-guide/safe-receiver.md` — architecture, the `onlyOwner` authority boundary and why it is not `onlyFactory`, derivation, the clearance model, and the deposit-screening impossibility with its measurements
- [ ] T074 [P] Write `docs/runbooks/safe-receiver-operations.md` — deploy, verify, sync, guard configuration, what an operator does when the oracle goes down (clearance withholds; this is correct, not an incident to "fix" by disabling screening), and how a new template version ships
- [ ] T075 [P] Add the Safe Receiver guardrail paragraph to `CLAUDE.md` alongside the other per-spec entries
- [ ] T076 [P] Write `frontend/src/test/receiver.axe.test.jsx` mirroring `src/test/home.axe.test.jsx` — zero new violations (FR-038)
- [ ] T077 Add a `contracts/test/SafeReceiverFuzzTest.sol` invariant harness (balance conservation across sweep; no residual after a full sweep) **and** list it in `medusa.json` `targetContracts` — the list is hand-maintained and already stale
- [ ] T078 Reconcile the two "receive" concepts in the UI — Bitcoin already has rotating receive addresses (spec 061); make sure a member is not presented with two unrelated things both called Receive
- [ ] T079 Emit a client-ledger entry for a completed sweep so it appears in activity, following the spec-031/051 source pattern
- [ ] T080 Disclose the unknown-token gap — a token absent from `getPortfolioRegistry` is invisible and effectively unsweepable; state it rather than letting a member believe the list is complete
- [ ] T081 Run the full gauntlet: `npm test`, `npm run test:coverage` (both contracts named in the output at Tier A), `npm run check:storage-layout`, `TZ=UTC npx vitest run` in `frontend/`
- [ ] T082 Complete the manual **honesty review** checklist in [quickstart.md](./quickstart.md) §8 — blocking, not automatable
- [ ] T083 Request the smart-contract security review per `.github/agents/smart-contract-security.agent.md` — a merge gate, and the real gate since Slither is non-gating in CI

---

## Dependencies

```
Phase 1 Setup
   └─► Phase 2 Foundational (contracts + deploy + registration)   ← BLOCKS EVERYTHING
          ├─► Phase 3 US1 (create addresses)          P1  🎯 MVP
          │      ├─► Phase 4 US2 (clearance)          P1
          │      │      └─► Phase 5 US3 (sweep)       P1   ← MVP complete
          │      │             └─► Phase 6 US4 (spend)        P2
          │      │             └─► Phase 9 US7 (sponsored)    P3
          │      ├─► Phase 7 US5 (recovery)           P2
          │      └─► Phase 8 US6 (availability)       P2
          └─► Phase 10 Polish
```

**Story independence**: US5 (recovery) and US6 (availability) depend only on US1 and can be built in parallel with US2/US3. US4 and US7 both extend US3's sweep path and are sequential after it.

**Hard ordering inside stories**: tests precede implementation (Constitution II). T027 (derivation) precedes everything else in US1. T042 (clearance) precedes T048 (sweep), because the sweep consumes `spendable`.

---

## Parallel execution examples

**Phase 2, contract tests** — four independent files:

```
T005  test/receiver/SafeReceiverFactory.test.js
T006  test/receiver/SafeReceiveAddress.test.js
T007  test/receiver/SafeReceiverFactory.security.test.js
T008  test/receiver/SafeReceiveAddress.security.test.js
```

**Phase 2, registration** — five separate files, no interdependency:

```
T017  scripts/deploy/check-storage-layout.js
T018  coverage-threshold-policy.json
T019  scripts/deploy/verify.js
T020  scripts/utils/sync-frontend-contracts.js
T023  frontend/src/abis/*.js
```

**Phase 3, US1 presentation** — independent components:

```
T033  ReceiveAddressCard.jsx
T034  ReceiveAddressList.jsx
T030  lib/receiver/availability.js
```

**Cross-story once US1 lands**: Phase 7 (US5) and Phase 8 (US6) run concurrently with Phase 4 (US2).

---

## Implementation strategy

**MVP = Phases 1–5** (Setup + Foundational + US1 + US2 + US3). That delivers the whole point: segregated addresses, honest clearance, and the ability to collect. US2 is not optional in the MVP — shipping US1 and US3 without it would mean a sweep with no clearance rule, which is the feature's one unacceptable failure.

**Incremental delivery**: after the MVP, US4 (spend), US5 (recovery) and US6 (availability) can ship in any order. US6 is a release gate for any network beyond the first, since it is what keeps the per-network claims honest.

**Launch network**: Polygon 137 first — the only network with a real Chainalysis oracle. Amoy 80002 and Mordor 63 have mock oracles and must be described differently (T064). Networks without a guard can host segregation and clearance with `screeningRequired = false`, provided T065 states that no on-chain screening applies there.

**Two tasks worth front-loading despite their phase**: T025 (client derivation matches chain) and T042 (the clearance classifier). A derivation mismatch strands funds at an unreachable address, and an inverted clearance default silently permits what should be withheld. Both are cheap to get right early and expensive to discover late.

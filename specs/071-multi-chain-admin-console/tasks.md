---

description: "Task list for spec 071 — Polygon membership reference chain + all-chains admin reads"
---

# Tasks: Polygon membership reference chain + all-chains admin reads

**Input**: Design documents from `/specs/071-multi-chain-admin-console/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **INCLUDED and non-optional.** Constitution principle II is NON-NEGOTIABLE — behaviour is
not done until tests prove it — and research R9 defines the strategy. The existing
`AdminBridgeTab`/`AdminSupplyTab` suites (27 + 28 tests) are the template throughout.

**Organization**: Grouped by user story. Phase order follows the rollout in research R8, which is
*not* strict priority order: console entry (US2) lands before membership (US1) because nothing else
is reachable from the wrong chain until it does, and the incident-response views convert last.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: Which user story the task serves
- Paths are repository-relative; this feature is frontend-only

---

## Phase 1: Setup

**Purpose**: Directory scaffolding. No new dependencies — this feature adds none.

- [X] T001 Create `frontend/src/lib/chains/` following the existing `lib/<domain>/` convention used by `lib/custody/`, `lib/network/`, `lib/relay/`
- [X] T002 [P] Create `frontend/src/test/lib/chains/` for the estate-helper unit suites

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The cohort, the reference chain, and the estate read primitive. **Every user story
depends on this phase.** No user-visible change lands here.

**⚠️ Nothing in Phase 3+ may start until Phase 2 is complete.**

### Cohort and reference chain

- [X] T003 Add `MEMBERSHIP_REFERENCE_CHAIN_ID`, `membershipChainId()`, `cohortChainIds()`, and `isInCohort(chainId)` to `frontend/src/config/networks.js`, deriving the reference chain from the existing `MAINNET_CHAIN_ID`/`TESTNET_CHAIN_ID` pair selected by `NETWORKS[PRIMARY_CHAIN_ID].isTestnet` — no second literal `137` (FR-001, FR-002; research R1, contracts/membership-chain.md)
- [X] T004 Make a reference chain outside the current cohort fail loudly at module load rather than resolve, in `frontend/src/config/networks.js` (contracts/membership-chain.md rule 3)
- [X] T005 [P] Test the resolver in `frontend/src/test/lib/chains/membershipChain.test.js`: returns 137 under a mainnet build, 80002 under a testnet build, and never a mainnet id under a testnet build (SC-008)

### Chain read result

- [X] T006 Create `frontend/src/lib/chains/chainReadResult.js` with `readOk`, `notDeployed`, `unreadable`, and `aggregate` per contracts/estate-read.md — no value field on the non-`read` states, so a default has nowhere to live
- [X] T007 Implement `aggregate` in `frontend/src/lib/chains/chainReadResult.js` as per-unit subtotals with `partial` + `missing`; expose no API that returns one figure across units (FR-022, FR-023)
- [X] T008 [P] Test the three states and aggregation in `frontend/src/test/lib/chains/chainReadResult.test.js`: mixed units yield separate subtotals; an `unreadable` contributor sets `partial` and is named; a `not-deployed` contributor does **not** set `partial`

### Estate read helper

- [X] T009 Create `frontend/src/lib/chains/estate.js` by moving `readProviderFor`, the network-roster helper, and `readRouterAuthority` out of `frontend/src/components/admin/liquidityAdminCommon.js`, preserving their doc-comments — they are the design (research R2)
- [X] T010 **Fix the spec-069 violation while moving**: `readProviderFor` in `frontend/src/lib/chains/estate.js` obtains its provider from `getReadProvider(chainId)` instead of hand-building from `NETWORKS[chainId].rpcUrl`, keeping only the reuse-the-wallet-provider-for-the-connected-chain shortcut (research R2)
- [X] T011 Bound the roster to the cohort: `estateNetworks(capability)` in `frontend/src/lib/chains/estate.js` filters through `cohortChainIds()`, and still lists chains that could carry the capability but have no FairWins deployment (FR-002, FR-013; contracts/estate-read.md rule 7)
- [X] T012 Add `readAcrossEstate({chainIds, addressFor, read, walletChainId, walletProvider})` to `frontend/src/lib/chains/estate.js` — concurrent, never rejects, one dead endpoint becomes `unreadable` without failing the batch (FR-015)
- [X] T013 Generalize `readRouterAuthority` to `readAuthority({provider, address, account, roles})` in `frontend/src/lib/chains/estate.js` for any AccessControl contract, keeping `readable: false` ⇒ unknown-not-denied and `deployed: false` ⇒ definite denial (research R4)
- [X] T014 Turn `frontend/src/components/admin/liquidityAdminCommon.js` into a re-export of the promoted helpers so `BridgeTab`/`SupplyTab` are untouched
- [X] T015 [P] Test the helper in `frontend/src/test/lib/chains/estate.test.js`: a rejected read yields `unreadable` with a reason while siblings resolve; a slow chain does not delay its siblings' results, which are observable before it settles (FR-015); the roster never contains an out-of-cohort chain
- [X] T016 [P] Source-level test (in `frontend/src/test/lib/chains/estate.test.js`, alongside the behavioural cases) asserting `estate.js` reaches providers via `getReadProvider` and contains no `NETWORKS[...].rpcUrl` access, so the spec-069 bypass cannot return
- [X] T017 **Checkpoint**: run `npx vitest run src/test/admin/AdminBridgeTab.test.jsx src/test/admin/AdminSupplyTab.test.jsx` — both suites MUST pass **unmodified**. If either needed changing, the helper was rewritten rather than moved; revert and redo T009–T014.

---

## Phase 3: User Story 2 — An operator reaches the console from wherever they are (P1)

**Goal**: Console entry becomes an estate-wide question. An operator holding a role on any one chain
gets in from any chain, and is told where their authority lives.

**Independent test**: With an account holding a role on exactly one network, connect on a different
network, open `/admin`, and confirm it opens with only that role's views and names the network each
role was found on.

- [X] T018 [US2] ~~Extend the role sync in `frontend/src/contexts/RoleContext.jsx`~~ **N/A — `RoleContext.jsx` (`RoleProvider`) is imported nowhere and mounted nowhere; `useRoles` reads `WalletContext`. Dead code, so the estate sweep landed in T019 only rather than being mirrored into an unmounted provider.** Original scope: extend the role sync to resolve each admin role across `cohortChainIds()` instead of the wallet chain only, recording per chain whether the role was held, not held, or unreadable (FR-009, FR-011)
- [X] T019 [US2] Apply the same estate-wide sync in `frontend/src/contexts/WalletContext.jsx`, which carries a parallel copy of the sync loop
- [X] T020 [US2] Keep the existing `(address, chainId)` local-storage cache key in `frontend/src/utils/roleStorage.js` — the chain dimension already exists, so entries simply exist for more chains and **no migration is needed**; confirm no schema change is introduced
- [X] T021 [US2] Expose an estate-wide `hasAnyRole`/`hasRole` plus a per-chain query (`chainsForRole`, `hasRoleOnChainId`, `estateRead`) from `frontend/src/contexts/WalletContext.jsx` (the live provider; see T018) and through `hooks/useRoles.js`, so entry and authority stay separable (FR-009 vs FR-019)
- [X] T022 [US2] Make the entry gate in `frontend/src/components/AdminPanel.jsx` use the estate-wide answer
- [X] T023 [US2] Distinguish the two refusals in `frontend/src/components/AdminPanel.jsx`: "you hold no operator role" vs "no network could be read" (FR-012) — the second must never be phrased as the first
- [X] T024 [US2] Extend the "Your Permissions" card in `frontend/src/components/AdminPanel.jsx` to name the network(s) each role is held on, and mark unread networks as unread rather than as ✗ (FR-010, FR-011)
- [X] T025 [P] [US2] Test in `frontend/src/test/admin/adminEstateEntry.test.jsx`: role on one chain + wallet on another ⇒ console opens with that role's views; no role anywhere ⇒ refused; one chain unreadable ⇒ still granted from roles found elsewhere; all chains unreadable ⇒ the distinct refusal message
- [X] T026 [P] [US2] Test that the permissions card names the network per role and never renders an unread network as a denial

**Checkpoint**: US2 is independently shippable — the console is reachable from any chain, with every
view still gated exactly as before.

---

## Phase 4: User Story 1 — A member's membership follows them across networks (P1)

**Goal**: Every membership read resolves on the reference chain, and an unreadable reference chain
yields *unknown*, never *none*.

**Independent test**: Connect a membership-holding account on each supported network in turn and
confirm identical tier and expiry; then break the reference chain's endpoint and confirm *unknown*
with a retry.

- [X] T027 [US1] Resolve the membership branch of `hasRoleOnChain` in `frontend/src/utils/blockchainService.js` against `membershipChainId()`, ignoring the caller's chain; leave the admin-role branch honouring its explicit chain (research R3, FR-003)
- [X] T028 [US1] Do the same for the MembershipManager path of `getUserTierOnChain` in `frontend/src/utils/blockchainService.js`
- [X] T029 [US1] Introduce a distinct *unknown* membership state in `frontend/src/utils/blockchainService.js` so a failed reference-chain read is no longer swallowed into `{tier: 0}` / `false` (FR-004) — this is the load-bearing change; today both functions return the same value for "no membership" and "could not ask"
- [X] T030 [US1] Propagate *unknown* through `frontend/src/contexts/RoleContext.jsx` and `frontend/src/hooks/useRoleDetails.js` without collapsing it to "no membership"
- [X] T031 [US1] Render *unknown* honestly wherever membership gates a surface: state that membership could not be read, offer a retry, and refuse the gated action attributing the refusal to the failed read (FR-005)
- [X] T032 [P] [US1] Test in `frontend/src/test/lib/chains/membershipReferenceChain.test.js` that `hasRoleOnChain(account, 'WAGER_PARTICIPANT', <any chain>)` constructs against the reference chain's MembershipManager — asserted by the constructed-address technique `adminLeastPrivilege.test.jsx` already uses
- [X] T033 [P] [US1] Test that `hasRoleOnChain(account, 'GUARDIAN', 8453)` still reads chain 8453 — the admin branch is unaffected
- [X] T034 [P] [US1] Test that a failed reference-chain read yields *unknown* and that no surface renders the words "no membership" in that state (FR-004)
- [X] T035 [P] [US1] Amend the doc-comment in `frontend/src/test/chainResolutionGuard.test.js` to state the rule the code actually follows — resolve against an **explicit** chain (wallet's, reference, or scoped), never the build-time default — and confirm the mechanical check still passes unmodified (research R5)

**Checkpoint**: US1 is independently shippable and closes the live defect.

---

## Phase 5: User Story 5 — Membership purchases go to the reference chain (P2)

**Goal**: Purchases settle on the reference chain, disclosed before signature. Depends on Phase 4's
resolver.

**Independent test**: Start a purchase from a non-reference chain; confirm disclosure + switch, that
declining buys nothing, and that no path completes a purchase elsewhere.

- [ ] T036 [US5] Route the purchase calls built in `frontend/src/components/ui/PremiumPurchaseModal.jsx` to `membershipChainId()` rather than the connected chain (FR-006)
- [ ] T037 [US5] Disclose the settlement network in the confirm step of `frontend/src/components/ui/PremiumPurchaseModal.jsx` before signature, and require the wallet to be there (FR-007)
- [ ] T038 [US5] Offer a wallet network switch to the reference chain, and ensure declining leaves no purchase attempted on any chain (FR-007, acceptance 2)
- [ ] T039 [US5] Evaluate payment-token sufficiency against the reference chain's balance only, stating any shortfall in that chain's payment token, in `frontend/src/components/ui/PremiumPurchaseModal.jsx` (FR-008)
- [ ] T040 [US5] Audit `frontend/src/hooks/useTierPrices.js` and `frontend/src/hooks/useVouchers.js` for connected-chain assumptions in the purchase path and route them to the reference chain
- [ ] T041 [P] [US5] Test in `frontend/src/test/membershipPurchaseRouting.test.jsx`: purchase from a non-reference chain discloses the settlement network; declining the switch sends no transaction; the built calls target the reference chain's MembershipManager; **and the absence SC-006 claims** — drive the flow on *each* non-reference cohort chain and assert every built call still targets the reference chain's address, so "no path completes a purchase elsewhere" is verified rather than asserted in prose (mirrors the absence assertion T067 makes for FR-020)

**Checkpoint**: US1 + US5 together close the read/write loop — a purchase is now readable from
everywhere.

---

## Phase 6: User Story 3 — Accrued fees are visible for the whole estate (P2)

**Goal**: The Overview accounts for every fee-bearing chain, per unit, with partial totals labelled.

**Independent test**: With balances on more than one network, confirm each is listed with its own
balance and unit; break one and confirm it is flagged, excluded, and the total labelled partial.

- [ ] T042 [US3] Replace the single-chain `accruedFees` read in `frontend/src/components/AdminPanel.jsx` with a `readAcrossEstate` call over every cohort chain carrying a MembershipManager (FR-021)
- [ ] T043 [US3] Add the second fee source per research R6 — the treasury's payment-token balance on each cohort chain carrying a `FeeRouter` — labelled **received**, and never added to **accrued (undrawn)**; the FeeRouter itself holds nothing, so it is not read for a balance
- [ ] T044 [US3] Render the per-chain fee table in `frontend/src/components/AdminPanel.jsx` with each chain as read / not deployed / unreadable, each with its unit (FR-014, FR-021)
- [ ] T045 [US3] Use `aggregate` for any total, showing per-unit subtotals and a partial label naming missing chains (FR-022, FR-023)
- [ ] T046 [US3] Update `frontend/src/components/admin/MembershipTreasuryOverview.jsx` to accept per-chain results instead of a single `accruedFees` string
- [ ] T047 [US3] Scope the Treasury withdrawal form in `frontend/src/components/AdminPanel.jsx` to a chain, defaulting its Max to that chain's accrued balance rather than a global figure
- [ ] T048 [P] [US3] Test in `frontend/src/test/admin/adminFeeEstate.test.jsx`: every cohort chain appears in one of the three states; an unreadable chain is excluded, flagged, and the total labelled partial; accrued and received are never summed
- [ ] T049 [P] [US3] Update `frontend/src/test/MembershipTreasuryOverview.test.jsx` for the new per-chain props

**Checkpoint**: US3 is the first view consuming the estate helper end-to-end and validates the
pattern for Phase 7.

---

## Phase 7: User Story 4 — Every operator view spans the estate (P2)

**Goal**: Thirteen of the fifteen remaining views honour
[contracts/view-scope.md](./contracts/view-scope.md). The other two — Overview and Treasury —
converted in Phase 6, so "thirteen" here is this phase's share, not the whole remainder.

**Independent test**: Per view — connect on chain A, scope to B, confirm B's state renders, writes
are withheld with a stated reason, and the scope does **not** follow the wallet when it switches.

### Shared scope control

- [ ] T050 [US4] Extract the network scope selector used by `BridgeTab`/`SupplyTab` into a shared component under `frontend/src/components/admin/`, defaulting to the wallet chain when in the roster and never re-targeting when the wallet switches (FR-013, FR-016)
- [ ] T051 [US4] Add a shared per-chain state renderer (read / not deployed / unreadable + reason + retry) so no view invents its own rendering of the three states (FR-014)
- [ ] T052 [US4] Add a shared write-gate presenter that states "switch to <chain> to act" before signature and "role not held here" when authority is read and denied, leaving controls offered with authority unconfirmed when the read failed (FR-018, FR-019, research R4)
- [ ] T053 [P] [US4] Test the three shared pieces in `frontend/src/test/admin/adminScopeControls.test.jsx`, including axe-clean rendering and per-chain status conveyed by text not colour alone (constitution V)

### Read-mostly views

- [ ] T054 [P] [US4] Convert `frontend/src/components/admin/MaintenanceTab.jsx` to the scope contract; each permissionless call still targets one named chain (FR-017)
- [ ] T055 [P] [US4] Convert `frontend/src/components/admin/ServiceHealthCard.jsx` and `frontend/src/components/admin/PaymasterOpsCard.jsx`; the paymaster deposit is per chain
- [ ] T056 [P] [US4] Convert `frontend/src/components/admin/OracleAdaptersTab.jsx`; chains without adapters read *not deployed*, which is the honest answer for most of the cohort
- [ ] T057 [P] [US4] Convert `frontend/src/components/admin/ProtocolConfigTab.jsx` (Wiring & Tokens) across its three contracts

### Write-heavy views

- [ ] T058 [US4] Convert the Tiers view in `frontend/src/components/AdminPanel.jsx` — only the reference chain carries a MembershipManager on the mainnet cohort, so the rest must show *not deployed*, not an empty form (**not** `[P]`: shares `AdminPanel.jsx` with T059/T064/T066/T068)
- [ ] T059 [US4] Convert the Members view in `frontend/src/components/AdminPanel.jsx` (**not** `[P]`: same file as T058/T064/T066/T068)
- [ ] T060 [P] [US4] Convert `frontend/src/components/admin/FeesTab.jsx`; fee rates are genuinely per chain and must not be shown as one global rate
- [ ] T061 [P] [US4] Convert `frontend/src/components/admin/StakingTab.jsx`
- [ ] T062 [P] [US4] Convert `frontend/src/components/admin/DenyListAdmin.jsx`
- [ ] T063 [P] [US4] Convert `frontend/src/components/admin/CallsignRegistryAdmin.jsx`
- [ ] T064 [US4] Convert the Admin Roles view in `frontend/src/components/AdminPanel.jsx` so a grant names the chain it lands on — grants are already per contract **per chain** on-chain, and the view currently implies otherwise
- [ ] T065 [P] [US4] Per-view tests under `frontend/src/test/admin/` for T054–T064, each covering: scope-off-wallet renders read state; write withheld with a stated reason; unreadable ≠ zero; not-deployed stated explicitly; **the write confirmation names the chain it targets** (FR-017 — the only write requirement with no other test); and the view is **axe-clean** in every per-chain state, matching the `is axe-clean fully loaded` case the existing `AdminBridgeTab`/`AdminSupplyTab` suites already carry (constitution V)

### Incident-response views (converted last, on a proven pattern — research R8)

- [ ] T066 [US4] Convert the Emergency view in `frontend/src/components/AdminPanel.jsx`; pause is per chain and the confirmation names it (FR-017)
- [ ] T067 [US4] Assert there is **no** cross-chain "pause everywhere" control (FR-020) — an implicit multi-chain killswitch is exactly what this feature must not create
- [ ] T068 [US4] Convert the Account Moderation view in `frontend/src/components/AdminPanel.jsx`; freeze is per chain and the confirmation names it (FR-017)
- [ ] T069 [P] [US4] Test the incident paths in `frontend/src/test/admin/adminIncidentEstate.test.jsx`, including the absence of any multi-chain action

**Checkpoint**: all seventeen views honour one contract; the console no longer mixes estate-wide and
wallet-scoped views.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T070 [P] Add a source-level guard in `frontend/src/test/admin/adminEstateGuard.test.js` asserting no admin view reads the wallet chain implicitly and none sums balances across chains (research R9)
- [ ] T071 [P] Update `docs/runbooks/operations-control-plane.md`: scope selectors, the three per-chain states, partial totals, and that a write is always one named chain
- [ ] T072 [P] Add `docs/developer-guide/chain-estate-reads.md` covering `membershipChainId()`, the estate helper, and the rule that unreadable is never zero
- [ ] T073 [P] Update `CLAUDE.md` guardrails with the reference-chain rule and the "never hand-build a provider" reminder now that it applies console-wide
- [ ] T074 Run the full `npm run test:frontend` and `npm run lint`; confirm the axe and Lighthouse CI jobs stay green
- [ ] T075 Walk [quickstart.md](./quickstart.md) end to end, including the three failure modes it names

---

## Dependencies

```text
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) ──────── blocks everything below
    ↓
Phase 3 (US2 — entry)          ← independently shippable
    ↓
Phase 4 (US1 — membership)     ← independently shippable
    ↓
Phase 5 (US5 — purchases)      ← depends on Phase 4's resolver
    ↓
Phase 6 (US3 — fees)           ← first end-to-end use of the estate helper
    ↓
Phase 7 (US4 — all views)      ← per-view tasks largely parallel
    ↓
Phase 8 (Polish)
```

**Story independence**: US2, US1, and US3 each ship alone. US5 depends only on US1's resolver. US4's
per-view tasks depend on the shared scope controls (T050–T052) but not on each other.

## Parallel execution examples

**Phase 2** — T005, T008, T015, T016 are independent test files; T006/T007 (read result) and
T009–T013 (estate helper) are different modules.

**Phase 7** — after T050–T052 land, T054–T063 touch different files and run in parallel. T058, T059,
T064, T066, T068 all edit `AdminPanel.jsx` and must be **serialized** with each other.

**Phase 8** — T070–T073 are independent.

## Implementation strategy

**MVP**: Phase 1 + Phase 2 + Phase 3 (US2). That alone makes the console reachable from any chain
with no other behaviour changed — the smallest useful increment.

**Highest-value increment**: add Phase 4 (US1). Together, MVP + US1 close both live defects: an
operator locked out by their wallet's network, and a member reported as unentitled.

**Then**: US5, US3, US4 in order, each shippable on its own.

**Riskiest work last, deliberately**: Emergency and Account Moderation (T066–T068) convert after
eight other views have proven the pattern. The killswitch should be the least-experimental
conversion in the feature, not the first.

## Task summary

| Phase | Story | Tasks | Count |
|---|---|---|---|
| 1 — Setup | — | T001–T002 | 2 |
| 2 — Foundational | — | T003–T017 | 15 |
| 3 — Console entry | US2 (P1) | T018–T026 | 9 |
| 4 — Membership resolution | US1 (P1) | T027–T035 | 9 |
| 5 — Purchase routing | US5 (P2) | T036–T041 | 6 |
| 6 — Fee estate | US3 (P2) | T042–T049 | 8 |
| 7 — All views | US4 (P2) | T050–T069 | 20 |
| 8 — Polish | — | T070–T075 | 6 |
| **Total** | | | **75** |

---

description: "Task list for spec 080 — deterministic, cohort-wide contract addresses"
---

# Tasks: Deterministic, cohort-wide contract addresses

**Input**: Design documents from `/specs/080-deterministic-addresses/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/address-scheme.md](./contracts/address-scheme.md),
[quickstart.md](./quickstart.md)

**Tests**: Test tasks ARE included. Constitution II is non-negotiable here, and more importantly this
feature's failure modes are all *silent* — a gate that stops checking, an address that quietly moves,
a window nobody tries to use. Every gate below is mutation-tested: break the property, confirm the
failure. A gate that has never been seen to fail is not evidence.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 from spec.md
- **🚧 GATE**: blocking — work does not proceed past it

---

## Phase 1: Setup & Measurement

**Purpose**: Resolve the two things research left unmeasured, before anything depends on them.

- [ ] T001 Write `scripts/deploy/lib/salt-registry.js` enumerating every deterministic identifier by
      resolving `generateSalt(...)` call sites in `scripts/deploy/` — including the per-file local
      prefix variables (`saltPrefix`, `saltPrefixModular`, `saltPrefixTRM`, `perpSaltPrefix`,
      `PERP_SALT_PREFIX`, `SALT_PREFIX`), not only `SALT_PREFIXES.*`
- [ ] T002 🚧 **GATE** Resolve R8's open question in `scripts/deploy/lib/salt-registry.js`: report every
      pair of identifiers mapping to one salt, and classify each as *same contract* (intentional and
      idempotent) or *different contracts* (a real collision that must be fixed before the scheme is
      relied upon)
- [ ] T003 [P] Fold the duplicated prefix literals into `scripts/deploy/lib/constants.js` —
      `"ClearPathDAO-Modular-v1.0-"` duplicates `SALT_PREFIXES.RBAC` and `"ClearPathDAO-TRM-v1.1-"`
      duplicates `SALT_PREFIXES.TIERED_ROLE_MANAGER`, so the constants table is not currently the
      single source it appears to be
- [ ] T004 [P] Record the five `transitional` contracts and their legacy addresses in
      `specs/080-deterministic-addresses/data-model.md` — `safeProposalHub` `0x94b5b38c…` (6 chains),
      `backupPointerRegistry` `0x664ACAd4…`, `openERC20Impl` `0xd8e67c6c…`, `openERC721Impl`
      `0x02819fd0…`, `restrictedERC20Impl` `0x0dd67e2a…`

**Checkpoint**: it is known whether any two different contracts already share a salt.

---

## Phase 2: Foundational — path-independent bytecode  *(US1, P1)*

**Story goal**: a contract's address stops depending on where its source lives.

**Independent test**: record predicted addresses, move source files, confirm nothing moved (S2).

**Why this is foundational and not just first**: every later phase produces addresses that a refactor
would silently move until this lands. It also delivers spec 079's entire saving on its own, so it has
value even if the rest is deferred.

- [ ] T005 [US1] Add `metadata: { bytecodeHash: "none" }` to the **0.8.24** compiler entry in
      `hardhat.config.js`
- [ ] T006 [US1] Add the same to the **0.8.23** entry (the vendored account closure) in
      `hardhat.config.js` — leaving one profile path-dependent would leave a class of addresses that
      still move
- [ ] T007 [US1] 🚧 **GATE (S1 / SC-001)** Write `scripts/codegen/compare-stripped.js` comparing
      metadata-stripped runtime code per contract between two artifact trees, and prove **all 96
      bytecode-producing contracts are identical**. Any contract that is not blocks the change —
      that is behaviour change, not provenance change
- [ ] T008 [US1] Extend `test/config/CompilerTargets.test.js` to assert the metadata setting is
      declared on **every** compiler entry and override, mirroring the existing EVM-target pin
- [ ] T009 [US1] Mutation-test T008: remove the setting from one entry and confirm the suite fails.
      A guardrail that has not been seen to fail is not a guardrail
- [ ] T010 [US1] Re-record `specs/075-monorepo-workspaces/baseline-bytecode.json` once, deliberately,
      stating the count changed and that only the appended block moved (FR-003)
- [ ] T011 [US1] Update `docs/runbooks/` to record that source verification is now a partial rather
      than exact match on verifiers comparing provenance, so a future partial match is recognised as
      expected rather than investigated as an incident (R7)

**Checkpoint**: US1 is independently mergeable and complete. **Spec 079 can now be re-planned as
byte-neutral.**

---

## Phase 3: Predict before deploying  *(US2, P2 — part 1)*

- [ ] T012 [US2] Write `scripts/deploy/predict-addresses.js` computing every contract's address from
      deployer + salt + initcode hash, without contacting any chain (FR-006)
- [ ] T013 [US2] 🚧 **GATE (S2 / SC-002)** Prove moving a source file changes zero predicted
      addresses — **and demonstrate the test FAILS before T005/T006**. A test that cannot fail proves
      nothing, so run it both ways and record both results
- [ ] T014 [US2] [P] Add the identifier-collision check from T002 to the build (`npm run compile` or
      a dedicated `check:` script) so a collision fails at **build** time. A collision found at deploy
      time has already cost a transaction and put one contract at another's address (FR-011)
- [ ] T015 [US2] [P] 🚧 **GATE (S3)** Validate predictions against reality using the ten contracts
      already deployed via CREATE2 — a free correctness check against chains rather than against the
      tool that produced the numbers. Use **pre-change** bytecode; the five `transitional` contracts
      deliberately diverge after T005
- [ ] T016 [US2] [P] Teach `scripts/deploy/lib/helpers.js#deployDeterministic` to verify the deployed
      address equals the prediction and fail loudly otherwise (FR-008)
- [ ] T017 [US2] Distinguish *already deployed by us* (skip, no transaction) from *address occupied by
      something else* (**incident**, stop) in `scripts/deploy/lib/helpers.js` (FR-009 / G3)
- [ ] T018 [US2] Detect the Safe Singleton Factory being absent on a target chain **before**
      deploying, and never fall back to a non-deterministic deploy — a silent fallback produces a
      working deployment at an unpredictable address and looks like success (FR-010 / G3)

---

## Phase 4: Deterministic upgradeable deployment  *(US2, P2 — part 2)*

**The riskiest phase. G6 is the failure most likely to happen silently.**

- [ ] T019 [US2] 🚧 **GATE (G6 / S6) — read before touching the proxy path.** Record the storage-layout
      gate's current coverage as the floor: **26 implementations diffed, 4 declared unverifiable, 7
      chains**. `scripts/deploy/check-storage-layout.js` resolves layouts through the plugin's
      `.openzeppelin` manifest, which `upgrades.deployProxy` writes **at deploy time** — so deploying
      proxies any other way writes no entry, contracts become undiffable, **and the gate keeps
      passing over shrinking coverage**
- [ ] T020 [US2] Change `scripts/deploy/lib/upgradeable.js#deployProxy` to deploy the implementation
      via CREATE2, then the proxy via CREATE2 with **empty init data**, so proxy initcode depends only
      on the implementation address and not on chain-specific configuration (FR-007 / G4 / R3)
- [ ] T021 [US2] 🚧 **GATE** Call `upgrades.forceImport` after every deterministic proxy deployment so
      the layout manifest is still written, and assert the gate's coverage count **has not dropped**
      from T019's floor. A drop is a failed deployment, not a reporting quirk
- [ ] T022 [US2] Mutation-test T021: corrupt a storage layout (insert a slot above existing state,
      shrink `__gap`) and confirm the gate fails naming the contract and the live implementation
- [ ] T023 [US2] 🚧 **GATE (S5 / SC-004)** Prove parity on **two disposable chains with DIFFERENT
      transaction histories** — advance one deployer's nonce first. Two fresh chains would pass even
      if addresses still depended on nonce, so that test would prove nothing

---

## Phase 5: Atomic deploy-and-init  *(US3, P3)*

**Story goal**: no moment exists in which a contract is deployed but unconfigured.

**Note**: the window does not exist today — this work creates it (US2 takes init data out of the
constructor to get parity). It is closed rather than accepted.

- [x] T024 [US3] 🚧 **GATE (FR-021)** ~~Decide~~ **DECIDED 2026-08-09: permissioned** (research.md
      R4a). Binding constraint that follows: the authorised party MUST be an address identical on
      every chain in the cohort, because the factory's own address derives from its initcode and
      therefore from its constructor arguments — a per-chain owner would fork the factory address and
      destroy the determinism it exists to provide. Verified viable: the deployer is a single address
      (`0x52502d…`) across all 7 chains that record one
- [ ] T024a [US3] Implement authority so it cannot become chain-specific by accident — either embed a
      chain-independent address or bind authority to `msg.sender` via the salt so nothing is embedded
- [ ] T024b [US3] 🚧 **GATE** Assert in test that the factory's predicted address is identical across
      two disposable chains configured with different admin sets — the regression that would silently
      undo T024's constraint
- [ ] T025 [US3] Implement the deploy-and-init factory in `contracts/deploy/`, CREATE2-deploying the
      proxy and calling `initialize` in one transaction
- [ ] T026 [US3] Deploy the factory itself through the Safe Singleton Factory so it has the same
      address on every chain and can be reasoned about once
- [ ] T027 [US3] 🚧 **GATE (FR-015)** Confirm closing the window did **not** move any address. The
      intuitive fix — putting init data back in the proxy constructor — closes the window and destroys
      parity in the same move, because initcode includes constructor args. This gate exists to catch
      exactly that
- [ ] T028 [US3] 🚧 **GATE (S7 / SC-005)** Prove the window's absence by **attempting to interpose** —
      write `scripts/ops/attempt-init-race.js` trying to initialize from a second account. Observing
      "it was initialized" cannot distinguish *no window* from *a window nobody used*
- [ ] T029 [US3] Confirm a failure during initialization fails the whole step and leaves nothing
      partially configured (FR-014)
- [ ] T030 [US3] 🚧 **GATE (FR-021)** Security review of the factory and the deployment/configuration
      split before merge — constitution I, and the review must examine the authority decided in T024

---

## Phase 6: Make the drift visible  *(US4, P4)*

- [ ] T031 [US4] Write `scripts/ops/estate-consistency.js` classifying every contract as consistent,
      inconsistent, exception (stateful), exception (transitional), or unknown
- [ ] T032 [US4] 🚧 **GATE (S9 / SC-008)** Assert **all 51 distinct contracts are classified, none
      unclassified**. Sanity-check against known values: 48 present on some chains but not all;
      `wagerRegistry` and `membershipManager` as stateful exceptions; the five R5 contracts as
      **transitional, never consistent** while mid-move
- [ ] T033 [US4] [P] Report an unreachable chain as **unreachable**, never as a contract being absent
      (FR-018) — an absent contract and an unknown one call for opposite actions
- [ ] T034 [US4] [P] Classify the fifteen nonce-coincidence addresses (`accountFactory`,
      `accountImpl`, `safePolicyGuardV2`, `policyGuardSetup`, the fee/bridge/liquidity routers) as
      **inconsistent-by-mechanism** rather than as exceptions — they share addresses by luck, not
      design, and that luck breaks the first time a deployer nonce diverges

---

## Phase 7: Polish & deferred decisions

- [ ] T035 🚧 **GATE (R6)** Decide `accountFactory` / `accountImpl` **separately**, not as part of any
      sweep. They share one address across 8 chains today via plain CREATE, so bytecode is not
      currently an input; moving them to CREATE2 *makes* bytecode an input to an address that member
      passkey wallets derive from
- [ ] T036 [P] Update `docs/developer-guide/` with the address scheme and its boundaries
      (`contracts/address-scheme.md` G1–G7), including that a compiler bump is an address-moving event
- [ ] T037 [P] 🚧 **GATE (S10 / SC-006)** Confirm no live-chain deployment record changed:
      `git diff --stat origin/main -- deployments/` shows nothing outside disposable chains
- [ ] T038 Re-plan spec 079 as byte-neutral now that Phase 2 has landed — its metadata-stripping
      harness, baseline re-record, and FR-006 consequence all become vacuous

---

## Dependencies

```
Phase 1 (T001-T004)  ─┐
                      ├─→ Phase 2 / US1 (T005-T011)  ── independently mergeable, delivers 079's saving
                      │        │
                      │        └─→ Phase 3 / US2a (T012-T018)
                      │                   │
                      │                   └─→ Phase 4 / US2b (T019-T023)   ← G6 lives here
                      │                              │
                      │                              └─→ Phase 5 / US3 (T024-T030)
                      │                                         │
                      └──────────────────────────────────────────┴─→ Phase 6 / US4 (T031-T034)
                                                                            │
                                                                            └─→ Phase 7 (T035-T038)
```

- **T002 gates everything** — if two different contracts already share a salt, the scheme is unsafe
  to rely on until it is fixed.
- **US1 (Phase 2) is the MVP** and is independently mergeable.
- **US2 splits across Phases 3 and 4** because prediction is cheap and low-risk while the proxy path
  change is neither; splitting lets the cheap half de-risk the expensive one.
- **US4 depends only on Phase 1** for the transitional register, so it can run in parallel with
  Phases 3–5 if capacity allows.

## Parallel opportunities

- Phase 1: T003 and T004 after T001.
- Phase 3: T014, T015, T016 are independent files.
- Phase 6: T033 and T034 after T031.
- Phase 7: T036 and T037 are independent.

## Implementation strategy

**MVP = Phase 1 + Phase 2 (T001–T011).** That alone makes addresses survive refactoring and makes
spec 079 byte-neutral — real value delivered without touching a deployment path.

**Stop conditions.** Two, and neither is negotiable: any contract whose *executable* code changes
under T007, and any drop in storage-layout coverage under T021. Both mean the change did something
other than what it claims.

**This feature deploys nothing to a live chain** (T037). Bringing the estate into line is separate
work, deliberately sequenced afterwards — a cohort becomes consistent when contracts are deployed
under the scheme, not when the scheme exists.

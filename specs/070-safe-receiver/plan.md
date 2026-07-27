# Implementation Plan: Safe Receiver — counterparty-segregated receive addresses

**Branch**: `070-safe-receiver` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/070-safe-receiver/spec.md`

> ⚠️ **This plan did not survive design review.** See
> [review-findings.md](./review-findings.md). Four critical findings falsify
> claims made below — most importantly that no platform key can freeze funds
> (C1), that `receiveAddressImpl` is immutable (C2), and that a deployed address
> stays payable by a bare 21,000-gas transfer (C3, which contradicts this
> feature's own `research.md` §R1.1). The Constitution Check below is therefore
> **not valid as written**. Rework before implementing.

## Summary

Give each member an unlimited supply of deterministically-derived receive
addresses, one per counterparty, so an otherwise-unpartitionable balance becomes
a set of per-payer quarantine units. Deposits are unrestricted and the feature
says so; the control lands at spend time, where a positive clearance assertion
gates what is spendable and the on-chain sanctions guard screens the parties the
transaction can actually name.

**Technical approach.** A platform-singleton UUPS `SafeReceiverFactory` derives
addresses as ERC-1167 `cloneDeterministic` predictions from
`salt = keccak256(owner, index)` against an **immutable** template. Minting is
therefore pure client-side arithmetic — free, instant, and requiring no
transaction — and the address is a codeless hole that any wallet or exchange can
pay with a plain 21,000-gas transfer. Code is deployed lazily, only when the
member first moves funds.

The critical authority decision: **the deployed clone's `transferOut` is
`onlyOwner`, not `onlyFactory`.** The factory derives, deploys, records
counterparty commitments and supplies screening config, but it is never on the
authorization path for funds. This makes FR-008/FR-009/FR-010 literally true —
no platform key and no factory upgrade can move, freeze, or redirect a member's
money — at the cost of batching being done by the member's own account
(`executeBatch` for passkey, sequential for classic) rather than by the factory.

Depositor attribution is client-side: `Transfer` logs give exact per-deposit
senders for tokens; native coin has no such record and the app says so. The
clearance classifier is a direct port of the Bitcoin `spendable` rule
(`coinSelection.js:79-86`) — a positive assertion, with everything unverified,
indeterminate, or restricted withheld and explained.

## Technical Context

**Language/Version**: Solidity 0.8.24 (`viaIR`, optimizer `runs: 1`); JavaScript (ES2022) for frontend and scripts

**Primary Dependencies**: OpenZeppelin Contracts/Upgradeable **5.4.0** (`Clones`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`, `SafeERC20`) via the repo's `UUPSManaged` base; ethers v6; React 18 + Vite; existing `ISanctionsGuard` (spec 007)

**Storage**: On-chain — factory state (UUPS, append-only, `__gap`) and per-clone state (immutable, no upgrade). Client — `userStorage` records for labels/attribution, riding the spec-032 encrypted backup as a `networkScoped: true` synced object. No server, no indexer.

**Testing**: Hardhat (`test/receiver/**` unit + security + integration; `test/upgradeable/` for the factory upgrade path; `test/fork/` to pin real-oracle screening gas); Vitest for the frontend; axe for accessibility

**Target Platform**: EVM networks in `NETWORKS`; browser SPA (no backend)

**Project Type**: Web application — Solidity contracts + React frontend, per the repo's existing split

**Performance Goals**: Address derivation is client-side and instant (no RPC). Balance reads for N addresses × M assets must stay within one batched round-trip on batching-capable chains and must not degrade to per-address polling on ETC 61 / Mordor 63 where batching is disabled.

**Constraints**: No backend (constitution + spec 043 FR-017). No platform authority over member funds. Published addresses must never move. Uncertainty must withhold, never permit. `PM_MAX_GAS` 3,000,000 and 6 sponsored ops/min bound any batch.

**Scale/Scope**: 2 new contracts + 1 interface; ~6 new frontend modules, 2 hooks, 1 section (4–5 components); 1 deploy script; 5 registration touchpoints. Design target: tens of receive addresses per member per chain, not thousands.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Security-First Smart Contracts** | Two value-bearing contracts. CEI throughout; `nonReentrant` on every fund-moving entry point; checked low-level native forward (`BridgeRouter.sol:363-368` pattern); `SafeERC20` for tokens; screening is a read-only STATICCALL before any effect. No `delegatecall`, no `selfdestruct`, no assembly beyond OZ `Clones`. Immutable clone = no upgrade key over member value. Security-agent review is a merge gate; EthTrust-SL L2 target; accepted Slither findings documented in NatSpec per `SafePolicyGuardV2.sol:63-72`. | **PASS** |
| **II. Test-First and Comprehensive Coverage** | Tier A (95% statements / 90% branches) for both contracts in `coverage-threshold-policy.json`. Unit + security (full access-control matrix over every admin setter and the upgrade path) + integration lifecycle + upgrade test + a fork test pinning real-oracle screening gas. Frontend logic (derivation, clearance classifier, attribution, store) is pure and unit-tested; the clearance classifier gets adversarial cases for every withhold reason. | **PASS** |
| **III. Honest State, No Mocks or Placeholders** | This principle *is* the feature. The spec's Overview states the impossible-as-asked premise openly; FR-006/FR-016/FR-031…FR-034 forbid claiming screening that is not delivered, rendering a read failure as zero, or conflating not-deployed with unreadable. A mock oracle on Amoy/Mordor must read differently from the real Chainalysis oracle on Polygon (FR-033). | **PASS** |
| **IV. Fail Loudly in CI** | New `test/receiver/**` added to the `test:coverage` glob; both contracts added to `coverage-threshold-policy.json` `gated`; factory registered in `check-storage-layout.js`; three `verify.js` CATALOG entries. No `continue-on-error` added. Noted: Slither is already non-gating repo-wide (`|| true`) — not made worse, and the security-agent review is the real gate. | **PASS** |
| **V. Accessible, Consistent Frontend** | New section meets WCAG 2.1 AA with axe coverage mirroring `home.axe.test.jsx`. Addresses and ABIs come from the sync artifacts and `getContractAddressForChain`, never hardcoded. | **PASS** |

**No violations. Complexity Tracking section is empty.**

Three design choices are worth recording because they *avoid* violations rather
than justify them:

1. **`transferOut` is `onlyOwner`, not `onlyFactory`.** A factory-authorized
   fund path would put a platform UUPS upgrade key on the member's money —
   exactly the backdoor `SafePolicyGuardV2.sol:36-38` refuses. The cost is that
   the factory cannot batch sweeps; the member's account does.
2. **No pause anywhere on this path.** A pause on the clone's `transferOut`
   would be custody. A pause on the factory's `deploy` would be *worse* — it
   would strand funds already sitting at undeployed counterfactual addresses
   with no way to reach them. The absence is the safety property, following
   `IBridgeRouter.sol:10-13`.
3. **No `FeeRouter` wiring at launch.** The launch fee is zero (FR-036), and
   dead fee code inside an immutable value-holding contract is a liability at
   review. Introducing a fee later means a new template version and therefore
   new addresses — which is honest, and consistent with FR-010.

## Project Structure

### Documentation (this feature)

```text
specs/070-safe-receiver/
├── spec.md              # Feature specification (complete)
├── research.md          # Phase 0 — measurements, rejected designs (complete)
├── plan.md              # This file
├── data-model.md        # Phase 1 — entities and state
├── quickstart.md        # Phase 1 — runnable validation guide
├── contracts/           # Phase 1 — interface contracts
│   ├── ISafeReceiverFactory.md
│   ├── ISafeReceiveAddress.md
│   └── clearance-model.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 — /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
contracts/
├── receiver/
│   ├── SafeReceiverFactory.sol      # UUPS singleton: derive, deploy, commit, screening config
│   ├── SafeReceiveAddress.sol       # ERC-1167 template: immutable, onlyOwner transferOut
│   └── ISafeReceiver.sol            # shared types, events, errors
└── access/SanctionsGuard.sol        # consumed unchanged (spec 007)

test/
├── receiver/
│   ├── SafeReceiverFactory.test.js
│   ├── SafeReceiverFactory.security.test.js
│   ├── SafeReceiveAddress.test.js
│   ├── SafeReceiveAddress.security.test.js
│   └── integration/receiver-lifecycle.test.js
├── upgradeable/SafeReceiverFactory.upgrade.test.js
├── fork/SafeReceiverScreening.fork.test.js
└── helpers/receiver.js

frontend/src/
├── lib/receiver/
│   ├── deriveAddress.js       # pure CREATE2 prediction — no provider, no RPC
│   ├── receiverStore.js       # per-(chainId,index) records: label, counterparty
│   ├── attribution.js         # Transfer-log depositor discovery + screening
│   ├── clearance.js           # fail-safe classifier: spendable is a positive assertion
│   └── availability.js        # typed per-network reason (deployed / no-guard / unreadable)
├── hooks/
│   ├── useSafeReceiver.js     # address list + balances, per-address failure isolation
│   └── useReceiverSweep.js    # sweep/spend with per-address, per-asset outcomes
├── components/receiver/
│   ├── SafeReceiverPanel.jsx  # section shell + availability disclosure
│   ├── ReceiveAddressList.jsx # per-address balance decomposition
│   ├── ReceiveAddressCard.jsx # plain address + QR + label + clearance detail
│   ├── CreateAddressModal.jsx # label + optional on-chain counterparty commitment
│   └── SweepModal.jsx         # what moves, what is withheld and why, fee/gas disclosure
├── abis/
│   ├── SafeReceiverFactory.js # hand-maintained
│   └── SafeReceiveAddress.js  # hand-maintained
└── config/appNav.js           # + { id: 'receiver', label: 'Receive' } in Tools

scripts/
├── deploy/deploy-safe-receiver.js
├── deploy/verify.js                    # + 3 CATALOG entries
├── deploy/check-storage-layout.js      # + SafeReceiverFactory
└── utils/sync-frontend-contracts.js    # + isV2 mapping entries

docs/developer-guide/safe-receiver.md
docs/runbooks/safe-receiver-operations.md
```

**Structure Decision**: The repo's established contracts + frontend split. A new
`contracts/receiver/` domain directory (no hardhat or Slither config change is
needed — `paths.sources` and `filter_paths` already cover the whole tree). The
frontend section lives in the **Tools** nav group alongside Protect, since it is
member-owned-contract infrastructure rather than a spending surface, and it
**hides entirely** on networks without the factory — the `collectibles` /
`predict` precedent, filtered through `visibleNavGroups`.

## Architecture

### Contract split and the authority boundary

```text
SafeReceiverFactory (UUPS, platform-admin config only)
  ├─ receiveAddressOf(owner, index) view → address     ← pure prediction, no state
  ├─ deploy(owner, index)                              ← permissionless, idempotent
  ├─ commitCounterparty(index, counterparty)           ← write-once, owner-only
  ├─ screen(address) view                              ← guard indirection for clones
  └─ admin: setSanctionsGuard / setScreeningRequired   ← config, never funds

SafeReceiveAddress (ERC-1167 clone, IMMUTABLE)
  ├─ initialize(owner, factory)                        ← once, at deploy
  ├─ receive() external payable {}                     ← empty; no screening (proven futile)
  └─ transferOut(token, to, amount) onlyOwner          ← THE only exit; screens via factory
```

**The boundary**: the factory never appears in the clone's authorization check.
`transferOut` requires `msg.sender == owner`. A malicious or compromised factory
upgrade can change which guard is consulted (a legitimate compliance-config
power the platform holds elsewhere) but **cannot move, freeze, or redirect a
single wei**. The clone's `owner` is written once at `initialize` and has no
setter.

### Why the template is immutable, not admin-settable

`WagerPoolFactory.sol:453-458` has a `setTemplate`. Copying that here would be a
correctness bug: the template's init-code hash feeds `predictDeterministicAddress`,
so changing it **moves every future derived address**. A member who printed
address #7 on an invoice would find #7 now derives elsewhere. The template is
therefore set once at `initialize` with no setter (FR-030). A new template ships
as a **new factory deployment**; the old factory keeps serving existing addresses
forever.

### Screening placement

Screened at `transferOut`, in this order, before any effect:

1. `owner` — the member moving the funds (the named actor; `WagerPoolFactory.sol:178-186` precedent)
2. `to` — the destination
3. `committedCounterparty[owner][index]` — if the member committed one (FR-018)

`checkBlocked` is `external view` ⇒ STATICCALL ⇒ no reentrancy surface. When
`screeningRequired` is set and no guard is configured, the path reverts
`ScreeningNotConfigured()` — the `WagerPoolFactory.sol:285-303` fail-closed
tri-state, **not** the silent-no-op pattern used by `WagerRegistryCore._screen`.

Batch semantics reconciling FR-017 with FR-022: the **member** screen is
batch-wide (a sanctioned member's whole batch reverts); the **destination** and
**counterparty** screens are per-item, each item isolated so one failure leaves
the others to complete with their own reported outcome.

### Clearance — client-side, fail-safe

Attribution and clearance are client-side because no on-chain mechanism exists
(`research.md` §R1.3). Per address, per asset:

- **Tokens**: filter `Transfer` logs by recipient → exact per-deposit sender →
  screen each with `{ force: true }` → sum cleared deposits.
- **Native**: no log exists. Classified `unattributable` and withheld — never
  silently cleared (FR-014).
- Any screening result that is `restricted` or indeterminate, any log-scan
  failure, any unreachable guard ⇒ **withheld with a reason**.

`spendable` is computed as a positive assertion only; the default for every
unhandled path is withheld. Log scanning refuses to run without a recorded
deploy block per chain and says so, following `useVaultProposals.js:53-61`.

### Balance reading — the scaling decision

20 addresses × 20 assets = 400 reads. With ethers batching that is ~4 requests;
on ETC 61 / Mordor 63 batching is disabled (`utils/rpcProvider.js:31,44`) and it
would become 400 individual requests per poll. Decision:

- Read balances **on demand and on address expand**, not on a 60-second poll.
- Introduce `Multicall3` deliberately for the list view where the chain has it
  (`frontend/src/abis/Multicall3.js` exists with zero importers today).
- Where neither is available, bound the scanned set to addresses with a
  nonzero last-known balance plus any the member pins, and **disclose** that the
  list is partial rather than implying completeness.

## Phase 0: Research

**Complete** — see [research.md](./research.md). It records the measurements
that reframed the feature (§R1), the four designs considered with the two
rejected and why (§R2), why receive addresses are contracts rather than keys
(§R3), which half of the UTXO analogy survives (§R4), backend-free discovery
(§R5), inherited repo patterns (§R6), measured gas (§R7), chain availability
(§R8), the registration checklist (§R9), and open items carried here (§R10).

Items from §R10 resolved into this plan:

- **Template mutability trap** → template is immutable (above).
- **`Clones.cloneDeterministic` has zero repo call sites** → first use; the
  helper and its prediction must be covered by a test asserting predicted ==
  deployed on every supported chain config.
- **OZ is 5.4.0, not 5.6.1** → verify the `Clones` API against 5.4.0.
- **Balance-read scaling** → resolved above.
- **Unknown tokens** (absent from `getPortfolioRegistry`) → disclosed as a
  known gap in the UI; a `Transfer`-log sweep-discovery pass is explicitly
  deferred, not silently omitted.
- **`getProvider` calling `getNetwork()`** → this feature uses strict
  `NETWORKS[chainId]` lookups only, per the custody rule.
- **Real-oracle screening gas** → pinned by a fork test rather than assumed.

## Phase 1: Design & Contracts

Outputs generated alongside this plan:

- **[data-model.md](./data-model.md)** — on-chain factory and clone state, the
  client record shape and its backup registration, the clearance value object
  with its complete withhold-reason enumeration, and the sweep-outcome shape.
- **[contracts/ISafeReceiverFactory.md](./contracts/ISafeReceiverFactory.md)** —
  functions, events, custom errors, roles, ordering guarantees.
- **[contracts/ISafeReceiveAddress.md](./contracts/ISafeReceiveAddress.md)** —
  the clone's minimal surface and its authorization invariant.
- **[contracts/clearance-model.md](./contracts/clearance-model.md)** — the
  client-side classifier contract: inputs, the withhold-reason enumeration, and
  the fail-safe default that every branch must land on.
- **[quickstart.md](./quickstart.md)** — runnable validation: derive, pay from
  an external wallet, observe clearance, sweep, and prove the negative cases
  (withheld value never moves; a factory upgrade cannot move funds).

### Agent context update

`CLAUDE.md`'s Spec Kit pointer is updated to reference this plan.

## Registration checklist (from `research.md` §R9)

Fail **loud** if missed:

- [ ] `scripts/deploy/verify.js` CATALOG — three entries: `safeReceiverFactory`
      (proxy), `safeReceiverFactoryImpl` (impl), `safeReceiveAddressImpl` (template)
- [ ] `frontend/src/config/contracts.js` — address slots in each per-chain
      `*_CONTRACTS` block being deployed to

Fail **silent** if missed:

- [ ] `scripts/deploy/check-storage-layout.js` `UPGRADEABLE_CONTRACTS` —
      `{ name: "SafeReceiverFactory", deploymentsKey: "safeReceiverFactory" }`
- [ ] `scripts/utils/sync-frontend-contracts.js` `isV2` mapping
- [ ] `package.json` `test:coverage` testfiles glob — add `test/receiver/**`
- [ ] `coverage-threshold-policy.json` `gated` — both contracts at Tier A
- [ ] `medusa.json` `targetContracts` — if a stateful invariant harness ships

Also: `frontend/src/abis/*.js` are hand-maintained — the sync script emits
addresses only.

## Deployment sequence

1. Deploy `SafeReceiveAddress` template (plain, `_disableInitializers()` in constructor).
2. Deploy `SafeReceiverFactory` proxy via `scripts/deploy/lib/upgradeable.js#deployProxy`, initialized with `(admin, template, sanctionsGuard, screeningRequired)`.
3. Record `safeReceiverFactory` / `safeReceiverFactoryImpl` / `safeReceiveAddressImpl` and `constructorArgs.safeReceiverFactoryImpl = []` in `deployments/` **immediately**.
4. `npm run verify:<net>` — fails on any unregistered key.
5. `npm run sync:frontend-contracts`.
6. Record a `deployBlocks` entry — depositor attribution scans `Transfer` logs and is silently dead without it.

**Launch networks**: Polygon 137 (real Chainalysis oracle) is the only network
where screening is fully meaningful. Amoy 80002 and Mordor 63 have guards backed
by `MockSanctionsOracle` and must be described differently (FR-033). Networks
without a guard can still host segregation and clearance if the factory is
deployed with `screeningRequired = false` — but the UI must state that no
on-chain screening applies there (FR-031). Sequencing per-network is a
`/speckit-tasks` concern.

## Complexity Tracking

*No constitution violations. Section intentionally empty.*

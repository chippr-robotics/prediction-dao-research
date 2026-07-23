# Implementation Plan: Staking Fee Router, Admin Controls & Emergency Pause

**Branch**: `claude/staking-admin-controls` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/066-staking-admin-controls/spec.md`

## Summary

Introduce a per-network, on-chain **`StakingRouter`** (UUPS) that is the authoritative control surface for
the spec-065 staking service and the path member **liquid** stakes route through so a platform fee reaches
the treasury. It holds the managed staking config (provider addresses, an enumerable validator allowlist)
and a per-network **emergency pause**, gated by a `STAKING_ADMIN_ROLE` (config) and `GUARDIAN_ROLE` (pause),
emitting an event for every change (on-chain audit trail). It charges the platform fee on liquid staking by
reading the **single fee source of truth** — the spec-060 `FeeRouter` (`earn.stake` service rate +
`treasury()`) — skimming the fee to the treasury and forwarding the net to the provider (Lido `submit` →
wstETH, sPOL `buySPOL` → sPOL) atomically, returning the LST to the member with a `maxFeeBps` consent guard
mirroring `FeeAboveQuoted`. Operators drive it from a new role-gated **AdminPanel “Staking” tab**
(modeled on `ProtocolConfigTab`/`FeesTab`); the member app reads config/allowlist/pause/fee at runtime and
**falls back safely to the spec-065 build-time defaults (fee-free, direct staking)** when the router is
undeployed/unreachable — a backwards-compatible rollout.

**Two fee paths, by necessity (research R2):**
- **Liquid (Lido, sPOL)** — routed through `StakingRouter` with an **enforced, atomic fee-and-forward**
  (the router transiently holds the asset, skims, forwards net, returns the LST). Truly atomic for every
  wallet type; contract-enforced fee.
- **Delegated (Polygon `ValidatorShare`)** — the member **must remain the direct `buyVoucherPOL` caller**
  (the delegation position is bound to `msg.sender`; routing it through the router would make it custodial
  and un-exitable). The fee is therefore applied as a **client-composed treasury transfer** in the same
  stake batch, computed from the same `earn.stake` rate (passkey path = one atomic UserOp; classic wallet =
  disclosed as a two-step, fee-first). Non-custodial always wins over enforcement here.

Exits (unstake/withdraw/claim) **never** route through the router — members hold the LST / own the
delegation directly — so a pause or router change can never trap funds (FR-004/FR-016).

## Technical Context

**Language/Version**: Solidity ^0.8.x + Hardhat (contract); JavaScript ES2022, React 18 + Vite (frontend).

**Primary Dependencies**: OpenZeppelin upgradeable (`UUPSManaged`, `PausableUpgradeable`,
`ReentrancyGuardUpgradeable`, `EnumerableSet`); the spec-060 `FeeRouter` (rate + treasury source of truth);
the spec-065 staking libs/hooks/UI; the spec-041 unified send rail (`useEarnSend`); the existing AdminPanel
+ role model + on-chain event history pattern. **No new npm/solidity dependencies.**

**Storage**: on-chain `StakingRouter` state (provider addresses, `EnumerableSet.AddressSet` validator
allowlist, `FeeRouter` reference, paused flag) recorded per network in `deployments/`; frontend reads it at
runtime with a build-time fallback. No new backend.

**Testing**: Hardhat unit + **fork tests** for the router (the value-bearing fee-and-forward path against
real Lido/sPOL/Polygon contracts — constitution II requires fork tests where external protocols are
involved), Slither + Medusa on the new contract; Vitest + Testing Library + vitest-axe for the admin tab,
member-flow rewiring, and fee disclosure.

**Target Platform**: Ethereum mainnet at launch (per spec 065); the per-network model extends to future
staking networks.

**Project Type**: Solidity contract + web frontend + deploy/ops scripts + docs.

**Performance Goals**: member reads reflect a config/fee/pause change within one refresh (≤ existing 60s
staking poll / fee-quote TTL); admin actions confirm within a normal tx.

**Constraints**: value-bearing contract → checks-effects-interactions, `nonReentrant`, transient-only
custody (never holds member funds across txns — FR-016), append-only storage + `__gap`
(`check:storage-layout` gating); fee rate stays the single FeeRouter source of truth (never duplicated —
constitution / spec-060 rule); honest-state everywhere (pause/unavailable reuse the existing pattern);
`maxFeeBps` is a hard ceiling; per-network isolation; WCAG 2.1 AA for the admin tab; addresses/ABIs from
generated sync artifacts.

**Scale/Scope**: 1 new UUPS contract; 1 new admin tab; 1 new role; member-flow rewiring across ~6 existing
staking files; deploy + `earn.stake` registration + sync + storage-check wiring; 2 docs (operator guide +
emergency runbook).

## Constitution Check

*GATE evaluated against constitution v1.0.0 — PASS with a required security review (pre-Phase-0; re-checked
post-Phase-1).*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)**: This introduces a **value-bearing contract**
  (`StakingRouter` transiently custodies the stake to skim the fee), the highest-risk surface. The plan
  commits to: checks-effects-interactions + `nonReentrant` on every fund-moving entrypoint; transient-only
  custody with an invariant that no member funds remain after a tx (sweep/return or revert — FR-016);
  exact-amount handling and `forceApprove`→0 reset (mirroring `depositToVaultWithFee`); `maxFeeBps` consent
  guard mirroring `FeeAboveQuoted`; provider/validator targets from the curated on-chain config only;
  `Pausable` on stake entrypoints (exits never touch the router); `UUPSManaged` least-privilege upgrade
  gate; append-only storage + `__gap`. It targets **EthTrust-SL L2+**, passes **Slither + Medusa** with no
  new high/critical, and **requires the smart-contract security-agent review before merge**
  (`.github/agents/smart-contract-security.agent.md`). Delegated staking deliberately stays a direct member
  call (no router custody) — the safest option for that path. **This is the gate this feature exists to
  clear;** it is why 066 is its own spec/PR rather than part of 065.
- **II. Test-First / Comprehensive Coverage (NON-NEGOTIABLE)**: PASS — Hardhat unit tests for every
  router entrypoint + setter + role + pause + the fee split (incl. failure/edge: over-cap, `FeeAboveQuoted`,
  zero fee = passthrough, paused, unknown provider, reentrancy guard); **fork tests** for the real
  Lido/sPOL fee-and-forward; storage-layout test. Frontend: Vitest for the admin tab (read/validate/set,
  role gating, history), the config→router read-with-fallback, the router-vs-direct stake branch, and the
  StakeSheet fee line; axe for the tab. Contract-interface changes ship with their tests in the same PR.
- **III. Honest State**: PASS — the member app reads live router config/pause/fee and falls back to the
  honest spec-065 default when the router is undeployed/unreachable (never a broken or fee-guessing
  screen — FR-009); a paused/unavailable network reuses the existing unavailable-state pattern; fee shown
  “as of” its read with the quoted rate as a hard ceiling; zero fee ⇒ no fee line, byte-identical to today;
  per-network + testnet/mainnet isolation.
- **IV. Fail Loudly in CI**: PASS — Slither/Medusa/storage-layout/tests are gating; no `continue-on-error`.
- **V. Accessible, Consistent Frontend**: PASS — the Staking tab reuses the AdminPanel `runTx`/role/history
  patterns; WCAG AA via axe; addresses/ABIs come from the generated sync artifacts (a new `stakingRouter`
  key), never hand-copied.

**Single-source-of-truth for fees (spec-060 rule)**: the fee **rate** lives ONLY in the `FeeRouter`
(`earn.stake` service) and is edited via the **existing Fees tab** (`FEE_ADMIN_ROLE`); the new Staking tab
manages addresses/allowlist/pause and surfaces the current staking fee **read-only** with a pointer to the
Fees tab. This refines spec FR-011/US5 (which grouped “fee rate” under the staking-config role) to honor the
constitution — recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/066-staking-admin-controls/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── staking-router.md     # StakingRouter contract interface (storage, roles, events, entrypoints)
│   ├── fee-integration.md    # earn.stake registration + read-rate-and-skim + delegated client-composed fee
│   └── admin-and-runtime.md  # AdminPanel Staking tab, role, and the member config→router read + fallback
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
contracts/staking/
└── StakingRouter.sol            # NEW — UUPSManaged + Pausable + ReentrancyGuard; config + allowlist +
                                 #   pause + enforced liquid fee-and-forward (Lido/sPOL); reads FeeRouter
contracts/staking/IStakingRouter.sol  # NEW — interface, structs, events, errors

test/
├── staking/StakingRouter.test.js         # NEW — unit: setters/roles/pause/fee-split/consent/edge
└── fork/StakingRouterFork.test.js        # NEW — fork: real Lido/sPOL fee-and-forward returns LST + treasury grows

scripts/deploy/
├── deploy-staking-router.js     # NEW — deployProxy(StakingRouter) → record stakingRouter/stakingRouterImpl;
│                                #   register earn.stake on the existing FeeRouter
├── lib/feeServices.js           # + { label: 'earn.stake', capBps: 250, kind: ConfigOnly }
└── check-storage-layout.js      # + { name: 'StakingRouter', deploymentsKey: 'stakingRouter' }
scripts/utils/sync-frontend-contracts.js  # + stakingRouter in the copied-keys mapping

frontend/src/
├── abis/StakingRouter.js        # NEW — minimal ABI (setters, getters, pause, stake entrypoints, events)
├── config/
│   ├── contracts.js             # + stakingRouter key in per-chain maps + VITE_STAKING_ROUTER_ADDRESS override
│   └── staking.js               # + earn.stake service id; keep constants as the fallback default
├── lib/fees/feeQuote.js         # + FEE_SERVICES.EARN_STAKE (keccak 'earn.stake')
├── lib/staking/
│   ├── stakingRouter.js         # NEW — read router config/allowlist/pause; build router stake calls;
│   │                            #   build the delegated client-composed fee-transfer batch
│   └── stakingActions.js        # buildStakeForOption: branch to router path when a fee applies, else direct
├── hooks/
│   ├── useStakingOptions.js     # overlay router-sourced addresses/allowlist/paused onto options; fallback
│   └── useStakingActions.js     # thread the fee quote into stake(); read paused/router availability
├── components/
│   ├── earn/StakeSheet.jsx      # + fee line (fetchFeeQuote/splitFee/bpsToPercent) + maxFeeBps + blocked state;
│   │                            #   hide new-stake when paused (honest unavailable)
│   └── admin/StakingTab.jsx     # NEW — providers + validator allowlist + pause/resume + read-only fee + history
├── components/admin/adminNav.js # + 'staking' icon + isStakingAdmin nav item
├── components/AdminPanel.jsx    # + isStakingAdmin flag, STAKING_ADMIN hash, roleHomeContract branch, render
└── contexts/RoleContext.js      # + ROLES.STAKING_ADMIN + ROLE_INFO + ADMIN_ROLES

test/… (frontend)               # frontend/src/test/staking-admin/ + fees/StakeSheet fee tests
docs/
├── runbooks/staking-operations.md   # NEW — operator guide + EMERGENCY PAUSE runbook
└── developer-guide/staking-integration.md  # extend (065 doc) with the router + fee + admin architecture
mkdocs.yml                        # + runbook nav entry
```

**Structure Decision**: one new UUPS contract (`contracts/staking/`) with Hardhat unit + fork tests, an
AdminPanel tab + role, member-flow rewiring of the existing spec-065 staking frontend to read the router
with a build-time fallback, deploy/sync/storage-check wiring, and ops docs. The fee **rate** stays in the
`FeeRouter`; the `StakingRouter` reads it. Backwards-compatible: undeployed router ⇒ spec-065 behavior.

## Design decisions (Phase 1 digest)

1. **Fee charging without a new FeeRouter entrypoint (R1)**: `FeeRouter.depositToVaultWithFee` is
   ERC-4626-only. `StakingRouter` instead reads `FeeRouter.quoteFee(earn.stake, gross) → (fee, net)` and
   `treasury()`, transfers `fee` to the treasury and `net` to the provider itself — reusing the audited
   split (floor in the member’s favor, treasury-unset skip) with **zero change to the deployed FeeRouter**.
   `earn.stake` is registered **ConfigOnly** (FeeRouter never charges it directly; the StakingRouter and the
   delegated client-batch do), cap 250 bps.
2. **Liquid = enforced router path; delegated = client-composed fee (R2)** — the load-bearing decision,
   driven by Polygon’s `buyVoucherPOL` binding the position to `msg.sender`. Liquid LSTs are transferable,
   so the router forwards them; a delegation is not, so the member must call it directly and the fee rides
   as a batched treasury transfer. Documented honestly (enforcement vs. non-custody trade-off).
3. **Fee rate single-source (R3)**: rate lives in `FeeRouter` `earn.stake`, edited in the existing Fees tab
   (`FEE_ADMIN_ROLE`); the Staking tab shows it read-only. Never duplicated in `StakingRouter`.
4. **StakingRouter shape (R4)**: `UUPSManaged` + `ReentrancyGuardUpgradeable` + `PausableUpgradeable`;
   `STAKING_ADMIN_ROLE` (setters) + `GUARDIAN_ROLE` (`pause`/`unpause`); `EnumerableSet.AddressSet`
   validator allowlist; provider-address setters + FeeRouter setter, each emitting an event; stake
   entrypoints `nonReentrant whenNotPaused`; append-only storage + `__gap`.
5. **Config read with safe fallback (R5)**: `useStakingOptions` overlays router-sourced
   addresses/allowlist/paused when `getContractAddressForChain('stakingRouter', chainId)` resolves; when
   `undefined`/unreachable it keeps the spec-065 constants verbatim (mirrors `fetchFeeQuote`’s
   `{available:false}` fallback). Pause hides new-stake honestly; exits always available.
6. **Stake routing branch (R6)**: `buildStakeForOption` mirrors `lib/earn/vaultActions.buildDepositCalls` —
   fee applies ⇒ approve/route through the router `stake…WithFee`; else the byte-identical spec-065 direct
   path. Native ETH uses `value` (no approve leg); delegated composes the fee-transfer + direct
   `buyVoucherPOL` batch.
7. **Admin tab + role (R7)**: new `StakingTab.jsx` mirrors `ProtocolConfigTab`/`FeesTab` (resolve address,
   read live state, validate-before-send, `runTx`, on-chain `queryFilter` history); `STAKING_ADMIN` added
   to `ROLES`/`ROLE_INFO`/`ADMIN_ROLES`, `ROLE_HASHES`, `roleHomeContract → stakingRouter`, nav item, render
   block; pause/resume gated on `GUARDIAN`.
8. **Deploy/sync/storage (R8)**: `deploy-staking-router.js` via `deployProxy`, records
   `stakingRouter`/`stakingRouterImpl`, registers `earn.stake` on the live FeeRouter; `sync-frontend-contracts`
   mapping + `contracts.js` key; `check:storage-layout` entry; ships as a fresh deploy (new contract), future
   changes as in-place UUPS upgrades.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| New value-bearing contract (`StakingRouter`) | Enforced, atomic fee-and-forward on liquid staking so the treasury reliably grows for every wallet type (FR-001) | A purely client-composed fee (no contract) is non-atomic for classic wallets (fee paid, stake could fail) and unenforceable — weakens the treasury goal the feature exists for |
| Delegated fee is client-composed, not contract-enforced | `buyVoucherPOL` binds the delegation to `msg.sender`; a router holding it would be custodial + un-exitable | Routing delegation through the router violates non-custody (FR-016) and could trap funds — unacceptable |
| Fee rate under `FEE_ADMIN`/Fees tab, not the staking-config role | Constitution / spec-060: the FeeRouter is the ONE fee-config store; never a second one | Putting the rate in `StakingRouter` duplicates the fee store — a documented anti-pattern |

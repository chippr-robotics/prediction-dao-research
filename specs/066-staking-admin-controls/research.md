# Phase 0 Research: Staking Fee Router, Admin Controls & Emergency Pause (spec 066)

Format per decision: **Decision → Rationale → Alternatives considered**. Grounded in the live contracts
(`FeeRouter`, `UUPSManaged`, `WagerRegistry`) and frontend (`ProtocolConfigTab`/`FeesTab`, `feeQuote.js`,
the spec-065 staking libs).

## R1 — Charge the platform fee by reading FeeRouter, not via a new entrypoint

**Decision**: `StakingRouter` charges the spec-060 fee by reading `FeeRouter.quoteFee(serviceId, gross)
→ (feeAmount, netAmount)` and `FeeRouter.treasury()`, transferring `feeAmount` to the treasury and
`netAmount` to the provider itself. The rate is **per-provider** (clarified 2026-07-23): register **two**
services on the FeeRouter — `stake.lido` and `stake.polygon` (sPOL) — each **ConfigOnly**, cap **250 bps**,
rate 0 until enabled. The router picks the serviceId by the liquid provider being staked.

**Rationale**: `FeeRouter.depositToVaultWithFee` is strictly ERC-4626 (it hard-codes `IERC4626(vault).asset()`
and `.deposit(...)`), so it cannot forward native ETH/POL to a Lido/sPOL staking call, and there is **no
generic “charge a fee and send the net somewhere” entrypoint**. FeeRouter deliberately exposes `treasury()`,
`feeBps(id)`, and `quoteFee(id, gross)` (which already implements the floor-in-member’s-favor split and the
treasury-unset skip) so a sibling contract can reproduce the exact spec-060 charge **without modifying the
deployed router**. ConfigOnly is the honest kind because FeeRouter itself never moves the funds here — the
StakingRouter (liquid) does; delegated is fee-free in v1 (R2).

**Alternatives considered**: **Add a generic `chargeAndForward` entrypoint to FeeRouter** — rejected: a
larger surface change to an already-live value-bearing router that spec-060 deliberately scoped to the
ERC-4626 wrapper + ConfigOnly registry. **Register `earn.stake` Wrapped** — rejected: Wrapped implies
FeeRouter itself charges it via `depositToVaultWithFee`, which doesn’t apply.

## R2 — Liquid staking is router-enforced; delegated staking is fee-free in v1

**Decision**: **Liquid** staking (Lido ETH→wstETH, sPOL POL→sPOL) routes through `StakingRouter`:
transiently hold the asset, skim the per-provider fee to treasury, forward the net to the provider, return
the LST to the member — atomic + `nonReentrant` + `whenNotPaused`. **Delegated** staking (Polygon
`ValidatorShare`) keeps the member as the **direct `buyVoucherPOL` caller** and is **fee-free in v1**
(clarified 2026-07-23); the router still governs its config (allowlist + pause).

**Rationale**: Polygon `buyVoucherPOL` mints the delegation shares to `msg.sender`, so if the router called
it, the **router** would own the delegation — custodial and un-exitable by the member, violating FR-016 and
risking trapped funds. Liquid LSTs are transferable, so the router can forward them to the member safely
(the same shape as `depositToVaultWithFee` returning shares to a `receiver`). This split is the only design
that keeps delegation non-custodial while still contributing fees. Exits never touch the router in either
model (members hold the LST / own the delegation), so a pause/router change can never trap funds.

**Rationale for fee-free delegated (v1)**: a contract-enforced delegated fee is impossible without the
router owning the delegation (custodial, un-exitable — violates FR-016); a client-composed fee is
app-applied (unenforced) and non-atomic for classic wallets (fee paid, stake could fail). Rather than ship
that weaker guarantee, v1 charges only where the fee is enforced and atomic (liquid). The treasury still
grows from liquid staking (the larger volume: ETH via Lido, POL via sPOL).

**Alternatives considered**: **Charge delegated via a client-composed batch** — rejected for v1 (weaker,
non-atomic guarantee); revisit if a robust path emerges. **Router-owned pooled delegation with per-member
accounting** — rejected: a custodial staking-vault system, out of the non-custodial charter.

## R2b — Governance: multisig roles, no timelock (clarified 2026-07-23)

**Decision**: grant `STAKING_ADMIN_ROLE` (config) and `GUARDIAN_ROLE` (pause) to a **multisig (Safe)** at
deployment; **no on-chain timelock** on any action. The emergency pause takes effect instantly; config
changes rely on multi-party approval.

**Rationale**: multi-party control of a value-bearing control surface without a single-key point of failure,
while keeping incident response immediate. Matches how the repo’s registries grant guardian/admin roles.

**Alternatives considered**: **Single EOA admin** — rejected (single point of failure). **Timelock on
config** — rejected: slows routine ops and incident-adjacent config fixes; the pause needs zero delay.

## R3 — The fee rate stays the single FeeRouter source of truth

**Decision**: the staking fee **rate** lives only in `FeeRouter` (`stake.lido` / `stake.polygon`) and is
edited via the **existing Fees tab** (`FEE_ADMIN_ROLE`). The new Staking tab surfaces the current staking fee **read-only**
with a pointer to the Fees tab; it does not store or set the rate. `StakingRouter` holds a **reference** to
the FeeRouter and reads the rate at stake time.

**Rationale**: the constitution / spec-060 mandates ONE fee-config store (the FeeRouter) and forbids a second
one. Duplicating the rate into `StakingRouter` would be exactly that anti-pattern. This refines spec
FR-011/US5 (which colloquially grouped “fee rate” under the staking-config role): rate = `FEE_ADMIN`;
addresses/allowlist/pause = `STAKING_ADMIN`.

**Alternatives considered**: **Store the rate in `StakingRouter`** — rejected (second fee store).
**Mirror the rate into `StakingRouter` on each change** — rejected (drift risk, still two stores).

## R4 — StakingRouter contract pattern (UUPS + Pausable + enumerable allowlist)

**Decision**: `contract StakingRouter is UUPSManaged, ReentrancyGuardUpgradeable, PausableUpgradeable` with
`STAKING_ADMIN_ROLE` (config setters) and `GUARDIAN_ROLE` (`pause`/`unpause`), an
`EnumerableSet.AddressSet` validator allowlist, provider-address + FeeRouter-reference setters (each emitting
an event), stake entrypoints `nonReentrant whenNotPaused`, and append-only storage with a trailing `__gap`.
`initialize(admin, feeRouter, providers…)` calls `__UUPSManaged_init(admin)` first, then
`__ReentrancyGuard_init()` / `__Pausable_init()`, and grants the two roles.

**Rationale**: mirrors the repo’s dominant registry pattern — `UUPSManaged` (least-privilege upgrade gate,
`_disableInitializers`, base `__gap`) + `WagerRegistry`’s `PausableUpgradeable`/`GUARDIAN_ROLE`
`pause()/unpause()` + `FeeRouter`’s granular admin role and enumerable set. Storage discipline
(append-only + `__gap`, validated by `check:storage-layout`) enables in-place UUPS upgrades.

**Alternatives considered**: **Non-upgradeable contract** — rejected: every other registry is UUPS; staking
config/providers will evolve. **Config-only (no fund handling) registry + purely client fee** — rejected for
liquid (loses atomicity/enforcement — see Complexity Tracking); delegated instead ships fee-free in v1 (R2).

## R5 — Member app reads the router at runtime with a safe build-time fallback

**Decision**: `useStakingOptions` resolves `getContractAddressForChain('stakingRouter', chainId)`; when
present it overlays the router’s provider addresses / validator allowlist / per-network `paused` onto the
options (and the app reads the `stake.lido`/`stake.polygon` fee via `fetchFeeQuote`); when `undefined` or unreachable it
keeps the spec-065 build-time constants verbatim (fee-free, direct staking, availability as configured).

**Rationale**: backwards-compatible, honest-state rollout — staking keeps working before/if the router is
deployed on a network, and never shows a broken or fee-guessing screen (FR-009). Reuses the exact fallback
contract of `feeQuote.js` (`{available:false}` when no router). A `paused` flag hides new-stake using the
existing unavailable-state UI while exits stay available.

**Alternatives considered**: **Hard cutover to the router** — rejected: bricks staking on any network
without a deployed router and breaks the never-stranded rule.

## R6 — Route the stake through the router only when a fee applies (else the spec-065 direct path)

**Decision**: extend `stakingActions.buildStakeForOption` to branch like
`lib/earn/vaultActions.buildDepositCalls`: when a staking fee applies and a router is available, approve/route
through the router’s `stake…WithFee` entrypoint (native ETH via `value`, ERC-20 via approve-router); else
emit the byte-identical spec-065 direct provider calls. **Delegated stays the spec-065 direct
`buyVoucherPOL` call with no fee leg (fee-free in v1 — R2);** only liquid options take the router path.
Thread the `feeQuote` into `useStakingActions.stake`’s ctx.

**Rationale**: reuses the proven lending fee-branch pattern, keeps the fee-free path byte-identical (SC-003),
and preserves the passkey/classic dual-rail via `useEarnSend`.

## R7 — Admin tab + role wiring (mirror ProtocolConfig/Fees)

**Decision**: new `admin/StakingTab.jsx` (props `{signer, chainId, provider, runTx, pendingTx, isAdmin,
isStakingAdmin, isGuardian}`) mirrors `ProtocolConfigTab` (address setters via `runTx` + on-chain
`queryFilter` history) and `FeesTab` (read live state, validate-before-send, empty state when the contract
isn’t on-chain). Add `ROLES.STAKING_ADMIN` (+ `ROLE_INFO` + `ADMIN_ROLES`), a `ROLE_HASHES` entry,
`roleHomeContract('STAKING_ADMIN') → stakingRouter`, the `ADMIN_TAB_ICONS`/nav item (`isStakingAdmin`), the
`AdminPanel` flag + render block; pause/resume gated on `GUARDIAN`; the fee is shown read-only (R3).

**Rationale**: the AdminPanel is entirely pattern-driven (four coordinated edits add a tab); reusing
`runTx`/role/history means no engine changes and consistent operator UX + on-chain audit history.

**Alternatives considered**: a bespoke admin surface — rejected (reinvents the existing, audited pattern).

## R8 — Deploy, sync, and storage-layout wiring

**Decision**: `deploy-staking-router.js` uses `deployProxy({name:'StakingRouter', initArgs:[admin,
feeRouter, providers…]})`, records `stakingRouter`/`stakingRouterImpl` immediately (append, never overwrite),
then registers `stake.lido` + `stake.polygon` on the **existing** FeeRouter (idempotent). Add both to
`feeServices.js`; add `stakingRouter` to the `sync-frontend-contracts` key mapping and the `contracts.js`
per-chain maps; add `{name:'StakingRouter', deploymentsKey:'stakingRouter'}` to `check-storage-layout.js`.
Ship as a fresh deploy; future logic changes are in-place `upgradeProxy` UUPS upgrades.

**Rationale**: matches the FeeRouter/registry deploy+sync+storage-check precedent exactly; the storage-check
gate protects upgrade safety.

## Open items carried to tasks/implementation

- Confirm the **FeeRouter address per network** to pass to `StakingRouter.initialize` (read from the
  network’s `deployments/` record).
- Decide the **initial `stake.lido`/`stake.polygon` rates** (ship at 0 bps; enabled later from the Fees tab) and confirm the
  **cap** (proposed 250 bps).
- Confirm the **treasury address per network** is set on the FeeRouter (fee is skipped, never lost, if unset).
- Validate the exact **Lido/sPOL forward legs inside the router** on a fork (submit→wrap→transfer;
  buySPOL→transfer) including the reentrancy/CEI ordering and the no-residual-funds invariant.
- (RESOLVED 2026-07-23) Delegated staking is **fee-free in v1**; revisit a robust charged path later. The
  batch UX review (R2 degradation path).

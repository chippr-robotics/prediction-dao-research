# Research & Decisions: Configurable Platform Fee Wrapper (spec 060)

Format per Spec Kit: Decision / Rationale / Alternatives considered.

## R1 — Where does the unified fee configuration live?

**Decision**: On-chain, in a single `FeeRouter` contract per network (UUPS via
`UUPSManaged`). It is the source of truth for wrapper-service rates **and** the
Polymarket builder taker/maker bps. The relay-gateway *reads* it; nothing writes config
off-chain.

**Rationale**:
- The relay-gateway is deliberately **stateless and has no admin HTTP API** — all config
  is env-at-boot (`services/relay-gateway/src/config/index.js`), state is in-memory, and
  the only runtime toggle is the SIGUSR2 killswitch. Building a writable admin API +
  durable store on Cloud Run would reverse that design and invent a new auth model.
- Every existing admin surface already uses **wallet-as-auth against on-chain roles**
  (`PaymasterOpsCard`, `MaintenanceTab`, `ProtocolConfigTab` write via ethers + `runTx`).
  An on-chain fee registry gets admin auth, attribution, and history for free.
- FR-012's attributable change history falls out of events (`FeeBpsChanged`), and
  FR-010's "no redeploy" holds because the gateway re-reads the chain.

**Alternatives considered**:
- *Gateway runtime config store + authenticated admin endpoints*: rejected — needs new
  persistence (none exists), new auth (none exists), contradicts the gateway's design,
  and splits fee truth across two systems.
- *Keep env-only Polymarket bps (read-only dashboard)*: rejected by the requester
  (clarification: legacy fees become fully editable).

## R2 — Wrapper mechanics: how is the fee charged atomically?

**Decision**: `FeeRouter.depositToVaultWithFee(serviceId, vault, assets, receiver,
maxFeeBps)`: pull `assets` (SafeERC20), compute `fee = assets * bps / 10_000` (floor),
transfer `fee` to treasury, approve the vault for `assets - fee`, call
`IERC4626(vault).deposit(assets - fee, receiver)`, in one transaction guarded by
`nonReentrant` and CEI. Any leg reverts ⇒ everything reverts (FR-003). The router holds
funds only transiently within the tx.

**Rationale**: Earn today deposits **directly** into the Morpho vault (approve +
`deposit`, no intermediary). A client-side "extra transfer in the batch" is not atomic
for classic wallets (per-call txs), so the treasury could keep a fee for a failed
deposit — forbidden by FR-003. Only a contract makes fee+deposit atomic for every wallet.

**Alternatives considered**: client-batched treasury transfer (rejected — atomicity, cap,
consent unenforceable); per-service ERC-1167 clones (rejected — services are stateless
pass-throughs, one router with service ids is simpler); charging on yield/at exit
(rejected by the requester — fee basis = principal at entry).

## R3 — Member consent ceiling (FR-005)

**Decision**: The frontend passes the **quoted** bps as `maxFeeBps`; the router reverts
`FeeAboveQuoted()` if the live rate exceeds it at execution time. Withdrawals never touch
the router.

**Rationale**: an admin raising the rate between quote and execution otherwise silently
over-charges; a revert forces an honest re-review. Mirrors slippage-protection UX.

## R4 — Service identity, caps, and registration

**Decision**: `bytes32 serviceId = keccak256("<domain>")` with launch ids
`earn.lend` (Wrapped, cap 250), `polymarket.taker` (ConfigOnly, cap 100),
`polymarket.maker` (ConfigOnly, cap 50). `DEFAULT_ADMIN_ROLE` registers via
`registerService(serviceId, capBps, kind)`; wrapped caps are themselves capped by
`MAX_WRAPPED_FEE_BPS = 250`. `FEE_ADMIN_ROLE` sets rates via `setFeeBps` with `bps <=
capBps` enforced in the setter **and** re-checked at charge time. ConfigOnly entries have
no charging path — the gateway/Predict reads them.

**Rationale**: future services register without fee-system code changes (FR-007, SC-005);
ConfigOnly lets the Polymarket bps live in the same registry without pretending the
router charges them; cap-at-registration preserves the spec-057 caps.

## R5 — Treasury destination

**Decision**: `treasury` is a per-network address, set at `initialize` and by
`setTreasury` (DEFAULT_ADMIN), zero rejected on set. If treasury is unset the charge path
treats the fee as **zero** (full deposit) and emits `FeeSkippedNoTreasury`. Deployment
default: the existing `treasury` key already recorded in `deployments/*-v2.json`.

**Rationale**: matches MembershipManager's recorded-treasury precedent and the
deployments-as-source-of-truth rule; fee-to-zero beats reverting member deposits over an
ops mistake — funds are never lost.

**Alternatives**: accrue-in-contract + `withdrawFees` (rejected — direct-to-treasury
keeps the router balance-free, nicer audit surface, one-address reconciliation).

## R6 — How the gateway serves live Polymarket bps without redeploy

**Decision**: `services/relay-gateway/src/fees/onchain.js` reads
`feeBps('polymarket.taker'/'polymarket.maker')` from the FeeRouter on Polygon via the
gateway's existing ethers provider, cached with a short TTL (default 30 000 ms).
`attachBuilderCode` and `/fee-rate` consume it. Env `POLYMARKET_BUILDER_*_FEE_BPS` become
the **fallback** when the router is unreachable/undeployed; the spec-057 boot caps remain,
and on-chain values are clamped to those caps at read time. `/fee-rate` gains
`source: "chain" | "env-fallback"`; `/status` gains a `fees` block for the admin tab.

**Rationale**: keeps the gateway stateless and read-only (its design), meets FR-010/015
(admin change live ≤ TTL + 1 block ≤ 1 min, SC-003), and the existing Predict confirm UI
(`TradeConfirm` ← `usePredictTrade.loadFee` ← `fetchFeeRate`) needs no data-path change.

## R7 — Frontend Earn wiring & disclosure

**Decision**: `lib/fees/feeQuote.js` reads the lending rate; `buildDepositCalls` gains
the fee path (approve router + `depositToVaultWithFee` when bps > 0; today's direct path
when 0). `VaultSheet` adds the "FairWins platform fee" line (rate %, amount, net) with an
info bubble only when bps > 0; the quote is fetched with vault state so the rate is live.
On a failed read the sheet blocks deposit with an honest error (FR-015). Withdrawals
untouched (FR-002).

## R8 — Admin Fees tab

**Decision**: `FeesTab.jsx` registered as `fees` in `adminNav.js`, gated `isAdmin ||
isFeeAdmin` (`FEE_ADMIN` role added to `RoleContext`, resolved on the FeeRouter). Reads
the FeeRouter services table + gateway `/status` fees block (Polymarket source + OpenSea
referral display-only). Writes `setFeeBps`/`setTreasury` via `runTx`. History from
`queryFilter(FeeBpsChanged)` with bounded lookback + explorer fallback. Copies the
`ProtocolConfigTab` read/write shape.

## R9 — Docs & runbook placement

**Decision**: `docs/developer-guide/platform-fees.md`, `docs/runbooks/fee-operations.md`,
`docs/user-guide/platform-fees.md`, registered in `mkdocs.yml`; CLAUDE.md gains a
guardrail making the FeeRouter the single fee-config source of truth.

## R10 — Testing strategy

Contract: fee math incl. floor-to-zero, cap enforcement (setter + charge), `maxFeeBps`
revert, treasury-unset skip, atomic revert with `MockERC4626Vault` revert mode, role
gating, events, `deployFeeRouter` helper; upgrade/storage test via OZ plugin; register in
`check:storage-layout`. Gateway: `/fee-rate` chain source, provider-failure fallback,
above-cap clamp, `/status.fees`. Frontend: `vaultActions` fee vs direct path, VaultSheet
fee line/hide/blocked, FeesTab render + role gating + axe.

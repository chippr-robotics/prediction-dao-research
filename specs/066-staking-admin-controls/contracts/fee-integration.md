# Contract: Fee integration (spec 066 ↔ spec 060 FeeRouter)

The staking fee reuses the **single** platform-fee configuration (the spec-060 `FeeRouter`). The rate lives
there and nowhere else; staking only reads it and charges against it.

## Service registration (per-provider — clarified 2026-07-23)

Add to `scripts/deploy/lib/feeServices.js` (`LAUNCH_FEE_SERVICES`), registered by
`deploy-staking-router.js` on the **existing** FeeRouter (idempotent — skip if already registered):

```
{ label: "stake.lido",    capBps: 250, kind: ServiceKind.ConfigOnly } // spec 066 Lido liquid staking
{ label: "stake.polygon", capBps: 250, kind: ServiceKind.ConfigOnly } // spec 066 sPOL liquid staking
```

- **Per-provider** so Lido and Polygon (sPOL) staking can carry different rates (the Fees tab already lists
  these friendly names). **ConfigOnly** (not Wrapped): the FeeRouter itself never charges staking — the
  `StakingRouter` does, reading the rate from the matching service. `capBps = 250` each (immutable at
  registration). Rate starts at `0`, enabled later from the **existing Fees tab** (`FEE_ADMIN_ROLE`,
  `setFeeBps`). `FeeBpsChanged` events are the rate audit history.
- **Delegated staking is fee-free in v1** — no service is charged for it (its position can't route through
  the router without custody; see research R2). No `stake.polygon-delegated` service in v1.

## How the rate is read + charged

Service-ids: `keccak256("stake.lido")` / `keccak256("stake.polygon")` (frontend `FEE_SERVICES.STAKE_LIDO` /
`STAKE_POLYGON`). Charge inputs come only from the FeeRouter: `quoteFee(id, gross) → (fee, net)` (floor in
member’s favor + treasury-unset skip), `feeBps(id)` (consent-ceiling check), `treasury()` (destination;
`address(0)` ⇒ skip, never lost).

- **Liquid** — the `StakingRouter` selects the provider’s serviceId, reads these, and transfers
  `fee`→treasury / forwards `net` on-chain (staking-router.md). Enforced + atomic.
- **Delegated** — **fee-free in v1** (clarified 2026-07-23): the member calls
  `ValidatorShare.buyVoucherPOL(net, minShares)` directly with **no** fee leg. (A client-composed fee was
  considered and deferred — unenforced + non-atomic for classic wallets; research R2.)

## Member consent ceiling

The liquid fee-bearing path passes the **quoted** `feeBps` as `maxFeeBps`, enforced in-contract
(`FeeAboveQuoted`) — a rate increase in flight can never overcharge a member (FR-003). Delegated has no fee
in v1, so no ceiling applies.

## Frontend disclosure (StakeSheet)

Mirror `VaultSheet`’s fee line (liquid options only): `fetchFeeQuote({ serviceId: <STAKE_LIDO|STAKE_POLYGON>, chainId, provider })` →
`feeApplies`/`feeBlocked`/`feeSplit`; render a `<dl>` "FairWins platform fee ({bpsToPercent}) / You stake
{net}" before signing; disable submit while the quote is loading or `feeBlocked` (a router exists but the
rate can’t be read — never proceed on an assumed rate). Zero/unavailable ⇒ no fee line, byte-identical to
the spec-065 fee-free experience (SC-003).

## Single-source rule (constitution / spec 060)

The staking fee **rate** is edited ONLY via the Fees tab against the FeeRouter. The new Staking tab shows the
current `stake.lido`/`stake.polygon` rates **read-only** with a link to the Fees tab. No second fee-config store is created.

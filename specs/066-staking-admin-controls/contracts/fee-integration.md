# Contract: Fee integration (spec 066 ↔ spec 060 FeeRouter)

The staking fee reuses the **single** platform-fee configuration (the spec-060 `FeeRouter`). The rate lives
there and nowhere else; staking only reads it and charges against it.

## Service registration

Add to `scripts/deploy/lib/feeServices.js` (`LAUNCH_FEE_SERVICES`), registered by
`deploy-staking-router.js` on the **existing** FeeRouter (idempotent — skip if already registered):

```
{ label: "earn.stake", capBps: 250, kind: ServiceKind.ConfigOnly } // spec 066; rate 0 until enabled
```

- **ConfigOnly** (not Wrapped): the FeeRouter itself never charges staking — the `StakingRouter` (liquid)
  and the client batch (delegated) do, reading the rate from it. `capBps = 250` (≤ the Wrapped ceiling by
  convention). Rate starts at `0`, enabled later from the **existing Fees tab** (`FEE_ADMIN_ROLE`,
  `setFeeBps`). `FeeBpsChanged` events are the rate audit history.

## How the rate is read + charged

Service-id: `keccak256("earn.stake")` (frontend `FEE_SERVICES.EARN_STAKE`). Charge inputs come only from the
FeeRouter: `quoteFee(id, gross) → (fee, net)` (floor in member’s favor + treasury-unset skip), `feeBps(id)`
(consent-ceiling check), `treasury()` (destination; `address(0)` ⇒ skip, never lost).

- **Liquid** — the `StakingRouter` reads these and transfers `fee`→treasury / forwards `net` on-chain
  (staking-router.md). Enforced + atomic.
- **Delegated** — the member app composes a batch: `[ transfer fee POL → treasury() ]` + `[ member calls
  ValidatorShare.buyVoucherPOL(net, minShares) ]`, with the fee computed from `quoteFee`/`feeBps`. Passkey =
  one atomic UserOp; classic wallet = disclosed fee-first two-step. App-applied (ConfigOnly semantics),
  never contract-enforced — the trade-off for keeping delegation non-custodial (research R2).

## Member consent ceiling

Every fee-bearing path passes the **quoted** `feeBps` as `maxFeeBps`. Liquid enforces it in-contract
(`FeeAboveQuoted`); delegated enforces it client-side (the app refuses to submit if the live rate exceeds
the quoted rate). A rate increase in flight can never overcharge a member (FR-003).

## Frontend disclosure (StakeSheet)

Mirror `VaultSheet`’s fee line: `fetchFeeQuote({ serviceId: FEE_SERVICES.EARN_STAKE, chainId, provider })` →
`feeApplies`/`feeBlocked`/`feeSplit`; render a `<dl>` "FairWins platform fee ({bpsToPercent}) / You stake
{net}" before signing; disable submit while the quote is loading or `feeBlocked` (a router exists but the
rate can’t be read — never proceed on an assumed rate). Zero/unavailable ⇒ no fee line, byte-identical to
the spec-065 fee-free experience (SC-003).

## Single-source rule (constitution / spec 060)

The staking fee **rate** is edited ONLY via the Fees tab against the FeeRouter. The new Staking tab shows the
current `earn.stake` rate **read-only** with a link to the Fees tab. No second fee-config store is created.

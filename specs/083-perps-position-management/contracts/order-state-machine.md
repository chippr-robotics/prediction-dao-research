# Contract: order state machine (spec 083)

One tested module (`frontend/src/lib/perps/orderState.js`) owns this. It is **not** per-component
logic, because the failure it prevents — reporting success on inclusion — is exactly the kind that
gets reintroduced by a well-meaning copy-paste.

## States

```
idle → validating → screening → [switching chain] → signing → submitted
     → venue_pending
     → executed | rejected(reason) | frozen | timed_out | unknown
```

| State | Means | Member-facing |
|---|---|---|
| `validating` | pure local checks | — |
| `screening` | sanctions re-check (opens only) | "Checking…" |
| `switching` | wallet on the wrong chain | "Switch to <network>" |
| `signing` | wallet prompt open | "Confirm in your wallet" |
| `submitted` | tx included / call accepted | **"Sent to <venue>"** — never "opened"/"closed" |
| `venue_pending` | venue acknowledged, not executed | "<venue> is executing this" |
| `executed` | venue executed it | "Position opened / closed / updated" |
| `rejected` | venue refused, with reason | the venue's reason, verbatim |
| `frozen` | GMX froze a trigger order | "Needs your attention" + cancel control |
| `timed_out` | Gains keeper never executed | "Recover your collateral" + control |
| `unknown` | we lost the thread | "We can't confirm this — check on <venue>" + link |

`submitted` and `venue_pending` are **both** pending. Only `executed` may change what the member is
told they hold.

## Terminal transitions

**Gains** — `MarketOrderInitiated(orderId{user,index}, trader, pairIndex, open)` → `venue_pending`.
Then `MarketExecuted(...)` → `executed` (the first moment fill price, actual size and liquidation
price exist), or `MarketOpenCanceled(..., cancelReason, collateralReturned)` → `rejected`. Past
`getMarketOrdersTimeoutBlocks()` with no event → `timed_out`, carrying the **pending-order** index.

`CancelReason` → member-facing text:

| Value | Reason | Text |
|---|---|---|
| 3 | SLIPPAGE | "The price moved more than your slippage allowed." |
| 6 | EXPOSURE_LIMITS | "Gains is at its exposure limit for this pair right now." |
| 7 | PRICE_IMPACT | "The trade's price impact was larger than allowed." |
| 8 | MAX_LEVERAGE | "The leverage exceeded what Gains allows for this pair." |
| 11 | NOT_HIT | "The trigger price was not reached." |
| 12 | LIQ_REACHED | "The position would have been liquidated immediately." |

Unmapped values render the numeric reason rather than inventing text.

**GMX** — `OrderCreated` → `venue_pending`; `OrderExecuted` → `executed`; `OrderCancelled` →
`rejected`; `OrderFrozen` → `frozen`. Nothing auto-clears a frozen order.

## Rules

1. **Inclusion is never execution.** No path may map a transaction receipt, a 200 response, or a
   UserOp hash to `executed`. A test asserts this.
2. **A stalled UserOp is not success.** Check the operation state explicitly; an existing sheet in
   this repo renders a stalled UserOp as complete — do not copy it.
3. **Pre-execution numbers are labelled.** Requested size, estimated entry, estimated liquidation.
   Never present them as the position's actual values.
4. **Partial fills are reported as the venue filled them.** Gains may reduce a counter-trade
   (`CounterTradeCollateralReturned`); report the venue's filled size, never the requested size.
5. **No silent drops.** `timed_out` and `frozen` always render with their named recovery control.
6. **No fee claim on a cancelled order.** Under the venue-native rails the fee is computed at
   execution, so a cancelled order carries none — say so rather than staying silent.
7. **`unknown` is a real state.** Losing the event thread is disclosed with a venue link, never
   rendered as either success or failure.

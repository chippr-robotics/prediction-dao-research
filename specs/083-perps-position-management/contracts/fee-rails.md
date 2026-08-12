# Contract: perps fee rails (spec 083)

Launch rate: **5 bps of notional**. Never hardcoded; each rail's rate is read from the contract
that enforces it (spec-071: authority is the contract that will act on it).

## The rails

| Venue | Authority (read here) | Ceiling | Base | Sides | Set by |
|---|---|---|---|---|---|
| GMX v2 | GMX DataStore on Arbitrum, `uiFeeFactorKey(FairWins)` | `MAX_UI_FEE_FACTOR = 1e27` = **10 bps** | `sizeDeltaUsd` (notional) | increase **and** decrease | `ExchangeRouter.setUiFeeFactor(uint256)` from the FairWins receiver |
| Hyperliquid *(deferred)* | FeeRouter `perps.hyperliquid.builder` on Polygon 137 | **10 bps** (`f ≤ 100`) | order notional | per fill | Fees tab |
| Gains | — | — | venue-paid rebate | — | not FairWins-priced |

**No `perps.gmx.uifee` FeeRouter service.** GMX applies its own rate from its own DataStore; a
FeeRouter entry would be a second config store for a rate we cannot enforce, and the admin control
would silently do nothing — the failure mode `feeQuote.js` already documents for bridge-LP.

**No Gains service.** A venue-paid rebate is not a member cost; a service entry would render a fee
line where none exists. Gains referral earns nothing until the venue whitelists FairWins and fails
silently until then — **claim no revenue in copy** until confirmed on-chain.

## Unit conversion — one module, tested both ways

`frontend/src/lib/perps/feeUnits.js`. A single missing ×10 here is a 10× overcharge the venue would
enforce.

| From | To | Conversion | Guard |
|---|---|---|---|
| bps | GMX `uiFeeFactor` | `bps × 1e26` (5 bps = 5e26; 10 bps = 1e27) | ≤ `1e27` |
| GMX factor | bps | `factor / 1e26` | — |
| bps | HL `f` | `bps × 10` (tenths of a bp) | ≤ 100 |
| bps | HL `maxFeeRate` | `"<bps/100>%"` — **the `%` is required** (5 bps → `"0.05%"`) | ≤ `"0.1%"` |
| notional + bps | money | `notional × bps / 10_000`, floored | member's favour |

GMX's own formula, for cross-checking the disclosure:
`uiFee = applyFactor(sizeDeltaUsd, factor) / collateralTokenPrice.min`, and **zero when
`uiFeeReceiver == address(0)`** (early return) — structural zero-rate behaviour.

## Disclosure rules

1. The fee line appears **before any signature**, in the sheet's cost breakdown.
2. It states the base honestly: perps fees are charged on **notional (size), not on the amount you
   put in** — with the money amount for this position shown.
3. **Zero rate ⇒ no fee line at all**, and behaviour identical to a fee-free integration.
4. An unreadable rate ⇒ **opening is blocked** with "the fee could not be confirmed"; **closing is
   never blocked** by a fee read.
5. Both sides are disclosed: GMX charges on open **and** close, so the close sheet shows it too.
6. A cancelled or unfilled order states plainly that **no FairWins fee was charged**.

## Operations

Two one-shot transactions, no deployment:

1. **Register `perps.hyperliquid.builder`** on the Polygon FeeRouter (cap 10, ConfigOnly). Already
   in `scripts/deploy/lib/feeServices.js`; measured `kind = 0` (unregistered) on Polygon, Arbitrum
   and Base. Registration is one-shot, needs `DEFAULT_ADMIN_ROLE` (still the deployer EOA), and
   also unblocks the admin handoff — `transfer-roles.js` refuses to renounce FeeRouter admin while
   a known service is unregistered.
2. **`setUiFeeFactor(5e26)`** on GMX's Arbitrum ExchangeRouter, sent from the FairWins UI-fee
   receiver address. Permissionless self-registration; `account = msg.sender`, so the sending
   address *is* the receiver and must be the one recorded in config.

Revenue is claimed by the receiver itself: `claimUiFees(address[] markets, address[] tokens,
address receiver)` — also `msg.sender`-keyed. The only value FairWins can strand is its own.

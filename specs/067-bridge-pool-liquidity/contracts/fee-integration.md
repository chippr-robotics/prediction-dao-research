# Fee Integration (spec 067 × spec 060)

The `FeeRouter` remains the single source of truth. This feature **registers two services** and reads
them; it introduces no second fee store, no cached rate, and no hardcoded bps anywhere in client,
contract, or gateway code (FR-026, FR-027).

---

## Services registered

| Service id | `keccak256` of | Charged on | Cap | Ships at | Kind |
|---|---|---|---|---|---|
| `BRIDGE_TRANSFER` | `"bridge.transfer"` | A bridge submission (value-out) | **250 bps** | **0 bps** | **config-only** |
| `LIQUIDITY_DEPOSIT` | `"liquidity.deposit"` | A Uniswap full-range supply (value-in) | **250 bps** | **0 bps** | **config-only** |

**Why config-only, not wrapped** (corrected during implementation): `Wrapped` means chargeable via
`FeeRouter.depositToVaultWithFee`, which deposits into an ERC-4626 vault. Neither router uses that
path — both read `quoteFee`/`feeBps`/`treasury` and skim the fee themselves, exactly as spec 066's
`StakingRouter` does (and `deploy-staking-router.js` registers `stake.lido` config-only for the same
reason). Registering these as wrapped would let anyone call
`depositToVaultWithFee("bridge.transfer", someVault, …)` and pass FeeRouter's kind check, treating a
bridge fee as a vault deposit; config-only makes that revert `ServiceNotWrapped`. `quoteFee`,
`feeBps` and the 250 bps `capBps` ceiling behave identically either way.

Registration happens once at deploy via `registerService(serviceId, capBps, kind)`, **per network** —
the `FeeRouter` is per-network, so both services are registered on each of the five deployments and a
rate can differ per network if operators ever choose. The cap is immutable
after registration — a later `setFeeBps` above it reverts inside `FeeRouter`, which is the protection
that makes "capped at 250 bps" a member guarantee rather than a policy statement.

Both ship at **0 bps**, so launch behavior is fee-free and byte-identical to the pre-feature flows until
`FEE_ADMIN_ROLE` deliberately raises a rate (FR-029, and the spec's Assumptions).

### Not registered, deliberately

There is **no `liquidity.bridge_lp` service.** Across `HubPool.addLiquidity` has no recipient parameter,
so any fee-taking wrapper would take custody of the LP tokens and leave the member unable to exit
(research R3). Registering a service we cannot charge without breaking FR-021/FR-023 would be worse than
not registering one: the admin tab would show a settable rate that silently does nothing, which is the
kind of dishonest surface constitution III exists to prevent.

---

## Read paths

| Consumer | How it reads | Fallback |
|---|---|---|
| **Contracts** (`BridgeRouter`, `LiquidityRouter`) | `feeRouter.quoteFee(serviceId, gross)` at call time | None — if `FeeRouter` is unset the call reverts. Never assume zero. |
| **Frontend** | `fetchFeeQuote({ serviceId, chainId, provider })` in `lib/fees/feeQuote.js` (extended with the two ids) | A present-but-unreadable router **blocks the fee-bearing path** rather than assuming a lower rate — the spec 066 rule. |
| **Gateway** | `services/relay-gateway/src/fees/onchain.js` (extended) | Env bps is a documented fallback only, never authoritative. |

---

## Consent ceiling (`maxFeeBps`)

The rate the member is shown is passed back into the router call and enforced there:

```solidity
(uint256 feeAmount, uint16 bps) = IFeeRouter(feeRouter).quoteFee(serviceId, grossAmount);
if (bps > maxFeeBps) revert FeeAboveQuoted(bps, maxFeeBps);
```

This is the spec 066 mechanism verbatim, reused rather than re-invented. It makes FR-028 enforceable
on-chain: a rate change landing between the member's quote and their signature reverts the transaction
instead of charging more than was disclosed. The member loses nothing but gas.

---

## Disclosure rules (FR-007, FR-028, FR-030)

**Bridge confirm step** — three separate cost lines, never merged into a rate:

```
You send                     100.00 USDC
  Bridge protocol fee         −0.12 USDC   ⓘ  (Across LP + relayer, = the input/output spread)
  Destination delivery cost   −0.31 USDC   ⓘ
  FairWins platform fee       −0.00 USDC   ⓘ  (0.00% — hidden entirely when the rate is 0)
You receive on Ethereum       99.57 USDC
Estimated arrival             ~2 minutes
```

**Pool supply confirm step** — fee line plus net per token, and the kind-specific disclosure gate:

- `TRADING_LP` (available on all five networks): impermanent-loss disclosure rendered **inline and
  visible**, not behind a tooltip, and
  the confirm control stays disabled until it has been shown (FR-018).
- `BRIDGE_LP` (Ethereum only — the HubPool is an L1 contract): rebalancing + inventory disclosure, same
  treatment (FR-019), and **no fee line at all**
  — it is fee-free, and showing a `0.00` line would imply a fee that could later appear.

**Zero-rate rule** (FR-029): a zero or unset rate renders **no fee line whatsoever** — not a line
reading `0.00`. A visible zero suggests a lever exists on that flow; for `BRIDGE_LP` no lever exists at
all, and for the other two the correct member-facing statement at launch is simply that there is no
platform fee.

**Never fee-gated** (FR-030): pool withdrawals, Uniswap fee collection, and bridge refunds have no code
path that can charge a platform fee — not because a flag disables it, but because those calls do not
pass through a router. Enforced structurally, not by configuration.

---

## Admin surfaces

The **Fees** tab (spec 060) remains the only place a rate is edited, by `FEE_ADMIN_ROLE`. The two new
tabs show the live rate and its cap **read-only**, with a link across (FR-048, FR-049). When `FeeRouter`
is undeployed or unreachable, both tabs say so plainly and keep their other controls usable (FR-051) —
they never render an invented or stale rate.

---

## Reporting (FR-036)

The platform fee is the **only** amount from a bridge that reports as a cost. Moving one's own assets
between networks is neither income nor a disposal, which is why `BridgeEntry.direction` is `'none'` and
the entry is a single logical record spanning both networks (FR-035) rather than an out-leg and an
in-leg that would net to zero only by luck.

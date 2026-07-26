# Cross-Chain Bridge & Liquidity Supply (spec 067)

Two member surfaces, two per-network UUPS routers, two third-party protocols:

- **Transfer → Bridge** (`frontend/src/components/wallet/BridgeView.jsx`) moves an asset a member
  already holds to another network, settled by **Across Protocol V3**.
- **Earn → Supply** (`frontend/src/components/earn/SupplyView.jsx`) supplies liquidity to curated
  pools — **Uniswap V3** full-range trading pools, and **Across HubPool** bridge pools.

Neither surface takes custody. The member's wallet is the only signer, the member owns every
position, and the routers exist for exactly two jobs: **charge the spec-060 platform fee atomically
where that is possible without custody**, and **be the on-chain control surface** (curation, limits,
killswitch) that decides what is on offer.

- Contracts: `contracts/bridge/BridgeRouter.sol` (`IBridgeRouter.sol`),
  `contracts/liquidity/LiquidityRouter.sol` (`ILiquidityRouter.sol`)
- Client libs: `frontend/src/lib/bridge/`, `frontend/src/lib/liquidity/`
- Spec: [`specs/067-bridge-pool-liquidity/`](../../specs/067-bridge-pool-liquidity/) —
  `spec.md`, `research.md` (the design-changing findings), `contracts/` (per-contract design notes)
- Operator runbook: [runbooks/bridge-liquidity-operations.md](../runbooks/bridge-liquidity-operations.md)
- Related: [platform-fees.md](./platform-fees.md), [staking-integration.md](./staking-integration.md)
  (spec 066's `StakingRouter` is the shape both routers copy),
  [upgradeable-contracts.md](./upgradeable-contracts.md)

> **Deployment state:** neither router is deployed on any network yet (issue **#966**). Everything
> below is the shipped, tested behaviour of code that has no addresses in `deployments/` — which is
> also why every surface has to degrade honestly rather than assume a router is there.

## Where each half can exist at all (research R8)

The binding constraint was never the protocols; it was which chains carry them.

| Network | Bridge (Across SpokePool) | Trading pools (Uniswap V3) | Bridge pools (Across HubPool) |
|---|---|---|---|
| Ethereum (1) | ✅ | ✅ | ✅ **only chain** |
| Optimism (10) | ✅ | ✅ | ❌ |
| Polygon (137) | ✅ | ✅ | ❌ |
| Base (8453) | ✅ | ✅ (**distinct addresses** — R4b) | ❌ |
| Arbitrum (42161) | ✅ | ✅ | ❌ |
| Ethereum Classic (61) / Mordor (63) | ❌ | ❌ | ❌ |

**Across's HubPool is an L1 contract by design** — the shared pot lives on Ethereum and the bridge
lends *from* it to every other network. So bridge-LP listings are **Ethereum-only** while trading
pools span all five mainnets. This asymmetry is not a rollout gap that will close; do not "fix" it by
copying `hubPool` onto an L2, and do not let copy imply both kinds of pool exist everywhere
(`liquidityAvailabilityCopy()` states the two halves separately for this reason).

ETC (61) and Mordor (63) have **neither** protocol and cannot host these routers at all. They do
carry `dex` config (ETCswap) for the swap surface, which is precisely why availability is not derived
from the DEX capability alone — see [Availability](#availability-how-a-surface-decides-to-exist).

**Uniswap addresses are not the same on every chain.** Ethereum, Polygon, Arbitrum and Optimism share
the canonical factory/position manager; **Base does not**. Copying the canonical pair everywhere
produces a router pointed at a non-contract (deposits revert) or, worse, at a same-address contract
belonging to something else. Every address is taken from that chain's own deployment record, asserted
to carry bytecode at deploy time, and re-checked by `scripts/ops/verify-protocol-addresses.js`.

## `BridgeRouter`

**Does:** holds the curated route registry (`inputToken` + `outputToken` + `destinationChainId`, with
a per-transaction `maxAmount` and an advisory `expectedFillSeconds`), the Across SpokePool address,
the sanctions guard, and a per-network pause. `bridgeWithFee` pulls the member's gross amount, skims
the `bridge.transfer` fee to the FeeRouter's treasury, approves the SpokePool for the **net**, and
calls `depositV3` — one transaction, `nonReentrant`, checks-effects-interactions, approvals reset to
zero, and a residual-balance assertion (`ResidualFunds`) at the end of both the ERC-20 and native legs.

**Does not:** hold anything between transactions, and has **no rescue or claim-refund function**. That
absence is deliberate and load-bearing — see below.

### The property this contract exists to get right

Across refunds a deposit that no relayer fills by `fillDeadline` **to the `depositor` address on the
origin chain**. `depositor` is an ordinary parameter, independent of `msg.sender`. The router therefore
passes **`msg.sender` — the member** — and never `address(this)`.

Naming the router would send every unfilled bridge into a contract with no per-member accounting and
no withdrawal path, stranding funds on the one path that is supposed to be the safety net. The failure
is silent: the happy path is unaffected, so it only surfaces in production, on the unhappy path, with
real money. `BridgeInitiated` records `depositor` explicitly so the property is auditable without
decoding the SpokePool's own log, and the merge-blocking fork test asserts an **expiry refund lands on
the member's address** — a suite that only covers the fill path cannot detect this class of bug.

Because refunds and fills settle directly to the member, adding an operator "rescue" entrypoint would
imply an operator can reach an in-flight transfer. They cannot, and the admin Operations panel says so
rather than leaving anyone hunting for a button during an incident.

### Other decisions worth knowing before you touch it

- **`outputToken` is part of the route id.** It was originally omitted, which meant re-running
  `setRoute` with a different delivered asset overwrote the route **in place** under the same id: a
  member's quote could name one asset while the deposit delivered another, with no new route appearing
  anywhere an operator or indexer would notice. `computeRouteId` also mixes in `block.chainid`, so ids
  are never portable across deployments.
- **`nativeInput` is explicit, not inferred.** Inferring it from `msg.value > 0` would make a
  wrapped-token route and a native route indistinguishable. An ERC-20 route that receives native value
  reverts `UnexpectedNativeValue` rather than accepting funds it could not return.
- **`removeRoute` exists here and pool removal does not exist on the other router.** A route holds no
  member position, so removing it only stops new bridges. A pool listing does correspond to member
  positions, so it can only be retired.
- **Non-standard tokens fail closed.** A fee-on-transfer token delivers less than `inputAmount`, so the
  SpokePool's own pull of `net` reverts; a rebasing token trips `ResidualFunds`. Neither can silently
  under-deliver. Such tokens are simply not curatable as routes.

## `LiquidityRouter`

**Does:** curates the pools members may supply — both `TradingLp` (Uniswap V3) and `BridgeLp` (Across
HubPool) listings, with per-transaction ceilings per leg — holds the Uniswap position manager address,
the sanctions guard, and a pause. `mintFullRangeWithFee` charges the `liquidity.deposit` fee and mints
a **full-range** Uniswap V3 position **to the member** (`recipient: msg.sender`). Full range means
`±887272` aligned to the pool's tick spacing: no range UI, no out-of-range state, no rebalancing.

`listPool` cross-checks a `TradingLp` listing against the pool it names (`token0`/`token1`/`fee`).
Without that, listing a 0.3% pool's address with `feeTier: 500` was accepted and the mint then
succeeded against a **different pool than the one curated** — reproduced on a Polygon fork. The listing
metadata is what the member is shown, so it has to be true.

**Does not, and this is three separate rulings:**

1. **It is never in an exit path.** Trading-LP members own the position NFT and call Uniswap's
   `NonfungiblePositionManager` directly; bridge-LP members own the LP tokens and call Across's HubPool
   directly. A pause, misconfiguration, or upgrade can never block an exit, and no withdrawal can ever
   carry a platform fee — there is no code path that could charge one.
2. **It does not touch bridge-LP deposits at all.** `HubPool.addLiquidity(l1Token, amount)` has **no
   recipient parameter** — LP tokens mint to `msg.sender`. A fee-skimming wrapper would therefore
   receive the LP tokens itself, making FairWins the custodian of a position the member could never
   exit. So bridge-LP deposits are a **direct member call** and are **fee-free**, and the router is
   their registry and killswitch, not their path. This is the same rule spec 066 applied to delegated
   staking: *a fee is charged only where it can be charged atomically without taking custody.*
   Consequence: `pause()` here stops **new Uniswap supplies only**, and every operator surface must be
   labelled that way — an operator reaching for a killswitch during an incident must not believe they
   have stopped something they have not.
3. **There is no `removePool`.** Retirement is `setPoolEnabled(false)`. A retired pool stays listed,
   visible, and withdrawable, because members still hold positions in it. The copy for a closed pool
   says "no new deposits", never "gone".

`positionManager` may be zero at init (a network can curate bridge pools without Uniswap); the supply
path then reverts `PositionManagerUnset` rather than failing opaquely. A `BridgeLp` pool id passed to
`mintFullRangeWithFee` reverts `NotTradingPool` for the same reason.

## UUPS and storage

Both routers inherit `contracts/upgradeable/UUPSManaged.sol` — do not re-roll the proxy or auth
wiring. Both replace the constructor with a one-time `initialize`, and both carry a trailing
`uint256[44] private __gap`.

Storage is **append-only**: never insert, reorder, or remove existing state; new state goes at the end
and comes out of the gap. Both contracts are registered in `scripts/deploy/check-storage-layout.js`
(`bridgeRouter` / `liquidityRouter`), so `npm run check:storage-layout` validates them and gates CI.
Ship logic changes as **in-place upgrades** via `scripts/deploy/lib/upgradeable.js`, never a fresh
redeploy — a redeploy would orphan the curated routes and pools an operator has already seeded, and
`deployments/` records the proxy (`bridgeRouter`, `liquidityRouter`) separately from its current
implementation (`bridgeRouterImpl`, `liquidityRouterImpl`).

## The role model

Each router has its **own** AccessControl instance, granted at `initialize` to the deploy admin (a
multisig in production).

| Role | Controls | Why it sits where it does |
|---|---|---|
| `LIQUIDITY_ADMIN_ROLE` | `setRoute` / `setRouteEnabled` / `setRouteLimit` / `removeRoute`; `listPool` / `setPoolEnabled` / `setPoolLimit` | **Curation.** Which routes and pools are offered, at what per-transaction ceiling. |
| `GUARDIAN_ROLE` | `pause` / `unpause` | **The killswitch**, and nothing else. |
| `DEFAULT_ADMIN_ROLE` | `setSpokePool`, `setPositionManager`, `setFeeRouter`, `setSanctionsGuard`; role grants | **The fund-path addresses**, deliberately a role above curation. |
| `UPGRADER_ROLE` | `_authorizeUpgrade` (from `UUPSManaged`) | Upgrades. |

The split exists because the two kinds of mistake are not equally recoverable. **Curating a route or a
pool badly is reversible by a toggle** — flip `enabled` false and the offer is gone. **Pointing a
router at a hostile contract is not**: `spokePool` and `positionManager` are approved and handed the
member's net amount, `feeRouter` names both the rate *and* the `treasury()` the fee is transferred to,
and `sanctionsGuard` is the compliance gate. Whoever can write those can redirect where member funds
go, so they are `DEFAULT_ADMIN_ROLE` while `LIQUIDITY_ADMIN_ROLE` stays what its name says. The
fee-**amount** bound described in the next section is the second half of this: even an admin cannot
configure a FeeRouter that takes more than `MAX_FEE_BPS` of a member's principal.

### `GUARDIAN_ROLE` here is not the WagerRegistry guardian set

It is a role on **this router's own** AccessControl, granted per router. The app-wide `useRoles()`
flags cannot answer whether an operator holds it:

- `isGuardian` means "holds `GUARDIAN_ROLE` on the `WagerRegistry`" — a different contract, an
  unrelated set. An operator with the wager guardianship would be shown an enabled killswitch that
  reverts, which is exactly the belief the pause requirements exist to prevent.
- `isLiquidityAdmin` is an **OR** across the two routers, while the role is granted per router on
  purpose. The OR showed an operator holding it on one router every write control on the other.
- All of them read the **wallet's** connected chain, while control state is per-network and the admin
  tabs scope to a network the operator picks. A Polygon guardian whose wallet sat on Ethereum lost the
  Polygon controls.

So the operator surfaces (`frontend/src/components/admin/BridgeTab.jsx`, `SupplyTab.jsx`) ask the
contract that will enforce it, via `readRouterAuthority` in
`frontend/src/components/admin/liquidityAdminCommon.js` — `hasRole` against the **router in scope, on
the network in scope**. The app-wide flags remain good for one thing only: deciding whether the tab
appears at all. And `readable: false` from that read means *the question could not be put*, not *the
answer was no* — the controls stay offered with the authority marked unconfirmed, because withdrawing
a killswitch because an RPC timed out is itself the failure.

## The two fee services

Both are spec-060 `FeeRouter` services. The rate lives there and **only** there — never hardcode a bps
value, never cache one in these routers.

| Service id | Charged on | Kind | Cap | Launch rate |
|---|---|---|---|---|
| `keccak256("bridge.transfer")` | a bridge submission (value-out) | `ConfigOnly` | 250 bps | **0** |
| `keccak256("liquidity.deposit")` | a Uniswap full-range supply (value-in) | `ConfigOnly` | 250 bps | **0** |

Client constants: `FEE_SERVICES.BRIDGE_TRANSFER` / `FEE_SERVICES.LIQUIDITY_DEPOSIT` in
`frontend/src/lib/fees/feeQuote.js`. A zero or unset rate produces **no fee line at all** — not a line
reading 0.00 — and behaviour byte-identical to fee-free.

There is deliberately **no bridge-LP service**. Registering a rate that cannot be charged (research
R3) would put a settable control in the admin panel that silently does nothing, which is worse than no
control.

**Why `ConfigOnly`.** `Wrapped` services are the ones `FeeRouter.depositToVaultWithFee` will charge;
registering these as `Wrapped` would let a call like
`depositToVaultWithFee("bridge.transfer", someVault, …)` pass the kind check and treat a bridge fee as
an ERC-4626 deposit. `quoteFee` / `feeBps` / `setFeeBps` behave identically for either kind, so nothing
is lost.

**Why each router repeats `MAX_FEE_BPS = 250`.** `FeeRouter` applies its own `MAX_WRAPPED_FEE_BPS`
only to `Wrapped` services. Declaring the ceiling on the charging contract makes 250 bps a property of
**the code that moves the money** rather than of a registration argument, and bounds the damage if
`feeRouter` is ever repointed.

### Three guards, and what each one is actually for

1. **The consent ceiling.** The frontend passes the **quoted** bps back as `maxFeeBps`; a live rate
   above it reverts `FeeAboveQuoted` instead of overcharging. Never synthesise a `maxFeeBps` you did
   not display. It only bites when a fee is actually charged (`fee > 0`), so a treasury-unset network
   quoting zero is never blocked by a stale configured rate.
2. **The amount bound.** Both routers bound the fee **amount** `quoteFee` returns to `MAX_FEE_BPS` of
   the principal, and require an exact `fee + net == gross` split (`FeeSplitMismatch`). The cap binds
   *the fee actually taken, not the rate the FeeRouter reports about itself.* Both ceiling checks read
   `feeBps()`, which is the FeeRouter's own claim: an implementation reporting `feeBps() = 0` while
   `quoteFee()` hands back most of the amount satisfies them both, and the transfer would then send
   the member's principal to its treasury. Exact-split matters for the mirror-image reason — `net` is
   what reaches Across or the position manager, so a router that under-reports `net` would strand the
   difference or shrink the member's position.
3. **The residual assertion.** Every leg compares the closing balance to the opening one and reverts
   `ResidualFunds` on any difference. Transient custody stays transient.

### The fee is charged on capital actually consumed

For Uniswap supplies, `LiquidityRouter._supply` quotes the fee **after** the mint, against the
`amount0`/`amount1` the position manager actually took. An earlier version skimmed from the member's
gross desired amounts **before** the mint. Uniswap almost never consumes both legs exactly — it takes
whatever the current price ratio needs and refunds the rest — so members were charged a fee on capital
that was handed straight back to them, unsupplied. Adversarial review reproduced it on a live fork;
four independent reviewers found it.

Two consequences you cannot design around:

- **The remainder comes back whole, with no fee on it.** The router approves only the *net* to the
  position manager, so the fee can never be silently deployed as liquidity, and everything the position
  did not take and the fee did not claim is transferred back to the member.
- **No function computes "the fee" from a desired amount, because no such number exists before the
  mint.** `frontend/src/lib/liquidity/liquidityRouter.js` exposes `maxSupplyFee` — an explicit **upper
  bound** — and the confirm step discloses the **rate**, says it applies to whatever is actually
  supplied, and says the remainder returns whole. A precise figure computed off the amount the member
  typed would be too high whenever the pool's ratio takes less than both legs.

The bridge fee has the opposite shape and is simpler: it is skimmed from the gross the member entered
and only the net goes to Across — which is why `acrossQuotes.js` fetches the Across quote for the
**net**. Quoting the gross would overstate what arrives.

## Availability: how a surface decides to exist

Three independent conditions compose. Getting this wrong in either direction is a member-facing
failure: claiming availability we do not have, or hiding a surface that works.

**1. Capability flags** (`frontend/src/config/networks.js`, per network):

| Flag | Derived from | Gates |
|---|---|---|
| `capabilities.dex` | `SWAP_CHAIN_IDS.has(chainId) && Boolean(this.dex)` | In-app swapping: the Trade surface, the asset sheet's Swap action, DEX spot pricing |
| `capabilities.liquidity` | `Boolean(this.dex?.positionManager)` | Earn → Supply (trading pools) |
| `capabilities.bridge` | `Boolean(this.bridge?.spokePool)` | Transfer → Bridge |

`dex` is an **explicit allow-list**, not `Boolean(this.dex)`, because spec 067 adds `positionManager`
addresses for liquidity — a different reason — and deriving the swap capability from the presence of
`dex` config would switch token swapping on as a side effect of a routine config edit. That is exactly
how Ethereum ended up swap-less: it had no `dex` block, so the capability was false by accident of
configuration rather than by decision. Keeping swap and liquidity as two flags also keeps the states
representable: a network may have pools worth supplying before FairWins exposes swapping there, or the
reverse.

The `bridge` block in `networks.js` is a **build-time display fallback only**. The authoritative
SpokePool/HubPool addresses, route availability, limits, and pause state are read from the routers at
runtime.

**2. Router deployment.** `capabilities.liquidity` alone is *not* enough to name a network — it is true
wherever a Uniswap-shaped position manager is configured, which includes ETC and Mordor via ETCswap,
where FairWins has shipped nothing. So `tradingLiquidityNetworks()` in
`frontend/src/lib/liquidity/liquidityCopy.js` requires **both** the capability **and** a deployed
`liquidityRouter` address. `bridgeLiquidityNetworks()` needs a configured `hubPool` (Ethereum only).
Both lists are derived, never asserted, so they stay true as deployments land — and an empty list
produces honest "not set up in this build yet" copy rather than a false roster.

The admin roster is the deliberate exception: `adminNetworks(capability)` lists every capable network
whether or not a router is deployed there, because the undeployed ones are the ones an operator most
needs to see.

**3. The quoting gateway.** A bridge price is **not derivable client-side** — it needs Across's
relayer-fee oracle — so quoting goes through the relay-gateway proxy
(`services/relay-gateway/src/bridge/`, base URL `VITE_RELAYER_URL`, module env `BRIDGE_ENABLED`,
`BRIDGE_CHAIN_IDS`, `BRIDGE_KILLSWITCH`, quota and TTL vars). The module is optional infrastructure
and off unless enabled; when off it answers **503 `bridge_disabled`** rather than 404, so the client
can tell "an operator turned it off" from "this gateway is too old". Supply needs no gateway at all —
its reads are direct RPC.

Composed, via `useBridgeAvailability` (`BRIDGE_UNAVAILABLE_REASON`) and the copy tables in
`bridgeCopy.js` / `liquidityCopy.js`:

| Condition | Bridge shows | Supply shows |
|---|---|---|
| Capability false (ETC, Mordor, Bitcoin) | `no_protocol` / `bitcoin` — permanent here, not a fault, and names where it *is* available | Honest per-network empty state naming where pools exist |
| Capability true, router **undeployed** | `router_undeployed` — a deployment state; Transfer works exactly as before | Network absent from the roster; other networks' pools still listed |
| Router deployed, **unreachable** | `router_unreachable` — availability withheld, with "as of last read" framing | Same; existing positions still read directly from the protocol |
| Router says **paused** | New bridges refused; in-flight tracking unaffected | New Uniswap supplies refused; positions still visible and withdrawable |
| Route / pool **disabled** | Route not offered, with the reason | Pool shown as **closed to new deposits**, still visible and withdrawable |
| `FeeRouter` present but unreadable | Fee-bearing path **blocked** — never quoted at a rate we are unsure of | Same |
| Gateway unset / killswitched / unreachable | Surface hides (`gateway`). **In-flight bridges keep resolving** from chain evidence | Unaffected |

That last row is the one that makes hiding an acceptable degradation rather than a trap: a gateway
outage can stop a member *starting* a bridge, but can never strand one already moving.

**The fallback direction is always toward withholding, never inventing.** Where spec 066 could fall
back to "fee-free direct staking" because a safe default existed, no safe default exists for a bridge
route — offering one we cannot price or verify would be inventing data. So the honest fallback is
absence with a stated reason.

## The R11b predicate inversion

Two-asset surfaces pin the network on the first selection and filter the second list. **One
mechanism, two predicates that are exact inverses**, both in
`frontend/src/lib/assets/networkPin.js` so the inversion is visible at the point of use:

```js
samePair(o, pin)    // o.chainId === pin.pinnedChainId
bridgeDest(o, pin)  // o.symbol === pin.pinnedSymbol && o.chainId !== pin.pinnedChainId
```

- **`PIN_MODE.SAME_NETWORK`** — a Uniswap pair and an in-app swap both live within one network, so
  once the member picks the first asset its `chainId` pins the counterpart list.
- **`PIN_MODE.OTHER_NETWORK_SAME_ASSET`** — the bridge is the exact inverse. Its whole purpose is that
  the destination is a *different* network holding the *same* asset.

**Applying `samePair` to the bridge silently reduces it to a same-chain transfer.** Nothing throws:
the destination would be on the source chain, the gateway would still return a quote, and the member
would still sign. That plausible copy-paste error is why the two rules live side by side in one module
instead of being re-derived inline at each call site.

`bridgeDest` matches the symbol **exactly**, so `USDC.e` is not a destination for `USDC` — they are
genuinely different assets and quoting them as one would be dishonest. Both predicates run over spec
064's `SelectableAsset` shape from `useSelectableAssets`, unchanged. Bitcoin options carry a **string**
`chainId` (spec 061) and are excluded from both contexts **with a stated reason**
(`nonEvmReason`) so the selector disables them visibly rather than dropping them. And pinning can
legitimately produce an empty second list — `noPairCounterpartCopy` / `noBridgeDestinationCopy` say
what would change it rather than rendering a dead dropdown.

## Client libraries

Both `lib/` trees follow the same **read/degrade contract**, copied from `lib/staking/stakingRouter.js`
on purpose: read the router, **return `null` on any core read failure**, and let the caller choose the
honest fallback. `null` means "we could not establish this", never "no". Nothing invents availability,
and a failed read is never rendered as a zero — a member shown "0" when the truth is "we could not
read it" has been told something false about their own money.

### `frontend/src/lib/bridge/`

| Module | Job |
|---|---|
| `bridgeRouter.js` | Read the router config (routes, limits, SpokePool, paused) and build the `bridgeWithFee` call as `{target, data, value}` entries for the spec-041 unified send rail. ERC-20 routes get an approve leg; native routes carry `inputAmount` as `value`. |
| `acrossQuotes.js` | Assemble one quote from exactly two sources — the gateway's Across `suggested-fees` proxy and the live `FeeRouter` rate. Every cost is its own labelled line; a figure the upstream did not give us is marked unavailable, never rendered as 0. Quotes carry a validity window (`isQuoteStale`) and the quoted bps travels back as `maxFeeBps`. |
| `bridgeStatus.js` | The status machine and cross-session reconciler. `delivered` is reachable **only** from confirmed destination-side evidence (a fill tx hash) — not an upstream string, not an elapsed timer. `needs_attention` is about the clock, not the outcome, and is **not terminal**. |
| `bridgeActivityBuffer.js` | One notification record per state transition, ever; nothing is re-derived on drain. |
| `bridgeCopy.js` | All member-facing wording: cost, timing, risk, the honest-unavailable table, and the named settlement protocol. |

Persistence for in-flight bridges is the client ledger store (`data/ledger/sources/bridgeLedgerSource.js`,
`LEDGER_CLASS.BRIDGE`), which is per-account and rides the spec-032 encrypted backup — so a bridge
survives the app closing, and the gateway status endpoint is a **convenience, not the authority**.

### `frontend/src/lib/liquidity/`

| Module | Job |
|---|---|
| `liquidityRouter.js` | Read the pool registry and build supply calls. **Refuses** a `BridgeLp` pool rather than producing calldata that reverts; `chargesPlatformFee(pool)` is false for one; exposes `maxSupplyFee` (an upper bound) and no "the fee" function. |
| `uniswapPositions.js` | Local full-range tick derivation (identical to `fullRangeTicks`), position discovery, value/earnings/composition — every figure flagged `isEstimate` — and the **exit** calls (`decreaseLiquidity` + `collect`) straight to the position manager. `positionManager` is always an explicit argument, never hardcoded (R4b). |
| `acrossLpPositions.js` | Bridge-pool supply, read, and exit. **Nothing here imports, resolves, or targets `LiquidityRouter`**; there is no `maxFeeBps` argument and no fee-quoting function, because there is no fee. Answers for unsupported networks with `available: false` **and a reason naming where it is available**. |
| `liquidityCopy.js` | All member-facing wording, including the asymmetric availability copy and `liquidityFeeCopy` returning `null` for bridge pools, always. |

Ledger/notification wiring: `LEDGER_CLASS.LIQUIDITY` + `liquidityLedgerSource.js`, and the `bridge` /
`liquidity` notification domains. Both class names are **new and additive** — nothing is reclassified,
so historical ledger data and the encrypted backup are unaffected. Note the vocabulary rule from
research R6: **"Pool" stays with wager pools**; the Earn area is **Supply**, and the wager-pool feed
label was corrected to "Wager Pool".

## Invariants you must not break

1. **The member is Across's `depositor`.** Never `address(this)`. An unfilled deposit refunds to the
   member on the origin chain, and there is deliberately no rescue or claim-refund function to make up
   for getting this wrong.
2. **No custody, ever.** Uniswap position NFTs mint to the member; Across LP tokens mint to the member
   because their deposit never touches a FairWins contract at all. Both routers hold value only within
   a single transaction, and assert it on the way out (`ResidualFunds`).
3. **A pause stops new activity and can never trap value.** In-flight bridges settle in the SpokePool;
   positions exit through the protocol with the router nowhere in the path. Both `pause()` functions
   depend on nothing but their own contract's state, so they stay exercisable while every optional
   service is degraded. The Supply pause covers **Uniswap supplies only** — label it that way.
4. **Degrade honestly.** Return `null`, name the reason, and withhold the surface. Never invent a
   price, an availability, or a zero for a read that failed; never let a fee-bearing action proceed on
   a rate you could not read.
5. **Storage is append-only.** New state at the end, out of the `__gap`; `npm run check:storage-layout`
   green before any upgrade; in-place upgrades only.

## Deploy, sync, and test

```bash
# 1. deploy both UUPS proxies + register the two fee services (cap 250 / rate 0)
npx hardhat run scripts/deploy/deploy-bridge-liquidity.js --network <net>
# 2. seed routes and pools per the R8 matrix (HubPool listings on Ethereum only)
# 3. addresses + ABIs reach the frontend only through the generated artifacts
npm run sync:frontend-contracts
# 4. gating before any subsequent upgrade
npm run check:storage-layout
```

The deploy script asserts non-empty bytecode at every configured protocol address before writing a
record, and writes `bridgeRouter` / `bridgeRouterImpl` / `liquidityRouter` / `liquidityRouterImpl`.
The fee **rate** is then set from the AdminPanel **Fees** tab (`FEE_ADMIN_ROLE`) — it is read-only on
the Bridge and Supply tabs, which link to it.

Tests:

- Contracts — `test/bridge/BridgeRouter.test.js`, `test/liquidity/LiquidityRouter.test.js`, including
  the hostile-FeeRouter case (`contracts/mocks/MockLyingFeeRouter.sol`) that the amount bound exists
  for.
- Fork — `test/fork/bridgeRouter.fork.test.js` (**the expiry-refund case is merge-blocking**) and
  `test/fork/liquidityRouter.fork.test.js`.
- Frontend — `frontend/src/lib/bridge/__tests__/`, `frontend/src/lib/liquidity/__tests__/`,
  `frontend/src/lib/assets/__tests__/networkPin.test.js`, and the admin suites under
  `frontend/src/test/admin/` (least-privilege, network scoping, pause-never-traps).

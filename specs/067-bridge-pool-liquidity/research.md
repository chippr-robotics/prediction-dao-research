# Phase 0 Research: Cross-Chain Bridge & Pool Liquidity (spec 067)

All spec-level unknowns resolved. Three findings materially changed the design and are called out as
**DESIGN-CHANGING**; each is verified against protocol source, not documentation prose.

---

## R1 — Bridge protocol

**Decision**: **Across Protocol V3** as the single settlement protocol for Transfer → Bridge.

**Rationale**:

- **Intent-based with a hard refund guarantee.** A deposit that no relayer fills by `fillDeadline` is
  refunded on the *origin* chain. That gives spec FR-009's `refunded` state a real, protocol-level
  meaning instead of a UI fiction, and gives FR-011's requires-attention state a bounded worst case
  (~90 minutes after `fillDeadline`: ~30 min for the next root bundle proposal + ~60 min liveness).
- **One protocol serves both halves of the feature.** Across is simultaneously the bridge (SpokePool)
  and the liquidity venue (HubPool). The spec's story — "supply the same bridge network that settles
  your transfers" (User Story 2) — is literally true rather than a marketing framing.
- **Both launch networks are live.** SpokePools are deployed on Ethereum and Polygon (Polygon SpokePool
  `0x9295ee1d8c5b022be115a2ad3c30c72e34e7f096`).
- **A blessed wrapper pattern exists.** Across ships its own `SpokePoolV3Periphery` / SwapAndBridge
  contract that pulls a token from a user, transforms it, and deposits *on behalf of* that user. Our
  fee-skimming router is the same shape, not a novel integration.
- Audited by OpenZeppelin (V3 incremental audit).

**Alternatives considered**:

| Option | Rejected because |
|---|---|
| **Stargate V2 (LayerZero)** | LP pools exist per-chain (better LP coverage than Across), but the bridge leg adds a LayerZero messaging-layer trust assumption on top of the pool, and its fee model is less cleanly separable into the itemized lines FR-007 demands. Keep as the documented fallback if Across route coverage regresses. |
| **LI.FI / Socket (aggregators)** | Best route coverage, but they are *routers over* bridges and expose **no LP surface at all** — they cannot satisfy User Story 2. Aggregating would also make FR-014 ("name the protocol that settles this") a per-quote moving target. |
| **Canonical bridges (Polygon PoS bridge)** | No LP program, and the ~30-minute-to-7-day exit window makes the Transfer UX materially worse. |

**Verification owed at implementation**: fork test asserting a fill and an expiry-refund round trip.

---

## R2 — How the bridge platform fee is charged — DESIGN-CHANGING

**Decision**: a new per-network **`BridgeRouter`** (UUPS) with **transient-only custody**, mirroring
spec 066's `StakingRouter`. It pulls `inputAmount` from the member, skims the `bridge.transfer` fee to
the treasury, approves the SpokePool, and calls `depositV3` — **passing `depositor = the member's
address`, never the router's**.

**Rationale**: Across's V3 deposit signature is

```solidity
function depositV3(
    address depositor,      // <-- refund address on the ORIGIN chain
    address recipient,      // <-- delivery address on the DESTINATION chain
    address inputToken, address outputToken,
    uint256 inputAmount, uint256 outputAmount,
    uint256 destinationChainId,
    address exclusiveRelayer,
    uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline,
    bytes calldata message
) external payable;
```

Expired deposits are refunded **to the `depositor` address on `originChainId`**. If the router named
itself as `depositor` — the naive wrapper implementation — every unfilled bridge would refund *into the
router*, stranding member funds in a contract with no per-member accounting. That would violate
FR-013 (non-custodial), FR-053 (never stranded), and FR-043 (a pause must never trap value) in one
stroke, and it is silent: it only manifests on the unhappy path, in production, with real money.

`depositor` is a plain parameter, independent of `msg.sender`, which is exactly what makes Across's own
SwapAndBridge periphery contract possible. Setting `depositor = member` keeps the refund path pointed at
the member while the router still supplies the tokens.

**Consequence for tests (non-negotiable)**: the fork test suite MUST include an **expiry-refund** case
asserting the refund lands on the *member's* address, not the router's. A test that only covers the
happy fill path cannot detect this class of bug.

**Alternatives considered**: client-composed fee (member signs a fee transfer, then `depositV3`
directly) — rejected on spec 066's stated grounds: non-atomic for classic wallets, leaving a member who
drops the second signature having paid a fee for nothing.

---

## R3 — How bridge-pool liquidity is supplied — DESIGN-CHANGING

**Decision**: members call Across **`HubPool.addLiquidity` directly**, and **bridge-pool deposits are
fee-free in v1**. No router in the path.

**Rationale**: read from `contracts/interfaces/HubPoolInterface.sol` at `master`:

```solidity
function addLiquidity(address l1Token, uint256 l1TokenAmount) external payable;
function removeLiquidity(address l1Token, uint256 lpTokenAmount, bool sendEth) external;
```

There is **no `recipient` / `to` parameter**. LP tokens are minted to `msg.sender`. A fee-skimming
router would therefore receive the LP tokens itself, making FairWins the custodian of the position and
leaving the member unable to call `removeLiquidity` — a direct violation of FR-023 (non-custodial) and
FR-021 (always exitable).

This is precisely the situation spec 066 already ruled on for delegated staking (the position binds to
`msg.sender`, so routing it would make it custodial and un-exitable → shipped fee-free rather than as a
weaker guarantee). Applying the same rule here keeps the codebase's fee doctrine consistent: **a fee is
charged only where it can be charged atomically without taking custody.**

**Consequence**: the `liquidity.deposit` fee service applies to **Uniswap trading pools only** in v1.
Spec FR-026 is satisfied (the service exists, capped, read from the one source of truth); FR-030 is
satisfied more strongly than written. The Pool control view still governs Across pool **curation and
pause** on-chain — only the fee path is absent.

**Alternatives considered**: router holds LP tokens and tracks member shares internally — rejected;
that is building a custodial vault, which is out of scope and contrary to the spec's core promise.

---

## R4 — Uniswap position mechanics

**Decision**: **Uniswap V3** full-range positions via the already-configured
`NonfungiblePositionManager`, **Polygon only**, fee charged through a new **`LiquidityRouter`**.

**Rationale**:

- `frontend/src/config/networks.js` already carries a canonical Uniswap V3 `dex` block for Polygon
  (`positionManager: 0xC36442b4a4522E871399CD717aBDD847Ab11FE88`). No new network config is required —
  the plan reuses `dex.positionManager` and `dex.factory`.
- `NonfungiblePositionManager.mint(MintParams)` **does** carry a `recipient` field, so the router can
  skim the fee from both tokens and mint the position NFT straight to the member — atomic, and
  non-custodial across transactions. This is the structural difference from R3 that makes a fee
  chargeable here and not there.
- Full-range is expressed as `tickLower`/`tickUpper` at the min/max usable ticks for the pool's tick
  spacing (`±887272` floored/ceiled to spacing — e.g. `±887220` at spacing 60). No range UI, no
  out-of-range state, no rebalancing — exactly the spec's FR-016 bound.
- Ethereum mainnet is `dex: null` in the network config (spec 048 shipped it as a ClearPath/value
  network with no in-app DEX). Uniswap LP is therefore **not offered on Ethereum** at launch — an
  honest-availability outcome, not an omission.

**Alternatives considered**: Uniswap V4 (newer, hooks, singleton `PoolManager`) — rejected for v1: it
would require new network config, a new position-accounting model, and buys nothing for full-range
positions. V2-style pairs — rejected: not the configured deployment, and V3 full-range is economically
equivalent for this use case while reusing config that already exists.

---

## R5 — Where the operator control surface lives

**Decision**: **on-chain, in the two routers** — `BridgeRouter` (routes, limits, addresses, pause) and
`LiquidityRouter` (curated pools, caps, addresses, pause) — each per-network, each emitting an event
per change.

**Rationale**: both routers must exist anyway to charge fees atomically (R2, R4), so putting the
control state in them is the *smaller* change, not the larger one. It also satisfies three separate
requirements for free rather than through new machinery: FR-046 (audit history = the event log),
FR-050 (per-network scoping = per-network deployment), and FR-041 (no redeploy = an admin transaction).
This is exactly the spec 066 `StakingRouter` shape, which is 252 lines — the precedent is small.

Curation of Across HubPool pools lives in `LiquidityRouter` **as config only**; the deposit call itself
bypasses the router (R3). The router is the registry and the killswitch for those pools, not the path.

**Alternatives considered**: off-chain config in the relay-gateway — rejected; the gateway is stateless
by repo doctrine and is optional infrastructure, so a killswitch living there would violate FR-044
(pause must work while optional services are degraded).

---

## R6 — Vocabulary collision with Wager Pools — DESIGN-CHANGING

**Decision**: liquidity activity uses the class **`liquidity`** and the notification/feed domain
**`liquidity`**; bridging uses class **`bridge`** and domain **`bridge`**. Additionally, the existing
wager-pool feed label is **relabelled** from `Pool` to `Wager Pool`.

**Rationale**: the collision is worse than the spec anticipated. Three separate registries already use
`pool` for *wager* pools:

- `frontend/src/data/ledger/constants.js` — `LEDGER_CLASS.POOL = 'pool'`
- `frontend/src/lib/notifications/deliveryPreferences.js` — `{ domain: 'pools', label: 'Wager Pools' }`
- `frontend/src/data/notifications/domains.js` — `pools: { label: 'Pool' }` ← **already reads "Pool"**

That last one is the sharp edge: the activity feed today tags wager-pool events with the literal label
**"Pool"**. Shipping an Earn area called "Pool" without touching it would put two unrelated features
under one word in the same feed, which is what FR-039 exists to prevent. The label change is a
one-line, member-visible clarification that makes the wager surface *more* accurate on its own terms.

New enum values are additive (`LEDGER_CLASS.BRIDGE`, `LEDGER_CLASS.LIQUIDITY`); no existing entry is
reclassified, so historical ledger data and the encrypted backup are unaffected.

---

## R7 — Tracking an in-flight bridge across sessions

**Decision**: append the deposit to the client ledger store at submit time (the `captureStakingAction`
pattern in `sources/stakingLedgerSource.js`), keyed by origin chain + `depositId`, and reconcile status
on load by polling Across's deposit-status API, with an on-chain `FilledV3Relay` /
`FundsDeposited` event read as the authoritative fallback.

**Rationale**: FR-010 requires an in-flight bridge to survive the app closing, so status cannot live in
React state. The client ledger store already persists per-account, travels in the spec-032 encrypted
backup, and is the established home for action-time capture. The entry starts at
`LEDGER_STATUS.PENDING` and is promoted to `SETTLED` / `CANCELLED` (refunded) only on confirmed
destination-side evidence — which is what makes FR-009's "never complete before the destination
delivers" enforceable rather than aspirational.

**Alternatives considered**: subgraph indexing — rejected; no FairWins subgraph covers Across, and
Ethereum has `subgraphUrl: null` in config.

---

## R8 — Launch availability matrix

Derived from R1/R3/R4 and the existing network config. This drives every honest-unavailable surface:

| Surface | Ethereum (1) | Polygon (137) | ETC / Mordor | Bitcoin | Testnets |
|---|---|---|---|---|---|
| Transfer → Bridge | ✅ ↔ Polygon | ✅ ↔ Ethereum | ❌ no routes | ❌ out of scope (FR-006) | ❌ |
| Pool → Bridge liquidity (Across HubPool) | ✅ **fee-free** | ❌ L1-only protocol | ❌ | ❌ | ❌ |
| Pool → Trading liquidity (Uniswap V3) | ❌ `dex: null` | ✅ fee-charged | ❌ no Uniswap | ❌ | ❌ |

The two Pool kinds are available on **opposite networks** at launch. This is a genuine product wrinkle,
not a bug: the Pool list spans networks transparently (the Earn section already renders cross-network
with badges and auto-switches on submit via `useEarnSend`), so a member sees both kinds in one list and
the network switch happens at signing time. Copy must not imply either kind is available everywhere.

---

## R9 — Fee consent ceiling

**Decision**: reuse the spec 066 `maxFeeBps` guard verbatim — the member's quoted bps is passed into
the router call and the router reverts (`FeeAboveQuoted`) if the live `FeeRouter` rate exceeds it.

**Rationale**: FR-028 requires the quoted rate to be a hard ceiling. The mechanism already exists,
is already tested, and inventing a second one would fragment the doctrine. Rate and treasury are read
from `FeeRouter` at call time — never cached in the router, never duplicated (FR-027).

Both services ship at **0 bps** and are registered with a **250 bps** cap:
`bridge.transfer` = `keccak256("bridge.transfer")`, `liquidity.deposit` = `keccak256("liquidity.deposit")`.

---

## R10 — Degraded-mode behavior

**Decision**: quotes come from the Across API through the existing relay-gateway (a new
`services/relay-gateway/src/bridge/` module, reusing screening/quotas/killswitch like the Polymarket
and Bitcoin modules). When the gateway is unset or unreachable, the Bridge surface **hides rather than
half-works**; Pool remains fully usable because its reads are direct RPC.

**Rationale**: FR-053 requires a degraded path, and FR-054 forbids inventing data. A bridge quote is
not derivable client-side (it needs Across's relayer-fee oracle), so there is no honest self-submit
fallback for *quoting* — the honest degradation is to say the surface is unavailable. This differs
from the gasless-intents never-stranded rule because no member value is committed at quote time.
Critically, an already-submitted bridge still resolves without the gateway (R7's on-chain fallback),
so a gateway outage can never strand an in-flight transfer.

---

## Resolved unknowns summary

| # | Unknown | Resolution |
|---|---|---|
| R1 | Bridge protocol | Across V3 |
| R2 | Bridge fee path | `BridgeRouter`, `depositor = member` (refund safety) |
| R3 | Bridge-pool LP fee | **Fee-free v1** — `addLiquidity` has no recipient param |
| R4 | Uniswap version/coverage | V3 NFPM full-range, Polygon only, fee-charged |
| R5 | Control surface location | On-chain, in the two routers |
| R6 | Ledger/notification naming | `bridge` + `liquidity`; relabel wager `Pool` → `Wager Pool` |
| R7 | In-flight persistence | Client ledger store + API poll + on-chain fallback |
| R8 | Availability | Bridge: ETH↔Polygon; Across LP: ETH only; Uniswap LP: Polygon only |
| R9 | Fee ceiling | `maxFeeBps` guard reused from spec 066 |
| R10 | Degraded mode | Bridge hides without gateway; in-flight still resolves |

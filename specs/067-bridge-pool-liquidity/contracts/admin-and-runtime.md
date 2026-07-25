# Admin Surfaces & Runtime Contract (spec 067)

How operators drive the two routers, and the exact contract between the on-chain control state and what
a member sees — including what happens when any of it is missing.

---

## AdminPanel navigation

`frontend/src/components/admin/adminNav.js` gains a group. Placement is deliberate: bridging and pooling
are member-value surfaces with their own killswitches, not protocol wiring, so they do not belong under
"Protocol Config" beside oracle adapters.

```js
{
  label: 'Liquidity',
  items: [
    (isAdmin || isLiquidityAdmin || isGuardian) && item('bridge', 'Bridge'),
    (isAdmin || isLiquidityAdmin || isGuardian) && item('supply', 'Supply'),
  ].filter(Boolean),
}
```

`ADMIN_TAB_ICONS`: `bridge: 'transfer'`, `supply: 'sprout'`. `buildAdminNavGroups` takes a new
`isLiquidityAdmin` flag, resolved from `LIQUIDITY_ADMIN_ROLE` on either router.

An operator holding none of admin / liquidity-admin / guardian sees neither tab and cannot reach either
by direct URL (FR-040, FR-049).

---

## Bridge tab (`BridgeTab.jsx`)

Modeled on `StakingTab.jsx` (366 lines) and `ProtocolConfigTab.jsx`.

| Section | Controls | Role |
|---|---|---|
| **Status** | Paused banner; `pause` / `unpause` | `GUARDIAN_ROLE` |
| **Routes** | Table (asset, origin → destination, enabled, max amount, expected fill) across the 20 directed mainnet routes. Add / edit / enable / disable / remove; bulk enable/disable per network pair | `LIQUIDITY_ADMIN_ROLE` |
| **Addresses** | `spokePool`, `feeRouter` — current value shown beside the input; invalid input rejected with a reason before submit (FR-042) | `LIQUIDITY_ADMIN_ROLE` |
| **Fee** | `bridge.transfer` live rate + 250 bps cap, **read-only**, with a link to the Fees tab | read-only |
| **Operations** (FR-047) | In-flight bridges; transfers past `expectedBy` needing attention; recent deliveries and refunds; gateway health | read-only |
| **History** (FR-046) | Decoded router events — action, route, before → after, operator, time | read-only |

The Operations panel reads the operator's own view of in-flight state from the gateway status endpoint
plus on-chain `FundsDeposited` events. It is **observational only** — there is no operator action that
can touch a member's in-flight bridge, because Across settles directly to the member and the router is
not in that path. The tab should say so, so nobody goes looking for a rescue button during an incident.

---

## Supply tab (`SupplyTab.jsx`)

| Section | Controls | Role |
|---|---|---|
| **Status** | Paused banner; `pause` / `unpause` — **labelled as affecting Uniswap supplies only**. Shown per network across all five deployments | `GUARDIAN_ROLE` |
| **Pools** | Table (kind, pair/asset, protocol, network, enabled, cap, supplied total, position count) spanning all five networks. List / edit / retire / set cap | `LIQUIDITY_ADMIN_ROLE` |
| **Addresses** | `positionManager`, `feeRouter` | `LIQUIDITY_ADMIN_ROLE` |
| **Fee** | `liquidity.deposit` live rate + cap, read-only; an explicit note that bridge-LP pools are fee-free by design with a link to the rationale | read-only |
| **History** | Decoded router events | read-only |

**Two honesty requirements specific to this tab**, both flowing from research R3:

1. The pause control must be labelled **"Pauses new Uniswap supplies"** — not "Pauses pooling". Across
   bridge-LP deposits do not pass through the router, so the contract cannot stop them; only the
   `enabled` flag (respected by the app) withholds them. An operator reaching for a killswitch during
   an incident must not believe they have stopped something they have not.
2. Retiring a pool is `setPoolEnabled(false)`, and the UI must show retired pools as **retired, not
   gone**, with their position count — because members still hold positions there and must keep being
   able to see and exit them (FR-024).

---

## Runtime contract: what the member app reads, and what it does when it is missing

`frontend/src/lib/bridge/bridgeRouter.js` and `lib/liquidity/liquidityRouter.js` follow the
`lib/staking/stakingRouter.js` shape: read the router, return `null` on any core read failure, and let
callers decide the honest fallback.

| Condition | Bridge surface | Pool surface |
|---|---|---|
| Router deployed, reachable, routes/pools enabled | Full function | Full function |
| Router **paused** | New bridges refused with the paused reason; in-flight tracking unaffected | New Uniswap supplies refused; positions still visible and withdrawable |
| Route / pool **disabled** | Route not offered; selecting the pair explains why (FR-007 honest unavailable) | Pool shown as **closed to new deposits**, still visible + withdrawable |
| Router **undeployed** on this network | Bridge tab absent; Transfer works exactly as before | Pool area shows the honest per-network empty state |
| Router deployed but **unreachable** | Surface disabled with "as of last read" framing (FR-052) — never invented availability | Same; existing positions still read directly from the protocol |
| `FeeRouter` unreachable | Fee-bearing path **blocked** (never assume a lower rate) | Same |
| **Gateway** unset/unreachable | Quoting impossible ⇒ Bridge surface hides. **In-flight bridges still resolve** via on-chain fallback | Unaffected — Pool reads are direct RPC |

The asymmetry in the last row is the important one: a gateway outage can prevent a member *starting* a
bridge but can never strand one already in flight (FR-053). That is what makes hiding the surface an
acceptable degradation rather than a trap.

**Fallback direction is always toward withholding, never inventing** (FR-051). Where spec 066 could fall
back to "fee-free direct staking" because a safe default existed, no safe default exists for a bridge
route — offering a route we cannot price or verify would violate FR-054. So the honest fallback is
absence with a stated reason.

---

## Deployment & sync

0. Add Arbitrum (42161), Base (8453), and Optimism (10) to `networks.js` as full networks, and split
   `capabilities.dex` (explicit swap flag) from `capabilities.liquidity` (derived) — research R4a.
   Verify each chain's Uniswap and Across addresses against that chain's own deployment record;
   **Base's Uniswap addresses differ from the canonical set** (R4b).
1. Deploy both UUPS proxies to each of the five networks (`scripts/deploy/deploy-bridge-liquidity.js`)
   using `scripts/deploy/lib/upgradeable.js` — never a fresh redeploy on upgrade. The script MUST assert
   non-empty bytecode at every configured protocol address before writing a deployment record.
2. Register `bridge.transfer` and `liquidity.deposit` on the network's `FeeRouter` (cap 250 bps, rate 0).
3. Seed routes and pools per the R8 availability matrix — all 20 directed bridge routes across the five
   mainnets; Across HubPool `BRIDGE_LP` listings on Ethereum only; Uniswap `TRADING_LP` listings on all
   five.
4. Record `bridgeRouter` / `bridgeRouterImpl` / `liquidityRouter` / `liquidityRouterImpl` in
   `deployments/<network>-chain<id>-v2.json`.
5. `npm run sync:frontend-contracts` — addresses and ABIs reach the frontend only through the generated
   artifacts (constitution V).
6. Extend `npm run check:storage-layout` to both routers **before** any subsequent upgrade.

---

## Role provisioning

`LIQUIDITY_ADMIN_ROLE = keccak256("LIQUIDITY_ADMIN_ROLE")`, granted on both routers at initialize to the
admin and thereafter managed from the existing **Admin Roles** tab, which enumerates roles generically —
no new role-management UI is needed. `GUARDIAN_ROLE` reuses the existing guardian set so the emergency
pause is exercisable by the operators who already hold incident authority (FR-044).

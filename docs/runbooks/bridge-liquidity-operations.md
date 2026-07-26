# Runbook: Bridge & Supply Liquidity Operations (spec 067)

Operating the two per-network on-chain control surfaces behind Transfer → **Bridge** and
Earn → **Supply**: the `BridgeRouter` (curated routes, per-transaction limits, protocol addresses,
emergency pause) and the `LiquidityRouter` (curated pools, caps, protocol addresses, emergency
pause). Both are UUPS proxies. Design: `specs/067-bridge-pool-liquidity/`.

> **Status: neither router is deployed on any network yet (issue #966).** Everything below is
> written against the intended deployed state, because a control surface with no written pause
> procedure is worse than an undeployed one. Where a step names an address or a network, it is the
> network's own `deployments/<net>-chain<id>-v2.json` record that is authoritative once the deploy
> lands — not this document.

## Read this first — three facts that change what you do

1. **A pause stops NEW bridges and NEW Uniswap supplies. It cannot trap value, and it cannot
   release it either.** Both routers are absent from every exit path by construction.
2. **The Supply pause stops new *Uniswap* supplies only.** Across bridge-LP deposits never touch a
   FairWins contract, so no FairWins contract can stop them. Only the per-pool `enabled` flag —
   which the app honours and a direct caller does not — withholds them.
3. **No operator action can touch a member's in-flight bridge.** Across settles directly to the
   member. There is deliberately no rescue and no claim-refund function, on either router or in any
   admin surface. Do not spend an incident looking for one.

## Components, roles, and what each one can actually do

| Thing | Where | Role required |
|---|---|---|
| `BridgeRouter` (routes, limits, pause) | on-chain, per network | see below |
| `LiquidityRouter` (curated pools, caps, pause) | on-chain, per network | see below |
| Bridge / Supply control views | Operations control plane → **Liquidity** → **Bridge** / **Supply** | entry: ADMIN, LIQUIDITY_ADMIN or GUARDIAN |
| `FeeRouter` (spec 060) | on-chain, per network | `FEE_ADMIN_ROLE` for rates; `DEFAULT_ADMIN_ROLE` for registration/treasury |
| Quoting gateway (`/v1/bridge/*`) | relay-gateway, optional | gateway operator — see [relayer-operations.md](relayer-operations.md) |

| Action | Role, on which contract |
|---|---|
| `pause()` / `unpause()` | `GUARDIAN_ROLE` **on that router, on that network** (or that router's `DEFAULT_ADMIN_ROLE`) |
| Routes: add / edit / enable / disable / remove / limit | `LIQUIDITY_ADMIN_ROLE` on the `BridgeRouter` for that network |
| Pools: list / edit / retire / reopen / caps | `LIQUIDITY_ADMIN_ROLE` on the `LiquidityRouter` for that network |
| `setSpokePool` / `setPositionManager` / `setFeeRouter` / `setSanctionsGuard` | **`DEFAULT_ADMIN_ROLE`** on that router |
| Fee rates (`bridge.transfer`, `liquidity.deposit`) | `FEE_ADMIN_ROLE` on the FeeRouter — **not in these tabs** |
| Upgrade either router | `UPGRADER_ROLE` — see [contract-upgrades.md](contract-upgrades.md) |

The protocol-wiring setters sit a role **above** curation on purpose. `spokePool` is approved and
handed the member's net amount; `positionManager` is approved and mints the member's position;
`feeRouter` names both the rate and the `treasury()` the fee is transferred to. Whoever can write
them can redirect where member funds go. Curating a route or a pool badly is reversible with one
toggle; pointing a router at a hostile contract is not. Both routers additionally bound the fee
**amount** they will pay out to `MAX_FEE_BPS` (250) and require `quoteFee` to split exactly
(`FeeSplitMismatch`) — so even the router's own admin cannot configure a FeeRouter that takes more
than 250 bps of a member's principal, whatever rate that FeeRouter reports about itself.

### Roles are per-router AND per-network. Both halves bite.

`GUARDIAN_ROLE` on the WagerRegistry carries **no** authority over either router — they are separate
AccessControl instances that happen to use the same role name. And a grant lands on the router for
the network your wallet is connected to. So "grant the guardian" is up to ten grants (two routers ×
five networks), not one.

Grant them from **Operations control plane → Admin Roles** (`DEFAULT_ADMIN_ROLE` only), connected to
the network you are granting on, choosing the explicit targets:

- `GUARDIAN_BRIDGE` / `GUARDIAN_LIQUIDITY` — the killswitches.
- `LIQUIDITY_ADMIN_BRIDGE` / `LIQUIDITY_ADMIN_LIQUIDITY` — curation.

Verify a grant by connecting as the grantee, opening the tab, scoping to that network, and
confirming the write controls are offered. The tabs read `hasRole` from the router in scope, not the
app-wide role flags, so that check is the real answer.

### Scope is a network, not your wallet's network

Both tabs read every capable network from that network's own RPC, and the network selector at the
top of each tab is what you are looking at. Only **writes** need the wallet on the selected network;
the tab says so rather than showing a dead button. An empty route table means that network has no
routes — it does not mean you are connected somewhere else.

Where the routers can exist at all (research R8):

| Network | Bridge routes | Uniswap trading pools | Across bridge-LP pools |
|---|---|---|---|
| Ethereum 1 | ✅ | ✅ | ✅ **only network** — the HubPool is L1-only |
| Optimism 10, Polygon 137, Base 8453, Arbitrum 42161 | ✅ | ✅ | ❌ |
| Ethereum Classic 61, Mordor 63 | ❌ neither protocol exists | ❌ | ❌ |

ETC and Mordor cannot host these routers at all. If someone asks you to pause bridging on Mordor,
the honest answer is that there has never been any.

---

## 1. Pause / resume new bridges (per router, per network)

Use when a route is misbehaving across the board, a protocol address is in doubt, or you want
everything on one network stopped while you think.

1. Operations control plane → **Liquidity** → **Bridge**.
2. Set the **network selector** at the top of the *Bridge Controls* card to the affected network.
3. Connect the wallet to that same network (writes only; reads already work from anywhere).
4. **Emergency pause** card → **Pause new bridges**. One transaction. No timelock, no redeploy, and
   no dependency on the gateway or any other optional service — it works while everything else is
   degraded.

**Verify:**
- The *Bridge Controls* status row **New bridges** reads `PAUSED — no new bridges start.`
- Within one member refresh, the member Bridge surface refuses new bridges on that network with the
  paused reason.
- **Change history** at the bottom of the tab gains a `Paused` row with your address and the time.

**What it does not do.** It cannot reach a transfer already moving, and it cannot strand one: those
are held by the Across SpokePool and settle or refund to the member regardless of this contract's
state. It also covers **every route from that network**. If exactly one destination or asset is
affected, disabling that single route (procedure 3) is the narrower fix — that needs
`LIQUIDITY_ADMIN_ROLE`, a different role. Pausing the whole network is the right call when you
cannot reach someone who holds it; it is the wrong call when you can.

**Resume:** same card → **Resume bridging**. Verify the status row returns to `active` and the
member surface offers routes again.

---

## 2. Pause / resume new supplies (per network) — read this one twice

1. Operations control plane → **Liquidity** → **Supply**.
2. Network selector → the affected network; connect the wallet there.
3. **Emergency pause** card → **Pause new Uniswap supplies**.

**Verify:** the status row shows paused; new Uniswap supplies on that network are refused within one
member refresh; a `Paused` row appears in the tab's change history.

**What you have stopped:** new full-range Uniswap V3 supplies routed through the `LiquidityRouter`
on that network.

**What you have NOT stopped, and must not tell anyone you have:**

- **Across bridge-LP deposits.** `HubPool.addLiquidity` has no recipient parameter, so LP tokens
  mint to `msg.sender`; routing them would leave FairWins owning a position the member could never
  exit. The deposit is therefore a direct member call with no FairWins contract in the path, and
  this pause cannot see it, let alone stop it. To withhold a bridge pool, **retire it**
  (procedure 4) — the `enabled` flag is honoured by every FairWins surface. A member calling the
  HubPool directly is not bound by it, and never was.
- **Any exit.** Uniswap members own the position NFT and call the position manager directly;
  bridge-LP members own the LP tokens and call the HubPool directly. Withdrawal has never gone
  through this router, so nothing here can block it — and no withdrawal can ever carry a platform
  fee, because there is no code path that could charge one.

**Resume:** **Resume new Uniswap supplies**, same card.

---

## 3. Curate bridge routes

A route is one asset, from the scoped network, to one destination network. The reverse direction is
a separate route living on **that** network's router — select it in the network selector to manage
it. Twenty directed routes per asset across the five mainnets.

Operations control plane → **Liquidity** → **Bridge** → **Routes**
(`LIQUIDITY_ADMIN_ROLE` on that router; wallet on the scoped network).

**Add or edit.** *Add or edit a route* form: input token, output token, destination network,
per-transaction maximum, expected delivery window (60 s – 24 h), enabled, native-input flag. Saving
an existing (input token, output token, destination) triple **updates it in place**; changing the
delivered asset produces a *different* route rather than silently substituting one.
Verify: the route appears in the table with the values you entered, and a `RouteSet` row appears in
the change history.

**Enable / disable.** One button per row. Reversible in one click. Use this to stop new bridges on
one route without touching the rest of the network. Verify: the row's **Status** flips, the member
surface stops offering that pair within one refresh and explains the absence rather than hiding it.

**Bulk enable/disable per destination.** The *Destination coverage* table toggles every route to one
destination. The contract has no batch setter, so this is **one wallet prompt per route** and the
button says how many. **Rejecting the first prompt cancels the rest** — the run stops on the first
failure and reports how many of how many actually changed. Verify against the Routes table, not
against the count you intended.

**Set a per-transaction maximum.** Per-row input. `0` means **uncapped**, not "nothing may pass".
Type the amount in the unit the input labels itself with; for a token this build does not know the
decimals of, it says *raw units* and refuses anything but whole digits rather than guessing a scale.
A mis-scaled limit is a silent member-facing failure (a cap of 1 wei refuses every transfer), so the
form rejects before the wallet prompt. Verify the table's **Per-transaction max** column.

**Remove.** Deletes the curation entry, not just its availability, and it is not the "safer
disable". Two consequences:

- Restoring it means re-entering every field.
- The **Operations** panel loses that route's advisory delivery window, which is how it decides an
  in-flight transfer is taking too long. Transfers already moving on the route are otherwise
  unaffected — Across settles those directly to the member — but they will show *"no expected
  window"* instead of being flagged as late.

The confirm dialog names both, and tells you how many transfers are currently listed on the route.
**To stop new bridges reversibly, disable. Remove only when the route should not exist.**

---

## 4. Curate supplied pools

Operations control plane → **Liquidity** → **Supply** → **Curated pools**
(`LIQUIDITY_ADMIN_ROLE`; wallet on the scoped network).

**List a pool.** *Add or edit a pool*: kind, address, tokens, fee tier, caps.

- *Trading pool (Uniswap V3)* — routed and fee-bearing. Use **Check pool** first: the contract
  cross-checks the listing against the pool it names (`token0`, `token1`, `fee`) and rejects a
  mismatch, because the listing metadata is what the member is shown.
- *Bridge pool (Across HubPool)* — curation and killswitch only; the deposit itself is a direct
  member call and is fee-free by design. Ethereum only.

**Retire / reopen.** One button per row (**Retire** / **Reopen**). Retiring closes the pool to
**new** deposits and nothing else. There is deliberately **no `removePool` on the contract at all** —
members still hold positions there and must keep being able to see and exit them, so a retired pool
stays in the table (with its position count) and stays visible and withdrawable to the members in
it. A pool must never be hidden while a member's money is inside it.
Verify: the row reads `RETIRED — closed to new deposits, still withdrawable`; the member Supply list
shows it as closed to new deposits rather than dropping it; a `PoolEnabledChanged` row appears in
the change history.

**Set per-transaction caps.** Per-row inputs (one per token for trading pools), then **Set caps**.
`0` = uncapped. Same unit-honesty rules as route limits.

> **A BRIDGE_LP pool's cap is honoured by the app, not enforced by the contract.** The router's limit
> check lives inside the Uniswap supply entry point, and a bridge-LP deposit never enters it. Every
> FairWins surface refuses above the cap, so it does real work — but a member calling the HubPool
> directly is not bound by it. Exactly the same property as the `enabled` flag.

**Reading the numbers honestly.** *Positions* and *Supplied via FairWins* are counted from the
router's own deposit events over a bounded recent window — what FairWins routed, not the pool's whole
size. A bridge pool's *size* is read straight from the HubPool (the whole pool). Its per-member
*position count* genuinely cannot be produced without an indexer, and the tab says `unknown` rather
than printing `0` — which would read as "no member has money in this pool", precisely the claim you
must not act on when retiring one.

---

## 5. Stuck bridge triage

**Start here: the Operations panel on the Bridge tab is observational only.** There is no operator
action, in the tab or in the contract, that can touch a member's in-flight bridge. The member is
Across's `depositor`, so an unfilled deposit refunds to **them** on the origin chain — which is
exactly why `IBridgeRouter` has no rescue or claim function. Everything below is diagnosis and
communication. None of it is intervention.

### 5.1 Is it late, or has it failed?

Operations control plane → **Liquidity** → **Bridge** → **Operations**, scoped to the **origin**
network. Rows past their expected window sort **ahead of** newer transfers, so a stuck one is not
pushed out by healthy traffic.

The **State** column is the answer to "late or failed":

| State | Means | Terminal? |
|---|---|---|
| *Sending* / *Sent* / *On the way* | Normal progress; not yet past the window | No |
| **Taking longer than expected** | Past the route's advisory window. A statement about the **clock**, not the outcome — it can still deliver or be returned | **No** |
| **Did not send** | The origin transaction itself did not go through. **This is the only "actually failed".** Nothing left the member's wallet beyond that network's cost | Yes |
| *Delivered* | The destination network delivered it | Yes |
| *Returned to you* | Refunded to the member on the origin chain | Yes |
| *Status unavailable* | The state could not be read. Not a verdict — see 5.2/5.3 | n/a |
| appended: *no expected window* | The route is no longer curated, so lateness **cannot be said** here (procedure 3, Remove) | n/a |

The **Evidence** column says how strong that answer is: `destination fill` (a destination-chain
transaction), `return transaction`, `bridge knows the deposit` (Across has it, no outcome yet), or
`origin transaction only` (nothing beyond the member's own send observed).

A bridge is **never** shown as delivered without a destination-chain fill hash, and never shown as
refunded without a return transaction. If the panel is not claiming one, no one should.

So: *Taking longer than expected* is a clock reading and needs patience plus the checks below.
*Did not send* is a failure and needs no bridge triage at all — the member still holds their asset.
Everything in between is in Across's hands.

**Bounded worst case:** an unfilled deposit is refundable after its `fillDeadline`, and the refund
lands roughly within ~90 minutes of it (next root-bundle proposal plus liveness). Past that with no
refund is genuinely unusual and is escalation material.

### 5.2 Find the Across deposit id from the origin transaction

Everything downstream is keyed on `(originChainId, depositId)`.

1. Open the member's **origin** transaction on that network's explorer (the Operations row links it
   as *start tx*, or the member has it from their activity view).
2. In its logs, find the event emitted by the **Across SpokePool**: `FundsDeposited` (or
   `V3FundsDeposited` on the pre-rename ABI). `depositId` is an indexed parameter.
3. Confirm `depositor` is the **member's** address, not the router's. It always should be — that is
   the property fork test T038 exists to hold — but if it is ever not, stop and escalate as a
   security incident, because that is the fund-stranding failure the design is built to prevent.

### 5.3 Check the Across side

```bash
# Through the FairWins gateway (same base URL as the relayer, $VITE_RELAYER_URL):
curl -s "$GATEWAY/v1/bridge/<originChainId>/status?depositId=<depositId>" | jq .
```

Read the `state` plus the hashes:

| `state` | Reading |
|---|---|
| `in_flight` | Across has it; no fill yet |
| `delivered` | Filled — `fillTxHash` is the proof |
| `expired` | Past `fillDeadline`, unfilled — **refundable to the member on the origin chain**, no refund transaction yet |
| `refunded` | Returned — `refundTxHash` is the proof |

Error codes instead of a body: `bridge_disabled` / `bridge_killed` (the module is switched off —
this tells you nothing about the transfer), `unsupported_chain`, `invalid_deposit`,
`upstream_unavailable` (Across, not us).

If the gateway is off or unreachable, go to the chain directly: on the **destination** network's
SpokePool, look for `FilledRelay` / `FilledV3Relay` with `originChainId` and `depositId` as the two
indexed topics. That is the same evidence the app uses, and it is available whether or not any
FairWins service is running. Across's own explorer (<https://across.to>) is a third cross-check.

### 5.4 What to tell the member

- Their transfer is not lost and FairWins does not hold it. FairWins never held it: it went from
  their wallet to Across and, on delivery, to their address on the other network.
- If it cannot be delivered, Across **returns the asset automatically to the same wallet on the
  network it started from**. They are the depositor. There is nothing for them to claim, sign, or
  ask us to release — and nothing we could release if there were.
- Network costs already spent are not returned.
- Give them the origin transaction, and the fill or return transaction once one exists.

Do not promise a delivery time. The advisory window is an estimate from recent transfers, and the
whole point of *Taking longer than expected* is that it says what is known instead of spinning.

---

## 6. Fee changes

**Not in these tabs.** Both tabs show `bridge.transfer` / `liquidity.deposit` **read-only** with
their 250 bps cap and a link across to the Fees tab. Rates live on the spec-060 `FeeRouter` and are
changed by a `FEE_ADMIN_ROLE` holder — see [fee-operations.md](fee-operations.md).

Both services ship at **0 bps against a 250 bps cap**, so launch behaviour is fee-free and
byte-identical to having no fee configured: no fee line, no fee transfer. Raising either is a
deliberate act by the fee authorization, and a member can never be charged above the rate they were
shown (the quoted bps is passed in as `maxFeeBps` and the router reverts `FeeAboveQuoted`).

Fees are charged on value-in only. Pool withdrawals, earnings claims, and bridge refunds carry no
platform fee — structurally, not by policy: the routers are absent from those paths.

Bridge-LP deposits are fee-free by design, for the reason procedure 2 gives: `addLiquidity` mints to
`msg.sender`, so there is no atomic, non-custodial place to charge a fee. Do not treat that as a gap
to close — closing it would make FairWins the owner of a position the member could not exit.

### ⚠️ The ordering hazard — get this wrong and every member action reverts

`bridge.transfer` and `liquidity.deposit` must be **registered on that network's FeeRouter** before
either router carries traffic. Both routers call `FeeRouter.quoteFee` unconditionally on every member
action, and an unregistered service **reverts `ServiceUnknown`** — so an unregistered network means
every bridge and every Uniswap supply on it fails, at zero configured fee, for a reason that looks
nothing like its cause.

Registration needs `DEFAULT_ADMIN_ROLE` **on the FeeRouter**. `scripts/deploy/deploy-bridge-liquidity.js`
registers both (ConfigOnly, cap 250 bps, rate 0) as part of the deploy — **but only if the deployer
still holds that role**. If admin has already been handed to the multisig, the script prints a warning
and skips, and it is on you to register from the FeeRouter admin before the routers go live.

**Verify before enabling any route or pool on a network** — the Fees tab lists every registered
service for the connected network, or read it directly:

```bash
npx hardhat console --network <net>
> const r = await ethers.getContractAt('FeeRouter', '<feeRouter addr from deployments/>')
> for (const s of ['bridge.transfer', 'liquidity.deposit'])
    console.log(s, await r.getService(ethers.id(s)))
# expect capBps 250, feeBps 0, kind 2 (ConfigOnly) for both.
# capBps 0 / kind 0 means UNREGISTERED — every member action on this network will revert.
```

---

## 7. Degraded states — what members see, and what you can still do

| Condition | Bridge surface | Supply surface | Controls |
|---|---|---|---|
| Router **not deployed** on the network | Bridge absent; Transfer works exactly as before | Honest per-network empty state | Tab says "not deployed", names the deploy script |
| Router **paused** | New bridges refused with the paused reason; in-flight tracking unaffected | New Uniswap supplies refused; positions visible + withdrawable | Full |
| Route / pool **disabled** | Route not offered, absence explained | Pool shown closed to new deposits, still visible + withdrawable | Full |
| Router deployed but **unreachable** | Surface disabled with "as of last read" framing — never invented availability | Same; positions still read directly from the protocol | Tables read as-of/unreadable; controls stay **offered** with authority *unconfirmed* — the contract is the gate |
| **FeeRouter** unreachable | Fee-bearing path **blocked** — never assumes a lower rate | Same | Fee cards say so instead of showing a rate |
| **Gateway** unset / unreachable / killswitched | Quoting is impossible ⇒ Bridge surface **hides**. **In-flight bridges still resolve** from on-chain evidence | Unaffected — Supply reads are direct RPC | **Pause still works** — it depends on nothing but the router's own state |

The last row's asymmetry is the load-bearing one: a gateway outage can prevent a member *starting* a
bridge but can never strand one already moving. That is what makes hiding the surface an acceptable
degradation rather than a trap. Fallback is always toward **withholding**, never inventing: there is
no safe default for a route we cannot price, so the honest fallback is absence with a stated reason.

Your authority read can also degrade. When the tab cannot confirm your role on the router in scope it
says **unconfirmed** and **still offers the controls** — the contract is the real gate and will refuse
anything you do not hold. Withdrawing a killswitch because an RPC timed out is the failure that
behaviour exists to prevent.

---

## 8. Escalation

Work out **which router, on which network**, before paging anyone — the roles do not generalize
across either axis.

| Need | Wake | Why it has to be them |
|---|---|---|
| Stop new bridges / new Uniswap supplies on a network | A `GUARDIAN_ROLE` holder **on that router, on that network** | Wager-registry guardians and guardians of the same router on another network have no authority here |
| Stop one route or one pool (narrower than a pause) | A `LIQUIDITY_ADMIN_ROLE` holder on that router, that network | Curation is a different role from the killswitch |
| A protocol address is wrong or suspect (`spokePool`, `positionManager`, `feeRouter`, `sanctionsGuard`) | The router's `DEFAULT_ADMIN_ROLE` — the multisig | Fund-path references, deliberately a role above curation |
| Change or emergency-zero a fee rate | `FEE_ADMIN_ROLE` on the FeeRouter ([fee-operations.md](fee-operations.md)) | Rates are not editable from these tabs |
| Register a missing fee service (`ServiceUnknown` reverts) | FeeRouter `DEFAULT_ADMIN_ROLE` | See procedure 6 |
| Quoting is down / bridge module killswitched | Gateway operator ([relayer-operations.md](relayer-operations.md)) | Optional infrastructure; no member value is at risk |
| Upgrade or roll back a router | `UPGRADER_ROLE` ([contract-upgrades.md](contract-upgrades.md)) | Run `npm run check:storage-layout` first; in-place upgrade, never a redeploy |
| `depositor` observed as anything but the member; a member charged above the disclosed rate; funds resident in either router | **Security incident** — pause the affected router first, then escalate per the security process | These are the three invariants the contracts are built around; any of them failing means a bug or an unexpected implementation |

Nobody needs to be woken to release a stuck bridge. There is no such action.

---

## Cross-refs

- Developer guide: [bridge-and-liquidity.md](../developer-guide/bridge-and-liquidity.md)
- Platform fees: [fee-operations.md](fee-operations.md),
  [platform-fees.md](../developer-guide/platform-fees.md)
- Upgrades: [contract-upgrades.md](contract-upgrades.md)
- Gateway: [relayer-operations.md](relayer-operations.md)
- Control plane tour: [operations-control-plane.md](operations-control-plane.md)
- Role grants and operator onboarding: [operator-onboarding.md](operator-onboarding.md)
- Design and rationale: `specs/067-bridge-pool-liquidity/` (research R2, R3, R8, R10;
  `contracts/admin-and-runtime.md` for the runtime contract table)

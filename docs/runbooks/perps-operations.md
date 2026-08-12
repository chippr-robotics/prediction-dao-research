# Runbook: Perps Operations (spec 083)

Operating the perpetual-futures surface at **Trade → Perps**: the two fee rails (GMX's UI fee on
Arbitrum, the Hyperliquid builder fee on the Polygon `FeeRouter`), the Gains referral, the feature
flag that turns in-app position management on, and what to do when a venue misbehaves.

There is **no FairWins contract in this feature**. Nothing here is deployed, upgraded, paused, or
rescued. Design: `specs/083-perps-position-management/`.

## Read this first — four facts that change what you do

1. **FairWins is never in the position's ownership path.** Both EVM venues assign ownership from
   `msg.sender`, and the member's own wallet is the sender on every call. FairWins holds no member
   funds on any venue, owns no position, and holds no approval. The member can always exit on the
   venue's own app — even if every FairWins service is down. That is structural, not a promise, and
   it is why there is no rescue procedure in this document to go looking for.
2. **Perps fees bill on NOTIONAL — position size = margin × leverage — not on the amount the member
   puts in.** At 10× leverage, 5 bps of notional is about **50 bps of the member's own margin**.
   This is the single most misunderstandable number in the product. Say it in that form every time,
   to members and to each other.
3. **The GMX rate is configured and live on-chain, and no member is being charged today.** Both
   halves are true: `setUiFeeFactor(5e26)` is set on Arbitrum, and in-app perps trading sits behind
   a feature flag that is currently **off**. Do not imply members are paying it now; do not imply it
   will never apply.
4. **Every gate gates opening only.** Screening, the jurisdiction attestation, venue state, and the
   feature flag stand between a member and *creating* exposure. Nothing stands between a member and
   closing, reducing, cancelling, or recovering collateral.

---

## What is deployed / configured today

Two transactions were executed on **2026-08-11**. Nothing else exists: no contract, no proxy, no
deployments record, no storage layout to check.

| Rail | Where the rate lives | Live value | Ceiling | Charged when | Member cost? |
|---|---|---|---|---|---|
| **GMX v2** (Arbitrum 42161) | GMX's own DataStore, `uiFeeFactorKey(receiver)` | **5 bps of notional**, factor `5e26` | `MAX_UI_FEE_FACTOR = 1e27` = **10 bps**, enforced by GMX | by GMX at **order execution**, on **both open and close** | yes — additive, on notional |
| **Hyperliquid** *(deferred)* | Polygon 137 `FeeRouter`, service `perps.hyperliquid.builder` | registered, **rate 0** | **10 bps** (the venue's own perps builder limit, fixed at registration) | per fill, by Hyperliquid | no — not charged, trading not enabled |
| **Gains Network** | not FairWins-priced | venue-paid referral rebate | — | venue-side | **no** — costs the member nothing |

**The two transactions:**

```
Polygon 137    registerService("perps.hyperliquid.builder", cap 10 bps, ConfigOnly)
               0x2ecf8d5f512fb9d43584366da22da1d9027c871d65e9453ad45fbb1c9c6eb747

Arbitrum 42161 ExchangeRouter.setUiFeeFactor(5e26)   → 5 bps of notional
               0x2034f95a10e5ab040bc38f38d9bd393f85f00547ff9b5430b21955d264d772f0
               receiver: 0x52502d049571C7893447b86c4d8B38e6184bF6e1
```

Three things about that state an operator must hold in mind:

- **The Hyperliquid rate is 0 and Hyperliquid is read-only in the product.** The service exists so
  the rate has one authority when HL ships, and because `transfer-roles.js` refuses to renounce
  FeeRouter admin while a known service is unregistered. Nothing is being charged on it. Do not
  describe it as a fee members pay.
- **The GMX receiver is an EOA** — the same deployer address that signs most admin actions. It is
  the receiver *because it sent the transaction* (see below). Moving accrual elsewhere is a new
  transaction from the new address, not a config edit.
- **`PERPS_UI_FEE_RECEIVER` in `frontend/src/config/perps.js` is still `null`.** That is safe — GMX
  early-returns a zero UI fee when `uiFeeReceiver == address(0)`, so an unset receiver is
  structurally fee-free and renders no fee line at all. It is also a **prerequisite for enabling the
  management surface**: with the flag on and the receiver unset, the app would attach no receiver
  and the configured rate would earn nothing. Record the receiver address there before enabling.

**Reconciliation note.** GMX UI-fee revenue never passes through the `FeeRouter` and never appears
in a `FeeCharged` event. Do not look for it in the treasury reconciliation in
[fee-operations.md](fee-operations.md) — it accrues inside GMX to the receiver address and is claimed
from there (procedure 2).

---

## 1. Change the GMX rate

GMX is the one perps rail whose rate is **not** on our `FeeRouter`. It lives in GMX's DataStore and
is applied by GMX inside `getPositionFees` at execution. Registering a `perps.gmx.uifee` service
would be a second config store for a rate we cannot enforce, with an admin control that silently
does nothing — so the authority is GMX, and this script is the way to change it.

```bash
# report only — current factor, GMX's LIVE cap, and what 5 bps means. Sends nothing.
npx hardhat run scripts/ops/set-gmx-ui-fee-factor.js --network arbitrum

# rehearse a change — prints the exact call, sends nothing
BPS=5 DRY_RUN=true npx hardhat run scripts/ops/set-gmx-ui-fee-factor.js --network arbitrum

# set the rate
BPS=5 npx hardhat run scripts/ops/set-gmx-ui-fee-factor.js --network arbitrum
```

`BPS` is basis points **of notional**, not of margin. `RECEIVER` may be set to assert the expected
receiver; it defaults to the signer.

**The cap is read live.** The script reads `MAX_UI_FEE_FACTOR` from the DataStore rather than
assuming 10 bps, because GMX governance can move it, and refuses anything above it locally instead
of paying gas for GMX's `InvalidUiFeeFactor` revert. `BPS=11` is refused today.

### ⚠️ The signer IS the receiver

`setUiFeeFactor` takes `account = msg.sender`. There is **no parameter naming a receiver.** Three
consequences, all of which have to be handled by a human:

1. The address that signs the transaction is the address that accrues. The script refuses to send
   when the signer and the expected/configured receiver disagree — it would otherwise attribute fees
   to an address that never accrues, silently.
2. **Changing the receiver means a different address sends a new `setUiFeeFactor`.** You cannot
   reassign it from the current one.
3. **The old receiver keeps whatever it already accrued.** Setting a factor on a new address does
   not move, forfeit, or migrate the old address's balance; only that address can claim it
   (procedure 2). Never retire a receiver key before its balance is claimed.

**Verify after a change:**

- the script's own post-check prints `verified factor now <factor> (<bps> bps)` and throws if the
  DataStore disagrees;
- re-run the report-only command and confirm the factor and receiver;
- with the management surface on, open a GMX position sheet and confirm the disclosed fee line
  matches — and that it appears on **both** the open and the close sheet, because GMX charges on
  both sides;
- setting **0** must produce no fee line anywhere, and behaviour identical to a fee-free
  integration. That is the emergency-zero for this rail.

If the script is unavailable, the same read from a console:

```bash
npx hardhat console --network arbitrum
> const abi = ethers.AbiCoder.defaultAbiCoder()
> const UI_FEE_FACTOR = ethers.keccak256(abi.encode(['string'], ['UI_FEE_FACTOR']))
> const key = a => ethers.keccak256(abi.encode(['bytes32','address'], [UI_FEE_FACTOR, a]))
> const ds = await ethers.getContractAt(
    ['function getUint(bytes32) view returns (uint256)'],
    '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8')
> await ds.getUint(key('0x52502d049571C7893447b86c4d8B38e6184bF6e1'))
# 500000000000000000000000000n  == 5e26 == 5 bps
```

---

## 2. Claim GMX revenue

`claimUiFees(address[] markets, address[] tokens, address receiver)` on GMX's ExchangeRouter
(`0x7dE39FF2e232A2203196788d37e234cF8F1b83f1`) is **also `msg.sender`-keyed**: it pays out what
`msg.sender` accrued. So:

- **Only the receiver can claim.** No admin, no multisig, and no FairWins contract can claim on its
  behalf. The current receiver is the EOA `0x52502d049571C7893447b86c4d8B38e6184bF6e1`, so the claim
  is signed by that key.
- The only value FairWins can strand here is **its own**. There is no member money in this path.
- GMX credits UI fees per market and per fee token, so a claim names both. Build the lists from the
  markets FairWins-attributed orders actually traded. Do not report revenue from a claim you did not
  watch land — verify the receiver's token balance changed in the same transaction.
- There is deliberately **no ops script** for claiming: it is an infrequent, key-holder action, and a
  script would imply an automation that does not exist. Use a hardhat console from the receiver key.

**Moving accrual to the treasury** is procedure 1 run from the treasury address: the treasury sends
its own `setUiFeeFactor`, and `PERPS_UI_FEE_RECEIVER` in `frontend/src/config/perps.js` is updated to
that address in the same change. The EOA's already-accrued balance still has to be claimed by the
EOA afterwards — that is the whole reason to sequence it deliberately rather than as a config bump.

---

## 3. Change the Hyperliquid rate

The one perps rate FairWins prices itself. It lives on the **Polygon 137 `FeeRouter`** as
`perps.hyperliquid.builder`.

1. Operations control plane → **Fees** (as a `FEE_ADMIN_ROLE` holder), connected to Polygon.
2. Set the rate for **Perps — Hyperliquid builder fee**, in basis points.
3. **The cap is 10 bps**, fixed at registration because it is *Hyperliquid's own* limit on perps
   builder fees — the venue rejects any order above it, so a higher stored rate could only ever be a
   lie. The contract refuses above-cap rates (`CapExceeded`).

**It does nothing today.** Hyperliquid is read-only in the product: positions are visible, and
management happens on the venue. Setting a non-zero rate changes no member's cost until Hyperliquid
trading is enabled — and the rate must be re-reviewed at that point, not inherited silently. A rate
of **0** shows no fee line and is byte-identical to a fee-free integration.

Everything else about this rail behaves exactly as any other `FeeRouter` service: history is
`FeeBpsChanged`, emergency-zero is a rate of 0, and the procedures in
[fee-operations.md](fee-operations.md) apply unchanged.

---

## 4. The Gains referral

Gains pays a **referral rebate out of its own fee**. It costs the member nothing and never changes
their price. It also **earns nothing until Gains whitelists the FairWins referrer address, and it
fails silently until then** — the on-chain call is idempotent and never reverts, so a
not-yet-whitelisted referrer is indistinguishable from a working one by looking at transactions.

**The rule: no revenue may be claimed from Gains anywhere in product copy, marketing, or a revenue
report until whitelisting is confirmed and a rebate has been observed.** Silence is the correct
state; a claim we cannot verify is worse than no claim.

1. **Apply.** Request referral whitelisting from Gains Network through their team/governance
   channels, naming the exact FairWins referrer address that is (or will be) configured as
   `PERPS_GAINS_REFERRER` on the gateway. Record the request date and the address in the ops log.
2. **Configure.** Set `PERPS_GAINS_REFERRER` to that address and redeploy the gateway (the gateway
   is not redeployed by merging to main — see [relayer-operations.md](relayer-operations.md)).
   Attribution is total: with it unset the app emits plain venue links, never a broken one.
3. **Verify it took effect.** Whitelisting is a venue-side state change with no notification, so
   verify by outcome, not by assumption:
   - read the referrer's record from the Gains diamond for that address and confirm it is **active**
     (an inactive referrer is the silent-failure case);
   - place one small attributed trade and confirm the referrer address's accrued rebate **moves**;
   - only after that second check may copy, dashboards, or reports mention Gains revenue.
4. **Re-verify after any venue change.** The failure mode is silent in both directions: a referrer
   can stop being active without anything in the product changing. Treat a rebate that stops
   accruing as a whitelisting question first, not a bug in our code.

---

## 5. Enable / disable the management surface

The whole of in-app perps management — open, close, reduce, protect, recover — is behind one flag,
**default off**:

```
VITE_PERPS_MANAGE_ENABLED=true      # build-time, read by perpsManageFeatureEnabled()
```

With it off, Perps is exactly the spec-082 read-only surface: market data plus positions, with
"manage on the venue" link-outs. **No management control renders at all** — a disabled button would
be the dishonest outcome.

**Today the flag has nothing to turn on.** The management surface is still being built — the
foundation modules have landed, the sheets have not
(`specs/083-perps-position-management/tasks.md` is the record). Setting the flag before the
surface exists changes nothing a member can see, and is not a shortcut to shipping it.

### Hard prerequisites before it goes on for members

1. **The Terms and the Risk Disclosure must name leveraged derivatives / perpetual futures.** This
   is a gate, not a follow-up: `frontend/src/legal/` contained **zero** occurrences of
   `leverage|derivativ|perpetual` when the feature was specified. That text has since landed —
   Terms §3 (definitions of Trading Venue, Perpetual Future, Leveraged Derivative, Notional,
   Position), §4.3 (how the Service is funded), §4.4, §10 (Third-Party Trading Venues and
   Leveraged Products) and Schedule A; Risk Disclosure §6. Verify it for yourself before flipping
   the flag rather than trusting this line:

   ```bash
   grep -rniE 'leverage|derivativ|perpetual' frontend/src/legal/ | head
   ```

   Do not enable execution of a leveraged product the legal text does not describe.
2. **`PERPS_UI_FEE_RECEIVER` records the receiver that actually sent `setUiFeeFactor`** — today
   `0x52502d049571C7893447b86c4d8B38e6184bF6e1`. Unset means structurally fee-free (fine, but the
   configured rate earns nothing); *wrong* means the app attaches a receiver that never accrues.
3. **The fee disclosure reads correctly on both sides.** Open a GMX sheet and a close sheet and
   confirm each shows the fee, states that it is charged on **notional (size), not on the amount you
   put in**, and shows the money amount for that position. A cancelled or unfilled order must state
   plainly that **no FairWins fee was charged** — under this design GMX computes the fee at
   execution, so none was.

### Turning it off

Turning the flag off returns the surface to read-only. Be honest about what that does and does not
mean:

- It **cannot** trap a position. Every position is owned by the member's own account on the venue,
  and the venue's own app closes it. The read-only surface keeps the link there.
- It **does** remove the in-app close control, so it is not a free action while members hold
  positions opened through FairWins. Prefer the narrower measure where one exists (a single venue
  going close-only, a specific pair) and, if you do flip it, say where positions are managed instead.
- It is a **build-time** value: flipping it means a rebuild and redeploy of the SPA, not a runtime
  toggle. Plan for that in an incident rather than discovering it.

### The gateway switches are a different thing

`PERPS_ENABLED=false` or `PERPS_KILLSWITCH=true` on the relay-gateway stop the **read proxy** —
market data and the position list. They do not touch anyone's positions, cannot prevent a member
acting on a venue, and are the right lever when a venue's API is the problem rather than the venue
itself. Members see an honest unavailable state; wagers, pools, and transfers are untouched.

---

## 6. Incident playbook

**The rule that governs all of it: exits are never gated by any FairWins switch.** No flag, no
killswitch, no screening result, and no gateway outage can stand between a member and closing,
reducing, cancelling, or recovering. If an incident response appears to require one, the response is
wrong.

### 6.1 A venue is in close-only or paused mode

Gains publishes its own state (`getTradingActivated()` → `ACTIVATED | CLOSE_ONLY | PAUSED`), read
live per chain.

| Venue state | What the app must do | What you tell members |
|---|---|---|
| `CLOSE_ONLY` | Opening disabled on that venue, **with the venue named as the source**; closing and reducing stay fully available | "Gains is only accepting closes right now. You can close or reduce, not open." |
| `PAUSED` | Opening disabled; the venue itself also refuses closes | The venue is paused — name it, and say plainly that this is the venue's state, not ours. There is **no FairWins action that changes it** |
| GMX unavailable for a market | That market is not offered; other markets and Gains are unaffected | Name GMX, point at the venue's own app |

Do not work around a venue restriction, and do not present a venue's block as ours. If someone asks
you to "unpause Gains", the honest answer is that there is nothing on our side that is paused.

### 6.2 A venue's data source is unreachable

Per-venue isolation is the design: one venue failing never blanks the others.

1. `curl -s $GATEWAY/status | jq .perps` — the block names each venue's state.
2. Check the venue's own URL config (`PERPS_GAINS_URL_*`, `PERPS_GMX_URL`, `PERPS_HL_URL`) and the
   venue's own status page. Most of the time this is the venue, not us.
3. Expected member-facing behaviour: the failing venue is **named as unreadable**, its pairs and
   positions are **omitted rather than shown stale or as zeros**, and the member is pointed at the
   venue's own app. Other venues keep working.

**Never let anyone read an unreadable venue as "your position is gone."** A read outage is a
statement about our view, not about the member's position, which is held by the venue and unaffected.
Cached values older than 10× the TTL degrade rather than serve as live.

### 6.3 A member reports a stuck order

First establish which venue, because the two failure shapes are different and the recovery controls
are different. In both cases the recovery is **owner-gated on the venue** — only the member's own
account can call it. An operator cannot do it for them and must never promise to.

**Gains — a market order the keeper never executed (`timed_out`).**

- The order sits past `getMarketOrdersTimeoutBlocks()` (measured 200 on Arbitrum, 30 on Polygon and
  Base, ≈60 s) with no `MarketExecuted` and no `MarketOpenCanceled`.
- The recovery is `cancelOrderAfterTimeout`, surfaced in the app as a named control on the pending
  order, returning the collateral (`CollateralReturnedAfterTimeout`).
- Before the timeout it reverts `WaitTimeout()` — that is normal, not a failure. `NoOrder()` means it
  already resolved.
- ⚠️ It takes the **pending-order index**, which is a different index space from the trade index used
  by close/protect calls. If a member reports the control acting on the wrong position, that is a
  code-level index-space bug and an escalation, not an operational retry.

**GMX — a frozen trigger order (`frozen`).**

- Market orders **cancel** on failed execution and return collateral to the member automatically.
  Limit/stop orders **freeze** and stay frozen; nothing auto-clears them (`REQUEST_EXPIRATION_TIME`
  does not free a frozen order).
- The resolution is `cancelOrder(key)` or `updateOrder(...)`, surfaced as "needs your attention" with
  the cancel control named. `ExchangeRouter.cancelOrder` reverts unless `order.account() ==
  msg.sender` — so only the member can, and **always** can.

**What to tell the member, either way:** their collateral is not lost and FairWins does not hold it —
FairWins never held it. The control that returns it is theirs to use and is never gated by screening,
jurisdiction, a killswitch, or a feature flag. If the app is not showing it, that is a bug worth
escalating; the venue's own app also offers it.

### 6.4 A fee looks wrong

Treat any of these as an incident:

- a member charged more than the confirm screen disclosed;
- a fee line on a **cancelled or unfilled** order (under this design GMX computes the fee at
  execution, so there should be none);
- a fee shown where the rate is zero, or no fee shown where it is non-zero.

Response: emergency-zero the affected rail — `BPS=0` via the GMX script, or rate 0 in the Fees tab
for Hyperliquid — capture the transaction hashes and the disclosed rate, and escalate per the
security process. Zeroing GMX's factor is structurally safe: GMX's own early return at a zero
receiver/factor is the same no-fee path the integration ships at rest.

---

## 7. Verification commands

Paste-able, in the order an operator usually wants them. The first two send nothing.

```bash
# 1. GMX rail — current factor, live cap, receiver. Report only.
npx hardhat run scripts/ops/set-gmx-ui-fee-factor.js --network arbitrum

# 2. FeeRouter services on Polygon, including perps.hyperliquid.builder. Report only.
npx hardhat run scripts/ops/register-fee-service.js --network polygon
#    expect: perps.hyperliquid.builder  cap 10 bps, ConfigOnly, rate 0

# 3. Rehearse a GMX rate change (prints the exact call, sends nothing)
BPS=5 DRY_RUN=true npx hardhat run scripts/ops/set-gmx-ui-fee-factor.js --network arbitrum

# 4. Rehearse a service registration (only if one is ever missing)
SERVICE=perps.hyperliquid.builder DRY_RUN=true \
  npx hardhat run scripts/ops/register-fee-service.js --network polygon

# 5. Gateway read proxy — per-venue health
curl -s "$GATEWAY/status" | jq .perps

# 6. The two transactions of 2026-08-11, for the record
#    Polygon   0x2ecf8d5f512fb9d43584366da22da1d9027c871d65e9453ad45fbb1c9c6eb747
#    Arbitrum  0x2034f95a10e5ab040bc38f38d9bd393f85f00547ff9b5430b21955d264d772f0
```

Sanity checks that belong with them:

- `MAX_UI_FEE_FACTOR` reads `1000000000000000000000000000` (1e27 = 10 bps). If GMX has moved it, the
  script's cap check moves with it — never re-derive 10 bps from this document.
- The current factor reads `500000000000000000000000000` (5e26 = 5 bps) for
  `0x52502d049571C7893447b86c4d8B38e6184bF6e1`, and `0` for every other address.
- The Fees tab lists `perps.hyperliquid.builder` at **0 bps / cap 10 / ConfigOnly** on Polygon. A
  `kind` of `0` means unregistered and `quoteFee` would revert `ServiceUnknown`.

---

## 8. Escalation

| Need | Who | Why it has to be them |
|---|---|---|
| Change or zero the **GMX** rate | The **receiver key** — `setUiFeeFactor` credits `msg.sender`, so only that address sets its own factor | No role, no multisig, and no contract can set it on the receiver's behalf |
| **Claim** GMX revenue | The receiver key, again | `claimUiFees` is `msg.sender`-keyed |
| Change or zero the **Hyperliquid** rate | `FEE_ADMIN_ROLE` on the Polygon FeeRouter ([fee-operations.md](fee-operations.md)) | Not editable from the perps surfaces |
| Register a missing fee service | FeeRouter `DEFAULT_ADMIN_ROLE` | One-shot per id; see `scripts/ops/register-fee-service.js` |
| Turn the management surface on or off | Whoever can build and deploy the SPA | Build-time flag, not a runtime toggle |
| Stop the perps **read** proxy | Gateway operator ([relayer-operations.md](relayer-operations.md)) | Optional infrastructure; no member value is at risk |
| Gains whitelisting not confirmed / rebate stopped | Whoever owns the venue relationship | It is a venue-side state; nothing in our code changes it, and it fails silently |
| A FairWins address in any ownership field; a member charged above the disclosed rate; a fee on a cancelled order; a recovery control acting on the wrong position | **Security incident** — zero the affected rail first, then escalate per the security process | These are the invariants the design is built around; any of them failing means a bug, not a config |

Nobody needs to be woken to release a stuck position or a stuck order. There is no such action — the
member holds it, and the control is theirs.

---

## Cross-refs

- Developer guide: [perps.md](../developer-guide/perps.md)
- Platform fees: [fee-operations.md](fee-operations.md),
  [platform-fees.md](../developer-guide/platform-fees.md)
- Gateway: [relayer-operations.md](relayer-operations.md)
- Control plane tour: [operations-control-plane.md](operations-control-plane.md)
- Design and rationale: `specs/083-perps-position-management/` — `research.md` (D1–D14),
  `contracts/fee-rails.md` (units, ceilings, disclosure rules),
  `contracts/order-state-machine.md` (what may never be claimed),
  `contracts/venue-calldata.md` (the index trap, the approval trap)

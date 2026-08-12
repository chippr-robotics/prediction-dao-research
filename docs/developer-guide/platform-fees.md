# Platform Fees (FeeRouter)

Spec 060. **On integrations**, FairWins earns three ways — the other two parts of the picture are
membership fees and the surfaces that charge nothing at all (wagers, pools, sending money). The
whole five-way statement, in member language, is `docs/user-guide/platform-fees.md`.

1. **Venue-paid attribution** where the external service pays FairWins out of *its own* fee, so
   the member's price never changes — the OpenSea referral (specs 055/056), GMX's referral tier
   (spec 083, which also *discounts* the referred trader), and the Gains Network referral rebate
   (spec 083). The Gains rebate **earns nothing until Gains whitelists the FairWins referrer and
   fails silently until then — claim no Gains revenue anywhere.**
2. **Venue-collected fees on member volume**, where the venue charges the member and credits
   FairWins — the Polymarket builder-code fee (spec 057) and the GMX v2 UI fee (spec 083). These
   are real, additive member costs and are disclosed as their own line. The GMX rate is configured
   on-chain but **not being charged today**: in-app perps trading is behind a feature flag that is
   off.
3. **The platform fee wrapper** for services with no revenue-share program — Morpho lending
   (Earn), Lido and Polygon liquid staking, and the spec-067 bridge/liquidity routers. FairWins
   charges its own small fee, in basis points of the principal, **at entry only**.

The **`FeeRouter`** contract (`contracts/fees/FeeRouter.sol`, UUPS proxy, deployment keys
`feeRouter` / `feeRouterImpl`) is the single on-chain source of truth for every configurable rate
**FairWins actually sets**, and the atomic charging wrapper for wrapped services. Spec 083 adds the
one case where the rate is *not* ours: GMX enforces its own UI fee from its own DataStore, so that
is where the rate lives and where the admin control points. See
[Perps: when the rate is not ours to set](#perps-when-the-rate-is-not-ours-to-set).

## Architecture

```
AdminPanel "Fees" tab ──setFeeBps/setTreasury (wallet tx)──▶ FeeRouter (per network)
                                                              │  ▲
Earn VaultSheet ──quote (eth_call feeBps/getService)──────────┘  │
Earn deposit ──approve(router) + depositToVaultWithFee──▶ router ─┼─ fee ──▶ treasury
                                                                  └─ net ──▶ ERC-4626 vault (receiver = member)
relay-gateway /fee-rate ──cached eth_call (30 s TTL)──▶ FeeRouter@Polygon
                          (polymarket.taker/.maker, perps.hyperliquid.builder)
Predict TradeConfirm ──fetchFeeRate──▶ /fee-rate (source: "chain" | "env-fallback")

Perps sheets ──quote (eth_call uiFeeFactor)──────▶ GMX DataStore@Arbitrum   GMX's rate, GMX's cap
Perps admin ──setUiFeeFactor (wallet tx)─────────▶ GMX ExchangeRouter@Arbitrum  (NOT the FeeRouter)
```

- **Service registry.** Each fee is a `bytes32 serviceId = keccak256("<label>")` with a
  `Service { capBps, feeBps, kind }`. `kind` is `Wrapped` (chargeable through the router) or
  `ConfigOnly` (a stored rate that off-chain enforcers read — the Polymarket entries and
  `perps.hyperliquid.builder`).
- **Caps.** Wrapped caps are fixed at registration and bounded by `MAX_WRAPPED_FEE_BPS = 250`
  (2.5%). `ConfigOnly` entries carry the external venue's own limit instead: the Polymarket
  spec-057 caps (100 taker / 50 maker) and Hyperliquid's 10 bps perps builder-fee limit.
  `setFeeBps` enforces `bps <= capBps` and the charge path re-checks it.
- **Roles.** `FEE_ADMIN_ROLE` changes rates; `DEFAULT_ADMIN_ROLE` registers services and sets the
  treasury; `UPGRADER_ROLE` (from `UUPSManaged`) upgrades. The AdminPanel gates the Fees tab on
  `FEE_ADMIN` or `ADMIN`, but enforcement is always the contract.
- **Atomic charging.** `depositToVaultWithFee(serviceId, vault, assets, receiver, maxFeeBps)`
  pulls the member's principal, sends `floor(assets · bps / 10 000)` to the treasury, and deposits
  the remainder into the ERC-4626 vault for the member — one transaction; any failing leg reverts
  everything, so the treasury never keeps a fee for a deposit that did not happen. The router
  holds no balance outside a transaction.
- **Consent ceiling.** The frontend passes the **quoted** bps as `maxFeeBps`; if an admin raises
  the rate while the member's action is in flight, the call reverts `FeeAboveQuoted()` instead of
  overcharging. Never call the router with a `maxFeeBps` you did not display.
- **Rounding.** Fee math floors (member's favor); a fee that rounds to zero in the asset's
  smallest unit is charged as zero.
- **Missing treasury.** `treasury == address(0)` skips the fee (full deposit, event
  `FeeSkippedNoTreasury`) — an ops misconfiguration must never strand or lose member funds.
- **Unsupported assets.** Fee-on-transfer / rebasing tokens are not supported by the wrapper; the
  curated vault assets (USDC et al.) are plain ERC-20s.
- **Audit trail.** `FeeBpsChanged(serviceId, oldBps, newBps, actor)` is the change history the
  Fees tab renders; `FeeCharged` is the reconciliation record (its `feeAmount` equals the ERC-20
  transfer to the treasury in the same tx).

### The services, and who owns each rate

| Service / rate | Kind | Cap | Rate today | Authority (read here) | Charged on |
|---|---|---|---|---|---|
| `earn.lend` | Wrapped | 250 bps | 50 bps | FeeRouter | capital deposited, entry only |
| `stake.lido` | Wrapped | 250 bps | 50 bps | FeeRouter | capital deposited, entry only |
| `stake.polygon` | Wrapped | 250 bps | 50 bps | FeeRouter | capital deposited, entry only |
| `bridge.transfer` | Wrapped | 250 bps | 50 bps | FeeRouter | capital bridged, entry only |
| `liquidity.deposit` | Wrapped | 250 bps | 50 bps | FeeRouter | capital supplied, entry only |
| `polymarket.taker` | ConfigOnly | 100 bps | 50 bps | FeeRouter (gateway reads) | notional traded |
| `polymarket.maker` | ConfigOnly | 50 bps | 0 bps | FeeRouter (gateway reads) | notional traded |
| `perps.hyperliquid.builder` | ConfigOnly | 10 bps | **0 bps** | FeeRouter (gateway reads) | order notional — *not charged; HL trading is not enabled* |
| GMX v2 UI fee — **no service** | — | 10 bps (`MAX_UI_FEE_FACTOR`) | 5 bps | **GMX's DataStore on Arbitrum** | notional, on **open and close** — *configured, not charged: perps trading is flagged off* |
| Gains referral — **no service** | — | — | venue-paid, **earns nothing until Gains whitelists us** | Gains Network | nothing — the member's price is unchanged |

The wrapped services and `polymarket.*` are live at the rates above on **Polygon 137**; the same
services are registered on **Arbitrum and Base at 0 bps**. A rate of 0 means no fee line and
byte-identical fee-free behaviour, so the zero rows above cost members nothing today. The GMX row
is the one non-zero rate nobody is paying: the factor is set on Arbitrum, and the surface that
would apply it is behind `VITE_PERPS_MANAGE_ENABLED`, default off.

## Member disclosure rules

Every fee-bearing confirm step shows a named **"FairWins platform fee"** line — live rate
(percent), absolute amount, and the net amount reaching the service — with an info bubble, before
any signature. A zero rate shows **no fee line**. If the live rate cannot be read on a network
that has a router, the surface **blocks the action** (never proceeds on a possibly understated
rate). See `frontend/src/lib/fees/feeQuote.js` and the Earn `VaultSheet` for the reference
implementation, and Predict's `TradeConfirm` for the builder-fee line.

## Gateway read path (Polymarket bps, and `perps.hyperliquid.builder`)

`services/relay-gateway/src/fees/onchain.js` reads `feeBps(polymarket.taker/.maker)` through the
gateway's failover providers, cached `FEE_ROUTER_CACHE_TTL_MS` (default 30 s), clamped to the
spec-057 caps. `/v1/polymarket/:chainId/fee-rate` serves the result with
`source: "chain" | "env-fallback"`; the env vars `POLYMARKET_BUILDER_*_FEE_BPS` are the fallback
when the router is unset or unreachable. `GET /status` exposes a `fees` summary block. The
gateway stays stateless: no admin API, no persistence — an admin edits on-chain and the gateway
follows.

`perps.hyperliquid.builder` rides the same reader and the same cache, clamped to its 10 bps cap,
with `PERPS_HL_BUILDER_FEE_BPS` as the env fallback (boot fails loudly above the cap). GMX's rate
is **not** read here — it is an Arbitrum DataStore read the client makes directly.

Gateway env: `FEE_ROUTER_ADDRESS` (defaults to the deployment record's `feeRouter`; a
contradicting override fails boot), `FEE_ROUTER_CHAIN_ID` (default 137),
`FEE_ROUTER_CACHE_TTL_MS` (default 30000).

## Perps: when the rate is not ours to set

Spec 083. Perps is the first integration where **the FeeRouter is not the authority for every
rate**, and the shape of the fee is different from every other service.

**Perps fees bill on NOTIONAL — position size, which is margin × leverage — not on the amount the
member puts in.** At 10× leverage, 5 bps of notional is about **50 bps of the member's own
margin**. That is the single most misunderstandable number in the product: every surface, every
doc and every admin control that shows a perps rate must name the base. Both venues charge on
**open and close**, so a round trip is twice the number shown.

The venue computes the fee **at order execution**, not at submission, so a cancelled, frozen or
unfilled order pays **nothing** — and the UI says so rather than staying silent.

### `perps.hyperliquid.builder` — a FeeRouter service, at zero

A `ConfigOnly` service, **cap 10 bps** (Hyperliquid's own limit on perps builder fees, not our
250 bps wrapped ceiling), **rate 0**, registered on **Polygon 137** in tx
`0x2ecf8d5f512fb9d43584366da22da1d9027c871d65e9453ad45fbb1c9c6eb747`. It is in
`scripts/deploy/lib/feeServices.js`'s launch table and read by the gateway through
`services/relay-gateway/src/fees/onchain.js`, exactly like the Polymarket entries.

Registering it while the rate is 0 is deliberate: registration is one-shot and `quoteFee` reverts
`ServiceUnknown` for an unknown id, and `transfer-roles.js` refuses to renounce FeeRouter admin
while a known service is unregistered — so the entry exists before the handoff, not after.
**Hyperliquid trading is not enabled and nothing is charged**; claim no Hyperliquid revenue.

### GMX's `uiFeeReceiver` — the authority is GMX, and there is deliberately no service

GMX v2 stores FairWins' rate in **GMX's own DataStore on Arbitrum** under
`uiFeeFactorKey(<receiver>)` and applies it itself, inside `getPositionFees`, at execution.

- **Live factor**: `5e26` = **5 bps**, receiver `0x52502d049571C7893447b86c4d8B38e6184bF6e1`, set in
  tx `0x2034f95a10e5ab040bc38f38d9bd393f85f00547ff9b5430b21955d264d772f0` (Arbitrum).
- **Ceiling**: `MAX_UI_FEE_FACTOR = 1e27` = **10 bps**, enforced by GMX and **read live** from the
  DataStore rather than assumed.
- **Set by** `ExchangeRouter.setUiFeeFactor(uint256)`, which keys on `account = msg.sender` —
  permissionless self-registration, and *the sending address IS the receiver*. Operator path:
  `scripts/ops/set-gmx-ui-fee-factor.js` (report-only by default; refuses to send when the signer
  and the configured receiver disagree).

**There is no `perps.gmx.uifee` FeeRouter service, and adding one would be a bug.** It would create
a second config store for a rate FairWins cannot enforce, and put a settable control in the Fees
tab that silently does nothing — the rate GMX applies would keep coming from GMX. The rule from
spec 071 applies: authority is read from the contract that will act on it.

GMX also gives the fee a structural zero: `uiFeeReceiver == address(0)` early-returns a zero UI
fee, so an unset receiver is fee-free by construction, not by a client-side check.

In-app perps trading is behind a feature flag (`VITE_PERPS_MANAGE_ENABLED`, **default off**), so
the configured rate is live on-chain but **no member is being charged it today**. It is not
hypothetical either — it applies the moment the flag is on.

### Gains — venue-paid, and no revenue claimed

Gains Network pays a referral rebate out of **its own** fee; the referred member's price is
unchanged and may even be discounted. There is **no FairWins service**, because a service entry
would render a fee line where no member cost exists. The rebate **earns nothing until Gains
whitelists the FairWins referrer address, and it fails silently until then** — so **claim no
revenue from Gains anywhere**, in copy, admin surfaces or reporting, until it is confirmed
on-chain.

### Unit conversion — one module

Four units, one home: **`frontend/src/lib/perps/feeUnits.js`**, unit-tested in both directions at
the venue ceilings. A single missing ×10 here is a 10× overcharge the venue would happily enforce.

| From | To | Conversion | Guard |
|---|---|---|---|
| bps | GMX `uiFeeFactor` | `bps × 1e26` (5 bps = `5e26`, 10 bps = `1e27`) | ≤ `1e27` |
| GMX `uiFeeFactor` | bps | `factor / 1e26` | — |
| bps | Hyperliquid `f` | `bps × 10` (tenths of a bp) | ≤ 100 |
| bps | Hyperliquid `maxFeeRate` | `"<bps/100>%"` — **the `%` is required** (5 bps → `"0.05%"`) | ≤ `"0.1%"` |
| notional + bps | money | `notional × bps / 10 000`, floored | member's favour |

Disclosure follows the same rules as everything else here — named line before any signature, zero
rate ⇒ no line — with two perps-specific additions: the line **states the base** (notional, with
the money amount for this position), and **an unreadable rate blocks opening but never blocks
closing, reducing or recovering**. Full rules:
[`specs/083-perps-position-management/contracts/fee-rails.md`](../../specs/083-perps-position-management/contracts/fee-rails.md).

## Registering a new service (e.g. Lido, Polygon LST, Uniswap)

**First, decide whether a service belongs at all.** Spec 083 establishes the rule:

> **Register a FeeRouter service only for a rate FairWins can actually enforce. Otherwise read the
> contract that enforces it.**

Three cases, in order of how often they are got wrong:

- The rate is applied by **FairWins' own code or contracts** (wrapped deposits, and off-chain
  enforcers we control such as the Polymarket order builder) ⇒ **register a service.** Wrapped or
  `ConfigOnly` as appropriate.
- The rate is applied by an **external venue from its own storage** (GMX's `uiFeeFactor`) ⇒ **do
  not register.** Read the venue's contract for disclosure, and point the admin control at the
  venue's setter. A FeeRouter entry here is a second config store plus an admin control that
  silently does nothing — the same failure `feeQuote.js` documents for bridge-LP.
- The venue pays FairWins out of **its own** fee, at no cost to the member (OpenSea, Gains) ⇒ **do
  not register.** A service entry would render a fee line where there is no member cost.

If the answer is "register", the fee system itself needs **no code change**. Steps:

1. **Pick the label** — a stable, lowercase, dot-separated id, e.g. `stake.lido`. The service id
   is `keccak256(label)` (`ethers.id(label)`).
2. **Register on-chain** (DEFAULT_ADMIN, per network):
   ```js
   await feeRouter.registerService(ethers.id('stake.lido'), capBps, 1 /* Wrapped */)
   ```
   `capBps <= 250` for wrapped services; a `ConfigOnly` entry takes the **external venue's own
   limit** instead (Polymarket 100/50, Hyperliquid 10 — never a looser number than the venue
   enforces). Registration is one-shot; the cap is fixed for the entry's life. Add the
   registration to `scripts/deploy/deploy-fee-router.js`'s `LAUNCH_SERVICES` for fresh networks,
   and use `scripts/ops/register-fee-service.js` for a router that is already deployed.
3. **Add the friendly label** to `KNOWN_SERVICES` in
   `frontend/src/components/admin/FeesTab.jsx` (unknown ids still render, as truncated hashes)
   and, if the surface quotes it, a constant in `frontend/src/lib/fees/feeQuote.js`
   (`FEE_SERVICES`).
4. **Wire the member surface**:
   - quote with `fetchFeeQuote({ serviceId, chainId, provider })` — handle the three outcomes
     (unavailable ⇒ fee-free, available ⇒ disclose, throw ⇒ block);
   - for an ERC-4626-shaped deposit, reuse `depositToVaultWithFee` exactly as Earn does
     (`frontend/src/lib/earn/vaultActions.js`);
   - for a differently-shaped action (staking, swaps), add a purpose-built wrapped entrypoint to
     the FeeRouter **in that feature's spec** — keep the same fee accounting, events, cap
     re-check, `maxFeeBps` consent ceiling, and CEI/nonReentrant discipline; storage is
     append-only (functions may be added in an in-place upgrade without storage changes).
   - disclose per the rules above (named line + info bubble, zero ⇒ no line).
5. **Set the rate** from the Fees tab (starts at 0 — nothing is charged until an operator acts).
6. **Test**: extend `test/feeRouter.test.js` if you added an entrypoint; add UI tests for the
   disclosure line; `npm run check:storage-layout` must stay green.

## Deployment

```bash
npx hardhat run scripts/deploy/deploy-fee-router.js --network <net>   # appends feeRouter keys
npm run sync:frontend-contracts                                        # frontend reads the address
# gateway: set FEE_ROUTER_ADDRESS (or redeploy so the pinned record carries feeRouter)
```

Upgrades follow the standard UUPS runbook (`docs/runbooks/contract-upgrades.md`);
`check:storage-layout` gates CI.

## Related

- Operations: [`docs/runbooks/fee-operations.md`](../runbooks/fee-operations.md); perps rails in
  [`docs/runbooks/perps-operations.md`](../runbooks/perps-operations.md)
- Member-facing: `docs/user-guide/platform-fees.md`
- Perps rails: [`developer-guide/perps.md`](perps.md) and
  `specs/083-perps-position-management/contracts/fee-rails.md`
- Ops scripts: `scripts/ops/register-fee-service.js` (FeeRouter services),
  `scripts/ops/set-gmx-ui-fee-factor.js` (GMX's own rate)
- Specs: `specs/060-platform-fee-wrapper/` (design), 050 (Earn), 056 (OpenSea referral),
  057 (Polymarket builder fee), 067 (bridge + liquidity), 083 (perps rails)

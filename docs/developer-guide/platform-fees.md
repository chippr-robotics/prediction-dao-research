# Platform Fees (FeeRouter)

Spec 060. FairWins earns revenue on integrations two ways:

1. **Native attribution programs** where the external service pays FairWins out of its own
   economics — the OpenSea referral (specs 055/056, no member cost) and the Polymarket
   builder-code fee (spec 057, a real, disclosed taker cost).
2. **The platform fee wrapper** for services with no revenue-share program — Morpho lending
   (Earn) today; Lido, Polygon liquid staking, Uniswap and other integrations later. FairWins
   charges its own small fee, in basis points of the principal, **at entry only**.

The **`FeeRouter`** contract (`contracts/fees/FeeRouter.sol`, UUPS proxy, deployment keys
`feeRouter` / `feeRouterImpl`) unifies both: it is the single on-chain source of truth for every
configurable fee rate, and the atomic charging wrapper for wrapped services.

## Architecture

```
AdminPanel "Fees" tab ──setFeeBps/setTreasury (wallet tx)──▶ FeeRouter (per network)
                                                              │  ▲
Earn VaultSheet ──quote (eth_call feeBps/getService)──────────┘  │
Earn deposit ──approve(router) + depositToVaultWithFee──▶ router ─┼─ fee ──▶ treasury
                                                                  └─ net ──▶ ERC-4626 vault (receiver = member)
relay-gateway /fee-rate ──cached eth_call (30 s TTL)──▶ FeeRouter@Polygon (polymarket.taker/.maker)
Predict TradeConfirm ──fetchFeeRate──▶ /fee-rate (source: "chain" | "env-fallback")
```

- **Service registry.** Each fee is a `bytes32 serviceId = keccak256("<label>")` with a
  `Service { capBps, feeBps, kind }`. `kind` is `Wrapped` (chargeable through the router) or
  `ConfigOnly` (a stored rate that off-chain enforcers read — the Polymarket entries).
- **Caps.** Wrapped caps are fixed at registration and bounded by `MAX_WRAPPED_FEE_BPS = 250`
  (2.5%). The Polymarket entries carry their spec-057 caps (100 taker / 50 maker). `setFeeBps`
  enforces `bps <= capBps` and the charge path re-checks it.
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

## Member disclosure rules

Every fee-bearing confirm step shows a named **"FairWins platform fee"** line — live rate
(percent), absolute amount, and the net amount reaching the service — with an info bubble, before
any signature. A zero rate shows **no fee line**. If the live rate cannot be read on a network
that has a router, the surface **blocks the action** (never proceeds on a possibly understated
rate). See `frontend/src/lib/fees/feeQuote.js` and the Earn `VaultSheet` for the reference
implementation, and Predict's `TradeConfirm` for the builder-fee line.

## Gateway read path (Polymarket bps)

`services/relay-gateway/src/fees/onchain.js` reads `feeBps(polymarket.taker/.maker)` through the
gateway's failover providers, cached `FEE_ROUTER_CACHE_TTL_MS` (default 30 s), clamped to the
spec-057 caps. `/v1/polymarket/:chainId/fee-rate` serves the result with
`source: "chain" | "env-fallback"`; the env vars `POLYMARKET_BUILDER_*_FEE_BPS` are the fallback
when the router is unset or unreachable. `GET /status` exposes a `fees` summary block. The
gateway stays stateless: no admin API, no persistence — an admin edits on-chain and the gateway
follows.

Gateway env: `FEE_ROUTER_ADDRESS` (defaults to the deployment record's `feeRouter`; a
contradicting override fails boot), `FEE_ROUTER_CHAIN_ID` (default 137),
`FEE_ROUTER_CACHE_TTL_MS` (default 30000).

## Registering a new service (e.g. Lido, Polygon LST, Uniswap)

The fee system itself needs **no code change** for a new service. Steps:

1. **Pick the label** — a stable, lowercase, dot-separated id, e.g. `stake.lido`. The service id
   is `keccak256(label)` (`ethers.id(label)`).
2. **Register on-chain** (DEFAULT_ADMIN, per network):
   ```js
   await feeRouter.registerService(ethers.id('stake.lido'), capBps, 1 /* Wrapped */)
   ```
   `capBps <= 250` for wrapped services. Registration is one-shot; the cap is fixed for the
   entry's life. Add the registration to `scripts/deploy/deploy-fee-router.js`'s
   `LAUNCH_SERVICES` for fresh networks.
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

- Operations: [`docs/runbooks/fee-operations.md`](../runbooks/fee-operations.md)
- Member-facing: `docs/user-guide/platform-fees.md`
- Specs: `specs/060-platform-fee-wrapper/` (design), 050 (Earn), 056 (OpenSea referral),
  057 (Polymarket builder fee)

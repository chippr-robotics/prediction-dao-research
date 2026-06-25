# Phase 0 Research: Network-Aware Swap Provider

All Phase-0 unknowns from the Technical Context are resolved below. Decisions are recorded as
**Decision / Rationale / Alternatives considered**.

---

## R1. ETCswap V3 contract addresses on Ethereum Classic mainnet (chainId 61)

**Decision**: Bind ETC mainnet to ETCswap V3 using the following **on-chain-verified** addresses,
supplied as env-overridable defaults in `networks.js` (same inline-default pattern as Polygon's
canonical Uniswap addresses):

| Role | Address | Verified |
|------|---------|----------|
| UniswapV3Factory (`ETCswapV3Factory`) | `0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC` | Blockscout-verified (Solidity 0.7.6); on-chain |
| SwapRouter02 (router) | `0xEd88EDD995b00956097bF90d39C9341BBde324d1` | On-chain `factory()`/`WETH9()` correct (bytecode present) |
| QuoterV2 | `0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B` | On-chain `factory()`/`WETH9()` correct (bytecode present) |
| NonfungiblePositionManager | `0x3CEDe6562D6626A04d7502CC35720901999AB699` | Blockscout-verified (0.7.6); cross-refs factory/WETC |
| WETC (Wrapped ETC) | `0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a` | Blockscout-verified `WETC9`; `symbol=WETC`, `decimals=18` |

**Rationale**: Source of truth is the ETCswap SDK (`etcswap/sdks` → `sdk-core/src/addresses.ts`,
`ChainId.CLASSIC`), cross-checked live against ETC mainnet RPC (`eth_chainId` = `0x3d` = 61) and
`https://etc.blockscout.com`. The V3 periphery contracts mutually reference the same factory and
WETC, confirming a consistent deployment. Using verified addresses (not mocks) satisfies the
Honest-State principle while making ETC swaps actually functional.

**Alternatives considered**: (a) Leave ETC mainnet DEX env-gated/empty (disabled until an operator
supplies addresses) — rejected because the user explicitly chose to make "ETC → ETCswap" reachable;
verified addresses exist, so gating it off would ship a dead feature. (b) Hardcode without env
override — rejected; keep `VITE_ETC_ETCSWAP_*` overrides for parity with Mordor/Amoy and to allow
swapping the router if ETCswap upgrades.

**Verification status (T011, 2026-06-24)**: All five addresses were confirmed on ETC mainnet
(`eth_chainId` = 0x3d). Factory, PositionManager, and WETC are **Blockscout source-verified**.
SwapRouter02 (`0xEd88…24d1`) and QuoterV2 (`0x4d8c…d39B`) were confirmed by **deployed bytecode +
correct on-chain wiring** (`factory()`/`WETH9()` return the canonical factory/WETC), but their
Blockscout *source-verification badge* was not retrievable via the API in this session. The
addresses are correct and safe to ship as defaults; if a verified-source badge is required, confirm
the two contract pages directly on `etc.blockscout.com`. They are env-overridable
(`VITE_ETC_ETCSWAP_SWAP_ROUTER` / `VITE_ETC_ETCSWAP_QUOTER`) if ETCswap ever redeploys.

---

## R2. Classic USD (USC) stablecoin on ETC mainnet

**Decision**: Use `0xDE093684c796204224BC081f937aa059D903c52a`, **6 decimals**, symbol `USC`,
name `Classic USD`, as the ETC-mainnet stablecoin (env override `VITE_ETC_USC`).

**Rationale**: Verified three ways — `classicusd.com`, `etc.blockscout.com` (verified `ERC1967Proxy`,
0.8.20; on-chain `name="Classic USD"`, `symbol="USC"`, `decimals=6`), and a direct `eth_call` on a
confirmed chainId-61 RPC. **Correction to a prior assumption**: this address is the *mainnet* USC, not
Mordor-only. ETCswap/USC use deterministic addresses, so the same value already appears as Mordor's
default in `networks.js` — i.e. the existing Mordor `VITE_MORDOR_USC` default is the same token.

**Alternatives considered**: A possible second (Polygon) Brale USC address appeared truncated on the
Brale page; not confirmed and explicitly **not** used for ETC.

---

## R3. ETC family also covers Mordor (63) — deterministic addresses

**Decision**: Mordor (63) keeps its existing `VITE_MORDOR_ETCSWAP_*` env-gated `dex` config, but
gains the `dexProvider: { name: 'ETCswap', url }` descriptor so its identity/copy is correct even
while its `dex` is unconfigured. A follow-on task verifies the deterministic ETCswap addresses on
`etc-mordor.blockscout.com` and, if confirmed, adds them as Mordor defaults to enable Mordor swaps.

**Rationale**: The ETCswap SDK lists identical addresses for `CLASSIC` (61) and `MORDOR` (63), but
research could not independently verify them on the Mordor explorer (the local node was Mordor but its
RPC did not answer). Adding the provider *descriptor* now (cheap, no funds risk) immediately fixes the
mislabel (FR-002/FR-006) on Mordor; defaulting Mordor's *routing* addresses waits on explicit Mordor
verification to honor Honest-State.

**Alternatives considered**: Default Mordor's `dex` to the mainnet addresses immediately — rejected
pending Mordor-side verification (could differ; would risk routing funds to a wrong/absent contract).

---

## R4. DEX provider web-app URLs (the "open DEX" link)

**Decision**:
- ETCswap (ETC family) → `https://v3.etcswap.org` (canonical domain is **etcswap.org**; the V3 app
  lives on the `v3.` subdomain; `etcswap.com` redirects/aliases). Env override `VITE_ETC_ETCSWAP_URL`
  / existing `VITE_MORDOR_ETCSWAP_URL`.
- Uniswap (Polygon family) → `https://app.uniswap.org/swap?chain=polygon` (Amoy: same base; Uniswap
  has no Amoy slug, so `app.uniswap.org/swap` without `?chain` is the safe default for testnet).

**Rationale**: Confirmed against ETCswap docs/site and `app.uniswap.org`. Uniswap supports a named
`?chain=` slug (`mainnet`, `polygon`, …), not numeric chain IDs; Uniswap does **not** support ETC, so
it is correctly never used on ETC-family chains.

**Alternatives considered**: Linking to the SwapRouter contract on the explorer instead of the DEX app
— kept as a *separate* link ("{provider} Router ↗" → explorer); the provider-app link is added
alongside it, not as a replacement.

---

## R5. How to make provider identity data-driven (FR-007) and survive an unconfigured DEX (FR-006)

**Decision**: Add a **network-level** `dexProvider: { name, url }` field to each entry in
`networks.js` (NOT nested under `dex`), plus a `getDexProvider(chainId)` helper. ETC-family entries
declare `{ name: 'ETCswap', url }`; Polygon-family entries declare `{ name: 'Uniswap', url }`;
Hardhat declares none (`null`).

**Rationale**: `dex` is set to `null` when addresses are missing (Amoy/Mordor pattern). Provider
*identity* must still be known then, so the disabled-state message can say "ETCswap is not configured
on Mordor" rather than "Uniswap on Polygon" (FR-006). Putting `dexProvider` at the network level keeps
it independent of address availability. Declaring it per network (rather than computing from a chainId
allow-list) makes the FR-001 rule explicit, unit-testable, and extensible by configuration alone
(FR-007). A short comment documents the rule (ETC-family → ETCswap; else → Uniswap).

**Alternatives considered**: (a) Compute provider from a hardcoded `[61, 63]` set inside components —
rejected: scatters the rule and re-introduces per-chain branching the spec wants to avoid. (b) Nest
provider under `dex` — rejected: unavailable exactly when the disabled-state message needs it.

---

## R6. Consolidating the existing `resources.dexUrl`

**Decision**: Make `dexProvider.url` the single source for the provider-app link. Update
`NetworkSettings.jsx` (today reads `net.resources.dexUrl`) to render from `dexProvider`
(`Open {dexProvider.name} ↗`, gated on `capabilities.dex`). Remove the now-redundant
`resources.dexUrl` from Mordor; retain `resources.faucet`.

**Rationale**: Mordor already surfaces an `etcswap.org` link on the Network tab via `resources.dexUrl`;
duplicating the URL in both `resources` and `dexProvider` violates DRY. One source avoids drift.

**Alternatives considered**: Keep both fields — rejected (duplication/drift). Derive `dexProvider.url`
from `resources.dexUrl` — rejected: Polygon/Amoy have no `resources` block, so provider URL belongs on
the provider descriptor.

---

## R7. Wallet-layer wiring for ETC mainnet (61)

**Decision**: No change to `wagmi.js` or `blockExplorer.js`. Only `networks.js` (app source of truth)
needs the new `61` entry.

**Rationale**: `wagmi.js` already defines `ethereumClassic` (id 61) and includes it in `chains`,
`transports`, and `getExpectedChain`; `blockExplorer.js` already maps `61 → https://etc.blockscout.com`.
The only gap is the missing `NETWORKS[61]` entry that drives DEX/stablecoin/capabilities/selectability.
`getSelectableNetworks()` will surface `61` once it has `selectable: true`. The Testnet/Mainnet toggle
(80002↔137) is unaffected; ETC mainnet/Mordor are reached via the Network-tab selector, as Mordor is
today.

**Alternatives considered**: None needed.

---

## R8. Capability-tag wording (`networkCapabilities.js`)

**Decision**: Change the static `swap` feature description from "In-app token swaps via Uniswap V3." to
provider-neutral wording, e.g. "In-app token swaps via the network's DEX (Uniswap or ETCswap)."

**Rationale**: The Network-tab feature tag is a single static description across chains; naming only
Uniswap mislabels ETC. Provider-neutral wording is accurate everywhere. (A fully chain-aware per-tag
description is possible but unnecessary; the swap panel itself already names the active provider.)

**Alternatives considered**: Make the description a function of chainId — deferred as gold-plating; the
neutral string satisfies FR-002 on this surface.

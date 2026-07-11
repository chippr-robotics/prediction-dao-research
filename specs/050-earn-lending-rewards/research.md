# Research: Earn Section — Lending & Rewards (spec 050)

**Date**: 2026-07-11 · All external findings verified against docs.morpho.org, api.morpho.org,
api.merkl.xyz, npm, and block explorers on this date.

## R1 — Lending protocol integration surface (Morpho)

**Decision**: Integrate **Morpho Vault V1 (MetaMorpho)** vaults as plain **ERC-4626** contracts
via ethers v6 (`deposit(assets, receiver)` / `withdraw(assets, receiver, owner)` /
`redeem(shares, receiver, owner)` / `previewDeposit` / `maxWithdraw` / `convertToAssets`),
with vault discovery and APY/TVL/position data from Morpho's public GraphQL API
(`https://api.morpho.org/graphql`, no auth, 750 req/min). Filter
`where: { chainId_in: [...], whitelisted: true }` and require `listed: true` so we only surface
vaults curated on the Morpho app itself.

**Rationale**:
- Vault V1 is the mature surface: full ERC-4626 semantics including working
  `maxDeposit`/`maxWithdraw` (Vault V2 returns 0 from the max* functions by design, which breaks
  honest limit display). V2 support can be layered on later behind the same normalized model.
- Plain ethers + GraphQL is the docs' own documented lightweight path ("Path 2.2" in the
  assets-flow tutorial). The `@morpho-org/morpho-sdk` umbrella package (v5.x) is viem-native and
  pulls in Bundler3 routing — the app's tx layer is ethers v6, so the SDK would add a second
  web3 stack for marginal benefit (slippage-guard bundling) — rejected under constitution
  "Simplicity".
- Deposit safety without Bundler3: quote with `previewDeposit`, then `deposit.staticCall` before
  sending; curated (whitelisted+listed) vaults carry the Morpho-required inflation-attack "dead
  deposit", and share price manipulation on them is not a practical risk for retail-size deposits.

**Alternatives considered**:
- `@morpho-org/morpho-sdk` / `bundler-sdk-viem`: rejected for v1 (new core dependency + second
  web3 stack; justification bar in constitution not met).
- Operating a FairWins-curated vault list by hand: rejected — hardcoded lists rot and violate the
  live-data requirement (FR-003); the API's `whitelisted`/`listed` flags are the curation filter.
- Aave/Compound instead of Morpho: the issue names Morpho explicitly.

## R2 — Supported networks

**Decision**: Enable earn on **Ethereum mainnet (1)** and **Polygon PoS (137)** via a new
per-network `earn` config block in `frontend/src/config/networks.js` plus an `earn` capability
flag. All other configured networks (ETC family, Amoy, Sepolia, Hoodi, Hardhat) show the honest
unavailable state naming where earn is available.

**Rationale**: {1, 137} is the intersection of FairWins-configured networks and Morpho + Morpho
API deployments (API supports 1, 10, 137, 8453, 42161, …; ETC family is not supported and never
will be). Polygon is the app's primary network; Ethereum mainnet became a first-class value
network in spec 048 (send/receive + portfolio — a contract deposit from a connected EOA wallet is
within that envelope; passkey smart-account sessions transact via their linked wallet, as
established by spec 048).

**Alternatives considered**: adding Base (8453) — Morpho's biggest earn chain — rejected for now
because Base is not a configured FairWins network; the config-driven design makes it a
one-entry addition later. Testnet enablement (Sepolia has Morpho contracts) — rejected: the
GraphQL API serves mainnet chains only, so a testnet lend surface would need mock data
(constitution III violation); testnets keep the honest unavailable state.

## R3 — Rewards: current mechanism is Merkl, not the legacy URD flow

**Decision**: Implement rewards via **Merkl**: read
`GET https://api.merkl.xyz/v4/users/{lowercased address}/rewards?chainId={id}`; claimable =
`amount − claimed` (cumulative accounting); claim by calling
`claim(address[] users, address[] tokens, uint256[] amounts, bytes32[][] proofs)` on the Merkl
Distributor `0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae` (same address on all supported chains),
passing the **cumulative** `amount` and API-provided proofs. Link out to
`https://rewards-legacy.morpho.org/` for any pre-migration balances.

**Rationale**: Morpho migrated all new reward distribution to Merkl under MIP-111; the
`rewards.morpho.org` API + Universal Rewards Distributor flow referenced by the issue's linked
tutorial is **deprecated** (docs.morpho.org/build/rewards/get-started). Building against the URD
would ship a dead integration. Merkl data updates ~every 8 hours — the UI must show freshness
("as of") rather than implying real-time accrual (spec edge case).

**Alternatives considered**: URD `claim(account, reward, claimable, proof)` — kept out of scope
(legacy claims remain possible on Morpho's own legacy page; no value in re-implementing a
deprecated path).

## R4 — Platform attribution & treasury fee

**Decision (resolves the issue's conditional)**: Morpho has **no transaction-source referral or
fee parameter** anywhere in the deposit path (ERC-4626, Bundler3, or API) — nothing like Aave's
referral code exists. Therefore:
1. Ship the protocol-**mandated** UI attribution ("Powered by Morpho" + risk disclaimer,
   per docs.morpho.org/build/earn/get-started) — this satisfies "identification that the
   FairWins platform is used" at the product level.
2. Charge **no platform fee in this release** (FR-013) and disclose that plainly.
3. Record the documented revenue path for a future feature: Morpho's official "distributor
   revenue" models (docs.morpho.org/build/earn/concepts/generate-revenue/) — (a) **fee-wrapper
   Vault V2** owned by the FairWins treasury wrapping a curated vault with a
   performance/management fee (recommended, trustless, but introduces a new value-bearing
   contract → full security lifecycle per constitution I), (b) offchain curator revenue-share
   agreement, (c) onchain fee splitter on a dedicated vault. Deferred to its own spec.

**Rationale**: deploying a treasury fee-wrapper vault is a smart-contract feature with fund
custody implications — it cannot ride along inside a frontend feature under this repo's
constitution (security-first, spec-before-funds-code). Deferring with a documented decision
answers the issue honestly instead of silently dropping the request.

## R5 — Placement in the app shell

**Decision**: `Earn` becomes a Finance-group nav item (`id: 'earn'`, new `NavIcon` glyph
`sprout`) in `frontend/src/config/appNav.js`, hosted as a `?tab=earn` panel in
`frontend/src/pages/WalletPage.jsx` (`WALLET_TABS` + panel switch), mirroring exactly how
Trade/Portfolio/Protect work. Deep-link contract: `/wallet?tab=earn[&chain=<id>][&token=<sym>]`
— the same param shape TradePanel already accepts, used by the portfolio Earn action.

**Rationale**: issue acceptance scenario 1–2 (Finance sub-section, unique icon); one nav model is
the repo's established single source of truth.

## R6 — Portfolio "Earn" action

**Decision**: extend `actionsFor(instance)` in
`frontend/src/components/wallet/AssetDetailSheet.jsx` with an `earn` action: enabled when the
instance's network has the `earn` capability and the asset is a fungible token/native asset
(`asset.kind !== 'nft'`); routes to `/wallet?tab=earn&chain=<chainId>&token=<symbol>`; disabled
otherwise with a plain-language reason (mirrors the existing disabled `stake` precedent —
constitution III: no dead buttons).

## R7 — Activity feed integration

**Decision**: add an `earn` ActivitySource (`frontend/src/data/notifications/sources/earnSource.js`
+ registration in `sources/index.js` + `DOMAIN_META` entry in `domains.js`) following the spec 031
contract (snapshot-diff, first-sight-is-baseline, idempotent, honest `ok:false`). Snapshots per
(account, chain): vault share balances and cumulative-claimed reward amounts. Share balance
changes → "lending position increased/decreased" entries; cumulative-claimed increases → "rewards
claimed" entries. Additionally, user-initiated deposit/withdraw/claim handlers append an
immediate action entry (with tx hash link) through the same store partition so FR-010's audit
trail carries the transaction link without waiting for the next poll; the source's dedup-stable
ids make the subsequent snapshot-diff a no-op for the same event.

**Rationale**: matches how every other domain records activity; the direct-append rider is the
established `useIntentAction`/`onActivity` precedent for user-initiated actions.

## R8 — Non-intimidating UX & info bubbles

**Decision**: every DeFi term gets an adjacent `InfoTip` (`frontend/src/components/ui/InfoTip.jsx`,
spec 039 single-open toggletip): APY, vault, curator, TVL/total deposits, approval (two-prompt
deposits), withdrawal liquidity, rewards origin/freshness. Copy lives with the earn components in
one `earnCopy.js` module so wording is testable and consistent. Flow design: hub → area cards
(Lend live; Staking/Bridges honest "not yet available" cards, same honesty pattern as the
disabled Stake action) → vault list → single-vault sheet with Deposit/Withdraw tabs and a
plain-English "what will happen" summary before each wallet prompt. WCAG 2.1 AA enforced via
vitest-axe tests like the portfolio panels.

## R9 — Data honesty & failure modes

**Decision**:
- Vault list/APY: Morpho API fetch with explicit loading/unavailable states; a failed fetch shows
  "temporarily unavailable" and disables deposit entry points (never stale numbers as truth).
- Positions: share balances read on-chain per user (`balanceOf` + `convertToAssets` — real state),
  enriched with API USD valuation/earnings (`assetsUsd`, `pnlUsd`) when available; enrichment
  degrades honestly (value shown, USD "—") if the API is down.
- Rewards: Merkl API with `updatedAt`-style freshness copy ("Rewards update every few hours");
  fetch failure → explicit unavailable state (never "0").
- Amount validation before any wallet prompt: 0 < amount ≤ wallet balance (deposit) /
  ≤ `maxWithdraw` (withdraw); vault paused/cap states surfaced from `maxDeposit` where nonzero.
- All external fetches are scoped per active chainId; nothing crosses the testnet/mainnet
  boundary (reuses the per-chain read-provider pattern from `usePortfolio`).

## R10 — Documentation site

**Decision**: add `docs/user-guide/earn.md` (what Earn is, how lending works, step-by-step
deposit/withdraw, rewards + claiming, risks, fees — written for non-technical members) and
`docs/developer-guide/earn-integration.md` (architecture, Morpho/Merkl endpoints, config shape,
how to enable a new network, the deferred treasury-fee decision), both registered in `mkdocs.yml`
nav. The Earn hub links to the user guide (FR-014).

## Canonical external references

| Item | Value |
|---|---|
| Morpho GraphQL API | `https://api.morpho.org/graphql` (vault discovery, APY, positions) |
| Merkl rewards API | `https://api.merkl.xyz/v4/users/{address}/rewards?chainId={id}` |
| Merkl Distributor (1, 137, …) | `0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae` |
| Morpho legacy rewards page | `https://rewards-legacy.morpho.org/` |
| Morpho attribution requirement | docs.morpho.org/build/earn/get-started ("Powered by Morpho") |
| Distributor revenue models | docs.morpho.org/build/earn/concepts/generate-revenue/ |
| ERC-4626 flow tutorial | docs.morpho.org/build/earn/tutorials/assets-flow/ |
| Rewards migration (MIP-111) | docs.morpho.org/build/rewards/get-started |

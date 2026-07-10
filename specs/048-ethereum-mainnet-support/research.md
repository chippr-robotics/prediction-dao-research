# Phase 0 Research: Ethereum Mainnet & Testnet Support

All spec `[NEEDS CLARIFICATION]` items were resolved during `/speckit-specify` and
`/speckit-clarify` (see spec Clarifications). The remaining unknowns are planning-level
configuration facts and integration decisions, resolved below against the existing code.

## R1 — How does a network become actually switchable?

**Decision**: A selectable network must be registered in **both** `config/networks.js`
(with `selectable: true`) **and** the wagmi chain registry in `frontend/src/wagmi.js`.

**Rationale**: The Network tab (`components/wallet/NetworkSettings.jsx`) lists
`getSelectableNetworks()` and switches via wagmi's `useSwitchChain().switchChain({ chainId })`.
`switchChain` only accepts chains present in `createConfig({ chains })`. Today `wagmi.js`
registers only `[polygon, amoy, ethereumClassic, mordor, hardhat]`. Chain **1 is already
`selectable: true`** in `networks.js` but **absent from wagmi**, so switching to Ethereum
mainnet fails today — a latent bug this feature must fix. Sepolia (11155111) and Hoodi
(560048) are likewise absent.

**Action**: Register mainnet, sepolia, and hoodi in `wagmi.js` with HTTP transports, keep
`polygon` first (wagmi default chain, unchanged — FR-015), and add them to `getExpectedChain`
switch coverage. Import `mainnet` and `sepolia` from `wagmi/chains`; define `hoodi` inline
(as `mordor` is defined) since it is not a built-in.

**Alternatives considered**: Deriving the wagmi chain list programmatically from
`NETWORKS`. Rejected for this cut — larger blast radius (transport/env wiring differs per
chain, hardhat/local special-casing), higher regression risk, and out of scope. Noted as
possible future cleanup.

## R2 — Hoodi network identity

**Decision**: Hoodi = **chainId 560048**, native coin **ETH** (test ETH, 18 decimals),
explorer `https://hoodi.etherscan.io`, RPC via `VITE_RPC_URL_HOODI` with a public default
(`https://ethereum-hoodi-rpc.publicnode.com`), `isTestnet: true`, `selectable: true`.

**Rationale**: Hoodi is the Ethereum Foundation's current long-lived proof-of-stake
testnet (successor to Holešky for validator/staking testing). It mirrors the Sepolia entry
shape already in `networks.js`.

**Stablecoin**: **No invented address.** Hoodi's `stablecoin` is env-driven
(`VITE_HOODI_USDC`) and **null by default**; with no stablecoin configured, Hoodi send
offers native ETH only and the portfolio shows native (+ any curated token that has a real
address). This honors constitution III (no placeholder/mock addresses in shipped paths). If
a canonical Hoodi faucet stablecoin is confirmed later, set the env/default then.

**Alternatives considered**: Hardcoding a guessed USDC address — rejected (honest-state).
Omitting Hoodi entirely — rejected (explicitly in scope per spec + issue).

## R3 — Curated token set on the Ethereum family (FR-006a)

**Decision**: Reuse the existing registry assembly in `config/assetTaxonomy.js`:

- **Native ETH** — auto-added by `getPortfolioRegistry` from `nativeCurrency`.
- **USDC** — auto-added from the network's `stablecoin` (already set on mainnet/Sepolia).
- **WETH** — already present in `CURATED_REGISTRY[1]`.
- **Add** `USDT` and `DAI` to `CURATED_REGISTRY[1]` (canonical mainnet addresses), and add
  `DAI` to `UNDERLYING_META`. Result on mainnet: ETH, WETH, USDC, USDT, DAI — parity with
  the Polygon set (ETH/WETH/WBTC/LINK/USDC/USDT).
- **Testnets** — native test ETH + faucet USDC (via `stablecoin`) where one exists
  (Sepolia yes; Hoodi none by default per R2). No fabricated testnet tokens.

**Rationale**: The registry already layers app-config (native/wnative/stablecoin) under a
curated ERC-20 layer; extending it is config-only and consistent with spec 044. Every token
is a canonical, verifiable deployment (constitution III), matching the "canonical only"
convention documented in `CURATED_REGISTRY`.

**Alternatives considered**: Dynamic token discovery (scan wallet for arbitrary ERC-20s) —
rejected; the portfolio is intentionally registry-driven and discloses this (spec 044
FR-013), and arbitrary discovery risks unverifiable/spam tokens.

## R4 — Honest pricing for Ethereum holdings (FR-008, FR-014)

**Decision**: Add `CHAINLINK_FEEDS[1]` with canonical Ethereum mainnet AggregatorV3
`*/USD` feeds for **ETH**, **BTC**, and **LINK** (8-decimal, `*/USD`). Stablecoins
(USDC/USDT/DAI) are valued at par $1 by the existing convention. Any asset with neither a
feed nor par status stays honestly unpriced (`usd: null`, excluded from sums).

**Rationale**: `lib/portfolio/prices.js` resolves price via `CHAINLINK_FEEDS[chainId]`
first, then a DEX spot pool. Ethereum mainnet has **no `dex` config** in this feature
(ClearPath/value-only, `dex: null`), so the DEX-spot fallback cannot run there — the
Chainlink layer is required for ETH/WETH to carry a value and contribute to totals. Feeds
are read over the network's own read provider, independent of the wallet chain, exactly as
today. On testnets, feeds are typically absent → native test ETH shows unpriced (honest),
which is acceptable and expected for testnets.

**Alternatives considered**: Off-chain price APIs (CoinGecko etc.) — rejected; violates the
"verifiable on-chain sources only" rule (spec 044 FR-022, constitution III). Leaving mainnet
unpriced — rejected; would fail FR-008 (Ethereum holdings must contribute to totals).

## R5 — Explorer-link network scoping (FR-016, constitution III/V)

**Decision**: `config/blockExplorer.js` currently holds a **hardcoded** `BLOCKSCOUT_URLS`
map (chains 61/63/137/80002 only) that **defaults unknown chains to Amoy PolygonScan**.
Adding Ethereum chains without fixing this would mis-route mainnet/Sepolia/Hoodi explorer
links to a Polygon testnet — a cross-network leak. Fix by sourcing the base URL from
`getNetwork(chainId).explorer.baseUrl` (the single source of truth), keeping the existing
map only as a fallback, and removing the silent Amoy default in favor of an honest empty/no-link
when a chain is unknown.

**Rationale**: Constitution V mandates network config flow from the canonical source, not
hand-copied maps; FR-016 forbids one network's data (here, explorer identity) leaking into
another's view. `networks.js` already carries each chain's `explorer` (Etherscan for
mainnet/Sepolia, to be set for Hoodi).

**Alternatives considered**: Just append three entries to the hardcoded map — smaller diff
but leaves the duplication and the Amoy-default leak for the next chain. Sourcing from
`networks.js` is the correct, lower-debt fix and stays within scope.

## R6 — Send & receive reuse (US3, FR-009..FR-012)

**Decision**: No new send/receive UI.

- **Send**: `components/wallet/TransferForm.jsx` already operates on the **active chain**
  via `useChainTokens` (native + stablecoin), routes gasless where supported else native-fee
  self-submit (never-stranded, FR-010/FR-011), and applies sanctions screening
  (`screenOne`, FR-013). Once the Ethereum chains are wagmi-registered (R1) and carry tokens
  (R3), the transfer surface works there unchanged. On Ethereum mainnet USDC has EIP-3009
  `domainVersion: '2'` but no relayer/paymaster is configured → it self-submits with the ETH
  fee, which the surface already discloses.
- **Receive**: `components/ui/AddressQRCode.jsx` / `AddressQRModal.jsx` render the member's
  address as a scannable QR. An EVM address is identical across chains, so receive is
  network-agnostic and satisfied by reuse (FR-012).

**Rationale**: These surfaces are capability-agnostic and chain-parameterized already; the
feature only widens the set of chains they can be active on.

**Alternatives considered**: A dedicated Ethereum send/receive flow — rejected (YAGNI,
constitution "simplicity"; would duplicate working surfaces).

## R7 — Passkey-only members selecting Ethereum (FR-003a)

**Decision**: Network selection stays available to all members. A passkey (smart-account)
member with no linked external wallet may **select** an Ethereum network for view-only use
(portfolio + receive); the **send** surface already gates on wallet capability and will
disclose that a connected wallet is required on a network without passkey/AA support, rather
than presenting a dead action.

**Rationale**: Matches the `/speckit-clarify` answer and the honest-state/never-stranded
rules. Passkey capability on the Ethereum family stays `false` (no bundler/EntryPoint/RIP-7212
infra) — consistent with how `networks.js` already gates `passkeyAccounts` per chain. No new
gating logic is invented; existing capability disclosure covers it.

**Alternatives considered**: Hiding Ethereum from passkey users, or requiring wallet-link
first — both rejected in clarify (contradict acceptance scenario 1 / over-gate viewing).

## Summary of decisions

| # | Area | Decision |
|---|------|----------|
| R1 | Switchability | Register 1 / 11155111 / 560048 in wagmi; polygon stays default |
| R2 | Hoodi identity | chainId 560048, ETH, Etherscan-Hoodi, env RPC; stablecoin null by default (no invented address) |
| R3 | Tokens | CURATED_REGISTRY[1] += USDT, DAI; native+USDC+WETH already; testnets native+faucet-USDC where real |
| R4 | Pricing | CHAINLINK_FEEDS[1] for ETH/BTC/LINK; stablecoins par $1; else honestly unpriced |
| R5 | Explorer links | Source from networks.js explorer; kill the Amoy default leak (FR-016) |
| R6 | Send/Receive | Reuse TransferForm + AddressQRCode unchanged |
| R7 | Passkey select | View-only selection allowed; send discloses wallet-required |

No unresolved `NEEDS CLARIFICATION` remain.

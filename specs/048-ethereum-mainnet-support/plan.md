# Implementation Plan: Ethereum Mainnet & Testnet Support

**Branch**: `048-ethereum-mainnet-support` (working branch `claude/issue-847-speckit-specify-e4ekhw`) | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/048-ethereum-mainnet-support/spec.md`

## Summary

Promote the **Ethereum family** — Ethereum mainnet (chainId 1), the **Hoodi** testnet
(chainId 560048, new), and the **Sepolia** testnet (chainId 11155111, already present as
a background portfolio-scan target) — to **user-selectable value networks**. A member can
select any of them from the My Account → Network tab, see their Ethereum holdings in the
cross-network portfolio (native ETH plus a curated multi-token set), and send/receive on
the active Ethereum network using the existing transfer and address-QR surfaces.

The technical approach is **configuration-and-wiring, not new subsystems**. The app
already models chain 1 and 11155111 in `config/networks.js`, already scans them in the
portfolio (`usePortfolio` + `getPortfolioChainIds`), and already has network-agnostic
send (`TransferForm` on the active chain) and receive (`AddressQRCode`). The two real
gaps are: (1) **wagmi does not register chains 1 / 11155111 / 560048**, so
`useSwitchChain` cannot actually switch to them (US1 is silently broken today for
mainnet, which is already `selectable: true`); and (2) the **curated token set + price
feeds** for Ethereum are incomplete, and a **hardcoded explorer map** in
`config/blockExplorer.js` omits the Ethereum chains and would mis-route their links to
Amoy (an FR-016 network-scope leak). No smart-contract, subgraph, or backend work is
involved. No app-specific infrastructure (wager/DEX/passkey) is deployed on Ethereum;
those capabilities keep disclosing as unavailable.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 (frontend only; no contract/subgraph changes)

**Primary Dependencies**: wagmi + viem (chain registry, `useSwitchChain`/`useChainId`), ethers (portfolio balance/price reads via `makeReadProvider`), `qrcode.react` (receive), Vitest + jsdom + jest-axe (tests)

**Storage**: None. Network selection persists through wagmi/wallet as for every existing network; the "show testnet assets" preference uses the existing `useUserPreferences` store. No schema or migration.

**Testing**: Vitest unit/integration (`frontend/src/test/**`), jest-axe for accessibility on any touched surface. Full `npm run test:frontend` green before merge.

**Target Platform**: Modern evergreen browsers (the existing React + Vite web app)

**Project Type**: Web application — changes are confined to `frontend/`

**Performance Goals**: Portfolio scan adds at most one new network read pass (Hoodi; chain 1 and Sepolia are already scanned). No new performance regime — same 60s poll, same per-chain read provider, same honest-state failure handling. No added blocking work on the network-switch path.

**Constraints**: WCAG 2.1 AA (constitution V); honest-state — no fabricated balances/prices, unavailable capabilities disclosed truthfully (constitution III); strict per-network scoping — no data or explorer-link leak across networks (FR-016); network config sourced from the single `config/networks.js` source of truth, not hand-duplicated (constitution V); default/home network unchanged (FR-015).

**Scale/Scope**: 3 networks added/promoted; ~5 frontend config files touched plus wagmi registration and their tests. No new screens or components — existing surfaces are extended.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|-----------|----------|------------|
| **I. Security-First Smart Contracts (NON-NEGOTIABLE)** | No | No `contracts/` changes. No on-chain code, no fund custody, no oracle path. Nothing to deploy on Ethereum. Gate N/A. |
| **II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE)** | Yes | Every config change lands with Vitest coverage: network selectability + capability disclosure (extend `networks.mainnet.test.js`, add Hoodi/Sepolia cases), portfolio inclusion + curated tokens + honest pricing (`test/portfolio/*`, `networks.test.js`), and explorer-link scoping. No contract interface changes. |
| **III. Honest State, No Mocks (NON-NEGOTIABLE)** | Yes — central | Unavailable Ethereum capabilities (wager/DEX/passkey) already self-disclose via the capability getters + `NetworkUnavailableNotice`/`ChainCapabilityGate`; this feature leaves them off. Balances/prices come only from verifiable on-chain reads (Chainlink feeds; stablecoins par $1); anything unresolvable is disclosed unavailable, never zero. Fixing the `blockExplorer.js` map removes a real cross-network link leak. Testnet holdings stay behind the opt-in. No mock addresses invented (Hoodi stablecoin stays env-driven/null until a real faucet token is known). |
| **IV. Fail Loudly in CI** | Yes | No `continue-on-error` added. Lint/test/a11y gates stay blocking. |
| **V. Accessible, Consistent Frontend** | Yes | No new UI; reused surfaces already meet AA (axe covered). Network config is read from `config/networks.js` (single source) — the plan reduces, not adds, hand-maintained duplication by wiring the explorer map to the network config. ESLint stays clean. |

**Additional constraints**: Tech stack unchanged (React/Vite/Vitest, wagmi/viem) — no new core technology, so no justification required. No keys/secrets. No archived-code imports. No deployment artifacts change (Ethereum has no deployed app contracts).

**Result**: PASS — no violations, no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/048-ethereum-mainnet-support/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — decisions & rationale
├── data-model.md        # Phase 1 output — config entities & shapes
├── quickstart.md        # Phase 1 output — end-to-end validation guide
├── contracts/           # Phase 1 output — frontend config/behavior contracts
│   ├── network-config.md
│   └── portfolio-and-capabilities.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

Changes are confined to `frontend/`. The concrete files this feature touches:

```text
frontend/src/
├── wagmi.js                          # ADD chains 1 (mainnet), 11155111 (sepolia),
│                                     #   560048 (hoodi) + transports; keep polygon default
├── config/
│   ├── networks.js                   # Sepolia selectable:true; ADD Hoodi (560048) entry;
│   │                                 #   refresh mainnet comments (now a value network)
│   ├── assetTaxonomy.js              # CURATED_REGISTRY[1] += USDT, DAI (WETH/USDC already);
│   │                                 #   UNDERLYING_META += DAI; testnet curated entries
│   ├── priceFeeds.js                 # CHAINLINK_FEEDS[1] = ETH/BTC/LINK/USD (mainnet feeds)
│   └── blockExplorer.js              # Fix hardcoded map: source from networks.js explorer
│                                     #   (or add 1/11155111/560048) — no Amoy fallback leak
└── test/
    ├── networks.test.js              # selectable set incl. Ethereum family; ordering
    ├── networks.mainnet.test.js      # reframe: value network; still swap/wager off; +tokens
    ├── networks.ethereum.test.js     # NEW — Hoodi entry, Sepolia selectable, wagmi parity
    ├── blockExplorer.test.js         # NEW/updated — per-chain scoping, no cross-network leak
    └── portfolio/
        └── usePortfolio.test.jsx     # Ethereum curated holdings, testnet gating, pricing
```

**Structure Decision**: Single existing web app (`frontend/`). No new modules, directories,
or services — the feature extends `config/*` single-source-of-truth files, the wagmi chain
registry, and their Vitest suites. This matches the repository's established pattern where
per-chain behavior derives from `config/networks.js` and specs 042/044 added networks the
same way.

## Complexity Tracking

No constitution violations — this section intentionally left empty (YAGNI: the smallest
change is configuration + wiring on existing surfaces).

# Implementation Plan: Earn Section — Lending & Rewards

**Branch**: `claude/earn-lending-rewards-3j5y70` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/050-earn-lending-rewards/spec.md` (issue #861)

## Summary

Add an **Earn** sub-section to the Finance navigation group where members lend idle assets into
curated Morpho (ERC-4626) vaults on Ethereum mainnet and Polygon, watch their positions, and see &
claim protocol rewards via Merkl — with plain-language InfoTip explainers on every DeFi concept,
activity-feed audit entries for every action, per-network capability gating, a portfolio "Earn"
deep-link action, and a user guide on the docs site. Frontend-only: ethers v6 against public
vault/distributor contracts, Morpho GraphQL API for discovery/APY, Merkl REST API for rewards. No
platform fee in this release — Morpho has no tx-source referral mechanism; the treasury
fee-wrapper vault path is documented and deferred (research.md R4).

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 + Vite (existing frontend stack)

**Primary Dependencies**: ethers v6 (contract reads/writes), react-router-dom, existing InfoTip /
nav / activity-feed infrastructure. **No new npm dependencies** — Morpho GraphQL and Merkl REST
are consumed with `fetch`; ERC-4626 + Merkl Distributor calls use minimal inline ABIs
(research.md R1/R3).

**Storage**: none new — activity entries persist through the existing spec 031 activity store
(`localStorage`, per account+chain); no backend.

**Testing**: Vitest + Testing Library + vitest-axe (existing frontend suite; new tests under
`frontend/src/test/earn/`).

**Target Platform**: web (desktop + mobile PWA), same as existing app.

**Project Type**: web frontend (frontend/ only) + docs site (docs/ + mkdocs.yml).

**Performance Goals**: vault list interactive < 2s on normal network; polling aligned with
existing cadences (positions 60s like usePortfolio; rewards on open + manual refresh — Merkl data
only changes ~8-hourly).

**Constraints**: honest-state everywhere (no mock vaults, no fake zeros, freshness labels on
reward data); WCAG 2.1 AA; per-chain data isolation; Morpho API rate limit 750 req/min (a handful
of queries per session — no risk); all copy non-technical with InfoTip explainers.

**Scale/Scope**: 2 earn-enabled networks (1, 137), ~10–30 curated vaults per network, 1 nav item,
~8 new components/modules, 2 docs pages.

## Constitution Check

*GATE evaluated against constitution v1.0.0 — PASS (pre-Phase-0 and re-checked post-Phase-1).*

- **I. Security-First Smart Contracts**: PASS — no `contracts/` changes. The feature only calls
  audited third-party contracts (Morpho vaults, Merkl Distributor) from the user's own wallet.
  Client-side safeguards: `previewDeposit` + `staticCall` before sending, amount validation before
  any wallet prompt, curated (whitelisted+listed) vaults only, canonical distributor address from
  config not user input. The treasury fee-wrapper vault (which WOULD be a value-bearing contract)
  is explicitly deferred to its own spec for exactly this reason (research.md R4).
- **II. Test-First / Coverage**: PASS — Vitest units for API normalizers, claimable math,
  validation, hooks; component tests incl. failure/edge states (API down, unsupported network,
  over-balance amounts); axe tests for new views.
- **III. Honest State**: PASS — live Morpho/Merkl data only; explicit unavailable states; no
  earn surface on networks without real support (testnets excluded because the Morpho API has no
  testnet data — R2); reward freshness disclosed; no fee implied while none is charged.
- **IV. Fail Loudly in CI**: PASS — no CI changes; new tests join the gating suite.
- **V. Accessible, Consistent Frontend**: PASS — InfoTip/nav/panel patterns reused; WCAG AA via
  axe tests; ESLint clean. Note: Morpho vault/distributor addresses are *external protocol*
  deployments resolved via `networks.js` config (the same pattern as Uniswap/ETCswap dex config —
  they are not FairWins deployments, so `deployments/`-derived sync artifacts don't apply).

## Project Structure

### Documentation (this feature)

```text
specs/050-earn-lending-rewards/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── earn-config.md   # networks.js earn block + capability contract
│   ├── morpho-api.md    # GraphQL queries + normalized shapes consumed
│   └── merkl-rewards.md # Merkl API + Distributor claim contract
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── config/
│   ├── appNav.js                    # + { id: 'earn', label: 'Earn', icon: 'sprout' } in Finance
│   ├── networks.js                  # + earn block on chains 1 & 137, + earn capability,
│   │                                #   + isEarnAvailable/getEarnConfig/getEarnNetworks helpers
│   └── earn.js                      # NEW — Morpho/Merkl endpoints, distributor address,
│                                    #   curation filters, poll cadences, deep-link helper
├── abis/
│   ├── ERC4626Vault.js              # NEW — minimal vault ABI (deposit/withdraw/redeem/previews/
│   │                                #   maxWithdraw/convertToAssets/balanceOf/asset)
│   └── MerklDistributor.js          # NEW — claim(users,tokens,amounts,proofs)
├── lib/earn/
│   ├── morphoApi.js                 # NEW — GraphQL fetch + normalize vaults/positions
│   ├── merkl.js                     # NEW — rewards fetch, claimable math, claim args builder
│   ├── vaultActions.js              # NEW — ethers v6 approve/deposit/withdraw helpers + validation
│   └── earnCopy.js                  # NEW — all member-facing explainer copy (InfoTip text)
├── hooks/
│   ├── useEarnVaults.js             # NEW — vault list for active chain (fetch + refresh + status)
│   ├── useEarnPositions.js          # NEW — on-chain share balances + API enrichment (60s poll)
│   └── useEarnRewards.js            # NEW — Merkl rewards + claim action + freshness
├── components/earn/
│   ├── EarnPanel.jsx                # NEW — hub: areas, attribution, disclosure, docs link,
│   │                                #   honest unavailable state per network
│   ├── EarnLendView.jsx             # NEW — vault list (+ ?token= prefilter from deep link)
│   ├── VaultSheet.jsx               # NEW — single vault: deposit/withdraw with summary + InfoTips
│   ├── EarnRewardsView.jsx          # NEW — rewards list + claim + freshness + legacy link
│   ├── EarnPositionsList.jsx        # NEW — member's active positions
│   └── Earn.css                     # NEW
├── components/nav/NavIcon.jsx       # + 'sprout' glyph
├── components/wallet/AssetDetailSheet.jsx  # + earn action in actionsFor()
├── pages/WalletPage.jsx             # + WALLET_TABS entry + earn panel
└── data/notifications/
    ├── domains.js                   # + earn DOMAIN_META
    └── sources/
        ├── earnSource.js            # NEW — spec 031 ActivitySource (snapshot-diff + action rider)
        └── index.js                 # + register earnSource

frontend/src/test/earn/              # NEW — unit/component/axe tests (see tasks.md)
docs/user-guide/earn.md              # NEW — member guide
docs/developer-guide/earn-integration.md  # NEW — architecture + config + deferred fee decision
mkdocs.yml                           # + nav entries
```

**Structure Decision**: frontend-only feature following the established section pattern
(config-gated capability → lib + hooks → panel hosted as `/wallet?tab=earn`), plus docs. No
backend, no contracts/, no subgraph changes.

## Design decisions (Phase 1 digest)

1. **Capability gating** mirrors `dex`: `NETWORKS[id].earn` block (provider identity, Merkl
   distributor, morpho chain support) → `capabilities.earn` → UI self-gates; unavailable networks
   name the earn-enabled networks (from `getEarnNetworks()`), never dead-end.
2. **Vault curation**: Morpho API `whitelisted: true` filter + `listed: true` requirement, ordered
   by TVL desc, capped (config) — no hand-maintained vault lists.
3. **Deposit flow**: validate → (allowance check → approve prompt, explained up front) →
   `previewDeposit` quote → `deposit.staticCall` dry-run → send → success + activity entry.
   Withdraw: `maxWithdraw` bound honestly (vault liquidity), `withdraw(assets)` partial /
   `redeem(shares)` full-exit.
4. **Rewards**: Merkl cumulative accounting (`claimable = amount − claimed`); claim passes
   cumulative `amount` + proofs to the distributor; freshness copy; API-down → explicit
   unavailable, never zero.
5. **Activity**: earnSource snapshot-diff (share balances, cumulative claimed) + immediate action
   entries with tx links appended at action time (stable ids keep the poll idempotent).
6. **Deep link**: `/wallet?tab=earn&chain=<id>&token=<sym>` consumed by EarnPanel (chain hint +
   asset prefilter) and produced by the portfolio earn action.

## Complexity Tracking

No constitution violations to justify. New-technology check: none added (fetch + ethers v6 +
existing patterns). The single scope-shaped decision — deferring the treasury fee-wrapper vault —
is recorded in research.md R4 and spec FR-013.

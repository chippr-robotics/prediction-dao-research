# Tasks: Connected Account Portfolio

**Input**: Design documents from `specs/044-connected-account-portfolio/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/asset-registry.md, quickstart.md

**Tests**: Included — constitution principle II (Test-First) is non-negotiable.

**Organization**: Tasks are grouped by user story so each story is independently
implementable and testable. Feature is frontend-only (no contracts, no subgraph).

## Phase 1: Setup

**Purpose**: No project scaffolding needed — the frontend workspace exists. Single
verification task.

- [X] T001 Verify frontend test harness runs clean before changes: `cd frontend && npx vitest run src/test/WalletPage.test.jsx` (baseline for the WalletPage edits in US1)

## Phase 2: Foundational (blocking prerequisites for all stories)

**Purpose**: The taxonomy registry config module — every story (rendering,
classification sources, unclassified handling, network scoping) consumes it.

- [X] T002 Create `frontend/src/config/assetTaxonomy.js` exporting `TAXONOMY_CATEGORIES` (five regulatory categories + `unclassified`, each with id/label/description/order per data-model.md and FR-004 definitions), `CLASSIFICATION_SOURCES`, and `SEC_COMMODITY_BASELINE` (BTC, ETH, SOL, XRP, MATIC, POL, ETC — provenance comment citing the SEC commodity baseline)
- [X] T003 In `frontend/src/config/assetTaxonomy.js`, implement `getPortfolioRegistry(chainId)` merging the three sources with precedence sec-baseline > curated-registry > app-config (FR-006): native coin from `NETWORKS[chainId].nativeCurrency`, wrapped native from `NETWORKS[chainId].dex?.wnative` / `getContractAddressForChain('wmatic', chainId)`, stablecoin from `NETWORKS[chainId].stablecoin` (→ payment-stablecoins), `membershipVoucher` via `getContractAddressForChain` (→ digital-tools, kind `nft`), plus curated Polygon entries (WETH/WBTC → digital-commodities, LINK → digital-tools, USDT → payment-stablecoins, canonical addresses with provenance comments); omit unresolvable entries; also implement `getTaxonomyCategory(categoryId)`
- [X] T004 Write registry tests in `frontend/src/test/portfolio/assetTaxonomy.test.js`: five categories + unclassified present and ordered; per-chain entries carry the queried chainId only (FR-007); no duplicate ids; source precedence (an address in two sources reports the higher source and its category); native entry exists for every `listSupportedChainIds()` chain; unknown chainId → `[]`; Mordor/ETC registries contain no Polygon addresses (SC-004 config side)

**Checkpoint**: Registry is buildable and tested — user stories can start.

## Phase 3: User Story 1 — View assets grouped by regulatory category (P1) 🎯 MVP

**Goal**: Connected member opens My Wallet → Finance → Portfolio and sees live
holdings grouped by category with total, subtotals, collapsible sections, and
per-asset rows (balance + USD or honest "unavailable").

**Independent Test**: quickstart.md steps 1–4 on Polygon/Amoy; Vitest suites for hook
and panel pass in isolation.

- [X] T005 [US1] Create `frontend/src/hooks/usePortfolio.js` per contracts/asset-registry.md and data-model.md: registry lookup for active chainId; native `provider.getBalance` + per-token minimal-ABI `balanceOf` via `Promise.allSettled` on `useWallet().provider`; holdings only for `balanceRaw > 0n`; USD join (stablecoin par $1; native/wrapped-native via PriceContext `nativeUsdRate` only on MATIC-native chains and only when the feed has no `error`; else `usd: null`); category grouping with subtotals; `totalUsd`/`isPartial`/`failedAssets`; states disconnected/loading/ready/error; request-id guard; synchronous snapshot reset on address/chainId change; 60s poll + `refresh()` (FR-002/003/008/010/014/015, R4/R5)
- [X] T006 [P] [US1] Write hook tests in `frontend/src/test/portfolio/usePortfolio.test.jsx` (mock WalletContext + PriceContext at context level per repo convention; stub ethers Contract/provider): maps balances to holdings and drops zero balances; par-$1 stablecoin and MATIC-chain native pricing; unpriced asset → `usd: null`, excluded from totals, `isPartial` true; price-feed error → native unpriced; single failed read → partial + `failedAssets`; all reads fail → error state with retry; disconnect clears; chainId change resets before reload (SC-004)
- [X] T007 [US1] Create `frontend/src/components/wallet/PortfolioPanel.jsx` + `frontend/src/components/wallet/Portfolio.css`: header "Total portfolio balance" USD figure with partial badge and refresh button; ordered collapsible category sections (`<button aria-expanded aria-controls>` + `role="region"`, subtotal visible when collapsed, explicit empty state per category); asset rows (name, symbol, balance, USD or "—" with accessible "price unavailable" label, item count for `nft` kind, classification-source tag); FR-014 states (connect prompt / loading / error+retry); styles from theme.css tokens matching Pay & Transfer conventions
- [X] T008 [P] [US1] Write panel tests in `frontend/src/test/portfolio/PortfolioPanel.test.jsx` (mock `usePortfolio`): disconnected prompt; loading; error with working retry; populated view with correct total/subtotals; unpriced row renders "—" never "$0.00" and total shows partial label (SC-005); collapse toggle hides rows, keeps header+subtotal, flips `aria-expanded`; empty category shows explicit empty state
- [X] T009 [US1] Wire navigation in `frontend/src/pages/WalletPage.jsx`: add `{ id: 'portfolio', label: 'Portfolio' }` to the Finance group of `WALLET_TAB_GROUPS` and a `{activeTab === 'portfolio' && (<div className="portfolio-section" role="tabpanel"><PortfolioPanel /></div>)}` block; update `frontend/src/test/WalletPage.test.jsx` if the tab list is asserted (deep link `?tab=portfolio` resolves via existing logic, FR-001)

**Checkpoint**: MVP demonstrable end-to-end (quickstart steps 1–4).

## Phase 4: User Story 2 — Category meaning & classification provenance (P2)

**Goal**: Category descriptions are discoverable, every row shows its classification
source, and the informational disclaimer is always visible.

**Independent Test**: In the populated view, each category header reveals its
regulatory description; rows show source labels; disclaimer visible (quickstart step 3).

- [X] T010 [US2] In `frontend/src/components/wallet/PortfolioPanel.jsx`, surface `TAXONOMY_CATEGORIES` descriptions from each category header (accessible disclosure — e.g. an info toggle or always-visible description line), render per-row source labels ("SEC baseline" / "Curated registry" / "App configuration"), and add the always-visible informational disclaimer ("classifications are informational, not legal or investment advice") in the portfolio view footer (FR-004/006/013a)
- [X] T011 [P] [US2] Extend `frontend/src/test/portfolio/PortfolioPanel.test.jsx`: each rendered category exposes its description text; rows for sec-baseline/curated-registry/app-config assets show the correct source label; disclaimer present in every non-prompt state

## Phase 5: User Story 3 — Honest unclassified & coverage disclosure (P3)

**Goal**: Unmappable app-known holdings render in an explicit Unclassified group;
the registry-coverage disclosure is always visible.

**Independent Test**: A registry entry with `categoryId: 'unclassified'` and nonzero
balance renders in an "Unclassified" group included in totals; coverage disclosure
visible.

- [X] T012 [US3] Ensure the unclassified path is complete: `getPortfolioRegistry` emits `unclassified` for app-known tokens without a category mapping (in `frontend/src/config/assetTaxonomy.js`), `usePortfolio` groups them last and includes priced ones in totals (in `frontend/src/hooks/usePortfolio.js`), and `PortfolioPanel.jsx` renders the Unclassified group only when non-empty plus the coverage disclosure ("only registry-listed assets are scanned…") alongside the T010 disclaimer (FR-012/013b)
- [X] T013 [P] [US3] Add tests: registry test in `frontend/src/test/portfolio/assetTaxonomy.test.js` for the unclassified fallback; panel test in `frontend/src/test/portfolio/PortfolioPanel.test.jsx` asserting an unclassified holding renders (never silently hidden), the group is absent when empty, and the coverage disclosure is visible

## Phase 6: User Story 4 — Network scoping & freshness (P4/P3)

**Goal**: Chain switches fully reset the view; unsupported networks and read failures
are explicit; manual + polled refresh work.

**Independent Test**: quickstart step 5–6; hook tests for chain-switch reset and
unsupported chain.

- [X] T014 [US4] Verify/complete in `frontend/src/hooks/usePortfolio.js` and `PortfolioPanel.jsx`: empty registry (unknown chainId) → explicit "Portfolio isn't available on this network" state; chain switch clears holdings before reload; manual refresh button wired to `refresh()`; ETC-family native shows USD unavailable (no MATIC-rate leakage) (FR-003/014, R4)
- [X] T015 [P] [US4] Extend `frontend/src/test/portfolio/usePortfolio.test.jsx` + `PortfolioPanel.test.jsx`: unsupported-network state renders; after simulated chainId change no stale row from the previous chain is present (SC-004); refresh triggers a reload

## Phase 7: Polish & Cross-Cutting

- [X] T016 [P] Write `frontend/src/test/portfolio/PortfolioPanel.axe.test.jsx` with vitest-axe: populated (expanded + collapsed) and error states report zero violations (FR-016, SC-006)
- [X] T017 Run full gates: `cd frontend && npx eslint src/config/assetTaxonomy.js src/hooks/usePortfolio.js src/components/wallet/PortfolioPanel.jsx src/pages/WalletPage.jsx src/test/portfolio` then `npm run test:frontend` and fix any regressions (constitution IV)
- [X] T018 Validate quickstart.md manually where possible (dev server render of `?tab=portfolio` states) and correct any doc drift in `specs/044-connected-account-portfolio/quickstart.md`

## Dependencies & Execution Order

- **Phase 2 (T002–T004)** blocks all user stories (registry is the shared model).
- **US1 (T005–T009)**: T005 → T006/T007; T007 → T008/T009. MVP checkpoint.
- **US2 (T010–T011)** and **US3 (T012–T013)** depend on US1's panel; independent of each other.
- **US4 (T014–T015)** depends on US1's hook; independent of US2/US3.
- **Polish (T016–T018)** last; T016 needs the final panel markup.

```
T001 → T002 → T003 → T004 → T005 → T006
                              └──→ T007 → T008
                                     ├──→ T009   (US1 done)
                                     ├──→ T010 → T011  (US2)
                                     ├──→ T012 → T013  (US3)
                                     └──→ T014 → T015  (US4)
                                                  └→ T016 → T017 → T018
```

**Parallel opportunities**: T006 ∥ T007 (different files); T008 ∥ T009; after US1,
{T010, T012, T014} touch overlapping files — run their test tasks (T011, T013, T015)
in parallel but serialize the implementation edits to PortfolioPanel.jsx/usePortfolio.js.

## Implementation Strategy

Ship US1 as the MVP (registry + hook + panel + nav). US2/US3 are small panel/config
increments on top; US4 hardens scoping/freshness; polish gates close with axe + ESLint +
full suite. Since all stories land in one PR here, implement sequentially US1 → US2 →
US3 → US4 → Polish, validating each checkpoint's tests before moving on.

## Phase 8: Follow-up v1.1 (density, cross-chain, testnet preference)

- [X] T019 Add Sepolia (11155111) to `frontend/src/config/networks.js` as a portfolio-scan-only testnet (publicnode RPC, Circle Sepolia USDC, all capabilities off, not selectable)
- [X] T020 Add `getPortfolioChainIds({ includeTestnets })` to `frontend/src/config/assetTaxonomy.js` (all networks except local sandboxes, mainnets first, testnets opt-in)
- [X] T021 Rewrite `frontend/src/hooks/usePortfolio.js` for cross-chain reads via `makeReadProvider` per network; always-list digital commodities (zero balances render as 0 / $0.00); drop partial-total labeling; scope reset on preference change
- [X] T022 Rework `frontend/src/components/wallet/PortfolioPanel.jsx`: category descriptions in shared `InfoTip` bubbles, per-row network badges, no partial labels, compact single-line disclosure, testnet-hidden note
- [X] T023 Add `showTestnetAssets` preference (default false, persisted per wallet) to `frontend/src/contexts/UserPreferencesContext.jsx` and a Preferences → Portfolio group (`frontend/src/components/account/PortfolioPreferencesPanel.jsx`) wired into WalletPage
- [X] T024 Update/extend tests: cross-chain hook suite, InfoTip/network/no-partial panel suite, `getPortfolioChainIds` + Sepolia registry tests, PortfolioPreferencesPanel suite, refreshed axe audits

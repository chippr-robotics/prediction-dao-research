---
description: "Task list for Universal Asset Selector"
---

# Tasks: Universal Asset Selector

**Input**: Design documents from `specs/064-universal-asset-selector/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/universal-asset-selector.md, quickstart.md

**Tests**: INCLUDED — Constitution II (NON-NEGOTIABLE) requires Vitest coverage for all non-trivial frontend logic; SC-006 requires shipping tests.

**Organization**: Grouped by user story (US1–US4) so each is independently implementable and testable. Frontend-only; no contracts/subgraph/deploy tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1 (Pay), US2 (Request), US3 (Wager), US4 (Trade/Transfer)
- Paths are repo-relative under `frontend/src/`.

## Path Conventions

Web frontend (React + Vite). New shared code in `components/ui/`, `hooks/`, `lib/assets/`; edits to `components/fairwins/` and `components/wallet/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new deps or scaffolding needed — verify the reused building blocks exist and behave as the plan assumes.

- [x] T001 Confirm reused modules and their shapes are present and match the plan/contracts: `frontend/src/hooks/useTransfer.js` exports `send({ asset, to, amount })` + `quoteGaslessForAsset`; `frontend/src/components/wallet/AssetLogo.jsx` accepts `symbol`/`chainId`/`showBadge`/`size`; `frontend/src/components/wallet/TransferForm.jsx` `assetOptions` useMemo is the extraction source; `frontend/src/hooks/useOpenChallengeCreate.js` reads `form.token` with USDC fallback. Note any drift in `specs/064-universal-asset-selector/research.md` before coding.
- [x] T002 [P] Confirm `frontend/src/config/bitcoinNetworks.js` exports `isBitcoinNetworkId` + `getBitcoinNetwork`, and `frontend/src/hooks/useBitcoinWallet.js` exposes `status`/`networkId`/`balances.spendableSats`, so the Bitcoin branch can be wired without new config.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared policy module, the shared data hook, and the shared presentational component that ALL user stories depend on. MUST complete before US1–US4.

⚠️ US1–US4 cannot start until this phase is done.

- [x] T003 [P] Create pure capability-policy module `frontend/src/lib/assets/assetActivity.js` exporting `ASSET_ACTIVITIES`, `allowedKindsForActivity(activity)`, `filterAssetsForActivity(activity, options)`, and `defaultAssetKey(activity, options, { connectedChainId, stableAddress })` per `contracts/universal-asset-selector.md` (wager → `erc20` only; pay/request/transfer → all kinds). No React/chain imports.
- [x] T004 [P] Write tests `frontend/src/lib/assets/__tests__/assetActivity.test.js`: allowed kinds per activity, Bitcoin+native filtered out of `wager` and kept in `pay`/`request`/`transfer`, default-key precedence (connected stablecoin → native → first; wager → stablecoin → first erc20).
- [x] T005 Create hook `frontend/src/hooks/useSelectableAssets.js` that returns `{ options, defaultKey, isGasless }` for `{ activity, actingAddress }`, generalizing `TransferForm`'s `assetOptions` assembly (connected native+stable always present; personal `usePortfolio` vs. `useAccountAssets(actingAddress)`; native Bitcoin when `useBitcoinWallet().status === 'ready'` and personal), then applying `filterAssetsForActivity`; `isGasless` delegates to `quoteGaslessForAsset` forcing `false` for `btc-native`; `defaultKey` via `defaultAssetKey`. Depends on T003.
- [x] T006 Write tests `frontend/src/hooks/__tests__/useSelectableAssets.test.js`: option assembly + connected-chain-first/balance sort, zero-balance defaults kept, non-stable zero rows dropped, acting-account source switch (personal vs vault/legacy), Bitcoin present only when ready+personal, activity scoping (Bitcoin absent for `wager`), `isGasless` BTC→false, invalid selection → fallback default. Depends on T005.
- [x] T007 Create presentational component `frontend/src/components/ui/UniversalAssetSelect.jsx` + `UniversalAssetSelect.css` per contract: trigger + `role="listbox"`; each row renders nested `AssetLogo` (`showBadge`, EVM `chainId`; no EVM badge for `btc-native`) + symbol + network + balance (null→pending, never `0`) + ⚡ from `isGasless`; keyboard (Enter/Space/Escape) + outside-click close; decorative logo `aria-hidden`; disabled empty state "No assets available". Dark-mode-aware, WCAG 2.1 AA. Depends on T001 (AssetLogo shape).
- [x] T008 Write tests `frontend/src/components/ui/__tests__/UniversalAssetSelect.test.jsx`: renders one nested `AssetLogo` per option, symbol/network/balance text present, pending balance shown for `null`, ⚡ only when `isGasless` true, listbox/option roles + `aria-selected`, keyboard open/select/close, empty-state disabled trigger. Depends on T007.

**Checkpoint**: Shared selector + hook + policy exist and are green — every user story can now wire them.

---

## Phase 3: User Story 1 — Pay with any held asset (Priority: P1) 🎯 MVP

**Goal**: Home Pay uses the universal selector over the full cross-network portfolio, routes any asset through the existing send engine, gates wrong-chain selections behind a switch, and supports Bitcoin.

**Independent Test**: Load Home→Pay with multi-network holdings; selector lists all held assets with nested logos; pay a non-default connected-chain asset through the normal flow; wrong-chain selection shows "Switch to {network}"; Bitcoin routes the BTC path with a never-gasless fee note.

- [x] T009 [US1] Rewire `frontend/src/components/fairwins/PayPanel.jsx`: replace the two-option `<select>` in the `AmountKeypad` `tokenSlot` with `UniversalAssetSelect` fed by `useSelectableAssets({ activity: 'pay', actingAddress })`; hold the selected option in state with `defaultKey` init + invalid-selection fallback (FR-013); derive `symbol`/`decimals`/`balance`/gasless disclosure from the selected option. Depends on Phase 2.
- [x] T010 [US1] In `PayPanel.jsx` submit path, call `send({ asset: selectedOption, to: toResolved, amount })` (drop the `kind`-only call), keep confirm/screening/note behavior; map the scanned-payment-request prefill onto a selected-option (match by chain + token/native) instead of the old `kind` toggle. Depends on T009.
- [x] T011 [US1] Add wrong-chain gating in `PayPanel.jsx`: when `selectedOption.chainId !== connectedChainId`, replace the primary "Pay" with "Switch to {network}" via wagmi `useSwitchChain` (mirror existing `handleSwitch`); guard so no send is signed off-chain (FR-007). Depends on T009.
- [x] T012 [US1] Wire the Bitcoin branch in `PayPanel.jsx`: when the selected option is `btc-native`, route through the existing Bitcoin send path (as `TransferForm` does via `BitcoinSendPanel`/`useBitcoinWallet`) and show the honest "Bitcoin is never gasless" fee note (FR-009, US1 scenario 5). Depends on T009.
- [x] T013 [P] [US1] Tests `frontend/src/components/fairwins/__tests__/PayPanel.test.jsx`: selector lists held assets with logos; selecting a connected-chain asset updates denomination + calls `send({ asset })`; wrong-chain → switch button, no send; Bitcoin selected → BTC path + never-gasless note; over-balance/zero-amount gating preserved. Depends on T009–T012.

**Checkpoint**: US1 independently testable — Pay works for the whole portfolio. This is the MVP.

---

## Phase 4: User Story 2 — Request any held asset (Priority: P2)

**Goal**: Home Request uses the same selector; the generated payment request encodes the selected asset + network; changing asset/account invalidates a shown request; Bitcoin supported.

**Independent Test**: Open Request, pick a non-stablecoin asset, generate — the request/QR encodes that asset+network; change asset → prior request invalidated; Bitcoin produces a BTC-appropriate request.

- [x] T014 [US2] Rewire `frontend/src/components/fairwins/RequestPanel.jsx`: replace the `<select>` `currencySelect` with `UniversalAssetSelect` fed by `useSelectableAssets({ activity: 'request', actingAddress: effectiveAddress })`; hold selected option with `defaultKey` init/fallback; derive `symbol` from the option. Depends on Phase 2.
- [x] T015 [US2] Build the request from the selected option in `RequestPanel.jsx`: pass the option's `tokenAddress`/`decimals`/`chainId`/`kind` to `buildPaymentRequestUri` for EVM assets, and the Bitcoin-request form for a `btc-native` option; keep paid-to disclosure. Depends on T014.
- [x] T016 [US2] Extend the stale-request guard in `RequestPanel.jsx` (`safeGenerated`) to include the selected asset `key` so changing asset OR acting account nulls a displayed request (FR-010). Depends on T014.
- [x] T017 [P] [US2] Tests `frontend/src/components/fairwins/__tests__/RequestPanel.test.jsx`: selector shows receivable assets with logos; generated request encodes the selected asset's token/decimals/chain; changing the selected asset invalidates the displayed request; Bitcoin request path produces a BTC-appropriate request + paid-to disclosure. Depends on T014–T016.

**Checkpoint**: US2 independently testable — Request works for any held asset.

---

## Phase 5: User Story 3 — Wager with any EVM-supported asset (Priority: P2)

**Goal**: Wager stake asset chosen via the selector (ERC-20 only; no native, no Bitcoin), denominated via `form.token`; default USDC unchanged; wrong-chain switch-gated; non-allowlisted token surfaces the friendly `NotAllowedToken` error.

**Independent Test**: Open Wager; selector offers only ERC-20 assets (no BTC/native), defaults USDC; create a challenge with a non-USDC allowlisted ERC-20 and verify stake/escrow/payout denominate in it; a non-allowlisted held ERC-20 shows "That stake token is not allowed."

- [x] T018 [US3] Rewire `frontend/src/components/fairwins/CreateChallengePanel.jsx`: replace the hard-coded `token="USDC"` hero with `UniversalAssetSelect` fed by `useSelectableAssets({ activity: 'wager', ... })` (ERC-20 only); default to the connected stablecoin so first-render is unchanged (FR-011, US3 scenario 4). Depends on Phase 2.
- [x] T019 [US3] Pass the selected asset through create in `CreateChallengePanel.jsx`: set `form.token = selectedOption.address` (and use its `decimals`) in the `createOpenChallenge` payload; when the default USDC is selected, keep passing USDC/zero so behavior is byte-identical to today. Depends on T018.
- [x] T020 [US3] Add wrong-chain switch-gating to the Wager create action (mirror T011) so a challenge is never created on the wrong chain; surface the existing `NotAllowedToken` → "That stake token is not allowed." error for non-allowlisted ERC-20s (already mapped in `useOpenChallengeCreate`). Depends on T018.
- [x] T021 [P] [US3] Tests `frontend/src/components/fairwins/__tests__/CreateChallengePanel.test.jsx`: selector excludes native + Bitcoin, offers ERC-20s, defaults USDC; selecting a token passes it as `form.token` to `createOpenChallenge`; wrong-chain → switch-gated; non-allowlisted token surfaces the friendly error. Depends on T018–T020.

**Checkpoint**: US3 independently testable — Wager denominates in any escrow-eligible asset.

---

## Phase 6: User Story 4 — Consistent nested logos in the Trade (Transfer) view (Priority: P3)

**Goal**: The wallet Transfer ("trade") view lists the same assets, now with nested logos, by adopting the shared selector; execution flow unchanged.

**Independent Test**: Open the Transfer view; every listed asset renders the nested logo matching Earn and the home selector; the same assets remain; send flow identical.

- [x] T022 [US4] Refactor `frontend/src/components/wallet/TransferAssetSelect.jsx` to a thin wrapper that renders `UniversalAssetSelect` (mapping its existing `options`/`value`/`onChange`/`isGasless`/`disabled` props through), so the Transfer view gains nested logos with no behavior change; keep the existing export/prop surface so call sites are untouched. Depends on Phase 2.
- [x] T023 [US4] (Optional consolidation) In `frontend/src/components/wallet/TransferForm.jsx`, swap the inline `assetOptions` useMemo for `useSelectableAssets({ activity: 'transfer', actingAddress })` to converge on one asset-assembly path (verify the asset set + Bitcoin branch + `gaslessForOption` behavior are unchanged). If any divergence appears, keep the inline list and only swap the select — record the decision in research.md. Depends on T022.
- [x] T024 [P] [US4] Update/extend `frontend/src/components/wallet/__tests__/TransferForm.test.jsx` (and any `TransferAssetSelect` test): assert the asset set is unchanged and each option now renders a nested `AssetLogo`; send flow unaffected. Depends on T022–T023.

**Checkpoint**: All four surfaces share one selector with consistent nested logos.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T025 [P] Accessibility pass on `UniversalAssetSelect` and the four wired surfaces: keyboard traversal, screen-reader labels, decorative-logo `aria-hidden`, focus return; ensure no new axe/Lighthouse violations (Constitution V, SC-006).
- [x] T026 [P] Run `npm run test:frontend` and `npm run lint` (frontend) — all green, no new ESLint warnings; fix any fallout.
- [x] T027 [P] Add a short section to `frontend/src/components/fairwins/README.md` (or the relevant component README) documenting the universal asset selector, its activity capability profiles, and that non-EVM assets are scoped per activity.
- [x] T028 Manual walkthrough of `specs/064-universal-asset-selector/quickstart.md` scenarios A–E; confirm no wrong-chain send, no unsupported asset offered where it can't work, no fake balances.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → no blockers.
- **Foundational (T003–T008)** → blocks ALL user stories. T003→T004; T003→T005→T006; T007→T008.
- **US1 (T009–T013)** → depends on Phase 2. MVP.
- **US2 (T014–T017)**, **US3 (T018–T021)**, **US4 (T022–T024)** → each depends only on Phase 2; independent of one another (different files) and can proceed in parallel after Foundational.
- **Polish (T025–T028)** → after the stories being polished are done.

## Parallel Opportunities

- Phase 2 kickoff: T003 and T007 (+ their tests T004, T008) touch different files — parallelizable; T005/T006 wait on T003.
- After Foundational, the three secondary stories run in parallel: one agent per file group —
  - US2: `RequestPanel.jsx` (+test)
  - US3: `CreateChallengePanel.jsx` (+test)
  - US4: `TransferAssetSelect.jsx`/`TransferForm.jsx` (+test)
- Per-story test tasks (T013, T017, T021, T024) are `[P]` once their implementation tasks land.
- Polish T025–T027 are `[P]`.

## Implementation Strategy

- **MVP = Phase 1 + Phase 2 + US1 (Pay).** Delivers the core value (pay any held asset with nested logos) and is independently shippable.
- **Increment 2**: US2 + US3 (Request + Wager) — the rest of the home surface.
- **Increment 3**: US4 (Trade view logos) — consistency polish.
- Keep each story behind its own tests; never sign against the wrong chain; never offer an asset an activity can't act on (honest-state).

# Phase 0 Research: Universal Asset Selector

All unknowns are resolved against the existing codebase — this is a frontend
presentation/wiring feature over capabilities the app already ships. No external
technology choices were required.

## R1 — Where the full cross-network asset list already exists

**Decision**: Reuse the option-assembly logic that `frontend/src/components/wallet/TransferForm.jsx`
already implements in its `assetOptions` `useMemo`, and extract it into a shared
hook `useSelectableAssets`.

**Rationale**: `TransferForm` already composes exactly the target list:
- connected chain's native + stablecoin (always present, even at zero balance);
- native Bitcoin when `useBitcoinWallet().status === 'ready'` (personal wallet only);
- every held holding from `usePortfolio().holdings` (personal) or
  `useAccountAssets(actingAddress).holdings` (vault / recovered legacy), filtered
  to `native`/`erc20` (no NFTs), keeping zero-balance only for native + the
  connected stablecoin;
- keyed `${chainId}:${registryId}`, sorted connected-chain-first then by balance.

Extracting it (rather than re-deriving) guarantees the "trade" view and the home
views list an identical asset set, satisfying FR-002 and SC-001.

**Alternatives considered**: Building a fresh list from `getPortfolioRegistry`
directly — rejected: it would duplicate the balance/acting-account/Bitcoin merge
already solved in `TransferForm`, risking drift and violating DRY/YAGNI
(Constitution "Simplicity").

## R2 — The nested asset logo (Earn page visual)

**Decision**: Reuse `frontend/src/components/wallet/AssetLogo.jsx` unchanged, with
`showBadge` and a `chainId`, exactly as `EarnLendView` uses it
(`<AssetLogo symbol={…} chainId={…} showBadge size={32} />`).

**Rationale**: `AssetLogo` already renders the primary asset glyph plus a network
sub-badge from bundled inline SVG (no external CDNs), is `aria-hidden` (decorative),
and already maps the app's symbols (ETH/BTC/MATIC/POL/ETC/USDC/WBTC…) and network
badges (1/61/137/testnets). This is precisely "the nested asset logos from the
earn page." Satisfies FR-003 and SC-002.

**Badge chain id for Bitcoin**: `AssetLogo`'s `NETWORK_BADGES` is keyed by numeric
EVM chainId; Bitcoin's network id is a string (`'bitcoin'`). For a BTC row we pass
`chainId={null}` (or omit `showBadge`) so BTC renders its own glyph without a
mismatched badge — BTC on its home network needs no sub-badge (same rule
`AssetLogo` already applies to a native coin on its home mainnet). No change to
`AssetLogo` required.

**Alternatives considered**: A new logo component — rejected: duplicates artwork
and diverges from Earn/Portfolio, violating Constitution V (consistency).

## R3 — Routing: does the send engine already accept arbitrary assets?

**Decision**: Delegate all sends to `useTransfer().send({ asset, to, amount })`;
the view never re-derives routing. Use `quoteGaslessForAsset(asset)` for the
per-row and selected gasless marker.

**Rationale**: `useTransfer.send` already normalizes a full `asset` descriptor
(native | network-stablecoin | arbitrary ERC-20) into its routing table, guards
that the asset's chain matches the connected chain (`Switch to this asset's network
before sending`), keeps the EIP-3009 gasless rail only for the network stablecoin,
records honest ledger `kind` (`token` for non-stable ERC-20s), and preserves
never-stranded fallbacks. Bitcoin sends route through the parallel
`useBitcoinWallet` / `BitcoinSendPanel` path that `TransferForm` already switches
to for `kind === 'btc-native'`. Satisfies FR-005, FR-009, and the "no new on-chain
behavior" clause (FR-016).

**Alternatives considered**: Extending `PayPanel` to build its own transfer calls
— rejected: reimplements routing the engine already owns and would drift from the
honest-lifecycle/gasless logic (Constitution III).

## R4 — Network-mismatch handling

**Decision**: When the selected asset's `chainId !== connectedChainId`, replace the
activity's primary action with a "Switch to {network}" button using wagmi
`useSwitchChain` (`switchChainAsync`), the exact pattern already in `TransferForm`
and `PayPanel`'s scanned-request switch flow.

**Rationale**: Transfers/wagers are signed on the connected chain; the engine also
guards this server-side of the UI. Consistent, honest, no cross-chain illusion.
Satisfies FR-007 and SC-003.

## R5 — Activity capability scoping (which assets each activity may offer)

**Decision**: Introduce a tiny pure module `lib/assets/assetActivity.js` exposing a
capability profile per activity and a filter:
- `pay` / `request`: allow all kinds, including `btc-native` (Bitcoin).
- `wager`: EVM escrow only → exclude `btc-native` (and any future non-EVM kind);
  optionally further restrict to escrow-eligible tokens.
- `transfer` ("trade"): matches today's Transfer behavior (native + erc20 +
  btc-native as a switchable/parallel path); the nested logo is the only visible
  change.

`useSelectableAssets({ activity })` applies the profile so unsupported assets never
appear. Bitcoin exclusion in Wager is by list construction, not a submit-time
error. Satisfies FR-008, SC-004.

**Rationale**: Centralizing the rule keeps every surface honest and consistent, and
makes "what can Wager hold?" a single, testable source of truth rather than
scattered conditionals.

**Alternatives considered**: Show-but-disable unsupported assets — rejected per the
spec clarification: an asset that can *never* work in an activity is excluded to
keep the list clean; only *temporarily* unusable (wrong-chain) assets stay visible
and switch-gated.

## R6 — Wager denomination beyond USDC

**Decision**: Replace `CreateChallengePanel`'s hard-coded `token="USDC"` with the
selector, defaulting to the connected network's stablecoin (USDC where available)
so first-render behavior is unchanged; the created challenge denominates stake and
payout in the selected escrow-eligible asset.

**Rationale**: Satisfies FR-011, US3, SC-005. **Confirmed against the code**:
`hooks/useOpenChallengeCreate.js` already reads `form.token` and only falls back to
the network `paymentToken` (USDC) when it is absent/zero
(`const tokenAddr = (form.token && form.token !== ZeroAddress) ? form.token : resolve('paymentToken')`);
it reads the token's own `decimals()`, checks balance/allowance, approves, and calls
`WagerRegistry.createOpenWager(..., tokenAddr, stakeWei)`. The registry enforces an
on-chain stake-token allowlist (reverts `NotAllowedToken`, already mapped to the
friendly message "That stake token is not allowed."). So US3 needs **no contract
change**: `CreateChallengePanel` simply passes the selected asset's token address as
`form.token` (defaulting to USDC when the selector's default is chosen).

**Wager selector scoping**: because the stake is pulled via `transferFrom`, the
stake asset must be an **ERC-20** — so the Wager selector offers ERC-20 holdings
(stablecoins + tokens), **excludes the native coin** (not a `transferFrom` token)
and **excludes Bitcoin** (non-EVM). The on-chain `NotAllowedToken` revert remains
the honest backstop for a held ERC-20 that isn't allowlisted, surfaced via the
existing friendly error — never a silent failure.

## R7 — Acting-account awareness

**Decision**: `useSelectableAssets` reads the acting account exactly as
`TransferForm` does (`useActiveAccount` → vault/legacy address → `useAccountAssets`;
else personal `usePortfolio`), and `RequestPanel` keeps using `useEffectiveAccount`
for the request recipient. The selector's list follows whose funds are in play.

**Rationale**: Satisfies FR-014 and the "acting as vault/recovered" edge case; avoids
leaking one account's holdings into another's list (Constitution III network/account
scoping).

## R8 — Testing approach

**Decision**: Vitest + Testing Library. New tests:
- `useSelectableAssets`: option assembly, activity scoping (Bitcoin in/out),
  acting-account source switch, zero-balance defaults, invalid-selection fallback.
- `UniversalAssetSelect`: renders nested `AssetLogo` per row, symbol+network+balance
  text, gasless marker, listbox keyboard/a11y roles, empty state.
- Panel wiring: `PayPanel`/`RequestPanel`/`CreateChallengePanel` use the selector,
  network-switch gating, Wager excludes Bitcoin & denominates in the selection.
- `TransferForm`: unchanged asset set, now with nested logos.

**Rationale**: Constitution II (test-first, frontend Vitest for non-trivial logic)
and SC-006.

## Summary of decisions

| # | Decision |
|---|----------|
| R1 | Extract `TransferForm.assetOptions` → `useSelectableAssets` hook |
| R2 | Reuse `AssetLogo` (Earn nested logo) unchanged; BTC row uses no EVM badge |
| R3 | Delegate all routing to `useTransfer.send({asset})` + `quoteGaslessForAsset` |
| R4 | Wrong-chain → "Switch to {network}" via wagmi `useSwitchChain` |
| R5 | `lib/assets/assetActivity.js` capability profiles filter per activity |
| R6 | Wager denominates in selected escrow-eligible asset, default USDC |
| R7 | Acting-account-aware list (personal/vault/legacy) like Transfer today |
| R8 | Vitest coverage for hook, component, and each rewired surface |

No [NEEDS CLARIFICATION] markers remain. R6's implementation-boundary question was
resolved directly against `useOpenChallengeCreate.js` + `WagerRegistry` — arbitrary
allowlisted ERC-20 stake tokens are already supported with no contract change.

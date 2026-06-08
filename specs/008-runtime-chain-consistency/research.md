# Phase 0 Research: Runtime Chain Consistency

All Technical-Context unknowns are resolved below. The feature introduces no new
core technology (Constitution: "Introducing a new core technology requires
justification") — it generalizes an existing, already-used pattern.

## Decision 1 — Source of the runtime chain id

- **Decision**: Treat the wallet's connected `chainId` (already exposed by
  `useWeb3()`, backed by wagmi's `useChainId`) as the single source of truth for
  "which network's data to show/act on" whenever a wallet is connected. React
  paths read it from `useWeb3()`; non-React utilities/services receive it as an
  explicit `chainId` argument (the pattern already used by `hasRoleOnChain`,
  `getUserTierOnChain`, `purchaseRoleWithStablecoin`).
- **Rationale**: The signal already exists and is reactive, so hooks can add it
  to effect/memo dependency lists and re-fetch on switch. Passing `chainId`
  explicitly into utilities keeps them pure/testable (no hidden global).
- **Alternatives considered**:
  - *Make `getContractAddress`/`getProvider()` read the live wallet chain
    internally* — rejected: hides a global, breaks purity/testability, and the
    build-time default is still needed for the disconnected state.
  - *A React context that injects chainId into services* — rejected as
    over-engineering; explicit args are simpler (Constitution IV: simplicity).

## Decision 2 — Address & provider resolution rule

- **Decision**: Every user-facing chain-scoped read resolves addresses via
  `getContractAddressForChain(name, chainId)` and providers via
  `getProvider(chainId)`. When `chainId` is null (disconnected),
  `getContractAddressForChain` already falls back to the build-time default —
  that is the *only* sanctioned use of the build-time chain.
- **Rationale**: Both helpers already exist and are used by `hasRoleOnChain`;
  this makes the existing exception the rule. No new resolution mechanism.
- **Alternatives considered**: New resolver abstraction — rejected; the two
  existing helpers already express the contract (see `contracts/chain-resolution.md`).

## Decision 3 — "Not available on this network" UX

- **Decision**: A single shared, accessible `NetworkUnavailableNotice` component.
  When `getContractAddressForChain(name, chainId)` returns falsy (or the address
  has no code on the connected chain), the consuming view renders the notice:
  a clear message naming a supported network and a one-click action wired to the
  existing `switchNetwork()` (targets the primary chain). Replaces today's
  generic "contract not found" wording (FR-006/FR-008).
- **Rationale**: Consistent, reusable, WCAG-AA messaging; reuses the existing
  switch capability; turns the remaining failure modes into guidance.
- **Alternatives considered**: Per-modal bespoke messages — rejected (drift,
  inconsistent a11y). Auto-switching the wallet without consent — rejected
  (wallet actions must be user-initiated).

## Decision 4 — Per-network scoping of locally cached chain data

- **Decision**: Change `roleStorage` (and any other `localStorage` cache holding
  chain-scoped values) to key by `(chainId, walletAddress)` rather than
  `walletAddress` alone. Old single-key entries are treated as absent (safe
  default: re-read from chain) and may be cleaned up opportunistically.
- **Rationale**: A Silver tier "remembered" for an account on testnet must not
  render on mainnet (FR-007, and a contributing cause of the reported defect).
- **Alternatives considered**: Clear all cache on every network switch —
  rejected (loses legitimately cached per-chain data and churns); scoping by key
  is precise.

## Decision 5 — Regression guard (FR-011)

- **Decision**: Add an automated guard that fails CI when a user-facing path
  resolves from the build-time chain. Primary mechanism: an ESLint rule
  (`no-restricted-imports`/`no-restricted-syntax` style) forbidding
  `getContractAddress(` and argless `getProvider()` under `src/hooks`,
  `src/components`, `src/pages`, and chain-scoped `src/utils`/`src/data`, with a
  narrow allowlist for `config/contracts.js`, the resolver internals, and the
  documented disconnected-state fallback. Backstop: a source-scanning Vitest test
  asserting the same, so the rule is enforced even if lint config drifts.
- **Rationale**: Constitution IV (fail loudly) + prevents silent reintroduction.
  ESLint already blocks the build (Constitution V).
- **Alternatives considered**: Code review only — rejected (not enforceable);
  runtime assertion — rejected (too late, ships the bug).

## Decision 6 — Scope of "all modals" / exclusions

- **Decision**: In-scope = every v2 modal/view/service that reads or writes a
  supported-chain contract (membership, wager create/accept/claim/refund, admin,
  stats, key registry, sanctions screen, event source). Out-of-scope = the
  deprecated v1 legacy network's read-only views, subgraph/indexer paths, and
  the disconnected-state default (which legitimately uses the primary network).
- **Rationale**: Matches the spec's Out of Scope; avoids touching legacy/indexer
  surfaces that are not part of the testnet/mainnet consistency guarantee.

## Call-site audit (the migration work-list)

Build-bound resolution found in user-facing paths (`getContractAddress(` count;
`getProvider()` = argless/build-bound). `✔` = already chain-aware via PR #643.

| File | Build-bound sites | Notes |
|---|---|---|
| `components/ui/PremiumPurchaseModal.jsx` | ✔ | tier read + purchase already chain-aware |
| `utils/blockchainService.js` | 12 `getContractAddress`, several `getProvider()` | mixed: `hasRoleOnChain`/`getUserTierOnChain`/`purchase…` ✔; remaining reads (stats, key registry, role-manager, friend factory, etc.) to migrate or take `chainId` |
| `components/fairwins/MyMarketsModal.jsx` | 5 | wager list/details |
| `hooks/useFriendMarketCreation.js` | 3 | wager creation (write path) |
| `components/fairwins/FriendMarketsModal.jsx` | 3 | markets list |
| `pages/MarketAcceptancePage.jsx` | 2 | accept flow (write path) |
| `components/AdminPanel.jsx` | 2 | admin reads |
| `utils/keyRegistryService.js` | 2 | key registration |
| `hooks/useTreasuryVault.js` | 1 | admin treasury reads |
| `hooks/useTierPrices.js` | 1 | tier prices/limits shown in purchase modal |
| `hooks/useSiteStats.js` | 1 + `getProvider()` | stats display |
| `hooks/useRoleDetails.js` | 1 | reads via wallet `provider` but **build-bound address** → mismatch |
| `hooks/useNullifierContracts.js` | 1 | nullifier/privacy |
| `utils/sanctionsScreen.js` | 1 | compliance screen |
| `data/wagers/EventsSource.js` | 1 + `getProvider()` | event scanning source |
| `components/wallet/WalletButton.jsx` | `getProvider()` | balance/display — confirm chain-scoped |

Cache: `utils/roleStorage.js` keys by wallet address only (`getRoleStorageKey(walletAddress)`) → must include `chainId`.

Runtime signal confirmed present: `useWeb3()` exposes `chainId`; `getProvider(chainId)` and `getContractAddressForChain(name, chainId)` already implemented in `config/contracts.js` / `blockchainService.js`.

**Output**: All NEEDS CLARIFICATION resolved. Ready for Phase 1 design.

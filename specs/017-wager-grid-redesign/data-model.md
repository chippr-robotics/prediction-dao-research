# Phase 1 Data Model: My Wagers — Card Grid Redesign

This is a presentation feature; there is **no persistent data model change**. The
entities below are **view models** derived in `MyMarketsModal`/`WagerCardGrid`
from the existing wager objects supplied by the data layer (`useMyWagers` /
`FriendMarketsContext` + decryption hooks). No new fields are written on-chain or
to the subgraph.

## Source object: `market` (existing, consumed as-is)

Produced today by `categorizedMarkets` in `MyMarketsModal`. Relevant fields the
card reads (non-exhaustive, all already present):

| Field | Meaning | Card use |
|-------|---------|----------|
| `id` / `wagerId` | wager identifier | card key, "Wager ID", action targets |
| `stakeAmount` | stake value | prominent amount |
| `stakeTokenSymbol` | real token symbol (e.g. network default) | unit next to amount |
| `description` / `decryptedMetadata` / `metadata` | title/terms | title (via `getMarketDisplayTitle`), terms when revealed |
| `computedStatus` | mapped `WagerStatus` | status pill (`getStatusLabel`/`getStatusClass`) |
| `winner`, `paid`, `creator`, `participants`, `arbitrator` | roles/outcome | outcome (`getRowOutcome`), action gating |
| `tradingEndTime` / `endDate` / `acceptanceDeadline` | timing | "Ends"/"Settled", time-left (`getTimeRemaining`) |
| `isEncrypted`, `metadataCipher`, `ipfsCid` | encryption state | locked vs. revealed, decrypt trigger |
| `chainId` | source network | already filtered to active chain upstream |

## View model: `WagerCardVM` (computed per card)

Derived in `WagerCardGrid`/`WagerCard` from `market` + UI state. Pure display; not
persisted.

| Field | Type | Derivation / rule |
|-------|------|-------------------|
| `id` | string | `market.id` |
| `stake` | string | formatted `market.stakeAmount` |
| `tokenSymbol` | string | `market.stakeTokenSymbol` (real symbol; never hardcoded) |
| `title` | string | `getMarketDisplayTitle(market)`; truncated w/ ellipsis; privacy placeholder when locked |
| `status` | enum `WagerStatus` | `market.computedStatus` |
| `statusLabel` / `statusClass` | string | `getStatusLabel` / `getStatusClass` |
| `outcome` | `{label,tone}` \| null | History only, `getRowOutcome(market, account)` |
| `timeLabel` | string | "Ends"/"Settled" value; `getTimeRemaining` / `Expired` |
| `isOpen` | boolean | `grid.openId === id` |
| `encState` | enum | `locked` \| `decrypting` \| `revealed` \| `unavailable` (from `isEncrypted`, `decryptedMetadata`, `isDecrypting(id)`, decrypt-failure flag) |
| `terms` | string \| '' | revealed only |
| `meta` | `Meta[]` | opponent/outcome, ends/settled, wager id, creator |
| `actions` | `Action[]` | from `availableActions(market, role, status)` (see below) |
| `showMetaLinePreview` | boolean | `density==='comfortable' && !isOpen && hasOpponent` |
| `busy` | boolean | `claimingId===id || refundingId===id` |
| `error` | string \| null | `claimError?.id===id ? claimError.message : refundError?...` |

### `Meta` (2-column grid item)

`{ label: string, value: string, color?: string }` — labels: Opponent (or Outcome
in History), Ends (or Settled in History), Wager ID, Creator.

### `Action` (button in expanded card)

`{ kind, label, variant, onClick, disabled }` where:

- `kind` ∈ `accept | decline | resolve | cancel | clearExpired | claim | refund | respondDraw | viewDetails`
- `variant` ∈ `primary | danger | success | ghost`
- `onClick` → the existing modal callback for that kind (no new on-chain logic)
- `disabled` ← `busy` for in-flight claim/refund

### Action visibility rules (reuse existing predicates)

| Action | Shown when (same as table today) |
|--------|----------------------------------|
| Accept / Decline | `canAccept(market)` (invited, not creator, not yet accepted, not expired) |
| Resolve / Settle | `showActions && canResolve(market)` OR activity kind `resolve` |
| Respond to Draw | activity kind `respondDraw` |
| Claim winnings | `isWinnerUnpaid(market, account)` (resolved, viewer is winner, unpaid) |
| Refund | activity kind `refund` && not expired-offer case |
| Reclaim & Clear | `computedStatus === EXPIRED && onClearExpired` (creator reclaims on-chain) |
| Cancel | creator of a pending offer (per existing logic) |
| View details | always (opens `MarketDetailView` via `onSelect`) |

## View state: `MyWagersViewState` (transient UI only)

| Field | Owner | Default | Notes |
|-------|-------|---------|-------|
| `activeTab` | `MyMarketsModal` | `participating` | existing |
| `statusFilter` | `MyMarketsModal` | `all` | existing |
| `sortKey` | `MyMarketsModal` | `newest` | existing (`newest`/`endingSoon`/`stakeHighToLow`) |
| `density` | `MyMarketsModal` | `compact` | **new**; mirrored to `sessionStorage` `fairwins.myWagers.density` |
| `openId` | `WagerCardGrid` | `null` | **new**; single open card; reset on tab change |
| `selectedMarketId` | `MyMarketsModal` | `null` | existing; drives `MarketDetailView` |

## State transitions

- **Collapsed → Expanded**: click card / press Enter/Space ⇒ `openId = id`; any
  other open card collapses.
- **Expanded → Collapsed**: click same card / Escape within card ⇒ `openId = null`.
- **Locked → Decrypting → Revealed**: decrypt click ⇒ `onDecrypt(id)`; while
  pending `isDecrypting(id)`; on success `decryptedMetadata` present ⇒ Revealed; on
  failure ⇒ `unavailable` (terms-unavailable + retry, preserving FR-010).
- **Tab change**: `openId → null`, `selectedMarketId → null` (existing reset).
- **Density toggle**: flips `compact ↔ comfortable`; no other state altered.

## Invariants

- At most one `openId` non-null per grid (FR-007).
- `tokenSymbol` and amounts are real values; no placeholder/"USDC"/mock data (III).
- Cards reflect only active-network wagers (upstream filter unchanged) (III, SC-007).
- Action availability/authorization identical to the current table (no new rights).

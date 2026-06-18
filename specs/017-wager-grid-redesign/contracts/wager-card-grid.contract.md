# UI Contract: `WagerCardGrid` / `WagerCard`

This feature exposes no network/API contract. The relevant interface is the React
**component prop contract**. `WagerCardGrid` is a drop-in replacement for the
existing `MarketsTable`: it accepts the **same props** plus `density`, so the four
call sites in `MyMarketsModal` change only the element name (and pass `density`).

## `WagerCardGrid` props

Mirrors `MarketsTable` exactly (see `MyMarketsModal.jsx`), so behavior/wiring is
preserved:

| Prop | Type | Notes |
|------|------|-------|
| `markets` | `Market[]` | already-categorized, filtered, sorted list for the active tab |
| `onSelect` | `(market) => void` | opens `MarketDetailView` (backs "View details") |
| `getStatusClass` | `(status) => string` | reused from modal |
| `getStatusLabel` | `(status) => string` | reused |
| `getTimeRemaining` | `(endTime) => string\|null` | reused |
| `formatDate` | `(v) => string` | reused |
| `showActions` | `boolean` | per-tab (Created/Arbitrating true) |
| `showOutcome` | `boolean` | History tab |
| `showResolveCountdown` | `boolean` | Participating/Created |
| `canResolve` | `(market) => boolean` | reused predicate |
| `canAccept` | `(market) => boolean` | reused predicate |
| `isCreatorOfPending` | `(market) => boolean` | reused predicate |
| `onResolve` | `(market) => void` | opens resolution modal |
| `onAccept` | `(market) => void` | opens acceptance modal |
| `onClearExpired` | `(market) => void` | reclaim+clear (on-chain) |
| `onClearAllExpired` | `(markets) => void` | bulk clear under Expired filter |
| `onClaim` | `(market) => void` | claim payout (on-chain) |
| `claimingId` | `string\|null` | in-flight claim id |
| `claimError` | `{id,message}\|null` | per-row claim error |
| `onRefund` | `(market) => void` | claim refund (on-chain) |
| `refundingId` | `string\|null` | in-flight refund id |
| `refundError` | `{id,message}\|null` | per-row refund error |
| `statusFilter` | `string` | active status filter (drives clear-all visibility) |
| `account` | `string` | connected wallet |
| **`density`** | `'compact'\|'comfortable'` | **NEW** — collapsed-card detail level |

**Behavioral contract**:
- Renders one `WagerCard` per `markets[i]`.
- Owns single-open accordion state (`openId`); expanding one collapses others.
- Surfaces the "clear all expired" affordance under the Expired filter exactly as
  the table does today (`statusFilter === EXPIRED && onClearAllExpired`).
- Adds no network calls; all side effects flow through the passed callbacks.

## `WagerCard` props

| Prop | Type | Notes |
|------|------|-------|
| `market` | `Market` | source object |
| `vm` (or derived inline) | `WagerCardVM` | see data-model.md |
| `isOpen` | `boolean` | controlled by grid |
| `onToggle` | `() => void` | grid sets `openId` |
| `onSelect` | `() => void` | "View details" → `MarketDetailView` |
| `onDecrypt` | `(id) => void` | existing lazy-decrypt trigger |
| `isDecrypting` | `boolean` | from `isMarketDecrypting(id)` |
| `density` | `'compact'\|'comfortable'` | preview meta-line on/off |
| action callbacks + `*ingId` + `*Error` | as above | per-card actions/busy/errors |

## Accessibility contract (WCAG 2.1 AA)

- Grid is a list of cards; each card has an accessible name (stake + title +
  status) and is reachable/operable by keyboard.
- The collapsed card header is a button (`role`/`tabindex`, Enter/Space toggles),
  with `aria-expanded` reflecting open state and `aria-controls` pointing at the
  expanded region.
- Status is conveyed by **text label + color**, never color alone.
- Action buttons are real, focusable buttons with discernible labels; busy state
  uses `aria-busy`/`disabled`; errors are associated with the card and announced.
- "View details" is a button/link with a clear accessible name.

## Backward-compatibility contract

- `MyMarketsModal` public props (`isOpen`, `onClose`, `friendMarkets`,
  `initialSelectedMarketId`) and its entry points (Dashboard, FriendMarketsModal)
  are unchanged.
- `MarketDetailView`, `ResolutionModal`, `MarketAcceptanceModal` are unchanged and
  still reachable.
- `MarketsTable` is removed only after all call sites are migrated.

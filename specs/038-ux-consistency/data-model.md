# Data Model: UX Consistency Harmonization (038)

No on-chain or server-side data changes. All entities are frontend-local.

## Entity: QuickAccessCardPreference

Device-scoped record of which quick access cards the user has hidden.

| Field | Type | Notes |
|---|---|---|
| storage key | string constant | `fairwins_quickaccess_v1` (localStorage) |
| hiddenCardIds | `string[]` (serialized JSON) | ids of cards the user turned OFF |

**Card id domain** (from `Dashboard.jsx` quick action list):
`create-1v1-friends`, `create-1v1-oracle`, `create-offer`, `open-challenge`,
`create-pool`, `enter-phrase`, `my-wagers`, `scan-qr`, `share-account`.

**Validation / semantics**
- Read: parse failures or non-array payloads → treat as empty (all visible).
- Unknown ids in storage are ignored (cards may be renamed/removed later).
- Ids absent from the set are visible — new cards default to visible (FR-015).
- Write: store the full hidden set on every toggle; storage unavailable
  (private browsing) degrades to in-memory state for the session.

**State transitions**
```
all-visible (default) --toggle off--> partially hidden --toggle off (last)--> all-hidden
all-hidden --restore from Preferences / empty-state link--> partially hidden / all-visible
```

## Entity: DeadlineMilestone

A named point on a wager timeline; the unit manipulated by dot-dragging and
the SetTimeModal. Runtime-only (component state), never persisted.

| Field | Type | Notes |
|---|---|---|
| key | `'accept' \| 'end' \| 'resolve'` | which milestone |
| label | string | flow-specific ("Accept by", "Join by", "Ends", "Resolve by") |
| value | epoch ms | current timestamp |
| min / max | epoch ms | allowed range, from flow bounds (`WAGER_DEFAULTS`, `acceptMaxHours`, `resolveMaxHours`) |
| editable | boolean | derived milestones (e.g. 1v1 "Accept by"/"Resolve by") are read-only |
| phaseToken | CSS token name | `--timeline-accept` / `--timeline-active` / `--timeline-resolve` |

**Invariants**
- `min ≤ value ≤ max` after every interaction (drag, keyboard, modal) —
  identical clamping in all entry paths (FR-004/FR-006).
- Ordering: `accept < end/resolve` per flow; minimum separation enforced when
  dots approach each other (edge case: dots remain individually grabbable).
- Derived milestones recompute from their source milestone, never drift.

## Entity: TimelinePhaseToken

Global design tokens added to `frontend/src/theme.css` `:root`.

| Token | Value | Replaces |
|---|---|---|
| `--timeline-accept` | `var(--brand-secondary)` (#4C9AFF) | scoped `--fm-accept: #E8910C` (amber) |
| `--timeline-active` | `var(--brand-primary)` (#36B37E) | scoped `--fm-active: #36B37E` (literal) |
| `--timeline-resolve` | `#8C7CF0` | scoped `--fm-resolve` (now defined once, globally) |

Light + dark theme values must both pass AA contrast against their tile
backgrounds; tile tint backgrounds derive from the same tokens.

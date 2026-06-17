# Contract: Report History Store (`data/reports/reportHistoryStore.js`)

`localStorage`-backed metadata store for report history. Mirrors
`data/notifications/activityStore.js` (versioned, chainId-scoped keys). Stores **metadata
only** — never rendered documents (research D4).

## Key scheme

```text
fw_user_<lowercased_address>_tax_report_history_v1_<chainId>  →  JSON ReportHistoryEntry[]
```

Strict scoping: a store call for `(address, chainId)` reads/writes only that key. No
aggregation across accounts or networks (FR-012/FR-014).

## API

```text
list(address, chainId) → ReportHistoryEntry[]      // newest first; [] if none/corrupt
add(address, chainId, entry) → ReportHistoryEntry   // persist; returns stored entry (with id, createdAt)
remove(address, chainId, id) → void                 // delete one entry (FR-011)
```

`ReportHistoryEntry`: `{ id, periodKind, from, to, label, chainId, createdAt }` (see
`data-model.md`).

## Behavior / guarantees

- `add` is called only after a successful generation; it stores the **period metadata**, not
  the document.
- `remove` deletes the entry so it no longer appears in `list`; underlying wager data is
  unaffected (Story 2 AC3 / FR-011).
- Re-opening an entry calls `buildReport` with the entry's period → equivalent document
  (FR-010).
- Corrupt/unparseable JSON is treated as an empty list (defensive); store operations never
  throw into the UI.
- No quota assumptions beyond standard `localStorage`; entries are small (metadata only).

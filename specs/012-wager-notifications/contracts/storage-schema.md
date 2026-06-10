# Contract: localStorage Schema

**Feature**: 012-wager-notifications

## Key

```
fw_user_<lowercased-address>_wager_activity_v1_<chainId>
└──────── userStorage prefix ───────┘└── feature key, chain-scoped ──┘
```

- Account scoping: provided by `userStorage.js` (existing helper, unchanged).
- Network scoping: chainId embedded in the feature key (userStorage is not
  network-aware) — satisfies FR-009.
- `useLocalStorage = true` on all `userStorage` calls (survives sessions).

## Value (JSON, version 1)

```json
{
  "version": 1,
  "lastPolledAt": 1765432100000,
  "snapshots": {
    "42": {
      "id": "42",
      "state": "resolvable",
      "status": "active",
      "winner": null,
      "paid": false,
      "acceptanceDeadline": 1765400000000,
      "resolveDeadlineTime": 1765500000000,
      "tradingEndTime": 1765327200000,
      "drawProposedBy": null,
      "snappedAt": 1765432100000
    }
  },
  "entries": [
    {
      "id": "42:won-claimable",
      "type": "won-claimable",
      "wagerId": "42",
      "message": "You won 'Lakers in 6'! Claim 50 USDC",
      "severity": "success",
      "actionable": true,
      "createdAt": 1765432100000,
      "read": false
    }
  ],
  "deadlineWarnings": {
    "42": { "resolution": 1765432100000 }
  },
  "drawScanBlock": 88123456
}
```

## Rules

| Concern | Rule |
|---|---|
| Size cap | `entries` pruned to **100** newest on every save. `snapshots` pruned of wagers no longer returned by the poll AND in terminal state for > 30 days (keep terminal snapshots short-term so terminal transitions aren't re-announced). |
| Versioning | `version !== 1` and no known migration ⇒ reset to default store. Future migrations bump version and transform in `activityStore.js` only. |
| Corruption | JSON parse failure ⇒ default store (log via console.warn; no user-facing error — chain state rebuilds badges, FR-012). |
| Write discipline | Only `activityStore.js` reads/writes this key. Writes happen after a successful poll, on markRead, and on warning emission — never during render. |
| Multi-tab | Last-writer-wins is acceptable for MVP (same data re-derives next poll). No `storage`-event syncing in v1. |
| Privacy | Messages may embed decrypted descriptions ONLY if already decrypted in-session at entry creation; otherwise the encrypted fallback label is stored. Never store ciphertext keys or decrypted payloads beyond the message string. |
| Removal | Disconnect does not clear stores (reconnect restores). `clearUserPreferences(address)` (existing helper) removes them with the rest of the user's prefs. |

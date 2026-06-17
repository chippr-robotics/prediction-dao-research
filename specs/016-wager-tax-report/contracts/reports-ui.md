# Contract: Reports UI (WalletPage "Tax Reports" tab)

Defines the user-facing behavior and accessibility contract for the report feature within My
Account (WalletPage). Components: `TaxReportsPanel`, `ReportPeriodSelector`,
`ReportHistoryList`; state via `useTaxReport`.

## Entry point

- New tab on `pages/WalletPage.jsx` following the existing tab pattern: a
  `role="tab"` button (`aria-selected`) labeled "Tax Reports" and a matching
  `role="tabpanel"` rendering `TaxReportsPanel` (FR-001).
- Visible only to a connected/signed-in account; the report always targets that account
  (FR-012).

## ReportPeriodSelector

- Preset options (named, selectable): Last month, Last quarter, Last year, Last calendar
  year; plus a Custom from/to date input (FR-002).
- Validates the range client-side; an inverted or future range shows a clear, accessible
  error message and disables generation (FR-013). No misleading/partial report is produced.

## Generate flow (`useTaxReport`)

States: `idle → generating(progress) → ready | error`.
- On generate: resolve+validate period → `buildReport(...)` with `onProgress` → on success,
  render PDF + CSV, offer download (FR-007), and `reportHistoryStore.add(...)` (FR-010).
- Progress is surfaced while chain data is fetched (SC-001 expectation).
- Empty result → a clear "no activity in this period" state with a still-valid (empty)
  downloadable report (Story 1 AC4).
- Error (chain unreachable) → explicit error message; no silent truncation.

## ReportHistoryList

- Lists saved entries for the active account+chainId, newest first, showing period label +
  generation date (FR-010).
- Per entry: **Re-download** (regenerates via `buildReport`, FR-010) and **Remove** (calls
  `reportHistoryStore.remove`; entry disappears, data untouched — FR-011 / Story 2 AC3).

## Accessibility & consistency (Constitution V)

- WCAG 2.1 AA: keyboard-operable tabs/controls, labeled inputs, focus management on
  state changes, status/progress announced via `aria-live`.
- ESLint clean; reuse WalletPage tab styling conventions.
- All addresses/network names come from synced config (`config/contracts.js`,
  `config/networks.js`); active `chainId` from `useChainId()` — no hardcoding, no
  cross-network leakage (Constitution III/V).

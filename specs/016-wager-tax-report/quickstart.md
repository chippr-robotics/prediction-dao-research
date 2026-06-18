# Quickstart & Validation: Wager Tax & Activity Report

How to validate the feature end-to-end. References `contracts/` and `data-model.md` rather
than restating field details. No implementation code here.

## Prerequisites

- Repo dependencies installed (`npm install` at root and in `frontend/`).
- New frontend deps present: `jspdf`, `jspdf-autotable`, `papaparse`, `file-saver`
  (added under `frontend/`).
- A configured network with synced contract artifacts: `config/contracts.js` populated via
  `npm run sync:frontend-contracts -- --network <net> --chainId <id>`.
- `VITE_SUBGRAPH_URL` set for the active network (enumeration); RPC reachable for
  logs/receipts.
- A test wallet that has at least: one resolved wager (deposit + payout) and one open wager
  (deposit only), ideally spanning two different months.

## Automated tests (primary gate)

```bash
npm run test:frontend          # Vitest — must pass (Constitution II/IV)
```

Expected coverage (suites under `frontend/src/test/reports/`):
- Period resolution + validation (`reportPeriods`): presets map to UTC boundaries; inverted/
  future ranges rejected.
- Transfer derivation (`transferDerivation`): each lifecycle event → correct
  direction/from/to (research D2).
- Receipt enrichment (`receiptEnrichment`): txHash + exact timestamp resolved; fee present
  when the user sent the tx, `null` + reason when they didn't.
- Valuation + totals (`valuation`, `reportBuilder`): $1.00 par values; per-ticker + overall
  totals reconcile exactly to line items (SC-004).
- Renderers (`csvReport`, `pdfReport`): all 11 columns present; full txHash/addresses not
  truncated; header + disclaimer included.
- History store (`reportHistoryStore`): add/list/remove; strict address+chainId scoping;
  corrupt store → empty.

## Manual validation

```bash
npm run frontend               # start the dev server
```

1. Connect the test wallet; open **My Account** (WalletPage) → **Tax Reports** tab.
2. **Preset period** — choose "Last month"; Generate. Verify (Story 1):
   - Only transfers from the previous calendar month appear; other months excluded.
   - Each row shows timestamp, ticker, amount, USD value ($1.00 par), cost basis, fee (or
     "N/A — not sent by you"), full txHash, sending + receiving addresses.
   - Per-ticker + overall totals match the visible rows.
   - PDF and CSV download; reopened files are readable and complete.
3. **Custom range** — pick a from/to spanning both test wagers; Generate; confirm inclusive
   range filtering and that the open wager shows its deposit row only.
4. **Invalid range** — set `to` before `from` (and a future `to`); confirm a clear error and
   no report produced.
5. **Empty period** — pick a period with no activity; confirm a valid "no activity" report,
   not an error.
6. **History** (Story 2): confirm each generated report appears with its period + date;
   re-download reproduces equivalent content; **Remove** deletes the entry (it disappears;
   your wagers are unaffected).
7. **Network scoping**: switch network; confirm the history list and report only reflect the
   active chain (no cross-network rows).

## Success signals (maps to spec SC)

- Report generated + downloaded in under ~60s for a typical period (SC-001).
- 100% in-period / 0% out-of-period rows across presets and custom ranges (SC-002).
- No required field blank unless explicitly flagged (SC-003).
- Totals reconcile to line items (SC-004).
- Reports contain only the signed-in account's activity (SC-005).

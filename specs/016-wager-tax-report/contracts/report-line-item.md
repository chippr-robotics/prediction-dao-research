# Contract: Report Line Item & Renderers

Defines the row shape both renderers consume and the renderer interfaces. Keeps PDF and CSV
output consistent (same data, two presentations).

## TransferLineItem (row shape)

See `data-model.md` → TransferLineItem. Canonical column order for both outputs:

1. `timestamp` (ISO 8601, UTC)
2. `direction` (Deposit / Payout / Refund)
3. `tokenTicker`
4. `amount` (decimal, token units)
5. `usdValue` (USD, $1.00 par)
6. `costBasis` (USD)
7. `feeNative` (native token, or "N/A — not sent by you")
8. `txHash` (full hash)
9. `fromAddress`
10. `toAddress`
11. `wagerId`

## Contract: csvReport.render

```text
render(report: ActivityReport) → string   // RFC 4180 CSV (papaparse)
```
- Header row = the 11 columns above; one row per line item, then a totals block.
- Includes a leading metadata comment/section: account, network, period, generatedAt,
  valuation note, disclaimer (FR-008/FR-009).
- Full, unabbreviated `txHash` and addresses (FR-006) — no truncation.

## Contract: pdfReport.render

```text
render(report: ActivityReport) → Blob     // application/pdf (jspdf + autotable)
```
- Header section: account, network, reporting period, generatedAt (FR-008).
- Body: the line-item table (columns above); long hashes/addresses wrap or use a smaller
  monospaced cell — never truncated such that the value is unrecoverable (FR-006).
- Footer/summary: per-ticker + overall totals (FR-008), the $1.00 par valuation note, and the
  "informational record, not tax advice" disclaimer (FR-005/FR-009).
- Layout intent mirrors the attached sample document (grouped Transaction Mechanics /
  Financial Values / Blockchain Evidence framing).

## Download trigger

Both renderers hand their output to `file-saver` `saveAs(blobOrCsv, fileName)` where
`fileName = wager-report_<network>_<from>_<to>.<ext>` (FR-007).

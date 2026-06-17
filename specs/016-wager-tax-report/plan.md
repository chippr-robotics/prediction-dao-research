# Implementation Plan: Wager Tax & Activity Report Generation (user self-service)

**Branch**: `claude/wager-report-generation-spec-2fvrhn` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-wager-tax-report/spec.md`

## Summary

Give a signed-in user a self-service way to produce a downloadable wager activity / tax
report for a chosen period (custom from/to range or a named preset like "last month" /
"last calendar year"). The report lists every wager-related stablecoin transfer the user
took part in — stake deposits, payouts, and refunds — each with Transaction Mechanics
(timestamp, stablecoin ticker, amount), Financial Values (USD fair market value at a $1.00
par baseline for v1, cost basis, network fees), and Blockchain Evidence (full transaction
hash, sending + receiving addresses). Reports are reachable from the My Account area
(WalletPage), are re-listable as a history of metadata, regenerate on demand from immutable
chain data, and individual history entries can be removed by the user.

**Technical approach**: This is a **frontend-only** feature (no `contracts/` or `subgraph/`
changes in v1). The authoritative data path is **on-chain event logs + transaction
receipts** read through `ethers`, because the two report fields the subgraph cannot supply —
the full **transaction hash** (not persisted by the mappings) and the **network/gas fee**
(The Graph mappings have no access to receipt gas data) — are both available only from
receipts. The existing subgraph layer (`WagerRepository`) is reused to cheaply enumerate
which wagers the user participated in within the period; per-transfer details (exact
timestamp, txHash, from/to, fee) are then resolved from chain logs/receipts. Output is
rendered to PDF and CSV and downloaded in the browser; report-history **metadata** is stored
in `localStorage` keyed by wallet address + chainId, mirroring the existing
`activityStore.js` pattern.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 19.2, Vite

**Primary Dependencies**: Existing — `ethers` v6, `wagmi` v3, the wager data layer
(`WagerRepository` / `SubgraphSource` / `EventsSource`), network + contract config
(`config/networks.js`, `config/contracts.js`). New (frontend) — a PDF generator
(`jspdf` + `jspdf-autotable`), a CSV generator (`papaparse`), and `file-saver` for the
download trigger.

**Storage**: Browser `localStorage` for report-history **metadata** only (no rendered
documents stored); key scheme `fw_user_<address>_tax_report_history_v1_<chainId>`. Source
data is read live from chain (RPC via wagmi/ethers) and the subgraph; nothing new is
persisted on-chain or in any backend.

**Testing**: Vitest (`frontend/src/test/`), `.test.js[x]` convention; mock `global.fetch`
for subgraph responses and the existing ethers/provider mocks for logs/receipts; add a
`fixtures/wagers.js` fixture for sample wager + transfer data.

**Target Platform**: Web SPA (modern evergreen browsers), served as static assets via nginx
on Cloud Run. No backend.

**Project Type**: Single-page web frontend (frontend-only; chain + subgraph are external
data sources).

**Performance Goals**: A user can generate and download a typical-period report in under
~60s (SC-001), including the bounded set of receipt look-ups, with visible progress while
chain data is fetched. No regression to existing pages.

**Constraints**: Frontend-only — no backend, no contract change. Contract addresses/ABIs
MUST come from the synced artifacts (`config/contracts.js`, generated ABIs), never
hardcoded (Constitution V). Data MUST be scoped to the active network/chainId with no
testnet/mainnet leakage (Constitution III). UI MUST meet WCAG 2.1 AA. The $1.00 par
valuation and any unavailable field (e.g., fee for a transaction the user did not send) MUST
be surfaced honestly, never silently faked (Constitution III; FR-015/FR-005).

**Scale/Scope**: One new "Tax Reports" tab on WalletPage; a report-builder/data module; a
PDF renderer, a CSV renderer; a localStorage history store with delete; one hook; period
preset utilities; associated Vitest suites. v1 targets the single active network.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Security-First Smart Contracts** | **N/A / PASS** — no `contracts/` changes. The feature is read-only over existing on-chain state; it never moves funds, changes access control, or touches oracle resolution. No new value-bearing code. |
| **II. Test-First & Coverage** | **PASS (committed)** — Vitest unit/integration tests are written alongside each module: period-preset resolution, transfer derivation from events, fee/timestamp enrichment, $1.00 valuation + totals, CSV/PDF content, localStorage history (add/list/remove), network scoping, and empty/invalid-range states. No behavior is "done" without tests. |
| **III. Honest State, No Mocks/Placeholders** | **PASS** — report rows come from real chain logs/receipts; open/unresolved/refunded/drawn wagers are represented truthfully as their actual transfers; the $1.00 par baseline is disclosed in the document and any indeterminable field is flagged rather than faked (FR-005/FR-015/FR-009). History and all queries are scoped to the active chainId; localStorage keys include chainId to prevent cross-network leakage. Mock data lives only in test fixtures. |
| **IV. Fail Loudly in CI** | **PASS** — no `continue-on-error` on lint/test/build; new tests run in the existing frontend CI job. |
| **V. Accessible, Consistent Frontend** | **PASS (committed)** — the new tab and report UI follow the existing WalletPage tab a11y pattern (`role="tab"/"tabpanel"`, `aria-selected`), meet WCAG 2.1 AA, keep ESLint clean, and consume contract addresses/ABIs only from the synced artifacts. |

**Additional constraints check**: Introducing the `jspdf` / `papaparse` / `file-saver`
libraries is a frontend dependency addition (not a new *core* technology / stack change) and
is justified in `research.md` (no in-house PDF/CSV generation exists; these are small,
well-maintained, browser-side libraries). Key-management, archived-code, and deployment
constraints are unaffected (no keys, no archive imports, no new deployments).

**Result**: PASS — no violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/016-wager-tax-report/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entities, fields, derivation & validation rules
├── contracts/           # Phase 1 — internal module/data/UI contracts
│   ├── report-line-item.md
│   ├── report-builder.md
│   ├── report-history-store.md
│   └── reports-ui.md
├── quickstart.md        # Phase 1 — manual + automated validation guide
└── checklists/
    └── requirements.md  # Spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

Frontend-only. New and touched paths:

```text
frontend/src/
├── pages/
│   └── WalletPage.jsx                      # add "Tax Reports" tab (button + panel)
├── components/wallet/
│   ├── TaxReportsPanel.jsx                 # tab container: period picker + actions + history
│   ├── ReportPeriodSelector.jsx            # presets + custom from/to, validation
│   └── ReportHistoryList.jsx               # list of saved report metadata + re-download + delete
├── data/reports/
│   ├── reportBuilder.js                    # orchestrates: enumerate → derive → enrich → value → totals
│   ├── transferDerivation.js               # wager lifecycle events → transfer line items (from/to/amount/type)
│   ├── receiptEnrichment.js                # resolve txHash, precise timestamp, gas fee via logs/receipts
│   ├── valuation.js                        # $1.00 par baseline FMV + cost basis (structured for future feed)
│   ├── reportHistoryStore.js               # localStorage metadata: add/list/remove (per address+chainId)
│   ├── pdfReport.js                        # render line items + header + totals + disclaimer to PDF
│   └── csvReport.js                        # render line items to CSV
├── hooks/
│   └── useTaxReport.js                     # state machine: idle → generating(progress) → ready/error
├── utils/
│   └── reportPeriods.js                    # named-period → {from,to} resolution (UTC), range validation
└── test/
    ├── fixtures/wagers.js                  # sample wagers + lifecycle logs + receipts
    └── reports/*.test.js[x]                # unit/integration suites for the modules above
```

No changes under `contracts/`, `subgraph/`, `scripts/`, or `deployments/` in v1.

**Structure Decision**: Web frontend feature implemented entirely within `frontend/src`,
adding a self-contained `data/reports/` module plus a WalletPage tab and supporting
components/hooks/utils, with all tests under the existing `frontend/src/test` tree. This
reuses the established repository/source data layer and the WalletPage tab + localStorage
patterns rather than introducing new architecture.

## Complexity Tracking

> No constitution violations — section intentionally empty.

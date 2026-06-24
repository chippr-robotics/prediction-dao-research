# Spec 028 — Expansion validation results (T097)

Execution of `quickstart.md` → "Expansion validation — administration portal (US6–US13)", scenarios A–E,
against **real chain state** (no mock data). Local logic is validated by the Hardhat suite running on a real
local chain; Mordor (63) is validated by real on-chain reads of the deployed factory + tokens.

## Environment

- Contracts: `npm test` → **391 passing, 5 pending** (local Hardhat chain, real state).
- Frontend: `npm run test:run` → full Vitest suite green (incl. token module + axe).
- Subgraph: codegen + build green; Matchstick `subgraph/tests/token.test.ts` green (Docker).
- Storage layout: `npm run check:storage-layout` → TokenFactory upgrade-safe.
- Mordor read: `https://rpc.mordor.etccooperative.org`, factory `0x5bdf74Ce98D41bf35192c20B25ACd561C75CFe62`.

## Real Mordor on-chain read (subgraph-less network)

Discovery reads the factory registry directly over RPC (Mordor has no subgraph), confirming real state:

```
chainId: 63 · factory has code · tokenCount: 3
#3 tst-1404 (TST1404)  Restricted ERC-1404  model v2  supply 100.0   uncapped
#2 Test token NFT (TST-n) Open ERC-721       model v2
#1 Test token (TST)    Open ERC-20          model v2  supply 3600.0  uncapped
```

All three (created by the deployer during click-through) are detected as **v2 role-based** with live supply,
`cap()`/`capped()` reads, and registry-over-RPC discovery — exactly the subgraph-less path (FR-023/FR-043).

## Scenario coverage

| # | Scenario | How validated |
|---|----------|---------------|
| **A** | Role-based admin + caps (US6/US9): roles at creation, mint-to-cap revert, grant/revoke, ownership transfer/renounce | `test/tokens/OpenERC20V2.test.js`, `RestrictedERC20V2.test.js`, `test/integration/tokens/v2-create-admin.test.js`, `test/upgradeable/TokenFactory.upgrade.test.js` (local real chain) + Mordor read of v2 role model / cap state |
| **B** | Transfer controls + compliance (US7/US8): pause, freeze list, eligibility single+batch, default message, detector/transfer parity | `test/tokens/v2-transfer-controls.test.js`, `test/integration/tokens/v2-compliance.test.js` (asserts `detectTransferRestriction` matches the actual transfer outcome, SC-003) |
| **C** | Batch distribute (US11): `batchMint`/`batchTransfer`, preview parity, `MAX_BATCH` revert (no truncation) | `test/tokens/OpenERC20V2.test.js` (batch + `BatchTooLarge`) + `frontend …/DistributePanel.test.jsx` (preview count/total, over-limit surfaced) |
| **D** | Holders + activity (US10/US12): cap table + activity from indexing; truthful subgraph-less fallback | `subgraph/tests/token.test.ts` (Transfer→Holder, events→TokenActivity); `frontend …/HoldersPanel.test.jsx` + `ActivityPanel.test.jsx` (loaded state **and** `available:false` truthful-disable, no fabricated rows); Mordor read confirms the subgraph-less path |
| **E** | Portal IA + theme + contract surface (US1/US5/US13) | `frontend …/TokenDetailView.test.jsx` (capability-gated sub-tabs), `ContractPanel.test.jsx` (metadata, truthful non-"verified" verification, Mordor-only deployments, copy address/ABI), `tokens.accessibility.test.jsx` (axe); theme-awareness via `tokens.css` mapped onto `theme.css` light/dark variables |

## Honest scope notes

- **Local (1337) A–C** are executed end-to-end by the Hardhat unit + integration suites — these are real
  transactions against a real local chain (no mocks), which is exactly the quickstart's intent.
- **Mordor (63)** is validated by real on-chain **reads** (above). The wallet-signed **write** actions on Mordor
  (creating the three tokens, click-through) were performed manually with the deployer wallet during the earlier
  click-through; automated Mordor write-validation from this environment needs the floppy keystore (not mounted
  here), so it is intentionally not re-run automatically — the reads confirm the resulting real state.
- **Snapshots/dividends**: out of scope (OZ 5.x removed `ERC20Snapshot`) — not validated, by design.
- **Lighthouse**: not runnable headless here; axe covers WCAG structure/ARIA, contrast is inherited from the
  app's AA-compliant `theme.css`. See [security-analysis.md](security-analysis.md).

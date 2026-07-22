# Implementation Plan: Legacy Account Recovery

**Branch**: `claude/account-recovery-sheets-6x10c5` | **Date**: 2026-07-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/062-legacy-account-recovery/spec.md`

## Summary

Rename the **"Backup & Security"** section to **"Recovery"** and let a member bring a legacy
EOA into FairWins from a raw **private key** or a **BIP-39 word list**, through a guided series of
informational bottom sheets. The pasted secret is classified (key vs word list), the controlled
address is shown for confirmation, and the secret is stored **encrypted at rest** under a
member-chosen passphrase (PBKDF2-SHA256 → AES-GCM) — never persisted in the clear, never
transmitted. Storing completes recovery on its own; **moving funds is an optional, recommended
follow-up** that, when chosen, sweeps **all supported assets** (native + every supported ERC-20
from the portfolio registry) to a destination smart account, with per-asset honest outcomes and a
disclosed network fee. Recovered accounts are **first-class**: the member can save them to the
**address book** (making them usable on every address-entry surface), and the encrypted records ride
the **spec-032 backup** so they carry forward across devices. Each recovery writes a **spec-051
activity-ledger audit record** (address + timestamp + type only) — **never** a private key or
mnemonic in any log, backup, or record beyond the encrypted secret store.

**No smart-contract changes.** This is a frontend-only feature that composes existing subsystems
(portfolio registry, address book, backup sync, activity ledger) with the recovery library.
Decision log: [research.md](research.md). Data shapes: [data-model.md](data-model.md).
Module contracts: [contracts/](contracts/).

## Current state (already shipped on this branch)

PR #949 already delivered **US1 (P1)** and a native-only slice of **US2**:

- `frontend/src/lib/recovery/legacyKeys.js` — `classifySecret`, `encryptLegacySecret`/
  `decryptLegacySecret` (PBKDF2 650k + AES-GCM), `legacyKeyVault(storage)`, and a **native-only**
  `quoteNativeSweep`/`sweepNativeToSmartAccount`.
- `frontend/src/components/account/LegacyKeyRecoveryPanel.jsx` — the guided ActionSheet flow
  (intro → enter → secure → transfer → done) plus a stored-key list.
- Section renamed to "Recovery" in `config/appNav.js` + `pages/WalletPage.jsx` (tab id `security`
  and the `backup` alias unchanged); tests in `test/recovery/` and `__tests__/`.

This plan covers the **delta** to reach the full spec: restructure so the transfer is clearly
optional (US2), extend the sweep to **all supported assets** (US2), **address-book** integration
(US3), **backup** durability (US4), and the **audit** record (US5).

## Technical Context

**Language/Version**: JavaScript ESM — React 19 + Vite, Node ≥22 (frontend only).

**Primary Dependencies**: `ethers` v6 (already present) for key/mnemonic → signer, balance reads,
and ERC-20/native transfers; `@noble/hashes` (already present) only in tests to register ethers'
sha256/HMAC/PBKDF2 under jsdom. **No new runtime dependency.**

**Storage**: `localStorage` via `utils/userStorage.js` (per-account `fw_user_<addr>_<key>`). New
domain key `legacy_recovered_keys` (the encrypted vault) joins the existing `addressBook`,
`activity_ledger_v1_<chainId>`, etc.

**Testing**: Vitest + Testing Library (jsdom), axe accessibility matchers — the repo standard.

**Target Platform**: Web SPA (PWA), light + dark themes, mobile + desktop.

**Project Type**: Web application, frontend-only change (no `contracts/`, no `subgraph/`, no gateway).

**Performance Goals**: Recovery ≤ 2 min (SC-001). Asset enumeration is a pure registry read +
one `balanceOf` per supported token on the active chain (bounded, ≤ ~15 tokens); balance reads run
concurrently.

**Constraints**: Secret never written unencrypted, never transmitted, never logged (constitution
Key-management + FR-006/007/024). Fund-moving must never strand funds (leave a gas reserve, native
last) and must report honest per-asset outcomes (FR-015/016). Balances/transfers scoped to the
active EVM network (FR-012, Honest-State). WCAG 2.1 AA.

**Scale/Scope**: One new store module, one new sweep function, ~4 focused edits to the existing
panel, one `syncedObjects` registration, one ledger-source helper. Bounded to a handful of files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Security-First Smart Contracts** | **N/A — no `contracts/` change.** No new on-chain surface. The only value-bearing path is client-side signing with the member's own legacy key to transfer their own funds; guarded by leave-gas-reserve, native-last ordering, and per-asset outcome reporting (never strands). |
| **II. Test-First & Coverage** | Vitest unit tests for the multi-asset sweep (quote + per-asset success/partial-failure/insufficient-gas), the store module (encrypt/decrypt/merge), address-book upsert, backup round-trip for the new domain, and the audit-record shape (asserting **no secret** in any field). Panel tests for the optional-transfer flow. All must pass in CI. |
| **III. Honest State, No Mocks** | Real registry + on-chain balances; fee disclosed before signature and capped at the quote; out-of-scope assets (NFTs) disclosed, never implied moved; per-asset honest outcomes; balances scoped to the active network. No mocks in shipped paths. |
| **IV. Fail Loudly in CI** | No `continue-on-error` added. Lint/test/build gate as usual. |
| **V. Accessible, Consistent Frontend** | Reuses the shared `ActionSheet` (focus trap, Escape, scroll-lock) and global `.btn`/`.section` styles; theme-aware CSS tokens; axe tests. Network/asset config comes from `config/networks.js` + `config/assetTaxonomy.js` (generated/sync sources) — never hardcoded addresses. |
| **Key Management** | Secret encrypted at rest under the member passphrase; only the **encrypted** blob is persisted or backed up; secret never logged/printed/transmitted. No deployer/admin keys involved. |

**Result: PASS.** No deviations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/062-legacy-account-recovery/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entities & storage shapes
├── quickstart.md        # Phase 1 — end-to-end validation guide
├── contracts/           # Phase 1 — module/UI contracts (function signatures)
│   ├── legacyKeys.md
│   ├── legacyRecoveredKeysStore.md
│   └── recoveryAudit.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── lib/
│   ├── recovery/
│   │   ├── legacyKeys.js              # EXTEND: sweepAllAssets/quoteAllAssets alongside native sweep
│   │   └── legacyRecoveredKeysStore.js # NEW: backup-synced domain store (encrypted vault, no plaintext)
│   ├── backup/
│   │   └── syncedObjects.js           # EDIT: register 'legacyRecoveredKeys' domain
│   └── addressBook/                    # (reuse via useAddressBook hook — no change)
├── data/ledger/
│   └── sources/legacyRecoverySource.js # NEW: captureLegacyRecovery(account, chainId, {...}) audit helper
├── hooks/
│   ├── useAccountAssets.js            # (reuse: enumerate + balances for an arbitrary address)
│   └── useAddressBook.js              # (reuse: addContact / findByAddress upsert)
├── components/account/
│   ├── LegacyKeyRecoveryPanel.jsx     # EDIT: optional transfer, all-asset UI, save-to-book, audit call
│   └── LegacyKeyRecoveryPanel.css     # EDIT: asset list + save-to-book styles
└── config/
    ├── assetTaxonomy.js               # (reuse: getPortfolioRegistry(chainId))
    └── networks.js                    # (reuse: nativeCurrency, rpcUrl)

frontend/src/test/recovery/ , components/account/__tests__/  # EXTEND with new suites
```

**Structure Decision**: Single frontend project (Option 2, frontend leg only). The feature adds two
new modules (`legacyRecoveredKeysStore.js`, `legacyRecoverySource.js`), extends `legacyKeys.js` and
the panel, and registers one backup domain. Everything else is reuse of existing hooks/registries,
honoring YAGNI and the "integrate, don't fork" assumption in the spec.

## Complexity Tracking

> No constitution violations. No entries.

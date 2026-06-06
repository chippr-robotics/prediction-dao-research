# Implementation Plan: Complete the Remaining E2E Stubs (Encryption, Privacy, Lifecycle)

**Branch**: `002-e2e-encryption-lifecycle` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-e2e-encryption-lifecycle/spec.md`

## Summary

Replace the three remaining body-visible E2E stubs with real assertions so the
FairWins Cypress "full" suite covers the platform end-to-end. The work is confined
to the test harness (`frontend/cypress/`), building on the 001 foundation
(`chainTx` task, `createAndAcceptWager`, `createWagerViaUI`, the mock-wallet write
fix). Three deliverables: lifecycle journeys (23) — reuse 001 patterns and drop
the obsolete arbitrator journey; on-chain key registration (03) — drive the
WalletPage register flow and assert KeyRegistry state; and the encrypted private
lifecycle (16) — the full encrypt → store → retrieve → decrypt round-trip, enabled
by two new harness capabilities: a **mocked IPFS** (`cy.intercept` the Pinata
upload/fetch with an in-memory blob store) and **per-account mock signatures** (so
each account derives a distinct encryption key and decryption is account-specific).

## Technical Context

**Language/Version**: JavaScript (ES2022), Node 22

**Primary Dependencies**: Cypress 15 (Chrome), the 001 E2E foundation
(`cypress.config.js` `chainTx` task + `cypress/support/commands.js`), a real local
Hardhat node (chain 1337) with deployed v2 contracts (incl. KeyRegistry +
MockPolymarketCTF). Production app code is **not** modified.

**Storage**: On-chain (KeyRegistry public keys; wager `metadataUri`). Off-chain
encrypted metadata normally on Pinata/IPFS — **mocked in tests** (see research).

**Testing**: Cypress E2E against the mocked wallet + real local chain. Encryption
correctness is exercised through the browser using the app's real
`encryption.js`/`ipfsService.js`; only the wallet signature and the IPFS network
boundary are mocked.

**Target Platform**: Frontend (Vite dev server on :5173) + Hardhat node on :8545.

**Project Type**: Web app test suite (frontend only; no backend changes).

**Performance Goals**: N/A (correctness suite). Each spec should run in seconds to
low-minutes; no IPFS network waits (mocked).

**Constraints**:
- Key derivation hashes the wallet signature (`keccak256(toUtf8Bytes(signature))`,
  `encryption.js:48`) and does **not** verify it — so a deterministic per-account
  fake `personal_sign` yields per-account keys. The mock must therefore return an
  account-specific signature (today it returns the same bytes for all accounts).
- The encrypted-create path uploads to IPFS; without interception it hangs (no
  network) — the 001 work disabled the privacy toggle for exactly this reason. 16
  must intercept the Pinata upload (`**/pinJSONToIPFS`) and gateway fetch
  (`**/ipfs/{cid}`).
- Shared local node: specs that `advanceTime` or set global state must stay
  isolated (per 001's far-future-end-date and `restoreGlobalState` conventions);
  verify the full suite on a **fresh** node.

**Scale/Scope**: 3 spec files (~12–16 assertions total) + ~3 new shared commands;
no production LOC.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-Driven Change** — PASS. Proceeding through specify → plan → tasks.
- **II. Test-First / Coverage (NON-NEGOTIABLE)** — PASS, and directly served: this
  feature *is* test coverage; it removes false-positive stubs and adds real
  assertions, raising confidence in the privacy + lifecycle paths.
- **III. Security-First / No mocks in shipped paths** — PASS. The IPFS intercept
  and per-account signing live **only** in `frontend/cypress/` (test scope). No
  production encryption, KeyRegistry, or storage code changes. Mocking the network
  boundary (IPFS) and the wallet (signing) is consistent with the established
  mock-wallet + real-chain model.
- **IV. Fail Loudly** — PASS, and reinforced: replaces passing stubs with
  assertions that fail on wrong outcomes; the Cypress job exits non-zero on
  failure. No `continue-on-error`.
- **V. (project-specific)** — N/A to a test-only change.

**No violations. No Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```
specs/002-e2e-encryption-lifecycle/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 — IPFS-mock, per-account-sign, key-derivation, journey-removal decisions
├── data-model.md        # Phase 1 — test entities + per-spec precondition→action→assertion matrix
├── contracts/
│   └── test-helpers.md  # Phase 1 — new shared command interface + per-spec assertion contracts
├── quickstart.md        # Phase 1 — how to run + expected outcomes
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

Work is confined to the test harness — **no production changes**:

```
frontend/
├── cypress/
│   ├── support/commands.js     # + per-account personal_sign in mockWeb3Provider;
│   │                           #   + interceptIpfs(), registerEncryptionKeyViaUI(),
│   │                           #     createPrivateWagerViaUI() helpers
│   ├── cypress.config.js        # (reuse 001 chainTx task; add KeyRegistry read action if needed)
│   └── e2e/full/
│       ├── 03-encryption-chain.cy.js     # US2 — KeyRegistry registration
│       ├── 16-privacy-encryption.cy.js   # US3 — encrypted round-trip
│       └── 23-lifecycle-e2e.cy.js        # US1 — lifecycle journeys (arbitrator journey removed)
└── src/                         # READ-ONLY (encryption.js, ipfsService.js, keyRegistryService.js,
                                 #   WalletPage.jsx, MyMarketsModal/MarketAcceptanceModal) — for selectors only
```

**Structure Decision**: Single frontend test-suite change. Reuse the 001
foundation; add the minimum harness capability (IPFS intercept + per-account
signing) needed for the encrypted round-trip. No new top-level modules.

## Complexity Tracking

*No constitution violations — no entries.*

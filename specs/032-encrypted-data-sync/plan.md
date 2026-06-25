# Implementation Plan: Encrypted Data Backup & Restore

**Branch**: `feat/encrypted-data-sync-032` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-encrypted-data-sync/spec.md`

## Summary

Give the member an explicit, member-initiated way to **back up and restore** their user-authored data
(address book + market/app preferences, extensible) as a **single unified, encrypted, network-tagged file on
IPFS**, with a **trustless on-chain pointer** so any device controlling the wallet can find and load the
latest backup using only the wallet. The research is decisive: this is **overwhelmingly reuse** —
client-side encryption, wallet-signature key derivation, IPFS pin/fetch, and the address-book merge engine
all exist; the only new on-chain piece is a tiny value-free pointer registry that clones the existing
`KeyRegistry` shape. Network-awareness is largely inherent (the address book already tags every entry with
`chainId`); the plan formalizes a network-tagged bundle so future objects (tokens, DAOs) inherit it.

Backup = gather the registered objects → build a network-tagged bundle → encrypt with a wallet-derived key →
pin to IPFS → write the CID to the on-chain registry (one tx on the canonical network). Restore = read the
registry pointer (free) → fetch by CID → decrypt → merge or replace into local data (member-chosen,
confirmed). Local data stays the source of truth; nothing is shown "backed up" until both the pin and the
pointer write confirm.

## Technical Context

**Language/Version**: Solidity ^0.8.24 (the registry contract) + JavaScript (ES2022)/JSX, React 18 (client).

**Primary Dependencies**: reuse — `@noble/ciphers`+`@noble/hashes` via `frontend/src/utils/crypto/primitives.js`
(`encryptJson`/`decryptJson`, ChaCha20-Poly1305); `frontend/src/lib/addressBook/addressBookCrypto.js`
(`deriveBackupKey(signer)` = keccak256 of a domain-separated `signMessage`); `frontend/src/utils/ipfsService.js`
(`uploadJson`/`fetchByCid`, Pinata via nginx proxy or `VITE_PINATA_JWT`); the address-book store + `mergeBook`/
`applyConflictResolutions`; the UserPreferences store; `utils/userStorage.js` (per-account keys); the
`KeyRegistry` deterministic-deploy pattern (`scripts/deploy` + `deployDeterministic` CREATE2). ethers v6.

**Storage**: encrypted bundle on **IPFS** (pinned); latest-version pointer **on-chain** in
`BackupPointerRegistry` on the **canonical network = Polygon mainnet (137)**; local data in browser
`localStorage` (per-account keys) remains the working source of truth.

**Testing**: Hardhat unit tests + a Medusa fuzz harness for the contract (mirroring
`contracts/test/KeyRegistryFuzzTest.sol`); Vitest for the client bundle/encrypt/restore/merge logic;
`vitest-axe` for the backup/restore UI.

**Target Platform**: the existing SPA + the registry contract on Polygon mainnet (also deployable to
Amoy/Mordor at the same CREATE2 address for testing).

**Project Type**: Web frontend + a single value-free smart contract.

**Performance Goals**: backup of routine data (≤ ~1 MB) encrypts + pins quickly; the pointer write is one
small tx (~cents on Polygon); restore is one chain read + one IPFS fetch + one decrypt. Reads are free.

**Constraints**: no application backend (client + IPFS + on-chain only, FR-017); honest finality — never show
"backed up" before pin + pointer confirm, never corrupt local data on failure (FR-012/013/014); strictly
per-wallet, no cross-wallet leakage (FR-018); **network-tagged elements** — every network-specific element
carries its `chainId` and restores to the right network (FR-015a); WCAG 2.1 AA (FR-020); the contract is
value-free, `msg.sender`-keyed, Slither-clean, and uses no exotic opcodes (so it is even Mordor/pre-Cancun
safe — no OZ Governor `mcopy` issue).

**Scale/Scope**: one unified bundle per wallet (~1 MB soft cap); initial objects = address book (multi-chain,
already chainId-tagged) + global preferences; registry is one mapping slot per wallet.

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1.*

| Principle | Assessment |
|-----------|-----------|
| **I. Security-First Smart Contracts** | A new contract is introduced, but it is the **lowest-risk class**: `BackupPointerRegistry` is **value-free** (no funds, no roles, no admin), **`msg.sender`-keyed** (a wallet can only write its own slot — no privileged path to bypass), and has **no external calls** (reentrancy structurally impossible; CEI trivially satisfied). It clones the audited `KeyRegistry` pattern. Gate work: unit tests (set/overwrite/per-wallet isolation/length-bound/event) + a Medusa fuzz harness; Slither expected clean (no arithmetic/calls/roles); EthTrust-SL — the L2 bar targets *value-bearing* contracts, so this value-free contract is documented as below that tier by design; security-agent review before merge; deterministic CREATE2 deploy; recorded in `deployments/`. **No UUPS** (YAGNI — nothing to upgrade; an upgrade path would be pure attack surface). |
| **II. Test-First & Coverage** | Contract unit + fuzz first; client pure logic (bundle build, encrypt/decrypt round-trip, merge-by-(id,network), restore merge/replace, honest-failure) unit-tested with Vitest; backup/restore UI a11y tested. |
| **III. Honest State, No Mocks** | Core: success shown only after pin **and** pointer write confirm; failed backup/fetch/decrypt never corrupts local data; corrupt/undecryptable backup → "no usable backup" (local untouched); network-tagged elements restore to the correct network (no mis-attribution). Reuses real encryption + real IPFS + real chain reads — no mocks in shipped paths. |
| **IV. Fail Loudly in CI** | Contract compile/test/slither + frontend lint/test/a11y gate the PR; no `continue-on-error` added. |
| **V. Accessible, Consistent Frontend** | Backup/restore controls, status, and the merge/replace confirmation meet WCAG 2.1 AA; the contract address + ABI are consumed via the generated sync artifacts (never hand-hardcoded). |

**Additional constraints**: deployer/admin keys via the floppy keystore flow (this contract has no admin, so
only the deploy itself signs); `contracts-archive/` untouched; the contract uses **no OpenZeppelin** (plain
storage mapping), sidestepping the OZ-version/`mcopy` constraint entirely.

**Result**: PASS (the contract is the only Constitution-I surface and is the minimal value-free shape; itemized
gate work above). Re-checked after Phase 1 — still PASS; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/032-encrypted-data-sync/
├── plan.md            # This file
├── research.md        # Phase 0 — decisions (reuse map, contract shape, canonical network, key derivation, network-tagging)
├── data-model.md      # Phase 1 — network-tagged bundle schema, encrypted envelope, object registry, key derivation
├── contracts/         # Phase 1 — interface contracts
│   ├── backup-pointer-registry.md   # the on-chain contract interface (set/get/has + event)
│   └── backup-service.md            # the client backup/restore + bundle/registry interface
├── quickstart.md      # Phase 1 — end-to-end validation scenarios
└── tasks.md           # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
contracts/
└── privacy/BackupPointerRegistry.sol     # NEW: value-free per-wallet CID pointer (clones KeyRegistry shape)
contracts/test/
└── BackupPointerRegistryFuzzTest.sol     # NEW: Medusa invariant harness
test/
└── BackupPointerRegistry.test.js         # NEW: Hardhat unit tests
scripts/deploy/
└── deploy.js (or deploy-backup-pointer-registry.js)  # EDIT/NEW: deterministic CREATE2 deploy + record
deployments/<net>-chain<id>-v2.json        # EDIT: record backupPointerRegistry address

frontend/src/
├── lib/backup/
│   ├── backupBundle.js          # NEW: build/parse the network-tagged unified bundle (pure)
│   ├── backupCrypto.js          # NEW (thin): domain message + deriveBackupKey + encrypt/decrypt bundle (reuses primitives)
│   ├── backupRegistry.js        # NEW: read/write the on-chain pointer (ethers; reader for restore, signer for backup)
│   └── syncedObjects.js         # NEW: the registry of synced objects (address book, preferences) + network-scope flags + merge rules
├── hooks/useDataBackup.js       # NEW: orchestrates backup/restore, honest tx/pin states, network-switch-to-canonical
├── components/account/BackupPanel.jsx   # NEW: Account Center "Backup" UI (back up / restore / status / merge-replace confirm)
├── abis/backupPointerRegistry.js        # NEW: ABI (hand-maintained, per repo convention)
└── config/contracts.js + sync artifacts # EDIT: register backupPointerRegistry address per network

frontend/src/test/                        # NEW: bundle/crypto/registry/restore + a11y tests
```

**Structure Decision**: Frontend-led feature + one tiny contract. The contract lives in `contracts/privacy/`
beside `KeyRegistry` (same class of value-free per-wallet registry). The client backup logic is isolated in
`lib/backup/` (pure, testable) with a `useDataBackup` orchestration hook and an Account-Center `BackupPanel`.
The **synced-objects registry** (`syncedObjects.js`) is the extensibility seam: each object declares its load/
save, whether it is network-scoped (chainId-tagged) or network-agnostic, and its merge rule — so adding tokens/
DAOs later is a registry entry, not a redesign.

## Phase 0 — Research

See `research.md`. All Technical-Context unknowns resolved: reuse map (encryption, IPFS, address-book merge),
the contract shape (minimal non-upgradeable, clone `KeyRegistry`), the canonical network (Polygon mainnet),
the key-derivation + determinism guard (reuse `deriveBackupKey` pattern; honest restore-failure as the guard),
and the network-tagged bundle design. No `NEEDS CLARIFICATION` remain.

## Phase 1 — Design & Contracts

See `data-model.md` (the network-tagged bundle + encrypted envelope + synced-object registry + key
derivation), `contracts/backup-pointer-registry.md` (the on-chain interface + invariants), `contracts/
backup-service.md` (the client backup/restore interface + honest-state contract), and `quickstart.md`
(validation incl. cross-device restore, network-aware restore, merge/replace, failure non-destructiveness,
trustless retrieval, a11y).

## Complexity Tracking

No constitution violations — no entries. (The single new contract is the minimal value-free shape and is
justified above; choosing non-UUPS is the simplicity-preserving decision.)

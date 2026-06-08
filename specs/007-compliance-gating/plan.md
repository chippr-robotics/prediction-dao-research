# Implementation Plan: Compliance & Legal Gating Layer

**Branch**: `007-compliance-gating` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-compliance-gating/spec.md`

## Summary

Add a compliance & legal gating layer to FairWins **without adding a backend** —
strictly within today's footprint (React+Vite SPA served by nginx on Cloud Run, smart
contracts on Polygon, IPFS/Pinata, Cloudflare edge, Cloud Logging). The layer is a
*stack*: (1) **geo-blocking at Cloudflare** (WAF country rule → 451) with the Cloud Run
origin locked behind a Cloudflare-injected secret header verified in the existing nginx;
(2) **wallet sanctions screening** as defense-in-depth — an advisory client-side read of
the Chainalysis on-chain Sanctions Oracle plus a **non-bypassable on-chain `SanctionsGuard`**
(oracle + admin deny-list) consulted by `WagerRegistry`/`MembershipManager`; (3) a
three-layer consent flow whose **records of record live on-chain** (membership purchase
records the accepted T&C version hash; wager creation binds the version into the wager's
ChaCha20-Poly1305 AAD; key registration dates the deterministic eligibility signature),
with the entry "21+" modal as a client-side notice gate; and (4) **versioned legal
documents** served by the SPA and per-version IPFS-pinned, versioned by SHA-256, with the
hash recorded on-chain at each consent. Geo/IP enforcement evidence is the existing
Cloudflare/Cloud Run request logs. The public chain is the immutable, fail-closed,
queryable "WORM" store — no GCS bucket lock, no BigQuery, no backend.

## Technical Context

**Language/Version**: Solidity `^0.8.24` (Hardhat `^2.28.2`); JavaScript/JSX on React 19 +
Vite 7, tested with Vitest 4; ethers `^6.16`.

**Primary Dependencies**: OpenZeppelin `AccessControl`/`ReentrancyGuard`/`Pausable`;
`@noble/ciphers` (`chacha20poly1305` with AAD), `@noble/curves`, `@noble/post-quantum`
(X-Wing hybrid KEM, already used); Chainalysis on-chain Sanctions Oracle
(`SanctionsList.isSanctioned(address)`); Cloudflare WAF custom rules + Transform Rules;
nginx (existing container); IPFS/Pinata; The Graph subgraph (optional consent indexing).

**Storage**: **On-chain (Polygon)** for consent records, deny-list, and the accepted/bound
T&C version hashes; **IPFS/Pinata** for per-version legal documents and encrypted wager
metadata; **Cloud Logging** (existing Cloud Run request logs) for geo/IP enforcement
evidence. No database, no WORM bucket, no BigQuery.

**Testing**: Hardhat unit + integration + **fork test against Polygon mainnet (137)** for
the real Chainalysis oracle (Amoy has none → mock on testnet/local); Vitest for frontend
logic (gate, screening read, hash/version, AAD binding); Slither + Medusa for the contract
changes; axe/Lighthouse for accessibility in CI.

**Target Platform**: Web SPA on Cloud Run (us-central1) behind Cloudflare (fairwins.app);
contracts on Polygon mainnet (137) and Amoy testnet (80002).

**Project Type**: Existing multi-part repo — smart contracts + React frontend + subgraph.
**No backend is introduced.**

**Performance Goals**: Geo-blocked requests are rejected at Cloudflare (no origin
round-trip); the on-chain guard adds ~1 `STATICCALL` (oracle) + 1 cold `SLOAD` (deny-list)
per gated entrypoint — single-digit-thousands of gas, <5% of a wager/membership tx that
already does ERC-20 transfers; client-side oracle screening returns sub-second via RPC;
document hash verification is instant.

**Constraints**: **NO BACKEND / current footprint** (the load-bearing constraint);
fail-closed on oracle/guard unavailability and on reverted consent tx; per-chain oracle
address injection (never hardcoded; Amoy has no oracle); the deterministic, versionless
key-derivation signature MUST NOT change (encryption key reproducibility); WCAG 2.1 AA on
all new UI; addresses/ABIs only from generated sync artifacts.

**Scale/Scope**: Existing FairWins user base; deny-list is an O(1) mapping (enumeration
off-chain via events); legal-document versions are small text artifacts; consent volume =
existing membership/wager/key-registration tx volume.

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Applies? | How this plan satisfies it |
|-----------|----------|----------------------------|
| **I. Security-First Smart Contracts** (NON-NEGOTIABLE) | **YES** — new `SanctionsGuard` + admin deny-list and guard hooks in `WagerRegistry`/`MembershipManager` are `contracts/` changes on the access-control / fund-custody axis. | CEI preserved (sanctions check is the first Check, before effects/transfers); `nonReentrant` retained; deny-list mutation gated by a dedicated `SANCTIONS_ADMIN_ROLE`, oracle swap by `DEFAULT_ADMIN_ROLE`, both held by the floppy-keystore admin; events on every mutation; external oracle read wrapped in try/catch → **fail-closed**. Target EthTrust-SL L2; Slither + Medusa must be clean of new high/critical; smart-contract-security agent review before merge. Exit/refund paths stay **ungated** so a newly-listed party can still recover escrowed funds. |
| **II. Test-First & Comprehensive Coverage** (NON-NEGOTIABLE) | **YES** | Hardhat unit (guard truth table, role-gating, fail-closed-on-oracle-revert, deny-list events), integration (create/accept/purchase/upgrade revert for listed sender + counterparty-on-accept), and a **fork test on Polygon 137** against the real oracle (SC-004/SC-016); Vitest for the gate, client screening, doc-hash/canonicalization, and AAD tamper-rejection + legacy no-AAD round-trip. Full suite green in CI before merge. |
| **III. Honest State / no mocks in shipped paths / network-scoped** | **YES** | Production screening reads the **real** Chainalysis oracle on 137; `MockSanctionsOracle` lives only in `contracts/mocks/` and is injected solely on Amoy/local/fork. Guard bytecode is identical across networks (address injected). Screening + consent records carry/are scoped to `chainId`; no testnet result is honored on mainnet. No allow-all/stub in shipped code. |
| **IV. Fail Loudly in CI** | **YES** | New Hardhat tests, Vitest tests, Slither, and (where feasible) the nginx/Cloudflare config checks run in CI with no `continue-on-error`; Slither/Medusa fail the pipeline on new critical findings. |
| **V. Accessible, Consistent Frontend** | **YES** | Entry-gate modal (focus-trapped, labeled, keyboard-operable), discrete labeled checkboxes, versioned document pages, the 451 page, and the deny-list admin UI all meet WCAG 2.1 AA and pass axe/Lighthouse in CI; the Chainalysis oracle + `SanctionsGuard` + deny-list addresses/ABIs come from `sync:frontend-contracts`, never hardcoded (FR-055). |

**New core technologies (justified per Additional Constraints):** (a) the external
**Chainalysis on-chain oracle** — a free, authoritative, key-less OFAC source read on
Polygon; (b) **Cloudflare edge security config** (geo WAF rule + secret-header Transform
Rule) consumed by the **existing** nginx. **No backend, WORM store, or BigQuery is added.**
The on-chain `SanctionsGuard`/deny-list follow existing repo patterns (OZ AccessControl,
the injectable `IOracleAdapter` precedent), so they are not a new *core* technology.

**Result: PASS.** No principle is violated; the Complexity Tracking table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-compliance-gating/
├── plan.md              # This file
├── research.md          # Phase 0 output (decisions + citations)
├── data-model.md        # Phase 1 output (entities, on-chain + client + doc)
├── quickstart.md        # Phase 1 output (validation guide)
├── contracts/           # Phase 1 output (interface/behavior contracts)
│   ├── ISanctionsGuard.md
│   ├── IChainalysisSanctionsOracle.md
│   ├── membership-version-recording.md
│   ├── encrypted-metadata-v1.1.md
│   ├── cloudflare-nginx-origin-lock.md
│   └── frontend-gate-contracts.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── access/
│   ├── SanctionsGuard.sol          # NEW: oracle + admin deny-list, fail-closed, AccessControl
│   └── MembershipManager.sol       # MOD: consult guard on purchaseTier/upgradeTier; record accepted T&C version hash + event
├── wagers/
│   └── WagerRegistry.sol           # MOD: consult guard on createWager (sender) + acceptWager (sender + counterparty); store/emit bound T&C version hash
├── privacy/
│   └── KeyRegistry.sol             # MOD (light): emit eligibility-reference event at registration (dated by block)
├── interfaces/
│   ├── ISanctionsGuard.sol         # NEW
│   └── IChainalysisSanctionsOracle.sol  # NEW (isSanctioned(address) view)
└── mocks/
    └── MockSanctionsOracle.sol     # NEW: test/testnet only (Amoy has no oracle)

test/
├── SanctionsGuard.test.js          # NEW unit
├── integration/
│   └── sanctions-gating.test.js    # NEW integration (create/accept/purchase/upgrade)
└── fork/
    └── ChainalysisSanctions.fork.test.js  # NEW fork test on Polygon 137

frontend/
├── nginx.conf.template             # MOD: verify Cloudflare origin-lock secret header; forward CF-IPCountry
├── src/
│   ├── components/
│   │   ├── compliance/EntryGate.jsx         # NEW: client-side 21+/eligibility notice gate
│   │   ├── compliance/MembershipAttestation.jsx  # NEW/extend: discrete un-pre-ticked checkboxes
│   │   └── admin/DenyListAdmin.jsx          # NEW: deny-list admin UI (add/remove + reason)
│   ├── pages/legal/{TermsPage,RiskPage,PrivacyPage}.jsx  # NEW: versioned doc pages (show hash version)
│   ├── utils/
│   │   ├── legalDocs.js             # NEW: canonicalize + SHA-256 version, version manifest, materiality flag
│   │   └── sanctionsScreen.js       # NEW: client-side oracle read via RPC (advisory)
│   ├── utils/crypto/
│   │   ├── envelopeEncryption.js    # MOD: bind termsVersion hash as ChaCha20-Poly1305 AAD
│   │   └── constants.js             # MOD: add TERMS_AAD_PREFIX builder (key-derivation messages UNCHANGED)
│   ├── schemas/encrypted-metadata-v1.1.json  # NEW: add optional authenticated `termsVersion`
│   ├── legal/                       # NEW: versioned document sources (+ IPFS pin manifest)
│   └── abis/                        # MOD (generated): SanctionsGuard + oracle ABIs via sync
└── public/451.html (or Cloudflare custom response)  # NEW: 451 explanation

scripts/
├── deploy/                         # MOD: deploy SanctionsGuard, inject per-chain oracle addr, wire guard into WagerRegistry/MembershipManager
└── utils/sync-frontend-contracts.js  # MOD: include SanctionsGuard + deny-list + oracle addr/ABI/network config

subgraph/                           # OPTIONAL: index consent/version + deny-list events for address-keyed queryability
```

**Structure Decision**: Reuse the existing multi-part layout. Contracts extend
established patterns (`AccessControl`, the injectable `IOracleAdapter` precedent, the
existing `notFrozen` modifier as a sibling — **not** a replacement). Frontend additions
live under a new `components/compliance/` plus existing `components/admin/` and
`pages/`. **No `backend/` directory is created** — that is the explicit constraint.

## Complexity Tracking

> No constitution violations — table intentionally empty. The design adds no new core
> compute tier, reuses existing access-control / oracle-adapter / envelope-encryption
> patterns, and stays within the current deployment footprint.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | | |

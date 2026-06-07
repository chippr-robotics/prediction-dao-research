# Quickstart: Compliance & Legal Gating Layer

Runnable validation scenarios proving the feature works end-to-end, within the current
footprint (no backend). See [contracts/](./contracts/) and [data-model.md](./data-model.md)
for details. Implementation belongs in `tasks.md`, not here.

## Prerequisites

- `npm install` (root) and `npm --prefix frontend install`.
- A Polygon mainnet (137) RPC for fork tests (archive/Alchemy/Infura) in `.env`
  (`POLYGON_RPC_URL`); never commit secrets (`.env.example` documents vars).
- For local: Hardhat node + `MockSanctionsOracle` (Amoy/local have no real oracle).

## 1. Contracts — sanctions guard (Principle I/II)

```bash
npm run compile
npm test                 # unit: SanctionsGuard truth table, role-gating, fail-closed, events
npm run test:integration # create/accept/purchase/upgrade revert for listed sender + counterparty
npm run test:fork        # ChainalysisSanctions.fork.test.js against Polygon 137 real oracle
npx slither .            # no new high/critical (Principle I)
```
**Expected**: a known **sanctioned** address reverts on `createWager`/`acceptWager`/
`purchaseTier`/`upgradeTier` (direct contract call too — SC-016); a **clean** address
passes; oracle-unreachable ⇒ revert (fail-closed, SC-004); exit/refund paths succeed even
for a listed address; `DenyListUpdated` carries actor+reason; unauthorized `setDenied`/`setSanctionsOracle`
revert (SC-018).

## 2. Frontend — gate, screening, docs, encryption (Principle II/V)

```bash
npm run test:frontend    # Vitest
```
**Expected**:
- EntryGate blocks the app until acknowledged; "Leave" withholds access; acknowledged
  versions stored client-side (SC: entry gate).
- Membership checkboxes are un-pre-ticked and block submit until all required ticked (SC-008).
- `legalDocs` hash is reproducible from canonical text; a prior version is retrievable by hash
  (SC-005); doc pages show "Version: <hash>" and are reachable in ≤2 clicks (SC-010).
- Encrypted-metadata v1.1: round-trip with `termsVersion` + AAD; tampering `termsVersion.hash`
  fails decrypt; legacy (no `termsVersion`) round-trips with no AAD (SC-017).
- a11y: `axe`/Lighthouse pass on EntryGate, checkboxes, doc pages, 451, admin UI (SC-015).

## 3. Deploy + sync (Principle III/V)

```bash
# local/testnet: deploy MockSanctionsOracle, then SanctionsGuard with injected oracle addr,
# then wire guard into WagerRegistry + MembershipManager
npm run deploy:local        # (extended deploy step)
npm run sync:frontend-contracts:local   # SanctionsGuard + deny-list + oracle addr/ABI -> frontend abis
```
**Expected**: on Polygon 137 the guard is injected with `0x40C5…8fb`; on Amoy/local with the
mock. Frontend reads addresses ONLY from synced artifacts (grep shows no hardcoded oracle
address — FR-055). Records are chainId-scoped (no cross-network leak — FR-022).

## 4. Edge geo + origin lock (manual / staging)

- Cloudflare WAF rule (allowlist) → request from a blocked country returns **451**; no origin
  hit (SC-001/SC-003). Stage in observe mode first (FR-011).
- Direct `run.app` request **without** `X-Origin-Auth` → nginx **403** (SC-002/SC-012);
  with the correct secret (as Cloudflare injects) → served.
- `CF-IPCountry`/`CF-Connecting-IP` appear in Cloud Run request logs (geo evidence — FR-009).

## 5. End-to-end consent of record (on-chain)

1. New visitor → EntryGate (client notice) → connect wallet → screened (advisory) →
   key registration (`EligibilityAcknowledged` event dates the signature).
2. Purchase membership with the in-force terms hash → `MembershipPurchased(acceptedTermsHash, at)`
   on-chain (SC-006).
3. Create a wager → `WagerCreated(termsVersionHash)` + AAD-bound encrypted metadata; publish a
   new **material** doc version → existing wager still resolves to the OLD version hash
   (prospective-only, SC-017); the next new wager binds the NEW version.
4. Query by address via chain/subgraph → full consent history with governing versions
   (SC-007). A reverted consent tx leaves no record (fail-closed, SC-011).

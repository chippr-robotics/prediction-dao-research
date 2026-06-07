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

## 6. Mainnet (137) deployment & cutover (Spec 007) — operator runbook

> **Live, non-upgradeable contracts.** `WagerRegistry`, `MembershipManager`, and `KeyRegistry`
> are already deployed and are not proxies. This feature adds storage (`wagerTermsVersionHash`,
> `sanctionsGuard`, `memberTermsHash`) and additive function overloads, so it ships as a
> **fresh deployment + migration**, not an in-place upgrade.
>
> **Decisions for this cutover:** Polygon **mainnet (137)** now; **full cutover + migrate** (not
> parallel-run). The **prior contracts are already paused**, so there are no open wagers to settle
> and the switch is clean. The app is **not live yet**, so the new contracts are **deployed paused**
> (lockdown step 6) and only opened at go-live.
>
> Steps marked **[operator]** require the air-gapped floppy keystore (mainnet broadcast / admin
> roles); steps marked **[agent]** are repo work I run and commit. Mainnet broadcast also requires
> `CONFIRM_MAINNET=true`.

1. **[operator] Deploy + wire (137):** with the floppy mounted,
   `CONFIRM_MAINNET=true npm run deploy:polygon` deploys `SanctionsGuard` with the real Chainalysis
   oracle injected (`0x40C5…8fb`), redeploys `WagerRegistry`/`MembershipManager`/`KeyRegistry`
   (deterministic CREATE2), and wires the guard in (`setSanctionsGuard`, idempotent). Admin roles
   (`DEFAULT_ADMIN_ROLE`, `SANCTIONS_ADMIN_ROLE`, `GUARDIAN_ROLE`, `ROLE_MANAGER_ROLE`) land on the
   floppy admin. The run writes/updates `deployments/polygon-chain137-v2.json` (now incl.
   `sanctionsGuard`). Commit that record.
2. **[agent] Sync frontend:** `npm run sync:frontend-contracts:polygon` writes the new addresses
   (incl. `sanctionsGuard`) into `frontend/src/config/contracts.js`; ABIs are committed,
   artifact-derived (`src/abis/*`). Bump `wagerRegistry` in `DEPLOYMENT_BLOCKS_BY_CHAIN[137]` to the
   new deploy block. Verify no address is hand-hardcoded (FR-055) and commit.
3. **[operator] Verify on Polygonscan:** verify the new contract sources so the public can read the
   compliance logic.
4. **[operator] Migrate memberships:** the OLD `MembershipManager` (`0x7441…0c95`) holds the active
   memberships; re-grant the still-active ones onto the new contract. Dry-run first, then execute:
   ```bash
   OLD_MEMBERSHIP_MANAGER=0x7441700979e37a9a1F17093a4859c8f261780c95 START_BLOCK=<oldMMdeployBlock> \
     npm run migrate:memberships:polygon                      # dry run (DRY_RUN defaults true)
   DRY_RUN=false OLD_MEMBERSHIP_MANAGER=0x7441700979e37a9a1F17093a4859c8f261780c95 START_BLOCK=<oldMMdeployBlock> \
     npm run migrate:memberships:polygon                      # execute (floppy mounted)
   ```
   Idempotent + sanctions-aware: a sanctioned old member is correctly skipped. `grantMembership` does
   not check tier `active`, so this runs even with the tiers deactivated by the lockdown.
5. **[operator] Edge config (Cloudflare):** apply `infra/cloudflare/waf-geo.md` (country gate → 451,
   stage in observe mode first) and `infra/cloudflare/origin-lock.md` (Transform Rule secret header).
   Set `ORIGIN_LOCK_SECRET` on Cloud Run from Secret Manager (the nginx origin-lock stays inert until
   it is set).
6. **[operator] Pre-launch lockdown (app not live):** with the floppy mounted, pause the new
   contracts so nobody can wager or buy a membership before go-live. Dry-run first:
   ```bash
   npm run lockdown:polygon                                   # dry run — prints planned actions
   DRY_RUN=false npm run lockdown:polygon                     # pause WagerRegistry + deactivate tiers
   ```
   This pauses `WagerRegistry` (blocks create/accept; exit paths stay open) and deactivates the
   seeded membership tiers (blocks purchase/upgrade/extend — `MembershipManager` has no `pause()`).
   Run migration (step 4) **before** this, or run it anyway — `grantMembership` is unaffected.
7. **[operator] Go-live (when ready):** reverse the lockdown.
   ```bash
   DRY_RUN=false ACTION=unlock npm run lockdown:polygon       # unpause + re-activate tiers
   ```
8. **CI / fork tests:** set the `POLYGON_RPC_URL` repo secret so the Chainalysis fork test
   (Polygon 137) runs in `oracle-fork-tests.yml`; Slither/Medusa run in `security-testing.yml`.
9. **Pre-merge gate (Principle I):** Slither + Medusa clean of new high/critical, EthTrust-SL L2,
   and a smart-contract-security agent review of the `contracts/` changes.

> Legacy wagers (no bound version) are governed by the launch terms version (prospective-only —
> FR-057). Records are chainId-scoped; testnet memberships never appear active on mainnet.

## Open items pending counsel (see spec "Open Legal-Reconciliation Items")

- Finalize Terms / Risk / **Privacy Policy** copy (drafts in `frontend/src/legal/`); the SHA-256
  version is computed from whatever is published.
- Set the launch **permitted-country allowlist** in the Cloudflare rule (runbook in
  `infra/cloudflare/waf-geo.md`); reconcile T&C §5/§7/§11 with the implemented controls.

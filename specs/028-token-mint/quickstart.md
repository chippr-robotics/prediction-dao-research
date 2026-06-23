# Quickstart & Validation: Token Mint & Compliant Token Administration

End-to-end validation that the feature works against real on-chain state. Run on a local Hardhat chain (1337),
Amoy (80002), or Mordor (63). No mock data anywhere. On Mordor (no subgraph) the token list/detail is served
from on-chain RPC reads instead of the subgraph — validate discovery there reads the factory registry directly.
See `contracts/` docs for interface detail and `data-model.md` for entities.

## Prerequisites

- `npm install` (includes the new vendored T-REX/ONCHAINID deps — see plan Complexity Tracking).
- `npm run compile` succeeds.
- A funded deployer (floppy-keystore admin on testnet; a default signer locally).
- `SanctionsGuard` deployed (existing) with a mock oracle locally / the real address on production.

## 1. Deploy (factory + templates + suite)

```bash
# Local
npm run deploy:local      # deploys impl templates, SanctionsComplianceModule, T-REX suite/gateway,
                          # then TokenFactory as proxy+impl; grants TOKEN_ISSUER_ROLE to the admin;
                          # records tokenFactory + tokenFactoryImpl + template/suite addresses in deployments/
npm run check:storage-layout   # TokenFactory registered; passes (baseline)
npm run sync:frontend-contracts   # frontend picks up addresses/ABIs (never hand-copied)
```

**Expect**: `deployments/<network>.json` gains `tokenFactory`, `tokenFactoryImpl`, the implementation-template
addresses, and the T-REX gateway/suite addresses.

## 2. Open ERC-20 — create & administer (User Stories 1 & 2)

1. As an address **with** `TOKEN_ISSUER_ROLE`, call `createOpenERC20(name, symbol, 18, initialSupply, uri,
   burnable=true, pausable=true)`.
2. **Expect**: one `TokenCreated` event; a deployed token holding `initialSupply` for the issuer; exactly one
   registry record; the issuer's `getTokensByIssuer` includes it.
3. `mint(recipient, amount)` as owner → recipient balance and total supply increase. As a non-owner → reverts.
4. `pause()` → transfers revert; `unpause()` → resume.
5. **Negative**: an address **without** the role calling `createOpenERC20` reverts with no registry write.
6. **Sanctions**: mark an address denied in `SanctionsGuard`; transfers to/from it revert.

## 3. ERC-1404 restricted — eligibility & reasons (User Story 3)

1. `createRestrictedERC20(name, symbol, 18, supply, uri, initialEligible=[issuer])`.
2. With recipient **not** eligible: `detectTransferRestriction(issuer, recipient, amt)` returns `2`
   (`RECIPIENT_NOT_ELIGIBLE`); `messageForTransferRestriction(2)` returns the matching message; the actual
   `transfer` reverts with that reason.
3. `setEligible(recipient, true)` → pre-check returns `0`; transfer succeeds.
4. `setFrozen(issuer, true)` → pre-check returns `3`; transfer reverts.
5. **Sanctions** dominates: a sanctioned recipient returns `4` even if eligible.

**Validate**: the code from `detectTransferRestriction` matches the revert outcome of `transfer` in every case
(detector/transfer parity — SC-003).

## 4. T-REX / ERC-3643 permissioned — identity & agent admin (User Story 4)

> Run as a fork/integration scenario (the vendored suite + ONCHAINID).

1. `createPermissionedERC3643(params)` with required claim topics + a trusted issuer; the issuer becomes owner.
2. Register two holders with valid claims in the Identity Registry.
3. Transfer between the two verified holders → **succeeds**. Transfer to a holder **without** the required claim
   → **reverts**.
4. As agent: `freeze(account)` → its tokens can't move; `unfreeze` restores. Repeat with
   `freezePartialTokens`.
5. As agent: `forcedTransfer(...)`, `mint(...)`, `burn(...)` update balances; `pause()` blocks transfers.
6. Recovery: `recoveryAddress(lostWallet, newWallet, identity)` where `newWallet` carries the same identity →
   balance + frozen status move; recovery to a wallet **without** that identity → reverts.
7. **Sanctions module**: deny one verified holder in `SanctionsGuard`; a transfer involving it reverts via the
   compliance module despite valid claims.
8. **Negative**: a non-agent/owner attempting any agent action reverts.

## 5. Discovery & network scoping (User Story 5, FR-023)

1. `npm run dev` (frontend); open the token module.
2. **Expect**: the token list shows each created token with its standard, name, symbol, and live supply (from
   subgraph + on-chain reads); the per-token admin surface shows **only** controls valid for that standard.
3. Switch networks → only the active network's tokens appear; on a network without the factory deployed, the
   feature is disabled with a truthful message (no mock list).
4. A reverted/rejected creation leaves **no** phantom token in any list.

## 6. Test, lint, security gates (Constitution)

```bash
npm test                       # unit + integration for all four classes + factory + upgrade lifecycle
npm run test:fork              # T-REX suite + ONCHAINID interaction
npm run check:storage-layout   # append-only factory storage (gating)
npm run test:frontend          # Vitest for token module logic
# CI additionally runs Slither (clone/proxy/UUPS) + Medusa: no new high/critical
```

**Done when**: every scenario above passes against real on-chain state, all four standards enforce sanctions,
admin actions succeed only for authorized actors, no phantom/mock entries appear, and the full suite + security
gates are green.

---

## Expansion validation — administration portal (US6–US13)

Validates the v2 role-based tokens + portal against real chain state (snapshots/dividends
are out of scope — OZ 5.x removed ERC20Snapshot). Run on local (1337) + Mordor (63).

### A. Role-based admin + caps (US6/US9)
1. Create a v2 capped ERC-20 (cap = N). Confirm the issuer holds DEFAULT_ADMIN/MINTER/
   PAUSER/BURNER roles (getRoleMember).
2. Mint up to the cap (progress/headroom update); a mint over the cap reverts
   (`ERC20ExceededCap`). An uncapped (cap 0) token mints freely.
3. Grant MINTER to a second wallet → it can mint; revoke → it cannot. A non-role caller
   is rejected for every role-gated action.
4. Transfer ownership → DEFAULT_ADMIN_ROLE moves; prior owner loses authority. Renounce →
   no admin remains (irreversible; UI confirms first).

### B. Transfer controls + compliance (US7/US8)
1. Pause → all transfers/mints/burns revert; unpause resumes.
2. Freeze an address → it cannot send/receive; it appears in the frozen list; unfreeze →
   restored.
3. Restricted token: add/remove eligibility (single + batch), set default restriction
   message; `detectTransferRestriction` matches the actual transfer outcome in every case.

### C. Batch distribute (US11)
1. `batchTransfer`/`batchMint` to several recipients in one tx → every balance updates;
   the UI preview's count/total match the result. Over `MAX_BATCH` reverts (no silent
   truncation).

### D. Holders + activity (US10/US12) — indexing-dependent
1. On a subgraph network: after transfers + admin actions, the cap table lists ranked
   holders with balances/percentages matching chain, and the activity feed shows the
   events (type/actor/tx/time).
2. On Mordor (no subgraph): the cap table + activity views show a truthful "unavailable on
   this network" state (may show the connected user's own balance) — **no fabricated rows**.

### E. Portal IA + theme (US1/US5/US13)
1. In My Account → **Tokens**: My Tokens / Create / Explorer tabs work; the per-token
   detail shows only sub-tabs valid for the token's standard + your authority.
2. Toggle app dark mode → the token module restyles via theme variables (no hardcoded
   light-only colors).
3. Contract sub-tab shows real metadata/verification/deployments; copy address/ABI work.

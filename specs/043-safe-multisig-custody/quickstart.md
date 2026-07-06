# Quickstart & Validation: Safe Multisig Custody

Runnable scenarios proving the feature end-to-end. See [data-model.md](./data-model.md),
[contracts/](./contracts/), and the spec's acceptance scenarios for detail. This is a validation guide, not
implementation.

## Prerequisites

- Repo installed (`npm install`) and frontend deps (`cd frontend && npm install`).
- Access to Mordor (63) and/or Polygon (137) RPC; a funded test wallet (or two/three for multi-owner tests).
- Safe v1.4.1 is already live on Mordor/Polygon (see research.md) — nothing to deploy for Safe itself.
- `SafeProposalHub` deployed to the target chain and synced:
  `npx hardhat run scripts/deploy/custody/deploy-safe-proposal-hub.js --network mordor` then
  `npm run sync:frontend-contracts -- --network mordor --chainId 63`.

## Automated checks

```bash
npm run compile
npm test                     # includes test/custody/SafeProposalHub.test.js
npm run test:fork            # test/fork/safe-mordor-polygon.fork.js — create→approve→execute round-trip
npx slither contracts/custody/SafeProposalHub.sol
npm run test:frontend        # Vitest: custody lib/hooks/components, custodySource, backup round-trip, a11y
```
Expected: all green; Slither reports no new high/critical; `vitest-axe` passes for Custody UI.

## Scenario 1 — Create & view a vault (US1 / FR-004–008)

1. `npm run frontend`; connect a wallet on Mordor; open **My Wallet → Finance → Custody → On chain**.
2. Create vault with 3 owners, threshold 2. Confirm the predicted address is shown before signing; sign the
   `createProxyWithNonce` tx.
3. **Expected**: after mining, the vault appears with the correct address, 3 owners, threshold 2, and zero
   balance — all read from chain. A `vaultReferences` entry with your label is stored.
4. In a fresh browser profile, **Load** the same vault by address. **Expected**: identical owners/threshold
   read live. Setting an invalid threshold (e.g. 4 for 3 owners) is blocked with a clear message.

## Scenario 2 — Propose, approve, execute a transfer (US2 / FR-009–016)

1. Fund the vault with a supported ERC-20. As owner A, **Propose** a transfer of that token to an address.
2. **Expected**: proposal shows in the vault's pending queue, status `pending`, "1 of 2 approvals". A
   `Proposed` event is emitted to `SafeProposalHub`; owner A's `approveHash` is recorded.
3. As owner B (different browser/wallet), open Custody — the pending proposal is **discovered from chain**
   (hub event; hash recomputed and verified). Approve it.
4. **Expected**: status flips to `ready`. Any owner clicks Execute → `execTransaction` with pre-validated
   signatures (sorted ascending by owner) succeeds; balance moves; proposal moves to history as `executed`.
5. Negative checks: executing at `pending` is blocked; owner B approving twice does not reach 3 (idempotent);
   a second proposal at the same nonce becomes `superseded` once one executes.

## Scenario 3 — Operate as the vault: wager + transfer (US3 / FR-020–024)

1. With a vault you own, toggle **operate as** that vault. **Expected**: a persistent indicator shows the vault
   as the active identity across the app.
2. Go to **Create Wager**, build a wager. **Expected**: instead of an immediate tx, a **pending vault
   transaction** is created (MultiSend `approve + createWager`) and appears **only** in the Custody queue — no
   placeholder in My Wagers. After co-owners approve to threshold and it executes, the wager becomes active
   with the vault as creator.
3. Go to **Pay & Transfer**, send from the vault. **Expected**: creates a pending vault transaction subject to
   threshold, not an immediate send.
4. Switch back to personal wallet. **Expected**: subsequent actions are single-signer; indicator updates.
5. **Inbound check** (FR-022c): trigger a refund owed to the vault → succeeds via a single owner, no threshold.
   A vault-**won** payout claim → correctly requires a threshold Safe transaction (documented exception).

## Scenario 4 — Governance (US4 / FR-018–019)

1. Propose "add owner D, threshold 3". Approve to threshold; execute.
2. **Expected**: vault now shows 4 owners, threshold 3, read live; the next transaction requires 3 approvals.
   Proposing a threshold above the resulting owner count is blocked.

## Scenario 5 — Backup & restore (US5 / FR-025–026)

1. Add two vaults with custom labels. Run **Backup** (Tools → Backup).
2. Restore in a fresh browser profile with the same wallet. **Expected**: both vaults and labels reappear in
   Custody. The IPFS bundle is unreadable without the wallet (encrypted); no key material is in the bundle.

## Scenario 6 — Notifications (US6 / FR-027–028)

1. With Custody notifications enabled, have a co-owner propose a transaction needing your approval.
2. **Expected**: a "needs your action" entry appears in the activity feed and deep-links to the Custody vault.
3. Set the **Custody** source to `silent` in Notification Preferences. **Expected**: new vault events stop
   surfacing while other sources still work.

## Network gating (FR-030)

Switch to an unsupported network (no Safe / hub resolved). **Expected**: Custody shows "unavailable on this
network" rather than a broken UI. The **Off chain** sub-section is always visible but disabled.

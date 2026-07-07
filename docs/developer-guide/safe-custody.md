# Safe Multisig Custody (spec 043)

Custody brings the [Safe](https://safe.global) (v1.4.1) multisignature vault pattern — as deployed by the
Ethereum Classic Cooperative — into FairWins. Members create or load a shared vault, then propose / approve /
execute vault transactions under a configurable threshold, and can **operate as** the vault across the app's
money-moving surfaces. It lives under **My Wallet → Finance → Custody**, split into **On chain** (the multisig)
and **Off chain** (a disabled placeholder).

Spec/plan/tasks: [`specs/043-safe-multisig-custody/`](../../specs/043-safe-multisig-custody/).

## Design in one paragraph

Everything is **on-chain and serverless** — no hosted Safe Transaction Service, no app backend (unlike
`etclabscore/web-core`, which self-hosts the full Safe backend). Approvals and execution use the Safe's own
primitives: each owner calls `approveHash` on-chain, and any owner then calls `execTransaction` with
**pre-validated signatures** (`v=1`, `r=owner`) once the threshold is met. Discovery of a pending transaction's
preimage is served by a tiny, immutable, **events-only** helper contract, `SafeProposalHub`, with a signed
EIP-712 payload link/QR as the never-stranded fallback. Integrity never depends on the hub: co-owner clients
recompute the Safe tx hash from the emitted parameters and reject anything that doesn't match.

## Contracts & addresses

- **`contracts/custody/SafeProposalHub.sol`** — events-only broadcaster (no funds, no state, no authority).
  Deploy per network with [`scripts/deploy/custody/deploy-safe-proposal-hub.js`](../../scripts/deploy/custody/deploy-safe-proposal-hub.js);
  see the [runbook](../runbooks/safe-proposal-hub-deploy.md). Recorded under `safeProposalHub` in `deployments/`.
- **Safe v1.4.1** contracts are **external** deployments. Their canonical addresses are **identical** across
  Ethereum Classic (61), Mordor (63), and Polygon (137) and live in
  [`frontend/src/config/safeContracts.js`](../../frontend/src/config/safeContracts.js) — they are NOT synced
  by `sync:frontend-contracts` (which only fills our own deployments). `getSafeContracts(chainId)` returns
  `undefined` on unsupported chains, which the UI renders as "unavailable on this network".

## Frontend map

| Concern | Location |
|--------|----------|
| Safe/factory/MultiSend/hub ABIs | `frontend/src/abis/{Safe,SafeProxyFactory,MultiSendCallOnly,SafeProposalHub}.js` |
| Tx encoders (hash, pre-validated sigs, MultiSend, governance) | `frontend/src/lib/custody/vaultTransaction.js` |
| Create / load / predict-address | `frontend/src/lib/custody/safeVault.js` |
| Proposal broadcast/read + verify + payload fallback | `frontend/src/lib/custody/proposalHub.js` |
| Proposal status state machine | `frontend/src/lib/custody/proposalStatus.js` |
| Shared vault proposal reader | `frontend/src/lib/custody/vaultProposalReads.js` |
| Vault references (backed up) | `frontend/src/lib/custody/vaultReferences.js` |
| Vault list/create/load hook | `frontend/src/hooks/useCustodyVaults.js` |
| Proposal queue hook | `frontend/src/hooks/useVaultProposals.js` |
| Active identity ("operate as") | `frontend/src/contexts/CustodyContext.{js,jsx}` + `frontend/src/hooks/{useCustody,useActiveAccount}.js` |
| Submit seam (personal send vs. vault proposal) | `frontend/src/lib/custody/submitAsActiveAccount.js` |
| UI | `frontend/src/components/custody/*` (mounted from `pages/WalletPage.jsx`) |

## On-chain-only transaction flow

1. **Build** a `SafeTx` (`buildSafeTx`) at the current `Safe.nonce()`.
2. **Hash** it (`computeSafeTxHash`) — an EIP-712 hash over the `SafeTx` type with domain `{chainId,
   verifyingContract: safe}`. This is proven byte-for-byte equal to the Safe's on-chain `getTransactionHash`
   (see `vaultTransaction.test.js`).
3. **Broadcast** the preimage via `SafeProposalHub.propose(...)` and record the proposer's approval with
   `Safe.approveHash(hash)`.
4. **Co-owners** discover it from the hub's `Proposed` events, recompute + verify the hash, and call
   `approveHash`.
5. **Execute** with `execTransaction` and a pre-validated signature bundle (owners sorted ascending) once
   approvals ≥ threshold.

## "Operate as" the vault

`CustodyContext` holds the active identity (`personal` | `vault`), resetting to personal on account change.
`useActiveAccount().submit({to,value,data,batch})` is the single seam every money-moving surface routes
through: in personal mode it sends via the connected signer; in vault mode it builds a `SafeTx` (batching
`approve + action` via MultiSendCallOnly when needed), broadcasts it, and records the proposer's approval —
returning a **pending proposal**, never an immediate execution. Not-yet-approved actions surface **only** in
the vault queue (FR-022b). A persistent `OperateAsIndicator` banner shows the active identity app-wide with a
switch-back control. Wired surfaces today: **Pay & Transfer** and **wager creation**; the remaining chokepoints
(Membership, Token Mint, ClearPath, Trade/Swap, wager accept + claim routing) are tracked in
[`tasks.md`](../../specs/043-safe-multisig-custody/tasks.md).

**Inbound vs. outbound (FR-022c):** receiving funds and triggering **refunds** to the vault need no threshold;
only outbound movements do. The one exception is a **vault-won wager payout claim** — `WagerRegistry` binds the
claimer to the winner and its gasless twins are `ecrecover`-only (no EIP-1271), so that claim is a
threshold-approved vault transaction.

## Backup & notifications

- **Backup (spec 032):** vault references + labels ride the app-wide encrypted backup via one `syncedObjects`
  entry; labels are client-side only, never on-chain.
- **Notifications (spec 031):** `custodySource` emits "approval-needed" (actionable), "executed", and
  "governance-changed" entries, controllable as the **Custody** category (push/app/silent).

## Networks

Launch targets **Mordor (63)** and **Polygon (137)**. **Ethereum Classic mainnet (61)** is contract-ready (the
canonical Safe addresses already resolve) but requires an app-level ETC network block in `frontend/src/config/`
first — see the follow-ups in [`plan.md`](../../specs/043-safe-multisig-custody/plan.md).

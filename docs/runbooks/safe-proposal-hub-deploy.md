# Runbook: Deploying the SafeProposalHub (spec 043)

How to deploy the `SafeProposalHub` — the small, immutable, **events-only** helper that Custody uses for
serverless discovery of pending Safe transactions. Background:
[developer-guide/safe-custody.md](../developer-guide/safe-custody.md).

> **Why this is low-risk.** The hub holds **no funds**, has **no state**, and has **no authority over any
> Safe** — it only emits a proposer-supplied preimage. A malformed/malicious `propose` can waste only the
> proposer's own gas; co-owner clients recompute and verify the Safe tx hash before approving. It is
> nonetheless a `contracts/` change and passes Slither + the smart-contract security review in CI.

## Key facts

- **Contract:** `contracts/custody/SafeProposalHub.sol` (immutable; not upgradeable; no storage-layout gating).
- **Deploy key:** `safeProposalHub` (address) + `deployBlocks.safeProposalHub` in
  `deployments/<network>-chain<id>-v2.json`.
- **Networks:** Mordor (63) and Polygon (137) at launch. ETC mainnet (61) once the app gains an ETC network
  block.
- **Deterministic:** deployed via the shared CREATE2 helper (`generateSalt` + `deployDeterministic`), so the
  address matches what a fresh full deploy would produce.
- **Signer:** only the deploy transaction signs (no admin, no roles). Uses the standard deployer key.

## Deploy steps

1. **Compile & test** locally:
   ```bash
   npm run compile
   npx hardhat test test/custody/SafeProposalHub.test.js
   ```
2. **Deploy** to the target network (records the address + deploy block into the existing deployment file,
   without disturbing any other field):
   ```bash
   npx hardhat run scripts/deploy/custody/deploy-safe-proposal-hub.js --network mordor
   # or: --network polygon
   ```
   Re-running is safe — it no-ops if the recorded address already has bytecode.
3. **Sync** the address into the frontend config:
   ```bash
   npm run sync:frontend-contracts -- --network mordor --chainId 63
   # or: --network polygon --chainId 137
   ```
   This fills `safeProposalHub` in the matching `*_CONTRACTS` block in `frontend/src/config/contracts.js`.
4. **Verify** (optional, block explorer):
   ```bash
   npx hardhat verify --network mordor <deployed-address>
   ```

## Verification

- `deployments/<network>-chain<id>-v2.json` now has `contracts.safeProposalHub` **and**
  `deployBlocks.safeProposalHub`. **Both are required** — the frontend refuses to scan from genesis, so
  Custody's proposal queue and the notification source stay inert until the deploy block is recorded.
- In the app on that network, **My Wallet → Finance → Custody → On chain** no longer shows "unavailable", and a
  vault owner can propose → approve → execute a transaction.

## Rollback / notes

- There is nothing to roll back on-chain (immutable, value-free). To disable Custody on a network, remove the
  `safeProposalHub` entry from that network's config; the UI degrades to "unavailable" and no proposals are
  read.
- The hub is **optional infrastructure**: where it is absent, the signed EIP-712 payload link/QR discovery
  path still lets co-owners approve and execute (never-stranded). Approvals and execution never depend on it.

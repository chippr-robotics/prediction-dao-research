# Integrating Safe as a Custody Layer — Without Running Safe's Backend

*How FairWins wires Safe v1.4.1 multisig vaults into a serverless app: on-chain approvals, an events-only proposal hub, and one "operate as" seam*

---

| | |
|---|---|
| **Series** | Custody & Multisig (part 1 of 2) |
| **Part** | 7 of 34 |
| **Audience** | Treasury engineers, DAO tooling builders |
| **Tags** | `safe`, `multisig`, `custody`, `treasury` |
| **Reading time** | ~9 minutes |

> **Note**: FairWins wagers are peer-to-peer forecasts on publicly available information. Nothing here changes that: vault-originated wagers pass the same sanctions and membership checks as personal-wallet actions, and all participants remain subject to applicable law.

---

## Three Signers, One Vault, Zero Servers

The Ethereum Classic Cooperative holds its funds the way most serious on-chain organizations do: in a Safe multisig, where no single keyholder can move money. When we set out to support that pattern inside FairWins — so a group could hold a shared treasury and place wagers or send payments *as the group*, under an M-of-N approval threshold — the multisig itself was the easy part. Safe's contracts are battle-tested, audited for years, and already deployed on our target chains. Rolling our own multisig would have been the single worst security decision available to us.

The hard part was everything around the contracts. The Safe ecosystem's coordination story assumes a hosted backend: the Safe Transaction Service stores proposed transactions and collected signatures off-chain, a client gateway serves them to the wallet UI, and a config service describes each chain. The ETC Cooperative's own fork of the Safe wallet, `etclabscore/web-core`, self-hosts that entire stack pointed at Ethereum Classic.

FairWins has a constitutional rule that forbids exactly this: **no app backend**. The app must keep working — and members must never be stranded — if every piece of FairWins-operated infrastructure disappears. A custody feature whose approvals live in a database we run would violate that on day one.

So the integration question became: how do co-owners of a Safe discover a pending transaction, verify it, approve it, and execute it, using nothing but the chain? Spec 043 is the answer, and it required writing surprisingly little Solidity — one 66-line contract with no state, no funds, and no authority.

## Why Safe, and Which Safe

"Vault" in FairWins means a stock **Safe v1.4.1** proxy — not a fork, not a wrapper. Vaults created in FairWins are interoperable with the rest of the Safe ecosystem, and existing Safes (like the Cooperative's) can be loaded by address.

Version choice mattered more than expected. Safe v1.4.1 was deployed everywhere through the per-chain Safe Singleton Factory, so its canonical addresses are **byte-identical across Ethereum Classic (61), Mordor (63), and Polygon (137)**: one `SafeProxyFactory` at `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`, one `SafeL2` singleton at `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`, one `MultiSendCallOnly`, one fallback handler — the same six addresses on every target chain. (v1.3.0 is also live on ETC, but its ETC/Mordor deployment uses the `eip155` address set while Polygon uses `canonical` — a per-chain config matrix we didn't want.) We verified presence with live `eth_getCode` calls, not just the `safe-deployments` JSON; the addresses live in `frontend/src/config/safeContracts.js`, and `getSafeContracts(chainId)` returning `undefined` is how the UI honestly says "unavailable on this network."

New vaults use the `SafeL2` singleton (it emits richer events for indexing) and deploy via `SafeProxyFactory.createProxyWithNonce(singleton, initializer, saltNonce)` — CREATE2, so the UI shows the vault's address before it exists.

Notably, there is no runtime Safe SDK in the app. `@safe-global/protocol-kit` assumes the Transaction Service we refuse to run; the ABIs we actually need are tiny and stable, so they're hand-maintained in `frontend/src/abis/` and driven through ethers v6 like every other contract in the codebase.

## Approvals Without Signatures: the On-Chain-Only Flow

Safe supports two ways to authorize a transaction: off-chain ECDSA signatures collected somewhere, or **on-chain hash approvals**. We use only the second. The flow, implemented in `frontend/src/lib/custody/vaultTransaction.js`:

1. **Build** the `SafeTx` at the vault's current `nonce()`.
2. **Hash** it — an EIP-712 hash over the `SafeTx` type with domain `{chainId, verifyingContract: safe}`, proven byte-for-byte equal to the Safe's own `getTransactionHash` in our tests.
3. **Approve**: each owner sends an on-chain `Safe.approveHash(safeTxHash)` transaction. The chain itself becomes the signature store.
4. **Execute**: once approvals meet the threshold, any owner calls `execTransaction` with a *pre-validated* signature bundle — no ECDSA anywhere:

```js
export function buildPrevalidatedSignatures(approverAddresses) {
  // For each approving owner, 65 bytes: r = owner left-padded to 32 bytes,
  // s = 32 zero bytes, v = 0x01 — concatenated in ASCENDING owner order
  // (Safe's checkNSignatures loop requires currentOwner > lastOwner).
  ...
}
```

For `v == 1`, the Safe accepts a signature block iff `approvedHashes[owner][hash] != 0` (or the owner is `msg.sender`). Duplicate approvals can't double-count — the ascending-owner-order requirement makes a repeated block invalid on-chain, and the encoder rejects duplicates client-side first.

This flow is inherently never-stranded: the vault's state *is* the coordination state. If FairWins vanishes, any generic Safe tooling can read the same `approvedHashes` and finish the job.

## The Missing Piece: Preimage Discovery

On-chain approvals create one real gap. `ApproveHash` events reveal only a 32-byte hash. A co-owner asked to approve `0x3f9a…` has no idea what it does — the full parameters (`to, value, data, operation, nonce`) don't appear on-chain until execution, which is too late to review.

The Safe Transaction Service exists largely to fill this gap. Our replacement is `contracts/custody/SafeProposalHub.sol` — an immutable, events-only broadcaster:

```solidity
function propose(
    address safe,
    address to,
    uint256 value,
    bytes calldata data,
    uint8 operation,
    uint256 nonce,
    bytes32 safeTxHash
) external {
    if (operation > 1) revert InvalidOperation();
    if (data.length > MAX_DATA_LENGTH) revert DataTooLong();
    emit Proposed(safe, msg.sender, safeTxHash, to, value, data, operation, nonce);
}
```

That is essentially the whole contract. No state, no funds, no roles, no external calls; it cannot approve or execute anything. The proposer emits the transaction's full preimage; co-owner clients index `Proposed` for their vaults, **recompute the Safe transaction hash from the emitted parameters, and reject anything that doesn't equal the claimed `safeTxHash`** before ever calling `approveHash`. Integrity is free: a tampered or spoofed preimage produces a different hash and dies in the co-owner's own client. The worst a malicious `propose` can do is waste the proposer's gas. There's also an advisory `cancel` event — advisory because the Safe nonce, not the hub, is the real arbiter of which transaction is live.

And because even this tiny contract is optional infrastructure, there's a fallback: the proposer can export the `SafeTx` as a signed EIP-712 typed payload and share it as a link or QR code. The co-owner imports it, verifies the same hash, and approves — working even on a chain where the hub was never deployed. The hub is recorded per network in `deployments/` (Polygon: `0x94b5b38C247CE51F7C42C83B63115998b7e970E7`), deliberately built without OpenZeppelin imports so it compiles for pre-Cancun targets like ETC and Mordor.

## "Operate As" — One Seam, Every Money-Moving Surface

A custody tab that only sends transfers is a standalone Safe client, not an integration. The point of spec 043 is that a member can *become* the vault: create a wager staked from the vault, or pay someone from it, with the action gated on co-owner approval.

The frontend previously had no act-as concept — identity was always the connected wallet address. Rather than teach every flow about contract accounts, all money-moving surfaces route their final intent through one seam, `frontend/src/lib/custody/submitAsActiveAccount.js`:

- **Personal mode**: send through the connected signer, exactly as before.
- **Vault mode**: build the `SafeTx` (batching `approve` + action through `MultiSendCallOnly` when an ERC-20 allowance is needed), broadcast it via the hub, record the proposer's own `approveHash` — and return a **pending proposal**, never an executed action.

`MultiSendCallOnly` rather than `MultiSend` is a deliberate restriction: the batch's inner transactions can only `CALL`, never nested-delegatecall — a smaller attack surface for the routine approve-then-act pattern. A persistent banner shows which identity is active, and a pending vault action appears *only* in the vault's queue — it never shows up as a phantom entry in My Wagers or transfer history until the chain confirms it, because implying state the chain hasn't confirmed is exactly the dishonesty the design forbids.

One honest wrinkle surfaced during research. Inbound movements — receiving funds, triggering a refund owed to the vault — need no threshold, since `claimRefund` in the wager registry is caller-agnostic and routes funds to recorded parties. But `claimPayout` requires `msg.sender == winner`, and its gasless twin recovers an EOA signature via `ecrecover` with no EIP-1271 support. So a vault that *wins* a wager must claim through a threshold-approved `execTransaction`. We documented that as the FR-022c exception rather than pretending a single owner could pull the payout; fixing it properly means adding EIP-1271 verification to the registry's intent facet, which is future work, not v1.

## The Guard Socket

Everything above makes the vault usable; it doesn't yet make it *governable* beyond M-of-N. Safe's answer to programmable policy is the transaction guard: a contract the Safe consults via `checkTransaction(...)` before executing anything and `checkAfterExecution(...)` after. The custody family ships the scaffolding for this — `contracts/custody/ISafeGuard.sol`, a dependency-free replica of Safe v1.4.1's guard interface whose selectors (and thus its ERC-165 interface id, which `setGuard` checks) are byte-identical to the canonical one, and `contracts/custody/PolicyGuardSetup.sol`, a stateless helper delegatecalled from `Safe.setup` so a new vault is policy-governed from its very first transaction, with the initial policy committed into the vault's CREATE2 address.

What those policies look like — spending rules enforced at execution time, so a quorum of compromised signers still can't violate them — is spec 049, and it's the subject of part 2.

## Design Decisions

- **Adopt Safe v1.4.1, don't fork it.** Years of audits and ecosystem interoperability for free; the version chosen specifically because its canonical addresses match across all three target chains.
- **No hosted coordination.** On-chain `approveHash` + pre-validated signatures replace the Safe Transaction Service entirely. Cost: every approval is a gas-paying transaction. Benefit: the chain is the single source of truth, and the never-stranded rule holds.
- **Events-only discovery with client-side verification.** `SafeProposalHub` carries data, never trust; the signed-payload fallback means zero required infrastructure.
- **One `submitAsActiveAccount` seam** instead of per-surface vault logic — seven heterogeneous flows reroute through one audited chokepoint.
- **Honest state over convenience.** Pending vault actions live only in the vault queue; the vault-won-payout exception is documented instead of papered over.
- **References-only backup.** The encrypted app backup (spec 032) stores vault addresses and labels — never key material; the vault itself lives on-chain and reloads by address.

## Sources

- `specs/043-safe-multisig-custody/` — spec.md, research.md (decisions 1–8), plan.md
- `docs/developer-guide/safe-custody.md` — developer guide
- `docs/developer-guide/treasury-security.md` — multisig-owned `TreasuryVault` pattern
- `contracts/custody/SafeProposalHub.sol`, `contracts/custody/ISafeGuard.sol`, `contracts/custody/PolicyGuardSetup.sol`
- `frontend/src/lib/custody/vaultTransaction.js`, `frontend/src/lib/custody/submitAsActiveAccount.js`, `frontend/src/config/safeContracts.js`
- `deployments/polygon-chain137-v2.json` — `safeProposalHub` address
- Safe contracts & docs — https://safe.global / https://github.com/safe-global/safe-smart-account
- Safe deployments registry — https://github.com/safe-global/safe-deployments
- EIP-712 (typed structured data hashing) — https://eips.ethereum.org/EIPS/eip-712
- EIP-1271 (contract signature validation) — https://eips.ethereum.org/EIPS/eip-1271
- ERC-165 (interface detection) — https://eips.ethereum.org/EIPS/eip-165
- ETC Cooperative Safe wallet fork — https://github.com/etclabscore/web-core

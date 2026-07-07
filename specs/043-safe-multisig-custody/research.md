# Phase 0 Research: Safe Multisig Custody

All contract-presence claims were verified by live `eth_getCode` against public ETC mainnet
(`https://etc.rivet.link`) and Mordor (`https://rpc.mordor.etccooperative.org`, `eth_chainId` = `0x3f` = 63)
RPCs, cross-referenced with `@safe-global/safe-deployments`.

## Decision 1 — Safe contract version: **v1.4.1 (canonical addresses)**

**Decision**: Target **Safe v1.4.1**, whose `canonical` deployment addresses are **identical across ETC (61),
Mordor (63), and Polygon (137)** because v1.4.1 was deployed through the per-chain Safe Singleton Factory
(`0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7`).

Verified live addresses (non-empty bytecode on ETC + Mordor; canonical also on Polygon):

| Contract | Address (all three chains) |
|----------|----------------------------|
| `Safe` (L1) singleton | `0x41675C099F32341bf84BFc5382aF534df5C7461a` |
| `SafeL2` singleton | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` |
| `SafeProxyFactory` | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` |
| `CompatibilityFallbackHandler` | `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99` |
| `MultiSend` | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` |
| `MultiSendCallOnly` | `0x9641d764fc13c8B624c04430C7356C1C7C8102e2` |

**Rationale**: One address set across every target chain drastically simplifies config, testing, and the
multi-network story (FR-030). Use the **`SafeL2`** singleton for new vaults (richer events for our
`useVaultProposals` indexing) with the version-matched `CompatibilityFallbackHandler` so EIP-1271 / token
receiver hooks work.

**Alternatives considered**:
- *v1.3.0 (eip155 variant)*: also live on ETC/Mordor, but its addresses **differ per chain** (ETC/Mordor use
  the `eip155` set at `0x69f4D1…2938` / factory `0xC22834…910BC`; Polygon uses `canonical`). Rejected — more
  config surface, no benefit. The well-known cross-chain v1.3.0 `canonical` addresses are **not** on ETC
  (verified: canonical factory `0xa6B71E…6AB2` returns `0x` on ETC).

**Action before relying on it**: verify deployed bytecode hash of the L2 singleton + MultiSend against
`safe-deployments` `deployedBytecode` during implementation (the L1 singleton `0x69f4…` and v1.3.0 MultiSend
came from JSON only and are not used by this plan).

## Decision 2 — No hosted backend; drive Safe contracts directly

**Decision**: Do **not** stand up or depend on any Safe Transaction Service / Client Gateway / Config Service.
Drive the Safe contracts directly for create, read, approve, and execute.

**Rationale**: FR-017 mandates on-chain-only coordination with no app backend. Note that **etclabscore/web-core
does *not* avoid a backend** — it is a fork of the Safe{Wallet} frontend that self-hosts the full Safe backend
stack (`etclabscore/safe-transaction-service`, `safe-client-gateway`, `safe-config-service`) pointed at ETC.
Replicating that contradicts our constitution ("no app backend", "honest state") and the user's clarified
choice. We therefore use the reference only for *chain wiring intent*, not its architecture.

## Decision 3 — Vault creation and the on-chain transaction flow

**Create a vault** (one transaction, deterministic address):
`SafeProxyFactory.createProxyWithNonce(singleton, initializer, saltNonce)` where
`initializer = Safe.setup(owners, threshold, 0, 0x, CompatibilityFallbackHandler, 0, 0, 0)`
(`paymentToken=0`, `payment=0`, no setup delegatecall). Emits `ProxyCreation(proxy, singleton)`. The address is
previewable off-chain via CREATE2 so the UI can show it before deploying.

**Propose / approve / execute (on-chain only)**:
1. **Compute** `safeTxHash = Safe.getTransactionHash(to, value, data, operation, safeTxGas=0, baseGas=0,
   gasPrice=0, gasToken=0, refundReceiver=0, nonce = Safe.nonce())`.
2. **Approve**: each owner calls `Safe.approveHash(safeTxHash)` on-chain (emits
   `ApproveHash(bytes32 indexed, address indexed)`; sets `approvedHashes[owner][hash]=1`; **no revocation** — an
   approved hash is permanent, like a stored signature).
3. **Execute** (anyone, once ≥ threshold approvals): `Safe.execTransaction(...)` with a **pre-validated
   signature bundle** — 65 bytes per approving owner, `v = 1`:
   `r = owner address left-padded to 32 bytes`, `s = 32 zero bytes`, `v = 0x01`; blocks **concatenated in
   ascending owner-address order**. For `v==1` the Safe accepts the signature iff `msg.sender == owner` **or**
   `approvedHashes[owner][hash] != 0` — so no off-chain ECDSA is ever needed.

**Reads** for state/queue: `getOwners()`, `getThreshold()`, `nonce()`, `isOwner(address)`,
`approvedHashes(owner, hash)`.

**Rationale**: This is the canonical serverless Safe flow. It satisfies "on-chain only," is inherently
never-stranded (any owner can execute once threshold approvals exist), and needs no shared signature store.

**Batching (approve + createWager, etc.)**: encode a `MultiSendCallOnly.multiSend(bytes)` batch and execute it
as a single Safe transaction with `operation = 1` (delegatecall to `MultiSendCallOnly`). `MultiSendCallOnly`
(not `MultiSend`) is chosen so the batch's inner transactions are restricted to `CALL` (no nested
delegatecall) — smaller attack surface for the common approve+action pattern.

## Decision 4 — Preimage discovery: **on-chain `SafeProposalHub` (primary) + EIP-712 payload link/QR (fallback)**

**Problem**: With on-chain-only approvals, a co-owner needs the full transaction **preimage**
(`to, value, data, operation, nonce`) to recompute and approve the correct hash. On-chain, the Safe reveals
only the 32-byte hash (via `ApproveHash`) until the params appear in `execTransaction` calldata at execution —
too late.

**Decision**:
- **Primary — `SafeProposalHub`**: a tiny, immutable, **events-only** helper contract. The proposer calls
  `propose(safe, to, value, data, operation, nonce, safeTxHash)` which does nothing but
  `emit Proposed(indexed safe, indexed proposer, safeTxHash, to, value, data, operation, nonce)` (and a
  `cancel`/status event as needed). Co-owner clients index `Proposed` for their vaults, **recompute
  `getTransactionHash` from the emitted params, verify it equals `safeTxHash`**, then `approveHash`. Integrity
  is free — a tampered preimage yields a different hash and is rejected by the owner's own client.
- **Fallback — signed EIP-712 payload**: the proposer can always share the serialized `SafeTx` (EIP-712 typed
  JSON) as a link / QR / file; the co-owner imports, verifies the hash, and approves. This works even on a
  chain where the hub is not deployed → **never-stranded**.

**Rationale**: Keeps discovery **on-chain and serverless** (matches the clarified on-chain-only choice and "no
app backend") while the hub carries **no funds and no authority over any Safe** — it cannot move money or
approve anything; it only echoes data the proposer supplies. This mirrors the codebase's established
"optional on-chain infra + never-stranded self path" pattern (spec 036 relayer). The fallback guarantees the
feature works with zero infrastructure.

**Alternatives considered**:
- *Off-chain payload sharing only*: simplest/no contract, but de-prioritized by the user as the *primary*
  mechanism; retained as the fallback.
- *Reuse encrypted-sync store for preimages*: rejected in clarification (on-chain-only, no shared store).
- *Safe Module that approves on behalf while logging*: rejected — modules bypass the threshold check; unsafe.

## Decision 5 — No new runtime Safe SDK; hand-rolled ABIs + ethers v6

**Decision**: Interact with Safe using **hand-maintained minimal ABIs** (`Safe`, `SafeProxyFactory`,
`MultiSendCallOnly`, `SafeProposalHub`) in `frontend/src/abis/`, called through **ethers v6** (already the
codebase's contract layer). Canonical Safe addresses live in a new `frontend/src/config/safeContracts.js`
keyed by chainId; `SafeProposalHub` addresses are synced into the existing `*_CONTRACTS` blocks by
`sync:frontend-contracts` like every other deployed contract.

**Rationale**: Constitution requires justifying new core tech and prefers the smallest change. `@safe-global/protocol-kit`
is heavyweight and its defaults assume the Transaction Service we are explicitly not running; the Safe ABIs we
need are tiny and stable. Hand-rolled ABIs match the repo convention (ABIs are hand-maintained;
`sync:frontend-contracts` only updates address string literals, not ABIs).

**Alternatives considered**: `@safe-global/protocol-kit` / `safe-core-sdk` (rejected: new heavy dependency,
backend-oriented defaults), `@safe-global/safe-deployments` at runtime (rejected: we only need a handful of
fixed addresses — use it as a *dev-time reference* to author the config, not a runtime import).

## Decision 6 — "Operate as" the vault: a single `submitAsActiveAccount` seam

**Decision**: Introduce a `CustodyContext` holding the **active identity** (personal wallet vs. a chosen vault)
and a persistent `OperateAsIndicator`. All fund-moving flows route their final `{to, value, data, operation?}`
through one shared `submitAsActiveAccount(tx)`:
- **Personal mode** → existing behavior (`signer.sendTransaction` / `contract.method(...)` /
  `useGaslessWrite`).
- **Vault mode** → build the SafeTx, compute the hash, `propose` (emit to hub) + proposer `approveHash`, and
  return a **pending proposal** (no immediate execution). The action materializes only after threshold approval
  + execution (FR-022b).

**Rationale**: The frontend has **no existing act-as concept** — identity is always the connected wagmi
address, and authorization "always keys off `address`." A vault is a *contract* account that "signs" via
threshold on-chain approvals, so a per-call `modalSigner` swap can't represent it. A single seam is the
smallest change that satisfies "all money-moving surfaces" and keeps the 7 heterogeneous chokepoints
(wager create/accept, Pay & Transfer, Membership, Token Mint, ClearPath governance, Trade/Swap) rerouting
through one audited place. **Staged by priority**: P1 wires Transfer + Wager; P2 wires Membership, ClearPath,
Token Mint, Trade.

## Decision 7 — Inbound vs. outbound; the wager-payout reconciliation

**Facts** (verified in `contracts/wagers/`):
- `claimRefund` is **caller-agnostic** (`notFrozen(msg.sender)` only; funds route to recorded
  creator/opponent). → A vault's refunds need **no** threshold; any owner triggers them. ✅ FR-022c.
- Plain ERC-20 receipts into the vault need nothing. ✅ FR-022c.
- `claimPayout` requires **`msg.sender == w.winner`**, and `claimPayoutWithSig` recovers an **EOA** signer
  (`ecrecover`, no EIP-1271). → A vault that *wins* a wager can claim **only** via `execTransaction` from the
  Safe, i.e. a **threshold-gated** action.

**Decision**: Scope FR-022c's "inbound needs no approval" to **receipts + refunds**. **Vault-won wager payout
claims are a threshold Safe transaction** in v1 (documented, honest). A future option — add EIP-1271 intent
verification to `WagerRegistryIntents` so a relayer can execute a Safe-signed claim — is **out of scope**.

**Rationale**: Honest-state principle forbids implying the chain will let a single owner pull a payout when the
registry binds the caller to the winner. The reconciliation is reflected in spec FR-022c.

## Decision 8 — Networks at launch

**Decision**: Enable Custody on **Mordor (63)** and **Polygon (137)** at launch — the intersection of
app-supported chains and verified Safe v1.4.1 deployments. Deploy `SafeProposalHub` to each. **Ethereum Classic
mainnet (61)** is the origin target and its Safe addresses are verified ready, but the app's `contracts.js` has
**no `61` block today**; adding an ETC network entry (RPC, chain config, token config) is a **prerequisite**
tracked separately, after which Custody + a hub deploy light it up with the same address set.

**Rationale**: Matches the CLAUDE.md launch sequence (Mordor → Polygon) and avoids coupling this feature to a
broader ETC-network onboarding effort while keeping the door open (config-only) per FR-030.

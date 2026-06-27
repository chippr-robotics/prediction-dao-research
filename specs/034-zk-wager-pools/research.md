# Phase 0 Research: ZK-Wager Pools

**Feature**: 034-zk-wager-pools | **Date**: 2026-06-27

This document resolves the technical unknowns for the ZK-Wager Pools feature. Each
section follows **Decision / Rationale / Alternatives / Risks**. On-chain facts were
verified by live `eth_call` against Polygon (137) and Amoy (80002); protocol facts cite
PSE/Semaphore and OpenZeppelin primary docs and ETC ECIPs.

---

## 1. Anonymous membership & voting primitive — Semaphore V4

**Decision**: Use **Semaphore V4** (`@semaphore-protocol/contracts`, `ISemaphore`/`Semaphore.sol`).
Create **one Semaphore group per pool**, with the pool (or factory) as the group **admin**.
A join inserts the member's `identityCommitment` via `addMember`. A vote calls
`validateProof` with `scope = proposalId`; the m-of-n tally is counted in our pool
contract. The vote choice rides in the `message` field.

The V4 proof struct (supersedes the outdated sketch in the original spec input):

```solidity
struct SemaphoreProof {
    uint256 merkleTreeDepth;
    uint256 merkleTreeRoot;
    uint256 nullifier;
    uint256 message;   // V3 "signal" — carries the vote choice
    uint256 scope;     // V3 "externalNullifier" — set to proposalId
    uint256[8] points; // Groth16 proof
}
function validateProof(uint256 groupId, SemaphoreProof calldata proof) external;
```

`validateProof` rejects a reused nullifier within the group
(`Semaphore__YouAreUsingTheSameNullifierTwice()`), giving **one vote per member per
proposal** for free; across proposals (different `scope`) the same member's nullifiers
are uncorrelated, and the proof never reveals which leaf voted.

**Rationale**: V4 is the maintained, audited (PSE, Mar 2024) line with the gas-efficient
Lean Incremental Merkle Tree and stable canonical deployments. Semaphore enforces
double-vote prevention and anonymity on-chain; our contract only counts validated proofs
and applies the threshold — clean separation of the anonymity primitive from app logic.

**Alternatives**: Semaphore V3 (deprecated, far costlier inserts); a hand-rolled
Groth16 + IMT scheme (large security + trusted-setup burden); `@semaphore-noir` (newer,
less battle-tested). All rejected.

**Risks**:
- The deployed `Semaphore.sol` is a **permissionless singleton** — anyone can
  `createGroup`/`addMember`. Our contract MUST own group-admin rights and gate all joins
  through itself (sanctions/membership/escrow happen in our `join`, then it calls
  `addMember`). This is the single most important security invariant.
- Vote **choices** in `message` are public (only the voter is hidden). Acceptable for
  wager resolution; hidden tallies would need an extra encryption layer (out of scope).
- Poseidon hashing is a Solidity library (ZK-Kit `PoseidonT3`), not a precompile, so
  inserts pay real gas — cheap on Polygon/ETC, fine here.

---

## 2. Merkle tree depth & cost for ~1,000 members

**Decision**: Use **tree depth 16** (capacity 65,536; far above the ~1,000-member cap).
Per-proof verification cost is **constant** regardless of group size.

**Rationale**: Capacity = 2^depth; depth 10 = 1,024 (too tight), depth 16 gives generous
headroom at negligible extra circuit cost. LeanIMT grows dynamically, so depth headroom
costs nothing on inserts. Groth16 verification is a fixed pairing check over `points[8]`,
independent of member count or depth → the spec's constant-per-proof-cost requirement
(FR-002a, SC-012) holds. V4 circuits support `MAX_DEPTH` 1–32.

**Alternatives**: depth 10 (no headroom — rejected); depth 32 (max, unnecessary).

**Risks**: `addMember` on-chain insert scales ~linearly with current depth (≈depth Poseidon
hashes); use `addMembers` batch where applicable. **Confirm exact gas locally** via the
Hardhat gas report — published figures are chart-only (verify ≈200k–330k gas for
`validateProof`; ≈sub-$1 to add 1,000 members in V4).

---

## 3. Semaphore deployments per network + Ethereum Classic feasibility

**Decision**:
- **Polygon (137) & Amoy (80002)**: use the **canonical V4 singletons** (same CREATE2
  address across chains): Semaphore `0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D`,
  SemaphoreVerifier `0x4DeC9E3784EcC1eE002001BfE91deEf4A48931f8`. **Verify the Amoy
  address on-chain before relying on it** (testnet deployments can lag/redeploy).
- **Mordor (63) / ETC mainnet (61)**: **self-deploy** `SemaphoreVerifier` + `Semaphore`
  (no canonical PSE deployment exists on ETC). **Pin `evmVersion: "shanghai"`** for ETC
  builds.

**Rationale (ETC go/no-go = GO)**: ETC has both prerequisites:
- **alt_bn128 pairing precompiles** (0x06/0x07/0x08) from the **Atlantis** upgrade (2019,
  EIP-196/197), repriced by **Phoenix** (EIP-1108) → Groth16 verification works.
- **PUSH0** (EIP-3855) from the **Spiral** upgrade (2024; Mordor block 9,957,000, ETC
  mainnet block 19,250,000) → `solc >=0.8.23` (Semaphore's pragma) default output runs.

The trusted-setup artifacts are chain-agnostic, so the same verifier/`.zkey` works on ETC.

**Alternatives**: a non-anonymous fallback resolution path on ETC (rejected — defeats the
feature); compiling for a pre-Shanghai EVM (unnecessary post-Spiral).

**Risks**:
- **Confirm target RPC nodes are post-Spiral** — pre-upgrade nodes lack PUSH0 and deploys
  fail. Pin to upgraded RPCs.
- ETC has **not** adopted Cancun — **must pin `evmVersion: "shanghai"`** so solc doesn't
  emit transient-storage/MCOPY opcodes ETC lacks. Real footgun.
- Tooling/explorer maturity on Mordor is thinner than Polygon; budget integration time.
- **P1 may ship Polygon/Amoy first and defer ETC** to reduce risk (recommended phasing).

---

## 4. Off-chain proof generation & trusted setup

**Decision**: Frontend uses `@semaphore-protocol/identity`, `/group`, `/proof`. Generate
proofs **in-browser** (snarkjs + wasm). **Self-host** the `.wasm` + `.zkey` artifacts
(verify their hash against PSE's published artifacts) and lazy-load them only when a member
is about to vote. Reuse Semaphore's **existing production ceremony** — do **not** run our
own.

**Rationale**: Mature, maintained packages with a browser path; the PSE ceremony (Perpetual
Powers of Tau Phase 1 + Semaphore Phase 2) is broad and audited, and the deployed
`SemaphoreVerifier` already embeds its verifying key. Rolling our own buys nothing since we
do not modify the circuit.

**Alternatives**: custom circuit + own ceremony (only if we change the circuit — we don't).

**Risks**: artifact download latency/availability → self-host; multi-MB `.zkey` first load →
lazy-load behind a spinner. Proof-gen UX budget ≈2–15s; show progress. Verify the self-hosted
`.zkey` hash matches PSE to avoid shipping a tampered proving key.

---

## 5. Pool asset & gasless join — USDC (EIP-3009 preferred)

**Decision**: Pool asset is **native Circle USDC**: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
(137), `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` (80002). For the **gasless join (P2)**,
prefer **EIP-3009 `receiveWithAuthorization`** over EIP-2612 `permit`. Mordor USDC
(`0xDE093684c796204224BC081f937aa059D903c52a`) is read from the per-network `paymentToken`
config.

**Rationale**: Native USDC is Circle `FiatTokenV2_2` — EIP-712 domain
`{name:"USD Coin", version:"2", chainId, verifyingContract}`, standard `permit`, **and**
EIP-3009 (verified live). EIP-3009 `receiveWithAuthorization` does a one-shot pull with a
**random 32-byte nonce** (no sequential-nonce ordering), **no lingering allowance**, and is
**immune to the permit front-running griefing** where a watcher submits the permit first and
reverts the user's tx. For a value-bearing escrow join, that is cleaner and safer.

**Alternatives**: EIP-2612 `permit` + `transferFrom` in one contract call (works; must catch
"allowance already set" as success to survive front-running); bridged **USDC.e**
(`0x2791…`, domain version **"1"**, name "USD Coin (PoS)") — supported but a **different
domain**; only support it if we derive the domain per-token at signing time.

**Risks**:
- **Domain-version footgun**: native USDC = "2", USDC.e = "1". A signature built with the
  wrong version silently fails `ecrecover`. Read `DOMAIN_SEPARATOR`/`name`/`version` per
  token+chain or hardcode per verified address.
- P1 joins are non-gasless (member pays gas with a normal `transferFrom`/`approve`); gasless
  is additive in P2.

---

## 6. Isolated pool contracts — upgradeable factory + immutable clones

**Decision**: `ZKWagerPoolFactory` is a **`UUPSManaged` upgradeable proxy** (mirrors
`TokenFactory`, spec 028). It deploys **immutable** `ZKWagerPool` clones via OZ 5.4
**`Clones.cloneDeterministicWithImmutableArgs`**: the genuinely fixed references
(USDC token, Semaphore singleton, factory) are appended as **immutable args** (read from
code, no SSTORE/SLOAD); a minimal `initialize()` seeds only per-pool **mutable** state
(group id, buy-in, max members, threshold, join deadline, creator). CREATE2 salt =
`keccak256(abi.encode(groupId, creator, nonce))` for predictable, front-run-proof addresses.

**Rationale**: Repo precedent (`TokenFactory` → immutable `OpenERC20` clones, "only the
factory is upgradeable") is exactly this shape and is the documented house pattern. OZ 5.4
exposes clones-with-immutable-args natively (`cloneDeterministicWithImmutableArgs`,
`fetchCloneArgs`, `predictDeterministicAddressWithImmutableArgs`), so no third-party lib is
needed. Immutable args are cheaper and safer than storage for never-changing references, and
keep the clone's `initialize` surface tiny. Per-clone upgradeability would require full
ERC-1967 proxies (not cheap clones) and is unnecessary — clone logic is fixed; only the
**factory** evolves.

**Alternatives**: pure `initialize()` for all config (simplest; matches `TokenFactory`
exactly but costs SSTOREs and stores values that never change — acceptable fallback if
immutable-args reads complicate the security review); Solady `LibClone` (more gas-optimal,
assembly-heavy — rejected in favor of the audited OZ path).

**Risks**:
- `Clones.clone*` does **not** verify the implementation has code — guard the master/template
  address.
- Use OZ `fetchCloneArgs`/helpers for arg reads; never hand-roll offset math (historical
  `ClonesWithImmutableArgs` spoofing bugs).
- Add a once-guard so a clone can't be re-initialized; `initialize` callable **only** by the
  factory. Constructor of the master calls `_disableInitializers()`.
- Re-deploying the same salt+initcode reverts → natural idempotency guard.
- Register the factory in `npm run check:storage-layout` (CI-gated).

---

## 7. Gasless relayer architecture (P2)

**Decision**: Keep gasless **token-signature-driven**, not generic-meta-tx-driven. The user
signs an **EIP-3009 `receiveWithAuthorization`** (§5). A backend **Payload Packer** validates
the request — **and re-runs sanctions screening + membership gating on the real wallet
before forwarding** (FR-021d) — then a managed **relayer (OpenZeppelin Relayer / Defender
Relayer)** submits the `join` tx and pays gas. **No ERC-2771 or ERC-4337 is required** for
funded joins.

**Rationale**: The gasless property comes from the **token** (the signed authorization moves
funds and binds amount/recipient), so the relayer can be an untrusted gas-payer that cannot
steal funds, only censor/reorder. Replay protection is built into the token (EIP-3009 random
nonce + `authorizationState`). This is the simplest reliable path and avoids deploying/
trusting a forwarder.

**Alternatives**: **ERC-2771** trusted forwarder (`ERC2771Forwarder` + `ERC2771Context`,
per-signer nonce + deadline) — only needed if we must gaslessly relay **arbitrary** pool
calls (e.g. gasless voting); reach for it then. **ERC-4337** paymaster (e.g. Circle
Paymaster, pay gas in USDC) — full account abstraction, overkill for one join flow.
**EIP-7702** — newest, least battle-tested. **Gelato/Biconomy** — turnkey relay-as-a-service.

**Risks**:
- Don't run two nonce systems at once (EIP-3009 fund + ERC-2771 call) — prefer one path.
- Secure the relayer key (Defender/OZ Relayer or KMS); rate-limit the Payload Packer to
  prevent gas-draining.
- **Compliance**: the relayer/packer MUST NOT submit a join for a wallet that hasn't passed
  sanctions + membership checks; anonymity is downstream of those checks (FR-021d).
- The Payload Packer is **off-chain infrastructure** (Next.js API route / Lambda) — not a
  smart contract; keep it stateless and validating.

---

## 8. Dynamic indexing — The Graph data-source templates

**Decision**: Static `ZKWagerPoolFactory` data source at a fixed address handles
`PoolCreated`; its handler calls `Pool.create(event.params.pool)` to instantiate a **`Pool`
template** (declared under `templates:` with `abi` only — no `address`/`startBlock`). Mirrors
the existing **`TokenFactory` → `TokenInstance`** precedent (spec 028) already in
`subgraph/subgraph.yaml`.

**Rationale**: Pools are deployed dynamically, so static targets can't be used; templates are
the canonical scalable factory pattern and already proven in this repo. Indexing a clone
starts at its `create` block (correct — the clone didn't exist earlier). Per-pool context
(e.g. groupId) can ride via `createWithContext` + `dataSource.context()`.

**Alternatives**: none viable for dynamic clones.

**Risks**: templates cannot have a fixed address/startBlock (by design); no historical
back-fill per clone (fine — clones are new); manifest changes force a re-sync unless we
**graft** onto a prior deployment (`features: [grafting]`); use **pruning**
(`indexerHints`) to cap store size. Keep `apiVersion`/`specVersion` consistent across the
factory data source and the template. Per-network address/startBlock live in
`subgraph/networks.json` (canonical net ids `matic`/`polygon-amoy`/`mordor`); use a non-zero
placeholder address + non-genesis startBlock to keep `graph build` green pre-deployment.

---

## 9. 4-word group gateway (BIP-39) & two-word nicknames

**Decision**:
- **Gateway**: each pool is identified by **4 BIP-39 word indices** (each 0–2047 → 44 bits).
  The factory assigns a unique, collision-checked tuple and records it in a registry
  (`keccak256(indices) → pool`, plus the reverse for display). The **canonical identity is
  the index tuple**, language-independent; the frontend renders/parses it through the active
  language's BIP-39 wordlist, so the same pool resolves regardless of a member's chosen
  language (User Story 2, FR-003/FR-004). BIP-39 ships official wordlists for en, es, ja, fr,
  it, ko, zh-Hans, zh-Hant, cs, pt — satisfies "≥4 languages" (SC-008).
- **Nicknames**: derived **client-side** by hashing the member's Semaphore identity secret and
  taking deterministic modulo indices into a hardcoded adjective array and noun array
  (e.g. "Prismatic Fox"). Stable per member per pool (FR-009/FR-011). Disambiguate in-pool
  collisions by appending a short discriminator derived from the commitment (FR-012).

**Rationale**: An index tuple makes the phrase a pure rendering of a language-independent
identity (no re-translation problem), keeps uniqueness a simple on-chain set membership, and
reuses the BIP-39 lists the project already depends on conceptually (the four-word "Open
Challenge" code, spec 024, is the nearest UX precedent). Nicknames are a pure deterministic
function of local secret material, so they need no on-chain storage and never touch the wallet
address.

**Alternatives**: random phrase + opaque registry mapping with no index semantics (works but
complicates multi-language rendering); deterministic encoding of a sequential pool id (leaks
ordering, less "memorable"). The index-tuple registry is the middle ground.

**Risks**: 44 bits is ample for concurrent pools but the factory MUST collision-check on
assignment (FR-003); nickname adjective/noun arrays must be large enough to make in-pool
collisions rare and MUST be versioned (changing them changes everyone's nickname).

---

## 10. Compliance & membership reuse (repo integration)

**Decision**: Reuse the existing shared singletons against the **real wallet** at
pool-create and join:
- **Sanctions**: `ISanctionsGuard.checkBlocked(account)` (reverts `SanctionedAddress`), the
  same call `WagerRegistry._screen` makes; configurable/optional via `setSanctionsGuard`
  (`address(0)` disables per network).
- **Membership**: `IMembershipManager.checkCanCreate` → revert on deny, `recordCreate` after
  effects, `recordClose` on every terminal path. The pool/factory must be authorized via
  `setAuthorizedCaller`. Decide whether pools share `WAGER_PARTICIPANT_ROLE`'s monthly/
  concurrent budget or use a new role.

**Rationale**: FR-021 mandates full parity with one-to-one wagers; reusing the exact call
sites guarantees identical compliance behavior and keeps the checks on the wallet before any
anonymization (FR-021d).

**Alternatives**: a pool-specific compliance path (rejected — divergence risk).

**Risks**: `recordCreate`/`recordClose` must be balanced across **every** pool terminal state
(resolved, cancelled, refunded/timeout) or concurrent-limit counters leak — mirror
WagerRegistry's discipline exactly. Authorizing the new contracts on `MembershipManager` is an
admin op to capture in the deploy runbook.

---

## Cross-cutting summary

| Concern | Decision |
|---------|----------|
| Anonymity/voting | Semaphore V4, one group per pool, our contract = admin, `scope=proposalId`, tally in-app |
| Tree depth | 16 (constant verify cost) |
| Semaphore on Polygon/Amoy | canonical singletons (verify Amoy) |
| Semaphore on Mordor/ETC | self-deploy; **GO**; pin `evmVersion: shanghai`; verify post-Spiral RPC |
| Asset | native USDC (per-network `paymentToken`) |
| Gasless join (P2) | EIP-3009 `receiveWithAuthorization` + managed relayer; packer re-screens wallet |
| Pool contracts | UUPSManaged factory + immutable `cloneDeterministicWithImmutableArgs` clones |
| Indexing | factory data source + `Pool` template (TokenFactory/TokenInstance precedent) |
| Gateway | 4 BIP-39 index tuple, language-independent identity, registry collision-checked |
| Nicknames | client-side deterministic from identity secret; versioned word arrays |
| Compliance | reuse `ISanctionsGuard.checkBlocked` + `IMembershipManager` on real wallet |
| New deps | `@semaphore-protocol/contracts` (Solidity); `@semaphore-protocol/{identity,group,proof}` (frontend) — justified in plan.md Complexity Tracking |

**Recommended phasing of risk**: P1 on **Polygon/Amoy first** (canonical Semaphore, no
relayer); defer **ETC self-deployment** and the **P2 relayer** to later increments.

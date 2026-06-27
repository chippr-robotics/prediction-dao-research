# Contract Interface: Gasless Relayer (P2) & Subgraph

**Feature**: 034-zk-wager-pools | Phase 1

## A. Gasless join — Payload Packer API (P2, off-chain)

A stateless backend endpoint (Next.js API route / Lambda). It validates a signed join,
**re-screens the real wallet (sanctions + membership)**, packs calldata, and hands it to a
managed relayer (OpenZeppelin Relayer / Defender Relayer) that pays gas. No secrets persisted.

```
POST /api/pools/{poolId}/join-gasless
Request:
{
  "identityCommitment": "0x…",     // Semaphore commitment to insert
  "nicknameHash": "0x…",           // deterministic, client-derived
  "authorization": {               // EIP-3009 receiveWithAuthorization over native USDC
    "from": "0x…",                 // real wallet (screened)
    "to":   "0x{poolAddress}",
    "value": "10000000",           // buyIn (6-dp USDC)
    "validAfter": 0,
    "validBefore": 1750000000,
    "nonce": "0x…",                // random 32-byte (no front-run, no lingering allowance)
    "v": 27, "r": "0x…", "s": "0x…"
  }
}

200 → { "txHash": "0x…", "pool": "0x…" }
4xx →
  - SANCTIONED        (FR-021a: wallet failed sanctions screening — request refused)
  - MEMBERSHIP_DENIED (FR-021b: tier/limit gate failed)
  - POOL_CLOSED       (joining closed / full — FR-007a)
  - AUTH_EXPIRED      (validBefore passed — FR-027)
  - AUTH_INVALID      (bad signature / domain version mismatch)
5xx → RELAYER_UNAVAILABLE (FR-028: no funds moved; client informed, may retry)
```

**Invariants**
- The packer MUST refuse to forward a join whose wallet fails sanctions **or** membership
  (FR-021d) — anonymity never bypasses compliance.
- One token authorization = one join; the random EIP-3009 nonce + on-chain
  `authorizationState` give replay protection (FR-026). No double-charge (SC-005 spirit).
- On relayer failure, **no funds move** and the client is told (FR-028); on expiry, reject and
  prompt re-sign (FR-027).
- Native USDC EIP-712 domain version is **"2"** (Polygon/Amoy); sign against the per-token,
  per-chain domain (research §5 footgun).

**Not in scope for P1**: P1 join is on-chain `join(commitment)` after a normal ERC-20 approve;
the member pays gas. The relayer/packer is additive in P2.

---

## B. Subgraph — factory data source + dynamic Pool template

Mirrors the existing `TokenFactory` → `TokenInstance` precedent (spec 028) in
`subgraph/subgraph.yaml`. Per-network address/startBlock live in `subgraph/networks.json`
(`matic` 137 / `polygon-amoy` 80002 / `mordor` 63). ABIs are emitted from
`frontend/src/abis/*.js` by `sync:frontend-contracts`.

```yaml
dataSources:
  - kind: ethereum/contract
    name: ZKWagerPoolFactory
    network: polygon-amoy
    source: { address: "0x…", abi: ZKWagerPoolFactory, startBlock: <deployBlock> }
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7            # keep consistent across factory + template
      entities: [Pool]
      abis:
        - { name: ZKWagerPoolFactory, file: ../frontend/src/abis/ZKWagerPoolFactory.json }
        - { name: ZKWagerPool,        file: ../frontend/src/abis/ZKWagerPool.json }
      eventHandlers:
        - event: PoolCreated(indexed uint256,indexed address,indexed address,uint32[4],address,uint256,uint32,uint16,uint64)
          handler: handlePoolCreated
      file: ./src/mappings/zkWagerPoolFactory.ts

templates:
  - kind: ethereum/contract
    name: ZKWagerPool              # no address / no startBlock
    network: polygon-amoy
    source: { abi: ZKWagerPool }
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      entities: [Pool, Join, Proposal, VoteEvent, Payout]
      abis:
        - { name: ZKWagerPool, file: ../frontend/src/abis/ZKWagerPool.json }
      eventHandlers:
        - event: Joined(indexed uint256,bytes32)
          handler: handleJoined
        - event: OutcomeProposed(indexed bytes32)
          handler: handleOutcomeProposed
        - event: Approved(indexed bytes32,uint256,uint256)
          handler: handleApproved
        - event: OutcomeLocked(indexed bytes32)
          handler: handleOutcomeLocked
        - event: Claimed(indexed bytes32,address,uint256)
          handler: handleClaimed
      file: ./src/mappings/zkWagerPool.ts
```

```ts
// zkWagerPoolFactory.ts
import { ZKWagerPool as PoolTemplate } from "../../generated/templates";
export function handlePoolCreated(event: PoolCreated): void {
  PoolTemplate.create(event.params.pool);   // start indexing this clone from this block
  // … upsert Pool entity from event params …
}
```

**Privacy note**: the subgraph indexes in-pool identity references (commitment/nullifier/
nickname hash) and payout shares — **not** the wallet→vote link (FR-010, SC-004). Payout
`recipient` is the claim target only (FR-017/SC-013).

**Risks**: template re-deploys force a re-sync unless **grafted** (`features:[grafting]`); use
`indexerHints.prune` to cap store growth (research §8).

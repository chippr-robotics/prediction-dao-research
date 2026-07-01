# Data Model: Intent Relayer Infrastructure (Spec 036)

Scope: the data the **relay gateway** and **submission engine** operate on. On-chain state (wagers, pools, membership, the EIP-3009 token, the sanctions guard) is owned by other specs — this model covers only the relayer's request handling, operational state, and records. Nothing here is a system of record for value: on-chain (`txHash`) is authoritative; every store below is a rebuildable convenience layer.

## Entity: Intent (submission request)

What the client POSTs to the gateway. The gateway never trusts client-asserted identity — the signer is **recovered** from the signature, not read from a field.

| Field | Type | Notes / Validation |
|-------|------|--------------------|
| `intentClass` | enum `payment` \| `signer-attributed` | Determines the recovery + submission path (see Intent Class). |
| `chainId` | int | MUST be a configured, active chain (137/80002/61/63). Bound into the signature domain; rejected if it mismatches the target network (FR-024, SC-014). |
| `targetContract` | address | MUST be in the version-pinned target set for `chainId` (FR-025). |
| `action` | string | Canonical action name (e.g. `createWager`, `acceptWager`, `claimPayout`, `poolJoin`, `redeemVoucher`). Maps to an allowed selector on `targetContract`. |
| `params` | object | Action parameters (amount, counterparty, wager/pool/voucher id). Hashed into the signed payload; any mismatch → reject. |
| `signature` | bytes | EIP-712 typed-data signature (signer-attributed) or EIP-3009 `v,r,s` + authorization fields (payment). Source of the recovered signer. |
| `authorization` | object? | Payment class only: EIP-3009 `{from, to, value, validAfter, validBefore, nonce}` bound to `targetContract` as recipient. |
| `validAfter` / `validBefore` | uint | Validity window; expired or not-yet-valid → reject with a specific reason (no funds move). |
| `uniquenessMarker` | bytes32 | EIP-3009 nonce (payment) or the signer-attributed replay-nonce (no-stake). The dedup + on-chain single-use key. |
| `fundingMode` | enum `sponsored` \| `fee-netted` | Per spec 035 FR-015; admin-configurable per chain/flow. |
| `maxFee` | uint? | Fee-netted only: the user's disclosed, bounded fee cap (FR-023). |

**Derived (never client-supplied):**
- `signer` — recovered address; the sole identity used for screening, membership, ownership, attribution (FR-002/FR-003).
- `selector` — resolved from `action`+ABI; MUST be allow-listed for `targetContract`.

**Validation pipeline (all MUST pass before the engine is called):** signer recovery succeeds → `chainId` active & matches domain → `targetContract`+`selector` allow-listed & version-pinned → `params`/`authorization` bind to the signed payload → within validity window → not a duplicate (`uniquenessMarker` unseen/uncompleted) → **signer sanctions screen passes, fail-closed** → quota/spend-cap not exceeded → (fee-netted) estimated gas ≤ `maxFee`. Any failure returns a specific reason and moves no funds (FR-019 in 035; FR-013/FR-023 here).

## Entity: Intent Class

| Class | Authorization mechanism | Submission | ETC/Mordor availability |
|-------|------------------------|-----------|--------------------------|
| `payment` | EIP-3009 `receiveWithAuthorization` — token verifies + consumes the nonce | Engine sends the token/contract call carrying `authorization` | **Blocked** — live USC is permit-only (no EIP-3009); self-submit only until an EIP-3009 USC exists |
| `signer-attributed` | Contract's own EIP-712 verify of `(signer, params, sig)` + per-signer replay-nonce (spec 035 layer) | Engine sends the contract's signer-attributed entrypoint | Available (no token EIP-3009 dependency) |

## Entity: Nonce Lane (engine-owned)

One serialized submission channel per `(chainId, gasWallet)`.

| Field | Type | Notes |
|-------|------|-------|
| `chainId` | int | |
| `gasWallet` | address | The hot key funding this chain. |
| `nextNonce` | uint | Single-writer allocation; **reconstructed from chain** on startup (`eth_getTransactionCount(gasWallet,"pending")`). |
| `inFlight` | list<PendingTx> | Bounded pipeline depth; gap/stuck detection + recovery. |
| `gasType` | enum `eip1559` \| `legacy` | `legacy` for 61/63 (type-0, single `gasPrice`); `eip1559` for 137/80002. |

**Invariant:** zero nonce collisions, including across ≥2 instances (SC-001/SC-012) — enforced by single-writer ownership per lane (Phase 1: one instance; Phase 2: Redis lock / lane partition).

## Entity: PendingTx

| Field | Type | Notes |
|-------|------|-------|
| `nonce` | uint | Lane-allocated. |
| `txHash` | bytes32 | Current broadcast hash (changes on replacement). |
| `gasPrice`/`maxFee`/`maxPriority` | uint | Per `gasType`; bump uses same nonce + higher tip, capped at `gasPriceCap`. |
| `broadcastAt` | timestamp | Drives the stuck-tx timeout (FR-006, SC-013). |
| `status` | see Intent Status | |

## Entity: Gas Wallet (hot key)

| Field | Type | Notes |
|-------|------|-------|
| `chainId` | int | One wallet per chain (independent lanes, FR-022). |
| `address` | address | Dedicated, low-value; **never** the floppy admin key. |
| `keyRef` | secret ref | Secret Manager / KMS reference; key material never in env/logs/audit (FR-019a). |
| `perWindowCap` | uint | Rate-limiting spend cap (FR-014). |
| `absoluteExposureCap` | uint | Distinct hard exposure ceiling (FR-018). |
| `runwayThreshold` | uint | Low-balance alert line; target ≥ 12h peak burn (FR-018, SC-007). |

**Invariant:** balance + worst-case exposure stay ≤ caps and are **not** inflated by recovered fees (SC-015) — fees settle on-chain to a segregated recipient, never accrue to this key.

## Entity: Chain Config (gateway + engine)

| Field | Type | Notes |
|-------|------|-------|
| `chainId` | int | 137 / 80002 / 61 / 63. |
| `rpcUrls` | list<url> | ≥2 independent endpoints w/ failover (FR-007). `batchMaxCount:1` for 61/63. |
| `gasType` | enum | `legacy` for 61/63. |
| `targets` | map<address, {abiHash, allowedSelectors}> | Version-pinned to the deployed proxy version; **startup consistency check** (FR-025). |
| `paymentSupported` | bool | false on 61/63 until an EIP-3009 token exists. |
| `fundingMode` | enum | sponsored / fee-netted default for this chain. |

## Entity: Fee Ledger (fee-netted mode; read-model)

Derived from on-chain receipts — **not** an escrow or off-chain account of user funds.

| Field | Type | Notes |
|-------|------|-------|
| `chainId` | int | Per-chain accounting. |
| `nativeGasSpent` | uint | Sum of on-chain gas used by the chain's gas wallet. |
| `feeRevenueRecovered` | uint | Stablecoin fees settled on-chain to the segregated fee recipient, attributed to this chain. |
| `reconciles` | derived | `nativeGasSpent` matches on-chain gas within tolerance (SC-010). |

## Entity: Audit Record (append-only)

Written to Cloud Logging → WORM sink; retained ≥5 years (FR-021, SC-017). On-chain is the permanent record of record.

| Field | Type | Notes |
|-------|------|-------|
| `timestamp` | timestamp | |
| `signer` | address | Recovered signer (public, not a secret). |
| `chainId` | int | |
| `action` / `targetContract` | string / address | |
| `uniquenessMarker` | bytes32 | |
| `txHash` | bytes32? | Final inclusion hash (null until included / on failure). |
| `outcome` | enum | accepted / rejected(reason) / submitted / confirmed / failed(reason). |

**MUST NOT contain:** the hot key or any secret; user PII beyond the on-chain-public signer address.

## Entity: Quota / Spend Counter (operational, ephemeral)

In-process (Phase 1) or Redis (Phase 2). Rebuildable; reset-on-loss is a benign loosening.

| Field | Type | Notes |
|-------|------|-------|
| `key` | string | per-signer / global / per-chain-gas-window. |
| `count` / `spend` | uint | Atomic INCR + TTL window (FR-014). |
| `limit` | uint | Per-signer & global quotas; per-window gas spend cap. |

## Intent Status (lifecycle, surfaced honestly per spec 035 FR-018 / FR-027)

```
received ──validate──▶ rejected(reason)            (screening/expiry/dup/quota/fee — no funds moved)
   │
   └─accepted─▶ queued ──▶ submitted(broadcast) ──▶ confirmed(included, txHash)
                  │              │
                  │              └─stuck──▶ re-priced/replaced ──▶ confirmed
                  │                              └─(cap hit)──▶ failed(reason)
                  └─backpressure──▶ shed(retry-after)  → client offers self-submit
```

- **Never** report `confirmed` before on-chain inclusion (FR-006, no false success).
- `submitted`/`queued`/`shed` all keep the self-submit path available (FR-002/FR-016, SC-004).
- Terminal states: `rejected`, `confirmed`, `failed`; each carries a specific, user-facing reason.

## Relationships

- An **Intent** (accepted) produces one submission on exactly one **Nonce Lane** (by `chainId`+`gasWallet`), yielding one **PendingTx** → one **Audit Record**.
- A **Chain Config** owns one **Gas Wallet** and one **Nonce Lane**; `paymentSupported=false` disables the `payment` **Intent Class** for that chain.
- **Fee Ledger** aggregates confirmed **PendingTx** gas per chain against on-chain fee receipts.
- **Quota/Spend Counters** gate **Intent** acceptance keyed on the recovered `signer` and per-chain gas window.

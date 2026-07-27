# Data Model: Safe Receiver (Spec 070)

> ⚠️ **Superseded pending rework.** Design review found 4 critical and 18 major
> issues in this feature's design — see [review-findings.md](./review-findings.md).
> Several statements in this document are falsified there. Do not implement from it as it stands.


**Date**: 2026-07-27 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Four stores hold this feature's state, and the split between them is the
feature's central safety property:

| Store | Holds | Authority |
|---|---|---|
| **Factory state** (on-chain, upgradeable) | screening config, counterparty commitments | platform admin — **never funds** |
| **Clone state** (on-chain, immutable) | owner, factory | written once at deploy, no setter |
| **Client records** (browser, backed up) | labels, cursor, counterparty names | the member |
| **Derived / computed** (nothing stored) | addresses, balances, clearance | recomputed every time |

Nothing about a member's addresses is stored on a FairWins server.

---

## 1. On-chain — `SafeReceiverFactory`

UUPS proxy. Storage is append-only behind a trailing `__gap`; the contract is
registered in `scripts/deploy/check-storage-layout.js` so CI validates that.

| Field | Type | Set by | Mutable | Notes |
|---|---|---|---|---|
| `receiveAddressImpl` | `address` | `initialize` | **No — no setter** | The ERC-1167 template. Its init-code hash feeds address derivation, so a setter would move every future derived address (FR-030). A new template ships as a new factory. |
| `sanctionsGuard` | `ISanctionsGuard` | `initialize`, `setSanctionsGuard` | Yes (`DEFAULT_ADMIN_ROLE`) | Compliance config. Cannot be nulled while `screeningRequired` is true. |
| `screeningRequired` | `bool` | `initialize`, `setScreeningRequired` | Yes (`DEFAULT_ADMIN_ROLE`) | When true and no guard is set, every screened path reverts `ScreeningNotConfigured()` — the `WagerPoolFactory.sol:285-303` fail-closed tri-state, never a silent no-op. |
| `_committedCounterparty` | `mapping(address owner => mapping(uint256 index => address))` | `commitCounterparty` | **Write-once per (owner, index)** | A commitment the member can later change would not be a commitment. `address(0)` means uncommitted. |
| `__gap` | `uint256[45]` | — | — | Append-only reserve. |

**Validation rules**

- `initialize` rejects a zero `admin`, a zero `receiveAddressImpl`, and the
  combination `screeningRequired == true && sanctionsGuard == address(0)`.
- `setSanctionsGuard(address(0))` reverts while `screeningRequired` is true.
- `commitCounterparty` reverts if the index is already committed
  (`CounterpartyAlreadyCommitted`), if `counterparty == address(0)`, or if
  `counterparty == msg.sender` (an address committed to yourself is meaningless
  and would make the sweep screen the member twice).
- `deploy` is permissionless and idempotent: deploying another member's clone is
  harmless (the clone's owner comes from the salt, not the caller), and a second
  call on an already-deployed index is a no-op rather than a revert, so a race
  between two batch sweeps cannot fail one of them.

**No pause.** Deliberate. A pause on `deploy` would strand funds already sitting
at undeployed counterfactual addresses — the one thing this design must never
do. See `plan.md` → Constitution Check, note 2.

---

## 2. On-chain — `SafeReceiveAddress` (clone)

ERC-1167 minimal proxy, deployed by `cloneDeterministic`. **Immutable**: no
UUPS, no owner-transfer, no rescue, no setter of any kind. The template's
constructor calls `_disableInitializers()`.

| Field | Type | Set by | Mutable |
|---|---|---|---|
| `owner` | `address` | `initialize`, once | **No** |
| `factory` | `ISafeReceiverFactory` | `initialize`, once | **No** |

**The authorization invariant** — this is the load-bearing line of the whole
feature:

```
transferOut  requires  msg.sender == owner
```

Not `onlyFactory`. The factory is consulted for *screening configuration* and is
never consulted for *authorization*. A compromised or maliciously-upgraded
factory can change which guard is asked, but cannot move, freeze, or redirect a
single wei (FR-008, FR-009, FR-010, SC-016).

**Derivation**

```
salt    = keccak256(abi.encode(owner, index))
address = Clones.predictDeterministicAddress(receiveAddressImpl, salt, factory)
```

Pure. No RPC, no state read beyond the factory's immutable template pointer.
Computable client-side from `(factoryAddress, templateAddress, owner, index)`
alone, which is what makes backend-free recovery possible (FR-027).

---

## 3. Client records

### 3.1 `ReceiveAddressRecord`

One per issued address. Keyed `(chainId, index)`. Stored in `userStorage` and
registered in `frontend/src/lib/backup/syncedObjects.js` as
**`networkScoped: true`**, mirroring `vaultReferences.js:9-36`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `chainId` | `number` | yes | Strict `NETWORKS[chainId]` lookups only — never `getNetwork()`. |
| `index` | `number` | yes | The derivation index. Append-only per chain. |
| `address` | `string` | yes | Cached derivation. Recomputable; stored for display and search. |
| `label` | `string` | no | Member-authored counterparty name. |
| `counterparty` | `string` | no | The counterparty's address, if the member recorded one. |
| `committed` | `boolean` | no | Whether `counterparty` was committed on-chain (FR-018). |
| `issuedAt` | `number` | yes | Epoch ms. |
| `retiredAt` | `number` | no | Retirement hides the address from issuance; it is never reissued (FR-003). |

**Loss of these records loses labels, never addresses.** Addresses and balances
recover from derivation alone (FR-027, FR-028).

### 3.2 Issuance cursor

Derived, not stored: `nextIndex = max(index of records for this chain) + 1`,
following `frontend/src/lib/bitcoin/wallet.js:45-49`. Issuance is a **write**
(it creates a record); previewing an address is a read that burns no index —
the peek/issue split at `useBitcoinWallet.js:462-471`.

The cursor never decreases. Because derivation is deterministic and the record
set is append-only, the Bitcoin cache-loss reissue hazard does not apply: after
total data loss, addresses are re-derived rather than re-issued.

---

## 4. Computed — never stored

### 4.1 `Deposit`

One per observed inbound transfer.

| Field | Type | Notes |
|---|---|---|
| `asset` | `string` | Token address, or `native`. |
| `amount` | `bigint` | Base units. |
| `from` | `string \| null` | **`null` for native.** No log records a plain native transfer's sender (`research.md` §R1.3). |
| `blockNumber` | `number` | From the log; absent for native. |
| `screening` | `'clear' \| 'restricted' \| 'indeterminate'` | Result for `from`. `indeterminate` is never treated as clear. |

Token deposits come from `Transfer` logs filtered by recipient. The scan
**refuses to run** without a recorded deploy block for the chain and says so,
following `useVaultProposals.js:53-61` — it must never silently return an empty
set that reads as "no deposits".

### 4.2 `AssetClearance`

Per address, per asset. The value object the UI renders and the sweep consumes.

| Field | Type | Notes |
|---|---|---|
| `asset` | `string` | |
| `total` | `bigint` | On-chain balance. The truth. |
| `spendable` | `bigint` | **A positive assertion.** Only deposits positively established and cleared. |
| `withheld` | `WithheldPortion[]` | Every non-spendable part, each with a reason. |

**Invariant**: `spendable + Σ withheld.amount == total`. A balance that cannot
be decomposed is entirely withheld under `read-failed` — it is never partially
guessed (FR-015).

`WithheldPortion` = `{ amount: bigint, reason: WithholdReason, detail?: string }`.

`WithholdReason` — the complete enumeration; every branch of the classifier must
land on one of these, and the default for any unhandled path is withheld:

| Reason | Meaning |
|---|---|
| `sanctioned-depositor` | A depositor failed screening. |
| `indeterminate-depositor` | A depositor's status could not be determined. |
| `unattributable` | The sender could not be established at all — every native deposit, and any token value not accounted for by a scanned log. |
| `screening-unavailable` | The guard is deployed but unreadable right now (distinct from not-deployed). |
| `screening-not-configured` | No guard on this network; no on-chain screening applies. |
| `scan-incomplete` | The log scan could not cover the full range (missing deploy block, provider range cap, RPC error). |
| `read-failed` | A balance or log read failed. **Never rendered as zero** (FR-016). |

### 4.3 `SweepOutcome`

Per address, per asset — the shape `legacyKeys.js:396-450` established.

| Field | Type |
|---|---|
| `index` | `number` |
| `address` | `string` |
| `asset` | `string` |
| `status` | `'success' \| 'skipped' \| 'failed'` |
| `amount` | `bigint` |
| `txHash` | `string` (on success) |
| `reason` | `string` (on `skipped` / `failed`) |

One failure never aborts the rest (FR-022). `skipped` covers "nothing spendable
here" and must be reported rather than silently omitted.

### 4.4 `ReceiverAvailability`

Per network, typed like `BRIDGE_UNAVAILABLE_REASON`
(`useBridgeAvailability.js:38-46`). These must never collapse into one message.

| Value | Meaning | Member-facing consequence |
|---|---|---|
| `available-enforcing` | Factory deployed, guard deployed and readable, real oracle | Screening described as enforced on-chain |
| `available-mock-oracle` | Guard present but backed by a mock oracle | Described in **different terms** — materially weaker (FR-033) |
| `available-unscreened` | Factory deployed, no guard on this chain | Segregation + clearance work; no on-chain screening claimed (FR-031) |
| `screening-unreadable` | Guard deployed but not readable right now | Temporarily unavailable — **not** "not supported" (FR-032) |
| `not-deployed` | No factory on this chain | Section hidden; stated reason if reached by deep link (FR-034) |

---

## 5. State transitions

### Receive address lifecycle

```
      (derive, client-side, free)
 ── issued ──────────────────────────────► has code? no
      │                                          │
      │ member sends first transferOut            │ payable either way —
      ▼                                          │ a codeless address accepts
   deployed (lazy, 118k gas, one time) ◄─────────┘ a plain 21,000-gas transfer
      │
      ├── transferOut (partial) ──► remainder stays in place, same address,
      │                             same counterparty. No change address.
      │
      └── retired ──► hidden from issuance, never reissued, still sweepable
```

An address is **payable in every state**, including before it has code. Value
sent to an undeployed address is retained in full and swept after lazy
deployment (`research.md` §R7: measured, 3.0 ETH retained).

### Counterparty commitment

```
uncommitted ──commitCounterparty──► committed  (terminal — write-once)
```

Committed counterparties are screened on-chain at every `transferOut` from that
address (FR-018).

### Clearance

Clearance has **no persisted state**. It is recomputed from current chain data
and current screening results on every evaluation, so a deny-list change takes
effect immediately and a previously-cleared balance can become withheld. There
is no cached "cleared" flag that could go stale — by design (FR-024 in spirit;
the spec's fail-safe rule requires the current answer, not a remembered one).

---

## 6. Relationships

```
Member (owner address)
  └─1..n─ ReceiveAddressRecord           (client, backed up, per chain)
            └─1─ derived address          (pure function of owner+index+template)
                  ├─0..1─ SafeReceiveAddress clone   (on-chain, lazy, immutable)
                  ├─0..1─ committed counterparty     (on-chain, write-once)
                  ├─0..n─ Deposit                    (computed from logs)
                  └─1..n─ AssetClearance             (computed per asset)
                            └─0..n─ WithheldPortion
```

---

## 7. What is deliberately absent

- **No on-chain record of who deposited.** Impossible to obtain
  (`research.md` §R1.3); the design does not pretend otherwise.
- **No persisted clearance verdict.** A stored "cleared" flag would go stale
  against a deny-list update.
- **No platform-side registry of member addresses.** Derivation replaces it, and
  the no-backend rule forbids it.
- **No pause flag.** See `plan.md` Constitution Check note 2.
- **No fee state.** Launch rate is zero and no `FeeRouter` is wired; adding one
  means a new template version.
- **No change-address linkage.** Dropped — `research.md` §R4.

# Phase 1 Data Model: Safe Multisig Custody

Source of truth is on-chain wherever possible. Client-side records are caches/labels only and are never
authoritative over chain state (Constitution III). "Stored" below means client `localStorage` + encrypted
backup unless noted.

## Entity: Vault (Safe)

The shared on-chain account. **Authoritative on-chain**; the client only caches display fields.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `address` | address | chain | The Safe proxy address; identity of the vault |
| `chainId` | number | client | Network the vault lives on (network-scoped) |
| `owners` | address[] | `Safe.getOwners()` | Live |
| `threshold` | number | `Safe.getThreshold()` | 1 ≤ threshold ≤ owners.length |
| `nonce` | number | `Safe.nonce()` | Next transaction nonce |
| `version` | string | `Safe.VERSION()` | Expect `1.4.1` |
| `balances` | {token, amount}[] | chain/RPC | Native + supported tokens |
| `fallbackHandler` | address | setup config | `CompatibilityFallbackHandler` (EIP-1271) |

**Validation**: creation requires `1 ≤ threshold ≤ owners.length`, `owners` non-empty, all owners distinct and
valid addresses (FR-005). A load-by-address must resolve non-empty bytecode implementing the Safe interface,
else surfaced as "not a vault at this address" (edge case).

## Entity: Vault Reference / Label (client, backed up)

A member's record that they are associated with a vault, plus a friendly name. **The only Custody data in the
encrypted backup** (FR-025). Not authoritative.

| Field | Type | Notes |
|-------|------|-------|
| `address` | address | Vault address |
| `chainId` | number | Network scope (drives `assertNetworkTagged`) |
| `label` | string | Member-authored two-word-or-free nickname; client-side only, never on-chain |
| `addedAt` | number | Timestamp |
| `role` | enum | `owner` \| `watch` — whether the member controls an owner address (derived; cached) |

Backup integration: one entry in `frontend/src/lib/backup/syncedObjects.js`
(`{ key: 'vaultReferences', networkScoped: true, load, apply, merge }`); `merge` unions by `(chainId, address)`,
newest `label` wins. `assertNetworkTagged` extended so restore validates the `chainId` tag.

## Entity: Vault Transaction (Proposal)

A proposed action from a vault and the **sole representation of a not-yet-approved vault-originated action**
(FR-022b). Preimage lives in `SafeProposalHub` events + local cache; approval state is on-chain.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `safeTxHash` | bytes32 | computed | `getTransactionHash(...)`; the key |
| `safe` | address | hub event | Originating vault |
| `to` | address | hub event | Target |
| `value` | uint256 | hub event | Native value (0 for token/ERC-20 actions) |
| `data` | bytes | hub event | Calldata (e.g. `transfer`, `createWager`, MultiSend batch) |
| `operation` | 0\|1 | hub event | 0 = CALL, 1 = DELEGATECALL (MultiSend batches) |
| `nonce` | uint256 | hub event | Must equal `Safe.nonce()` to be executable |
| `type` | enum | derived from `to`/`data` | `transfer` \| `wagerStake` \| `wagerAccept` \| `governance` \| `clearpath` \| `tokenMint` \| `membership` \| `swap` \| `raw` |
| `approvals` | address[] | `approvedHashes(owner, hash)` per owner | Live on-chain |
| `status` | enum | derived | see state machine |
| `proposer` | address | hub event | Owner who proposed |

**Derived status**:
- `pending` — approvals < threshold AND `nonce == Safe.nonce()`
- `ready` — approvals ≥ threshold AND `nonce == Safe.nonce()`
- `executed` — the Safe emitted `ExecutionSuccess` for `safeTxHash`
- `failed` — the Safe emitted `ExecutionFailure` for `safeTxHash`
- `superseded` — a different transaction executed at this `nonce` (this one can never execute; Safe nonces are
  strictly sequential), or the proposer emitted a `cancel`

**State transitions**:
```
propose ──▶ pending ──(approvals reach threshold)──▶ ready ──(execTransaction)──▶ executed | failed
   │                                                    │
   └──────────────── superseded ◀───────────────────────┘   (another tx executes at same nonce, or cancel)
```

**Validation / rules**:
- Duplicate approval by the same owner is idempotent (`approvedHashes` is 0/1) — never double-counts (FR-013).
- Execution blocked unless `approvals ≥ threshold` and `nonce == Safe.nonce()` (FR-012, FR-013).
- Owner-set/threshold changes evaluate against the **current** owners/threshold at execution time (edge case:
  owner removed mid-flight).
- Governance transactions (`type = governance`) target the Safe itself (`addOwnerWithThreshold`,
  `removeOwner`, `swapOwner`, `changeThreshold`) and require threshold approval like any other (FR-018).

## Entity: Approval

An owner's on-chain endorsement of a `safeTxHash`. Not a separate stored object — it is the
`approvedHashes[owner][safeTxHash] == 1` on-chain fact plus the `ApproveHash` event. Counts once per owner.

## Entity: Active Identity (client, session)

Which identity the member is currently operating as. **Not backed up** (a per-session/device choice).

| Field | Type | Notes |
|-------|------|-------|
| `mode` | enum | `personal` \| `vault` |
| `vaultAddress` | address? | Set when `mode = vault`; must be a vault the member owns |
| `chainId` | number | Must match the active network |

**Rules**: switching to `vault` requires the connected wallet to be an owner of that vault (FR-020); on network
switch away from the vault's chain, the indicator prompts/reverts (edge case: network mismatch). All
authorization still keys off the connected `address` for signing; the vault identity only changes the
*destination* of prepared actions.

## Entity: Custody Notification Event (spec 031 activity source)

Derived feed entries. Emitted by `custodySource.detect(...)` via snapshot-diff; shape per the spec-031 source
contract.

| `type` | Trigger |
|--------|---------|
| `proposalCreated` | New `Proposed` for a vault the member owns |
| `approvalNeeded` | `pending` proposal the member (as owner) has not yet approved — `actionable: true` |
| `approvalAdded` | An `ApproveHash` by another owner |
| `readyToExecute` | Proposal reached threshold |
| `executed` / `failed` | `ExecutionSuccess` / `ExecutionFailure` |
| `governanceChanged` | Owner/threshold change executed |
| `fundsIn` / `fundsOut` | Incoming/outgoing vault transfers |

Entry fields follow the existing sources: `{ id, domain: 'custody', refId: safeTxHash|address, type, message,
severity, actionable, link: { to: '/wallet', state: { tab: 'custody', vault } }, createdAt, read }`.
Per-source delivery control via `NOTIFICATION_CATEGORIES` (`domain: 'custody'`) and `DOMAIN_META`.

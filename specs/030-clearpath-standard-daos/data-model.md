# Phase 1 Data Model: ClearPath Standard DAOs & External DAO Connectors

Entities, the (standard OZ Governor) proposal state machine, and invariants.
Maps to spec Key Entities + FR-001…FR-020.

## On-chain entities

### Native DAO (registry row in `ClearPathDAOFactory`)
| Field | Type | Notes |
|---|---|---|
| `id` | uint256 | network-scoped registry id |
| `governor` | address | beacon-clone OZ Governor |
| `timelock` | address | TimelockController = executor + USDC treasury holder |
| `votingSource` | address | ERC721Votes membership NFT (default) or ERC20Votes token |
| `votingKind` | uint8 | 0 = NFT-membership, 1 = ERC20-token |
| `name`, `purpose` | string | validated non-empty |
| `creator` | address | initial admin |
| `createdAt` | uint64 | |

### Governance params (set at creation via GovernorSettings)
`votingDelay` (blocks/seconds per OZ clock), `votingPeriod`, `proposalThreshold`,
`quorumFraction` (%), `timelockDelay` (s).

### Native DAO roles
Timelock `PROPOSER_ROLE` / `EXECUTOR_ROLE` / `CANCELLER_ROLE` (OZ TimelockController),
wired so the Governor is proposer/canceller and execution is permissionless
(EXECUTOR = address(0)) or restricted per config. A DAO admin (`DEFAULT_ADMIN_ROLE`
on the membership NFT / a ClearPath admin role) manages membership + params.

### Proposal (OZ Governor — read via IGovernor)
`proposalId` (uint256, derived from targets/values/calldatas/descriptionHash),
`proposer`, `targets[]`/`values[]`/`calldatas[]`, `voteStart`/`voteEnd`,
`state` (enum), `forVotes`/`againstVotes`/`abstainVotes`, `eta` (queued).

### Vote
`(proposalId, voter) → support (0/1/2), weight, reason` (from `VoteCast`).

### External DAO (`ExternalDAORegistry`)
| Field | Type | Notes |
|---|---|---|
| `id` | uint256 | network-scoped |
| `dao` | address | the external governor |
| `framework` | uint8/enum | OZ_GOVERNOR (Olympia) … extensible |
| `label` | string | optional |
| `registeredBy` | address | registrant (no authority conferred) |
| `registeredAt` | uint64 | |

### Indexed (subgraph) — `DAO`, `Proposal`, `Vote`, `Member`, `ExternalDAO`,
`GovernanceActivity` (type/actor/from/to/amount/detail/timestamp/txHash).

## Proposal state machine (OZ Governor — standard)

```
Pending → Active → (Succeeded | Defeated | Canceled)
Succeeded → Queued → Executed        (Expired if not executed in window)
```

| Transition | Trigger | Auth | Notes |
|---|---|---|---|
| create → Pending | `propose(targets,values,calldatas,desc)` | proposer (≥ threshold) + tier + sanctions | snapshot at `voteStart` |
| Pending → Active | time (`votingDelay` elapsed) | — | voting opens |
| Active → Succeeded/Defeated | time (`votingPeriod` elapsed) | — | quorum + majority decide |
| Succeeded → Queued | `queue(...)` | permissionless | timelock `eta` set |
| Queued → Executed | `execute(...)` | permissionless after `timelockDelay` | treasury action runs once; recipient sanctions-screened |
| any active → Canceled | `cancel(...)` | proposer/canceller per rules | |

External DAOs expose the **same** lifecycle via IGovernor; ClearPath reads `state`
and constructs the matching user-signed action.

## Invariants (tested — SC-004)

- **INV-1 (treasury via governance only)**: the native DAO's USDC (in the timelock)
  moves only through an `Executed` proposal; no admin withdrawal path.
- **INV-2 (no overdraw / single execution)**: a queued action exceeding the treasury
  balance reverts on execute; OZ Governor guarantees a proposal executes at most once.
- **INV-3 (sanctions non-bypassable)**: create-DAO, fund-treasury, execute-disbursement
  and disbursement recipients are `checkBlocked`-screened (fail-closed); read-only
  tracking is not gated.
- **INV-4 (no external authority)**: `ExternalDAORegistry` confers ClearPath no role,
  key, or call-authority over a registered DAO; every external action is user-signed
  and gated by the external DAO's own rules.
- **INV-5 (network scope)**: native + external registries are per-network; cross-network
  external registration is rejected.

## Validation rules

- Non-empty name/purpose; valid voting source; `quorumFraction ≤ 100`; sane
  delays/periods.
- External register: ERC-165 `supportsInterface(IGovernor)` (+ defensive IGovernor
  view staticcalls); reject EOAs / non-Governor / wrong-network / duplicate.
- Tier ≥ Silver + `checkCanCreate` to create a native DAO or register an external DAO.
- Sanctions `checkBlocked` on every value-moving entrypoint + disbursement recipient.

# Contract: Pluggable DAO Connector Interface

The interface every governance-framework connector implements so the ClearPath UI,
`daoDataSource`, and `daoSource` (notifications) stay framework-agnostic. Ships with two
implementations — `ozGovernor` (framework `0`) and `governorBravo` (framework `1`). A third
framework (Morpho, Aragon, …) is a new module + a `detectFramework`/resolver entry, with **no**
change to any consumer (SC-006).

Location: `frontend/src/components/clearpath/connectors/{index,ozGovernor,governorBravo}.js`.

## Resolver (`connectors/index.js`)

```text
detectFramework(reader, address) -> Promise<0 | 1 | 'unknown'>
  Probes in order (cheap view calls):
   1. OZ Governor : COUNTING_MODE() non-empty AND (CLOCK_MODE() | votingPeriod()) answers -> 0
   2. GovernorBravo: proposalCount() AND quorumVotes() answer                              -> 1
   3. otherwise                                                                            -> 'unknown'

getConnector(framework) -> Connector          // throws/negotiates 'unknown' -> null (read-only + deep-link)
```

## Connector shape

```text
Connector = {
  framework: 0 | 1,

  // --- probe ---
  matches(reader, address): Promise<boolean>,          // backs detectFramework

  // --- reads (real on-chain; each field degrades to null independently) ---
  readSummary(reader, address): Promise<{
    name, tokenAddr, tokenName, tokenSymbol, timelock,
    treasuryNative, votingDelay, votingPeriod, proposalThreshold,
    countingMode|null, clockMode|null                  // OZ: CLOCK_MODE; Bravo: block-clock implied
  }>,
  readTreasuries(reader, vaults, usdcAddr): Promise<Array<{
    label, address, native, usdc, usdcSymbol, usdcDecimals
  }>>,
  extraTreasuries(chainId, address): Array<{label, address}>,

  // --- proposal discovery (on-chain live indexer; bounded + chunked; truthful partial) ---
  fetchProposals(reader, address, opts?): Promise<{
    ok, proposals: Array<NormalizedProposal>, scannedFrom?, scannedTo?, partial?, error?
  }>,
  readVoterState(reader, address, proposal, account): Promise<{
    hasVoted: bool|null, votingPower: string|null, support: 0|1|2|null
  }>,

  // --- member-signed actions (framework-correct encoding; ClearPath holds no authority) ---
  castVote(signer, address, proposalId, support): Promise<tx>,
  queue(signer, address, proposal): Promise<tx>,       // OZ: (targets,values,calldatas,descHash); Bravo: (id)
  execute(signer, address, proposal): Promise<tx>,     // OZ: (…, descHash);                       Bravo: (id)
  propose(signer, address, { targets, values, calldatas, signatures?, description }): Promise<tx>,

  // --- errors ---
  explainTxError(e): string,                           // decode framework custom errors -> human message
}
```

### NormalizedProposal (identical shape from OZ and Bravo, and from subgraph or on-chain)

```text
{
  id: string,
  proposer: string,
  description: string,
  targets: string[], values: string[], calldatas: string[],
  descriptionHash: string,                 // OZ id derivation; Bravo carries it for uniformity (id is sequential)
  voteStart: string, voteEnd: string,      // OZ: clock units; Bravo: block numbers
  state: 0..7 | null,                      // SAME enum order for OZ + Bravo (Pending..Executed); null if unread
  votes: { for, against, abstain } | null  // OZ: proposalVotes(); Bravo: proposals(id)
}
```

## Framework-specific obligations

| Concern | OZ Governor (0) | GovernorBravo (1) |
|---------|------------------|-------------------|
| voting power | `getVotes(account, voteStart)` on Governor | `getPriorVotes(account, startBlock)` on the **token** |
| tallies | `proposalVotes(id)` | `proposals(id).{for,against,abstain}Votes` |
| queue/execute args | `(targets, values, calldatas, descriptionHash)` | `(proposalId)` |
| propose args | `(targets, values, calldatas, description)` | `(targets, values, signatures, calldatas, description)` |
| clock | `CLOCK_MODE()` (timestamp or block) | block-number |
| custom errors | OZ/Timelock selectors (existing map) | Bravo revert strings |

## Invariants (all connectors)

- **Non-custodial**: writes are constructed for the member's `signer`; the connector holds no
  keys/roles and never self-submits.
- **Honest degradation**: any unreadable view → `null`; any failed discovery chunk → `partial`,
  never a fabricated proposal (Constitution III).
- **Description fidelity (OZ)**: the exact description string is reused byte-for-byte across
  propose → queue → execute so `descriptionHash`/id resolve (spec 030 FR-025).
- **Bravo id semantics**: proposal ids are sequential contract-assigned; queue/execute pass the
  id, not the action arrays.

## Test obligations (Vitest)

- `detectFramework` returns 0 / 1 / 'unknown' for representative bytecode/view responses.
- Each connector: `readSummary`, `fetchProposals` (ok/partial/empty/error), `readVoterState`,
  and each action's **encoding** (argument shape) — asserted without a live chain via mocked
  providers.
- Cross-framework parity: the same `NormalizedProposal` shape from both connectors renders in
  the shared view without branching.

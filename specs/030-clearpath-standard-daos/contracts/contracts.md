# Phase 1 Interface Contracts: ClearPath Standard DAOs (on-chain)

Interface sketches. State/authority contracts inherit `UUPSManaged` (append-only +
`__gap`, one-time `initialize`, `UPGRADER_ROLE`-gated upgrades), CEI + fail-closed
sanctions on value moves. Native DAOs are assembled from **audited OZ Governor +
Timelock + Votes** (not re-implemented). Signatures are the contract; bodies are the
implementation phase.

## IClearPathDAOFactory

```solidity
interface IClearPathDAOFactory {
    enum VotingKind { MembershipNFT, ERC20Token }
    event DAOCreated(uint256 indexed id, address indexed governor, address indexed creator, address timelock, address votingSource, VotingKind kind, string name);

    struct GovParams { uint48 votingDelay; uint32 votingPeriod; uint256 proposalThreshold; uint8 quorumFraction; uint64 timelockDelay; }

    // Tier (≥ Silver) + sanctions gated. Deploys beacon clones (Governor + Timelock + voting source), wires roles,
    // funds nothing (treasury starts empty), records the row, emits DAOCreated.
    function createDAO(
        string calldata name, string calldata purpose,
        VotingKind kind, address erc20VotesTokenOrZero,   // zero ⇒ deploy a soulbound MembershipNFT
        GovParams calldata params
    ) external returns (uint256 id, address governor, address timelock);

    function getDAO(uint256 id) external view returns (/* DAO row */);
    function daoCount() external view returns (uint256);
    function getDAOsByCreator(address who) external view returns (uint256[] memory);
}
```

## IExternalDAORegistry

```solidity
interface IExternalDAORegistry {
    enum Framework { OZGovernor }   // Olympia = OZGovernor; extensible (Aragon/Moloch/Safe later)
    event ExternalDAORegistered(uint256 indexed id, address indexed dao, Framework framework, address indexed registrant, string label);

    // Tier-gated. Validates the address is a recognized governance contract (ERC-165 IGovernor probe +
    // defensive IGovernor view staticcalls) before adding. Confers NO authority over `dao`.
    function registerExternalDAO(address dao, Framework framework, string calldata label) external returns (uint256 id);

    function getExternalDAO(uint256 id) external view returns (address dao, Framework framework, string memory label, address registrant);
    function externalCount() external view returns (uint256);
    function isRegistered(address dao) external view returns (bool);
}
```

## Native governance (reused OZ, configured — not re-implemented)

- `StandardGovernor` = `GovernorUpgradeable` + `GovernorSettingsUpgradeable` +
  `GovernorCountingSimpleUpgradeable` + `GovernorVotesUpgradeable` +
  `GovernorVotesQuorumFractionUpgradeable` + `GovernorTimelockControlUpgradeable`
  (OZ 5.4.0, paris-safe). Standard `IGovernor` surface: `propose`, `castVote[WithReason]`,
  `state`, `proposalVotes`, `proposalDeadline`, `proposalSnapshot`, `quorum`, `queue`,
  `execute`, `cancel`.
- `DAOTimelock` = `TimelockControllerUpgradeable` — executor + USDC treasury holder.
- `MembershipNFT` = `ERC721VotesUpgradeable` soulbound (transfers disabled except
  mint/burn by the DAO admin); or an `ERC20Votes` token (spec-028 factory) for token voting.

## External connector (off-chain, frontend) — `governorConnector`

Reads any external Governor via the standard `IGovernor` ABI + the voting token +
timelock/treasury balance; constructs **user-signed** `propose`/`castVote`/`queue`/
`execute` calls. No on-chain ClearPath contract participates in external actions.
Olympia labeled connector resolves its addresses from github.com/olympiadao
deployment records per network (Mordor / ETC mainnet) — verified, never hardcoded blind.

## Cross-cutting (every state-changing ClearPath entrypoint)

- `nonReentrant`; CEI; `SafeERC20` for USDC.
- `_screen(account)` → `sanctionsGuard.checkBlocked(account)` as the first check on
  value-moving actions (fail-closed; `address(0)` guard disables for oracle-less nets);
  disbursement recipient screened at execution.
- Membership tier gate via `MembershipManager.checkCanCreate` + `getActiveTier ≥ Silver`
  + `recordCreate`.
- Append-only storage + `__gap`; `check:storage-layout` gated. Events above are the
  subgraph's source of truth (FR-020).

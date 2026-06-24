# Phase 0 Research: ClearPath Standard DAOs & External DAO Connectors

Decisions for spec 030. Grounded in the repo + the Olympia research + the
`/speckit-clarify` outcomes (both voting sources default NFT · on-chain external
registry · signed management from the start).

## D1 — Native governance basis: OpenZeppelin Governor + Timelock (paris-safe)

- **Decision**: Build native standard DAOs from **OZ 5.4.0 `GovernorUpgradeable`**
  composed with `GovernorSettingsUpgradeable`, `GovernorCountingSimpleUpgradeable`,
  `GovernorVotesUpgradeable`, `GovernorVotesQuorumFractionUpgradeable`, and
  `GovernorTimelockControlUpgradeable`; the **`TimelockControllerUpgradeable` is the
  executor and the USDC treasury holder** (canonical OZ pattern). No bespoke voting.
- **Rationale**: Audited, standard, and — verified locally — **OZ 5.4.0 ships the
  full governance suite with no Cancun opcodes** (paris-safe), so it deploys on
  ETC/Mordor. Olympia already runs OZ Governor v5.1 on Mordor + ETC mainnet,
  confirming feasibility. Using the same Governor as Olympia means one IGovernor UI
  serves native + external DAOs.
- **Alternatives**: bespoke voting (rejected — audit risk, reinvention);
  Moloch-style shares (deferred — futarchy spec 029 uses Moloch treasury; standard
  DAOs follow the Governor norm + interoperate with external Governor DAOs).

## D2 — Voting source: ERC20Votes or ERC721Votes (default NFT)

- **Decision**: Selectable at creation — **`ERC721Votes` soulbound membership NFT**
  (1 member = 1 vote, the default, mirrors Olympia) or **`ERC20Votes` governance
  token** (token-weighted; reuse the spec-028 token factory's ERC20Votes path where
  possible). Both satisfy `GovernorVotes`' `IVotes` interface.
- **Rationale**: Covers community (1p1v) and token-economic DAOs with one Governor;
  NFT default is the simplest, Olympia-aligned option (clarified 2026-06-24).

## D3 — Per-DAO deployment: beacon clones

- **Decision**: `ClearPathDAOFactory` (UUPS, `UUPSManaged`) deploys each native DAO's
  Governor + Timelock + voting source as **beacon-proxy clones** of one upgradeable
  impl per type (all clones upgrade together; storage-gate the impls). Factory keeps a
  network-scoped native-DAO registry + emits `DAOCreated`. Tier (≥ Silver) +
  sanctions gated, following `WagerRegistry`/spec-028.
- **Fallback**: if `check:storage-layout` can't cover beacon impls, deploy the OZ
  Governor/Timelock as minimal non-upgradeable per-DAO instances (they're audited OZ
  and rarely need patching) and keep only the factory + registry upgradeable.

## D4 — External DAO registry (on-chain, network-scoped)

- **Decision**: `ExternalDAORegistry` (UUPS, `UUPSManaged`) records
  `register(address, framework, label)` per network, **validates** the address is a
  recognized governance contract before adding, emits `ExternalDAORegistered` for
  discovery + subgraph indexing, and holds **no authority** over the external DAO.
  Tier-gated registration; duplicates rejected.
- **Validation (D4a)**: probe the target with **ERC-165 `supportsInterface`** for the
  OZ `IGovernor` interfaceId, plus a defensive staticcall to a couple of IGovernor
  view functions (`COUNTING_MODE()`, `votingPeriod()`); reject EOAs / non-Governor
  contracts / wrong-network addresses with a truthful reason.
- **Rationale**: Shared, indexable, no-backend-persistent discovery (clarified
  2026-06-24); ERC-165 is the standard capability probe OZ Governor supports.

## D5 — External connector: IGovernor read + user-signed act (Olympia first)

- **Decision**: A single frontend `governorConnector` reads external DAO state via the
  standard **`IGovernor`** ABI (`state`, `proposalVotes`, `proposalDeadline`,
  `proposalSnapshot`, `quorum`, plus the voting token + timelock/treasury balance) and
  constructs **user-signed** actions (`propose`, `castVote`/`castVoteWithReason`,
  `queue`, `execute`). Olympia is the first labeled connector (its OlympiaGovernor =
  OZ Governor, soulbound `OlympiaMemberNFT`, `OlympiaTreasury` vault on ETC/Mordor;
  `OlympiaGovernor` ≈ `0xB85dbc89…`, `OlympiaTreasury` ≈ `0x035b2e3c…`). Because the
  connector targets IGovernor, it covers Olympia AND any Governor DAO; unsupported
  frameworks get a truthful deep-link, not a broken action.
- **Rationale**: No custody/authority; reuse the exact same UI for native + external
  (both are Governor). Authorization is enforced by the external DAO's own rules; the
  user signs.

## D6 — Treasury asset & sanctions

- **Decision**: Native treasury = the platform **USDC** per network (held by the
  DAO's TimelockController). Sanctions: store `ISanctionsGuard`, `checkBlocked` in the
  Checks phase of every ClearPath-mediated value-moving action (create DAO, fund
  treasury, execute disbursement) and screen the disbursement recipient; read-only
  tracking is not gated. ClearPath-mediated external value moves are screened; the
  external DAO's own SanctionsOracle (Olympia has one) also applies.
- **Rationale**: FR-015; consistent with wagers + spec 028/029.

## D7 — Membership gating

- **Decision**: Gate native-DAO creation + external-DAO registration by a
  `MembershipManager` tier (≥ Silver) via `checkCanCreate(sender, DAO_MEMBER_ROLE)` +
  `getActiveTier` + `recordCreate`, following `WagerRegistry`. Define
  `keccak256("DAO_MEMBER_ROLE")`; admin authorizes the factory/registry as callers.
- **Rationale**: FR-013 — reuse existing membership, no parallel system.

## D8 — Frontend Account Center integration

- **Decision**: Add `{ id: 'clearpath', label: 'ClearPath' }` to `WALLET_TABS`
  (`frontend/src/pages/WalletPage.jsx`) rendering `<ClearPathPanel/>` in the same
  slot as the spec-028 `tokens` tab. `useClearPath` mirrors `useTokenFactory`
  (per-chain factory via `getContractAddressForChain`, `isSupported` self-disable,
  honest tx state). Every action → `useNotification`/`showNotification`; passive
  loads → inline `role="alert"`. `clearpath.css` mapped onto `theme.css` light/dark.
- **Rationale**: Strict spec-028 parity (FR-012/014/019).

## D9 — Subgraph & deploy

- **Decision**: `ClearPathDAOFactory` datasource (`DAOCreated` → `DAO`) +
  `ExternalDAORegistry` datasource (`ExternalDAORegistered` → `ExternalDAO`) + a
  per-DAO **Governor data-source template** (the spec-028 `TokenInstance` pattern)
  indexing `ProposalCreated`/`VoteCast`/`ProposalQueued`/`ProposalExecuted` →
  `Proposal`/`Vote`/`Member`/`GovernanceActivity`. Matchstick tests. Truthful
  subgraph-less fallback (Mordor) to bounded on-chain reads or a disabled view.
  Deploy via `scripts/deploy/deploy-clearpath.js` (UUPS proxies + beacons through
  `lib/upgradeable.js`), Mordor + Amoy first; `check:storage-layout` +
  `sync:frontend-contracts`; verify via `scripts/deploy/verify.js`.

## Residual risks

- Beacon-proxy storage-gate coverage (fallback D3).
- ERC-165 false negatives for non-standard Governors (some DAOs don't implement
  ERC-165) — allow a manual framework override + truthful "unverified type" label.
- External DAO on a different chain than the active network — registry is
  network-scoped; reject cross-network registration.
- Olympia address/chain mapping (Mordor vs ETC-mainnet) — resolve from
  github.com/olympiadao deployment records at implementation; never hardcode without
  verification.
- Keeper liveness for native `queue`/`execute` — permissionless (anyone can call
  after timelock), frontend triggers; consistent with no-backend.

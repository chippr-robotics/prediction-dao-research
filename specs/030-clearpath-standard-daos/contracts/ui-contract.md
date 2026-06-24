# Phase 1 UI Contract: ClearPath Standard DAOs (Account Center module)

The frontend contract, mirroring the spec-028 Token Mint module. Real Web3 only;
honest tx state; theme-aware; truthful subgraph-less fallback; the same IGovernor UI
serves native + external DAOs.

## Placement & gating

- New tab `{ id: 'clearpath', label: 'ClearPath' }` in `WALLET_TABS`
  (`frontend/src/pages/WalletPage.jsx`) → `<ClearPathPanel/>` (My Account → Account
  Center), in the slot the `tokens` tab uses.
- `useClearPath()` (mirrors `useTokenFactory`): resolves the per-chain factory +
  registry via `getContractAddressForChain('clearPathDAOFactory' | 'externalDAORegistry', chainId)`;
  `isSupported` self-disables truthfully where undeployed (FR-016); exposes the
  member's tier to gate Create / Register before signing.

## Information architecture (ClearPathPanel)

- **My DAOs** — summary strip + the member's native + tracked external DAOs (labeled
  by type/framework).
- **Create** — `CreateDaoWizard`: name, purpose, voting source (membership-NFT default
  or governance token), USDC treasury, governance params → summary → one real create tx.
- **Explorer** — native + registered external DAOs on the active network; a
  **Register external DAO** action (`RegisterExternalDao`: paste address → validate →
  add).
- **`DaoDetailView`** (native) — sub-tabs: Overview · Proposals · Treasury · Members ·
  Roles · Activity · Contract. **`ExternalDaoView`** — Overview · Proposals · Treasury ·
  Members · Activity (read), plus management actions where authorized + a deep-link to
  the external app.
- **`ProposalView`** — propose / vote / queue / execute (native AND external, via the
  shared `governorConnector`), showing the live IGovernor proposal state + tallies.

## Notification & state contract (FR-014 — spec-028 parity)

- Every user action (create DAO, register external, join, propose, vote, queue,
  execute, role grant/revoke, ownership transfer) → `showNotification(message, type)`
  from `useNotification`: submitted (info) → confirmed (success) / failed (error);
  tier/sanctions blocks → warning/error before signing; an external action the foreign
  DAO rejects surfaces that DAO's reason (no implied success).
- Passive loads (lists, detail reads, tallies) → inline `role="alert"`/`role="status"`,
  not toasts. No phantom rows: an entry appears only after its tx confirms.

## Data sources (FR-020)

- `clearpathSubgraph.js`: `fetchDAOs`, `fetchExternalDAOs`, `fetchProposals`,
  `fetchVotes`, `fetchMembers`, `fetchActivity` via `getSubgraphUrl(chainId)`; returns
  `{ available:false }` on subgraph-less networks (Mordor/ETC) → truthful "unavailable"
  or bounded on-chain reads (incl. direct IGovernor reads for a tracked external DAO).
  Never fabricates rows.

## Theming & accessibility (FR-019)

- `clearpath.css` scoped under `.clearpath`, mapped onto `theme.css` light/dark
  variables (the `tokens.css` approach). WCAG 2.1 AA: real table semantics, correct
  tablist/radiogroup, link-vs-button semantics, disabled-state signalling. Covered by
  `frontend/src/test/clearpath.accessibility.test.jsx` (vitest-axe, gating CI step).

## ABIs

- Hand-maintained `frontend/src/abis/clearPathDAOFactory.js`, `externalDAORegistry.js`,
  and the standard `IGovernor` ABI (shared by native + external); subgraph JSON ABIs
  under `frontend/src/abis/*.json`. Refresh from artifacts after contract changes.

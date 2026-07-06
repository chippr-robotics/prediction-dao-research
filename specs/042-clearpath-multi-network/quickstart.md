# Quickstart & Validation: ClearPath Network-Agnostic Multi-Network DAO Support

Runnable scenarios that prove the feature end-to-end against **real on-chain state** (no
mocks in shipped paths). Details live in [data-model.md](./data-model.md),
[contracts/connector-interface.md](./contracts/connector-interface.md), and
[contracts/ui-contract.md](./contracts/ui-contract.md).

## Prerequisites

- Repo installed: `npm install` (root) and `frontend/` deps.
- Frontend env (`frontend/.env`, documented in `.env.example` — add the new keys):
  - `VITE_RPC_URL_MAINNET` — Ethereum mainnet read RPC (a keyed endpoint is recommended; a
    keyless public node works with subgraph-first + chunked fallback).
  - `VITE_CLEARPATH_GRAPH_KEY` — The Graph gateway API key for governance subgraphs
    (optional; when unset, indexed DAOs fall back to on-chain reads — still truthful).
  - Existing wallet/network vars unchanged.
- A wallet (e.g. MetaMask) able to switch to Ethereum mainnet and Mordor.

## Run

```bash
npm run frontend            # dev server
npm run test:frontend       # Vitest (unit/integration + axe) — the gating suite for this feature
npm run lint --workspace frontend   # ESLint (must be clean; Constitution V)
```

## Scenario A — ClearPath-only network self-discloses honestly (US1 / SC-001)

1. In the app, open My Account → Network and switch to **Ethereum mainnet**.
2. **Expect**: the network is offered, labeled by what it supports (DAO governance); the
   **ClearPath tab is enabled**.
3. Navigate to wagers, swap, and passkey login.
4. **Expect**: each shows a truthful "not available on this network" state — **no** fabricated
   balances, wagers, or quotes, no crash.

_Automated_: Vitest for the capability profile (`clearpath:true`, others false on chain 1),
`ChainCapabilityGate` behavior, and the switcher label; the surface-guard audit (D8) has a test
per gated feature.

## Scenario B — Track an OZ Governor DAO registry-less (ENS) (US2 / SC-002)

1. On Ethereum mainnet, open ClearPath → Register, paste the **ENS Governor** address, submit.
2. **Expect**: client-side validation + framework detection = **OpenZeppelin Governor**; the
   DAO is added to the **device-local** list (no tx); it appears in the list labeled OZ +
   Ethereum mainnet.
3. Open its detail view.
4. **Expect**: real treasury (timelock native + USDC), proposals with live state + tallies,
   and a **source chip** reading `subgraph` (if `VITE_CLEARPATH_GRAPH_KEY` set) or `on-chain`.
   An unreachable source shows a truthful `unavailable`/`partial` state — never fabricated rows.
5. Switch to Mordor and back.
6. **Expect**: the ENS entry does **not** appear on Mordor; on return to mainnet it is still
   there (device-local, network-scoped).

_Automated_: `trackedDaoStore` (add/list/remove/dedupe/scope), framework detection = 0,
`daoDataSource` precedence, network-scoping isolation.

## Scenario C — Track & act on a GovernorBravo DAO (Uniswap) (US3 / SC-003)

1. On Ethereum mainnet, register the **Uniswap Governor (Bravo)** address.
2. **Expect**: detection = **Governor Bravo**; the **same** ClearPath UI renders it (framework
   badge = Bravo); proposals/tallies/states read via the Bravo connector (`proposals(id)`
   tallies, block-clock).
3. As a wallet with sufficient UNI voting power, cast a vote on an open proposal through
   ClearPath.
4. **Expect**: the vote executes on **Uniswap's own** contract, signed by the member; success
   reflects real on-chain state. As a wallet without power, the DAO's rejection reason is
   surfaced (no implied success).

_Automated_: Bravo connector reads + action **encoding** (`castVote(id,support)`,
`queue(id)`/`execute(id)` id-only, `propose` with `signatures`), voting power via token
`getPriorVotes`, and cross-framework render parity with the OZ connector.

## Scenario D — Registry + device-local merge (Mordor) (SC-005)

1. Switch to **Mordor** (registry deployed). Confirm the on-chain Olympia entry loads as today.
2. Track an additional DAO by address (writes to the device-local overlay on this chain).
3. **Expect**: the list shows registry entries **and** the local entry, **de-duplicated** by
   address, all Mordor-scoped; registering an already-registered address → "already tracked",
   no duplicate/phantom row.

_Automated_: merge/dedupe logic in `useClearPath.listExternalDAOs` with a registry present.

## Scenario E — Read-route toggle (FR-019 / SC-011)

1. In ClearPath, flip **Read routing** from Public RPC to Wallet-managed.
2. **Expect**: reads now transit the wallet provider; if it rejects a wide log scan, the
   indexer degrades to a truthful `partial` (or subgraph-first sidesteps it). **Writes are
   unchanged** (still via the wallet signer). Flip back to Public RPC restores the default.

_Automated_: `readRoute` persistence + reader selection; assert writes always use `signer`
regardless of route.

## Scenario F — Sanctions posture (FR-013 / SC-007)

1. On a network **with** a sanctions source (e.g. Mordor/Amoy config): a sanctioned signer is
   blocked from a governance action (fail-closed).
2. On Ethereum mainnet (**no** platform sanctions source): a member-signed external-DAO action
   proceeds under the DAO's own rules; ClearPath shows **no** "screened" claim it cannot back.

_Automated_: action-path gating keyed on `hasSanctionsSource`; no fabricated screening result.

## Definition of done (validation)

- Scenarios A–F pass against real contracts (ENS + Uniswap on mainnet; Olympia on Mordor).
- `npm run test:frontend` green incl. axe (zero violations) across the new multi-network +
  registry-less states; ESLint clean.
- No fabricated DAOs/proposals/members at any source tier; every store/read strictly
  network-scoped; no phantom entries on failed/rejected txs.
- No `contracts/`, `subgraph/`, `deployments/` changes in this cut.

# Internal Contract: Chain-Scoped Resolution

This is the binding interface contract every user-facing chain-scoped path must
satisfy. It is the testable rule the regression guard (FR-011) enforces. It maps
to the existing helpers in `frontend/src/config/contracts.js` and
`frontend/src/utils/blockchainService.js`.

## R1 — Address resolution

> Any address used by a modal/hook/page/service for a read or write MUST be
> obtained from `getContractAddressForChain(name, chainId)`, where `chainId` is
> the connected wallet's chain.

- **Disallowed in user-facing paths**: `getContractAddress(name)` (build-bound).
- **Allowed only**: inside `config/contracts.js`, the resolver itself, and the
  explicit disconnected-state fallback (no wallet → primary network).
- **Contract**: `getContractAddressForChain(name, chainId)` returns the address
  for `chainId`, or `undefined` when that network has no deployment for `name`.
  Passing `chainId == null` returns the build-time default (disconnected only).

## R2 — Provider resolution

> Any provider used for a read MUST be obtained from `getProvider(chainId)` (or
> the connected wallet's own provider), never `getProvider()` with no argument.

- **Disallowed in user-facing paths**: `getProvider()` (argless / build-bound).

## R3 — Availability & messaging

> When `getContractAddressForChain(name, chainId)` is falsy, or the address has
> no bytecode on the connected chain, the view MUST render
> `NetworkUnavailableNotice` (naming a supported network + offering switch) and
> MUST NOT read the build-time chain or throw a generic error.

- Replaces messages like "No purchase contract found on this network."
- Action: wired to existing `switchNetwork()` (targets `PRIMARY_CHAIN_ID`).

## R4 — Reactivity

> A view that displays chain-scoped values MUST re-resolve and re-fetch when the
> connected `chainId` changes, and MUST clear prior-chain values (show loading)
> until the new values resolve.

- React: include `chainId` in the relevant `useEffect`/`useMemo` deps.

## R5 — Display ↔ execution parity

> The chain-scoped values shown before signing (price, amount, token) MUST be
> read from the same `chainId` the transaction will execute on. Before signing,
> the path re-validates the connected chain.

## R6 — Cache scoping

> Any persisted chain-scoped value MUST be keyed by `(chainId, walletAddress)`.
> A value cached for one network MUST NOT be returned while connected to another.

## Acceptance (how each rule is verified)

| Rule | Verification |
|---|---|
| R1 | Regression guard: no `getContractAddress(` in user-facing paths; unit test that a hook/service resolves for the passed `chainId`. |
| R2 | Regression guard: no argless `getProvider()` in user-facing paths. |
| R3 | Component test: unavailable network → `NetworkUnavailableNotice` rendered, switch action present; no generic error. |
| R4 | Hook test: changing `chainId` re-runs the fetch; prior value cleared. |
| R5 | Flow test: displayed amount/token equals the args passed to the write call for the connected chain. |
| R6 | `roleStorage` test: a record written under `(A, account)` is not returned for `(B, account)`. |

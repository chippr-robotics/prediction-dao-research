# Phase 0 Research: Multi-Stablecoin Support

All spec clarifications were resolved in `/speckit-clarify` (spec §Clarifications). This document records the technical decisions derived from the codebase survey and the clarified requirements. No open `NEEDS CLARIFICATION` remain.

## R1. On-chain escrow already supports multiple stake tokens

- **Decision**: Do **not** modify or upgrade `WagerRegistry`. Reuse its existing admin-managed token allow-list.
- **Evidence**: `contracts/wagers/WagerRegistry.sol` has `mapping(address => bool) private _allowedTokens` (L58), `setTokenAllowed(address,bool)` gated by `DEFAULT_ADMIN_ROLE` (L278), `isAllowedToken(address)` (L869), `event TokenAllowed` (L102), per-wager `token` stored on the struct, and `if (!_allowedTokens[token]) revert NotAllowedToken()` guards on both `createWager` and `createOpenWager` (L369, L464). `initialize(...)` seeds `initialTokens` (L155-174).
- **Rationale**: Smallest, lowest-risk change (Constitution I + Workflow §Simplicity). Avoids touching the highest-risk fund-custody surface and avoids a UUPS upgrade + storage-layout review.
- **Alternatives considered**:
  - *Add on-chain `getAllowedTokens()` enumeration* — rejected: requires a contract logic change + UUPS upgrade for a read the frontend can satisfy from curated config. Reintroduces the upgradeable-contract guardrail burden for no functional gain.
  - *Per-token registry contract* — rejected: over-engineering; allow-list already exists.

## R2. Frontend enumerates the supported set from curated config (not from chain)

- **Decision**: Maintain the curated supported-stablecoin list in `frontend/src/config/networks.js` as a per-network `stablecoins` array, with the existing single `stablecoin` field retained as the network default (USDC). Add `frontend/src/config/stablecoins.js` helpers.
- **Rationale**: Matches the existing config-driven address pattern (Constitution V: addresses come from config/sync artifacts, not hand-copied at call sites). Lets the frontend show symbol/name/decimals/peg without an enumeration call, and keeps the curated set auditable in one place (FR-017). The on-chain allow-list remains the enforcement layer; config is the presentation layer. The two are kept in sync by the seeding op (R5) and a config/test assertion.
- **Alternatives considered**: Reading allow-list membership per candidate token via `isAllowedToken` — viable as a defensive check but insufficient for enumeration (no list on-chain) and adds RPC calls; deferred as optional hardening, not the source of truth.

## R3. Curation criteria (which coins, and the safety rule)

- **Decision**: First-release curated set on Polygon mainnet = **USDC (default), USDT, and one euro-backed coin (EURC)**. Each entry must be a **standard ERC-20**: non-rebasing, non-fee-on-transfer, fixed `decimals()`. Decimals are read/honored at runtime, not assumed to be 6.
- **Rationale**: FR-002a/FR-002b and clarifications Q2/Q4. Fee-on-transfer/rebasing tokens break the escrow invariant (amount received ≠ amount sent); excluding them keeps the no-contract-change approach safe.
- **GENIUS-Act gating (FR-002, FR-017)**: Only payment stablecoins from permitted/registered issuers (USD coins like USDC/USDT/PYUSD from regulated issuers; non-USD coins only from comparable, recognized regimes). Each admitted coin records a rationale (issuer, peg, GENIUS basis, Polygon availability) in config/docs. **Final issuer eligibility (esp. USDT and the specific euro coin) requires compliance/legal sign-off before mainnet seeding** — captured as a gating task, not a code blocker for testnet.
- **Address sourcing**: verify each token address + `decimals()` on-chain at deploy/seed time (same discipline as existing `TOKENS`/Mordor USC note). Use native USDC on Polygon (`0x3c49…`), not bridged USDC.e.

## R4. Member preferences: client-side, per wallet

- **Decision**: Store `stablecoinDefault` (address or symbol) and `stablecoinVisibility` (map of token → shown/hidden) in localStorage via the existing `userStorage` + `UserPreferencesContext`, keyed by wallet address.
- **Evidence/Pattern**: `UserPreferencesContext.jsx` already persists per-wallet keys (`recent_searches`, `default_slippage`, …) through `saveUserPreference(account, key, value)`. New keys: `stablecoin_default`, `stablecoin_visibility`.
- **Invariants**: (a) absent prefs → default USDC, all supported visible (SC-004, FR-009); (b) exactly one valid default always (hiding the current default forces choosing a replacement or restores USDC — FR-009, US2 scenario 5); (c) a stored default not available on the active network falls back to USDC (FR-014, edge case).
- **Rationale**: Q5 — no backend/contract change; consistent with existing storage. Per-device is acceptable for a display/selection preference.
- **Alternatives considered**: On-chain or backend-synced prefs — rejected (heavier, new surface) per Q5; noted as possible later phase.

## R5. Seeding the allow-list on existing deployments

- **Decision**: Add `scripts/ops/seed-stablecoins.js` that, for a given network, calls `WagerRegistry.setTokenAllowed(token, true)` (admin/floppy-keystore signer) for each curated token not yet allow-listed (idempotent via `isAllowedToken`). For fresh deploys, add the curated addresses to `initialTokens` in `deploy.js`/`constants.js TOKENS`.
- **Rationale**: Production `WagerRegistry` is already deployed; new coins are added by admin tx, not redeploy (Constitution: deployments are source of truth; no fresh redeploy). Keystore/admin flow per project key-management rules.
- **Verification**: op logs each token symbol/decimals read on-chain and skips already-allowed tokens; a deployments/record or doc notes the curation rationale (FR-017).

## R6. Token-aware, strictly per-currency display

- **Decision**: Generalize `StableToken` into a `TokenAmount` component that renders an amount at the token's own decimals with its symbol; reuse `resolveTokenMeta` for symbol/decimals. Extend `tokenMeta` with a `peg` field (USD/EUR/…). Reports keep their existing **per-ticker grouping** (`reportBuilder.js` already builds `byTicker`); ensure overall/`usdValue` totals never fold non-USD pegs into a USD sum (FR-013/FR-013a).
- **Evidence**: `reportBuilder.js` already groups per `tokenTicker` and resolves decimals per token (L34-41, L129-139). Wager-creation hook already reads `decimals()`/`symbol()` and uses `parseUnits/formatUnits` (no hardcoded 6) (`useFriendMarketCreation.js` L162-201).
- **Rationale**: Multi-currency means amounts are not fungible; labeling + per-peg grouping prevents misleading sums (US3, SC-002). No FX source (Q3).
- **Alternatives considered**: USD-equivalent conversion — rejected (Q3); would introduce a price-oracle dependency.

## R7. Wager-creation selector wiring

- **Decision**: Add a `StablecoinSelector` offering the member's **visible** supported set for the active network, pre-selecting their default; pass the chosen address through the existing `requestedToken`/`stakeTokenId` path into `useFriendMarketCreation`. The acceptor side reads the wager's `token` from chain/subgraph and stakes that same token (no per-acceptor choice).
- **Evidence**: `useFriendMarketCreation.js` already resolves `stakeTokenAddress` from a requested token, defaulting to `paymentToken` (USDC) (L150-162), and surfaces a `NotAllowedToken` user message (L503).
- **Rationale**: FR-004 (creator picks; acceptor matches), FR-011 (hidden filters only own choices, never blocks acting on a counterparty's wager).

## Summary of decisions

| # | Decision | Drives |
|---|----------|--------|
| R1 | No contract change; reuse existing allow-list | Constitution I, Simplicity |
| R2 | Curated config is the enumeration source; chain is enforcement | FR-002, FR-017, V |
| R3 | USDC+USDT+EURC, standard ERC-20 only, GENIUS-gated w/ sign-off | FR-002a/b, FR-017 |
| R4 | Client-side per-wallet prefs w/ default invariant | FR-007/8/9/10/14 |
| R5 | Admin seeding op + initialTokens for fresh deploys | FR-003, deployments policy |
| R6 | TokenAmount + strict per-ticker, no FX | FR-005/12/13/13a |
| R7 | Creator-selects/acceptor-matches via existing requestedToken | FR-004, FR-011, FR-015 |

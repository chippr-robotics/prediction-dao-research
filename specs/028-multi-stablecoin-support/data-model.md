# Phase 1 Data Model: Multi-Stablecoin Support

No new database or on-chain schema is introduced. The model below describes the config-level, preference-level, and existing on-chain entities the feature relies on. New/changed fields are marked **(new)**.

## Entity: Supported Stablecoin (curated config)

Per-network curated entry, defined in `frontend/src/config/networks.js` under each network's `stablecoins: [...]` array and mirrored in deploy `TOKENS`.

| Field | Type | Notes |
|-------|------|-------|
| `address` | string (checksummed ERC-20 address) | Verified on-chain at deploy/seed time. |
| `symbol` | string | e.g. `USDC`, `USDT`, `EURC`. Display + report ticker. |
| `name` | string | e.g. `USD Coin`, `Tether USD`, `Euro Coin`. |
| `decimals` | number | Read on-chain to confirm; never assumed 6. |
| `peg` **(new)** | string | Peg currency code: `USD`, `EUR`, … Drives per-currency grouping; prevents non-USD-as-USD. |
| `isDefault` **(new)** | boolean | Exactly one per network is `true` (USDC). Platform default. |
| `issuer` **(new)** | string | Issuing entity (e.g. `Circle`). For audit/FR-017. |
| `complianceBasis` **(new)** | string | GENIUS-Act rationale (permitted/registered issuer; comparable-regime for non-USD). For audit/FR-017. |
| `standardErc20` **(new)** | boolean (must be `true`) | Asserts non-rebasing, non-fee-on-transfer (FR-002b). Curation gate. |

**Validation rules**
- Each network's `stablecoins` array contains exactly one `isDefault: true` entry, and it MUST be USDC for the first release (FR-001).
- Every entry MUST have `standardErc20: true` (FR-002b); entries failing this are not added.
- `address` MUST be unique within a network and MUST be on the on-chain `WagerRegistry` allow-list before being offered for new wagers (kept in sync by the seeding op, R5).
- The set is network-scoped: a coin listed for chain A is never offered on chain B (FR-014).

**Backward compatibility**: the existing single `stablecoin` object per network is retained and MUST equal the `isDefault` entry, so all current `useChainTokens()` consumers keep working unchanged (SC-004).

## Entity: Member Stablecoin Preferences (client-side, per wallet)

Stored in localStorage via `userStorage`, keyed by wallet address. Surfaced through `UserPreferencesContext`.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `stablecoin_default` **(new)** | string (token symbol or address) | USDC for active network | The member's pre-selected stablecoin for new wagers (FR-008). |
| `stablecoin_visibility` **(new)** | object `{ [tokenKey]: boolean }` | all supported visible | `false` hides the coin from the member's own selectors (FR-007). Absent key ⇒ visible. |

**Derived/effective values** (computed in context, not stored)
- `effectiveDefault(chainId)`: stored default if it is a supported, visible coin on `chainId`; else USDC (FR-009, FR-014).
- `visibleStablecoins(chainId)`: supported set on `chainId` minus coins marked hidden; the effective default is always forced visible (a member cannot hide their only/default coin into oblivion — FR-009).

**Invariants**
- INV-1: There is always exactly one effective default (USDC fallback). (FR-009)
- INV-2: Hiding the current default requires choosing a replacement default or reverts the default to USDC. (US2 scenario 5)
- INV-3: Preferences are scoped per wallet; switching wallets loads that wallet's prefs (or defaults). (FR-010)
- INV-4: Visibility never affects acting on a counterparty's wager — only the member's own selection surfaces. (FR-011)

**State transitions (default selection)**
```
unset ──set default X──▶ X
  X  ──hide X──▶ (requires replacement Y) ──▶ Y    | if none chosen ──▶ USDC
  X  ──default coin removed from supported set──▶ USDC
  X  ──switch to network without X──▶ USDC (effective; stored value preserved)
```

## Entity: Wager — denomination aspect (existing, on-chain)

No schema change. The relevant existing fields:

| Field | Source | Notes |
|-------|--------|-------|
| `token` | `WagerRegistry` per-wager struct + `WagerCreated` event + subgraph | The single ERC-20 the wager is denominated in; set at creation; used for escrow, payout, refund, draw. |
| stake/payout amounts | on-chain raw units | Rendered at `token`'s decimals (FR-005, FR-012). |

**Rules (already enforced on-chain)**
- A wager has exactly one `token` (FR-004); both parties stake that token.
- `token` MUST be on `_allowedTokens` at create time, else `NotAllowedToken` revert (FR-015).
- Removing a token from the allow-list later does not affect existing wagers' settlement (FR-016) — the per-wager `token` and balances are immutable.

## Entity: Token Metadata (reports) — extended

`frontend/src/data/reports/tokenMeta.js` resolves `{ ticker, decimals }` per token address; reports group by `tokenTicker` (`reportBuilder.js` `byTicker`).

| Field | Type | Notes |
|-------|------|-------|
| `ticker` | string | existing |
| `decimals` | number | existing |
| `peg` **(new)** | string | `USD`/`EUR`/… ensures non-USD amounts are grouped separately and never summed into a USD total (FR-013a). |

**Rule**: report totals are computed strictly per `ticker`/`peg`; no cross-peg `usdValue` aggregation for non-USD coins.

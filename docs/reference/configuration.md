# Configuration

System parameters: on-chain bounds, frontend defaults, and environment
variables.

## On-chain bounds (`WagerRegistry`)

```solidity
uint64 public constant MAX_ACCEPT_WINDOW  = 30 days;   // acceptDeadline must be within
uint64 public constant MAX_RESOLVE_WINDOW = 180 days;  // resolveDeadline must be within
```

Stake tokens must be allow-listed (`isAllowedToken`); USDC is the standard
stake token on both networks.

## Membership tiers (`MembershipManager`)

Tier configs are stored on-chain per role (`getTierConfig(role, tier)`) and
adjustable by `DEFAULT_ADMIN_ROLE`. Current production values for
`WAGER_PARTICIPANT_ROLE` (all 30-day durations, priced in USDC):

| Tier | Price | Wagers / month | Open wagers at once |
|------|-------|----------------|---------------------|
| Bronze   | $2   | 15        | 5         |
| Silver   | $8   | 30        | 10        |
| Gold     | $25  | 100       | 30        |
| Platinum | $100 | Unlimited | Unlimited |

See [Roles and Tiers](../system-overview/roles-and-tiers.md).

## Frontend defaults (`frontend/src/constants/wagerDefaults.js`)

The canonical source for UI defaults and the resolution-type enum:

| Constant | Value | Meaning |
|----------|-------|---------|
| `STAKE_AMOUNT` | 10 | Default stake (USDC) |
| `MAX_STAKE` | 1,000 | Form validation cap |
| `WAGER_END_DAYS` | 1 day | Default end time |
| `ACCEPTANCE_DEADLINE_HOURS` | 6 h | Default acceptance window |
| `MIN_TRADING_PERIOD_SECONDS` | 3,600 (1 h) | Minimum wager duration |
| `MAX_TRADING_PERIOD_SECONDS` | 1,814,400 (21 d) | Maximum wager duration |
| `RESOLUTION_WINDOW_SECONDS` | 172,800 (48 h) | Default resolve window after end time |
| `MAX_ACCEPT_WINDOW_SECONDS` | 2,592,000 (30 d) | Mirrors the on-chain cap |
| `MAX_RESOLVE_WINDOW_SECONDS` | 15,552,000 (180 d) | Mirrors the on-chain cap |
| `ODDS_MULTIPLIER` | 200 | Even-money payout (2×, basis 100) |

## Environment variables (frontend)

Public configuration is baked into the bundle at build time (Vite). Key
variables:

| Variable | Purpose |
|----------|---------|
| `VITE_NETWORK_ID` | Default chain: `137` (production) or `80002` (testnet) |
| `VITE_RPC_URL` / `VITE_RPC_URL_POLYGON` / `VITE_RPC_URL_AMOY` | RPC endpoints |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect cloud project |
| `VITE_APP_URL` | Canonical app origin (used in share links) |
| `VITE_IPFS_GATEWAY` / `VITE_PINATA_GATEWAY` | IPFS read gateway |
| `VITE_ORACLE_MODELS` | `polymarket-only` (default) or `all` — which oracle resolution types the UI exposes |
| `VITE_POLYMARKET_GAMMA_URL` | Polymarket Gamma API for market search |
| `VITE_POLYGON_USDC` / `VITE_AMOY_USDC` | Stake-token overrides |
| `VITE_POLYGON_POLYMARKET_CTF` / `VITE_AMOY_POLYMARKET_CTF` | Polymarket CTF addresses |
| `VITE_AMOY_UNISWAP_*` | Optional testnet DEX wiring (Swap tab hidden without it) |

!!! warning "Secrets"
    `VITE_PINATA_JWT` and other secrets are **never** build args — they are
    injected at runtime on Cloud Run from Secret Manager. Anything passed as
    a `VITE_` build arg ends up readable in the shipped JS bundle.

Contract addresses are **not** environment variables — they're generated into
`frontend/src/config/contracts.js` from `deployments/` records via
`npm run sync:frontend-contracts`.

## Updating configuration

- **Tier prices/limits** — `DEFAULT_ADMIN_ROLE` on `MembershipManager`
- **Oracle adapters** — `DEFAULT_ADMIN_ROLE` sets per-type adapter slots on
  `WagerRegistry` (`OracleAdapterUpdated`)
- **Sanctions oracle / deny list** — see [Contract Interfaces](contracts.md#isanctionsguard)
- **Frontend defaults** — edit `wagerDefaults.js` (keep in sync with on-chain
  caps)

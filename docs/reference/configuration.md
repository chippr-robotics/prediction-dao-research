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

## Member API and assistant (gateway)

Set on the **relay gateway** (`services/relay-gateway`), spec 095. The module is
mounted unconditionally and gates itself: disabled means `503
member_api_unconfigured`, never a 404. Boot-failing validation runs only when the
module is enabled, so an unconfigured module can never take the gateway down.

| Variable | Default | Purpose |
|----------|---------|---------|
| `MEMBER_API_ENABLED` | `false` | Master switch for `/v1/member/*` |
| `MEMBER_API_KILLSWITCH` | `false` | Module-scoped stop → `503 member_api_killed` (distinct from the gateway-wide `killswitch_active`) |
| `MEMBER_API_MAX_TTL_DAYS` | `90` | Ceiling on a capability grant's lifetime; a longer grant is rejected `401 token_ttl_exceeded` |
| `MEMBER_API_SUBGRAPH_<chainId>` | unset | Subgraph URL used by `/v1/member/wagers` for that chain. Unset ⇒ that chain reports `not-configured` (an honest absence, not an outage) |
| `ASSISTANT_ENABLED` | `false` | Sub-config of the Member API module. Off ⇒ `503 assistant_unconfigured` |
| `ASSISTANT_MODEL` | `claude-sonnet-5` | Model id for the assistant proxy |
| `ASSISTANT_MAX_TOKENS` | `1024` | Response ceiling per chat turn |
| `ANTHROPIC_API_KEY` | — | **SECRET.** Model-provider credential. Missing ⇒ `503 assistant_unconfigured` |
| `RATE_LIMIT_HEALTH_PER_MIN` | `600` | Coarse per-IP limiter on `/healthz` + `/status` (`0` = off). The signer-keyed quotas remain the real per-member control; on the VM deployment nginx fronts the container and `trust proxy` is unset, so this acts as an aggregate ceiling there |
| `RATE_LIMIT_INTENTS_PER_MIN` | `300` | Coarse per-IP limiter on `POST /v1/intents` (`0` = off), bounding signature-recovery work ahead of the signer quota; same aggregate-ceiling caveat |

!!! danger "`ANTHROPIC_API_KEY` is the only secret this feature adds"
    Deliver it through Secret Manager and `infra/vm/common/fetch-secrets.sh`
    (declared **optional**, so a missing key degrades the assistant instead of
    aborting the gateway boot). Never place it in `docker-compose.yml`, a build
    arg, a Terraform variable, or any `VITE_` variable. Secrets are read at boot —
    a new version does nothing until the unit restarts. See
    [Member API Operations](../runbooks/member-api-operations.md#32-enable-the-assistant).

Member API tokens are **not** configuration: a member signs their own EIP-712
capability grant in the app and the gateway stores nothing. There is no key,
table, or credential on the server side to configure, back up, or rotate.

## MCP server

Set on the `fairwins-mcp-server` service (`services/mcp-server`), or in a member's
own MCP client configuration when they run it locally.

| Variable | Default | Purpose |
|----------|---------|---------|
| `FAIRWINS_API_URL` | — | Gateway base URL (e.g. `https://relay.fairwins.app`). Unset ⇒ the server still starts and lists tools, and each call returns an honest error |
| `FAIRWINS_API_TOKEN` | — | **SECRET (the member's own token).** In `--http` mode a per-request `Authorization: Bearer` header overrides it, which is what lets one hosted instance serve several members without holding anyone's credential |

The service holds no other secret and no service account of its own — authorization
arrives with each request.

## Updating configuration

- **Tier prices/limits** — `DEFAULT_ADMIN_ROLE` on `MembershipManager`
- **Oracle adapters** — `DEFAULT_ADMIN_ROLE` sets per-type adapter slots on
  `WagerRegistry` (`OracleAdapterUpdated`)
- **Sanctions oracle / deny list** — see [Contract Interfaces](contracts.md#isanctionsguard)
- **Frontend defaults** — edit `wagerDefaults.js` (keep in sync with on-chain
  caps)

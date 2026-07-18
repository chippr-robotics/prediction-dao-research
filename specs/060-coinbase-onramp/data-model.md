# Data Model: Buy Crypto — Coinbase Onramp from the Wallet Sheet

**Feature**: 060-coinbase-onramp | **Date**: 2026-07-18

No persistent storage anywhere: the gateway is a stateless proxy (in-memory
cache + quota counters only, per the OpenSea/Polymarket modules) and the SPA
holds only transient view state. Nothing about a purchase is recorded by
FairWins — the on-chain inbound transfer is the record (spec assumption).

## Gateway-side

### OnrampConfig (relay-gateway `loadConfig().onramp`)

| Field | Env | Default | Notes |
|---|---|---|---|
| `apiKeyId` | `CDP_API_KEY_ID` | `null` | CDP secret API key id. Either key part absent ⇒ routes 503 `onramp_unconfigured`, feature hides (fail closed). |
| `apiKeySecret` | `CDP_API_KEY_SECRET` | `null` | CDP secret API key material. Server-only, never logged. |
| `baseUrl` | `ONRAMP_API_BASE_URL` | `https://api.developer.coinbase.com` | CDP Onramp API host. |
| `hostedBaseUrl` | `ONRAMP_HOSTED_BASE_URL` | `https://pay.coinbase.com/buy/select-asset` | Hosted experience base. |
| `country` | `ONRAMP_COUNTRY` | `US` | Buy Options catalog country; Coinbase enforces the member's real eligibility in the hosted flow. |
| `timeoutMs` | `ONRAMP_TIMEOUT_MS` | `5000` | Upstream request timeout. |
| `retries` | `ONRAMP_RETRIES` | `1` | Reads only (options); session mints never retry (single-use tokens). |
| `optionsCacheTtlMs` | `ONRAMP_OPTIONS_CACHE_TTL_MS` | `300000` | Buy-options cache (catalog moves slowly). |
| `quotaPerAddress` | `ONRAMP_QUOTA_PER_ADDRESS` | `10` | Session mints/min per destination address. |
| `quotaGlobal` | `ONRAMP_QUOTA_GLOBAL` | `60` | Session mints/min across all callers. |
| `quotaWindowMs` | `ONRAMP_QUOTA_WINDOW_MS` | `60000` | Quota window. |
| `defaultAsset` | `ONRAMP_DEFAULT_ASSET` | `USDC` | The app's working currency. |

### ChainSlugMap (static, gateway + mirrored in frontend capability set)

| chainId | Canonical slug | Onramp |
|---|---|---|
| 137 (Polygon) | `polygon` | ✅ |
| 1 (Ethereum) | `ethereum` | ✅ |
| 61 (Ethereum Classic) | `ethereum-classic` | ⚠️ if Coinbase's live catalog serves it (spelling-insensitive match; mints echo Coinbase's own reported network name) |
| 63, 80002, 11155111, 560048, 1337 | — | ❌ never (testnets) |

### OnrampAvailability (computed, cached; `GET /v1/onramp/options` response)

- `chainId` — echoed request chain.
- `available: boolean` — chain mapped AND Coinbase's Buy Options API currently
  lists the network.
- `assets: string[]` — Coinbase asset tickers deliverable on this network
  (e.g. `["USDC", "ETH", "MATIC"]`); source of the modal's asset choices.
- `defaultAsset: string` — `USDC` when deliverable, else first available.
- `fetchedAt` — cache timestamp (client treats stale as still-usable; mint
  re-validates).

### SessionRequest → SessionResponse (`POST /v1/onramp/session`)

Request (all fields required):
- `address` — destination EVM address. Validation: `^0x[0-9a-fA-F]{40}$`;
  screened against the shared sanctions guard for the chain (screen fails or
  errors ⇒ refuse, fail closed).
- `chainId` — must be an enabled, mapped chain.
- `asset` — ticker; must be in the chain's current `assets` list.

Response:
- `url` — fully-formed hosted Onramp URL (session token embedded,
  `defaultNetwork` + `defaultAsset` preset). Single-use, expires in ~5 min —
  never cached, never logged with the token intact.

Errors (shape shared with other provider modules —
`{ error: { code, reason } }`): `onramp_unconfigured` (503),
`unsupported_chain` (400), `unsupported_asset` (400), `invalid_address` (400),
`screened` (403), `quota_exceeded` (429), `killswitch` (503),
`upstream_error` (502).

## Frontend-side (transient view state only)

### BuyHandoff (state of `BuyCryptoModal`)

- `destination` — active acting identity's address (vault-aware); displayed in
  full before handoff (FR-003).
- `chainId` / `networkName` — active network at open time; re-checked at
  Continue (spec edge case: network switched mid-sheet).
- `asset` — defaults to availability `defaultAsset` (USDC); selectable from
  `assets`.
- `phase` — `idle → minting → opened | error`; `error` renders the honest
  unavailable message, never a dead retry loop.

### Availability gate (Buy button render condition)

`onrampAvailable(chainId)` = `capabilities.onramp` (static, mainnet-only) AND
`VITE_RELAYER_URL` configured. The options fetch then confirms dynamically;
until it resolves the button stays hidden (never a dead button, FR-006).

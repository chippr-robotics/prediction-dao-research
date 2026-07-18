# Gateway API Contract: /v1/onramp/* (spec 060)

Relay-gateway HTTP surface for the Coinbase Onramp feature. Same envelope,
CORS allow-list, origin-lock, and killswitch behavior as the other optional
provider modules (`/v1/opensea/*`, `/v1/polymarket/*`). No smart-contract
changes anywhere in this feature.

All error responses use the shared shape:

```json
{ "error": { "code": "<snake_case_code>", "reason": "<human sentence>" } }
```

## GET /v1/onramp/options?chainId=137

Availability + purchasable assets for a chain. Public read; cached server-side
(`optionsCacheTtlMs`, default 5 min); read quota shared with the module.

**200**:

```json
{
  "chainId": 137,
  "available": true,
  "assets": ["USDC", "ETH", "MATIC"],
  "defaultAsset": "USDC",
  "networkName": "polygon",
  "fetchedAt": 1789000000000
}
```

- `available: false` (with empty `assets`) when the chain is mapped but
  Coinbase's Buy Options API does not currently list the network — this is how
  Ethereum Classic (61) behaves until Coinbase serves it.
- `networkName` is **Coinbase's own reported name** for the network (catalog
  lookups are spelling-insensitive against our canonical slug); mints and
  hosted URLs echo it verbatim so naming can never desync.
- `defaultAsset` falls back to the first deliverable asset when USDC is not
  offered on the network (e.g. ETC).

**Errors**:
- `400 unsupported_chain` — chainId missing, unmapped (testnet/ETC family), or
  not enabled on the gateway.
- `503 onramp_unconfigured` — CDP credentials absent (feature off ⇒ SPA hides
  Buy; fail closed).
- `503 killswitch` — global gateway killswitch active.
- `502 upstream_error` — Coinbase unreachable/5xx after retries (stale cache is
  served instead when present, marked by an older `fetchedAt`).

## POST /v1/onramp/session

Mints a single-use Coinbase session token for a validated destination and
returns the finished hosted-experience URL. Never retried, never cached, never
logged with the token intact.

**Request**:

```json
{ "address": "0x4402…8eC5", "chainId": 137, "asset": "USDC" }
```

**Validation order** (first failure wins):
1. `onramp_unconfigured` (503) — CDP credentials absent.
2. `killswitch` (503) — global killswitch active.
3. `invalid_address` (400) — not a well-formed EVM address.
4. `unsupported_chain` (400) — unmapped or disabled chain.
5. `unsupported_asset` (400) — asset not in the chain's current options list.
6. `screened` (403) — destination fails the shared sanctions screen for the
   chain; a screen *error* also refuses (fail closed), surfaced as
   `screening_unavailable` (503).
7. `quota_exceeded` (429) — per-address or global mint quota hit.

**Upstream call**: `POST {baseUrl}/onramp/v1/token` with JWT bearer
(CDP key via `@coinbase/cdp-sdk` auth helper), body
`{ "addresses": [{ "address": <address>, "blockchains": [<slug>] }], "assets": [<asset>] }`.

**200**:

```json
{ "url": "https://pay.coinbase.com/buy/select-asset?sessionToken=…&defaultNetwork=polygon&defaultAsset=USDC" }
```

**Errors**: `502 upstream_error` — mint failed upstream; the SPA shows the
honest unavailable state (no dead button, no partial state).

## Frontend client contract (`frontend/src/lib/onramp/onrampClient.js`)

- `onrampGatewayUrl(): string` — `VITE_RELAYER_URL` trimmed, `''` when unset.
- `onrampAvailable(chainId): boolean` — static capability
  (`networks.js capabilities.onramp`) AND gateway configured. `false` ⇒ no Buy
  UI renders anywhere.
- `fetchOnrampOptions(chainId): Promise<OnrampAvailability>`
- `createOnrampSession({ address, chainId, asset }): Promise<{ url }>`
- `OnrampUnavailable` — error class carrying `code`; every failure mode above
  maps onto it; callers render the degraded/hidden state, never a broken one.

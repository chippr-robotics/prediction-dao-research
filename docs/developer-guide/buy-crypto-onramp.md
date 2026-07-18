# Buy Crypto — Coinbase Onramp (spec 060)

A single **Buy** button on the wallet bottom sheet (the account sheet opened from
the header avatar) that hands the member to **Coinbase's hosted Onramp
experience** to purchase crypto — defaulting to USDC on the active network —
delivered straight to their own wallet address. FairWins never custodies funds,
never sees the payment, and adds **no fee**.

**Deliberately minimal.** The platform is DeFi-first; a fiat onramp is a
transitional convenience expected to eventually not be needed. It is therefore
**NOT integrated into the Trade section** (or any other value surface), has no
nav entry, and must stay removable by configuration alone: config-off leaves
zero residual UI and touches nothing else. Do not grow this feature; if a bigger
funding story is ever wanted, that is a new spec.

## Architecture

```
WalletButton (Buy, gated)                      relay-gateway                    Coinbase
  └─ BuyCryptoModal ── createOnrampSession ──► POST /v1/onramp/session ───────► POST /onramp/v1/token
       │                                         · screen destination (guard)     (JWT from CDP key)
       │                                         · quotas / killswitch
       │  ◄─────────────── { url } ────────────  · assemble hosted URL
       └─ window.open(pay.coinbase.com/…sessionToken=…)   ← everything after this is Coinbase's
```

- **No contract changes; no new frontend dependency.** The client-side surface is
  a `window.open` of a gateway-minted URL.
- **Secure init**: Coinbase requires session-token initialization; tokens are
  single-use, expire in ~5 minutes, and are minted server-side with the CDP
  secret API key (JWT via the official `@coinbase/cdp-sdk` auth helper — the
  gateway's only new dependency).
- **Destination screening**: the gateway screens every destination address
  through the shared `ISanctionsGuard` before minting (fail closed). Non-enabled
  chains (e.g. Ethereum mainnet) screen via the first enabled chain's guard —
  the sanctions list is address-based, chain-agnostic.
- **Two-layer availability**: static capability (`capabilities.onramp` in
  `frontend/src/config/networks.js`, mirrored by
  `services/relay-gateway/src/onramp/chains.js` — mainnets Polygon 137,
  Ethereum 1, Ethereum Classic 61; never testnets) AND the live Buy Options
  catalog (`GET /v1/onramp/options?chainId=`, cached ~5 min). The Buy button
  renders only when both agree; mints re-check the catalog live. **ETC is
  "if possible"**: Coinbase doesn't currently document Onramp support for it,
  so chain 61 shows Buy only if Coinbase's catalog lists the network — the
  lookup is spelling-insensitive and mints echo Coinbase's own network name,
  so ETC lights up automatically if/when they serve it, with no deploy.
- **Honest settlement**: no synthetic pending/success state anywhere. Delivery
  is on Coinbase's timeline; the balance updates when the funds exist on-chain,
  through the normal portfolio path. The onramp code never touches balance
  state (guarded by test).

## Files

| Where | What |
|---|---|
| `services/relay-gateway/src/onramp/{routes,client,chains}.js` | provider module (mirrors `polymarket/`) |
| `services/relay-gateway/test/onramp/` | route + availability tests |
| `frontend/src/lib/onramp/onrampClient.js` | gateway client (soft-fail, mirrors `predictClient`) |
| `frontend/src/components/wallet/BuyCryptoModal.jsx` | pre-handoff disclosure + handoff |
| `frontend/src/components/wallet/WalletButton.jsx` | the gated Buy button |
| `frontend/src/test/onramp/` | client/modal/gating/degraded-state tests |
| `specs/060-coinbase-onramp/` | spec, plan, research, API contract |

## Configuration (gateway env; see `.env.example`)

`CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` (both required to enable; server-only,
never committed), `ONRAMP_API_BASE_URL`, `ONRAMP_HOSTED_BASE_URL`,
`ONRAMP_COUNTRY`, `ONRAMP_TIMEOUT_MS`, `ONRAMP_RETRIES`,
`ONRAMP_OPTIONS_CACHE_TTL_MS`, `ONRAMP_QUOTA_PER_ADDRESS`,
`ONRAMP_QUOTA_GLOBAL`, `ONRAMP_QUOTA_WINDOW_MS`, `ONRAMP_DEFAULT_ASSET`.
The frontend needs only the existing `VITE_RELAYER_URL`.

Error surface: `onramp_unconfigured` (503, feature off), `unsupported_chain` /
`unsupported_asset` / `invalid_address` (400), `screened` (403),
`screening_unavailable` (503, fail closed), `quota_exceeded` (429),
`killswitch_active` (503), `upstream_error` / `upstream_rejected` (502). Full
contract: `specs/060-coinbase-onramp/contracts/gateway-api.md`.

## Turning it off / removing it

1. **Off now**: unset `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` (or flip the
   killswitch for a temporary pause). The routes 503, `onrampAvailable()` still
   gates client-side, the catalog check fails, and every Buy surface hides. No
   deploy of the SPA is needed.
2. **Remove later**: delete the two directories and the small `WalletButton`
   block + `networks.js` capability lines; nothing else references the feature.
   No other feature may ever import from `lib/onramp/` or `src/onramp/`.

## Vault note

When the member is operating as a custody vault ("Operate as", spec 043), the
purchase destination is the **vault address** — funds land where the member is
currently acting, and the modal shows that exact address before handoff.

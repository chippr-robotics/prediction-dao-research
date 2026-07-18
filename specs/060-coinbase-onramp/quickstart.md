# Quickstart: Buy Crypto — Coinbase Onramp (spec 060)

Validation guide proving the feature end-to-end. See
[contracts/gateway-api.md](contracts/gateway-api.md) for the API shapes and
[data-model.md](data-model.md) for config/env.

## Prerequisites

- Node ≥ 20; repo deps installed (`npm ci` at root and in
  `services/relay-gateway`).
- For the live path only: a CDP secret API key (`CDP_API_KEY_ID` /
  `CDP_API_KEY_SECRET`) in the gateway env — never in the frontend, never
  committed (`.env.example` documents them).

## Automated validation

```bash
# Gateway module tests (routes, validation order, fail-closed states, quotas)
cd services/relay-gateway && npx vitest run test/onramp

# Frontend tests (client soft-fail, Buy button gating, modal disclosure)
npm run test:frontend -- onramp
```

Expected: all green. Key covered behaviors:
- No CDP creds ⇒ `/v1/onramp/*` returns 503 `onramp_unconfigured`; SPA renders
  the wallet sheet byte-identical to pre-feature (SC-004, US2-AS1).
- Testnet/unmapped chain ⇒ 400 `unsupported_chain`; Buy hidden (US2-AS2).
- Sanctioned destination ⇒ 403 `screened`; screen outage ⇒ 503 fail closed.
- Happy path mints a session and returns a `pay.coinbase.com` URL carrying
  `sessionToken`, `defaultNetwork`, `defaultAsset` (US1-AS2).

## Manual validation (live)

1. Run the gateway with CDP creds + `ENABLED_CHAIN_IDS=137`, and the frontend
   with `VITE_RELAYER_URL` pointing at it (`npm run frontend`).
2. Connect a wallet on Polygon, tap the header avatar → wallet sheet shows a
   **Buy** button beside the balance (US1-AS1).
3. Tap Buy → modal shows asset (USDC default), network (Polygon), and the full
   destination address matching the sheet; fee/custody disclosure present
   (US1-AS2, FR-003/FR-008).
4. Continue → new tab opens Coinbase's hosted flow. Complete a small purchase
   (or Coinbase sandbox). Funds arrive at the address; the sheet's USDC balance
   reflects it after refresh (US1-AS3). At no point does the app show the funds
   before they exist on-chain (US3).
5. Abandon path: close the Coinbase tab mid-flow → app state unchanged, no
   errors (US1-AS4).
6. Config-off: stop the gateway (or unset creds) → Buy disappears entirely;
   every other feature works (SC-004/SC-006, FR-012).

## Non-goals to confirm absent

- No Buy/onramp entry in the Trade section, nav drawer, or home screen
  (FR-002, SC-006).
- No new frontend dependency; no contract changes; no FairWins fee (FR-008).

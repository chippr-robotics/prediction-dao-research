# Research: Buy Crypto — Coinbase Onramp from the Wallet Sheet

**Feature**: 060-coinbase-onramp | **Date**: 2026-07-18

## R1. Integration mode: hosted Onramp URL, not an embedded SDK

**Decision**: Use the **Coinbase-hosted Onramp experience** opened in a new
browser tab/popup at `https://pay.coinbase.com/buy/select-asset?sessionToken=…`,
initialized with a **server-minted session token** (secure init). Do **not** add
a client-side Coinbase SDK (`cbpay-js` / OnchainKit fund components) to the SPA.

**Rationale**:
- Since 2025-07-31 Coinbase requires all Onramp URLs to be securely initialized
  with a `sessionToken`; the token is minted server-side with CDP API
  credentials, which must never reach the client (spec FR-011). A hosted URL is
  the entire client-side surface — no SDK, no iframe, no new SPA dependency.
- The spec demands the feature be a transitional convenience with zero residual
  footprint when disabled (FR-002/FR-007). A single `window.open(url)` behind a
  config gate is the smallest possible footprint; an embedded SDK is the
  largest.
- Payment collection, KYC, regional eligibility, and delivery all stay inside
  Coinbase's own experience (FR-004): the hosted flow does this by construction.
- Abandonment (FR-010) is trivially clean: the member closes Coinbase's tab and
  the SPA has no half-open state to unwind. No `redirectUrl` handling is needed
  in v1; the tab is simply closed when done.

**Alternatives considered**:
- `@coinbase/cbpay-js` embedded widget — rejected: a new client dependency, an
  embedded third-party surface inside the app's trust boundary, and a bigger
  removal cost, for no functional gain over the hosted URL.
- OnchainKit `<FundCard>` — rejected: pulls a large React kit for one button;
  same objections as above, plus stack drift.
- Coinbase "Guest checkout" / one-click-buy URL without session token —
  rejected: secure init is mandatory for production since 2025-07-31.

## R2. Session-token minting lives in the relay-gateway (Collect/Predict pattern)

**Decision**: Add an **`onramp` provider module** to the relay-gateway
(`services/relay-gateway/src/onramp/`) exposing:
- `GET /v1/onramp/options?chainId=` — availability + purchasable assets for a
  chain (backed by Coinbase's Buy Options API, cached).
- `POST /v1/onramp/session` — body `{ address, chainId, asset }`; screens the
  destination address against the shared sanctions guard, enforces quotas and
  the global killswitch, then mints a session token via
  `POST https://api.developer.coinbase.com/onramp/v1/token` (JWT bearer auth
  from the CDP secret API key) and returns `{ url }` — the fully-formed hosted
  Onramp URL (token embedded, `defaultNetwork`/`defaultAsset` preset).

Coinbase session tokens are **single-use and expire in 5 minutes**, so the
gateway mints on demand per tap and returns the URL immediately; nothing is
stored.

**Rationale**:
- Mirrors the established optional-provider pattern (OpenSea spec 055/056,
  Polymarket spec 057): server-side secret, per-feature config block in
  `loadConfig()`, fail-closed 503 (`onramp_unconfigured`) when the key is
  absent, frontend soft-fail hides the feature, zero coupling to the
  value/intent paths (spec FR-012).
- Screening the destination address through the shared `ISanctionsGuard` before
  minting keeps the platform's existing compliance posture (the gateway already
  screens every intent signer); FairWins never learns anything about the
  payment itself.
- Returning the finished URL (not the raw token) keeps URL-format knowledge in
  one place and lets the gateway pin `defaultNetwork`/`defaultAsset` to values
  it validated.

**Alternatives considered**:
- Frontend calls Coinbase directly — impossible without exposing CDP
  credentials; rejected outright.
- A separate microservice — rejected: the relay-gateway is already the app's
  policy front-end for external providers; a new service adds ops surface for
  a feature meant to be deletable.

## R3. CDP API auth: `@coinbase/cdp-sdk` JWT helper (gateway-only dependency)

**Decision**: Add `@coinbase/cdp-sdk` to `services/relay-gateway` and use its
`auth` export (`generateJwt`) to build the short-lived JWT bearer for
`POST /onramp/v1/token`. Credentials come from two new env vars,
`CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` (the CDP secret API key pair), loaded
in the `onramp` config block — never committed, never sent to the client,
documented in `.env.example` per the constitution's key-management rule.

**Rationale**: CDP API keys are Ed25519/ECDSA keys with a Coinbase-specified
JWT claim shape (audience, URI claim, expiry). The official helper tracks that
shape; hand-rolling JWT assembly around raw key material in a funds-adjacent
service is exactly the kind of avoidable crypto surface the constitution's
security-first principle warns against. The dependency is gateway-only — the
SPA gains no new dependency.

**Alternatives considered**:
- Hand-rolled JWT via `jose`/node crypto — rejected: more code to audit, breaks
  when Coinbase evolves claim requirements, no benefit.

## R4. Availability + chain mapping: dynamic, mainnet-only

**Decision**: Availability is computed in two layers, both required:
1. **Static capability**: `onramp: ONRAMP_CHAIN_IDS.has(chainId)` in
   `frontend/src/config/networks.js` capabilities (Polygon 137 + Ethereum 1;
   never testnets). The gateway holds the same chainId → Coinbase network-slug
   map (`137 → polygon`, `1 → ethereum`) and rejects unmapped chains.
2. **Dynamic check**: the gateway's `/v1/onramp/options` consults Coinbase's
   Buy Options API (cached ~5 min) so temporarily delisted networks/assets
   drop out without a deploy (spec edge case "delisted between render and
   tap"; FR-006).

The frontend Buy button renders only when `onrampAvailable(chainId)` (capability
+ gateway configured) and the options call confirms the chain; the session mint
re-validates at tap time.

**Rationale**: ETC (61), Mordor (63), Amoy (80002), and the other test/ETC
family networks are not served by Coinbase Onramp — the static map keeps them
honestly Buy-free (spec US2), while the dynamic layer keeps the supported list
truthful without hardcoding Coinbase's catalog (spec assumption: "resolved
dynamically rather than hardcoded").

**Alternatives considered**:
- Purely dynamic (no static map) — rejected: needs a Coinbase network-slug ↔
  chainId mapping anyway, and would probe Coinbase for chains that can never
  be supported.
- Purely static — rejected: violates the spec's "resolved dynamically"
  assumption and the honest-availability story.

## R5. Default asset & URL parameters

**Decision**: `defaultAsset=USDC` (the app's working currency — wagers,
membership, pools are USDC-denominated), `defaultNetwork=<slug for the active
chain>`, destination = the active acting identity's address (vault-aware via
`useActiveAccount`). The member may pick a different Coinbase-deliverable asset
inside Coinbase's experience (the session token's `assets` list is left open to
what the options call reports for the chain). No `partnerUserRef` is sent —
FairWins passes nothing about the member beyond the delivery address. No
`redirectUrl` in v1 (new-tab flow; closing the tab is the return path).

## R6. Frontend shape

**Decision**:
- `frontend/src/lib/onramp/onrampClient.js` — gateway client mirroring
  `predictClient.js`: `onrampGatewayUrl()`, `onrampAvailable(chainId)`
  (capability + `VITE_RELAYER_URL` set), `fetchOnrampOptions(chainId)`,
  `createOnrampSession({ address, chainId, asset })`, `OnrampUnavailable`
  error class.
- `frontend/src/components/wallet/BuyCryptoModal.jsx` — the pre-handoff
  disclosure (asset, network, destination address, "Payment, identity checks
  and fees are Coinbase's — FairWins adds no fee and never holds your funds"),
  with the single **Continue to Coinbase** action that mints the session and
  `window.open`s the returned URL (popup-blocker fallback: visible link).
- **Buy button** in the `WalletButton` dropdown (the wallet bottom sheet),
  rendered in the header area next to the balance it funds, only when
  `onrampAvailable(activeChainId)` — config-off leaves the sheet byte-identical
  to today (FR-007, SC-004).

**Rationale**: The sheet already surfaces address + USDC balance + network; Buy
belongs beside the balance it tops up. A dedicated modal keeps FR-003's
disclosure out of the crowded dropdown and gives the popup-open a user-gesture
context.

## Sources

- [Create session token — Coinbase Developer Documentation](https://docs.cdp.coinbase.com/api-reference/rest-api/onramp-offramp/create-session-token)
- [Generating an Onramp URL — Coinbase Developer Documentation](https://docs.cdp.coinbase.com/onramp-&-offramp/onramp-apis/generating-onramp-url)
- [Coinbase Onramp overview — Coinbase Developer Documentation](https://docs.cdp.coinbase.com/onramp/introduction/welcome)
- [coinbase/onramp-demo-application](https://github.com/coinbase/onramp-demo-application)

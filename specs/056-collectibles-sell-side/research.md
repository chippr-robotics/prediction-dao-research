# Phase 0 Research: Collectibles Sell-Side Trading (Phase 2)

**Feature**: 056-collectibles-sell-side | **Date**: 2026-07-14
**Builds on**: spec 055 (read-only proxy), `docs/research/opensea-sdk-nft-trading-analysis.md`

All Technical Context unknowns are resolved below. Decisions record rationale and
alternatives. The load-bearing findings: (D3) passkey sellers must sign a
**wrapped** order hash, and (D6) the referral/affiliate attribution mechanism is
under-documented, so it is designed as confirm-then-configure, never at user cost.

## D1. Order construction & signing: hand-built Seaport typed data, one signer seam

- **Decision**: The **frontend builds the Seaport `OrderComponents`** (offer = the
  owned NFT; consideration = seller receipt + the collection's required fees) as
  EIP-712 typed data in a dedicated module modeled on `frontend/src/lib/relay/
  intentTypes.js` — a new **Seaport domain** (`name: "Seaport"`, the protocol
  version, `verifyingContract` = the Seaport contract) plus the `OrderComponents`
  types, kept in one place and never redefined. The order is signed through the
  repo's existing **single signer seam** — `signer.signTypedData(domain, types,
  message)` — which works unchanged for both an **EOA** (ethers signer from
  `useWeb3().signer`) and a **passkey account** (the existing
  `frontend/src/lib/passkey/intentSigner.js#passkeyIntentSigner` adapter). The
  **gateway posts** the signed order to OpenSea's orderbook (it holds the API key)
  and fetches required fees, fulfillment data, and cancellations via raw OpenSea
  REST (no `@opensea/sdk`), consistent with the 055 read proxy.
- **Rationale**: The repo already hand-builds every EIP-712 struct in
  `intentTypes.js` and signs with ethers `signTypedData`; a Seaport order is the
  same shape with a different domain/type, so it fits the existing convention with
  **no new core dependency** (keeps the constitution's tech-stack gate clean). The
  same builder that produces the signed order computes its net-proceeds figure, so
  the UI number equals what gets signed (FR-010). Crucially, the passkey adapter
  **already** computes `TypedDataEncoder.hash(domain, types, message)`, wraps it in
  `replaySafeHash`, performs the WebAuthn assertion, and returns the account's
  ERC-1271 envelope — so passkey Seaport signing reuses it verbatim (see D3).
- **Alternatives**:
  - `seaport-js` (OpenSea's order library) — **fallback** if hand-building the
    consideration/order-hash proves fragile in implementation; adopting it would be
    a justified new dependency at that point. Not the default: it is a heavy dep
    for what is a single typed-data struct the repo already knows how to express.
  - `@opensea/sdk` on the frontend (rejected: pulls the API key client-side —
    forbidden by FR-016 and the SDK's own guidance).
  - Gateway builds the unsigned order, frontend signs (rejected: the frontend must
    build to compute/verify net proceeds before signing anyway; splitting the build
    adds a round-trip and a drift risk for no gain).

## D2. Required fees & net proceeds: fetch live, compute on the client, show before signing

- **Decision**: A gateway route returns the order's **required fees** for
  `(chain, collection)` — sourced from OpenSea's collection `fees` (recipient +
  basis points + `required` flag) — plus the protocol/conduit addresses. The
  frontend computes **net proceeds = price − Σ(required fee bps × price)** in the
  order currency and shows the full breakdown (marketplace fee, creator royalty,
  net) before any approval. If fees cannot be fetched, the UI **blocks signing**
  (FR-009) rather than guessing.
- **Rationale**: FR-002/FR-010/FR-013 require honest, live, currency-labeled
  disclosure equal to what the marketplace computes. Fees must be baked into the
  order's consideration for OpenSea to accept the listing, so the same fetched
  fees drive both the signed order and the displayed net — one source, no drift.
- **Alternatives**: hardcode 2.5% (rejected: fees are per-collection and change;
  hardcoding violates FR-002 and would silently mislead on collections with
  creator royalties or non-standard marketplace fees).

## D3. Passkey sellers (ERC-1271): sign the replay-safe wrapped hash — LOAD-BEARING

- **Decision**: Passkey smart accounts (`CoinbaseSmartWallet`) sign
  **`replaySafeHash(seaportOrderHash)`** — not the bare Seaport EIP-712 digest —
  via the WebAuthn passkey path, and the gateway posts the order with the account
  address as offerer so OpenSea validates it on-chain through
  `isValidSignature` (ERC-1271, selector `0x1626ba7e`). Where OpenSea's orderbook
  cannot validate a given account's signature, the Sell/Cancel/Accept action for
  that account shows the honest-unavailable state (FR-019) — never a dead button.
- **Rationale**: `contracts/account/ERC1271.sol` validates `replaySafeHash(hash)`
  (an anti-cross-account-replay EIP-712 wrapper, domain `"Coinbase Smart Wallet"`
  v`"1"`), not the raw hash — confirmed in the account contract. A passkey listing
  signed over the bare order hash would fail on-chain validation. **The existing
  `passkeyIntentSigner` adapter already does exactly the right thing**: given a
  `(domain, types, message)`, it computes the order digest, reads `replaySafeHash`
  from the account, WebAuthn-signs over the wrapped hash, and returns the account's
  ERC-1271 `SignatureWrapper` envelope. OpenSea validates by calling
  `account.isValidSignature(orderHash, envelope)`, and the account internally
  re-applies `replaySafeHash(orderHash)` before verifying — so client wrapping and
  on-chain validation agree. This makes FR-019 (passkey selling in scope, per the
  clarify session) work by **reusing** the adapter rather than building new signing.
- **Verification owed in implementation**: confirm OpenSea's orderbook accepts an
  ERC-1271 listing from our account implementation end-to-end on a testnet/live
  collection before enabling the passkey path; until confirmed for a given
  account/network, that path stays behind the honest-unavailable fallback.
- **Alternatives**: sign the raw order hash (rejected: fails `isValidSignature`);
  require passkey users to link an EOA to sell (rejected: contradicts the clarify
  decision to support passkey selling this phase).

## D4. Accept offer: gateway returns fulfillment data, wallet submits the transaction

- **Decision**: To accept the best offer, the gateway calls OpenSea's
  **offer fulfillment-data** endpoint (`POST /v2/offers/fulfillment_data` with the
  offer + fulfiller) and returns the built transaction (`to`/`data`/`value`). The
  frontend submits it with the seller's wallet: an **EOA sends the transaction
  directly**; a **passkey account sends a UserOp**, which may be sponsored per the
  tier gate (D7 / FR-023). The best offer shown is re-validated at accept time so a
  changed/withdrawn offer is re-confirmed, not settled stale (FR-007).
- **Rationale**: Accepting an offer is on-chain fulfillment the seller pays gas for
  (FR-006); OpenSea's fulfillment-data endpoint yields the exact calldata. Reusing
  the 055 best-offer read plus a freshness re-check satisfies FR-007. Routing
  passkey fulfillment through the existing UserOp/paymaster path (spec 050) lets
  FR-023's sponsorship-follows-tier rule reuse existing machinery.
- **Alternatives**: build fulfillment calldata client-side (rejected: OpenSea's
  endpoint accounts for zones/extraData/signed orders; reproducing it is fragile).

## D5. Cancel: prefer the free off-chain cancel, disclose gas only when forced

- **Decision**: Cancellation uses OpenSea's **off-chain cancel** (a gas-free
  signed request the gateway forwards) when available; only when an on-chain
  Seaport cancel is required does the UI disclose gas first (FR-008).
- **Rationale**: Off-chain cancel is free and immediate; matches FR-008's
  "prefer free, disclose gas only when necessary."
- **Alternatives**: always on-chain cancel (rejected: needlessly charges gas).

## D6. Referral / affiliate attribution: confirm-then-configure, never at user cost — LOAD-BEARING

- **Decision**: A single server-side **referral beneficiary** (FairWins address,
  per network as needed) is configured in gateway config. The gateway attaches
  FairWins attribution to published listings and offer fulfillments **wherever
  OpenSea's program accepts it at no cost to the user**, behind one `attachReferral`
  seam. Because OpenSea's public docs do **not** clearly expose a `referrer`
  field on the v2 fulfillment endpoint (confirmed during research — the referral
  and 40–100% affiliate *programs* exist, but the API attribution path is
  under-documented), the seam is designed to **degrade to a no-op** when
  attribution isn't available, and it MUST NOT alter the user-facing net
  (FR-013/FR-015/SC-003). The exact mechanism (affiliate agreement, listing zone,
  or fulfillment parameter) is confirmed during implementation against OpenSea's
  current API/affiliate terms; the requirement holds regardless.
- **Rationale**: The clarify session fixed revenue as referral-only, never a
  surcharge. Encoding attribution as an optional, no-user-cost seam means the
  feature ships whether or not attribution is wired on day one, and turning it on
  later is config, not a redesign. SC-007 (≥95% attribution) is a target
  conditioned on the program permitting no-cost attribution — the correct behavior
  when it doesn't is to forgo, which the seam does.
- **Alternatives**: add a FairWins consideration fee to capture margin (rejected:
  that is a surcharge — explicitly out of scope, FR-015); block the feature until
  affiliate terms are signed (rejected: attribution is not on the value path;
  selling should work regardless).

## D7. Gateway write surface: new POST routes, own quotas, no cache, killswitch-aware

- **Decision**: Extend the 055 OpenSea router with write routes — publish listing,
  get required fees, get offer fulfillment data, cancel listing — plus the
  `client.post()` method the read-only client lacks. Writes run the existing
  `guard()` (killswitch → fail-closed key → quota) but with a **separate write
  quota instance** (`osWriteQuotas`, own env-tuned window) keyed by the seller's
  account address, **bypass the read cache** (mutations aren't cached), and **do
  not retry POST on 5xx** (order publication isn't idempotent).
- **Rationale**: Mirrors the `POST /v1/intents` write-path shape (killswitch →
  validate → quota → forward → error envelope) and reuses the origin-lock, CORS
  (already allows POST), and `GatewayError` envelope. Separate write quotas protect
  the shared key without throttling reads. No-retry-on-5xx avoids double-posting a
  listing.
- **Alternatives**: reuse the read quota instance (rejected: writes and reads have
  different cost/limits); allow retry (rejected: risks duplicate orders).

## D8. Frontend surface: extend the Collect detail sheet + a fee-disclosure confirm

- **Decision**: Add **Sell**, **Cancel listing**, and **Accept offer** actions to
  the existing `CollectibleDetailSheet` (055), each opening a confirm step that
  shows the live fee breakdown + net proceeds and the honest reward disclosure
  before requesting a signature/transaction. A new `useCollectibleSell` hook
  orchestrates: fetch fees → build order → sign (EOA or passkey) → post via
  gateway. Listing state ("Listed" / "Not listed") is read from OpenSea (extends
  the 055 detail composition). Actions soft-fail hidden on unsupported networks and
  disabled-with-reason for account types OpenSea can't validate (FR-018/FR-019).
- **Rationale**: The detail sheet is already where a user inspects an owned item
  and its best offer (055); Sell/Cancel/Accept belong there. A single confirm
  component enforces FR-002/FR-006/FR-014 disclosure consistently.
- **Alternatives**: a separate trading page (rejected: fragments the flow; the item
  detail is the natural context).
- **Note (frontend specifics)**: the wallet signer, passkey-signer abstraction, the
  existing gasless confirm/disclosure component, and tier-gating helpers are mapped
  from the codebase and reused rather than re-invented; exact modules are recorded
  in `plan.md`'s structure section.

## D9. Config & deployment

- **Decision**: New env (gateway): `OPENSEA_REFERRAL_ADDRESS` (public address,
  inline `value:` in the manifest — not a secret; validated with `ADDRESS_RE` at
  boot if set), optional `OPENSEA_REFERRAL_ADDRESS_<chainId>` per-network override,
  and write-quota knobs (`OPENSEA_WRITE_QUOTA_PER_ADDRESS`/`_GLOBAL`). No new
  client secret. Rename the ".env.example" OpenSea section from "read-only" and
  bump the gateway image tag past `collectibles-055`. **No new frontend core
  dependency** in the primary plan — Seaport typed data is hand-built (D1); a
  Vitest dev-only test helper for order fixtures is fine, and `seaport-js` is
  adopted only if the fallback is triggered (justified then).
- **Rationale**: A referral address is public config, so it goes inline like
  `PAYMASTER_ADDRESS_137`; fail-closed when unset means "no attribution," which is
  a safe default. Keeping the frontend dependency set unchanged keeps the
  constitution's tech-stack gate green.
- **Alternatives**: store the referral address as a secret (rejected: it's public);
  reuse read quotas (see D7); add `seaport-js` up front (deferred to fallback — D1).

## D10. Testing strategy

- **Decision**:
  - Gateway: extend `test/opensea.test.js` — post-listing forwards the signed order
    (assert body + `x-api-key`, no 5xx retry), get-fees normalization, cancel,
    fulfillment-data, write-quota 429, killswitch 503, fail-closed 503, and the
    `attachReferral` seam (attaches when configured, no-op + unchanged net when
    not). Reuse the injected `fetchImpl` mock (extended to capture `method`/`body`)
    and the existing ERC-1271 `magic` provider mock to simulate a passkey order.
  - Frontend: `useCollectibleSell` (fee fetch → build → sign → post; blocks on
    missing fees), the Sell/Accept/Cancel confirm UI (net-proceeds shown,
    reward disclosure, gas disclosure on accept, no-surcharge), passkey path
    (signs the wrapped hash; honest-unavailable fallback), network-switch prompt,
    tier-gated sponsorship on accept, and axe checks.
- **Rationale**: Constitution II — tests alongside behavior, both suites (Vitest +
  Supertest gateway; Vitest + RTL frontend), covering the failure/edge paths the
  spec enumerates (stale offer, fee-fetch failure, price-below-fee, passkey
  fallback).

## Constitution alignment (pre-design)

- No `contracts/` changes — the passkey account's ERC-1271 already exists; this
  feature reads it, never modifies it. Zero smart-contract risk surface.
- Honest state: live fees, net-proceeds equal to the marketplace's, no surcharge,
  no custody, killswitch, soft-fail — all encoded above.
- One new core dependency (`seaport-js`) — justified in the plan's Complexity
  Tracking / Constitution Check.

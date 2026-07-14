# Quickstart Validation: Collectibles Sell-Side (Phase 2)

**Feature**: 056-collectibles-sell-side

Runnable checks proving the sell flow works and stays honest. Contracts:
[`contracts/gateway-sell-api.md`](contracts/gateway-sell-api.md),
[`contracts/seaport-order-signing.md`](contracts/seaport-order-signing.md); DTOs:
[`data-model.md`](data-model.md).

## Prerequisites

- Same as spec 055 plus a wallet holding a collectible on Ethereum or Polygon.
- Gateway env: `OPENSEA_API_KEY` (already set), optional `OPENSEA_REFERRAL_ADDRESS`.

## 1. Automated suites (no key needed — upstream mocked)

```bash
# Gateway write routes: post-listing (no 5xx retry), required-fees, cancel,
# offer-fulfillment, write-quota 429, killswitch/fail-closed 503, attachReferral seam
cd services/relay-gateway && npm test -- opensea

# Frontend: order building + net proceeds, sell/cancel/accept confirm UI,
# passkey ERC-1271 signing path, network-switch, honest disclosure, axe
cd frontend && npm run test:run -- collectibles
```

Green expectations: net-proceeds equals the signed order's seller-receipt amount;
no consideration item pays a FairWins fee; missing fees block signing; a passkey
order signs over `replaySafeHash`; `attachReferral` is a no-op that leaves the net
unchanged when unconfigured.

## 2. Gateway live smoke (optional, needs key)

```bash
# Required fees for a collection (drives net-proceeds display)
curl -s -H 'X-Origin-Auth: dev-secret' \
  localhost:8788/v1/opensea/137/collections/<slug>/required-fees | jq '.fees, .marketplaceFee'

# Publish a pre-signed listing (order + signature from the SPA)
curl -s -X POST -H 'X-Origin-Auth: dev-secret' -H 'content-type: application/json' \
  -d @signed-listing.json localhost:8788/v1/opensea/137/listings | jq '.orderHash'

# Write quota: burst past the per-address limit → 429 + Retry-After
```

## 3. Frontend manual walkthrough

```bash
cd frontend && VITE_RELAYER_URL=http://localhost:8788 npm run dev
```

| Check | Steps | Expected |
|---|---|---|
| List (US1, SC-001) | Own item → detail → Sell → set price/currency/expiry | Net proceeds + fee lines shown BEFORE approval; ≤4 interactions; gas-free signature; item shows "Listed" |
| Net = signed (SC-002) | Inspect the confirm figure vs the built order | Displayed net equals the order's seller-receipt consideration |
| Fee-fetch failure (FR-009) | Force the fees route to fail | Signing is blocked with an explicit retry — never a guessed fee |
| Below floor (FR-011) | Enter a price under the fee total | Warned before listing is allowed |
| First-time approval (FR-004) | List an item needing collection approval | One-time on-chain approval disclosed (gas + what it authorizes) before requesting |
| Accept offer (US2, FR-006) | Item with a best offer → Accept | Net-to-seller + gas disclosed before approval; on accept, item transfers and proceeds arrive |
| Stale offer (FR-007) | Offer changes between view and accept | App re-confirms current offer, does not settle stale |
| Cancel (US3, FR-008) | Listed item → Cancel | Free cancel used when available; gas disclosed only if on-chain required; item → "Not listed" |
| Reward disclosure (FR-014) | Any sell/accept confirm | Plain-language "FairWins may earn a referral reward from the marketplace — costs you nothing" |
| No surcharge (FR-015, SC-003) | Inspect net across flows | Seller net identical with or without the reward; no FairWins fee line |
| Passkey seller (FR-019, SC-009) | Sign in with passkey, list an item | Listing signs via ERC-1271; only where the marketplace can't validate does it show honest-unavailable (never a dead button) |
| Open to all (FR-023) | List with a non-member wallet | Selling works; if sponsorship is offered for a step it follows tier gating; user-pays path always available |
| Wrong network (FR-021) | Wallet on chain ≠ item's | Prompted to switch to the item's network before signing |
| Soft-fail (FR-018) | Switch to Mordor | No Sell/Cancel/Accept affordances |
| Degraded/killswitch (FR-017) | Stop gateway / engage killswitch | Honest "trading temporarily unavailable"; act-on-OpenSea path still offered; no partial order |

## 4. Security / guardrail checks (SC-005, SC-006)

```bash
# No marketplace credential in client assets
cd frontend && npm run build && ! grep -ri "opensea_api\|x-api-key" dist/

# Wallet is the only signer (no gateway signing key on the sell path) — the gateway
# forwards a client-signed order; verify no private key / signer is used in the
# write routes.

# Referral address is public config, never a secret:
git grep -n "OPENSEA_REFERRAL_ADDRESS" -- ':!*.example' ':!specs' ':!docs'  # only config/manifest
```

## 5. Regression gates

```bash
cd frontend && npm run lint && npm run test:run
cd services/relay-gateway && npm test
```

No contract changes — `npm run compile` / Hardhat / `check:storage-layout`
unaffected. CI must stay green with no `continue-on-error`.

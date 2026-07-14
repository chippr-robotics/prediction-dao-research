# Implementation Plan: Collectibles Sell-Side Trading (Phase 2)

**Branch**: `claude/opensea-nft-trading-14m4kj` | **Date**: 2026-07-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/056-collectibles-sell-side/spec.md`

## Summary

Add sell-side actions to the Collect section (spec 055 read-only MVP): **list** an
owned collectible, **cancel** a listing, and **accept** the best offer — all through
OpenSea's orderbook, with the member's own wallet as the only signer and no app
custody. The frontend hand-builds the Seaport order as EIP-712 typed data and signs
it through the repo's single `signTypedData` seam — working unchanged for EOAs and,
via the existing `passkeyIntentSigner` adapter, for passkey smart accounts (ERC-1271
over `replaySafeHash`). The relay-gateway gains write routes that post the signed
order, fetch required fees, return offer-fulfillment data, and cancel — mirroring the
`POST /v1/intents` write pipeline, with its own write quotas and no cache. Honest
net-proceeds (live fees, never hardcoded) are shown before every signature, and a
server-side `attachReferral` seam records FairWins as the beneficiary of OpenSea's own
referral/affiliate program **only where it costs the user nothing** — no FairWins
surcharge (clarified). No smart-contract changes. Decision log: [research.md](research.md).

## Technical Context

**Language/Version**: JavaScript ESM — Node ≥20 (gateway), Node ≥22 + React 19 (frontend)

**Primary Dependencies**: gateway: Express 4 + native `fetch` (add a `client.post` to the 055 OpenSea client; **no new npm dep**); frontend: ethers v6 `signTypedData` + the existing `passkeyIntentSigner` adapter + wagmi (**no new core dep** — Seaport typed data is hand-built; `seaport-js` is a documented fallback only, research D1)

**Storage**: none persistent; transient order/DTO/hook state (data-model.md); gateway writes bypass the 055 read cache

**Testing**: Vitest + Supertest with injected `fetchImpl` (gateway; reuse the ERC-1271 `magic` provider mock for passkey orders); Vitest + Testing Library + vitest-axe + injected passkey-signer deps (frontend)

**Target Platform**: gateway on Cloud Run (existing service); frontend SPA (Vite)

**Project Type**: web application — `services/relay-gateway` + `frontend/`; no `contracts/`, no subgraph changes

**Performance Goals**: net-proceeds shown before approval in 100% of flows (SC-001); write routes protected by a separate per-address + global quota so the shared key isn't drained

**Constraints**: OpenSea key server-side only (FR-016); wallet is the only signer, no custody (FR-003/SC-005); live fees, block signing if unconfirmable (FR-009); net shown = net signed (FR-010); **no FairWins surcharge** (FR-015, clarified); referral attribution never at user cost or forgone (FR-013); passkey sellers supported via ERC-1271 or honest-unavailable per account (FR-019, clarified in scope); selling open to all wallets, sponsorship follows tier gating (FR-023, clarified); Ethereum + Polygon only; nothing on the wager/pool value path depends on it (FR-020)

**Scale/Scope**: ~4 new gateway routes + `client.post` + `attachReferral` + write-quota wiring; ~4 new frontend modules (seaportOrder builder, sellClient, useCollectibleSell hook, sell-confirm UI) + edits to the 055 detail sheet/panel; passkey path reuses existing signer/UserOp machinery

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.0.0 — PASS (pre-Phase-0 and re-checked post-Phase-1). Complexity Tracking below is empty.*

- **I. Security-First Smart Contracts**: PASS (N/A) — zero `contracts/` changes. The
  passkey account's ERC-1271 is **read**, never modified. No funds custody: the wallet
  is the only signer and OpenSea's shared protocol settles; the gateway forwards a
  client-signed order and holds no signing key on the sell path (SC-005). The new
  attack surface is the gateway write routes: origin-locked, killswitch-aware,
  fail-closed without the key, write-quota-guarded, shape-validated, no-retry on POST.
- **II. Test-First & Coverage**: PASS — Vitest suites specified alongside every
  behavior (research D10): gateway write routes incl. failure/edge (no-5xx-retry,
  quota 429, killswitch/fail-closed 503, `offer_changed` 409, `attachReferral` no-op);
  frontend order-build/net-equality, confirm-UI disclosure, passkey ERC-1271 path,
  fee-fetch-blocks-signing, below-floor warn, stale-offer re-confirm, network-switch,
  axe. No contract interfaces altered.
- **III. Honest State, No Mocks in Shipped Paths**: PASS — live fees (never
  hardcoded), net shown equals net signed, no surcharge, no custody, killswitch,
  soft-fail, stale-labeled data. Referral attribution is disclosed and never alters
  the user-facing net. Mocks confined to tests.
- **IV. Fail Loudly in CI**: PASS — new gateway + frontend tests run under the
  existing gating jobs (the 055 Relay Gateway Tests job already runs the gateway
  suite); no `continue-on-error`.
- **V. Accessible, Consistent Frontend**: PASS — WCAG 2.1 AA is FR-022; the sell
  confirm reuses the audited `PasskeyConfirm`/modal disclosure patterns (focus trap,
  keyboard price entry, accessible names); vitest-axe assertions included. No
  hardcoded addresses/ABIs — Seaport/protocol addresses come from the gateway's
  fee response, not client constants.
- **Additional Constraints**: PASS — **no new core technology** (hand-built Seaport
  typed data; `seaport-js` only if the documented fallback triggers, justified then);
  the referral beneficiary is public config (not a secret) and the API key stays in
  Secret Manager; archives untouched; `deployments/` untouched.

## Project Structure

### Documentation (this feature)

```text
specs/056-collectibles-sell-side/
├── spec.md
├── plan.md                          # This file
├── research.md                      # Phase 0 (D1–D10)
├── data-model.md                    # DTOs + SellActionState machine
├── quickstart.md                    # Validation guide
├── contracts/
│   ├── gateway-sell-api.md          # /v1/opensea/* write routes + attachReferral
│   └── seaport-order-signing.md     # the signed OrderComponents + signer seam
├── checklists/requirements.md
└── tasks.md                         # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
services/relay-gateway/
├── src/
│   ├── opensea/
│   │   ├── client.js                # [MODIFY] add post() (X-API-KEY, no 5xx retry, timeout)
│   │   ├── routes.js                # [MODIFY] add write routes: required-fees, listings (post),
│   │   │                            #          offers/fulfillment (post), listings/cancel (post)
│   │   ├── normalize.js             # [MODIFY] FeeBreakdown + order/fulfillment DTO mappers, body validators
│   │   └── referral.js              # [NEW] attachReferral seam (no-op when unconfigured / would cost user)
│   ├── config/index.js              # [MODIFY] referralAddress[_<chainId>] + write-quota knobs
│   └── server.js                    # [MODIFY] osWriteQuotas instance; pass into the OpenSea router
├── test/opensea.test.js             # [MODIFY] write-route + referral tests (extend mock to capture method/body)
├── .env.example                     # [MODIFY] rename "read-only" section; OPENSEA_REFERRAL_* + write quotas
└── README.md                        # [MODIFY] write routes + referral config

frontend/src/
├── lib/collectibles/
│   ├── seaportOrder.js              # [NEW] build OrderComponents typed data + net proceeds (one source)
│   └── sellClient.js                # [NEW] fetchRequiredFees / publishListing / cancelListing / fetchOfferFulfillment
├── hooks/useCollectibleSell.js      # [NEW] SellActionState machine (fees→build→sign→submit; EOA + passkey)
├── components/collectibles/
│   ├── SellConfirm.jsx              # [NEW] net-proceeds + fee lines + reward + gas disclosure (+ CSS)
│   ├── CollectibleDetailSheet.jsx   # [MODIFY] Sell / Cancel / Accept actions replace the "display only" link
│   └── CollectiblesPanel.jsx        # [MODIFY] update "display only / no trading" copy
└── contexts/WalletContext.jsx       # [MODIFY?] parametrized switch to item.chainId (multi-chain sell)

frontend/src/test/collectibles/      # [NEW/MODIFY] seaportOrder, sellClient, useCollectibleSell,
                                      #   SellConfirm, passkey-signing, detail-sheet-actions, axe

services/oz-relayer/deploy/production/service.yaml  # [MODIFY] OPENSEA_REFERRAL_ADDRESS (inline), image tag bump
docs/runbooks/relayer-operations.md  # [MODIFY] write routes + referral provisioning/rotation
```

**Structure Decision**: extend the two existing projects in place, reusing the 055
OpenSea router/client/config on the gateway and the established signing seam
(`signTypedData` + `passkeyIntentSigner`), confirm-UI patterns (`PasskeyConfirm`,
`MarketAcceptanceModal`), and UserOp/paymaster path on the frontend. No new service,
no contracts/subgraph work, no new core dependency.

## Complexity Tracking

No constitution violations — table intentionally empty. (The one dependency question,
`seaport-js`, is deferred to a documented fallback in research D1/D9 so the default
plan adds no new core technology; if implementation triggers the fallback, it is
justified at that point.)

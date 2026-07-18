# Implementation Plan: Buy Crypto — Coinbase Onramp from the Wallet Sheet

**Branch**: `claude/coinbase-onramp-purchase-efp05u` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/060-coinbase-onramp/spec.md`

## Summary

Add a single **Buy** button to the wallet bottom sheet (the account sheet opened
from the header avatar) that lets a member purchase crypto — defaulting to USDC
on the active network, delivered to the address shown in the sheet — through
**Coinbase's hosted Onramp experience**. FairWins' entire footprint is: a
pre-handoff disclosure modal, and a new optional `onramp` provider module on the
relay-gateway that screens the destination, mints a single-use Coinbase session
token server-side (secure init), and returns the hosted URL. Explicitly NOT
integrated into the Trade section; config-off leaves zero residual UI; no
contract changes; no FairWins fee.

## Technical Context

**Language/Version**: JavaScript (ES modules); Node ≥ 20 (relay-gateway), React 18 + Vite (frontend)

**Primary Dependencies**: Express + helmet (existing gateway); `@coinbase/cdp-sdk` (NEW, gateway-only — JWT auth helper for the CDP Onramp API); no new frontend dependencies

**Storage**: None — stateless proxy with in-memory options cache + quota counters (existing module pattern); FairWins records nothing about purchases

**Testing**: Vitest + supertest (gateway, `services/relay-gateway/test/onramp/`); Vitest + Testing Library (frontend, `frontend/src/test/onramp/`)

**Target Platform**: Relay-gateway (Cloud Run) + SPA (browser, mobile-first)

**Project Type**: Web application (frontend + existing backend service); no contracts/ changes

**Performance Goals**: Buy tap → hosted URL opened in < 2 s p95 (one gateway round-trip; options pre-fetched/cached ~5 min server-side)

**Constraints**: Coinbase session tokens are single-use, 5-minute expiry ⇒ mint per tap, never cache/log; secure-init mandatory (CDP creds server-side only); popup must open from a user gesture (popup-blocker fallback link)

**Scale/Scope**: 2 gateway routes, 1 config block, 1 frontend lib, 1 modal, 1 button in `WalletButton`, ~6 test files; mainnets 137 + 1 only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-first contracts** — PASS (no `contracts/` changes). The
  highest-risk surface here is credential handling and destination screening:
  CDP key is gateway-env only, JWTs built by the official helper (research R3),
  destination addresses screened via the shared sanctions guard **before** any
  session mint, screen errors fail closed (contracts/gateway-api.md validation
  order).
- **II. Test-first / coverage** — PASS. Gateway module gets route tests
  covering validation order, fail-closed states, quotas, and URL formation;
  frontend gets client soft-fail, button-gating, and modal-disclosure tests
  (quickstart.md). No contract interfaces touched.
- **III. Honest state, no mocks in shipped paths** — PASS by design: no
  synthetic "pending purchase" state (spec US3); availability is honestly
  gated (hide, or disabled-with-reason); balances update only from chain reads.
  Coinbase upstream is mocked **only** in test scopes.
- **IV. Fail loudly in CI** — PASS. New tests join the existing gateway/front
  end suites; no `continue-on-error` anywhere.
- **V. Accessible, consistent frontend** — PASS. Buy button + modal follow the
  existing sheet/modal a11y idiom (role=dialog, focus management, Escape);
  axe/Lighthouse gates unchanged. No contract addresses involved, so no sync
  artifacts touched.
- **Additional constraints** — New core technology? One gateway-only dependency
  (`@coinbase/cdp-sdk`) justified in research R3 (official JWT claim shape;
  avoids hand-rolled crypto). Secrets: `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`
  documented in `.env.example`, never committed (constitution key-management).
  YAGNI: no webhooks, no purchase ledger, no redirect handling in v1.

**Post-design re-check**: PASS — design artifacts introduce no violations; no
Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/060-coinbase-onramp/
├── plan.md              # This file
├── spec.md              # Feature spec (with in-session clarifications)
├── research.md          # Phase 0 — integration mode, auth, availability
├── data-model.md        # Phase 1 — config, availability, session shapes
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   └── gateway-api.md   # Phase 1 — /v1/onramp/* HTTP contract
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
services/relay-gateway/
├── src/
│   ├── onramp/                    # NEW provider module (mirrors polymarket/)
│   │   ├── routes.js              # GET /v1/onramp/options, POST /v1/onramp/session
│   │   ├── client.js              # CDP Onramp API client (JWT auth, timeouts, retries)
│   │   └── chains.js              # chainId → Coinbase network slug map
│   ├── config/index.js            # + onramp config block (env table in data-model.md)
│   └── server.js                  # + mount onramp routes
├── test/onramp/
│   └── routes.test.js             # validation order, fail-closed, quotas, URL formation
└── package.json                   # + @coinbase/cdp-sdk

frontend/src/
├── lib/onramp/
│   └── onrampClient.js            # NEW gateway client (mirrors predictClient.js)
├── components/wallet/
│   ├── WalletButton.jsx           # + Buy button in the sheet header (gated)
│   ├── BuyCryptoModal.jsx         # NEW pre-handoff disclosure + Continue to Coinbase
│   └── BuyCryptoModal.css
├── config/networks.js             # + onramp capability (ONRAMP_CHAIN_IDS: 137, 1)
└── test/onramp/
    ├── onrampClient.test.js
    └── BuyCryptoModal.test.jsx    # + WalletButton gating test
```

**Structure Decision**: Web application split matching the repo's established
optional-provider pattern — a self-contained gateway module under
`services/relay-gateway/src/onramp/` and a thin frontend lib + two component
touches. No `contracts/`, `subgraph/`, or `scripts/` changes.

## Complexity Tracking

No constitution violations — table intentionally empty.

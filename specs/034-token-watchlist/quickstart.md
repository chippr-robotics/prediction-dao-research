# Quickstart & Validation: Token Watchlist (My Tokens Assets)

**Feature**: 034-token-watchlist | **Spec**: [spec.md](./spec.md) · [plan.md](./plan.md)

A runnable validation guide proving the feature end-to-end. Details live in
[data-model.md](./data-model.md) and [contracts/](./contracts/); this file is the run/verify
script, not the implementation.

## Prerequisites

- Node 20 toolchain; `cd frontend && npm ci` (repo root for contract tooling).
- A browser wallet (MetaMask) able to switch between Polygon (137), Amoy (80002), and an ETC
  network (61/63).
- An **active membership (any paid tier)** on the chain you test (the watchlist is gated,
  FR-023). Use the Membership tab to purchase one on a testnet if needed.

## Run

```bash
cd frontend
npm run dev            # Vite dev server
# open the app → connect wallet → My Account → Tokens
```

In the Tokens area you will now see tabs: **My Tokens** (assets — new), **Issued** (the former
"My Tokens", relabeled), **Create**, **Explorer**.

## Automated checks (the gates that must pass)

```bash
# Frontend unit/component tests (store, hooks, panel, dialog, logo, registry)
cd frontend && npm run test -- src/components/tokens src/lib/tokens src/hooks/useTokenWatchlist

# CSP regression — both nginx configs stay in sync (Constitution IV)
cd frontend && npm run test -- src/test/nginxCspImgSrc.test.js src/test/nginxCspConnectSrc.test.js

# Lint + a11y-affecting build
cd frontend && npm run lint && npm run build      # build needs a clean env (see local-verification memo)
```

## Manual validation scenarios (map to spec acceptance criteria)

### S1 — Add from the registry, network-scoped (US1 / FR-001,002,005,008)
1. Connect on **Polygon 137** (member). Open My Tokens → **Add token** → Browse.
2. Search "USDC" → add it. **Expect**: it appears in My Tokens with symbol, a registry logo,
   and your live balance (or "—" if none).
3. Switch wallet network to **Amoy 80002**. **Expect**: the Polygon USDC is **gone** from view
   (hidden, not deleted); only Amoy entries show. Switch back → it returns. *(SC-003: zero
   cross-chain leakage.)*

### S2 — Custom token by address, unverified (US2 / FR-003,004,011,025)
1. On a supported chain, Add token → **Custom** → paste a valid ERC-20 address **not** in the
   list. **Expect**: symbol/decimals resolve from chain; it appears with an inline
   **"unverified — not in the token registry"** badge and a **placeholder** logo (no remote
   image). *(SC-002)*
2. Paste a non-contract / junk address. **Expect**: honest error, **nothing added**. *(SC-006)*
3. Re-add an already-watched token. **Expect**: no duplicate; "already tracked". *(FR-010)*

### S3 — Membership gate (FR-023 / US1 scenario 5)
1. Connect a wallet with **no active membership** (or a chain without one). Open My Tokens.
   **Expect**: an honest gated notice + "Get a membership" CTA, **no** watchlist/add controls.

### S4 — Persistence + encrypted backup restore (US3 / FR-012,013,014,015)
1. Add several tokens across **two** networks. Reload the page. **Expect**: all intact (local
   persistence).
2. Account → Backup → **Back up** (encrypts the unified bundle incl. `objects.tokens`, pins to
   IPFS, writes the pointer on canonical chain 137).
3. Clear site data (or use a fresh browser), reconnect the **same wallet**, → Backup →
   **Restore**. **Expect**: every watched token returns under its **correct network**; nothing
   lost; no cross-chain mix-up. *(SC-004)*

### S5 — Registry unavailable / custom-only chain (FR-016,017)
1. Temporarily set `VITE_TOKENLIST_URL_POLYGON` to an unreachable URL and clear the cached list.
   Open Browse on 137. **Expect**: honest "catalog unavailable" notice; **custom-add still
   works**; already-watched tokens still listed. *(SC-008)*
2. Switch to **Amoy 80002**. **Expect**: Browse states no curated catalog exists here; custom-
   add works.

### S6 — Honest balances (FR-005)
1. With a watched token, simulate an RPC failure (offline/devtools). **Expect**: the token still
   shows, balance renders "—" (unavailable), never a misleading `0`.

## Expected outcomes (definition of done)

- All listed automated tests pass; lint clean; build succeeds in a clean env.
- S1–S6 behave as described.
- No backend service added; only `frontend/` source, two nginx config lines (+test), and
  `networks.js`/`.env.example` config changed. No `contracts/` or smart-contract change.

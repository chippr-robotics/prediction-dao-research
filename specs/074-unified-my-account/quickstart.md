# Quickstart: Unified My Account Experience

## Prerequisites

```bash
cd frontend && npm install   # repo root: npm run frontend to serve
```

## Run the feature

```bash
npm run frontend             # from repo root (Vite dev server)
```

1. Connect a wallet (or passkey) and open **My Account** (account button →
   Account, or `/wallet?tab=account`).
2. Top: the account cards. With custody vaults (Protect) and/or recovered
   accounts (Recovery → legacy key recovery) present, swipe/arrow through
   them; tap a card → it becomes the active account (header dropdown agrees);
   tap a Recovered card → unlock dialog first.
3. Bottom: switch **Activity / Portfolio / Stats** — bottom bar on a phone
   width, tab strip on desktop. URL carries `?view=`; reload lands on the
   same view.
4. Old links: visit `/wallet?tab=portfolio` → redirected to
   `/wallet?tab=account&view=portfolio`.

## Validate (scoped Vitest runs — never the full suite locally)

```bash
cd frontend
npx vitest run src/test/account/AccountCardsCarousel.test.jsx
npx vitest run src/test/account/MyAccountView.test.jsx
npx vitest run src/test/account/MyAccountView.axe.test.jsx
npx vitest run src/test/account/useAccountStats.acting.test.jsx
npx vitest run src/test/WalletPage.test.jsx
npx vitest run src/test/AppNavDrawer.test.jsx
npx vitest run src/test/collectibles/walletPageCollectibles.test.jsx
```

Expected: all pass; the axe run reports no violations (contract X1).

## Expected outcomes

- Contract IDs in
  [contracts/my-account-ui-contract.md](./contracts/my-account-ui-contract.md)
  map 1:1 onto the assertions in the suites above (U* URL behavior, C*
  carousel, V* views, A* acting-account scope, X* accessibility).
- `npm run lint` (frontend) stays clean.

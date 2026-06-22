# Quickstart: Multi-Stablecoin Support — Validation Guide

Runnable scenarios that prove the feature works end-to-end. Details live in [data-model.md](./data-model.md) and [contracts/](./contracts/); implementation steps belong in `tasks.md`.

## Prerequisites

- `npm install` at repo root and in `frontend/`.
- Hardhat for contract/integration tests; Vitest for frontend.
- No new deployment needed for tests — `WagerRegistry` already exposes the allow-list. Mainnet seeding uses the admin/keystore flow (out of scope for local validation).

## 1. Contract / integration — multi-token wager lifecycle (US1, FR-004/005/015/016)

```bash
npm run compile
npm test                     # unit: allow-list (setTokenAllowed/isAllowedToken/NotAllowedToken)
npm run test -- test/integration   # or the integration script
```

**Expected**:
- Allow-list two mock ERC-20s with **different decimals** (6 and 18). Create→accept→claim a wager in the 18-decimal token: escrowed == staked, winner paid the pooled stake in that token, amounts correct at 18 decimals.
- Refund and draw paths settle in the wager's token.
- Creating a wager in a **non-allow-listed** token reverts `NotAllowedToken`.
- After `setTokenAllowed(token,false)`, an **existing** wager in that token still claims/refunds (FR-016); a **new** wager in it reverts.

## 2. Frontend — supported config & helpers (FR-002/014, IC-1..IC-5)

```bash
npm run test:frontend -- stablecoins networks
```

**Expected**: `getSupportedStablecoins(137)` returns USDC+USDT+EURC; `getDefaultStablecoin(137)` is USDC; exactly one `isDefault`; every entry `standardErc20:true`; legacy `stablecoin` deep-equals the default entry; coins are network-scoped.

## 3. Frontend — member preferences (US2, FR-007/008/009/010, P-1..P-8)

```bash
npm run test:frontend -- StablecoinPreferences UserPreferences
```

**Expected**:
- No prefs ⇒ default USDC, all visible (P-1).
- Set default EURC ⇒ persisted per wallet; reload reconnect same wallet ⇒ EURC default (P-2, INV-3).
- Hide USDT ⇒ absent from this member's selectors (P-3).
- Hide the current default ⇒ forced to pick a replacement or default reverts to USDC (P-4).
- Stored default absent on active network ⇒ effective USDC (P-5); references removed coin ⇒ USDC (P-6).
- Different wallet ⇒ its own prefs (P-7).

## 4. Frontend — wager-creation selector (US1, FR-004/011/015)

```bash
npm run test:frontend -- StablecoinSelector useFriendMarketCreation
```

**Expected**: selector lists the member's **visible** supported coins, pre-selects their default; chosen address flows through `requestedToken` into creation; a hidden coin a counterparty used still lets the member accept (FR-011).

## 5. Frontend — token-aware, per-currency display (US3, FR-012/013/013a, SC-002/007)

```bash
npm run test:frontend -- TokenAmount reportBuilder
```

**Expected**: every amount renders symbol + correct decimals; a list mixing USDC and EURC labels each; report totals group per ticker/peg and **never** sum EUR into a USD total; no FX/price call is made.

## 6. Accessibility (Constitution V)

```bash
npm run test:frontend -- axe   # Preferences + selector
```

**Expected**: new Preferences stablecoin manager and selector pass axe, are keyboard-operable, ESLint-clean.

## 7. Manual smoke (optional, testnet)

```bash
npm run frontend
```

1. My Account → Preferences → set EURC default, hide USDT → reload → choices persist.
2. Create wager → selector pre-selects EURC → create in EURC → accept from a second wallet → claim. Amounts shown as EURC throughout; never as USD.

## Done / acceptance mapping

| Scenario | Spec refs |
|----------|-----------|
| 1 | US1; FR-004/005/015/016; SC-001/006/007/009 |
| 2 | FR-002/002a/002b/014; SC-005/008 |
| 3 | US2; FR-007/008/009/010; SC-003/004 |
| 4 | US1; FR-004/011/015 |
| 5 | US3; FR-012/013/013a; SC-002 |
| 6 | Constitution V |

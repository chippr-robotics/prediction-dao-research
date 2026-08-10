# Quickstart Validation: Configurable Platform Fee Wrapper (spec 060)

Runnable scenarios proving the feature end-to-end. Interfaces:
[contracts/fee-router.md](contracts/fee-router.md),
[contracts/gateway-fees.md](contracts/gateway-fees.md); entities:
[data-model.md](data-model.md).

## Prerequisites

```bash
npm ci && npm run compile
(cd services/relay-gateway && npm ci)
(cd frontend && npm ci)
```

## 1. Contract suite (fee math, atomicity, caps, consent, roles)

```bash
npx hardhat test test/feeRouter.test.js test/upgradeable/FeeRouter.upgrade.test.js
npm run check:storage-layout
```

Expected: all green. Covers — 50 bps on 100 USDC ⇒ 0.50 fee / 99.50 deposited;
floor-rounding to zero charges nothing; `setFeeBps` above cap reverts `CapExceeded`;
live rate above `maxFeeBps` reverts `FeeAboveQuoted`; vault revert rolls back the fee;
zero treasury ⇒ full deposit + `FeeSkippedNoTreasury`; non-FEE_ADMIN `setFeeBps` reverts;
`FeeBpsChanged` carries actor/old/new; storage layout registered and clean.

## 2. Gateway (live bps from chain, honest fallback)

```bash
cd services/relay-gateway && npx vitest run test/fees.test.js test/polymarket.test.js test/gateway.test.js
```

Expected: `/fee-rate` returns chain-sourced bps with `source: "chain"`; provider failure
⇒ env values with `source: "env-fallback"`; above-cap chain value clamped + warned;
`/status` includes the `fees` block.

## 3. Frontend (disclosure, zero-fee parity, admin tab)

```bash
npm run test:frontend
```

Expected: VaultSheet shows the "FairWins platform fee" line only when bps > 0 and blocks
deposit when the quote is unavailable; `buildDepositCalls` emits approve+`depositToVault
WithFee` when bps > 0 and today's approve+deposit when 0; FeesTab renders all rows, gates
edits by role, validates caps client-side; axe passes.

## 4. Manual end-to-end (local chain)

```bash
npx hardhat node &
npx hardhat run scripts/deploy/deploy.js --network localhost
npx hardhat run scripts/deploy/deploy-fee-router.js --network localhost
npm run sync:frontend-contracts && npm run frontend
```

1. AdminPanel → Fees: see `earn.lend 0/250`, `polymarket.taker 50/100`,
   `polymarket.maker 0/50`, treasury. Set `earn.lend` to 50 bps → history row appears.
2. Earn → vault → deposit 100: review shows "FairWins platform fee 0.50% · 0.50",
   net 99.50; confirm; treasury +0.50, vault position 99.50.
3. Set fee back to 0 → new deposit shows no fee line, full amount deposited.
4. Try 300 bps → rejected before send and reverts on-chain if forced.

## 5. Docs artifacts

- `docs/developer-guide/platform-fees.md` — following only its "register a new service"
  steps yields a working new fee entry (SC-005).
- `docs/runbooks/fee-operations.md` — the emergency-zero procedure works as written.
- `docs/user-guide/platform-fees.md` renders on the docs site build.

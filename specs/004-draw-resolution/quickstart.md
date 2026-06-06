# Quickstart: Validating Draw Resolution

Runnable validation scenarios proving the feature works end-to-end. Implementation code lives in the source tree / `tasks.md`; this is the run/verify guide.

## Prerequisites

- Repo deps installed (`npm install`; `cd frontend && npm install`).
- Contracts compile: `npm run compile`.
- For the Polymarket tie scenario: the existing fork/integration harness in `test/integration/oracle/WagerRegistry_Polymarket.test.js` (uses a mock CTF you can resolve with `resolveCondition(conditionId, payouts)`).

## 1. Contract unit tests — manual draw (mutual consent + arbitrator)

New suite: `test/WagerRegistry.draw.test.js`. Run:

```bash
npx hardhat test test/WagerRegistry.draw.test.js
```

Expected (each an assertion):
- **Mutual consent settles**: `Either` wager, creator `declareDraw` (no settle, `DrawProposed`), opponent `declareDraw` → status `Draw(6)`, creator balance +`creatorStake`, opponent +`opponentStake`, `WagerDrawn` emitted.
- **One-sided does not settle / does not lock**: after only creator `declareDraw`, status still `Active`; `declareWinner(opponent)` still succeeds.
- **Single party cannot force a draw**: opponent never consents → no settlement possible without them.
- **Arbitrator solo**: `ThirdParty` wager, arbitrator `declareDraw` → immediate `Draw`.
- **Non-participant rejected**: a stranger calling `declareDraw` reverts (`NotParticipant`).
- **Oracle type rejected**: `declareDraw` on a `Polymarket` wager reverts (`DrawNotApplicable`/`NotAuthorized`).
- **Unequal stakes**: creatorStake=30, opponentStake=10 → each gets exactly their own back; Σ returned == 40.
- **Finality**: after `Draw`, `declareWinner` / `declareDraw` / `claimPayout` / `claimRefund` all revert.
- **Revoke**: creator `declareDraw` then `revokeDraw` (clears bit, `DrawRevoked`); opponent `declareDraw` alone still does not settle.
- **Frozen**: a frozen creator calling `declareDraw` reverts (`AccountFrozenError`).
- **Paused**: with the registry paused, `declareDraw` (both consent) still settles (exit path stays open).

## 2. Integration/fork test — Polymarket tie auto-draws

Update `test/integration/oracle/WagerRegistry_Polymarket.test.js`:

```bash
npx hardhat test test/integration/oracle/WagerRegistry_Polymarket.test.js
```

Expected:
- **Tie → Draw (immediate)**: resolve the mock condition with equal payouts (`resolveCondition(id, [1,1])`), then `autoResolveFromPolymarket(wagerId)` → status `Draw(6)` and both stakes returned **without** advancing past `resolveDeadline`. (Replaces today's "reverts `ConditionNotResolved`, refund only after deadline" expectation.)
- **Invalid/both-zero → Draw**: payouts `[0,0]` likewise → `Draw`.
- **Decisive → winner (unchanged)**: payouts `[1,0]` → `Resolved`, winner per `creatorIsYes`.
- **Unresolved → revert (unchanged)**: market not resolved → `autoResolveFromPolymarket` reverts `ConditionNotResolved`.

## 3. Full contract suite + coverage + security

```bash
npm test
npm run test:coverage      # resolution/claim/refund/draw paths covered
slither .                  # 0 new high/critical (document any accepted finding)
# Medusa fuzz the draw/consent + settlement invariants (Σ returned == escrowed)
```

## 4. Frontend tests

```bash
npm run test:frontend
```

Expected (in `frontend/src/test/MyMarketsModal.test.jsx`):
- Draw option shown for an authorized resolver on an eligible `Active` wager; **hidden** for a non-resolver and for oracle-type wagers.
- Participant flow renders Propose → Waiting/Withdraw → Confirm based on `drawConsent`.
- Selecting Draw calls `registry.declareDraw(id)`; Withdraw calls `registry.revokeDraw(id)`.
- A `draw`-status wager renders the "Draw" label/badge distinct from "Refunded" and "Resolved", and appears under History.

## 5. Deploy to Amoy + sync frontend (testnet first)

```bash
# Deterministic v3 deploy to Amoy (writes deployments/amoy-chain80002-v3.json)
npx hardhat run scripts/deploy/deploy.js --network amoy
npm run sync:frontend-contracts:amoy        # writes v3 address into frontend/src/config/contracts.js
# Regenerate the ABI from the new artifact into frontend/src/abis/WagerRegistry.js
```

Then run the dev server and manually settle a draw end-to-end:

```bash
npm run frontend
```

- Create + accept a wager (Either), propose a draw from one wallet, confirm from the other → both balances restored, status "Draw" in History.

## 6. Mainnet cutover (gated — explicit confirmation required)

Only after Amoy validation and security review sign-off, and with explicit user go-ahead (the registry is paused for testing):

```bash
# floppy keystore mounted; CONFIRM_MAINNET=true; pinned GAS_PRICE_WEI; reliable Polygon RPC
npx hardhat run scripts/deploy/deploy.js --network polygon     # writes deployments/polygon-chain137-v3.json
npm run sync:frontend-contracts -- --network polygon --chainId 137
```

The Polymarket adapter is **reused** (no redeploy, no `setPolymarketAdapter` change). Verify `getWager` decodes `Status.Draw` and a test draw returns both stakes on a throwaway wager before announcing.

## Success mapping

| Spec criterion | Validated by |
|---|---|
| SC-001 (exact stakes, equal+unequal) | §1 unequal-stakes + §1 mutual-consent |
| SC-002 / SC-002a (single action; no deadline; both must agree) | §1 mutual-consent + one-sided-no-lock |
| SC-003 (Polymarket tie → draw, no hang) | §2 tie → Draw immediate |
| SC-004 (no value moved between/created) | §1 unequal + §3 Medusa invariant |
| SC-005 (unauthorized/ineligible rejected) | §1 non-participant/oracle/finality |
| SC-006 (UI identify + label) | §4 frontend |
| SC-007 (no regression) | §2 decisive/unresolved unchanged + `npm test` |

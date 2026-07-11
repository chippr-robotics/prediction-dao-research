# Quickstart: Validate the Sponsored Paymaster

End-to-end validation, cheapest-first: **local fork → Amoy → Polygon**. Proves a native-token-less
passkey account transacts for free, that the deposit is drain-protected, and that sponsorship-down
falls back honestly. (Detailed steps are authored in `tasks.md`; this is the run/validation guide.)

## Prerequisites

- Contracts compiled (`npm run compile`); Hardhat fork RPC for Polygon.
- A KMS key for the sponsorship signer **OR** a local test key standing in for it (fork/Amoy).
- Amoy: a funded deployer (floppy keystore or `.env` fallback) + a small MATIC amount for the
  paymaster deposit; a passkey account holding **only USDC** (zero MATIC) for the headline test.

## 1. Contract, on a Polygon fork (no spend, fastest)

```bash
npx hardhat test test/account/VerifyingPaymaster.test.js
npx hardhat test test/account/fork/VerifyingPaymaster.fork.test.js   # real EntryPoint v0.6
```
**Expect**: unit specs green; the fork test funds the paymaster deposit, signs an approval with the
test key, submits a **first-use** `executeBatch` UserOp (deploy + transfer) for a counterfactual
account with **zero native balance**, and asserts inclusion + that the sender's native balance is
unchanged. Invalid/expired/tampered sigs → `AA34 signature error` / `SIG_VALIDATION_FAILED`.

## 2. Gateway sponsorship endpoint (local)

```bash
cd services/relay-gateway && npm test -- paymaster
```
**Expect**: `pm_getPaymasterData` grants a recoverable, correctly-packed approval; killswitch →
503; sanctioned account → 403; over-`PM_MAX_COST_WEI` op → 400 `cost_ceiling_exceeded`; quota
exhaustion → 429; stub length == real length; boot fails if the KMS signer address ≠ on-chain
`verifyingSigner`.

## 3. Amoy — real chain, low stakes

```bash
# deploy + fund
npx hardhat run scripts/deploy/deploy-verifying-paymaster.js --network amoy
#   → records deployments/amoy.json { verifyingPaymaster, verifyingSigner, entryPoint }
#   → fund deposit per docs/runbooks/paymaster-operations.md
npm run sync:frontend-contracts:amoy
# gateway: set PAYMASTER_ADDRESS_80002 + PM_SIGNER_KMS_KEY + ceilings; redeploy gateway
# SPA: set VITE_SPONSOR_PAYMASTER_AMOY; rebuild
```
**Headline test (SC-001)**: from a passkey account holding **only USDC**, send a USDC transfer and a
native transfer. **Expect**: both included in one confirmation each; confirm screen reads
**"Sponsored — no network fee"**; user's (zero) native balance unchanged; recipient credited.

**Abuse tests (US3 / SC-005/006)**: sanctioned/over-quota account → sponsorship refused, self-submit
still offered; trip the killswitch → all sponsorship stops within one request; deposit never
exceeds the funded cap.

**Never-stranded (SC-003)**: point the SPA at a dead paymaster URL (or killswitch on) → confirm
screen switches to **"You pay the {native} network fee"**, and an account WITH native token
completes via self-submit; an account WITHOUT native token sees the honest shortfall (no false
"free", no dead-end).

## 4. Polygon — production

Repeat step 3 on Polygon 137 (EntryPoint v0.6). Fund the deposit to the initial cap (research §8);
register `paymasterDepositRunwayHrs` in monitoring alongside the alto-executor + relayer gas wallets;
verify the contract via `npm run verify:polygon`.

## Success = spec Success Criteria

SC-001 free zero-native transfers · SC-003 100% never-stranded · SC-004 disclosure matches outcome ·
SC-005/006 zero abusive spend + instant killswitch + bounded deposit · SC-007 runway visible ·
SC-008 no regression where no pool exists.

## Rollback

Unset `VITE_SPONSOR_PAYMASTER_<net>` (SPA self-funds again) or trip the killswitch (gateway stops
signing) — both are instant and fail-open. `withdrawTo` (owner/floppy) drains the deposit if
retiring the paymaster.

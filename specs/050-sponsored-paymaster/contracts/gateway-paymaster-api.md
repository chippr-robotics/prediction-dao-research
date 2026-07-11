# Contract: Relay-Gateway Sponsorship Endpoint (ERC-7677)

New routes on the **existing** `services/relay-gateway` (no new service). Speaks the ERC-7677
paymaster JSON-RPC so viem's `createPaymasterClient` uses it unmodified. Same origin-lock + CORS as
`/v1/intents` (incl. the PR #857 CORS parity). Fails **closed** for policy, **open** for the client
(client falls back to self-submit).

## Endpoint

`POST /v1/paymaster` — JSON-RPC 2.0. Methods:

### `pm_getPaymasterStubData(userOp, entryPoint, chainId, context)`
Returns a **stub** for gas estimation — no policy, no signing:
```json
{ "paymasterAndData": "0x<paymaster><validUntil><validAfter><65-byte dummy sig>" }
```
Stub uses `validUntil = now + TTL`, `validAfter = 0`, and a fixed dummy signature so the estimated
`verificationGasLimit` matches the real op.

### `pm_getPaymasterData(userOp, entryPoint, chainId, context)`
Runs the **policy pipeline**, then signs. On grant:
```json
{ "paymasterAndData": "0x<paymaster><validUntil><validAfter><real sig>" }
```
On refusal: JSON-RPC error with a stable `code` (see below). The frontend treats **any** error (or
network failure) as "sponsorship unavailable" → self-submit.

## Policy pipeline (order mirrors `/v1/intents`)

```
1. killswitch.isActive()                      → 503 killswitch_active           (FR-011)
2. chainCfg = config.chains[chainId]          → 400 chain_unsupported / no paymaster (FR-016/17)
3. entryPoint === chainCfg.entryPointV06      → 400 entrypoint_mismatch
4. account = userOp.sender
   estCostWei = totalGasLimit × maxFeePerGas
5. estCostWei ≤ PM_MAX_COST_WEI               → 400 cost_ceiling_exceeded       (FR-010)
   totalGas  ≤ PM_MAX_GAS                     → 400 gas_ceiling_exceeded        (FR-010)
6. screen.screen(chainId, account)  (fail-closed) → 403 sanctioned             (FR-009)
7. quotas.hit(account) + global quota         → 429 quota_exceeded {retryAfterSec} (FR-010)
8. build getHash(userOp, validUntil, validAfter)
9. sig = KMS.sign(hash)                        → assemble paymasterAndData      (FR-018)
10. return { paymasterAndData }
```

Steps 1–7 spend **no** operator funds (FR-014). Only a granted op reaches the signer (step 9); the
deposit is spent only if the op is then included on-chain.

## Modules (new, under `services/relay-gateway/src/paymaster/`)

| File | Role |
|---|---|
| `build.js` | `getHash` (must match the contract byte-for-byte), pack/stub `paymasterAndData` |
| `sign.js` | KMS digest-sign → 65-byte `{r,s,v}`; caches the signer address; health-checks KMS at boot |
| `policy.js` | `estCost`/gas ceiling checks; composes existing `screen`/`quotas`/`killswitch` |

## Config additions (`config/index.js`, per-chain like existing keys)

```
PAYMASTER_ADDRESS_<chainId>      # deployed FairWinsVerifyingPaymaster (from deployments/)
ENTRYPOINT_V06_<chainId>         # 0x5FF1…2789 (default)
PM_SIGNER_KMS_KEY                # KMS key resource id (signer); NEVER a raw key
PM_ACCOUNT_QUOTA_PER_MIN=6
PM_ACCOUNT_QUOTA_PER_DAY=25
PM_GLOBAL_QUOTA_PER_DAY=500
PM_MAX_COST_WEI=2000000000000000000   # 2 MATIC
PM_MAX_GAS=3000000
PM_APPROVAL_TTL_SEC=180
PM_RUNWAY_WARN_HRS=48
```

Startup consistency (like FR-025 in spec 036): a chain advertising paymaster support MUST have
`PAYMASTER_ADDRESS_<id>` set and the KMS signer address MUST equal the on-chain `verifyingSigner`
(fail boot loudly otherwise — constitution IV).

## `/status` extension

Add `paymasterDepositRunwayHrs` (operator-only, like `gasWalletRunwayHrs`): `balanceOf(paymaster) /
burnRate`; surfaced with the alto-executor + relayer gas-wallet runway (FR-019). The SPA's
self-submit probe never reads it.

## Tests (`services/relay-gateway/test/paymaster.test.js`)

Grant path signs a recoverable, correctly-packed approval; each refusal reason returns its code and
spends nothing; killswitch halts within one request; ceiling rejects an over-cost op; sanctioned
account refused; quota exhaustion → 429; KMS signer address mismatch fails boot; stub data length ==
real data length.

# Phase 0 Research: Sponsored Paymaster

All decisions target the **existing** stack (EntryPoint v0.6, self-hosted alto bundler, Coinbase
smart account, relay-gateway) and reuse it wherever possible.

## 1. Paymaster type — sponsoring (verifying) vs. ERC-20 (fee-in-USDC)

**Decision**: A **verifying (sponsoring) paymaster** — FairWins pays the gas; the user pays
nothing.

**Rationale**: The product surface already reads "sponsored — no network fee"; sponsoring makes
that true. A verifying paymaster is the smallest, most-audited pattern (eth-infinitism
`VerifyingPaymaster`): validation is a single `ecrecover` over the op + a validity window, with no
price oracle, no ERC-20 accounting, no token approval, and no refund path. The user needs **zero**
balance of any token — the strongest UX and exactly what unblocks native-token-less users.

**Alternatives considered**:
- *ERC-20 (fee-in-USDC) paymaster* (self-hosted): requires a price oracle, USDC pull + refund
  accounting, and a token approval in the first op. More contract surface + more failure modes for
  a "user still pays" outcome the product didn't want.
- *Third-party paymaster (Pimlico/Circle)*: rejected by the product owner (self-managed
  requirement); also Circle is v0.7-only and Pimlico's happy-path couples bundler+paymaster.

## 2. EntryPoint version — stay on v0.6

**Decision**: Build a **v0.6** paymaster (EntryPoint `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`).

**Rationale**: The deployed `accountFactory` (0xd519C25e), the Coinbase smart account, and alto are
all v0.6. Moving to v0.7 changes the account implementation → changes every deterministic account
**address**, orphaning already-deployed accounts and any funds sent to v0.6 addresses. Not worth it
for a paymaster. The v0.6 verifying paymaster is well-trodden.

## 3. Contract sourcing — extend the vendored eth-infinitism v0.6 lib

**Decision**: Add the paymaster-side files to `contracts/account/lib/account-abstraction/`
(currently only `IAccount`, `UserOperation`, `Helpers` are vendored): `interfaces/IPaymaster.sol`,
`interfaces/IEntryPoint.sol` (+ `IStakeManager`, `INonceManager` as its deps),
`core/BasePaymaster.sol`. Implement `contracts/account/FairWinsVerifyingPaymaster.sol` on top.

**Rationale**: Keeps the paymaster on the **same** vendored v0.6 interfaces as the account, so the
`UserOperation` struct and `EntryPoint` address are identical. Minimal, standard, reviewable.

**Alternatives considered**: pulling `@account-abstraction/contracts` as an npm dep — rejected to
avoid a second, possibly-divergent copy of the v0.6 interfaces already vendored for the account
(constitution V: consistency), and to keep the audited surface in-repo.

## 4. Signature model & replay protection — minimal, own-storage-free

**Decision**: The signer signs `keccak256(pack(userOp-without-sig/paymasterData, chainId,
address(paymaster), validUntil, validAfter))`; the contract recomputes it, `ecrecover`s, and checks
`== verifyingSigner`, returning `_packValidationData(sigFailed, validUntil, validAfter)`. **No
`senderNonce` mapping** — replay is prevented by the **account's own EntryPoint nonce** (a signed
op can't be re-executed) plus the short validity window.

**Rationale**: Dropping `senderNonce` means `validatePaymasterUserOp` touches **no storage at all**
(pure signature check), which is the safest ERC-4337 validation posture (see §6). The account nonce
already makes a given userOpHash single-use.

## 5. Signing service — KMS-backed signer in the relay-gateway

**Decision**: The relay-gateway gains a **sponsorship signer**: a Google Cloud **KMS** key whose
Ethereum address is the paymaster's `verifyingSigner`. The gateway computes the hash, calls KMS to
sign the digest, assembles `paymasterAndData`, and returns it. The OZ engine is unchanged.

**Rationale**: The gateway is where policy already lives (screening/quotas/killswitch), and it must
return a **signature to the client**, not submit a tx (which is all the engine does). A scoped KMS
signer matches the relayer gas-key custody class (hot key, never committed) and is the smallest
addition. `deriveAddress(KMS pubkey)` → set as `verifyingSigner` at deploy; rotation = `setSigner`
(owner) + config swap.

**Alternatives considered**: engine-side signing (engine signs txs, not hashes — poor fit); a
separate signer microservice (new footprint — forbidden).

## 6. ERC-4337 validation-rule safety & staking

**Decision**: Validation is **signature-only, zero-storage** (§4), so it satisfies ERC-7562 for any
bundler. Our alto runs `ALTO_SAFE_MODE=false` (rules unenforced) today, but designing to the rules
keeps the paymaster **portable to public-bundler fallbacks**. **Deposit is required** (funds the
sponsorship); **stake is optional** now (our own bundler doesn't require it) and becomes needed only
if a public/reputation-enforcing bundler is added — noted in the runbook.

## 7. Never-stranded / fail-open mechanics

**Decision**: Sponsorship is best-effort and always degrades to self-submit:
- Gateway refuses (killswitch/sanctions/quota/gas-ceiling) → HTTP 4xx/503; endpoint unreachable →
  network error. In **all** cases the frontend rebuilds the bundler client **without** a paymaster
  and submits self-funded (account pays native), exactly as the intent path falls back to
  `selfSubmit()` (`useIntentAction.js`).
- If the account also lacks native token to self-fund, the confirm UI states the shortfall (no
  false "free", no dead-end) — matches spec FR-007/FR-008.

**Rationale**: Preserves the platform-wide never-stranded guarantee and mirrors the existing
relayer fallback exactly.

## 8. Concrete limit values (ops-tunable via env, like `SIGNER_QUOTA_PER_MIN`)

Starting values; each is an env knob so ops can tune without redeploy. Chosen to make US3 testable
and to bound worst-case spend.

| Knob | Start value | Env | Rationale |
|---|---|---|---|
| Per-account burst | 6 sponsored ops / min / account | `PM_ACCOUNT_QUOTA_PER_MIN` | ~matches `SIGNER_QUOTA_PER_MIN=12`, halved (sponsored is costlier). |
| Per-account daily | 25 sponsored ops / account / day | `PM_ACCOUNT_QUOTA_PER_DAY` | Generous for real use; caps a single account's daily draw. |
| **Per-op cost ceiling** | ≤ 2.0 native (MATIC) per op | `PM_MAX_COST_WEI` | Bounds one op's worst-case cost regardless of gas units; covers first-deploy+transfer even in a spike. Signer refuses ops whose `totalGasLimit × maxFeePerGas` exceeds it. |
| Per-op gas-units sanity | ≤ 3,000,000 gas | `PM_MAX_GAS` | Rejects absurd ops; deploy+transfer is < ~2M. |
| Global rate | 500 sponsored ops / day | `PM_GLOBAL_QUOTA_PER_DAY` | Platform-wide aggregate bound. |
| Deposit (hard cap) | 100 MATIC initial, refill on runway alert | ops runbook | Max loss ceiling (spec FR-013). |
| Runway warning | < 48 h at current burn | `PM_RUNWAY_WARN_HRS` | Surfaced with the alto-executor + relayer gas-wallet runway (spec FR-019). |

## 9. Reuse map (no new service)

| Need | Reused from |
|---|---|
| Sanctions screen the account | `services/relay-gateway/src/policy/sanctions.js` (`screen.screen`) |
| Per-account + global quota | `policy/quotas.js` (parameterized with paymaster knobs) |
| Killswitch | `policy/killswitch.js` |
| Origin-lock + CORS | `server.js` (already applied to `/v1/*`, incl. PR #857 bundler CORS parity) |
| Gas-wallet runway telemetry | `/status` health (`gasWalletRunwayHrs`) → add `paymasterDepositRunwayHrs` |
| Deploy + record + verify | `scripts/deploy/deploy-account-stack.js` sibling + `deployments/<net>.json` + `verify.js` |
| Frontend paymaster client | `frontend/src/lib/passkey/smartAccount.js` (`createPaymasterClient` already wired) |

**Output**: all NEEDS CLARIFICATION resolved; ready for Phase 1 design.

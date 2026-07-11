# Implementation Plan: Sponsored Paymaster for Passkey Smart Accounts

**Branch**: `050-sponsored-paymaster` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/050-sponsored-paymaster/spec.md`

## Summary

Make passkey smart-account (spec 041) UserOperations gasless by having **FairWins sponsor
the gas through a paymaster it owns and operates** — no third party. The design reuses both
existing services and adds one small on-chain contract:

1. **`FairWinsVerifyingPaymaster`** — a minimal ERC-4337 **v0.6** verifying paymaster
   (EntryPoint `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`). It sponsors a UserOp iff
   `paymasterAndData` carries a valid signature from the off-chain **sponsorship signer** over
   the op + validity window. Validation is **signature-only** (no external/forbidden storage),
   so no stake is required for our own bundler. FairWins funds its EntryPoint **deposit**; the
   deposit is the hard exposure cap.
2. **Relay-gateway ERC-7677 endpoint** (`pm_getPaymasterStubData` / `pm_getPaymasterData`) —
   extends the existing spec-036 policy gateway. It runs the **same policy** (killswitch,
   sanctions screening on the account, per-account + global quotas) plus a **per-operation
   sponsored-cost ceiling**, then signs the paymaster hash with a **KMS** key (same custody class
   as the relayer gas key) and returns `paymasterAndData`. No new always-on service.
3. **alto bundler** — unchanged; it submits the now-sponsored UserOp.
4. **Frontend** — the passkey path already builds a viem paymaster client from a configured URL;
   point it at the gateway endpoint, add a **never-stranded fallback** (retry without paymaster,
   self-funded) and **honest fee disclosure** (truthful "sponsored — free" only when sponsorship
   actually applies).

Primary outcome: a passkey user holding **zero native token** completes USDC and MATIC transfers
(and controller changes, first-use deploy) at no cost, and the "sponsored" claim finally becomes
true — while the deposit is protected from drain by defense-in-depth limits and a killswitch.

## Technical Context

**Language/Version**: Solidity (match the vendored AA v0.6 pragma / `contracts/account/**`,
`^0.8.23`); Node.js (existing relay-gateway, ESM); React + Vite (frontend).

**Primary Dependencies**: eth-infinitism `account-abstraction` **v0.6** interfaces (already
partially vendored under `contracts/account/lib/account-abstraction/`; this feature adds the
paymaster-side files); Hardhat; `viem` (`viem/account-abstraction` `createPaymasterClient` /
`createBundlerClient`, already used in `frontend/src/lib/passkey`); Express + `ethers` (gateway);
**Google Cloud KMS** (sponsorship signer — same pattern as the relayer gas key).

**Storage**: On-chain EntryPoint **deposit** (sponsorship funds). Gateway policy state is the
existing in-memory quota/killswitch (no DB). No new persistent store.

**Testing**: Hardhat unit + **fork** tests (real EntryPoint v0.6 on a Polygon fork, sponsor a
real UserOp end-to-end); relay-gateway tests (mirror `services/relay-gateway/test/`); Vitest for
frontend (fallback + fee disclosure). Slither + Medusa on the new contract.

**Target Platform**: Polygon 137 (production), Polygon Amoy 80002 (validation network). EVM,
EntryPoint v0.6. ETC/Mordor deferred (no paymaster deployed → honest self-submit).

**Project Type**: Web — smart contract + backend-service extension (relay-gateway) + frontend.

**Performance Goals**: Sponsorship decision + signature p95 < 500 ms (dominated by one KMS
sign). Low v1 throughput (bounded by quotas). Not a high-QPS path.

**Constraints**: EntryPoint **v0.6** (do not migrate accounts/bundler — preserves deployed
account addresses). **No new always-on service** (extend the relay-gateway only — the
spec-036/041 "can censor, cannot steal" exception). **Fail-open to self-submit** (never-stranded).
Per-op validation MUST be signature-only (ERC-4337 validation rules; portable to public bundlers).
Bounded deposit is the hard loss ceiling.

**Scale/Scope**: One small contract (~2 files + ~4 vendored interface files), one gateway
endpoint + policy check, one frontend config/UX change, deploy + fund + monitor. Low volume at
launch; limits are ops-tunable via env (like the existing `SIGNER_QUOTA_PER_MIN`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| **I. Security-First Contracts (NON-NEGOTIABLE)** | **PASS (with required gates)** | New value-bearing contract (holds a MATIC deposit). It is a minimal, standard **verifying paymaster**: CEI-clean, no external calls in validation, withdrawal **owner-only** (floppy keystore), signature-only validation. Requires Slither + Medusa (no new high/critical) and the smart-contract security-agent review before merge — enumerated in tasks. Targets EthTrust **L2**. Highest-risk surfaces (fund custody = the deposit, access control = `owner`/`verifyingSigner`) reasoned about in [research.md](./research.md) and [contracts/paymaster-contract.md](./contracts/paymaster-contract.md). |
| **II. Test-First & Coverage (NON-NEGOTIABLE)** | **PASS** | Contract unit tests (valid/invalid sig, time window, tamper, replay via account nonce, deposit withdraw auth); **fork** test sponsoring a real UserOp against EntryPoint v0.6; gateway policy tests (screen/quota/killswitch/gas-ceiling/fail-open); frontend Vitest (fallback + honest disclosure). Interface change → tests in same PR. |
| **III. Honest State, No Placeholders** | **PASS (this feature enforces it)** | Replaces the currently-false "Gasless · sponsored / no network fee" badge with a truthful one; discloses the real cost; network-scoped (paymaster per network); no mocks in shipped paths. |
| **IV. Fail Loudly in CI** | **PASS** | No `continue-on-error` on lint/build/test/security. Security scans gate the contract. |
| **V. Accessible, Consistent Frontend** | **PASS** | Confirm-screen fee disclosure meets WCAG 2.1 AA; the paymaster **address + config** flow through the generated sync artifacts + `deployments/`, never hand-copied. |
| **Additional — Key management** | **PASS** | Paymaster **owner** (deploy/withdraw) = air-gapped floppy keystore; sponsorship **signer** = KMS hot key (like the relayer gas key). No secrets committed; `.env.example` documents new vars. |
| **Additional — Deployments** | **PASS** | Deterministic deploy script + `deployments/<net>.json` records `verifyingPaymaster` (+ signer address, EntryPoint). |
| **Governance — supersedes spec 041 FR-015** | **Documented deviation (not a constitution violation)** | Spec 041 chose "FairWins deploys no paymaster." This spec intentionally supersedes that **for the passkey UserOp path only** (spec FR-021). Logged in Complexity Tracking. |

**Gate result: PASS.** One documented deviation (superseding a prior *spec* decision, not a
constitution principle) recorded below. No unjustified complexity.

## Project Structure

### Documentation (this feature)

```text
specs/050-sponsored-paymaster/
├── plan.md              # This file
├── research.md          # Phase 0: paymaster type, v0.6 wiring, KMS signing, limits, staking
├── data-model.md        # Phase 1: entities (sponsorship request/approval/policy/pool/signer)
├── quickstart.md        # Phase 1: end-to-end validation guide (fork + Amoy)
├── contracts/           # Phase 1:
│   ├── paymaster-contract.md      # on-chain interface + validation behavior
│   ├── gateway-paymaster-api.md   # ERC-7677 endpoint contract + policy pipeline
│   └── frontend-config.md         # config vars + fee-disclosure/fallback UX contract
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── account/
│   ├── FairWinsVerifyingPaymaster.sol      # NEW — v0.6 verifying paymaster
│   └── lib/account-abstraction/
│       ├── core/BasePaymaster.sol          # NEW (vendored, v0.6)
│       └── interfaces/                      # NEW (vendored, v0.6):
│           ├── IPaymaster.sol
│           ├── IEntryPoint.sol             # (+ IStakeManager, INonceManager as needed)
│           └── ...
test/account/
├── VerifyingPaymaster.test.js              # NEW — unit
└── fork/VerifyingPaymaster.fork.test.js    # NEW — fork: sponsor a real UserOp (EP v0.6)

services/relay-gateway/src/
├── paymaster/
│   ├── sign.js          # NEW — KMS sign of the v0.6 paymaster hash → paymasterAndData
│   ├── build.js         # NEW — hash/pack per the contract; stub-data for estimation
│   └── policy.js        # NEW — per-op cost ceiling (reuses screen/quotas/killswitch)
├── server.js            # +2 routes: pm_getPaymasterStubData / pm_getPaymasterData
└── config/index.js      # + PAYMASTER_ADDRESS_<id>, KMS signer key ref, ceilings, quotas
services/relay-gateway/test/paymaster.test.js   # NEW — policy + signing + fail-open

frontend/src/
├── config/networks.js               # rename erc20PaymasterUrl → sponsorPaymasterUrl (+ env)
├── lib/passkey/smartAccount.js      # paymaster client wiring (already ~90% present)
├── lib/passkey/sendBatch.js         # NEW never-stranded fallback (retry w/o paymaster)
├── hooks/useTransfer.js             # honest route/fee state (drop assumed 'sponsored')
└── components/wallet/{TransferForm,PasskeyConfirm}.jsx   # honest fee disclosure

scripts/deploy/
├── deploy-verifying-paymaster.js    # NEW — deploy + record + (deposit via ops runbook)
└── (verify.js, sync)                # extend to list/verify the paymaster

docs/
├── developer-guide/passkey-accounts.md   # add the sponsorship section
└── runbooks/paymaster-operations.md      # NEW — fund deposit, rotate signer, killswitch, runway
```

**Structure Decision**: Extends the existing three-surface layout (contracts / relay-gateway
service / frontend) established by specs 036 + 041. The paymaster contract lives beside the
account stack (`contracts/account/`); the sponsorship endpoint is a module inside the existing
`services/relay-gateway`; the frontend change is confined to the passkey submission + confirm
path. No new deployable service or top-level package is introduced.

## Complexity Tracking

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Supersede spec 041 FR-015** ("FairWins deploys no paymaster / sponsors nothing") | Passkey transfers are broken for native-token-less users and the product already advertises them as sponsored; the only ERC-4337 way to reimburse the bundler for the user is a paymaster, and the user rejected third parties. | *Third-party paymaster* — explicitly rejected by the product owner (self-managed requirement). *Native self-funding* — is the current broken state (AA21). *Relayer-only* — cannot move a smart account's native token, and native USDC won't accept ERC-1271 EIP-3009. |
| **New value-bearing contract** (paymaster deposit) | ERC-4337 requires an on-chain paymaster to sponsor gas. | No on-chain alternative exists; the contract is the minimal standard verifying paymaster. |
| **Add a signing capability to the gateway** (it currently only forwards to the engine) | The paymaster needs an ECDSA **signature returned to the client**, not a submitted tx; the OZ engine signs+submits txs, not arbitrary hashes. | Extending the engine to sign hashes is a larger change to sanctioned infra; a scoped KMS signer in the gateway (same custody class) is smaller and keeps the engine unchanged. |
| **Extend the relay-gateway** (footprint) | Reuses screening/quotas/killswitch/origin-lock/CORS already built; avoids a new service. | A standalone paymaster service would add footprint the no-backend constraint forbids; extending the already-sanctioned gateway is the smallest change (YAGNI). |

## Phase 0 — Research

See [research.md](./research.md). Resolves: paymaster **type** (verifying/sponsoring vs. ERC-20 —
sponsoring chosen); **v0.6** wiring with a self-hosted bundler; **KMS** signing of the v0.6
paymaster hash; **staking** need (none for own bundler; optional later); ERC-4337 **validation-rule
safety**; **concrete limit values** (per-account rate, per-op cost ceiling, global cap, deposit
size, runway threshold); and the **fail-open / never-stranded** mechanics.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — sponsorship request/approval/policy/pool/signer + fee
  disclosure, their fields, lifecycle, and validation rules.
- [contracts/paymaster-contract.md](./contracts/paymaster-contract.md) — the on-chain interface
  (`validatePaymasterUserOp`, deposit/withdraw, `setSigner`), the signed-hash preimage, and the
  `paymasterAndData` layout.
- [contracts/gateway-paymaster-api.md](./contracts/gateway-paymaster-api.md) — the ERC-7677
  JSON-RPC endpoint, request/response, and the policy pipeline order (mirrors `/v1/intents`).
- [contracts/frontend-config.md](./contracts/frontend-config.md) — config vars, the paymaster-client
  wiring, the never-stranded fallback state machine, and the honest fee-disclosure contract.
- [quickstart.md](./quickstart.md) — runnable end-to-end validation (fork first, then Amoy).

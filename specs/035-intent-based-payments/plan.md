# Implementation Plan: Intent-Based Signatures (Platform-Wide Gasless UX)

**Branch**: `035-intent-based-payments` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/035-intent-based-payments/spec.md`

## Summary

Let users authorize every core action by signing a single off-chain intent — no separate approval, no native gas token — with the on-chain effect always attributed to the signer. The design **generalizes and activates two patterns already in the codebase** (the EIP-3009 `ZKWagerPool.joinWithAuthorization` payment path and the open-challenge EIP-712 verifier), rather than adopting a shared meta-transaction forwarder.

Technical approach (from research):
1. **One shared mixin** `contracts/upgradeable/SignerIntentBase.sol` (EIP-712 + a 2-D per-signer replay-nonce `authorizationState` map in **ERC-7201 namespaced storage** + `_verifyIntent` + `invalidateNonce`), inherited by the two upgradeable proxies — like `EIP712Upgradeable`, it adds **zero sequential storage slots**, so it is safe to add as a base to the live proxies.
2. **~16 signer-attributed twin entrypoints** (`…WithSig` for no-stake actions; `…WithAuthorization` carrying an EIP-3009 `receiveWithAuthorization` for money-in), each recovering the signer and running every existing screening/membership/ownership check against that **signer**, in one atomic transaction. Every existing function is kept as the **self-submit fallback** (identical on-chain result).
3. **Atomic fee-netting** via a second `receiveWithAuthorization` (bounded fee) settled on-chain to a segregated fee recipient — never the relayer, never off-chain-accounted.
4. Shipped as **in-place UUPS upgrades** of `WagerRegistry` (spec 025) and `MembershipManager` (spec 027) — the nonce map is namespaced (zero gap), so the only sequential append is the fee-netting scalars (2 slots each; `__gap` decremented by 2), passing `check:storage-layout`. Deployed `ZKWagerPool` clones are immutable; creator-only pool actions get signer-attributed variants only in a **future pool template** (`factory.setTemplate`), while join/vote/claim are already relayable.
5. **Frontend**: a shared `frontend/src/lib/relay/` intent client (sign EIP-712 / EIP-3009, one signature), honest status via spec 031 activity (never "done" before inclusion, WCAG 2.1 AA), and a `useIntentAction` hook that enforces the never-stranded self-submit fallback.

Rollout is staged **Amoy → Mordor (no-stake only) → Polygon (after the 025/027 UUPS migration)**; this feature is the contract-and-frontend foundation that spec 036's relayer submits against.

## Technical Context

**Language/Version**: Solidity 0.8.24 (contracts); React 19 + Vite (frontend); Hardhat as the contract test runner. Optimizer on, viaIR off.

**Primary Dependencies**: OpenZeppelin Contracts(-Upgradeable) — repo-current 5.x (standing directive: keep latest; `EIP712Upgradeable`, `ECDSA`, `UUPSUpgradeable` via `UUPSManaged`, `ReentrancyGuardUpgradeable`, `SafeERC20`, `Clones`); `@openzeppelin/hardhat-upgrades` (drives `validateUpgrade`/`upgradeProxy`); ethers v6; EIP-3009 `receiveWithAuthorization`/`cancelAuthorization` on the platform stablecoin (native Circle USDC / Amoy faucet USDC; `MockUSDCPermit` in tests); reused `SanctionsGuard` + `MembershipManager` compliance controls (FR-022); spec 031 activity store; spec 036 relayer gateway API. New artifact: `contracts/upgradeable/SignerIntentBase.sol`.

**Storage**: On-chain proxy storage, **append-only with trailing `__gap`**. The per-signer nonce map (`mapping(address => mapping(bytes32 => bool))`) lives in `SignerIntentBase`'s **ERC-7201 namespaced** storage — zero gap cost, safe as a new base (like `EIP712Upgradeable`). The only sequential append is the fee-netting scalars (`feeNettingEnabled`+`gasFeeRecipient` pack into one slot, `maxGasFee` a second = **2 slots**) on the payment-carrying contracts ⇒ `WagerRegistry` `__gap` 48→46; `MembershipManager` 49→47. Payment-leg replay state lives in the stablecoin (EIP-3009), not in FairWins. `deployments/<net>.json` is the address of record (proxy keys stable; `…Impl` keys updated). Frontend uses the client-side spec 031 store — **no application backend** (FR-017/SC-008).

**Testing**: Hardhat unit/`integration/`/`fork/`; Slither + Medusa + `.github/agents/` security review; `npm run check:storage-layout` (gating) before each upgrade; Vitest for the frontend; axe/Lighthouse WCAG 2.1 AA in CI (SC-010). Add `cancelAuthorization` to `MockUSDCPermit` so FR-006 payment-leg invalidation is testable.

**Target Platform**: Polygon Amoy 80002 (first target, full flow), Mordor/ETC 63 (no-stake intents only until USC gains EIP-3009; only network with a live pool factory), Polygon mainnet 137 (flagship, blocked until the 025/027 UUPS migration deploys fresh proxies). Browser SPA on nginx/Cloud Run (fixed footprint).

**Project Type**: Web — Solidity contracts (in-place UUPS upgrades + one shared mixin + a future pool template) + React/Vite SPA + subgraph. No new backend (the submitter is spec 036's relayer or the user's own wallet).

**Performance Goals**: money-in flows drop from 2 signatures + 1 approval to **1 signature, 0 approvals** (SC-002); no-stake flows drop from 1 gas tx to **1 signature, 0 native gas** (SC-009); zero-native-balance wallets complete create/accept/claim/pool-join/membership end-to-end (SC-001); per-payment-proxy storage grows by exactly two gap slots (fee-netting scalars; the nonce map is namespaced, zero gap); **zero successful replays** (SC-004).

**Constraints**: append-only storage + `__gap`, pass `check:storage-layout`; checks-effects-interactions + `nonReentrant` on every value path; screen the **signer** fail-closed, reuse existing compliance/membership (FR-003/FR-022); money leg is `receiveWithAuthorization` only (never `transferWithAuthorization`), atomic with the action (FR-007); untrusted-relayer posture "can censor, cannot steal" (FR-013); per-contract EIP-712 domain enforcing chainId + verifyingContract isolation (FR-005/FR-021); deployed pool clones immutable (creator-action gasless only for future-template pools, FR-009); native-vs-bridged USDC domain-version config-driven with a client-side pre-sign check (FR-020); WCAG 2.1 AA for new UI (FR-023); admin keys stay on the air-gapped floppy flow; no new backend (FR-017/SC-008).

**Scale/Scope**: 2 UUPS upgrades + 1 shared mixin + 1 future pool template; ~16 signer-attributed entrypoints (each with a self-submit twin); ~12 frontend call sites migrated to `useIntentAction`; 1 new `frontend/src/lib/relay/` module + `IntentStatus.jsx`; 3 networks, staged rollout; covered scope = FR-008–FR-010 P1/P2 core (FR-011/FR-012 best-effort, excluded from 100%-style SCs).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| **I. Security-First Smart Contracts (NON-NEGOTIABLE)** | New value-bearing contract code: a signature/nonce mixin + ~16 entrypoints + atomic payment-and-action + fee settlement. All follow CEI + `nonReentrant`; every check evaluates the recovered **signer** (FR-003); replay is impossible (2-D nonce single-use, checked before effects); payment is `receiveWithAuthorization` (sender-bound, not front-runnable). Requires the mandated Slither + **Medusa fuzzing** (intent replay, cross-contract nonce isolation, atomicity, fee bounds) + `.github/agents/` review; target EthTrust L2. | **PASS** (security review + fuzzing mandatory) |
| **II. Test-First & Coverage (NON-NEGOTIABLE)** | Unit/integration/fork tests for every new entrypoint incl. replay rejection, invalidation (FR-006), fail-closed signer screening, atomic payment+action, fee-netting decline, and the self-submit twin producing an identical result; storage-layout gate before upgrade. | **PASS** |
| **III. Honest State, No Placeholders** | Honest status (never "done" before inclusion, FR-018/SC-007); network isolation via per-contract EIP-712 domain (FR-021); self-submit is real, reusing shipping code; the Mordor gasless-payment gap is surfaced truthfully, not faked. | **PASS** |
| **IV. Fail Loudly in CI** | `check:storage-layout`, Slither, Medusa, axe/Lighthouse are gating; no `continue-on-error` on lint/test/build/security. | **PASS** |
| **V. Accessible, Consistent Frontend** | New intent UI (`IntentStatus`, feed entries, error surfaces) meets WCAG 2.1 AA (FR-023/SC-010), reusing spec 031's severity→aria-live plumbing; addresses/ABIs from synced artifacts. | **PASS** |
| **Upgradeable-contract rules** (CLAUDE.md / ADR-004) | Inherit `UUPSManaged`; one-time `reinitializer`; **append-only** storage with `__gap` decrement; ship as in-place `upgradeProxy`, never a fresh redeploy; record `…Impl` in `deployments/`. All followed. | **PASS** |
| **Latest OZ across features** (standing directive) | Uses the repo-current OZ 5.x; adds no OZ-4-only deps. | **PASS** |
| **No backend / fixed footprint** | 035 adds **no backend** — it is contracts + frontend only; the submitter is external (spec 036 relayer or self-submit). | **PASS** |
| **Key management** | Admin/upgrade keys stay on the air-gapped floppy flow; 035 introduces no server key (the hot key belongs to spec 036). | **PASS** |

**Gate result: PASS** — no violations requiring Complexity Tracking. The design stays within the constitution by reusing existing patterns (EIP-712 verifier, `joinWithAuthorization`, `_screen`, membership gates, spec 031 activity) rather than adding new paradigms or infrastructure. Re-checked after Phase 1: unchanged.

Three highest-risk surfaces flagged for explicit security reasoning (Principle I): (a) the **replay/nonce layer** (cross-contract isolation, invalidation correctness), (b) **atomicity** of payment-leg + action + fee (no partial state, no funds stranded), and (c) **signer-threading completeness** (every `msg.sender`-based check enumerated in research Track A4 must be converted — a missed one is a compliance or impersonation bug).

## Project Structure

### Documentation (this feature)

```text
specs/035-intent-based-payments/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — signer-attribution, payment/fee, upgrade/storage, frontend
├── data-model.md        # Phase 1 — intent structs, nonce/authorizationState, fee state, client shape
├── quickstart.md        # Phase 1 — runnable validation guide
├── contracts/           # Phase 1 — EIP-712 schemas + new entrypoint ABIs
│   ├── intent-eip712-schemas.md
│   └── withsig-entrypoints.md
├── checklists/requirements.md   # /speckit-specify + /speckit-clarify output
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── upgradeable/
│   ├── UUPSManaged.sol              # existing base (unchanged)
│   └── SignerIntentBase.sol         # NEW — EIP712 + 2-D nonce authorizationState (ERC-7201 namespaced, 0 gap) + _verifyIntent + invalidateNonce
├── wagers/
│   └── WagerRegistry.sol            # UPGRADE — inherit SignerIntentBase; add *WithSig / *WithAuthorization twins;
│                                    #   append fee scalars (2 slots; nonce map namespaced); __gap 48→46
├── access/
│   └── MembershipManager.sol        # UPGRADE — add EIP712 + SignerIntentBase; reinitializer(2);
│                                    #   *WithSig / *WithAuthorization twins; append fee scalars (2 slots; nonce map namespaced); __gap 49→47
├── pools/
│   └── ZKWagerPool.sol              # NEW TEMPLATE (future clones only) — proposeOutcomeFor/closeJoiningFor/cancelFor/refundFor
│                                    #   (deployed clones unchanged; join/vote/claim already relayable)
└── mocks/
    └── MockUSDCPermit.sol           # add cancelAuthorization for FR-006 payment-leg tests

test/                                # unit + integration + fork: intents, replay, invalidation, atomic payment,
                                     #   fail-closed signer screening, fee-netting decline, self-submit twins

frontend/src/
├── lib/relay/                       # NEW — intentClient.js, intentTypes.js, useIntentAction.js (never-stranded rule)
├── components/intents/IntentStatus.jsx  # NEW — honest status, WCAG 2.1 AA
├── config/networks.js              # add domainVersion per stablecoin (native '2' / bridged '1')
└── (hooks/components migrated to useIntentAction: create/accept/claim/refund/cancel/draw/decline,
    pool join/vote/claim, membership purchase/upgrade/extend, voucher mint/redeem)

scripts/deploy/                      # upgradeProxy via lib/upgradeable.js; record …Impl in deployments/<net>.json
```

**Structure Decision**: One shared mixin (`SignerIntentBase`) plus in-place upgrades of the two existing proxies; a future pool template for the immutable clones; a single new frontend relay module + one status component + per-flow call-site migrations. This matches research §A1 (shared mixin), §C (append-only upgrades + template swap), and §D (shared client + self-submit twins), and keeps the change surface additive — no proxy repoints, no backend, no new core technology.

## Complexity Tracking

No constitution violations require justification. Two design choices worth recording (not violations):

| Choice | Why | Alternative rejected |
|--------|-----|----------------------|
| New shared mixin `SignerIntentBase` (ERC-7201 **namespaced** storage) | Defines nonce/EIP-712/invalidation once, audited once; both proxies and the future pool template reuse it. Namespaced storage means adding it as a base to the live proxies shifts **no** existing slots (like `EIP712Upgradeable`). | Per-contract copy-paste of the nonce+verify logic — duplicated audit surface, drift risk (the one-off `OPEN_ACCEPT_TYPEHASH` is exactly this smell); or declaring the map in each derived contract (needs virtual accessors + consumes a gap slot per proxy — more moving parts, no benefit). |
| Fee-netting via a **second** EIP-3009 authorization to a segregated recipient | Keeps settlement atomic and on-chain, and the relayer/hot key non-custodial (spec 035 FR-016; spec 036 SC-015). | Netting the fee into the stake authorization (co-mingles funds, complicates refunds) or off-chain fee accounting (custodial drift — forbidden). |

**Sequencing note (constraint, not a violation):** Polygon mainnet is pre-UUPS (non-proxy) and cannot be upgraded in place; the flagship P1 flow ships on Polygon only after the 025/027 UUPS migration deploys fresh proxies. Amoy is the first full-flow target; Mordor gets no-stake intents only (USC lacks EIP-3009).

# Quickstart & Validation: Intent-Based Signatures (Spec 035)

Runnable guide to validate the gasless intent layer end-to-end. Implementation detail lives in `tasks.md` (Phase 2) and code; this is the validation/run guide. See `contracts/` and `data-model.md` for schemas.

## Prerequisites

- Repo toolchain: `npm ci`, Hardhat, Vitest.
- A local Hardhat chain (or Amoy 80002) with the UUPS proxies upgraded to the 035 implementations (see rollout below) and an EIP-3009 token deployed — use `contracts/mocks/MockUSDCPermit.sol` (add `cancelAuthorization` first, per research Track B4) as the test token; on Amoy use the faucet USDC.
- A test wallet funded with the stablecoin and **zero native gas** (to prove SC-001).
- Spec 036's relay gateway running for the relayed path (`VITE_RELAYER_URL` set); with it unset, flows self-submit.

## Contract validation (Hardhat)

```bash
npm run compile
npm test                     # unit + integration incl. the new intent suites
npm run test:fork            # fork tests where oracles/tokens are involved
npm run check:storage-layout # MUST pass — append-only upgrade gate (gating in CI)
```

| # | Scenario | Expected (FR/SC) |
|---|----------|------------------|
| 1 | Relayed `createWagerWithAuthorization` from a **zero-native** wallet | Wager created, `creator == signer`, stake escrowed from signer, no approval tx (SC-001/SC-002/SC-003) |
| 2 | Relayed `acceptWagerWithAuthorization` | `opponent == signer`, stake escrowed (SC-003) |
| 3 | Relayed `claimPayoutWithSig` from a zero-native winner | Payout to the winning signer, no native gas (SC-009) |
| 4 | **Replay**: submit the same intent twice | Second reverts `IntentReplayed`; single on-chain effect (SC-004) |
| 5 | **Invalidation**: `invalidateNonce` then submit that intent | Submission reverts; no effect (FR-006) |
| 6 | **Expiry**: submit after `validBefore` | Reverts; no funds move (SC-004) |
| 7 | **Network isolation**: replay an Amoy-signed intent on another chain/contract | Reverts (wrong domain) (FR-021) |
| 8 | **Fail-closed screening**: sanctioned `signer` (guard flags it); guard unreachable | Reverts; never executes for a sanctioned signer, never on guard outage (SC-006) |
| 9 | **Atomicity**: force the action leg to revert after the payment pull | Whole tx reverts; no stake stranded, nonce not consumed (FR-007) |
| 10 | **Fee-netted**: fee auth ≤ `maxGasFee` → fee to `gasFeeRecipient`; est. gas > cap | Fee settles to the segregated recipient atomically; over-cap declines before funds move (FR-016) |
| 11 | **Self-submit twin**: run the existing `createWager`/`claimPayout` directly | Identical on-chain result to the relayed twin (SC-005) |
| 12 | **Payment invalidation**: `cancelAuthorization` then relay | `receiveWithAuthorization` reverts `AuthorizationUsed` (FR-006) |

## Frontend validation (Vitest + axe/Lighthouse)

```bash
npm run test:frontend
# accessibility gate (WCAG 2.1 AA) over IntentStatus + activity feed entries — SC-010
```

| # | Scenario | Expected |
|---|----------|----------|
| 13 | Money-in flow via `useIntentAction` | One signature, no approve step; status shows `submitted-pending` then `confirmed` **only after inclusion** (SC-002/SC-007/FR-018) |
| 14 | Relayer unset / `RelayerUnavailable` / `payment_unsupported_on_chain` | Transparent self-submit; identical result; no dead end (FR-014/SC-005) |
| 15 | Wrong USDC domain (bridged `"1"` where `"2"` expected) | Specific pre-sign error → self-submit; no silent failure (FR-020) |
| 16 | Mordor (USC, no EIP-3009): money-in vs no-stake | Money-in → self-submit; no-stake intents relay normally (research C4) |

## Rollout (staged, per research C3/C4)

1. **MembershipManager** upgrade first (adds EIP712 + `reinitializer(2)`) → `check:storage-layout` → `upgradeProxy` → record `membershipManagerImpl`.
2. **WagerRegistry** upgrade (P1 create/accept, then P2 claim/refund/draw) → record `wagerRegistryImpl`.
3. **New pool template** + `factory.setTemplate` where pools are live → record `poolImpl`.
4. Sequence networks **Amoy (full) → Mordor (no-stake only) → Polygon (after 025/027 UUPS migration)**.

## Definition of done (validation)

Scenarios 1–16 pass on Amoy; `check:storage-layout` and the security gates (Slither/Medusa) are green; Mordor scenarios document the payment gate honestly; every covered flow has a working self-submit twin.

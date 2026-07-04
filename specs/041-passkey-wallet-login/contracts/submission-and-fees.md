# Interface Contract: Submission Routing & Fees

Provider: `frontend/src/lib/passkey/submission.js` + per-network
`SubmissionRoute` config (data-model). Depends on deployed 035 intents and
the 036 relayer (plan.md sequencing decision).

## Routing decision table

For every write from a passkey account:

| Condition | Route | User cost |
|---|---|---|
| Action has an 035 intent type AND relayer healthy | **Intent**: WebAuthn ceremony → ERC-1271 account signature over the intent (types imported from `frontend/src/lib/relay/intentTypes.js` — three-way byte-identical rule) → submit/track via `frontend/src/lib/relay/intentClient.js` / `useIntentAction.js` to `services/relay-gateway`. Requires the ERC-1271 enablement of `SignerIntentBase` + gateway `verify.js` (research.md §11, tasks T011/T014) | no network fee (035 posture) |
| Account-native op (deploy-on-first-action initCode, add/remove controller, upgrade) | **UserOp** via bundler list (self-hosted alto first, third-party fallback) | fee in USDC via ERC-20 paymaster when configured, else native token |
| 035-covered action BUT relayer unhealthy/back-pressuring | **UserOp fallback** executing the same on-chain call directly (FR-013) | as above |
| Both intent and UserOp paths down | surface `SubmissionUnavailable` with retry-after; never spin, never silently queue (FR-017) | — |

Health detection: bounded-time probe/timeout per endpoint (FR-017); relayer
back-pressure (036 retry-after) triggers the fallback offer, mirroring 036's
self-submit UX for EOAs.

## Fee disclosure & fallback (FR-008/FR-014, clarification Q3)

- Every ceremony shows: action, amount, counterparty (when applicable), and
  **fee in stablecoin terms** (0 for relayed intents; quoted for UserOps).
- Stablecoin fee path unavailable ⇒ offer exactly: (a) pay this action's fee
  in native token from the account balance (with acquisition guidance), or
  (b) wait/retry. A third-party fee-service outage MUST never be the sole
  reason a user cannot reach funds.
- Pre-flight balance check produces `InsufficientFeeBalance` with the exact
  shortfall (edge case "insufficient balance for fees").

## Bundler endpoint contract (ops, extends 036 deployment)

- Self-hosted **alto** exposes the standard ERC-4337 RPC
  (`eth_sendUserOperation`, `eth_estimateUserOperationGas`,
  `eth_getUserOperationReceipt`, `eth_supportedEntryPoints`) per network,
  deployed alongside `services/relay-gateway` + `services/oz-relayer` behind
  the same edge perimeter and origin-lock (036 FR-029 posture); rate-limited
  and monitored under the relayer-operations runbook
  (`docs/runbooks/relayer-operations.md`).
- Third-party fallback endpoints are config-listed per network (Polygon/Amoy
  only) and hot-swappable without code changes (FR-013 "replaceable via
  configuration").

## Compliance hooks

- Relayed intents: the gateway's signer-screening
  (`services/relay-gateway/src/policy/sanctions.js`) applies unchanged
  (signer = account address).
- UserOps via self-hosted bundler: refuse service to flagged account
  addresses (defense-in-depth mirror of 036; on-chain guards remain
  authoritative).
- Linked-wallet screening per clarification Q2 happens at the connector layer
  (see passkey-connector.md), before any on-chain link op is built.

## Honest lifecycle states (FR-017, constitution III)

`draft → ceremony-signed → submitted(route) → included(txHash) | failed(reason) | stalled(retry-guidance)`
— UI may never display `included` before on-chain inclusion; `stalled` after
the bounded detection window with truthful route status.

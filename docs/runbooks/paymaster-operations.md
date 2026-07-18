# Runbook: Sponsored Paymaster Operations (spec 050)

Operating the FairWins verifying paymaster that sponsors passkey UserOps. Companion to
`docs/runbooks/relayer-operations.md` (the gateway/engine) and `services/alto-bundler/README.md`
(the bundler). Design: `specs/050-sponsored-paymaster/`.

> **Status (2026-07-11): contract DEPLOYED + verified, not yet live for users.**
> `FairWinsVerifyingPaymaster` is deployed on **Polygon 137** at `0xe14554D14eB5DeC47f7824ebeeDa6C9f3A50d105`
> (source-verified on Polygonscan, deposit 5 POL) and on **Amoy 80002** at
> `0xA00A06ae44FA2bd40Ec10D9613c96afD779b6898` (deposit 0.1 POL). Both: `verifyingSigner` = HSM KMS
> `paymaster-signer-polygon` → `0x9Ec0d8fF320c3590b47Da5B06ae0253Ab1Ca22CD`; `owner` = deployer
> `0x5250…F6e1` (**transfer to a secure key before the deposit matters**). Recorded in
> `deployments/<net>-chain<id>-v2.json`. Security review clean; Slither clean (2 informational false
> positives); fork + live-Amoy sponsored-UserOp validated. **Not user-live until the `/v1/paymaster`
> gateway is deployed + wired** (`PAYMASTER_ADDRESS_137` / `PM_SIGNER_KMS_KEY` + gateway
> `cloudkms.signerVerifier` IAM + `VITE_SPONSOR_PAYMASTER_POLYGON`), so the deposit is idle until go-live.

## Components & keys

| Component | Where | Key/custody |
|---|---|---|
| `FairWinsVerifyingPaymaster` | on-chain (Polygon 137, Amoy 80002); EntryPoint v0.6 | — |
| `owner` (withdraw deposit/stake, `setVerifyingSigner`) | contract admin | **floppy keystore** (air-gapped) |
| `verifyingSigner` (authorizes each sponsorship) | relay-gateway | **KMS** hot key (like the relayer gas key) |
| Sponsorship endpoint | `services/relay-gateway` `POST /v1/paymaster` | reuses gateway policy + origin-lock |
| Bundler | `services/alto-bundler` | unchanged |

## Deploy (first time)

```bash
npx hardhat run scripts/deploy/deploy-verifying-paymaster.js --network <amoy|polygon>
#  → records deployments/<net>.json: verifyingPaymaster, verifyingSigner, entryPoint
npm run verify:<net>
npm run sync:frontend-contracts:<net>
```
Then wire the gateway (`PAYMASTER_ADDRESS_<id>`, `PM_SIGNER_KMS_KEY`, ceilings/quotas — see
`specs/050-sponsored-paymaster/contracts/gateway-paymaster-api.md`) and the SPA
(`VITE_SPONSOR_PAYMASTER_<net>`). **Boot check**: the gateway MUST refuse to start if the KMS signer
address ≠ the on-chain `verifyingSigner` (loud fail — constitution IV).

## Fund the deposit

The deposit **is** the sponsorship pool and the hard loss cap.

```bash
# fund via the contract's deposit() or EntryPoint.depositTo(paymaster) — see the deploy script's
# --deposit flag / the ops helper. Initial: research §8 (100 MATIC on Polygon).
```
- `entryPoint.balanceOf(paymaster)` = current pool.
- **Never** overfund beyond the accepted exposure cap — top up on the runway alert instead.
- UI path: the control plane's **Infrastructure → Services → Sponsored-Gas Paymaster** card
  shows the live deposit, verifying signer, and owner, and offers a top-up form
  (`deposit()` is permissionless) — see
  [operations-control-plane.md](operations-control-plane.md).

## Monitoring (add to the existing gas-wallet dashboards)

- **`paymasterDepositRunwayHrs`** on `GET /status` (operator-only) = `balanceOf(paymaster) /
  burnRate`. Alert when `< PM_RUNWAY_WARN_HRS` (default 48 h). Track it beside the alto-executor and
  relayer gas-wallet runways — a drained deposit silently fails every sponsored op (it then
  fails-open to self-submit, so users aren't stranded, but the "free" promise stops).
- Burn-rate spike = possible griefing → check per-account quota logs; consider tightening
  `PM_MAX_COST_WEI` / `PM_ACCOUNT_QUOTA_*` or the killswitch.

## Killswitch (instant halt)

Set the gateway `KILL_SWITCH` (same control as the relayer) → `/v1/paymaster` returns 503 and signs
nothing. Sponsorship stops within one request; clients fall back to self-submit. Release by clearing
it. Use for incident response or runaway burn.

## Rotate the sponsorship signer

1. Create a new KMS key; derive its Ethereum address.
2. `owner` (floppy) calls `setVerifyingSigner(newAddr)` on the paymaster — via CLI, or the
   control plane's paymaster card (the button is owner-gated; the tx reverts for anyone else).
3. Swap `PM_SIGNER_KMS_KEY` in the gateway; redeploy. Boot check re-validates the match.

In-flight approvals signed by the old key remain valid until their short TTL expires — no need to
drain first.

## Incident: signer key compromise

A stolen `verifyingSigner` can **spend the deposit on gas** (griefing) but **cannot withdraw** funds
(withdrawal is `owner`/floppy only). Response: (1) **killswitch on** (gateway stops signing);
(2) rotate the signer (above); (3) optionally `withdrawTo` the remaining deposit to a safe address
while rotating; (4) killswitch off. Loss is bounded by the deposit + the rate at which the attacker
can get ops included before the killswitch.

## Rollback

- **Instant, fail-open**: unset `VITE_SPONSOR_PAYMASTER_<net>` (SPA self-funds again) or trip the
  killswitch (gateway stops signing). No user is stranded — self-submit is always available.
- **Retire the paymaster**: `owner` `withdrawTo` drains the deposit; `unlockStake`/`withdrawStake`
  if staked; remove the gateway config and the deployments record.

## Cross-refs

- Gateway/engine ops: `docs/runbooks/relayer-operations.md`
- Bundler ops: `services/alto-bundler/README.md`
- Gasless rails overview: `docs/developer-guide/gasless-intents.md`
- Passkey account stack: `docs/developer-guide/passkey-accounts.md`

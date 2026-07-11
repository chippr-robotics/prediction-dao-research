# Contract: Frontend Config, Wiring & Honest Fee Disclosure

The passkey submission path already builds a viem paymaster client from a configured URL
(`frontend/src/lib/passkey/smartAccount.js#buildAccount`). This feature: (1) names the config
honestly, (2) points it at the gateway, (3) adds the **never-stranded fallback**, and (4) replaces
the **false** "sponsored" badge with truthful disclosure.

## Config (`frontend/src/config/networks.js`)

Rename the misleading `erc20PaymasterUrl` → **`sponsorPaymasterUrl`** (it is a sponsoring, not
fee-in-USDC, paymaster) and add the env var. `passkeyConfig(bundlerEnv, sponsorEnv)`:

```
VITE_SPONSOR_PAYMASTER_POLYGON = https://relay.fairwins.app/v1/paymaster   # (or paymaster.fairwins.app)
VITE_SPONSOR_PAYMASTER_AMOY    = https://relay.fairwins.app/v1/paymaster
```

Unset ⇒ `sponsorPaymasterUrl = null` ⇒ **no paymaster wired** ⇒ passkey UserOps self-fund (today's
behavior), and the UI discloses the native fee (fail-open, FR-020). `.env.example` documents both
and the deprecation of `VITE_ERC20_PAYMASTER_*`. Config flows through the sync artifacts, never
hardcoded (constitution V).

## Wiring (`smartAccount.js#buildAccount`)

Already constructs `createPaymasterClient({ transport: http(sponsorPaymasterUrl) })` and passes it
to `createBundlerClient({ paymaster })`. Confirm it (a) reads `sponsorPaymasterUrl`, (b) passes
`context: {}` (sponsoring needs none), and (c) returns a flag indicating whether a paymaster was
wired so `sendBatch` can implement fallback.

## Never-stranded fallback (`sendBatch.js`)

```
try:
  build bundler client WITH paymaster; sendUserOperation
catch (err is paymaster/HTTP/estimation failure, i.e. sponsorship unavailable):
  if account can self-fund (native ≥ estimated prefund):
     rebuild bundler client WITHOUT paymaster; sendUserOperation   # user pays native
     mark route = 'self-native'
  else:
     throw InsufficientFeeBalance(shortfall)                       # honest block, no false 'free'
```

Distinguish *sponsorship-unavailable* (fall back) from *user-op-reverted* (surface honestly — do
NOT silently retry a reverting op). Reuses the intent path's fallback philosophy
(`useIntentAction.js`).

## Honest fee disclosure (`useTransfer.js`, `TransferForm.jsx`, `PasskeyConfirm.jsx`)

Replace the unconditional badge:

| Before (false) | After (honest) |
|---|---|
| `TransferForm.jsx:138` — `⚡ Gasless · sponsored` for **any** passkey | `⚡ Sponsored — no network fee` **only** when a sponsorship approval was obtained; otherwise `You pay the {native} network fee` |
| `useTransfer.js:186` — `route = 'gasless' // sponsored regardless` | route reflects the **actual** outcome: `sponsored` \| `self-native` \| `self-short` |
| `TransferForm.jsx:242` — `Gasless — no network fee` when `gasless` | driven by the real `FeeDisclosure` state (data-model) |

Pre-flight: before the ceremony, query `pm_getPaymasterStubData` availability (or a lightweight
sponsorship pre-check) to set the disclosure; on `self-short`, show the exact shortfall
(`InsufficientFeeBalance`, the spec-041 T031 pattern). WCAG 2.1 AA (constitution V).

## Tests (Vitest)

`sponsorPaymasterUrl` set → paymaster wired, badge reads sponsored; endpoint 503/unreachable →
fallback to self-native, badge reads native fee; native shortfall → honest block with shortfall
amount; unset config → no paymaster, native disclosure (no regression); a reverting op is NOT
retried as self-submit.
